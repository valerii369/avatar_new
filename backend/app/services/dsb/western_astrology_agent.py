"""
western_astrology_agent.py — Layer 2: Orchestrator + 12 Sphere Worker Agents

Architecture: Orchestrator-Workers pattern
- Each sphere gets an isolated micro-context (via sphere_context.py)
- 12 specialist LLM agents run in parallel (asyncio.gather)
- Each agent receives ONLY its sphere's data + targeted RAG chunks
- No hallucinations: LLM cannot reference planets from other spheres
"""
import json
import logging
import asyncio
from app.models.uis import UISResponse, SphereResponse, UniversalInsight
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.db import get_supabase
from app.services.dsb.sphere_context import (
    extract_sphere_context,
    prepare_all_sphere_contexts,
    SPHERE_NAMES,
)
from app.data.astro_knowledge import get_sphere_knowledge

logger = logging.getLogger(__name__)
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# ─── RAG settings ─────────────────────────────────────────────────────────────

MIN_SCORE       = 0.65
TOP_K_PER_QUERY = 3     # per query; 2-3 queries per sphere → ~6-9 unique chunks
MAX_CHUNKS      = 8     # hard cap per sphere after dedup

# ─── System prompt template ───────────────────────────────────────────────────

SPECIALIST_PROMPT_TEMPLATE = """\
Ты — астрологический аналитик {sphere_num}-й сферы «{sphere_name}».

═══ ТВОЯ ЗАДАЧА ═══
Создать от {min_ins} до {max_ins} атомарных психологических инсайтов
строго для {sphere_num}-й сферы на основе предоставленных астрологических данных и книжного контекста.

═══ ИСТОЧНИКИ (в порядке приоритета) ═══
1. sphere_data — ЕДИНСТВЕННЫЙ источник астрологических позиций. Запрещено придумывать.
2. knowledge_base — справочник значений планет, знаков, аспектов, достоинств. Используй для глубины трактовок.
3. book_context — книжные цитаты и трактовки. Используй как подтверждение и обогащение.

═══ ЖЁСТКИЕ ОГРАНИЧЕНИЯ ═══
1. Анализируй ТОЛЬКО позиции из sphere_data. Не придумывай планеты и аспекты.
2. Каждый инсайт — одна конкретная смысловая единица.
3. Не повторяй одну и ту же астрологическую позицию в разных инсайтах.
4. Все тексты — строго на русском языке.

═══ ФОРМАТ ВЫВОДА ═══
Возвращай ТОЛЬКО валидный JSON:
{{"insights": [ ... ], "short_summary": "<емкая суть этой сферы для пользователя, до 200 символов, на русском>", "sphere_archetype": "<главная черта человека в этой сфере — 2-3 простых понятных слова>"}}
Никакого текста до или после JSON. Никаких markdown-блоков.

short_summary — это одна яркая фраза, раскрывающая суть данной сферы конкретного человека.
Например: «Твоя личность — лабиринт, где острый ум встречает глубокое чувство» или «Ресурсы растут через дисциплину и доверие к медленному накоплению».

sphere_archetype — простое, понятное описание главной черты или роли человека в данной сфере жизни, 2-3 слова на русском. Без мистики, поэтики и красивостей — как сказал бы обычный человек о себе или другом человеке.
Примеры: «Лидер по натуре», «Человек системы», «Душа компании», «Строитель отношений», «Искатель смысла», «Опора семьи», «Творческий одиночка», «Прирождённый учитель».

═══ СТРУКТУРА КАЖДОГО ИНСАЙТА ═══
{{
  "primary_sphere": {sphere_num},
  "influence_level": <"high" | "medium" | "low">,
  "weight": <число 0.0–1.0>,
  "position": "<точная астрологическая позиция из sphere_data, макс 140 символов>",
  "core_theme": "<заголовок карточки, одна фраза, макс 100 символов>",
  "description": "<нейтральное описание энергии этой позиции, 1-2 предложения>",
  "light_aspect": "<дар и потенциал, макс 400 символов>",
  "shadow_aspect": "<ловушка и риск, макс 400 символов>",
  "insight": "<глубокий психологический инсайт для пользователя, 2-3 предложения>",
  "gift": "<ключевой дар этой позиции, одно предложение>",
  "developmental_task": "<что нужно проработать, макс 180 символов>",
  "integration_key": "<конкретное практическое действие, макс 180 символов>",
  "triggers": ["<реальная жизненная ситуация 1>", "<реальная ситуация 2>"],
  "blind_spot": "<слепое пятно — что человек не видит в себе из-за этой позиции, макс 300 символов>",
  "energy_rhythm": "<как эта энергия проявляется во времени — нарастает, цикличная, взрывная и т.д., макс 200 символов>",
  "crisis_anchor": "<якорь в кризис — конкретное действие или состояние, которое помогает в момент срыва, макс 200 символов>",
  "source": "<автор — книга или null>"
}}

═══ FORMULA WEIGHT ═══
Используй поле position_weight из sphere_data как базовое значение инсайта.
Для аспектов: среднее position_weight двух планет + 0.10 если orb < 1.0°.
Нормализуй к 0.0–1.0, округли до 2 знаков.

═══ INFLUENCE_LEVEL ═══
"high"   → weight >= 0.75
"medium" → weight 0.45–0.74
"low"    → weight < 0.45
"""

