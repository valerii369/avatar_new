"""
AVATAR — Sphere-On-Demand Agent

Modes:
  DENSE (free spheres 1 & 10) — 12-15 insights + sphere_summary + cross-sphere links
  NORMAL (paid spheres)       — 4-8 insights, targeted RAG + GPT-4o-mini

Additional:
  generate_sphere_teasers()   — personalized 1-2 sentence hook per locked sphere
                                 (1 cheap GPT call at onboarding)
"""
import json
import logging
import asyncio
from dataclasses import dataclass
from openai import AsyncOpenAI
from app.models.uis import UniversalInsight
from app.core.config import settings
from app.core.db import get_supabase

logger = logging.getLogger(__name__)
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# ─── Sphere metadata ─────────────────────────────────────────────────────────

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

# Normal counts for paid spheres
NORMAL_COUNTS: dict[int, str] = {
    1: "7-9", 2: "4-6", 3: "4-6", 4: "4-6", 5: "4-6",
    6: "4-5", 7: "6-8", 8: "5-7", 9: "4-6", 10: "5-7", 11: "4-6", 12: "6-8",
}

# Dense counts for free spheres — max detail to demonstrate quality
DENSE_COUNTS: dict[int, str] = {
    1: "13-16", 10: "12-15",
}

FREE_SPHERES: set[int] = set(DENSE_COUNTS.keys())


# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class SphereResult:
    sphere: int
    insights: list[UniversalInsight]
    sphere_summary: str | None = None     # только в DENSE режиме
    cross_sphere_links: list[str] | None = None  # ["Сфера 7 тесно связана с..."]


# ─── Query builder ────────────────────────────────────────────────────────────

def build_sphere_queries(sphere: int, chart: dict, dense: bool = False) -> list[str]:
    """Build 4-7 (normal) or 8-10 (dense) targeted RAG queries."""
    ctx = SPHERE_CONTEXT[sphere]
    queries: list[str] = []
    planets = chart.get("planets", {})

    # Planets physically in this house
    for name, data in planets.items():
        if data.get("house") == ctx["house"]:
            queries.append(f"{name} in {data['sign']} in {ctx['house']} house")

    # Key planets for this sphere
    for pname in ctx["planets"]:
        p = planets.get(pname)
        if p:
            q = f"{pname} in {p['sign']} in {p['house']} house"
            if q not in queries:
                queries.append(q)

    # Aspects involving sphere's key planets
    key_set = set(ctx["planets"])
    max_asp = 6 if dense else 3
    count = 0
    for asp in sorted(chart.get("aspects", []), key=lambda a: a.get("influence_weight", 0), reverse=True):
        if asp["planet_a"] in key_set or asp["planet_b"] in key_set:
            q = f"{asp['planet_a']} {asp['type']} {asp['planet_b']}"
            if q not in queries:
                queries.append(q)
                count += 1
        if count >= max_asp:
            break

    # Sphere keywords
    for kw in ctx["keywords"]:
        queries.append(kw)

    # Dense: also add stelliums and patterns
    if dense:
        for st in chart.get("stelliums", []):
            queries.append(f"stellium in {st.get('sign') or st.get('house')}")
        for pat in chart.get("aspect_patterns", []):
            queries.append(f"aspect pattern {pat}")

    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)

    cap = 10 if dense else 7
    return unique[:cap]


# ─── System prompts ───────────────────────────────────────────────────────────

def build_dense_system_prompt(sphere: int) -> str:
    """Prompt for free spheres: maximum depth, sphere_summary, cross-sphere links."""
    name = SPHERE_NAMES[sphere]
    count = DENSE_COUNTS[sphere]
    other_spheres = ", ".join(f"{n} ({SPHERE_NAMES[n]})" for n in range(1, 13) if n != sphere)
    return f"""Ты астрологический интерпретатор AVATAR — режим ГЛУБОКОГО РАЗБОРА.
Сфера {sphere} ({name}) — максимальная детализация.

═══ ФОРМАТ ВЫВОДА ═══
Возвращай ТОЛЬКО валидный JSON:
{{
  "sphere_summary": "<3-4 предложения: суть энергии сферы у этого конкретного человека>",
  "cross_sphere_links": ["<как эта сфера влияет на сферу X>", ...],
  "insights": [ ... ]
}}

═══ sphere_summary ═══
- Персонализировано: опирайся на реальные позиции карты
- Без общих слов — конкретно про этого человека
- 3-4 предложения, цепляющие и точные
- На русском языке

═══ cross_sphere_links ═══
- 2-3 строки: как динамика этой сферы отражается в других
- Например: "Напряжение в Личности (1) питает трансформацию через Сферу 8"
- Только значимые связи, не перечисляй всё подряд

═══ СТРУКТУРА КАЖДОГО ИНСАЙТА ({count} штук) ═══
{{
  "primary_sphere": {sphere},
  "influence_level": <"high" | "medium" | "low">,
  "weight": <0.0–1.0>,
  "position": "<точная астрологическая позиция>",
  "core_theme": "<заголовок карточки, одна ёмкая фраза>",
  "energy_description": "<развёрнутое нейтральное описание энергии, 2-3 предложения>",
  "light_aspect": "<конкретный дар и потенциал>",
  "shadow_aspect": "<конкретная ловушка и риск>",
  "developmental_task": "<точная задача развития>",
  "integration_key": "<конкретное действие для интеграции>",
  "triggers": ["<ситуация 1>", "<ситуация 2>", "<ситуация 3>", "<ситуация 4>", "<ситуация 5>"],
  "source": "<автор — книга или null>"
}}

═══ ПРАВИЛА ГЛУБОКОГО РАЗБОРА ═══
1. Строго про сферу {sphere} ({name}) — никаких отклонений.
2. Опирайся на book_context — он приоритет над общими знаниями.
3. Каждый инсайт уникален — разные позиции, разные углы.
4. Распредели инсайты: 3-4 high + 5-7 medium + 3-4 low.
5. triggers — 4-5 реальных жизненных ситуаций (не абстракций).
6. energy_description — развёрнуто, 2-3 предложения, не одна строка.
7. light/shadow — конкретно и психологически точно.

═══ ДРУГИЕ СФЕРЫ ДЛЯ cross_sphere_links ═══
{other_spheres}

═══ ФОРМУЛА WEIGHT ═══
base=0.5 +0.20 личная планета +0.15 угловой дом +0.10 точный аспект
+0.10 обитель/экзальтация +0.10 изгнание/падение -0.05 ретро → clip(0,1)
high≥0.75  medium=0.45–0.74  low<0.45
"""


