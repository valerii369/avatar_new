# AVATAR — Астрологический Калькулятор
### Финальная архитектура и руководство по реализации
`v2.0 | 2025`

---

## Обзор

Двухслойный пайплайн астрологических вычислений. Слой 1 — точные астрономические расчёты. Слой 2 — бизнес-логика. Выход — Rich JSON для LLM-агентов DSB Pipeline.

| Параметр | Значение |
|---|---|
| Основная библиотека | pyswisseph (Swiss Ephemeris / NASA JPL) |
| Геокодирование | Self-hosted Nominatim (Docker) |
| Определение TZ | timezonefinder + pytz |
| Async-модель | anyio + CapacityLimiter(20) |
| Система домов | Placidus → Whole Sign fallback (с флагом) |
| Выходной формат | Rich JSON → DSB Pipeline |

---

## Слой 1 — natal_chart.py

### Входной пайплайн

```
Дата + Время + Место
        ↓
Nominatim (self-hosted) → lat / lon
        ↓
timezonefinder → timezone
        ↓
pytz → UTC
        ↓
Julian Day (для Swiss Ephemeris)
```

**Кэширование геокодера.** Результат геокодирования (название города → lat/lon) кэшируется в Supabase таблице `geocode_cache`. При повторном запросе — чтение из кэша, без обращения к Nominatim.

```python
# Логика геокодирования с кэшем
async def geocode(place: str) -> tuple[float, float]:
    cached = await supabase.table("geocode_cache").select("lat,lon").eq("place", place).execute()
    if cached.data:
        return cached.data[0]["lat"], cached.data[0]["lon"]
    result = await nominatim.geocode(place)  # self-hosted
    await supabase.table("geocode_cache").insert({"place": place, "lat": result.lat, "lon": result.lon}).execute()
    return result.lat, result.lon
```

### Async-обёртка с ограничением потоков

Все блокирующие вызовы Swiss Ephemeris оборачиваются через `anyio` с жёстким лимитом пула:

```python
limiter = anyio.CapacityLimiter(20)  # максимум 20 одновременных потоков

async def calc_planet(jd: float, planet_id: int):
    async with limiter:
        return await anyio.to_thread.run_sync(
            lambda: swe.calc_ut(jd, planet_id)
        )
```

### Узлы Луны — единая система

Северный и Южный узлы должны использовать одну и ту же константу Swiss Ephemeris:

```python
# ПРАВИЛЬНО — оба узла из одного источника
NORTH_NODE = swe.calc_ut(jd, swe.TRUE_NODE)   # Истинный узел
SOUTH_NODE = (NORTH_NODE[0] + 180.0) % 360    # Южный = зеркало

# Если используется Средний узел — только swe.MEAN_NODE для обоих
# Никогда не смешивать TRUE_NODE и MEAN_NODE в одном чарте
```

### Планеты и специальные точки

| Тело | Константа Swiss Ephemeris |
|---|---|
| Солнце | `swe.SUN` |
| Луна | `swe.MOON` |
| Меркурий | `swe.MERCURY` |
| Венера | `swe.VENUS` |
| Марс | `swe.MARS` |
| Юпитер | `swe.JUPITER` |
| Сатурн | `swe.SATURN` |
| Уран | `swe.URANUS` |
| Нептун | `swe.NEPTUNE` |
| Плутон | `swe.PLUTO` |
| Северный узел | `swe.TRUE_NODE` |
| Хирон | `swe.CHIRON` |
| Лилит | `swe.MEAN_APOG` |

Для каждого тела собирается:

- Точный градус на эклиптике (0—360°)
- Знак зодиака + градус внутри знака (0—30°)
- Положение в натальном доме (1—12)
- Ретроградность (скорость < 0) и стационарность (скорость ≈ 0)
- Эссенциальное достоинство: Обитель / Экзальтация / Изгнание / Падение + числовой рейтинг (-5..+5)
- Привязка к архетипам Таро через `PLANET_ARCHETYPE_MAP`

**Колесо Фортуны** — формула с учётом времени суток:

```python
if sun_above_horizon:
    fortuna = (asc + moon_lon - sun_lon) % 360  # дневное рождение
else:
    fortuna = (asc - moon_lon + sun_lon) % 360  # ночное рождение
```

### Дома и углы

Расчёт по системе Плацидус. При невозможности расчёта (полярные широты) — автоматический fallback на Whole Sign. Итоговая система фиксируется в выходном JSON:

```python
try:
    houses, angles = swe.houses(jd, lat, lon, b"P")  # Placidus
    house_system = "placidus"
except:
    houses, angles = swe.houses(jd, lat, lon, b"W")  # Whole Sign
    house_system = "whole_sign"

# house_system всегда включается в JSON output
```

**Углы:** Асцендент (ASC) и Середина Неба (MC) — точный градус.

**Управители домов:** планета-управитель знака на куспиде каждого из 12 домов.

### Цепи диспозиторов

- Линейные цепи: Планета → управитель знака → ...
- Конечный диспозитор: планета в своей обители (конец цепи)
- Взаимные рецепции и циклы (обнаруживаются алгоритмически)

---

## Слой 2 — western_astrology.py

### Аспекты

**Матрица орбов по классам планет:**

| | Личная (Луна, Солнце, Меркурий, Венера, Марс) | Социальная (Юпитер, Сатурн) | Высшая (Уран, Нептун, Плутон) |
|---|---|---|---|
| Личная | 8° | 6° | 5° |
| Социальная | 6° | 5° | 4° |
| Высшая | 5° | 4° | 3° |

