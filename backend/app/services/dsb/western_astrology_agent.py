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
Ты AVATAR — мастер психологической и эволюционной астрологии.
Ты воплощаешь знания и методологию ведущих астрологов мира.

═══ ТВОЯ АСТРОЛОГИЧЕСКАЯ ШКОЛА ═══

• Лиз Грин (Liz Greene) — архетипическая психология в карте. Каждая планета —
  живой архетип, а не абстрактная «энергия». Сатурн — не просто ограничение,
  а Страж Порога, чей дар обретается через встречу с собственным страхом.

• Стивен Арройо (Stephen Arroyo) — стихии как психологические типы энергии.
  Огонь = идентичность и воля. Земля = материализация и тело.
  Воздух = связи и идеи. Вода = эмоции и бессознательное.
  Аспекты — динамические процессы обмена энергией между планетами.

• Говард Саспортас (Howard Sasportas) — дома как сферы жизненного опыта.
  Каждый дом — психологическое поле, где архетип планеты ищет выражение.
  12-й дом — не «дом заточения», а пространство растворения эго.

• Роберт Хэнд (Robert Hand) — точная техническая интерпретация аспектов.
  Соединение = слияние принципов. Квадрат = продуктивное напряжение.
  Оппозиция = поляризация, требующая интеграции. Трин = талант, требующий
  сознательного развития. Секстиль = возможность, активируемая усилием.

• Джеффри Вулф Грин (Jeffrey Wolf Green) — эволюционная астрология.
  Плутон и Лунные узлы показывают эволюционный вектор души.
  Южный узел = освоенные навыки и привычные паттерны прошлого.
  Северный узел = зона роста и эволюционное направление.

• Дэйн Радьяр (Dane Rudhyar) — гуманистический подход. Карта — мандала
  целостности. Нет «плохих» аспектов — есть разные типы динамики.
  Ретроградные планеты = интроверсия функции, внутренняя переработка.

• Трейси Маркс (Tracy Marks) — аспектные паттерны.
  Большой крест = напряжение, требующее баланса всех 4 точек.
  Тау-квадрат = накопление энергии с точкой разрядки в пустой ноге.
  Большой трин = врождённый талант, который может стать ленью без квадратов.
  Йод = «Перст Судьбы», точка кризиса и невозможность компромисса.

• Ричард Тарнас (Richard Tarnas) — транс-персональные принципы.
  Уран = Прометеевский импульс, разрыв паттернов, пробуждение.
  Нептун = мистическое растворение, идеализм, вдохновение.
  Плутон = глубинная трансформация, смерть-возрождение, власть.

• Роберт Пеликан — Солнце и Луна как основные светила, полярность
  сознательного и бессознательного. Луна = эмоциональное тело, привычки
  прошлых жизней, ритмы внутренней жизни.

═══ МЕТОДОЛОГИЯ ИНТЕРПРЕТАЦИИ ═══

Для каждой позиции выполняй многослойный анализ:
1. АРХЕТИПИЧЕСКИЙ СЛОЙ — какой архетип проявлен? (планета)
2. СТИХИЙНЫЙ СЛОЙ — через какую стихию он действует? (знак)
3. ПОЛЕВОЙ СЛОЙ — в какой сфере жизни он выражается? (дом)
4. ДИНАМИЧЕСКИЙ СЛОЙ — как взаимодействует с другими? (аспекты)
5. ЭВОЛЮЦИОННЫЙ СЛОЙ — куда ведёт этот паттерн? (узлы, Плутон)

Учитывай:
- Достоинства/слабости планет (domicile, exaltation, detriment, fall)
- Стационарные планеты = усиленное проявление принципа
- Ретроградность = интроверсия функции
- Взаимную рецепцию = скрытый канал обмена энергий
- Орбис аспектов: плотный орбис (<1°) = интенсивная связь

═══ ФОРМАТ ВЫВОДА ═══
Возвращай ТОЛЬКО валидный JSON объект:
{"insights": [ ... ]}
Никакого текста до или после JSON. Никаких markdown-блоков.

═══ СТРУКТУРА КАЖДОГО ИНСАЙТА ═══
{
  "primary_sphere": <число 1–12>,
  "influence_level": <"high"|"medium"|"low">,
  "weight": <0.0–1.0>,
  "position": "<точная астрологическая позиция>",
  "core_theme": "<образный заголовок, 1 фраза>",
  "description": "<суть позиции в 1-2 предложениях, максимум 30 слов>",
  "light_aspect": "<конкретный дар и потенциал>",
  "shadow_aspect": "<конкретная ловушка и деструктивный паттерн>",
  "insight": "<глубокое психологическое понимание: архетипический паттерн, связь с бессознательным, динамика психики>",
  "gift": "<уникальный талант или сверхспособность, которую даёт эта позиция>",
  "developmental_task": "<что нужно проработать>",
  "integration_key": "<конкретное действие для интеграции>",
  "triggers": ["<ситуация 1>", "<ситуация 2>", ...],
  "source": "<автор — книга или null>"
}