def build_normal_system_prompt(sphere: int) -> str:
    """Compact prompt for paid spheres."""
    name = SPHERE_NAMES[sphere]
    count = NORMAL_COUNTS.get(sphere, "4-7")
    return f"""Ты астрологический интерпретатор AVATAR.
Создай {count} атомарных инсайтов ТОЛЬКО для сферы {sphere} ({name}).

═══ ФОРМАТ ВЫВОДА ═══
{{"insights": [ ... ]}}

═══ СТРУКТУРА ═══
{{
  "primary_sphere": {sphere},
  "influence_level": <"high"|"medium"|"low">,
  "weight": <0.0–1.0>,
  "position": "<астрологическая позиция>",
  "core_theme": "<заголовок>",
  "energy_description": "<описание энергии>",
  "light_aspect": "<дар>",
  "shadow_aspect": "<ловушка>",
  "developmental_task": "<задача>",
  "integration_key": "<действие>",
  "triggers": ["<ситуация 1>", "<ситуация 2>", "<ситуация 3>"],
  "source": "<книга или null>"
}}

═══ ПРАВИЛА ═══
1. Только сфера {sphere} ({name}).
2. book_context — приоритет.
3. triggers — 2-4 реальных ситуации.
4. light/shadow — конкретно.

═══ WEIGHT ═══
base=0.5 +0.20 личная планета +0.15 угловой дом +0.10 точный аспект
+0.10 обитель/экзальтация +0.10 изгнание/падение -0.05 ретро → clip(0,1)
high≥0.75  medium=0.45–0.74  low<0.45
"""


# ─── RAG retrieval ────────────────────────────────────────────────────────────

async def _embed(text: str) -> list[float]:
    resp = await openai_client.embeddings.create(
        input=text, model="text-embedding-3-small",
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


async def _retrieve_sphere_context(queries: list[str], dense: bool = False) -> list[dict]:
    if settings.SUPABASE_KEY == "mock-key":
        return []
    supabase = get_supabase()
    per_query = 5 if dense else 4
    raw = await asyncio.gather(
        *[_retrieve_one(q, supabase, 0.72, per_query) for q in queries],
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
    cap = 14 if dense else 8
    return scored[:cap]


# ─── Chart slimmer ────────────────────────────────────────────────────────────

def _slim_chart(chart: dict, dense: bool = False) -> dict:
    asp_limit = 15 if dense else 10
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
        )[:asp_limit],
        "stelliums": chart.get("stelliums", []),
        "aspect_patterns": chart.get("aspect_patterns", []),
        "critical_degrees": chart.get("critical_degrees", []) if dense else [],
    }


# ─── Core compute ─────────────────────────────────────────────────────────────

