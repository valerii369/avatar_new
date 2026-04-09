from __future__ import annotations

import asyncio
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import faiss
import numpy as np
from openai import AsyncOpenAI

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings

logger = logging.getLogger(__name__)

FAISS_DIR = Path(__file__).resolve().parents[3] / "faiss_store"
FAISS_INDEX_PATH = FAISS_DIR / "book_chunks.index.faiss"
FAISS_META_PATH = FAISS_DIR / "book_chunks.meta.jsonl"
RAG_PREVIEW_CHART_PATH = ROOT / "tmp" / "rag_preview_chart.json"
SAMPLE_CHART: dict[str, Any] = {
    "planets": {
        "sun": {"sign": "Aries", "house": 10, "degree_in_sign": 14.2, "retrograde": False, "dignity_score": 1, "position_weight": 0.88},
        "moon": {"sign": "Cancer", "house": 1, "degree_in_sign": 7.4, "retrograde": False, "dignity_score": 2, "position_weight": 0.84},
        "mercury": {"sign": "Pisces", "house": 9, "degree_in_sign": 22.1, "retrograde": False, "dignity_score": -1, "position_weight": 0.69},
        "venus": {"sign": "Taurus", "house": 11, "degree_in_sign": 2.8, "retrograde": False, "dignity_score": 2, "position_weight": 0.74},
        "mars": {"sign": "Capricorn", "house": 7, "degree_in_sign": 18.7, "retrograde": False, "dignity_score": 2, "position_weight": 0.79},
        "jupiter": {"sign": "Leo", "house": 2, "degree_in_sign": 10.5, "retrograde": False, "dignity_score": 1, "position_weight": 0.66},
        "saturn": {"sign": "Aquarius", "house": 7, "degree_in_sign": 26.2, "retrograde": False, "dignity_score": 2, "position_weight": 0.77},
        "uranus": {"sign": "Aquarius", "house": 8, "degree_in_sign": 9.3, "retrograde": False, "dignity_score": 1, "position_weight": 0.62},
        "neptune": {"sign": "Aquarius", "house": 8, "degree_in_sign": 1.1, "retrograde": False, "dignity_score": 0, "position_weight": 0.60},
        "pluto": {"sign": "Sagittarius", "house": 6, "degree_in_sign": 12.9, "retrograde": False, "dignity_score": 0, "position_weight": 0.64},
        "asc": {"sign": "Cancer", "house": 1, "degree_in_sign": 4.3, "retrograde": False, "dignity_score": 0, "position_weight": 0.90},
        "mc": {"sign": "Aries", "house": 10, "degree_in_sign": 2.1, "retrograde": False, "dignity_score": 0, "position_weight": 0.88},
        "north_node": {"sign": "Gemini", "house": 12, "degree_in_sign": 19.5, "retrograde": True, "dignity_score": 0, "position_weight": 0.70},
        "south_node": {"sign": "Sagittarius", "house": 6, "degree_in_sign": 19.5, "retrograde": True, "dignity_score": 0, "position_weight": 0.70},
        "chiron": {"sign": "Capricorn", "house": 7, "degree_in_sign": 28.0, "retrograde": False, "dignity_score": 0, "position_weight": 0.63},
        "lilith": {"sign": "Scorpio", "house": 5, "degree_in_sign": 3.6, "retrograde": False, "dignity_score": 0, "position_weight": 0.58},
        "part_of_fortune": {"sign": "Virgo", "house": 3, "degree_in_sign": 8.2, "retrograde": False, "dignity_score": 0, "position_weight": 0.57},
    },
    "aspects": [
        {"planet_a": "sun", "type": "square", "planet_b": "moon", "orb": 1.3, "influence_weight": 0.82},
        {"planet_a": "venus", "type": "trine", "planet_b": "mars", "orb": 2.1, "influence_weight": 0.76},
        {"planet_a": "mercury", "type": "conjunction", "planet_b": "north_node", "orb": 1.0, "influence_weight": 0.71},
        {"planet_a": "saturn", "type": "opposition", "planet_b": "asc", "orb": 2.8, "influence_weight": 0.73},
    ],
    "aspect_patterns": ["t_square"],
    "stelliums": [{"sign": "Aquarius", "house": 8}],
    "critical_degrees": ["moon", "chiron"],
    "balance": {
        "dominant_element": "air",
        "dominant_modality": "cardinal",
        "hemispheres": {"above": 7, "below": 5, "east": 4, "west": 8},
    },
    "mutual_receptions": [{"planet_a": "mars", "planet_b": "saturn"}],
}

_openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
_index_cache: faiss.Index | None = None
_meta_cache: list[dict[str, Any]] | None = None
EMBED_CONCURRENCY_LIMIT = 8
_embed_semaphore = asyncio.Semaphore(EMBED_CONCURRENCY_LIMIT)
EMBED_BATCH_SIZE = 32


@dataclass
class FaissChunk:
    content: str
    source: str
    category: str
    score: float
    faiss_id: int
    book_chunk_id: str | None = None


def _load_index() -> faiss.Index | None:
    global _index_cache
    if _index_cache is not None:
        return _index_cache

    if not FAISS_INDEX_PATH.exists():
        logger.warning(f"FAISS index not found: {FAISS_INDEX_PATH}")
        return None

    _index_cache = faiss.read_index(str(FAISS_INDEX_PATH))
    return _index_cache


def _load_meta() -> list[dict[str, Any]]:
    global _meta_cache
    if _meta_cache is not None:
        return _meta_cache

    if not FAISS_META_PATH.exists():
        logger.warning(f"FAISS metadata file not found: {FAISS_META_PATH}")
        _meta_cache = []
        return _meta_cache

    rows: list[dict[str, Any]] = []
    with FAISS_META_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    _meta_cache = rows
    return _meta_cache


async def _embed_query(query: str) -> np.ndarray:
    async with _embed_semaphore:
        resp = await _openai.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
    vec = np.array(resp.data[0].embedding, dtype="float32").reshape(1, -1)
    # cosine similarity for IndexFlatIP requires normalized vectors
    faiss.normalize_L2(vec)
    return vec