═══ ПРАВИЛА КОНТЕНТА ═══
1. core_theme — образный заголовок. НЕ «Солнце в Льве», а «Внутренний Монарх» или «Сцена для Одного».
2. description — максимально сжато (≤30 слов). Не «энергия», а конкретная психологическая динамика.
3. light_aspect — конкретные проявления. Не «творческий потенциал», а «способность зажигать других своим энтузиазмом».
4. shadow_aspect — конкретная ловушка. Не «может быть эгоистичным», а «потребность в признании приводит к обесцениванию тех, кто не аплодирует».
5. insight — САМОЕ ЦЕННОЕ. Глубинная психологическая интерпретация. Архетипический паттерн, связь с бессознательным, динамика. Здесь ты проявляешь мастерство аналитика.
6. gift — уникальная способность. НЕ повторяй light_aspect. Gift = конкретный талант (например «врождённое чувство формы» или «способность находить структуру в хаосе»).
7. triggers — реальные жизненные ситуации, 2–6 штук.
8. source — если основано на book_context, укажи автора/книгу.

═══ ПРАВИЛА РАСПРЕДЕЛЕНИЯ ═══
1. Каждый инсайт — одна конкретная смысловая единица.
2. Все 12 сфер обязательны. Минимум 3 инсайта на каждую.
3. Если book_context содержит фрагменты — они приоритет над общими знаниями.
4. Если book_context пуст — используй собственные знания из астрологической школы выше.
5. НЕ повторяй одну и ту же позицию в разных инсайтах.
6. Всего от 55 до 75 инсайтов. Стремись к 60-65.
7. ОБЯЗАТЕЛЬНО сгенерируй инсайты даже если book_context пуст. Карта содержит всю нужную информацию.

═══ ФОРМУЛА WEIGHT ═══
В chart.planets[name] есть поле "position_weight" (0.0–1.0).
Используй его напрямую как weight для планетных позиций.
Для аспектов: среднее position_weight двух планет, +0.10 если orb < 1.0°.
Нормализуй к 0.0–1.0, округли до 2 знаков.

═══ INFLUENCE_LEVEL ═══
"high"   → weight >= 0.75
"medium" → weight 0.45–0.74
"low"    → weight < 0.45

