"""
Ingest all .txt files from backend/books into Supabase book_chunks.

No CLI flags. Just run:
  cd backend
  venv/bin/python scripts/ingest_book_txt.py
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import sys
from uuid import uuid4
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from openai import AsyncOpenAI
import numpy as np
import faiss

# Allow running as script from backend/
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.core.db import get_supabase  # noqa: E402

INPUT_DIR_CANDIDATES = [
    ROOT / "books",
    ROOT / "books_txt",
    ROOT / "books.txt",
]
CATEGORY = "western_astrology"
CHUNK_SIZE = 1800
CHUNK_OVERLAP = 250
MIN_CHUNK_SIZE = 120
EMBED_BATCH_SIZE = 32
INSERT_BATCH_SIZE = 100
FAISS_DIR = ROOT / "faiss_store"
FAISS_INDEX_PATH = FAISS_DIR / "book_chunks.index.faiss"
FAISS_META_PATH = FAISS_DIR / "book_chunks.meta.jsonl"
INGEST_TEXT_FRACTION = 1 # 0.25 = ingest only first quarter of each book for testing

SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


@dataclass
class ChunkConfig:
    chunk_size: int = 1800
    chunk_overlap: int = 250
    min_chunk_size: int = 120


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Compact repeated empty lines
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text.strip()


def clean_book_text(text: str) -> str:
    """
    Clean common PDF/OCR artifacts before chunking.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\f", "\n")

    # Join words split by line-wrap hyphenation: "trans-\nit" -> "transit"
    text = re.sub(r"([A-Za-z])-\n([A-Za-z])", r"\1\2", text)
    # Join simple wrapped lines inside paragraph
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)

    # Normalize spaces/tabs and keep paragraph breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Remove very short noisy lines and page markers like isolated numbers
    cleaned_lines: list[str] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            cleaned_lines.append("")
            continue
        if re.fullmatch(r"\d{1,4}", line):
            continue
        if len(line) <= 2:
            continue
        cleaned_lines.append(line)

    text = "\n".join(cleaned_lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def slice_text_for_ingest(text: str, fraction: float) -> str:
    if fraction >= 1.0:
        return text
    if fraction <= 0:
        return ""
    cutoff = max(1, int(len(text) * fraction))
    return text[:cutoff].strip()


def split_recursive(text: str, chunk_size: int, separators: list[str]) -> list[str]:
    if len(text) <= chunk_size:
        return [text]
    if not separators:
        return [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]

    sep = separators[0]
    if sep == "":
        return [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]

    parts = text.split(sep)
    if len(parts) == 1:
        return split_recursive(text, chunk_size, separators[1:])

    chunks: list[str] = []
    buf = ""
    for part in parts:
        candidate = f"{buf}{sep}{part}" if buf else part
        if len(candidate) <= chunk_size:
            buf = candidate
            continue

        if buf:
            chunks.append(buf)
        if len(part) > chunk_size:
            chunks.extend(split_recursive(part, chunk_size, separators[1:]))
            buf = ""
        else:
            buf = part

    if buf:
        chunks.append(buf)
    return chunks


def add_overlap(chunks: list[str], overlap: int) -> list[str]:
    if overlap <= 0 or len(chunks) < 2:
        return chunks

    out: list[str] = []
    prev = ""
    for ch in chunks:
        ch = ch.strip()
        if not ch:
            continue
        if prev:
            prefix = prev[-overlap:]
            combined = f"{prefix}\n{ch}"
            out.append(combined)
        else:
            out.append(ch)
        prev = ch
    return out


def make_chunks(text: str, cfg: ChunkConfig) -> list[str]:
    normalized = normalize_text(text)
    base = split_recursive(normalized, cfg.chunk_size, SEPARATORS)
    with_overlap = add_overlap(base, cfg.chunk_overlap)
    return [c.strip() for c in with_overlap if len(c.strip()) >= cfg.min_chunk_size]


def batched(items: list[str], size: int) -> Iterable[list[str]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


async def embed_chunks(client: AsyncOpenAI, chunks: list[str], batch_size: int) -> list[list[float]]:
    vectors: list[list[float]] = []
    total_batches = math.ceil(len(chunks) / batch_size) if chunks else 0

    for idx, group in enumerate(batched(chunks, batch_size), start=1):
        resp = await client.embeddings.create(
            model="text-embedding-3-small",
            input=group,
        )
        vectors.extend([d.embedding for d in resp.data])
        print(f"[embed] batch {idx}/{total_batches}: {len(group)} chunks")

    return vectors


def derive_source_from_file(txt_path: Path) -> str:
    # Use file stem as a stable source label (e.g. "liz_greene_saturn")
    return txt_path.stem


def source_exists(source: str, category: str) -> bool:
    supabase = get_supabase()
    resp = (
        supabase.table("book_chunks")
        .select("id")
        .eq("source", source)
        .eq("category", category)
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def insert_chunks(
    source: str,
    category: str,
    chunks: list[str],
    vectors: list[list[float]],
    insert_batch_size: int,
    replace_source: bool,
) -> list[str]:
    supabase = get_supabase()
    book_chunk_ids = [str(uuid4()) for _ in chunks]

    if replace_source:
        supabase.table("book_chunks") \
            .delete() \
            .eq("source", source) \
            .eq("category", category) \
            .execute()
        print(f"[db] deleted old rows for source='{source}', category='{category}'")

    total_batches = math.ceil(len(chunks) / insert_batch_size) if chunks else 0
    for idx, start in enumerate(range(0, len(chunks), insert_batch_size), start=1):
        end = start + insert_batch_size
        rows = [
            {
                "id": book_chunk_ids[i],
                "content": chunks[i],
                "source": source,
                "category": category,
                "embedding": vectors[i],
            }
            for i in range(start, min(end, len(chunks)))
        ]
        supabase.table("book_chunks").insert(rows).execute()
        print(f"[db] insert batch {idx}/{total_batches}: {len(rows)} rows")
    return book_chunk_ids


def _normalize_vectors(vectors: list[list[float]]) -> np.ndarray:
    arr = np.array(vectors, dtype="float32")
    # Cosine similarity via inner product requires L2 normalization.
    faiss.normalize_L2(arr)
    return arr


def load_or_create_faiss_index(vector_dim: int) -> faiss.Index:
    FAISS_DIR.mkdir(parents=True, exist_ok=True)
    if FAISS_INDEX_PATH.exists():
        index = faiss.read_index(str(FAISS_INDEX_PATH))
        if index.d != vector_dim:
            raise ValueError(f"FAISS dim mismatch: existing={index.d}, new={vector_dim}")
        return index
    return faiss.IndexFlatIP(vector_dim)


def append_faiss_metadata(
    start_id: int,
    source: str,
    category: str,
    chunks: list[str],
    book_chunk_ids: list[str],
) -> None:
    with FAISS_META_PATH.open("a", encoding="utf-8") as f:
        for i, chunk in enumerate(chunks):
            row = {
                "faiss_id": start_id + i,
                "book_chunk_id": book_chunk_ids[i] if i < len(book_chunk_ids) else None,
                "source": source,
                "category": category,
                "content": chunk,
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def add_to_faiss(
    index: faiss.Index,
    source: str,
    category: str,
    chunks: list[str],
    vectors: list[list[float]],
    book_chunk_ids: list[str],
) -> int:
    start_id = index.ntotal
    arr = _normalize_vectors(vectors)
    index.add(arr)
    faiss.write_index(index, str(FAISS_INDEX_PATH))
    append_faiss_metadata(
        start_id=start_id,
        source=source,
        category=category,
        chunks=chunks,
        book_chunk_ids=book_chunk_ids,
    )
    return len(chunks)


async def main() -> None:
    if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == "mock-key":
        raise ValueError("OPENAI_API_KEY is not configured")
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise ValueError("Supabase settings are not configured")

    input_dir = next((p for p in INPUT_DIR_CANDIDATES if p.exists()), None)
    if not input_dir:
        paths = ", ".join(str(p) for p in INPUT_DIR_CANDIDATES)
        raise FileNotFoundError(f"Input directory not found. Checked: {paths}")

    txt_files = sorted(input_dir.rglob("*.txt"))
    if not txt_files:
        print(f"[info] no .txt files in {input_dir}")
        return

    print(f"[info] ingest dir: {input_dir}")
    print(f"[info] discovered files: {len(txt_files)}")

    cfg = ChunkConfig(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        min_chunk_size=MIN_CHUNK_SIZE,
    )

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    inserted_files = 0
    skipped_files = 0
    faiss_index: faiss.Index | None = None

    for txt_path in txt_files:
        source = derive_source_from_file(txt_path)
        if source_exists(source, CATEGORY):
            skipped_files += 1
            print(f"[skip] source='{source}' already exists in book_chunks")
            continue

        raw = txt_path.read_text(encoding="utf-8", errors="ignore")
        cleaned = clean_book_text(raw)
        sliced = slice_text_for_ingest(cleaned, INGEST_TEXT_FRACTION)
        chunks = make_chunks(sliced, cfg)
        if not chunks:
            skipped_files += 1
            print(f"[skip] file={txt_path} produced 0 chunks")
            continue

        print(f"[file] {txt_path}")
        print(
            f"[file] source={source}, category={CATEGORY}, chunks={len(chunks)}, "
            f"chars_raw={len(raw)}, chars_clean={len(cleaned)}, "
            f"chars_used={len(sliced)}, fraction={INGEST_TEXT_FRACTION}"
        )

        vectors = await embed_chunks(client, chunks, EMBED_BATCH_SIZE)
        if len(vectors) != len(chunks):
            raise RuntimeError(f"Embeddings mismatch: chunks={len(chunks)} vectors={len(vectors)}")

        book_chunk_ids = insert_chunks(
            source=source,
            category=CATEGORY,
            chunks=chunks,
            vectors=vectors,
            insert_batch_size=INSERT_BATCH_SIZE,
            replace_source=False,
        )
        if faiss_index is None:
            faiss_index = load_or_create_faiss_index(vector_dim=len(vectors[0]))
        added = add_to_faiss(
            index=faiss_index,
            source=source,
            category=CATEGORY,
            chunks=chunks,
            vectors=vectors,
            book_chunk_ids=book_chunk_ids,
        )
        inserted_files += 1
        print(f"[done] source='{source}' inserted: {len(chunks)} chunks, faiss_added={added}")

    print(f"[summary] inserted_files={inserted_files}, skipped_files={skipped_files}, total_files={len(txt_files)}")
    print(f"[summary] faiss_index={FAISS_INDEX_PATH}")
    print(f"[summary] faiss_meta={FAISS_META_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
