# AVATAR — RAG Интерпретационный Пайплайн
### Финальная архитектура · western_astrology_agent.py
`v2.0 | 2025`

---

## Обзор

Агент принимает Rich JSON от астрологического калькулятора, находит релевантные цитаты из книг через Qdrant, формирует супер-промпт и возвращает 60–100 атомарных инсайтов (UIS) с привязкой к одной из 12 сфер профиля.

```
Rich JSON (калькулятор)
        ↓
Query Builder (динамический лимит)
        ↓
Qdrant → топ-4 чанка / запрос → score filter ≥ 0.72 → топ-10 уникальных
        ↓
Супер-промпт (system + JSON + чанки)
        ↓
OpenAI json_object → Pydantic валидация
        ↓
UIS массив: 60–100 инсайтов × 12 сфер
```

---

## 12 сфер профиля AVATAR

| ID | Сфера | Описание |
|---|---|---|
| `identity` | Личность и "Я" | Ядро личности, самовыражение, эго-структура |
| `shadow` | Тень и бессознательное | Вытесненные паттерны, страхи, скрытые ресурсы |
| `relationships` | Отношения | Партнёрство, близость, проекции |
| `career` | Карьера и призвание | Профессиональная реализация, миссия |
| `money` | Деньги и ресурсы | Материальная сфера, ценности, безопасность |
| `family` | Семья и корни | Родовые паттерны, детство, дом |
| `health` | Тело и здоровье | Физическое состояние, психосоматика |
| `spirituality` | Духовность | Смысл, вера, связь с высшим |
| `mind` | Мышление и речь | Интеллект, коммуникация, обучение |
| `creativity` | Творчество | Самовыражение, игра, дети |
| `social` | Социум и репутация | Публичный образ, статус, влияние |
| `transformation` | Трансформация | Кризисы, смерть/возрождение, власть |

---

## Шаг 1 — Query Builder (динамический)

Запросы формируются по приоритету — не жёстким топ-20, а по весу влияния элемента.

### Приоритеты формирования запросов

```python
def build_queries(chart: dict) -> list[str]:
    queries = []

    # 1. Личные планеты — всегда (10 запросов)
    personal = ["sun", "moon", "mercury", "venus", "mars", "asc", "mc",
                "north_node", "chiron", "lilith"]
    for planet in personal:
        p = chart["planets"].get(planet)
        if p:
            queries.append(f"{planet} in {p['sign']} in {p['house']} house")

    # 2. Социальные и высшие планеты — если dignity_score != 0 или угловой дом
    for planet in ["jupiter", "saturn", "uranus", "neptune", "pluto"]:
        p = chart["planets"].get(planet)
        if p and (abs(p["dignity_score"]) >= 2 or p["house"] in [1, 4, 7, 10]):
            queries.append(f"{planet} in {p['sign']} in {p['house']} house")

    # 3. Аспекты — сортировка по influence_weight, берём топ-15
    aspects_sorted = sorted(
        chart["aspects"], key=lambda a: a["influence_weight"], reverse=True
    )
    for asp in aspects_sorted[:15]:
        queries.append(f"{asp['planet_a']} {asp['type']} {asp['planet_b']}")

    # 4. Аспектные фигуры — каждая фигура = отдельный запрос
    for fig in chart.get("aspect_patterns", []):
        queries.append(f"aspect pattern {fig}")

    # 5. Стеллиумы
    for st in chart.get("stelliums", []):
        queries.append(f"stellium in {st.get('sign') or st.get('house')}")

    # 6. Критические градусы
    for planet in chart.get("critical_degrees", []):
        p = chart["planets"][planet]
        queries.append(f"critical degree {round(p['degree_in_sign'])} {p['sign']}")

    return queries  # обычно 30–45 запросов
```

---

## Шаг 2 — Qdrant с фильтрацией по score

```python
async def retrieve_context(queries: list[str], qdrant_client) -> list[dict]:
    MIN_SCORE = 0.72
    TOP_K_PER_QUERY = 4

    results = []
    tasks = [
        qdrant_client.search(
            collection_name="books_western_astrology",
            query_vector=embed(q),
            limit=TOP_K_PER_QUERY,
            score_threshold=MIN_SCORE
        )
        for q in queries
    ]
    raw = await asyncio.gather(*tasks)

    seen_ids = set()
    scored = []
    for hits in raw:
        for hit in hits:
            if hit.id not in seen_ids:
                seen_ids.add(hit.id)
                scored.append({
                    "text": hit.payload["text"],
                    "source": hit.payload["source"],
                    "score": hit.score
                })

    # сортировка по score, берём топ-10
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:10]
```

Каждый чанк несёт: `text`, `source` (автор + книга), `score`. Чанки ниже 0.72 отрезаются до попадания в промпт.

---

## Шаг 3 — Супер-промпт

