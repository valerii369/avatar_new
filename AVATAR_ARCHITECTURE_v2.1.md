# AVATAR — Финальная архитектура системы
### Single Source of Truth · v2.1 · 2025

---

## Стек

| Слой | Решение |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind, Framer Motion, Zustand |
| Backend | Python 3.11+, FastAPI, SQLAlchemy Async, Uvicorn |
| База данных | Supabase (PostgreSQL + pgvector) |
| Векторный поиск | pgvector — book_chunks + user_memory |
| Геокодинг | Google Places API (фронт) → координаты → кэш в Supabase |
| Эмбеддинги | OpenAI text-embedding-3-small |
| LLM DSB | OpenAI GPT-4o |
| LLM Чат | OpenAI GPT-4o-mini |
| Астрология | pyswisseph, timezonefinder, pytz |
| Telegram | python-telegram-bot, TMA InitData validation |
| Деплой | Vercel (фронт), Timeweb VPS (бэкенд + бот) |

---

## DSB Pipeline — полная схема

```
POST /api/auth/profile
{ birth_date, birth_time, lat, lon, timezone, city_name }
        │
        ▼
initialize_onboarding_layer  (async background task)
        │
        ▼
╔══════════════════════════════════════════╗
║  LAYER 1 — CALCULATORS                  ║
║                                          ║
║  western_astrology_calculator.py         ║
║  ─────────────────────────────           ║
║  pyswisseph                              ║
║    → планеты, узлы, ASC/MC              ║
║    → дома Плацидус (Whole Sign fallback) ║
║    → аспекты + фигуры                   ║
║    → стихии, модальности, квадранты      ║
║    → деканаты, сабианы, стеллиумы       ║
║    → арабские точки, цепи диспозиторов  ║
║                                          ║
║  Выход: Rich JSON                        ║
║  { house_system, node_type,             ║
║    planets, aspects, patterns, ... }     ║
║                                          ║
║  TODO: human_design_calculator.py        ║
║  TODO: bazi_calculator.py               ║
║  TODO: tzolkin_calculator.py            ║
╚══════════════════╦═══════════════════════╝
                   │ Rich JSON
                   ▼
╔══════════════════════════════════════════╗
║  LAYER 2 — INTERPRETERS                 ║
║                                          ║
║  western_astrology_agent.py             ║
║  ─────────────────────────────           ║
║                                          ║
║  1. Query Builder (динамический)         ║
║     • личные планеты — всегда           ║
║     • соц/высшие — если знач. (дом/dig) ║
║     • аспекты топ-15 по weight          ║
║     • фигуры, стеллиумы                 ║
║     → ~30–45 запросов                   ║
║                                          ║
║  2. pgvector поиск книг                 ║
║     book_chunks WHERE                   ║
║       category = 'western_astrology'    ║
║       score ≥ 0.72                      ║
║       top_k = 4 на запрос              ║
║     → дедупликация → топ-10 чанков      ║
║                                          ║
║  3. Супер-промпт → GPT-4o              ║
║     system_prompt + Rich JSON + чанки   ║
║     json_object mode, temp = 0.4        ║
║                                          ║
║  4. Pydantic UISResponse validation     ║
║     60–100 объектов, все 12 сфер        ║
║     ретрай ×2 при ошибке (temp=0.2)    ║
║     провал → лог в uis_errors           ║
║                                          ║
║  TODO: human_design_agent.py            ║
║  TODO: bazi_agent.py                   ║
║  TODO: tzolkin_agent.py                ║
╚══════════════════╦═══════════════════════╝
                   │ list[UniversalInsight]
                   ▼
╔══════════════════════════════════════════╗
║  LAYER 3 — SYNTHESIS  (чистый код)      ║
║                                          ║
║  synthesize(insights) — никакого LLM    ║
║                                          ║
║  Группировка:                            ║
║    system → primary_sphere → [карточки] ║
║                                          ║
║  {                                       ║
║    "western_astrology": {               ║
║       1: [ins, ins, ...],  ← Личность   ║
║       2: [ins, ...],       ← Ресурсы    ║
║       7: [ins, ins, ins],  ← Отношения  ║
║       ...12 сфер           ║
║    },                                    ║
║    "human_design": { 1:[...], ... },    ║
║    "bazi":         { 1:[...], ... },    ║
║    "tzolkin":      { 1:[...], ... },    ║
║  }                                       ║
║                                          ║
║  Сортировка внутри каждой сферы:        ║
║    (influence_level, -weight)           ║
║    high → medium → low                  ║
║    при равном уровне: weight по убыв.   ║
║                                          ║
║  Сохранение в Supabase:                 ║
║    INSERT INTO user_insights (...)      ║
║    по одной строке на каждый инсайт     ║
╚══════════════════╦═══════════════════════╝
                   │
                   ▼
        Digital Soul Blueprint
        готов к рендеру на фронтенде
```

