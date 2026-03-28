import json
import logging
import asyncio
from typing import List, Dict
from app.models.uis import UISResponse
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.db import get_supabase

logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """
Ты астрологический интерпретатор AVATAR. Твоя задача — создать от 60 до 100
атомарных психологических инсайтов на основе натальной карты и книжных фрагментов.

═══ ФОРМАТ ВЫВОДА ═══
Возвращай ТОЛЬКО валидный JSON объект вида:
{"insights": [ ... ]}
Никакого текста до или после JSON. Никаких markdown-блоков.

═══ СТРУКТУРА КАЖДОГО ИНСАЙТА ═══
{
  "primary_sphere": <число от 1 до 12>,
  "influence_level": <"high" | "medium" | "low">,
  "weight": <число от 0.0 до 1.0>,
  "position": "<точная астрологическая позиция>",
  "core_theme": "<заголовок карточки, одна фраза>",
  "energy_description": "<нейтральное описание энергии>",
  "light_aspect": "<дар и потенциал>",
  "shadow_aspect": "<ловушка и риск>",
  "developmental_task": "<что нужно проработать>",
  "integration_key": "<конкретное действие>",
  "triggers": ["<ситуация 1>", "<ситуация 2>", ...],
  "source": "<автор — книга или null>"
}

═══ ПРАВИЛА ═══
1. Каждый инсайт — одна конкретная смысловая единица, не абзац обо всём.
2. Все 12 сфер обязательны. Минимум 3 инсайта на каждую сферу.
3. Опирайся на book_context — он приоритет над общими знаниями.
4. НЕ повторяй одну и ту же астрологическую позицию в разных инсайтах.
5. energy_description — нейтрально, без "хорошо/плохо".
6. light_aspect и shadow_aspect — конкретно, не абстрактно.
7. triggers — реальные жизненные ситуации, 2–6 штук.

═══ ФОРМУЛА WEIGHT ═══
Начальное значение = 0.5
+ 0.20 если personal planet (Солнце, Луна, Меркурий, Венера, Марс)
+ 0.15 если угловой дом (1, 4, 7, 10)
+ 0.10 если аспект точный (orb < 1.0°)
+ 0.10 если dignity_score >= 4 (обитель или экзальтация)
+ 0.10 если dignity_score <= -4 (изгнание или падение)
- 0.05 если планета ретроградна
Итог: нормализовать к диапазону 0.0–1.0, округлить до 2 знаков.

═══ INFLUENCE_LEVEL ═══
"high"   → weight >= 0.75
"medium" → weight 0.45–0.74
"low"    → weight < 0.45

═══ РАСПРЕДЕЛЕНИЕ ПО СФЕРАМ ═══
Целевое число инсайтов:
1 (Личность)    → 8–10
2 (Ресурсы)     → 4–6
3 (Мышление)    → 5–7
4 (Семья)       → 5–7
5 (Творчество)  → 4–6
6 (Здоровье)    → 4–5
7 (Отношения)   → 7–9
8 (Трансформ.)  → 6–8
9 (Смысл)       → 4–6
10 (Карьера)    → 6–8
11 (Социум)     → 4–6
12 (Тень)       → 7–9
"""

def build_queries(chart: dict) -> list[str]:
    queries = []
    personal = ["sun", "moon", "mercury", "venus", "mars", "asc", "mc", "north_node", "chiron", "lilith"]
    
    planets = chart.get("planets", {})
    for planet in personal:
        p = planets.get(planet)
        if p:
            queries.append(f"{planet} in {p['sign']} in {p['house']} house")

    for planet in ["jupiter", "saturn", "uranus", "neptune", "pluto"]:
        p = planets.get(planet)
        if p and (abs(p.get("dignity_score", 0)) >= 2 or p.get("house") in [1, 4, 7, 10]):
            queries.append(f"{planet} in {p['sign']} in {p['house']} house")

    aspects = chart.get("aspects", [])
    aspects_sorted = sorted(aspects, key=lambda a: a.get("influence_weight", 0), reverse=True)
    for asp in aspects_sorted[:15]:
        queries.append(f"{asp['planet_a']} {asp['type']} {asp['planet_b']}")

    for fig in chart.get("aspect_patterns", []):
        queries.append(f"aspect pattern {fig}")

    for st in chart.get("stelliums", []):
        queries.append(f"stellium in {st.get('sign') or st.get('house')}")

    for planet in chart.get("critical_degrees", []):
        p = planets.get(planet)
        if p:
            queries.append(f"critical degree {round(p['degree_in_sign'])} {p['sign']}")

    return queries

