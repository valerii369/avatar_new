# AVATAR v2.0 — Полная Архитектура

## Оглавление
1. [Технологический стек](#технологический-стек)
2. [Структура проекта](#структура-проекта)
3. [Frontend](#frontend)
4. [Backend](#backend)
5. [DSB Pipeline (3 слоя)](#dsb-pipeline-3-слоя)
6. [RAG & Ассистент](#rag--ассистент)
7. [База данных](#база-данных)
8. [Аутентификация](#аутентификация)
9. [12 Сфер](#12-сфер)
10. [Модель UniversalInsight (UIS)](#модель-universalinsight-uis)
11. [Поток данных](#поток-данных)
12. [Конфигурация](#конфигурация)

---

## Технологический стек

| Компонент | Технология |
|-----------|-----------|
| **Frontend** | Next.js 15 + React 19 + TypeScript + Tailwind CSS v4 + Framer Motion + Zustand |
| **Backend** | Python 3.11+ + FastAPI + Uvicorn |
| **База данных** | Supabase (PostgreSQL + pgvector) |
| **LLM** | OpenAI GPT-4o (DSB-интерпретация), GPT-4o-mini (чат, портрет) |
| **Embeddings** | OpenAI text-embedding-3-small (размер вектора: 1536) |
| **Астрология** | pyswisseph + timezonefinder + pytz |
| **Telegram** | @twa-dev/sdk (Mini App) |
| **Деплой** | Vercel (frontend) + Timeweb VPS (backend) |

---

## Структура проекта

```
AVATARv2.0/
├── frontend/
│   ├── src/
│   │   ├── app/                   — Next.js App Router страницы
│   │   ├── components/            — React-компоненты
│   │   └── lib/                   — API, store, хуки, константы
│   ├── public/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py                — FastAPI app + CORS + pyswisseph init
│   │   ├── core/                  — config, db
│   │   ├── api/                   — роуты (auth, portraits, assistant, extras)
│   │   ├── models/                — Pydantic-модели
│   │   └── services/              — dsb/, rag/
│   ├── ephe/                      — эфемериды pyswisseph
│   └── requirements.txt
└── ARCHITECTURE.md
```

---

## Frontend

### Структура директорий

```
frontend/src/
├── app/
│   ├── page.tsx                   — Главная (хаб + портрет)
│   ├── onboarding/page.tsx        — Сбор данных рождения
│   ├── your-world/page.tsx        — MasterHubView: 12 сфер
│   ├── assistant/page.tsx         — RAG-чат с DSB-контекстом
│   ├── diary/page.tsx             — Дневник
│   └── profile/page.tsx           — Профиль
├── components/
│   ├── InsightCard.tsx            — Карточка одного инсайта
│   ├── InsightDetailModal.tsx     — Полный просмотр инсайта
│   ├── SphereFilter.tsx           — Табы по сферам
│   ├── BottomNav.tsx              — Нижняя навигация
│   ├── EnergyIcon.tsx             — Визуализация энергии
│   └── Skeleton.tsx               — Скелетон-загрузка
└── lib/
    ├── api.ts                     — Axios клиент + перехватчики
    ├── store.ts                   — Zustand: user + insights
    ├── constants.ts               — SPHERES, цвета, иконки
    └── hooks/
        └── useAudio.ts            — Голосовая запись
```

### State Management (Zustand, хранится в localStorage)

**useUserStore**
- `userId, tgId, firstName, photoUrl, token`
- `onboardingDone, energy, streak, evolutionLevel, title, xp, referralCode`
- Методы: `setUser()`, `reset()`, `setAssistantMessages()`

**useInsightsStore**
- `insights: Insight[]` — плоский массив всех инсайтов
- `activeSphere: number | null` — активный фильтр по сфере

### API-интеграция (axios, автоматический Bearer-токен)

```typescript
authAPI       → /api/auth/login, /api/auth/profile, /api/auth/reset
calcAPI       → /api/auth/geocode, /api/auth/calculate
masterHubAPI  → /api/portraits/:user_id
assistantAPI  → /api/assistant/init, /api/assistant/chat, /api/assistant/finish
diaryAPI      → /api/diary (list, get, delete, updateIntegration)
voiceAPI      → /api/assistant/transcribe
```

### Ключевые страницы

**HomePage (`page.tsx`)**
- Инициализация Telegram Mini App + авторизация
- Поллинг профиля (5с) пока DSB-пайплайн работает
- Отображает энергию, XP, уровень эволюции
- Редирект на `/onboarding` если `onboarding_done = false`

**Onboarding (`onboarding/page.tsx`)**
- Многошаговая форма: дата/время рождения + голосовая запись
- Google Places autocomplete для локации
- `POST /api/auth/geocode` → `POST /api/auth/calculate` (background task)
- Поллинг до готовности портрета

**Your World (`your-world/page.tsx`) — MasterHubView**
- 3 таба: `portrait` | `breakdown` | `sides`
- **Portrait**: Ключевая карточка идентичности + сильные стороны/тени + распределение по сферам
- **Breakdown**: 12 сфер + коллапсируемые списки инсайтов (по убыванию влияния)
- Фильтр систем: "АСТРО" + будущие системы (Human Design, Bazi и др.)

**Assistant (`assistant/page.tsx`)**
- Сессионный чат с голосовым вводом
- RAG-обогащённые ответы на основе DSB-данных пользователя
- Сохранение сессии в дневник

---

## Backend

### Структура директорий

```
backend/app/
├── main.py                        — FastAPI app, CORS, pyswisseph init
├── core/
│   ├── config.py                  — pydantic-settings (env vars)
│   └── db.py                      — get_supabase() клиент
├── api/
│   ├── auth.py                    — login, profile, geocode, calculate
│   ├── portraits.py               — GET insights + portrait summary
│   ├── assistant.py               — chat, сессии, RAG, transcribe
│   └── extras.py                  — diary, game, payments (стабы)
├── models/
│   └── uis.py                     — UniversalInsight + UISResponse Pydantic
└── services/
    ├── dsb/
    │   ├── natal_chart.py         — Слой 1: pyswisseph расчёты
    │   ├── western_astrology_agent.py — Слой 2: RAG + GPT-4o
    │   └── synthesis.py           — Слой 3: синтез + save_to_supabase
    └── rag/
        └── user_rag.py            — Индексация DSB + ретриeval для чата
```

### FastAPI роуты

```
/api/auth
  POST /login              — TMA / dev mode, upsert user
  GET  /profile            — профиль + birth data + onboarding status
  POST /geocode            — город → lat/lon/timezone (Nominatim + кэш)
  POST /calculate          — запуск DSB Pipeline (background task)

/api/portraits
  GET  /{user_id}          — инсайты + portrait summary

/api/assistant
  GET  /init/{user_id}     — создать сессию + DSB-индексацию
  POST /chat               — сообщение → RAG → ответ GPT
  POST /finish             — завершить сессию
  POST /diary/save         — сохранить сессию в дневник
  POST /transcribe         — audio blob → OpenAI Whisper

/api/diary
  GET  /                   — список записей
  GET  /{entryId}          — одна запись
  DELETE /{entryId}        — удалить
  PATCH /{entryId}/integration — отметить интеграцию
```

---

## DSB Pipeline (3 слоя)

### Слой 1: Калькулятор (`natal_chart.py`)

**Вход**: `birth_date, birth_time, lat, lon, timezone`

**Вычисляет**:
- **Планеты**: позиция в зодиаке + дом + ретроградность + dignity score
- **Дома**: система Плацидуса (fallback: Whole Sign)
- **Аспекты**: 10 мажорных/минорных аспектов с орбами и точностью
- **Дигнитеты**: +5 домицилий, +4 экзальтация, -5 детримент, -4 падение
- **Паттерны**: стеллиумы, критические градусы, конфигурации (T-квадрат, Большой Трин и др.)
- **Темы**: элементы (огонь/земля/воздух/вода), модальности, квадранты

**Выход**: Богатый JSON:
```json
{
  "planets": {
    "sun": {"sign": "Leo", "degree": 15.23, "house": 1, "retrograde": false, "dignity_score": 5}
  },
  "aspects": [
    {"planet_a": "sun", "planet_b": "moon", "type": "conjunction", "orb": 2.5, "influence_weight": 0.95}
  ],
  "patterns": ["stellium_in_7th", "t_square"]
}
```

---

### Слой 2: Интерпретатор (`western_astrology_agent.py`)

**Вход**: Rich JSON из Слоя 1

**Шаг 1 — Построение запросов (30–45 семантических запросов)**:
- Личные планеты: Sun, Moon, Mercury, Venus, Mars, ASC, MC, North Node, Chiron, Lilith
- Высшие планеты (если значимые): Jupiter, Saturn, Uranus, Neptune, Pluto
- Топ-15 аспектов по весу влияния
- Стеллиумы, критические градусы, паттерны

**Шаг 2 — RAG Retrieval**:
```
embed(query) → pgvector поиск в book_chunks
→ фильтр: category = 'western_astrology'
→ порог схожести ≥ 0.72
→ топ-4 чанка на запрос → дедупликация → топ-10 чанков суммарно
```

**Шаг 3 — GPT-4o генерация**:
- Режим: `json_object`
- Температура: 0.4
- Вход: JSON карты + контекст книг + системный промпт
- Выход: 60–100 объектов `UniversalInsight`

**Шаг 4 — Валидация и retry**:
- Pydantic UISResponse валидация
- Минимум 12 сфер
- Retry ×2 при ошибке (temp=0.2)
- Ошибки логируются в таблицу `uis_errors`

---

### Слой 3: Синтез (`synthesis.py`)

**Вход**: `list[UniversalInsight]`

**Процесс**:
1. Группировка по `system → primary_sphere`
2. Сортировка внутри сферы по `(influence_level, -weight)`:
   - `"high"` (0) → `"medium"` (1) → `"low"` (2)
   - Внутри уровня: по убыванию weight
3. Присвоение rank (позиция внутри сферы)
4. Сохранение в `user_insights`

**Выход**:
```python
{
  "western_astrology": {
    1: [insight1, insight2, ...],
    2: [...],
    ...,
    12: [...]
  }
}
```

### Портретное резюме

После Слоя 3, GPT-4o-mini генерирует высокоуровневый портрет:
- `core_identity` — 1 фраза: суть души
- `core_archetype` — заголовок-архетип (напр. "Cosmic Architect")
- `narrative_role` — универсальная роль
- `energy_type` — доминирующая вибрация
- `current_dynamic` — что сейчас интегрируется
- `polarities.core_strengths` / `polarities.shadow_aspects`

Сохраняется в таблицу `user_portraits`.

---

## RAG & Ассистент

### Индексация DSB (`user_rag.py`)

**Когда запускается**:
- Первый заход пользователя в чат (background task)
- По запросу через `GET /api/assistant/init/{user_id}`

**Что индексируется** (чанки с эмбеддингами → `user_memory`):
- `dsb:birth` — данные рождения: дата, время, место, пол
- `dsb:portrait` — портрет: архетип, роль, энергия, полярности
- `dsb:insight_s1` … `dsb:insight_s12` — по одному чанку на инсайт

**Формат чанка**:
```python
{
  "role": "dsb:insight_s7",
  "message": "Сфера 7 (Партнёрство) | Тема: ... | Свет: ... | Тень: ...",
  "embedding": vector(1536)
}
```

### Поток чата (`assistant.py`)

**1. Init сессии** (`GET /api/assistant/init/{user_id}`):
- Создать in-memory сессию `{user_id, messages, created_at}`
- Запустить DSB-индексацию в фоне
- Загрузить краткий портрет → сгенерировать приветствие
- Вернуть `{session_id, is_first_touch, ai_response}`

**2. Chat-сообщение** (`POST /api/assistant/chat`):
```
Сообщение пользователя
  → embed(message)
  → pgvector поиск в user_memory (фильтр: role начинается с "dsb:")
  → топ-6 чанков → форматировать как контекст
  → системный промпт (base + RAG контекст) + история сообщений
  → GPT-4o-mini
  → ответ ассистента
```

**3. Finish** (`POST /api/assistant/finish`):
- Взять сообщения сессии
- Сгенерировать резюме сессии
- Сохранить в diary

### Системный промпт ассистента

Ядро: "Лучший друг — умный, тёплый, честный"
- Психологические знания (Jung, Freud и др.)
- Помощь с отношениями, работой, страхами, смыслом
- Активно слушает, задаёт точные вопросы
- Использует DSB-данные пользователя точечно (не пересказывает весь профиль)
- Говорит как друг, без шаблонов
- Мягко указывает на паттерны, если замечает их

---

## База данных

### Схема таблиц

**users**
```sql
id UUID PK
tg_id TEXT UNIQUE
first_name, last_name, username, photo_url TEXT
xp, xp_current, xp_next INT
evolution_level INT, title TEXT
energy INT, streak INT, referral_code TEXT
onboarding_done BOOLEAN DEFAULT false
created_at, updated_at TIMESTAMPTZ
```

**user_birth_data**
```sql
id UUID PK
user_id TEXT FK → users
birth_date DATE (YYYY-MM-DD)
birth_time TEXT (HH:MM)
birth_place TEXT
gender TEXT
```

**geocode_cache**
```sql
city_name TEXT PK
lat, lon FLOAT
timezone TEXT
created_at TIMESTAMPTZ
```

**book_chunks** — RAG база знаний
```sql
id UUID PK
content TEXT
source TEXT
category TEXT  -- 'western_astrology' | 'human_design' | 'bazi' | 'tzolkin'
embedding vector(1536)
INDEX: HNSW (m=16, ef_construction=64)
```

**user_insights** — выход DSB
```sql
id UUID PK
user_id UUID FK → users
system TEXT                    -- 'western_astrology'
primary_sphere INT (1–12)
rank INT                       -- позиция внутри сферы
influence_level TEXT           -- 'high' | 'medium' | 'low'
weight FLOAT (0.0–1.0)
position TEXT                  -- астро-маркер
core_theme TEXT
energy_description TEXT
light_aspect TEXT
shadow_aspect TEXT
developmental_task TEXT
integration_key TEXT
triggers JSONB
source TEXT
created_at TIMESTAMPTZ
INDEX: (user_id, system, primary_sphere)
```

**user_portraits**
```sql
id UUID PK
user_id UUID FK → users
core_identity, core_archetype, narrative_role TEXT
energy_type, current_dynamic TEXT
deep_profile_data JSONB  -- {polarities: {core_strengths: [], shadow_aspects: []}}
created_at TIMESTAMPTZ
```

**user_memory** — RAG индекс для чата
```sql
id UUID PK
user_id UUID FK → users
role TEXT  -- 'dsb:birth' | 'dsb:portrait' | 'dsb:insight_s1' | ...
message TEXT
embedding vector(1536)
INDEX: HNSW
```

**uis_errors** — диагностика пайплайна
```sql
id UUID PK
user_id UUID
raw_json TEXT
error_message TEXT
attempt INT
created_at TIMESTAMPTZ
```

### RPC функции

**`match_book_chunks(query_embedding, match_threshold, match_count, p_category)`**
- Семантический поиск в `book_chunks`
- Возвращает: `id, content, source, similarity`

**`match_user_memory(query_embedding, match_threshold, match_count, p_user_id)`**
- Семантический поиск в `user_memory` для конкретного пользователя
- Возвращает: `id, role, message, similarity`

---

## Аутентификация

### Telegram Mini App (TMA) интеграция

1. **Frontend**: `window.Telegram.WebApp.initData` или `?debug=true` для локальной разработки
2. **Backend**:
   - Парсит `init_data`: извлекает `tg_id, first_name, last_name, username, photo_url`
   - Upsert пользователя в `users`
   - Возвращает токен: `f"tg_{tg_id}"`
3. **Axios**: `Authorization: Bearer tg_{tg_id}` в каждом запросе (из localStorage)

### Гейт онбординга

- Флаг `onboarding_done` в таблице `users`
- `false` → редирект на `/onboarding`
- DSB пайплайн устанавливает `true` по завершении

---

## 12 Сфер

Универсальный фреймворк, на который маппятся все системы:

| # | Сфера | Ключ | Фокус |
|---|-------|------|-------|
| 1 | Личность | identity | Я, образ, персона |
| 2 | Ресурсы | money | Ценности, финансы, безопасность |
| 3 | Связи | mind | Коммуникация, мышление, окружение |
| 4 | Корни | family | Дом, наследие, фундамент |
| 5 | Творчество | creativity | Самовыражение, дети, радость |
| 6 | Служение | health | Тело, здоровье, служение, работа |
| 7 | Партнёрство | relationships | Партнёрства, брак, зеркала |
| 8 | Психология | transformation | Кризисы, власть, трансформация, секс |
| 9 | Мировоззрение | spirituality | Смысл, философия, расширение |
| 10 | Реализация | career | Карьера, статус, репутация, цели |
| 11 | Сообщества | social | Друзья, группы, видение будущего |
| 12 | Запредельное | shadow | Тень, духовность, уединение |

---

## Модель UniversalInsight (UIS)

```python
class UniversalInsight(BaseModel):
    # Маршрутизация и ранжирование
    primary_sphere: Literal[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    influence_level: Literal["high", "medium", "low"]
    weight: float  # 0.0–1.0, 2 знака после запятой

    # Источник
    position: str  # астро-маркер, напр. "Sun in Leo in 1st house"

    # Контент карточки
    core_theme: str           # заголовок
    energy_description: str   # нейтральное описание энергии
    light_aspect: str         # дар/потенциал
    shadow_aspect: str        # ловушка/риск
    developmental_task: str   # работа
    integration_key: str      # конкретный инсайт
    triggers: list[str]       # жизненные ситуации
    source: str | None        # ссылка на книгу
```

### Формула weight

```
base = 0.5
+0.20  личная планета (Sun, Moon, Mercury, Venus, Mars)
+0.15  угловой дом (1, 4, 7, 10)
+0.10  точный аспект (орб < 1.0°)
+0.10  dignity ≥ 4 (домицилий/экзальтация)
+0.10  dignity ≤ -4 (детримент/падение)
−0.05  ретроград
→ clip(0.0, 1.0)

Уровни:
  "high"   → weight ≥ 0.75
  "medium" → 0.45–0.74
  "low"    → < 0.45
```

---

## Поток данных

```
[Telegram Mini App]
        │
        ▼
  POST /api/auth/login
  upsert user (tg_id → users)
        │
        ├─ onboarding_done = false ──▶ [Onboarding]
        │                                    │
        │                         date/time + location
        │                                    │
        │                         POST /api/auth/geocode
        │                         (city → lat/lon/timezone)
        │                                    │
        │                         POST /api/auth/calculate
        │                         (запускает background task)
        │                                    │
        │              ┌─────────────────────┼──────────────────────┐
        │              │                     │                      │
        │              ▼                     ▼                      ▼
        │         СЛОЙ 1               СЛОЙ 2                  СЛОЙ 3
        │      natal_chart.py    western_astrology_agent.py  synthesis.py
        │      pyswisseph        RAG + GPT-4o                групп+сорт+сохр
        │      планеты, аспекты  30–45 запросов              user_insights
        │      паттерны          60–100 UIS                  user_portraits
        │                                    │
        │                         onboarding_done = true
        │                                    │
        └─ onboarding_done = true ◀──────────┘
                    │
                    ▼
         GET /api/portraits/{user_id}
         (insights + portrait summary)
                    │
                    ▼
           [Your World Page]
           12 сфер × инсайты
                    │
                    ▼
            [Assistant Page]
                    │
         GET /api/assistant/init/{user_id}
         (создать сессию + DSB-индексация в фоне)
                    │
                    ▼
         POST /api/assistant/chat
         embed(msg) → user_memory → топ-6 чанков
         GPT-4o-mini + DSB-контекст → ответ
```

---

## Конфигурация

### Переменные окружения (`.env`)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=<service role key>
OPENAI_API_KEY=sk-xxx
```

### Frontend (`.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Запуск dev-серверов

**Backend**:
```bash
cd backend
venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend**:
```bash
cd frontend
npm run dev -- --port 3000
```

---

## Реализовано / Планируется

### Реализовано
- Western Astrology (Слой 1, 2, 3 + portrait summary)
- Telegram Mini App аутентификация
- DSB Pipeline (3-слойный)
- RAG-индексация + retrieval
- Ассистент с DSB-контекстом
- Голосовая запись + транскрипция (Whisper)
- Your World UI (12 сфер, 3 таба)
- Onboarding

### Планируется
- Human Design (калькулятор + агент)
- BaZi (Четыре Столпа)
- Tzolkin (Майя)
- Дневник (полная реализация)
- Игровая система (XP, стрики, эволюция)
- Платежи
- Голосовой синтез