### System prompt (western_astrology.txt) — ключевые инструкции

```
Ты астрологический интерпретатор. Твоя задача — создать 60–100 атомарных
психологических инсайтов на основе натальной карты и фрагментов из книг.

ПРАВИЛА:
- Каждый инсайт = одна конкретная смысловая единица, не абзац
- Каждый инсайт обязательно привязан к одной из 12 сфер (sphere_id)
- Распределение по сферам: не менее 3 инсайтов на сферу
- Опирайся на предоставленные книжные фрагменты — они приоритет
- НЕ выдумывай трактовки без астрологического триггера

ФОРМУЛА influence_weight:
  base = 1.0
  если аспект точный (orb < 1°): +0.2
  если планета в угловом доме (1,4,7,10): +0.15
  если dignity_score >= 4 (обитель/экзальтация): +0.1
  если dignity_score <= -4 (изгнание/падение): +0.1
  если планета ретроградна: -0.05
  итог нормализуется к диапазону 0.0–1.0

Возвращай ТОЛЬКО валидный JSON массив. Никакого текста вне массива.
```

### Структура вызова LLM

```python
response = await openai_client.chat.completions.create(
    model="gpt-4o",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps({
            "chart": chart_json,
            "book_context": [
                {"text": c["text"], "source": c["source"]}
                for c in context_chunks
            ]
        }, ensure_ascii=False)}
    ],
    temperature=0.4,   # низкая температура = стабильный структурированный вывод
    max_tokens=8000
)
```

---

## Шаг 4 — Валидация UIS через Pydantic

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal

SPHERE_IDS = Literal[
    "identity", "shadow", "relationships", "career", "money",
    "family", "health", "spirituality", "mind", "creativity",
    "social", "transformation"
]

class UniversalInsight(BaseModel):
    sphere_id: SPHERE_IDS
    trigger: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=20, max_length=600)
    influence_weight: float = Field(..., ge=0.0, le=1.0)
    source: str | None = None  # автор + книга из Qdrant чанка

    @field_validator("influence_weight")
    def round_weight(cls, v):
        return round(v, 2)

class UISResponse(BaseModel):
    insights: list[UniversalInsight] = Field(..., min_length=60, max_length=100)

    @field_validator("insights")
    def check_sphere_coverage(cls, insights):
        spheres = {i.sphere_id for i in insights}
        all_spheres = {
            "identity", "shadow", "relationships", "career", "money",
            "family", "health", "spirituality", "mind", "creativity",
            "social", "transformation"
        }
        missing = all_spheres - spheres
        if missing:
            raise ValueError(f"Отсутствуют сферы: {missing}")
        return insights

def parse_uis(raw_json: str) -> UISResponse:
    data = json.loads(raw_json)
    # LLM может вернуть {"insights": [...]} или просто [...]
    if isinstance(data, list):
        data = {"insights": data}
    return UISResponse(**data)
