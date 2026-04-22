# AVATAR v2.0 — Claude Code Setup

## Git авторизация

GitHub Personal Access Token сохранён локально в `~/.git-credentials` (credential.helper=store).
При необходимости `git push` работает без дополнительных действий.
Если токен истёк — создать новый на GitHub → Settings → Developer settings → Personal access tokens,
сохранить командой: `echo "https://valerii369:<TOKEN>@github.com" >> ~/.git-credentials`

## Быстрый старт (новая машина)

### 1. Клонировать репозиторий
```bash
git clone https://github.com/valerii369/avatar_new.git
cd avatar_new
git checkout develop
```

### 2. Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Создать `backend/.env`:
```env
# Supabase
SUPABASE_URL=https://gltglzxcjitbdwhqgyre.supabase.co
SUPABASE_KEY=<supabase-publishable-key>
DATABASE_URL=postgresql://postgres.<project-id>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Telegram Bot
TELEGRAM_BOT_TOKEN=<bot-token>
MINI_APP_URL=https://avatar-new-jade.vercel.app
```

Запустить backend:
```bash
cd backend
venv/bin/uvicorn app.main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
```

Создать `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Запустить frontend:
```bash
npm run dev
```

Открыть: http://localhost:3000

---

## Структура проекта

```
backend/
  app/
    main.py                          — FastAPI app, ephemeris setup
    core/config.py                   — env vars (pydantic-settings)
    core/db.py                       — get_supabase() client
    api/auth.py                      — /login, /profile, /calculate, /geocode
    api/portraits.py                 — GET /portraits/{user_id}
    api/assistant.py                 — chat sessions + RAG + Whisper
    services/dsb/natal_chart.py      — Layer 1: pyswisseph расчёт карты
    services/dsb/western_astrology_agent.py — Layer 2: RAG + GPT-4o инсайты
    services/dsb/synthesis.py        — Layer 3: группировка + сохранение
    services/rag/user_rag.py         — индексация DSB в pgvector
    ephe/                            — файлы эфемерид Swiss Ephemeris (.se1)
  bot.py                             — Telegram Mini App бот

frontend/
  src/
    app/                             — Next.js страницы
    components/                      — UI компоненты
    lib/                             — утилиты, константы, стор
```

## Ключевые API роуты

| Метод | Путь | Что делает |
|-------|------|-----------|
| POST | /api/auth/login | upsert user by tg_id |
| GET  | /api/auth/profile?user_id= | профиль + birth_data + portrait |
| POST | /api/auth/calculate | запуск DSB pipeline (background) |
| POST | /api/auth/geocode | геокодирование города |
| GET  | /api/portraits/{user_id} | инсайты сгруппированные по сферам |
| GET  | /api/assistant/init/{user_id} | старт сессии ассистента |
| POST | /api/assistant/chat | сообщение ассистенту |
| POST | /api/assistant/finish | итог сессии |
| POST | /api/assistant/transcribe | Whisper транскрипция аудио |

## Supabase

- Project ID: `gltglzxcjitbdwhqgyre`
- URL: `https://gltglzxcjitbdwhqgyre.supabase.co`
- Таблицы: `users`, `user_birth_data`, `user_insights`, `user_portraits`, `user_memory`, `geocode_cache`, `book_chunks`, `uis_errors`
- RPC: `match_book_chunks`, `match_user_memory` (pgvector cosine similarity)

## Деплой

| Компонент | Платформа | Триггер |
|-----------|-----------|---------|
| Frontend  | Vercel | push → main (prod), develop (preview) |
| Backend   | Timeweb VPS `103.74.92.72` | push → develop (GitHub Actions) |
| Telegram Bot | тот же VPS, systemd `avatar-bot` | вместе с backend |

## DSB Pipeline

```
POST /calculate
  → Layer 1: natal_chart.py       — pyswisseph, планеты/аспекты/паттерны
  → Layer 2: western_astrology_agent.py — RAG книги + GPT-4o, 60-100 инсайтов
  → Layer 3: synthesis.py         — группировка по сферам, сохранение в Supabase
  → Portrait: portrait_agent.py   — сводный психопортрет
```

## Telegram Bot

- Бот: @avatarmatrix_bot
- Запуск Mini App: кнопка `/start` → открывает `MINI_APP_URL`
- Systemd сервис: `avatar-bot`

## Переменные окружения (GitHub Secrets для CI/CD)

```
TIMEWEB_HOST          — 103.74.92.72
TIMEWEB_SSH_KEY       — приватный SSH ключ
TELEGRAM_BOT_TOKEN    — токен бота
MINI_APP_URL          — URL Mini App
VERCEL_TOKEN          — токен Vercel
VERCEL_ORG_ID         — org id Vercel
VERCEL_PROJECT_ID     — project id Vercel
```