async def compute_sphere(
    sphere: int,
    chart: dict,
    user_id: str,
    save: bool = True,
) -> SphereResult:
    """
    Compute insights for ONE sphere.
    Automatically uses DENSE mode for FREE_SPHERES (1, 10).
    """
    dense = sphere in FREE_SPHERES
    queries = build_sphere_queries(sphere, chart, dense=dense)
    context_chunks = await _retrieve_sphere_context(queries, dense=dense)
    slim = _slim_chart(chart, dense=dense)
    system_prompt = build_dense_system_prompt(sphere) if dense else build_normal_system_prompt(sphere)

    for attempt in range(3):
        try:
            max_tok = 6000 if dense else 4000
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
                max_tokens=max_tok,
            )
            raw = response.choices[0].message.content
            data = json.loads(raw)

            # Parse insights (dense wraps in top-level keys, normal may not)
            items = data.get("insights", data) if isinstance(data, dict) else data
            sphere_summary = data.get("sphere_summary") if dense else None
            cross_sphere_links = data.get("cross_sphere_links") if dense else None

            insights: list[UniversalInsight] = []
            for item in items:
                try:
                    ins = UniversalInsight(**item)
                    if ins.primary_sphere == sphere:
                        insights.append(ins)
                except Exception:
                    pass

            if not insights:
                raise ValueError(f"No valid insights for sphere {sphere}")

            result = SphereResult(
                sphere=sphere,
                insights=insights,
                sphere_summary=sphere_summary,
                cross_sphere_links=cross_sphere_links,
            )

            if save:
                await _save_sphere(user_id, sphere, result)

            mode = "DENSE" if dense else "normal"
            logger.info(
                f"[{mode}] Sphere {sphere} ({SPHERE_NAMES[sphere]}): "
                f"{len(insights)} insights for user {user_id}"
            )
            return result

        except Exception as e:
            logger.error(f"Sphere {sphere} attempt {attempt} failed: {e}")
            if attempt == 2:
                raise

    return SphereResult(sphere=sphere, insights=[])


async def _save_sphere(user_id: str, sphere: int, result: SphereResult):
    """Save insights + sphere metadata. Replaces existing for this sphere."""
    supabase = get_supabase()
    level_order = {"high": 0, "medium": 1, "low": 2}
    sorted_insights = sorted(
        result.insights,
        key=lambda x: (level_order[x.influence_level], -x.weight),
    )
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

    if rows:
        supabase.table("user_insights").insert(rows).execute()

    # Save sphere_summary + cross_sphere_links into user_portraits.deep_profile_data
    if result.sphere_summary or result.cross_sphere_links:
        try:
            existing = supabase.table("user_portraits")\
                .select("deep_profile_data")\
                .eq("user_id", user_id)\
                .maybe_single()\
                .execute()
            dpd: dict = {}
            if existing.data:
                dpd = existing.data.get("deep_profile_data") or {}

            sphere_meta = dpd.get("sphere_meta", {})
            sphere_meta[str(sphere)] = {
                "summary": result.sphere_summary,
                "cross_sphere_links": result.cross_sphere_links or [],
            }
            dpd["sphere_meta"] = sphere_meta

            supabase.table("user_portraits")\
                .update({"deep_profile_data": dpd})\
                .eq("user_id", user_id)\
                .execute()
        except Exception as e:
            logger.error(f"Failed to save sphere_meta for sphere {sphere}: {e}")


# ─── Sphere teasers ───────────────────────────────────────────────────────────

async def generate_sphere_teasers(chart: dict, free_spheres: list[int]) -> dict[str, str]:
    """
    Generate personalized 1-2 sentence teasers for all LOCKED spheres.
    One cheap GPT-4o-mini call at onboarding.
    Result: {"2": "Венера в Скорпионе...", "3": "Меркурий в...", ...}
    """
    locked = [s for s in range(1, 13) if s not in free_spheres]
    slim = _slim_chart(chart, dense=False)

    # Build brief planet hints per locked sphere for the prompt
    sphere_hints = {}
    for s in locked:
        ctx = SPHERE_CONTEXT[s]
        planets = chart.get("planets", {})
        hints = []
        for pname in ctx["planets"]:
            p = planets.get(pname)
            if p:
                retro = " (ретро)" if p.get("retrograde") else ""
                hints.append(f"{pname} в {p['sign']}, дом {p['house']}{retro}")
        # Also note planets in this house
        for name, data in planets.items():
            if data.get("house") == ctx["house"] and name not in ctx["planets"]:
                hints.append(f"{name} в {data['sign']} в {ctx['house']} доме")
        sphere_hints[s] = ", ".join(hints) if hints else f"дом {ctx['house']}"

    prompt_data = {
        "chart_summary": slim,
        "locked_spheres": {
            str(s): {
                "name": SPHERE_NAMES[s],
                "key_positions": sphere_hints[s],
            }
            for s in locked
        }
    }

    system = """Ты астрологический интерпретатор AVATAR.
Напиши персонализированный тизер для каждой указанной сферы.

Тизер = 2 предложения:
1. Ключевая астрологическая позиция и её суть
2. Интригующий намёк на главную тему/вызов этой сферы у человека

Тон: цепляющий, конкретный, не общий. Как будто ты уже знаешь этого человека.
На русском языке.

Возвращай ТОЛЬКО валидный JSON:
{"teasers": {"1": "...", "2": "...", ...}}
Ключи — номера сфер в виде строк."""

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0.5,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(prompt_data, ensure_ascii=False)},
            ],
            max_tokens=2000,
        )
        data = json.loads(response.choices[0].message.content)
        teasers = data.get("teasers", {})
        logger.info(f"Generated teasers for {len(teasers)} locked spheres")
        return teasers
    except Exception as e:
        logger.error(f"generate_sphere_teasers failed: {e}")
        return {}