# ─── Embedding ────────────────────────────────────────────────────────────────

async def _embed(text: str) -> list[float]:
    resp = await openai_client.embeddings.create(
        input=text,
        model="text-embedding-3-small",
    )
    return resp.data[0].embedding


# ─── Per-sphere RAG ───────────────────────────────────────────────────────────

def _build_sphere_queries(ctx: dict) -> list[str]:
    """Build targeted RAG queries from a sphere's isolated micro-context."""
    queries: list[str] = []
    sphere_num  = ctx["sphere"]
    sphere_name = ctx["sphere_name"]
    cusp_sign   = ctx.get("cusp_sign", "")

    # House-level
    queries.append(f"house {sphere_num} {sphere_name} {cusp_sign}")

    # Ruler
    ruler = ctx.get("ruler")
    if ruler:
        queries.append(f"{ruler['name']} in {ruler['sign']} house {ruler['house']}")
        if ruler.get("dignity_score", 0) >= 4:
            queries.append(f"{ruler['name']} domicile exaltation {ruler['sign']}")
        elif ruler.get("dignity_score", 0) <= -4:
            queries.append(f"{ruler['name']} detriment fall {ruler['sign']}")
        if ruler.get("retrograde"):
            queries.append(f"{ruler['name']} retrograde psychology")

    # Co-ruler
    co = ctx.get("co_ruler")
    if co:
        queries.append(f"{co['name']} {co['sign']} house {co['house']} co-ruler")

    # Planets in house
    for p in ctx.get("planets_in_house", [])[:3]:
        queries.append(f"{p['name']} in house {sphere_num} {p['sign']}")

    # Top aspects to ruler
    for asp in ctx.get("aspects_to_ruler", [])[:2]:
        queries.append(f"{asp['planet_a']} {asp['type']} {asp['planet_b']}")

    return queries[:8]


async def _retrieve_one(query: str, supabase) -> list[dict]:
    try:
        vec  = await _embed(query)
        resp = supabase.rpc("match_book_chunks", {
            "query_embedding":  vec,
            "match_threshold":  MIN_SCORE,
            "match_count":      TOP_K_PER_QUERY,
            "p_category":       "western_astrology",
        }).execute()
        return resp.data or []
    except Exception as e:
        logger.warning(f"RAG query failed '{query}': {e}")
        return []


async def _retrieve_sphere_rag(ctx: dict) -> list[dict]:
    """Retrieve deduplicated RAG chunks targeted for one sphere."""
    if settings.SUPABASE_KEY == "mock-key":
        return []
    try:
        supabase = get_supabase()
    except Exception:
        return []

    queries = _build_sphere_queries(ctx)
    raw     = await asyncio.gather(
        *[_retrieve_one(q, supabase) for q in queries],
        return_exceptions=True,
    )

    seen, scored = set(), []
    for hits in raw:
        if isinstance(hits, Exception):
            continue
        for hit in hits:
            hid = hit.get("id")
            if hid and hid not in seen:
                seen.add(hid)
                scored.append({
                    "text":   hit.get("content", ""),
                    "source": hit.get("source", ""),
                    "score":  hit.get("similarity", 0.0),
                })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:MAX_CHUNKS]