```

Если валидация падает — логируем и повторяем запрос с температурой 0.2 (до 2 ретраев).

---

## Выходной формат — пример UIS массива

```json
{
  "insights": [
    {
      "sphere_id": "identity",
      "trigger": "Солнце в Овне в 1 доме",
      "description": "Личность выстраивается через действие и инициативу. Человек воспринимает себя через то, что он делает, а не через то, кем является. Высокая потребность быть первым и видимым.",
      "influence_weight": 0.95,
      "source": "Liz Greene — Saturn: A New Look at an Old Devil"
    },
    {
      "sphere_id": "shadow",
      "trigger": "Луна квадрат Сатурн, орб 2.1°",
      "description": "Подавленная потребность в эмоциональной поддержке. В детстве тепло было условным — нужно было заслужить. Во взрослом возрасте — страх быть обузой, самодостаточность как защита.",
      "influence_weight": 0.88,
      "source": "Howard Sasportas — The Gods of Change"
    },
    {
      "sphere_id": "relationships",
      "trigger": "Венера в Скорпионе в 7 доме",
      "description": "В партнёрстве ищет полное слияние или не ищет ничего. Отношения переживаются как трансформация. Ревность и контроль — защитный механизм от страха потери.",
      "influence_weight": 0.91,
      "source": "Stephen Arroyo — Astrology, Karma and Transformation"
    },
    {
      "sphere_id": "career",
      "trigger": "Солнце трин Юпитер, MC в Козероге",
      "description": "Природная способность к лидерству в структурированных системах. Карьера строится медленно, но с ощущением правильности каждого шага. Репутация важнее скорости.",
      "influence_weight": 0.82,
      "source": "Liz Greene — The Astrology of Fate"
    },
    {
      "sphere_id": "money",
      "trigger": "Юпитер в 2 доме, Венера управитель 2 дома",
      "description": "Деньги приходят через расширение и щедрость, а не через накопление. Риск переоценить ресурсы. Материальная безопасность связана с самооценкой.",
      "influence_weight": 0.74,
      "source": null
    },
    {
      "sphere_id": "family",
      "trigger": "Луна в 4 доме, Сатурн квинкункс IC",
      "description": "Семья воспринималась как место долга, а не безопасности. Один из родителей был эмоционально недоступен или требователен. Паттерн — брать ответственность за других раньше времени.",
      "influence_weight": 0.86,
      "source": "Howard Sasportas — The Twelve Houses"
    },
    {
      "sphere_id": "health",
      "trigger": "Марс в Деве в 6 доме, ретроградный",
      "description": "Энергия тела накапливается внутри и не находит выхода. Склонность к психосоматике в области пищеварения и нервной системы. Перфекционизм как источник хронического стресса.",
      "influence_weight": 0.79,
      "source": "Reinhold Ebertin — The Combination of Stellar Influences"
    },
    {
      "sphere_id": "spirituality",
      "trigger": "Нептун в 12 доме, Юпитер трин ASC",
      "description": "Духовный опыт приходит через растворение границ эго — медитация, творчество, уединение. Сильная интуиция, которой человек не всегда доверяет. Склонность к мистическому мировоззрению.",
      "influence_weight": 0.77,
      "source": "Liz Greene — The Astrological Neptune"
    },
    {
      "sphere_id": "mind",
      "trigger": "Меркурий в Близнецах, секстиль Уран",
      "description": "Быстрый нелинейный ум. Схватывает концепции мгновенно, но с трудом доводит до завершения. Оригинальность мышления — сильная сторона. Рассеянность — теневая.",
      "influence_weight": 0.83,
      "source": "Stephen Arroyo — Chart Interpretation Handbook"
    },
    {
      "sphere_id": "creativity",
      "trigger": "Солнце секстиль Нептун, 5 дом в Льве",
      "description": "Творческое самовыражение через образы и нарратив. Способность создавать атмосферу и захватывать внимание. Риск — идеализировать творческий процесс и бояться несовершенного результата.",
      "influence_weight": 0.71,
      "source": null
    },
    {
      "sphere_id": "social",
      "trigger": "Сатурн в 10 доме, MC в Козероге",
      "description": "Публичный образ строится через компетентность и время. Авторитет приходит позже, чем хочется. Окружающие воспринимают человека как надёжного и серьёзного — иногда в ущерб теплоте.",
      "influence_weight": 0.85,
      "source": "Liz Greene — Saturn: A New Look at an Old Devil"
    },
    {
      "sphere_id": "transformation",
      "trigger": "Плутон в 8 доме, оппозиция Луна",
      "description": "Жизнь организована вокруг трансформации через потерю. Кризисы — не случайность, а механизм роста. Глубокий страх уязвимости при одновременной тяге к интенсивным переживаниям.",
      "influence_weight": 0.93,
      "source": "Howard Sasportas — The Gods of Change"
    }
  ]
}
```

> Полный массив содержит 60–100 объектов. Выше — по одному примеру на каждую из 12 сфер.

---

## Гарантии покрытия сфер

Pydantic-валидатор проверяет:
- Минимум 60, максимум 100 инсайтов
- Все 12 `sphere_id` присутствуют хотя бы по 1 разу
- Каждый `influence_weight` в диапазоне 0.0–1.0
- `trigger` не пустой, `description` минимум 20 символов

При провале валидации — ретрай с температурой 0.2, до 2 попыток. При втором провале — логируем в Supabase таблицу `uis_errors` с raw_json для ручного разбора.

---

## Распределение инсайтов по сферам (целевое)

| Сфера | Минимум | Типично |
|---|---|---|
| `identity` | 6 | 8–10 |
| `shadow` | 5 | 7–9 |
| `relationships` | 6 | 8–10 |
| `career` | 5 | 6–8 |
| `money` | 3 | 4–6 |
| `family` | 4 | 5–7 |
| `health` | 3 | 4–5 |
| `spirituality` | 4 | 5–7 |
| `mind` | 5 | 6–8 |
| `creativity` | 3 | 4–6 |
| `social` | 4 | 5–7 |
| `transformation` | 5 | 6–8 |

Целевые значения фиксированы в system prompt как инструкция распределения.

---

## Стек

| Компонент | Решение |
|---|---|
| Векторная БД | Qdrant, коллекция `books_western_astrology` |
| Эмбеддинги | OpenAI `text-embedding-3-small` |
| LLM | GPT-4o, `json_object` mode, temperature 0.4 |
| Валидация | Pydantic v2, схема `UISResponse` |
| Хранение ошибок | Supabase таблица `uis_errors` |
| Qdrant порог | `score_threshold=0.72` |
| Чанков на запрос | 4 (было 2) |
| Финальный контекст | топ-10 по score |

---

*AVATAR | RAG Interpretation Pipeline | Final Architecture | Confidential*