def _batched(items: list[str], size: int) -> list[list[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


async def _embed_queries_batched(queries: list[str], batch_size: int = EMBED_BATCH_SIZE) -> np.ndarray:
    if not queries:
        return np.zeros((0, 0), dtype="float32")

    out_parts: list[np.ndarray] = []
    for group in _batched(queries, batch_size):
        async with _embed_semaphore:
            resp = await _openai.embeddings.create(
                model="text-embedding-3-small",
                input=group,
            )
        arr = np.array([d.embedding for d in resp.data], dtype="float32")
        faiss.normalize_L2(arr)
        out_parts.append(arr)
    return np.vstack(out_parts)


async def search_faiss_chunks(
    query: str,
    top_k: int = 20,
    category: str | None = "western_astrology",
    min_score: float = 0.0,
) -> list[FaissChunk]:
    """
    Search local FAISS index by cosine similarity.

    Returns up to top_k chunks with highest similarity score.
    """
    query = (query or "").strip()
    if not query:
        return []

    index = _load_index()
    if index is None:
        return []

    meta = _load_meta()
    if not meta:
        return []

    vec = await _embed_query(query)
    distances, indices = index.search(vec, top_k)

    out: list[FaissChunk] = []
    for score, idx in zip(distances[0].tolist(), indices[0].tolist()):
        if idx < 0:
            continue
        if idx >= len(meta):
            continue
        row = meta[idx]
        row_category = row.get("category", "")
        if category and row_category != category:
            continue
        if score < min_score:
            continue
        out.append(
            FaissChunk(
                content=row.get("content", ""),
                source=row.get("source", ""),
                category=row_category,
                score=float(score),
                faiss_id=int(row.get("faiss_id", idx)),
                book_chunk_id=row.get("book_chunk_id"),
            )
        )

    return out


async def search_faiss_chunks_batch(
    queries: list[str],
    top_k: int = 20,
    category: str | None = "western_astrology",
    min_score: float = 0.0,
    embed_batch_size: int = EMBED_BATCH_SIZE,
) -> list[list[FaissChunk]]:
    """
    Batch version of FAISS search:
    - embeds queries in batches (default 32)
    - runs one FAISS search call for all query vectors
    - returns results aligned to input order
    """
    if not queries:
        return []

    index = _load_index()
    if index is None:
        return [[] for _ in queries]

    meta = _load_meta()
    if not meta:
        return [[] for _ in queries]

    cleaned_with_idx = [(i, (q or "").strip()) for i, q in enumerate(queries)]
    valid = [(i, q) for i, q in cleaned_with_idx if q]
    out_all: list[list[FaissChunk]] = [[] for _ in queries]
    if not valid:
        return out_all

    valid_idxs = [i for i, _ in valid]
    valid_queries = [q for _, q in valid]

    vecs = await _embed_queries_batched(valid_queries, batch_size=embed_batch_size)
    distances, indices = index.search(vecs, top_k)

    for row_idx, original_idx in enumerate(valid_idxs):
        hits: list[FaissChunk] = []
        for score, idx in zip(distances[row_idx].tolist(), indices[row_idx].tolist()):
            if idx < 0 or idx >= len(meta):
                continue
            row = meta[idx]
            row_category = row.get("category", "")
            if category and row_category != category:
                continue
            if score < min_score:
                continue
            hits.append(
                FaissChunk(
                    content=row.get("content", ""),
                    source=row.get("source", ""),
                    category=row_category,
                    score=float(score),
                    faiss_id=int(row.get("faiss_id", idx)),
                    book_chunk_id=row.get("book_chunk_id"),
                )
            )
        out_all[original_idx] = hits

    return out_all


if __name__ == "__main__":
    import asyncio

    async def _demo() -> None:
        if RAG_PREVIEW_CHART_PATH.exists():
            try:
                chart = json.loads(RAG_PREVIEW_CHART_PATH.read_text(encoding="utf-8"))
                print(f"[rag-preview] using chart from file: {RAG_PREVIEW_CHART_PATH}")
            except Exception as e:
                print(f"[error] failed to read chart json '{RAG_PREVIEW_CHART_PATH}': {e}")
                return
        else:
            chart = SAMPLE_CHART
            print(f"[rag-preview] chart file not found, using SAMPLE_CHART from code")

        # Import here to avoid circular import at module load time:
        # western_astrology_agent -> faiss_retriever, so reverse import is only safe in __main__.
        from app.services.dsb.western_astrology_agent import build_queries

        queries = build_queries(chart)
        if not queries:
            print("[rag-preview] no queries generated from chart")
            return

        print("[rag-preview] queries:")
        for i, q in enumerate(queries, start=1):
            print(f"  {i:02d}. {q}")

        top_k_per_query = 20
        min_score = 0.65
        print(f"[rag-preview] finding chunks: top_k_per_query={top_k_per_query} min_score={min_score}")

        all_hits: list[dict[str, Any]] = []
        for q in queries:
            hits = await search_faiss_chunks(
                query=q,
                top_k=top_k_per_query,
                category="western_astrology",
                min_score=min_score,
            )
            for h in hits:
                all_hits.append(
                    {
                        "faiss_id": h.faiss_id,
                        "source": h.source or "unknown",
                        "score": float(h.score),
                        "query": q,
                        "content": h.content,
                    }
                )

        if not all_hits:
            print("[rag-preview] no hits found")
            return

        # Deduplicate by chunk id and keep the best score.
        best_chunk_by_id: dict[int, dict[str, Any]] = {}
        for hit in all_hits:
            cid = int(hit["faiss_id"])
            existing = best_chunk_by_id.get(cid)
            if not existing or hit["score"] > existing["score"]:
                best_chunk_by_id[cid] = hit

        top_chunks = sorted(best_chunk_by_id.values(), key=lambda x: float(x["score"]), reverse=True)[:20]
        print(f"[rag-preview] raw_hits={len(all_hits)} unique_chunks={len(best_chunk_by_id)}")
        print("[rag-preview] top 20 chunks by score:")
        for i, hit in enumerate(top_chunks, start=1):
            print(
                f"  {i:02d}. score={float(hit['score']):.4f} source={hit['source']} "
                f"faiss_id={hit['faiss_id']} query={hit['query']}"
            )
            print(hit["content"])
            print()

    asyncio.run(_demo())