# ─── Single-sphere worker ─────────────────────────────────────────────────────

async def generate_sphere_insights(
    chart: dict,
    sphere_id: int,
    attempt: int = 0,
    user_id: str = "",
) -> tuple[list[UniversalInsight], str]:
    """
    Worker agent for one sphere.
    Extracts isolated context → targeted RAG → specialist LLM call.
    Returns list of UniversalInsight for sphere_id.
    """
    ctx = extract_sphere_context(chart, sphere_id)
    rag = await _retrieve_sphere_rag(ctx)

    system_prompt = SPECIALIST_PROMPT_TEMPLATE.format(
        sphere_num  = sphere_id,
        sphere_name = SPHERE_NAMES[sphere_id],
        min_ins     = ctx["_target_min"],
        max_ins     = ctx["_target_max"],
    )

    # Strip internal metadata keys before sending to LLM
    sphere_data = {k: v for k, v in ctx.items() if not k.startswith("_")}

    # Inject hardcoded KB facts for this sphere
    knowledge_base = get_sphere_knowledge(ctx)

    user_payload = json.dumps({
        "sphere_data":    sphere_data,
        "knowledge_base": knowledge_base,
        "book_context":   [{"text": c["text"], "source": c["source"]} for c in rag],
    }, ensure_ascii=False)

    try:
        response = await openai_client.chat.completions.create(
            model=settings.MODEL_HEAVY,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_payload},
            ],
            max_completion_tokens=12000,
        )
        raw  = response.choices[0].message.content
        data = json.loads(raw)
        if isinstance(data, list):
            data = {"insights": data}

        # Extract short_summary and sphere_archetype before model validation
        short_summary: str = data.pop("short_summary", "") or ""
        sphere_archetype: str = data.pop("sphere_archetype", "") or ""

        insights = SphereResponse(**data).insights

        # Enforce correct sphere_id on every insight
        for ins in insights:
            ins.primary_sphere = sphere_id

        logger.info(f"Sphere {sphere_id}: {len(insights)} insights, summary={bool(short_summary)}, archetype={bool(sphere_archetype)}")
        return insights, short_summary, sphere_archetype

    except Exception as e:
        logger.error(f"Sphere {sphere_id} failed (attempt {attempt}): {e}")
        if attempt < 2:
            await asyncio.sleep(1)
            return await generate_sphere_insights(chart, sphere_id, attempt + 1, user_id)
        return [], "", ""


# ─── Orchestrator ─────────────────────────────────────────────────────────────

async def generate_insights(chart: dict, user_id: str = "") -> tuple[UISResponse, dict[int, str], dict[int, str]]:
    """
    Orchestrator: launches all 12 sphere workers simultaneously.
    Used for full-chart generation (initial build or full rebuild).

    Returns (UISResponse, sphere_summaries, sphere_archetypes).
    """
    logger.info("Orchestrator: launching 12 sphere agents in parallel")

    tasks = [
        generate_sphere_insights(chart, sphere_id, user_id=user_id)
        for sphere_id in range(1, 13)
    ]
    results: list = await asyncio.gather(*tasks, return_exceptions=True)

    all_insights: list[UniversalInsight] = []
    sphere_summaries: dict[int, str] = {}
    sphere_archetypes: dict[int, str] = {}

    for sphere_id, result in enumerate(results, start=1):
        if isinstance(result, Exception):
            logger.error(f"Sphere {sphere_id} raised: {result}")
            continue
        insights, short_summary, sphere_archetype = result
        all_insights.extend(insights)
        if short_summary:
            sphere_summaries[sphere_id] = short_summary
        if sphere_archetype:
            sphere_archetypes[sphere_id] = sphere_archetype

    logger.info(f"Orchestrator: total assembled = {len(all_insights)} insights, summaries = {len(sphere_summaries)}, archetypes = {len(sphere_archetypes)}")
    return UISResponse(insights=all_insights), sphere_summaries, sphere_archetypes