### Код Layer 3

```python
from collections import defaultdict
from typing import Literal

def synthesize(insights: list[UniversalInsight]) -> dict:
    level_order = {"high": 0, "medium": 1, "low": 2}

    # система → сфера → карточки
    result = defaultdict(lambda: defaultdict(list))
    for ins in insights:
        result[ins.system][ins.primary_sphere].append(ins)

    # сортировка карточек внутри каждой сферы
    for system in result:
        for sphere_id in result[system]:
            result[system][sphere_id].sort(
                key=lambda x: (level_order[x.influence_level], -x.weight)
            )

    return result


async def save_to_supabase(user_id: str, result: dict):
    rows = []
    for system, spheres in result.items():
        for sphere_id, insights in spheres.items():
            for rank, ins in enumerate(insights):
                rows.append({
                    "user_id":            user_id,
                    "system":             system,
                    "primary_sphere":     sphere_id,
                    "rank":               rank,          # позиция внутри сферы
                    **ins.model_dump()
                })
    await supabase.table("user_insights").insert(rows).execute()
```

---

## UIS v2 — единая схема объекта

Одна схема для всех систем (астрология, HD, BaZi, Цолькин).

```python
System = Literal["western_astrology", "human_design", "bazi", "tzolkin"]
PrimarySphere  = Literal[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
InfluenceLevel = Literal["high", "medium", "low"]

class UniversalInsight(BaseModel):
    # --- маршрутизация ---
    system:               System
    primary_sphere:       PrimarySphere
    influence_level:      InfluenceLevel
    weight:               float = Field(..., ge=0.0, le=1.0)

    # --- астро-источник ---
    position:             str = Field(..., min_length=3,  max_length=150)

    # --- контент карточки ---
    core_theme:           str = Field(..., min_length=5,  max_length=120)
    energy_description:   str = Field(..., min_length=30, max_length=400)
    light_aspect:         str = Field(..., min_length=20, max_length=300)
    shadow_aspect:        str = Field(..., min_length=20, max_length=300)
    developmental_task:   str = Field(..., min_length=10, max_length=200)
    integration_key:      str = Field(..., min_length=10, max_length=200)
    triggers:             list[str] = Field(..., min_length=2, max_length=6)
    source:               str | None = None

    @field_validator("weight")
    def round_weight(cls, v): return round(v, 2)


class UISResponse(BaseModel):
    insights: list[UniversalInsight] = Field(..., min_length=60, max_length=100)

    @field_validator("insights")
    def check_coverage(cls, ins):
        from collections import Counter
        counts = Counter(i.primary_sphere for i in ins)
        thin = [s for s in range(1, 13) if counts.get(s, 0) < 3]
        if thin:
            raise ValueError(f"Менее 3 инсайтов в сферах: {thin}")
        return ins
```

### Формула weight

```
base = 0.5
+ 0.20  личная планета (Солнце, Луна, Меркурий, Венера, Марс)
+ 0.15  угловой дом (1, 4, 7, 10)
+ 0.10  точный аспект (orb < 1.0°)
+ 0.10  dignity_score ≥ 4  (обитель / экзальтация)
+ 0.10  dignity_score ≤ −4 (изгнание / падение)
− 0.05  планета ретроградна
→ clip(0.0, 1.0), round(2)

influence_level:
  "high"   → weight ≥ 0.75
  "medium" → weight 0.45–0.74
  "low"    → weight < 0.45
```

---

## 12 сфер — реестр

| primary_sphere | Название | sphere_key |
|---|---|---|
| 1 | Личность и имидж | `identity` |
| 2 | Ресурсы и финансы | `money` |
| 3 | Мышление и речь | `mind` |
| 4 | Семья и корни | `family` |
| 5 | Творчество и дети | `creativity` |
| 6 | Тело и здоровье | `health` |
| 7 | Отношения и партнёрство | `relationships` |
| 8 | Трансформация и власть | `transformation` |
| 9 | Смысл и мировоззрение | `spirituality` |
| 10 | Карьера и репутация | `career` |
| 11 | Социум и миссия | `social` |
| 12 | Тень и бессознательное | `shadow` |

---

## Supabase — схема таблиц

