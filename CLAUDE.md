# AVATAR v2.0 — Claude Code Setup

## Все доступы и токены

### VPS (Timeweb)
- **IP:** `103.74.92.72`
- **User:** `root`
- **Password:** `eCTyD*R.94zTbaeCTyD*R.94zTba`
- **SSH:** `ssh root@103.74.92.72`
- **Проект на VPS:** `/root/avatar-new/`
- **SSH недоступен из облачной сессии** — использовать GitHub Actions или подключаться вручную

### GitHub
- **Репозиторий:** `https://github.com/valerii369/avatar_new`
- **PAT токен:** сохранён в `~/.git-credentials` (credential.helper=store)
- **Если токен истёк:** GitHub → Settings → Developer settings → Personal access tokens → создать новый → `echo "https://valerii369:<TOKEN>@github.com" >> ~/.git-credentials`
- **GitHub Secrets** (для CI/CD): `TIMEWEB_HOST`, `TIMEWEB_SSH_KEY`, `TELEGRAM_BOT_TOKEN`, `MINI_APP_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### Git Configuration
⚠️ **ВАЖНО:** Окружение `CCR_TEST_GITPROXY=1` форсит локальный proxy, вызывая 403 ошибки. **Решение:**

**Если видишь ошибку 403 при `git push/pull`:**
```bash
# Проверить текущий URL
git remote -v

# Если видишь http://local_proxy@127.0.0.1 — переопределить на GitHub HTTPS
git config --local remote.origin.url "https://github.com/valerii369/avatar_new.git"

# Если нужна аутентификация, использовать PAT из ~/.git-credentials:
# git config --local remote.origin.url "https://valerii369:<PAT_TOKEN>@github.com/valerii369/avatar_new.git"

# Проверить работает ли
git fetch origin develop
```

Proxy слетает из-за окружения, но локальный `.git/config` override решает это.

### Supabase
- **Project ID:** `gltglzxcjitbdwhqgyre`
- **URL:** `https://gltglzxcjitbdwhqgyre.supabase.co`
- **Dashboard:** `https://supabase.com/dashboard/project/gltglzxcjitbdwhqgyre`
- **SUPABASE_KEY, DATABASE_URL, OPENAI_API_KEY** — в `backend/.env` (локально и на VPS)
- Реальные значения хранятся только в `backend/.env` — не в git

### Telegram Bot
- **Бот:** @avatarmatrix_bot
- **TELEGRAM_BOT_TOKEN, MINI_APP_URL** — в GitHub Secrets и в `backend/.env` на VPS

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
