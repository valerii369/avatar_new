import json
import logging
import time
from uuid import uuid4
from typing import List, Dict
from app.models.uis import UISResponse
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.db import get_supabase
from app.services.rag.faiss_retriever import search_faiss_chunks, search_faiss_chunks_batch

logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """
Ты AVATAR — мастер психологической и эволюционной астрологии.
Ты воплощаешь знания и методологию ведущих астрологов мира.

═══ ЯЗЫК ═══
ВСЕ ТЕКСТЫ СТРОГО НА РУССКОМ ЯЗЫКЕ. Никакого английского.
Все поля JSON (core_theme, description, insight, gift, light_aspect, shadow_aspect,
developmental_task, integration_key, triggers) — только на русском.

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

# def build_queries(chart: dict) -> list[str]:
#     queries = []
#     personal = [
#         "sun", "moon", "mercury", "venus", "mars",
#         "asc", "mc", "north_node", "south_node",
#         "chiron", "lilith", "part_of_fortune",
#     ]

#     planets = chart.get("planets", {})
#     for planet in personal:
#         p = planets.get(planet)
#         if p:
#             queries.append(f"{planet} in {p['sign']} in {p['house']} house")

#     for planet in ["jupiter", "saturn", "uranus", "neptune", "pluto"]:
#         p = planets.get(planet)
#         if p and (abs(p.get("dignity_score", 0)) >= 2 or p.get("house") in [1, 4, 7, 10]):
#             queries.append(f"{planet} in {p['sign']} in {p['house']} house")

#     aspects = chart.get("aspects", [])
#     aspects_sorted = sorted(aspects, key=lambda a: a.get("influence_weight", 0), reverse=True)
#     for asp in aspects_sorted[:15]:
#         queries.append(f"{asp['planet_a']} {asp['type']} {asp['planet_b']}")

#     for fig in chart.get("aspect_patterns", []):
#         queries.append(f"aspect pattern {fig}")

#     for st in chart.get("stelliums", []):
#         queries.append(f"stellium in {st.get('sign') or st.get('house')}")

#     for planet in chart.get("critical_degrees", []):
#         p = planets.get(planet)
#         if p:
#             queries.append(f"critical degree {round(p['degree_in_sign'])} {p['sign']}")

#     # Balance-based queries
#     balance = chart.get("balance", {})
#     dominant_el = balance.get("dominant_element")
#     if dominant_el:
#         queries.append(f"dominant {dominant_el} element in chart")
#     dominant_mod = balance.get("dominant_modality")
#     if dominant_mod:
#         queries.append(f"dominant {dominant_mod} modality in chart")
#     hemi = balance.get("hemispheres", {})
#     if hemi.get("above", 0) > hemi.get("below", 0):
#         queries.append("above horizon emphasis public life career")
#     elif hemi.get("below", 0) > hemi.get("above", 0):
#         queries.append("below horizon emphasis private inner life")
#     if hemi.get("east", 0) > hemi.get("west", 0):
#         queries.append("eastern hemisphere self-directed independence")
#     elif hemi.get("west", 0) > hemi.get("east", 0):
#         queries.append("western hemisphere relationship-oriented")

#     # Mutual reception queries
#     for mr in chart.get("mutual_receptions", []):
#         queries.append(
#             f"mutual reception {mr['planet_a']} {mr['planet_b']} "
#             f"{mr['sign_a']} {mr['sign_b']}"
#         )

#     return queries


from collections import OrderedDict

HOUSE_ORDINALS = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth",
    11: "eleventh",
    12: "twelfth",
}

POINT_ALIASES = {
    "sun": ["sun"],
    "moon": ["moon"],
    "mercury": ["mercury"],
    "venus": ["venus"],
    "mars": ["mars"],
    "jupiter": ["jupiter"],
    "saturn": ["saturn"],
    "uranus": ["uranus"],
    "neptune": ["neptune"],
    "pluto": ["pluto"],
    "asc": ["ascendant", "asc"],
    "mc": ["midheaven", "mc"],
    "north_node": ["north node", "north_node"],
    "south_node": ["south node", "south_node"],
    "chiron": ["chiron"],
    "lilith": ["black moon lilith", "lilith"],
    "part_of_fortune": ["part of fortune", "part_of_fortune"],
}

ASPECT_ALIASES = {
    "conjunction": ["conjunction", "conjunct"],
    "opposition": ["opposition", "opposite"],
    "trine": ["trine"],
    "square": ["square"],
    "sextile": ["sextile"],
    "quincunx": ["quincunx", "inconjunct"],
    "semisextile": ["semisextile"],
    "sesquiquadrate": ["sesquiquadrate"],
}

HOUSE_KEYWORDS = {
    1: ["identity", "self-expression", "appearance", "approach to life"],
    2: ["money", "resources", "possessions", "values", "self-worth"],
    3: ["communication", "learning", "siblings", "daily environment", "short trips"],
    4: ["home", "family", "roots", "private life", "foundations"],
    5: ["creativity", "romance", "children", "pleasure", "self-expression"],
    6: ["work", "service", "health", "duties", "routine", "efficiency"],
    7: ["partnership", "relationships", "marriage", "cooperation", "open enemies"],
    8: ["intimacy", "shared resources", "transformation", "loss", "psychological depth"],
    9: ["beliefs", "higher education", "philosophy", "travel", "worldview", "religion"],
    10: ["career", "reputation", "public life", "status", "recognition", "profession", "authority"],
    11: ["friends", "groups", "ideals", "community", "hopes", "goals"],
    12: ["subconscious", "solitude", "inner life", "retreat", "hidden patterns"],
}

ELEMENT_KEYWORDS = {
    "fire": ["enthusiasm", "initiative", "energy", "confidence"],
    "earth": ["practical", "grounded", "stable", "material", "realistic"],
    "air": ["ideas", "communication", "social", "intellectual"],
    "water": ["emotion", "sensitivity", "intuition", "feeling"],
}

MODALITY_KEYWORDS = {
    "cardinal": ["initiative", "action", "leadership", "starting energy"],
    "fixed": ["stability", "persistence", "endurance", "resistance to change"],
    "mutable": ["adaptability", "flexibility", "changeability", "learning"],
}


def uniq_keep_order(items: list[str]) -> list[str]:
    return list(OrderedDict.fromkeys(x.strip() for x in items if x and x.strip()))


def house_label(house: int) -> str:
    return f"the {HOUSE_ORDINALS[house]} house"


def point_names(name: str) -> list[str]:
    return POINT_ALIASES.get(name, [name.replace("_", " ")])


def aspect_names(name: str) -> list[str]:
    return ASPECT_ALIASES.get(name, [name])


def placement_queries(planet: str, sign: str, house: int) -> list[str]:
    names = point_names(planet)
    primary = names[0]
    house_kw = " ".join(HOUSE_KEYWORDS.get(house, []))
    hlabel = house_label(house)

    queries = [
        f"{primary} in {sign}",
        f"{primary} in {hlabel}",
        f"{primary} {sign} {HOUSE_ORDINALS[house]} house",
        f"{house_kw} {primary} in {hlabel}",
    ]

    # optional alias variants
    for alias in names[1:]:
        queries.extend([
            f"{alias} in {sign}",
            f"{alias} in {hlabel}",
            f"{alias} {sign} {HOUSE_ORDINALS[house]} house",
        ])

    return uniq_keep_order(queries)


def aspect_queries(planet_a: str, aspect_type: str, planet_b: str) -> list[str]:
    a_names = point_names(planet_a)
    b_names = point_names(planet_b)
    asp_names = aspect_names(aspect_type)

    primary_a = a_names[0]
    primary_b = b_names[0]

    queries = []
    for asp in asp_names:
        queries.append(f"{primary_a} {asp} {primary_b}")

    # alias-normalized variants
    for a in a_names:
        for b in b_names:
            for asp in asp_names[:1]:
                queries.append(f"{a} {asp} {b}")

    return uniq_keep_order(queries)


def build_queries(chart: dict) -> list[str]:
    queries = []
    personal = [
        "sun", "moon", "mercury", "venus", "mars",
        "asc", "mc", "north_node", "south_node",
        "chiron", "lilith", "part_of_fortune",
    ]

    planets = chart.get("planets", {})

    # Strong placements first
    for planet in personal:
        p = planets.get(planet)
        if p:
            queries.extend(placement_queries(planet, p["sign"], p["house"]))

    for planet in ["jupiter", "saturn", "uranus", "neptune", "pluto"]:
        p = planets.get(planet)
        if p and (abs(p.get("dignity_score", 0)) >= 2 or p.get("house") in [1, 4, 7, 10]):
            queries.extend(placement_queries(planet, p["sign"], p["house"]))

    # Aspects
    aspects = chart.get("aspects", [])
    aspects_sorted = sorted(aspects, key=lambda a: a.get("influence_weight", 0), reverse=True)
    for asp in aspects_sorted[:15]:
        queries.extend(aspect_queries(asp["planet_a"], asp["type"], asp["planet_b"]))

    # Patterns
    for fig in chart.get("aspect_patterns", []):
        queries.append(f"aspect pattern {fig}")

    # Stelliums
    for st in chart.get("stelliums", []):
        if st.get("sign"):
            queries.append(f"stellium in {st['sign']}")
        if st.get("house"):
            queries.append(f"stellium in the {HOUSE_ORDINALS[st['house']]} house")

    # Critical degrees - weak signal, keep but late
    for planet in chart.get("critical_degrees", []):
        p = planets.get(planet)
        if p:
            queries.append(f"critical degree {round(p['degree_in_sign'])} {p['sign']}")
            queries.append(f"{point_names(planet)[0]} in {p['sign']}")

    # Balance
    balance = chart.get("balance", {})
    dominant_el = balance.get("dominant_element")
    if dominant_el:
        el_kw = " ".join(ELEMENT_KEYWORDS.get(dominant_el, []))
        queries.append(f"{dominant_el} dominant chart")
        queries.append(f"strong {dominant_el} element astrology")
        queries.append(f"{el_kw} {dominant_el} element")

    dominant_mod = balance.get("dominant_modality")
    if dominant_mod:
        mod_kw = " ".join(MODALITY_KEYWORDS.get(dominant_mod, []))
        queries.append(f"{dominant_mod} dominant chart")
        queries.append(f"strong {dominant_mod} modality astrology")
        queries.append(f"{mod_kw} {dominant_mod} modality")

    hemi = balance.get("hemispheres", {})
    if hemi.get("above", 0) > hemi.get("below", 0):
        queries.append("planets above horizon")
        queries.append("upper hemisphere emphasis")
        queries.append("public life outer world social visibility career")
    elif hemi.get("below", 0) > hemi.get("above", 0):
        queries.append("planets below horizon")
        queries.append("lower hemisphere emphasis")
        queries.append("private life inner life personal foundations")

    if hemi.get("east", 0) > hemi.get("west", 0):
        queries.append("eastern hemisphere chart")
        queries.append("self-directed independent chart")
    elif hemi.get("west", 0) > hemi.get("east", 0):
        queries.append("western hemisphere chart")
        queries.append("relationship-oriented responsive to others")

    # Mutual receptions
    for mr in chart.get("mutual_receptions", []):
        a = point_names(mr["planet_a"])[0]
        b = point_names(mr["planet_b"])[0]
        queries.append(f"mutual reception {a} {b}")
        queries.append(f"{a} {b} mutual reception")

    return uniq_keep_order(queries)

async def retrieve_for_query(query: str, min_score: float, limit: int) -> list[dict]:
    t0 = time.perf_counter()
    try:
        hits = await search_faiss_chunks(
            query=query,
            top_k=limit,
            category="western_astrology",
            min_score=min_score,
        )
        mapped = [
            {
                "id": str(h.faiss_id),
                "book_chunk_id": h.book_chunk_id,
                "content": h.content,
                "source": h.source,
                "similarity": h.score,
            }
            for h in hits
        ]
        logger.info(
            "[RAG_TRACE] step=faiss_search query=%s duration=%.2fs hits=%d threshold=%.2f limit=%d",
            query, time.perf_counter() - t0, len(mapped), min_score, limit
        )
        return mapped
    except Exception as e:
        logger.error(
            "[RAG_TRACE] step=faiss_search query=%s duration=%.2fs error=%s",
            query, time.perf_counter() - t0, str(e)
        )
        logger.error(f"FAISS retrieval failed for query '{query}': {e}")
        return []

def _store_retriever_traces(
    *,
    trace_id: str,
    user_id: str | None,
    trace_label: str,
    min_score: float,
    top_k_per_query: int,
    query_rows: list[dict],
) -> None:
    if not query_rows:
        return
    try:
        supabase = get_supabase()
        supabase.table("retriever_traces").insert(query_rows).execute()
        logger.info(
            "[RAG_TRACE] step=store_retriever_traces trace_id=%s rows=%d label=%s user_id=%s",
            trace_id, len(query_rows), trace_label, user_id or ""
        )
    except Exception as e:
        logger.error(
            "[RAG_TRACE] step=store_retriever_traces trace_id=%s label=%s error=%s min_score=%.2f top_k_per_query=%d",
            trace_id, trace_label, str(e), min_score, top_k_per_query
        )


async def retrieve_context(
    queries: list[str],
    *,
    user_id: str | None = None,
    trace_label: str = "unknown",
) -> list[dict]:
    MIN_SCORE = 0.65
    TOP_K_PER_QUERY = 4
    trace_id = str(uuid4())

    try:
        batch_t0 = time.perf_counter()
        batch_hits = await search_faiss_chunks_batch(
            queries=queries,
            top_k=TOP_K_PER_QUERY,
            category="western_astrology",
            min_score=MIN_SCORE,
            embed_batch_size=32,
        )
        logger.info(
            "[RAG_TRACE] step=faiss_search_batch query_count=%d duration=%.2fs threshold=%.2f top_k_per_query=%d embed_batch_size=%d",
            len(queries), time.perf_counter() - batch_t0, MIN_SCORE, TOP_K_PER_QUERY, 32
        )
        raw_results = [
            [
                {
                    "id": str(h.faiss_id),
                    "book_chunk_id": h.book_chunk_id,
                    "content": h.content,
                    "source": h.source,
                    "similarity": h.score,
                }
                for h in hits
            ]
            for hits in batch_hits
        ]
    except Exception as e:
        logger.error(
            "[RAG_TRACE] step=faiss_search_batch query_count=%d error=%s",
            len(queries), str(e)
        )
        raw_results = [e for _ in queries]

    seen_ids = set()
    scored = []
    query_rows: list[dict] = []
    
    for idx, hits in enumerate(raw_results):
        query_text = queries[idx] if idx < len(queries) else ""
        if isinstance(hits, Exception):
            query_rows.append({
                "trace_id": trace_id,
                "user_id": user_id,
                "trace_label": trace_label,
                "query_index": idx,
                "query_text": query_text,
                "min_score": MIN_SCORE,
                "top_k_per_query": TOP_K_PER_QUERY,
                "returned_count": 0,
                "chunk_ids": [],
                "documents": [],
                "error": str(hits),
            })
            continue
        query_rows.append({
            "trace_id": trace_id,
            "user_id": user_id,
            "trace_label": trace_label,
            "query_index": idx,
            "query_text": query_text,
            "min_score": MIN_SCORE,
            "top_k_per_query": TOP_K_PER_QUERY,
            "returned_count": len(hits),
            "chunk_ids": [
                h.get("book_chunk_id")
                for h in hits
                if h.get("book_chunk_id")
            ],
            "documents": [
                {
                    "id": h.get("id"),
                    "book_chunk_id": h.get("book_chunk_id"),
                    "source": h.get("source"),
                    "score": h.get("similarity", 0),
                }
                for h in hits
            ],
            "error": None,
        })
        for hit in hits:
            hit_id = hit.get('id')
            if hit_id and hit_id not in seen_ids:
                seen_ids.add(hit_id)
                scored.append({
                    "text": hit.get("content", ""),
                    "source": hit.get("source", ""),
                    "book_chunk_id": hit.get("book_chunk_id"),
                    "score": hit.get("similarity", 0)
                })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:20]
    _store_retriever_traces(
        trace_id=trace_id,
        user_id=user_id,
        trace_label=trace_label,
        min_score=MIN_SCORE,
        top_k_per_query=TOP_K_PER_QUERY,
        query_rows=query_rows,
    )
    logger.info(
        "[RAG_TRACE] step=retrieve_context trace_id=%s label=%s user_id=%s query_count=%d unique_hits=%d returned=%d threshold=%.2f top_k_per_query=%d",
        trace_id, trace_label, user_id or "", len(queries), len(scored), len(top), MIN_SCORE, TOP_K_PER_QUERY
    )
    return top

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
    skipped = 0
    for item in data:
        try:
            from app.models.uis import UniversalInsight
            valid.append(UniversalInsight(**item))
        except Exception as e:
            skipped += 1
            logger.warning(f"Skipping insight '{item.get('core_theme','?')[:30]}': {str(e)[:150]}")
    logger.info(f"_parse_batch: {len(valid)} valid, {skipped} skipped out of {len(data)}")
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


def _usage_to_dict(usage) -> dict:
    if not usage:
        return {}
    return {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }


def _log_llm_trace(
    label: str,
    model: str,
    system_prompt: str,
    user_payload: str,
    response_text: str,
    usage: dict,
    duration_s: float,
    attempt: int,
) -> None:
    logger.info(
        "[LLM_TRACE] label=%s model=%s attempt=%s duration=%.2fs usage=%s\n"
        "----- SYSTEM PROMPT BEGIN -----\n%s\n"
        "----- SYSTEM PROMPT END -----\n"
        "----- USER PAYLOAD BEGIN -----\n%s\n"
        "----- USER PAYLOAD END -----\n"
        "----- LLM RESPONSE BEGIN -----\n%s\n"
        "----- LLM RESPONSE END -----",
        label, model, attempt, duration_s, json.dumps(usage, ensure_ascii=False),
        system_prompt, user_payload, response_text,
    )


async def _call_llm(system: str, user_content: str, attempt: int = 0, trace_label: str = "western_astrology") -> str:
    """Single LLM call with retry."""
    try:
        t0 = time.perf_counter()
        response = await openai_client.chat.completions.create(
            model=settings.MODEL_HEAVY,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            max_completion_tokens=16000,
        )
        content = response.choices[0].message.content or ""
        duration_s = time.perf_counter() - t0
        _log_llm_trace(
            label=trace_label,
            model=settings.MODEL_HEAVY,
            system_prompt=system,
            user_payload=user_content,
            response_text=content,
            usage=_usage_to_dict(response.usage),
            duration_s=duration_s,
            attempt=attempt,
        )
        return content
    except Exception as e:
        logger.error(f"LLM call failed attempt {attempt}: {e}")
        if attempt < 2:
            return await _call_llm(system, user_content, attempt + 1, trace_label=trace_label)
        raise e


async def generate_insights(chart: dict, attempt: int = 0, user_id: str | None = None) -> UISResponse:
    queries = build_queries(chart)
    logger.info(
        "[RAG_TRACE] step=build_queries label=generate_insights count=%d queries=%s",
        len(queries), json.dumps(queries, ensure_ascii=False)
    )
    context_chunks = await retrieve_context(
        queries,
        user_id=user_id,
        trace_label="generate_insights",
    )

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

    # Split into 3 calls of 4 spheres each (~20 insights per batch, fits in 16k)
    batch_prompts = [
        SYSTEM_PROMPT + "\n\n═══ ЗАДАНИЕ ═══\nСгенерируй инсайты ТОЛЬКО для сфер 1–4:\n1 (Личность) — 5-7 инсайтов\n2 (Ресурсы) — 4-5 инсайтов\n3 (Связи) — 4-5 инсайтов\n4 (Корни) — 4-5 инсайтов\nСферы 5–12 НЕ включай. МИНИМУМ 17 инсайтов в этом батче.",
        SYSTEM_PROMPT + "\n\n═══ ЗАДАНИЕ ═══\nСгенерируй инсайты ТОЛЬКО для сфер 5–8:\n5 (Творчество) — 4-5 инсайтов\n6 (Служение) — 4-5 инсайтов\n7 (Партнерство) — 5-7 инсайтов\n8 (Психология) — 5-7 инсайтов\nСферы 1–4 и 9–12 НЕ включай. МИНИМУМ 18 инсайтов в этом батче.",
        SYSTEM_PROMPT + "\n\n═══ ЗАДАНИЕ ═══\nСгенерируй инсайты ТОЛЬКО для сфер 9–12:\n9 (Мировоззрение) — 4-5 инсайтов\n10 (Реализация) — 5-7 инсайтов\n11 (Сообщества) — 4-5 инсайтов\n12 (Запредельное) — 5-7 инсайтов\nСферы 1–8 НЕ включай. МИНИМУМ 18 инсайтов в этом батче.",
    ]

    all_insights = []
    for i, sys_prompt in enumerate(batch_prompts):
        logger.info(f"Batch {i+1}/3: starting")
        raw = await _call_llm(
            sys_prompt,
            user_payload,
            trace_label=f"western_astrology.batch_{i+1}_of_3",
        )
        try:
            batch = await _parse_batch(raw)
            all_insights.extend(batch)
            logger.info(f"Batch {i+1}: {len(batch)} insights")
        except Exception as e:
            logger.error(f"Batch {i+1} parse failed: {e}")

    logger.info(f"Total insights: {len(all_insights)}")
    return UISResponse(insights=all_insights)


# ─── Per-Sphere Agent ─────────────────────────────────────────────────────────

SPHERE_NAMES_RU = {
    1: "Личность (Ядро, маска, тело, стиль)",
    2: "Ресурсы (Ценности, деньги, самооценка, таланты)",
    3: "Связи (Коммуникация, мышление, ближний круг)",
    4: "Корни (Семья, дом, предки, эмоциональный фундамент)",
    5: "Творчество (Самовыражение, радость, дети, романтика)",
    6: "Служение (Здоровье, труд, рутина, совершенствование)",
    7: "Партнёрство (Другой, проекции, брак, контракты)",
    8: "Психология (Кризисы, трансформация, тень, секс, власть)",
    9: "Мировоззрение (Философия, вера, поиск смысла, дальние путешествия)",
    10: "Реализация (Карьера, MC, призвание, статус)",
    11: "Сообщества (Друзья, группы, будущее, идеалы)",
    12: "Запредельное (Бессознательное, дух, уединение, сны)",
}

async def generate_sphere_insights(chart: dict, sphere_id: int, user_id: str | None = None) -> list:
    """Generate insights for a SINGLE sphere. Used by per-sphere unlock."""
    queries = build_queries(chart)
    logger.info(
        "[RAG_TRACE] step=build_queries label=generate_sphere_insights sphere=%d count=%d queries=%s",
        sphere_id, len(queries), json.dumps(queries, ensure_ascii=False)
    )
    context_chunks = await retrieve_context(
        queries,
        user_id=user_id,
        trace_label=f"generate_sphere_insights.sphere_{sphere_id}",
    )
    slim_chart = _slim_chart_for_prompt(chart)

    sphere_name = SPHERE_NAMES_RU.get(sphere_id, f"Сфера {sphere_id}")

    user_payload = json.dumps({
        "chart": slim_chart,
        "book_context": [
            {"text": c["text"], "source": c["source"]}
            for c in context_chunks
        ]
    }, ensure_ascii=False)

    system = SYSTEM_PROMPT + f"""

═══ ЗАДАНИЕ ═══
Сгенерируй инсайты ТОЛЬКО для сферы {sphere_id} — {sphere_name}.
Другие сферы НЕ включай.

Количество: ровно 5–8 инсайтов для этой сферы.
Каждый инсайт — уникальная смысловая единица.
primary_sphere для всех инсайтов = {sphere_id}.
"""

    logger.info(f"generate_sphere_insights: sphere={sphere_id}, model={settings.MODEL_HEAVY}")

    raw = await _call_llm(
        system,
        user_payload,
        trace_label=f"western_astrology.sphere_{sphere_id}",
    )
    insights = await _parse_batch(raw)

    # Filter to only requested sphere (GPT might include others)
    filtered = [i for i in insights if i.primary_sphere == sphere_id]
    logger.info(f"Sphere {sphere_id}: {len(filtered)} insights (raw: {len(insights)})")

    return filtered
