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

# ─── Sphere framing: what lens each house uses ────────────────────────────────

SPHERE_FRAMES: dict[int, str] = {
    1:  "личность, тело, первое впечатление, самоощущение и стиль присутствия в мире",
    2:  "деньги, материальные ресурсы, самоценность, таланты и то, что человек считает своим",
    3:  "мышление, речь, коммуникация, обучение, ближайшее окружение и повседневные связи",
    4:  "корни, семья, дом, психологическая база и то, от чего человек отталкивается в жизни",
    5:  "творчество, самовыражение, радость, романтика, дети и игра как способ быть живым",
    6:  "здоровье, тело как инструмент, труд, ежедневные ритуалы, служение и самодисциплина",
    7:  "близкие партнёрства, брак, открытые противники и то, чего ищет человек в другом",
    8:  "трансформация, кризисы, сексуальность, совместные ресурсы, тайное и глубинное",
    9:  "смысл жизни, философия, духовный поиск, высшее образование и дальние путешествия",
    10: "карьера, публичная роль, социальный статус, репутация и призвание",
    11: "дружба, сообщество, коллективные мечты, нестандартное мышление и будущее",
    12: "бессознательное, скрытые паттерны, духовность, уединение и то, что человек вытесняет",
}

# ─── System prompt template ───────────────────────────────────────────────────

