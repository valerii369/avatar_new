"""
AVATAR — Sphere-On-Demand Agent
Computes 4–9 UIS insights for ONE sphere using targeted RAG + GPT-4o-mini.
~10x cheaper than computing all 12 at once, higher quality per sphere.
"""
import json
import logging
import asyncio
from openai import AsyncOpenAI
from app.models.uis import UniversalInsight
from app.core.config import settings
from app.core.db import get_supabase

logger = logging.getLogger(__name__)
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# Planets and RAG keywords relevant to each sphere
SPHERE_CONTEXT: dict[int, dict] = {
    1:  {"house": 1,  "planets": ["asc", "sun", "mars"],
         "keywords": ["ascendant rising sign first house", "self image identity personality"]},
    2:  {"house": 2,  "planets": ["venus", "jupiter"],
         "keywords": ["second house money values", "possessions security resources"]},
    3:  {"house": 3,  "planets": ["mercury"],
         "keywords": ["third house mercury communication", "mind thinking siblings"]},
    4:  {"house": 4,  "planets": ["moon"],
         "keywords": ["fourth house moon IC home", "family roots emotional foundation"]},
    5:  {"house": 5,  "planets": ["sun", "venus"],
         "keywords": ["fifth house creativity self-expression", "joy children romance play"]},
    6:  {"house": 6,  "planets": ["mercury", "chiron"],
         "keywords": ["sixth house health work service", "body wellness virgo habits"]},
    7:  {"house": 7,  "planets": ["venus", "mars"],
         "keywords": ["seventh house relationships partnership", "descendant marriage mirror"]},
    8:  {"house": 8,  "planets": ["pluto", "mars"],
         "keywords": ["eighth house transformation power", "sexuality death rebirth scorpio"]},
    9:  {"house": 9,  "planets": ["jupiter", "north_node"],
         "keywords": ["ninth house philosophy spirituality", "expansion beliefs meaning sagittarius"]},
    10: {"house": 10, "planets": ["saturn", "sun"],
         "keywords": ["tenth house career MC vocation", "status reputation goals midheaven"]},
    11: {"house": 11, "planets": ["uranus", "saturn"],
         "keywords": ["eleventh house friends groups community", "future vision aquarius"]},
    12: {"house": 12, "planets": ["neptune", "pluto", "chiron", "lilith"],
         "keywords": ["twelfth house shadow unconscious", "isolation spirituality karma pisces"]},
}

SPHERE_NAMES: dict[int, str] = {
    1: "Личность", 2: "Ресурсы", 3: "Мышление", 4: "Семья",
    5: "Творчество", 6: "Здоровье", 7: "Отношения", 8: "Трансформация",
    9: "Мировоззрение", 10: "Карьера", 11: "Социум", 12: "Тень",
}

INSIGHT_COUNTS: dict[int, str] = {
    1: "7-9", 2: "4-6", 3: "4-6", 4: "4-6", 5: "4-6",
    6: "4-5", 7: "6-8", 8: "5-7", 9: "4-6", 10: "5-7", 11: "4-6", 12: "6-8",
}


# ─── Query builder ────────────────────────────────────────────────────────────

def build_sphere_queries(sphere: int, chart: dict) -> list[str]:
    """Build 4-7 targeted RAG queries for a specific sphere."""
    ctx = SPHERE_CONTEXT[sphere]
    queries: list[str] = []
    planets = chart.get("planets", {})

    # Planets physically in this house
    for name, data in planets.items():
        if data.get("house") == ctx["house"]:
            queries.append(f"{name} in {data['sign']} in {ctx['house']} house")

    # Key planets for this sphere (regardless of house)
    for pname in ctx["planets"]:
        p = planets.get(pname)
        if p:
            q = f"{pname} in {p['sign']} in {p['house']} house"
            if q not in queries:
                queries.append(q)

    # Top aspects involving sphere's key planets
    key_set = set(ctx["planets"])
    for asp in sorted(chart.get("aspects", []), key=lambda a: a.get("influence_weight", 0), reverse=True):
        if asp["planet_a"] in key_set or asp["planet_b"] in key_set:
            q = f"{asp['planet_a']} {asp['type']} {asp['planet_b']}"
            if q not in queries:
                queries.append(q)
        if len(queries) >= 5:
            break

    # Generic sphere keywords
    for kw in ctx["keywords"]:
        queries.append(kw)

    # Deduplicate and cap
    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)
    return unique[:7]


# ─── System prompt ────────────────────────────────────────────────────────────

def build_sphere_system_prompt(sphere: int) -> str:
    name = SPHERE_NAMES[sphere]
    count = INSIGHT_COUNTS[sphere]
    return f"""Ты астрологический интерпретатор AVATAR.
Создай {count} атомарных психологических инсайтов ТОЛЬКО для сферы {sphere} ({name}).

═══ ФОРМАТ ВЫВОДА ═══
Возвращай ТОЛЬКО валидный JSON:
{{"insights": [ ... ]}}

═══ СТРУКТУРА КАЖДОГО ИНСАЙТА ═══
{{
  "primary_sphere": {sphere},
  "influence_level": <"high" | "medium" | "low">,
  "weight": <0.0–1.0>,
  "position": "<точная астрологическая позиция>",
  "core_theme": "<заголовок карточки, одна фраза>",
  "energy_description": "<нейтральное описание энергии>",
  "light_aspect": "<дар и потенциал>",
  "shadow_aspect": "<ловушка и риск>",
  "developmental_task": "<что нужно проработать>",
  "integration_key": "<конкретное действие>",
  "triggers": ["<ситуация 1>", "<ситуация 2>", ...],
  "source": "<автор — книга или null>"
}}

═══ ПРАВИЛА ═══
1. Все инсайты строго про сферу {sphere} ({name}).
2. Опирайся на book_context — он приоритет над общими знаниями.
3. Не повторяй одну астрологическую позицию дважды.
4. light_aspect и shadow_aspect — конкретно, не абстрактно.
5. triggers — реальные жизненные ситуации, 2–5 штук.

═══ ФОРМУЛА WEIGHT ═══
base=0.5 +0.20 личная планета +0.15 угловой дом +0.10 точный аспект
+0.10 обитель/экзальтация +0.10 изгнание/падение -0.05 ретро → clip(0,1)
high≥0.75  medium=0.45–0.74  low<0.45
"""