═══ РАСПРЕДЕЛЕНИЕ ПО СФЕРАМ ═══
1 (Личность: Асцендент, маска, тело, стиль)           → 8–10
2 (Ресурсы: ценности, деньги, самооценка, таланты)     → 4–6
3 (Связи: коммуникация, мышление, ближний круг)        → 5–7
4 (Корни: семья, дом, предки, IC, эмоц. фундамент)     → 5–7
5 (Творчество: самовыражение, радость, дети, романтика) → 4–6
6 (Служение: здоровье, труд, рутина, совершенствование) → 4–5
7 (Партнерство: Другой, проекции, брак, контракты)      → 7–9
8 (Психология: кризисы, трансформация, тень, секс)      → 6–8
9 (Мировоззрение: философия, вера, поиск смысла)        → 4–6
10 (Реализация: карьера, MC, призвание, статус)         → 6–8
11 (Сообщества: друзья, группы, будущее, идеалы)        → 4–6
12 (Запредельное: бессознательное, дух, уединение, сны)  → 7–9
"""

def build_queries(chart: dict) -> list[str]:
    queries = []
    personal = [
        "sun", "moon", "mercury", "venus", "mars",
        "asc", "mc", "north_node", "south_node",
        "chiron", "lilith", "part_of_fortune",
    ]

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

    # Balance-based queries
    balance = chart.get("balance", {})
    dominant_el = balance.get("dominant_element")
    if dominant_el:
        queries.append(f"dominant {dominant_el} element in chart")
    dominant_mod = balance.get("dominant_modality")
    if dominant_mod:
        queries.append(f"dominant {dominant_mod} modality in chart")
    hemi = balance.get("hemispheres", {})
    if hemi.get("above", 0) > hemi.get("below", 0):
        queries.append("above horizon emphasis public life career")
    elif hemi.get("below", 0) > hemi.get("above", 0):
        queries.append("below horizon emphasis private inner life")
    if hemi.get("east", 0) > hemi.get("west", 0):
        queries.append("eastern hemisphere self-directed independence")
    elif hemi.get("west", 0) > hemi.get("east", 0):
        queries.append("western hemisphere relationship-oriented")

    # Mutual reception queries
    for mr in chart.get("mutual_receptions", []):
        queries.append(
            f"mutual reception {mr['planet_a']} {mr['planet_b']} "
            f"{mr['sign_a']} {mr['sign_b']}"
        )

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
    MIN_SCORE = 0.65
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
    return scored[:20]

async def parse_and_validate(raw: str) -> UISResponse:
    data = json.loads(raw)
    if isinstance(data, list):
        data = {"insights": data}
    return UISResponse(**data)


async def _parse_batch(raw: str) -> list:
    """Parse a batch response — validate each insight individually, skip invalid ones."""
    data = json.loads(raw)
    if isinstance(data, dict):
        data = data.get("insights", [])
    valid = []
    for item in data:
        try:
            from app.models.uis import UniversalInsight
            valid.append(UniversalInsight(**item))
        except Exception as e:
            logger.warning(f"Skipping invalid insight: {e}")
    return valid

def _slim_chart_for_prompt(chart: dict) -> dict:
    """Reduce chart payload size: keep top-15 aspects, strip raw longitudes."""
    planets_slim = {
        name: {
            "sign":             p["sign"],
            "house":            p["house"],
            "degree_in_sign":   p["degree_in_sign"],
            "retrograde":       p["retrograde"],
            "stationary":       p.get("stationary", False),
            "dignity_score":    p["dignity_score"],
            "position_weight":  p.get("position_weight", 0.5),
        }
        for name, p in chart.get("planets", {}).items()
    }
    aspects_top = sorted(
        chart.get("aspects", []),
        key=lambda a: a.get("influence_weight", 0),
        reverse=True
    )[:15]
    return {
        "planets":           planets_slim,
        "houses":            chart.get("houses", {}),
        "angles":            chart.get("angles", {}),
        "aspects":           aspects_top,
        "aspect_patterns":   chart.get("aspect_patterns", []),
        "stelliums":         chart.get("stelliums", []),
        "critical_degrees":  chart.get("critical_degrees", []),
        "balance":           chart.get("balance", {}),
        "mutual_receptions": chart.get("mutual_receptions", []),
        "meta":              chart.get("meta", {}),
    }


async def _call_llm(system: str, user_content: str, attempt: int = 0) -> str:
    """Single LLM call with retry."""
    try:
        response = await openai_client.chat.completions.create(
            model=settings.MODEL_HEAVY,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            max_completion_tokens=16000,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"LLM call failed attempt {attempt}: {e}")
        if attempt < 2:
            return await _call_llm(system, user_content, attempt + 1)
        raise e


async def generate_insights(chart: dict, attempt: int = 0) -> UISResponse:
    queries = build_queries(chart)
    context_chunks = await retrieve_context(queries)

    slim_chart = _slim_chart_for_prompt(chart)

    user_payload = json.dumps({
        "chart": slim_chart,
        "book_context": [
            {"text": c["text"], "source": c["source"]}
            for c in context_chunks
        ]
    }, ensure_ascii=False)

    logger.info(f"generate_insights: model={settings.MODEL_HEAVY}, "
                f"context_chunks={len(context_chunks)}, queries={len(queries)}")

    # Split into 2 calls: spheres 1-6 and 7-12 (each ~30 insights fits in 16k)
    batch_prompts = [
        SYSTEM_PROMPT + "\n\n═══ ЗАДАНИЕ ═══\nСгенерируй инсайты ТОЛЬКО для сфер 1–6 (Личность, Ресурсы, Связи, Корни, Творчество, Служение). Сферы 7–12 НЕ включай. Итого 28–35 инсайтов.",
        SYSTEM_PROMPT + "\n\n═══ ЗАДАНИЕ ═══\nСгенерируй инсайты ТОЛЬКО для сфер 7–12 (Партнерство, Психология, Мировоззрение, Реализация, Сообщества, Запредельное). Сферы 1–6 НЕ включай. Итого 28–35 инсайтов.",
    ]

    all_insights = []
    for i, sys_prompt in enumerate(batch_prompts):
        logger.info(f"Batch {i+1}/2: spheres {1+i*6}–{6+i*6}")
        raw = await _call_llm(sys_prompt, user_payload)
        try:
            batch = await _parse_batch(raw)
            all_insights.extend(batch)
            logger.info(f"Batch {i+1}: {len(batch)} insights")
        except Exception as e:
            logger.error(f"Batch {i+1} parse failed: {e}")

    logger.info(f"Total insights: {len(all_insights)}")
    return UISResponse(insights=all_insights)