Орб никогда не применяется одинаково для всех пар — матрица обязательна.

**Мажорные аспекты:**

| Аспект | Угол | Характер |
|---|---|---|
| Соединение | 0° | Слияние |
| Оппозиция | 180° | Полярность |
| Трин | 120° | Гармония |
| Квадрат | 90° | Напряжение |
| Секстиль | 60° | Возможность |

**Флаги каждого аспекта:**
- `exact: bool` — orb < 1.0°
- `applying: bool` — планеты сближаются (сходящийся) / расходятся (расходящийся)
- `influence_weight: float` — вес влияния

### Аспектные фигуры

Автодетекция паттернов:

| Фигура | Описание |
|---|---|
| Тау-квадрат | Два квадрата + оппозиция |
| Большой трин | Три трина |
| Йод (Перст Судьбы) | Два квинкункса + секстиль |
| Большой крест | Четыре квадрата + две оппозиции |
| Кайт | Большой трин + оппозиция |
| Мистический прямоугольник | Два трина + два секстиля + две оппозиции |

### Баланс стихий и модальностей

- Распределение планет: Огонь / Земля / Воздух / Вода (в %)
- Доминирующая и дефицитная стихия
- Кресты: Кардинальный / Фиксированный / Мутабельный

### Полусферы и квадранты

- Северная / Южная полусферы (дома 1—6 vs 7—12)
- Восточная / Западная (дома 10—3 vs 4—9)
- Концентрация по квадрантам (1—4)

### Дополнительные расчёты

**Деканаты** — халдейская система, субуправитель деканата (каждые 10° знака).

**Критические градусы:**
- 0° — ингрессия (планета только вошла в знак)
- 29° — анаретический (планета на исходе знака)

**Сабианские символы** — каждому округлённому градусу (1—30) сопоставляется символ из базы данных.

**Стеллиумы** — 3+ планеты в одном знаке или в одном доме (фиксируются отдельно).

**Арабские точки:**

| Жребий | Формула |
|---|---|
| Духа | ASC + Солнце − Луна |
| Брака | ASC + Венера − Солнце |
| Профессии | ASC + MC − Солнце |

---

## JSON Output — структура

```json
{
  "meta": {
    "house_system": "placidus",
    "node_type": "true_node",
    "calculated_at": "2025-01-01T00:00:00Z"
  },
  "planets": {
    "sun": {
      "longitude": 245.32,
      "sign": "Sagittarius",
      "degree_in_sign": 5.32,
      "house": 3,
      "retrograde": false,
      "stationary": false,
      "speed": 1.01,
      "dignity": "neutral",
      "dignity_score": 0,
      "archetype": "The Hero"
    }
  },
  "houses": {
    "1": { "cusp": 14.5, "sign": "Aries", "ruler": "mars" }
  },
  "angles": {
    "asc": 14.5,
    "mc": 280.1
  },
  "aspects": [
    {
      "planet_a": "sun",
      "planet_b": "moon",
      "type": "trine",
      "orb": 2.1,
      "exact": false,
      "applying": true,
      "influence_weight": 0.85
    }
  ],
  "aspect_patterns": ["grand_trine"],
  "elements": { "fire": 40, "earth": 20, "air": 30, "water": 10 },
  "dominant_element": "fire",
  "deficit_element": "earth",
  "modalities": { "cardinal": 4, "fixed": 3, "mutable": 3 },
  "hemispheres": { "north": 7, "south": 3, "east": 5, "west": 5 },
  "stelliums": [{ "type": "sign", "sign": "Scorpio", "planets": ["mars", "pluto", "moon"] }],
  "arabic_parts": {
    "spirit": 120.4,
    "marriage": 85.2,
    "profession": 200.8
  },
  "sabian_symbols": {
    "sun": "A sage stands at the crossroads"
  },
  "decans": {
    "sun": { "decan": 1, "sub_ruler": "mars" }
  },
  "critical_degrees": ["moon"],
  "dispositor_chains": {
    "sun": ["sun", "jupiter", "neptune"],
    "final_dispositor": "jupiter"
  },
  "fortune": { "longitude": 310.5, "sign": "Aquarius", "house": 5 }
}
```

---

## Выход → DSB Pipeline

Rich JSON передаётся в DSB Pipeline (режим Western Astrology). LLM-агенты не выполняют расчётов — только интерпретацию. Психологические портреты генерируются по 12 сферам цифрового паспорта пользователя.

```
natal_chart.py
      ↓
western_astrology.py
      ↓
Rich JSON (с house_system, node_type, meta)
      ↓
DSB Pipeline → LLM-агенты × 12 сфер
      ↓
Цифровой паспорт AVATAR
```

---

## Стек зависимостей

| Библиотека | Назначение |
|---|---|
| `pyswisseph` | Ядро расчётов (Swiss Ephemeris / NASA JPL) |
| `geopy` | Клиент геокодера |
| `Nominatim` (self-hosted) | Геокодирование без лимитов и внешних зависимостей |
| `timezonefinder` | Timezone по координатам |
| `pytz` + `datetime` | UTC + Julian day |
| `anyio` | Async-обёртка, `CapacityLimiter(20)` |
| `Supabase` | Кэш геокодера (`geocode_cache`) |

---

*AVATAR | Astrology Calculator | Final Architecture Guide | Confidential*