async def embed(text: str) -> list[float]:
    resp = await openai_client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return resp.data[0].embedding

async def retrieve_for_query(query: str, supabaseClient, min_score: float, limit: int) -> list[dict]:
    query_vector = await embed(query)
    try:
        # Calls a Postgres function defined in Supabase to calculate similarity mapping
        response = supabaseClient.rpc(
            'match_book_chunks', 
            {
                'query_embedding': query_vector, 
                'match_threshold': min_score, 
                'match_count': limit,
                'p_category': 'western_astrology'
            }
        ).execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Supabase RPC failed for query '{query}': {e}")
        return []

async def retrieve_context(queries: list[str]) -> list[dict]:
    MIN_SCORE = 0.72
    TOP_K_PER_QUERY = 4
    
    try:
        supabase = get_supabase()
    except Exception:
        return []

    # If Supabase is mocked or missing key early return
    if settings.SUPABASE_KEY == "mock-key":
         return []

    tasks = [
        retrieve_for_query(q, supabase, MIN_SCORE, TOP_K_PER_QUERY)
        for q in queries
    ]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    seen_ids = set()
    scored = []
    
    for hits in raw_results:
        if isinstance(hits, Exception):
            continue
        for hit in hits:
            hit_id = hit.get('id')
            if hit_id and hit_id not in seen_ids:
                seen_ids.add(hit_id)
                scored.append({
                    "text": hit.get("content", ""),
                    "source": hit.get("source", ""),
                    "score": hit.get("similarity", 0)
                })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:10]

async def parse_and_validate(raw: str) -> UISResponse:
    data = json.loads(raw)
    if isinstance(data, list):
        data = {"insights": data}
    return UISResponse(**data)

def _slim_chart_for_prompt(chart: dict) -> dict:
    """Reduce chart payload size: keep top-15 aspects, strip raw longitudes."""
    planets_slim = {
        name: {
            "sign":           p["sign"],
            "house":          p["house"],
            "degree_in_sign": p["degree_in_sign"],
            "retrograde":     p["retrograde"],
            "dignity_score":  p["dignity_score"],
        }
        for name, p in chart.get("planets", {}).items()
    }
    aspects_top = sorted(
        chart.get("aspects", []),
        key=lambda a: a.get("influence_weight", 0),
        reverse=True
    )[:15]
    return {
        "planets":         planets_slim,
        "houses":          chart.get("houses", {}),
        "angles":          chart.get("angles", {}),
        "aspects":         aspects_top,
        "aspect_patterns": chart.get("aspect_patterns", []),
        "stelliums":       chart.get("stelliums", []),
        "critical_degrees": chart.get("critical_degrees", []),
    }


async def generate_insights(chart: dict, attempt: int = 0) -> UISResponse:
    queries = build_queries(chart)
    context_chunks = await retrieve_context(queries)

    slim_chart = _slim_chart_for_prompt(chart)

    try:
        response = await openai_client.chat.completions.create(
            model="o4-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps({
                    "chart": slim_chart,
                    "book_context": [
                        {"text": c["text"], "source": c["source"]}
                        for c in context_chunks
                    ]
                }, ensure_ascii=False)}
            ],
            max_completion_tokens=16000,
        )
        raw = response.choices[0].message.content
        return await parse_and_validate(raw)
    except Exception as e:
        logger.error(f"UIS Generation failed on attempt {attempt}: {e}")
        if attempt < 2:
            return await generate_insights(chart, attempt=attempt + 1)
        raise e