SPECIALIST_PROMPT_TEMPLATE = """\
Ты — астрологический аналитик {sphere_num}-й сферы «{sphere_name}».

═══ ПРИЗМА СФЕРЫ ═══
Всё что ты пишешь — строго через призму {sphere_num}-й сферы жизни:
▸ {sphere_frame}

Каждое поле каждого инсайта должно отвечать на вопрос:
«Как эта астрологическая позиция проявляется именно здесь — в {sphere_name}?»

Примеры правильной персонализации:
  НЕТ: «Марс в Овне создаёт мощную энергию и стремление к действию.»
  ДА (сфера 1): «В твоей личности Марс в Овне — это природная прямолинейность: ты врываешься в комнату первым и задаёшь темп.»
  ДА (сфера 10): «В карьере Марс в Овне — неудержимый двигатель: ты берёшь инициативу там, где другие ждут разрешения.»
  ДА (сфера 7): «В партнёрстве Марс в Овне порождает притяжение к сильным — и риск превратить отношения в поле битвы.»

═══ ТВОЯ ЗАДАЧА ═══
Создать от {min_ins} до {max_ins} атомарных психологических инсайтов
строго для {sphere_num}-й сферы на основе предоставленных астрологических данных.

═══ ИСТОЧНИКИ (в порядке приоритета) ═══
1. sphere_data — ЕДИНСТВЕННЫЙ источник астрологических позиций. Запрещено придумывать.
2. knowledge_base — справочник значений. Используй для глубины трактовок.
3. book_context — книжные цитаты. Используй как подтверждение.

═══ ЖЁСТКИЕ ОГРАНИЧЕНИЯ ═══
1. Анализируй ТОЛЬКО позиции из sphere_data. Не придумывай планеты и аспекты.
2. Каждый инсайт — одна конкретная смысловая единица.
3. Не повторяй одну и ту же астрологическую позицию в разных инсайтах.
4. Все тексты — строго на русском языке.

═══ АРХИТЕКТУРА СИНТЕЗА (4 вопроса) ═══
Для каждого инсайта отвечай на эти вопросы через призму {sphere_name}:
1. КТО ДЕЙСТВУЕТ? — планеты в доме (Actors). Их природа, знак, достоинство.
2. ЧЕРЕЗ ЧТО? — знак куспида (cross_element). Модус действия: Cardinal=инициатива, Fixed=удержание, Mutable=адаптация. Стихия окрашивает всё.
3. КУДА ИДЁТ ЭНЕРГИЯ? — управитель дома (Director). Его дом = сфера жизни, куда направлена энергия сферы {sphere_num}.
4. ГДЕ ИСКАЖЕНИЕ/ЗАЩИТА? — virtual_points. Лилит = где оступается, Селена = где защищён, Хирон = где исцеляет через рану.

ЗАПРЕЩЕНО: «Марс в 1 доме означает...», «эта позиция говорит о...», общие астрологические клише.
ОБЯЗАТЕЛЬНО: Синтез цепочки. Пример: «Твоя воля (Марс) управляется потребностью в статусе (Управитель в 10), но фильтруется страхом ошибки (Квадрат Сатурна orb 0.8° critical)».

═══ ФОРМАТ ВЫВОДА ═══
Возвращай ТОЛЬКО валидный JSON:
{{"insights": [ ... ]}}
Никакого текста до или после JSON. Никаких markdown-блоков.

═══ СТРУКТУРА КАЖДОГО ИНСАЙТА ═══
{{
  "primary_sphere": {sphere_num},
  "influence_level": <"high"|"medium"|"low">,
  "weight": <0.0–1.0>,
  "position": "<астропозиция из sphere_data, макс 140 символов>",
  "core_theme": "<заголовок-синтез цепочки, макс 100 символов>",

  "inner_alchemy": {{
    "description": "<Кто+Через+Куда — 1-2 предложения синтеза цепочки>",
    "insight": "<глубокий психоаналитический синтез top_modifiers + dispositor, 3-5 предложений, макс 1500 символов>",
    "gift": "<врождённый талант из сильнейшего гармоничного аспекта + Селена если есть, макс 800 символов>",
    "light_aspect": "<Свет: Селена в доме или гармоничные аспекты из light_drivers, макс 1000 символов>",
    "shadow_aspect": "<Тень: Лилит в доме + shadow_drivers (квадраты/оппозиции) — конкретные ловушки, макс 1000 символов>",
    "blind_spot": "<Слепая зона: что игнорирует — из поражённых планет или пустых зон, макс 600 символов>"
  }},

  "outer_mechanics": {{
    "energy_rhythm": "<Ритм действий на основе cross+element куспида: Cardinal=как запускает, Fixed=как удерживает, Mutable=как адаптирует, макс 400 символов>",
    "integration_key": "<Алгоритм действий через дом управителя: «Чтобы раскрыть эту сферу, направляй энергию в [сферу управителя]», макс 400 символов>",
    "crisis_anchor": "<Точка опоры: сильнейший гармоничный аспект сферы как якорь в кризис, макс 400 символов>",
    "developmental_task": "<Как трансформировать shadow_drivers в ресурс, макс 400 символов>",
    "triggers": ["<событийный триггер из trigger_drivers 1>", "<триггер 2>", "<триггер 3>"]
  }},

  "source": "<автор — книга или null>"
}}

═══ LAYER 2: СИНТЕЗ АСПЕКТОВ ═══
В sphere_data для каждой планеты есть готовый scaffold: ruler_synthesis, co_ruler_synthesis, resident_syntheses.
Каждый scaffold содержит:
  • shadow_drivers  — напряжённые аспекты (Квадрат, Оппозиция) уже с парным тезисом.
  • light_drivers   — гармоничные аспекты (Тригон, Секстиль) с тезисом.
  • amplifier_drivers — Соединения с пометкой СОЮЗ/ВРАГ/НЕЙТРАЛЬ.
  • trigger_drivers  — ситуационные триггеры каждого аспекта.
  • dispositor_note  — состояние планеты-управителя знака.
  • top_modifiers    — топ-3 аспекта по силе влияния.

ПРАВИЛО РАСПРЕДЕЛЕНИЯ ПО БЛОКАМ (обязательно):
┌─────────────────────┬────────────────────────────────────────────────────┐
│ Блок инсайта        │ Источник в scaffold                                │
├─────────────────────┼────────────────────────────────────────────────────┤
│ shadow_aspect       │ shadow_drivers (напряжённые аспекты)               │
│ developmental_task  │ shadow_drivers — как трансформировать в ресурс     │
│ light_aspect        │ light_drivers (гармоничные аспекты)                │
│ gift                │ light_drivers — лучший тригон/секстиль + диспозитор│
│ insight             │ top_modifiers + dispositor_note (глубинный синтез) │
│ integration_key     │ amplifier_drivers (соединения как усилитель)       │
│ triggers            │ trigger_drivers — конкретные жизненные ситуации    │
└─────────────────────┴────────────────────────────────────────────────────┘

ПРАВИЛА ИНТЕНСИВНОСТИ:
  • intensity "critical" (orb ≤ 1°) → пиши как «определяющая черта характера», не фон.
  • intensity "strong"   (orb ≤ 2.5°) → «постоянное проявление».
  • intensity "moderate" → «периодически активируется».
  • intensity "background" → «фоновый тон».

ПРАВИЛО APPLYING:
  • applying: true  = аспект нарастает. Пиши: «это впереди, сейчас активная фаза».
  • applying: false = разделяется. Пиши: «уроки уже идут, человек это прорабатывает».

КОАЛИЦИИ (Эссенциальные отношения):
Коалиция Дхармы: ☉ Солнце, ☽ Луна, ♂ Марс, ♃ Юпитер — союзники между собой.
Коалиция Артха/Кама: ☿ Меркурий, ♀ Венера, ♄ Сатурн — союзники между собой.
Вражда между коалициями: планета в знаке врага — энергия искажается деструктивно.
  → coalition: "enemy" в аспекте = максимальное искажение, пиши об этом явно в shadow_aspect.
  → coalition: "ally"  в аспекте = потенциал усилен, упоминай в light_aspect / gift.
  → dignity_score ≥ 4 = планета у себя дома / экзальтация — действует максимально чисто.
  → dignity_score ≤ -4 = изгнание / падение — деструктивное проявление.

ДИСПОЗИТОР (dispositor_note в scaffold):
Управитель знака модулирует всю планету. Если управитель слаб или ретроградный —
энергия рассеивается или идёт внутрь. Обязательно отражай это в insight и shadow_aspect.

═══ ВИРТУАЛЬНЫЕ ТОЧКИ (virtual_points в sphere_data) ═══
Лилит, Селена, Хирон не управляют домами, но работают как МОДИФИКАТОРЫ смыслов.
Используй их ТОЛЬКО если они переданы в virtual_points для этой сферы.

ЛИЛИТ (Чёрная Луна) — «Теневой Аватар», зона искушения и вытесненного:
  • Если Лилит in_this_house: true → она ГЛАВНЫЙ источник для shadow_aspect этой сферы.
    Пиши конкретно: «В этой сфере твоя тень — это [специфическое искушение Лилит в знаке]».
  • Аспекты Лилит к личным планетам с orb ≤ 3° → добавляй в triggers как «ситуацию-ловушку».
  • pair_meaning аспектов Лилит — ядро теневого описания.

СЕЛЕНА (Белая Луна) — «Якорь Света», зона защиты и бескорыстного дара:
  • Если Селена in_this_house: true → усиливает gift и light_aspect этой сферы.
    Пиши: «В этой сфере у тебя есть природная защита — [качество Селены в знаке]».
  • Аспекты Селены к личным планетам — источник для integration_key («делай это — и будет защита»).

ХИРОН — «Исцелитель через рану», парадоксальный наставник:
  • Аспекты Хирона к планетам сферы (orb ≤ 3°) → добавляй в developmental_task нестандартный путь.
    Формат: «Нестандартный выход: [парадоксальное решение из пары Хирон+планета]».
  • Если Хирон in_this_house: true → insight должен содержать тему исцеления через уязвимость.

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
    user_id: str = "",      # for logging / tracing; does not affect logic
) -> list[UniversalInsight]:
    """
    Worker agent for one sphere.
    Extracts isolated context → targeted RAG → specialist LLM call.
    Returns list of UniversalInsight for sphere_id.
    """
    tag = f"user={user_id} sphere={sphere_id}" if user_id else f"sphere={sphere_id}"

    ctx = extract_sphere_context(chart, sphere_id)
    rag = await _retrieve_sphere_rag(ctx)

    system_prompt = SPECIALIST_PROMPT_TEMPLATE.format(
        sphere_num   = sphere_id,
        sphere_name  = SPHERE_NAMES[sphere_id],
        sphere_frame = SPHERE_FRAMES[sphere_id],
        min_ins      = ctx["_target_min"],
        max_ins      = ctx["_target_max"],
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
            max_completion_tokens=10000,
        )
        raw  = response.choices[0].message.content or ""
        if not raw.strip():
            raise ValueError(f"Empty response from LLM (finish_reason={response.choices[0].finish_reason})")
        data = json.loads(raw)
        if isinstance(data, list):
            data = {"insights": data}

        # Flatten nested inner_alchemy / outer_mechanics back to flat fields
        for ins_data in data.get("insights", []):
            ia = ins_data.pop("inner_alchemy", {})
            om = ins_data.pop("outer_mechanics", {})
            if ia:
                ins_data.setdefault("description", ia.get("description", ""))
                ins_data.setdefault("insight", ia.get("insight", ""))
                ins_data.setdefault("gift", ia.get("gift", ""))
                ins_data.setdefault("light_aspect", ia.get("light_aspect", ""))
                ins_data.setdefault("shadow_aspect", ia.get("shadow_aspect", ""))
                ins_data.setdefault("blind_spot", ia.get("blind_spot"))
            if om:
                ins_data.setdefault("energy_rhythm", om.get("energy_rhythm"))
                ins_data.setdefault("integration_key", om.get("integration_key", ""))
                ins_data.setdefault("crisis_anchor", om.get("crisis_anchor"))
                ins_data.setdefault("developmental_task", om.get("development_task") or om.get("developmental_task", ""))
                ins_data.setdefault("triggers", om.get("triggers", []))

        insights = SphereResponse(**data).insights

        # Enforce correct sphere_id on every insight
        for ins in insights:
            ins.primary_sphere = sphere_id

        logger.info(f"[{tag}] generated {len(insights)} insights")
        return insights

    except Exception as e:
        logger.error(f"[{tag}] attempt={attempt} failed: {e}")
        if attempt < 2:
            await asyncio.sleep(1)
            return await generate_sphere_insights(chart, sphere_id, attempt + 1, user_id)
        return []


# ─── Orchestrator ─────────────────────────────────────────────────────────────

async def _fallback_sphere_insights(sphere_id: int) -> list[UniversalInsight]:
    """
    Minimal fallback insight for a sphere that completely failed all retries.
    Ensures UISResponse coverage validator never crashes.
    """
    sphere_name = SPHERE_NAMES[sphere_id]
    return [UniversalInsight(
        primary_sphere   = sphere_id,
        influence_level  = "low",
        weight           = 0.10,
        position         = f"Сфера {sphere_id} — {sphere_name}",
        core_theme       = f"Анализ временно недоступен",
        description      = "Данные по этой сфере будут рассчитаны позже.",
        light_aspect     = "—",
        shadow_aspect    = "—",
        insight          = "Технический сбой при расчёте этой сферы. Попробуйте перегенерировать.",
        gift             = "—",
        developmental_task = "Повторная генерация",
        integration_key  = "Запустите пересчёт карты",
        triggers         = ["Технический сбой"],
        source           = None,
    )]


async def generate_insights(chart: dict, user_id: str = "") -> UISResponse:
    """
    Orchestrator: launches all 12 sphere workers simultaneously.
    Used for full-chart generation (initial build or full rebuild).

    Returns merged UISResponse with insights from all spheres.
    Guarantees all 12 spheres are present (fallback insight on hard failure).
    """
    logger.info(f"Orchestrator: launching 12 sphere agents in parallel (user={user_id or 'unknown'})")

    tasks = [
        generate_sphere_insights(chart, sphere_id, user_id=user_id)
        for sphere_id in range(1, 13)
    ]
    results: list = await asyncio.gather(*tasks, return_exceptions=True)

    all_insights: list[UniversalInsight] = []
    for sphere_id, result in enumerate(results, start=1):
        if isinstance(result, Exception):
            logger.error(f"Sphere {sphere_id} raised: {result}")
            all_insights.extend(await _fallback_sphere_insights(sphere_id))
            continue
        if not result:
            logger.warning(f"Sphere {sphere_id}: empty result after retries — using fallback")
            all_insights.extend(await _fallback_sphere_insights(sphere_id))
            continue
        all_insights.extend(result)

    logger.info(f"Orchestrator: total assembled = {len(all_insights)} insights")
    return UISResponse(insights=all_insights)