```sql
-- Кэш геокодера
CREATE TABLE geocode_cache (
    city_name   TEXT PRIMARY KEY,
    lat         FLOAT NOT NULL,
    lon         FLOAT NOT NULL,
    timezone    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Астрологические книги + книги по HD/BaZi/etc
CREATE TABLE book_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT NOT NULL,
    source      TEXT NOT NULL,
    category    TEXT NOT NULL,  -- 'western_astrology' | 'human_design' | ...
    embedding   vector(1536) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON book_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Инсайты пользователя (выход DSB Pipeline)
CREATE TABLE user_insights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    system              TEXT NOT NULL,
    primary_sphere      INT  NOT NULL CHECK (primary_sphere BETWEEN 1 AND 12),
    rank                INT  NOT NULL,
    influence_level     TEXT NOT NULL,
    weight              FLOAT NOT NULL,
    position            TEXT NOT NULL,
    core_theme          TEXT NOT NULL,
    energy_description  TEXT NOT NULL,
    light_aspect        TEXT NOT NULL,
    shadow_aspect       TEXT NOT NULL,
    developmental_task  TEXT NOT NULL,
    integration_key     TEXT NOT NULL,
    triggers            JSONB NOT NULL,
    source              TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON user_insights (user_id, system, primary_sphere);

-- Память Assistant Agent
CREATE TABLE user_memory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    sphere_id   INT,
    embedding   vector(1536) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON user_memory
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Лог ошибок валидации UIS
CREATE TABLE uis_errors (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID,
    raw_json      TEXT,
    error_message TEXT,
    attempt       INT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Геокодинг — итоговая схема

```
Фронтенд (онбординг)
  Google Places API → автокомплит → lat / lon / timezone
  POST /api/auth/profile { birth_date, birth_time,
                           lat, lon, timezone, city_name }
        ↓
Бэкенд
  SELECT * FROM geocode_cache WHERE city_name = ?
  → попал в кэш: берём координаты
  → не попал: сохраняем { city_name, lat, lon, timezone }
        ↓
  lat / lon / timezone → pyswisseph
```

Бэкенд не делает внешних геозапросов. Только принимает и кэширует.

---

## Assistant Agent

```
Сообщение пользователя
        ↓
text-embedding-3-small → вектор запроса
        ↓
pgvector поиск: user_memory WHERE user_id = ?
  top_k = 5, cosine similarity
        ↓
Контекст: релевантные прошлые сообщения
        + DSB summary (sphere coverage)
        ↓
GPT-4o-mini → ответ
        ↓
Новое сообщение → эмбеддинг → INSERT user_memory
  { user_id, content, sphere_id, embedding }
```

---

## Фронтенд — рендер карточек

Фронтенд читает `user_insights` и рендерит без дополнительной логики:

```
GET /api/portraits/:user_id
→ { western_astrology: { 1: [...], 2: [...], ...12 },
    human_design:      { 1: [...], ... } }

MasterHubView.tsx
  → таб по системам (western / HD / BaZi / ...)
  → 12 сфер внутри каждой системы
  → карточки отсортированы по rank (уже в БД)
```

| Поле UIS | UI-блок |
|---|---|
| `primary_sphere` | Заголовок раздела сферы |
| `influence_level` + `weight` | Бейдж важности |
| `position` | Астро-маркер (серый) |
| `core_theme` | Заголовок карточки |
| `energy_description` | Блок "Энергия" |
| `light_aspect` | Блок "Свет / Дар" |
| `shadow_aspect` | Блок "Тень / Ловушка" |
| `developmental_task` | Блок "Задача" |
| `integration_key` | Блок "Ключ" (CTA) |
| `triggers` | Теги-ситуации |
| `source` | Сноска |

---

## Целевое распределение инсайтов на систему

| primary_sphere | Сфера | Минимум | Цель |
|---|---|---|---|
| 1 | Личность | 5 | 8–10 |
| 2 | Ресурсы | 3 | 4–6 |
| 3 | Мышление | 3 | 5–7 |
| 4 | Семья | 3 | 5–7 |
| 5 | Творчество | 3 | 4–6 |
| 6 | Здоровье | 3 | 4–5 |
| 7 | Отношения | 5 | 7–9 |
| 8 | Трансформация | 4 | 6–8 |
| 9 | Смысл | 3 | 4–6 |
| 10 | Карьера | 4 | 6–8 |
| 11 | Социум | 3 | 4–6 |
| 12 | Тень | 5 | 7–9 |
| | **Итого** | **44** | **60–100** |

---

## Roadmap систем

| Система | Layer 1 | Layer 2 | book_chunks category |
|---|---|---|---|
| Western Astrology | Готово | Готово | `western_astrology` |
| Дизайн Человека | TODO | TODO | `human_design` |
| BaZi | TODO | TODO | `bazi` |
| Цолькин | TODO | TODO | `tzolkin` |

UIS v2 схема и Layer 3 synthesis — одинаковые для всех систем.

---

*AVATAR | Single Source of Truth | v2.1 | Confidential*