# ─── RAG retrieval ────────────────────────────────────────────────────────────

async def _embed(text: str) -> list[float]:
    resp = await openai_client.embeddings.create(
        input=text,
        model="text-embedding-3-small",
    )
    return resp.data[0].embedding


async def _retrieve_one(query: str, supabase, min_score: float, limit: int) -> list[dict]:
    vector = await _embed(query)
    try:
        r = supabase.rpc("match_book_chunks", {
            "query_embedding": vector,
            "match_threshold": min_score,
            "match_count": limit,
            "p_category": "western_astrology",
        }).execute()
        return r.data if r.data else []
    except Exception as e:
        logger.error(f"RAG query failed for '{query}': {e}")
        return []


async def _retrieve_sphere_context(queries: list[str]) -> list[dict]:
    if settings.SUPABASE_KEY == "mock-key":
        return []
    supabase = get_supabase()
    raw = await asyncio.gather(
        *[_retrieve_one(q, supabase, 0.72, 4) for q in queries],
        return_exceptions=True,
    )
    seen: set = set()
    scored: list[dict] = []
    for hits in raw:
        if isinstance(hits, Exception):
            continue
        for hit in hits:
            hid = hit.get("id")
            if hid and hid not in seen:
                seen.add(hid)
                scored.append({
                    "text": hit.get("content", ""),
                    "source": hit.get("source", ""),
                    "score": hit.get("similarity", 0),
                })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:8]


# ─── Chart slimmer ────────────────────────────────────────────────────────────

def _slim_chart(chart: dict) -> dict:
    """Minimal chart payload to reduce token usage."""
    return {
        "planets": {
            name: {
                "sign": p["sign"],
                "house": p["house"],
                "degree_in_sign": p["degree_in_sign"],
                "retrograde": p["retrograde"],
                "dignity_score": p["dignity_score"],
            }
            for name, p in chart.get("planets", {}).items()
        },
        "aspects": sorted(
            chart.get("aspects", []),
            key=lambda a: a.get("influence_weight", 0), reverse=True,
        )[:10],
        "stelliums": chart.get("stelliums", []),
        "aspect_patterns": chart.get("aspect_patterns", []),
    }


# ─── Core compute function ────────────────────────────────────────────────────

async def compute_sphere(
    sphere: int,
    chart: dict,
    user_id: str,
    save: bool = True,
) -> list[UniversalInsight]:
    """
    Compute insights for ONE sphere using GPT-4o-mini + targeted RAG.
    Retries up to 3x. Optionally saves to Supabase.
    """
    queries = build_sphere_queries(sphere, chart)
    context_chunks = await _retrieve_sphere_context(queries)
    slim = _slim_chart(chart)
    system_prompt = build_sphere_system_prompt(sphere)

    for attempt in range(3):
        try:
            response = await openai_client.chat.completions.create(
                model="gpt-4o-mini",
                response_format={"type": "json_object"},
                temperature=0.4 if attempt == 0 else 0.2,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps({
                        "chart": slim,
                        "book_context": [
                            {"text": c["text"], "source": c["source"]}
                            for c in context_chunks
                        ],
                    }, ensure_ascii=False)},
                ],
                max_tokens=4000,
            )
            raw = response.choices[0].message.content
            data = json.loads(raw)
            items = data.get("insights", data) if isinstance(data, dict) else data

            insights: list[UniversalInsight] = []
            for item in items:
                try:
                    ins = UniversalInsight(**item)
                    # Force correct sphere in case model slipped
                    if ins.primary_sphere == sphere:
                        insights.append(ins)
                except Exception:
                    pass

            if not insights:
                raise ValueError(f"No valid insights returned for sphere {sphere}")

            if save:
                await _save_sphere(user_id, sphere, insights)

            logger.info(f"Sphere {sphere} ({SPHERE_NAMES[sphere]}): {len(insights)} insights for user {user_id}")
            return insights

        except Exception as e:
            logger.error(f"Sphere {sphere} attempt {attempt} failed: {e}")
            if attempt == 2:
                raise

    return []


async def _save_sphere(user_id: str, sphere: int, insights: list[UniversalInsight]):
    """Replace existing insights for this sphere and save fresh ones."""
    supabase = get_supabase()
    level_order = {"high": 0, "medium": 1, "low": 2}
    sorted_insights = sorted(insights, key=lambda x: (level_order[x.influence_level], -x.weight))

    rows = [
        {
            "user_id": user_id,
            "system": "western_astrology",
            "primary_sphere": sphere,
            "rank": rank,
            **ins.model_dump(),
        }
        for rank, ins in enumerate(sorted_insights)
    ]

    supabase.table("user_insights")\
        .delete()\
        .eq("user_id", user_id)\
        .eq("system", "western_astrology")\
        .eq("primary_sphere", sphere)\
        .execute()

    supabase.table("user_insights").insert(rows).execute()
