"""LLM synthesis for transit recommendations."""
from __future__ import annotations

import json
import logging

from openai import AsyncOpenAI
from app.core.config import settings

logger   = logging.getLogger(__name__)
_client  = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

PERIOD_RU = {
    "week":    "Неделя",
    "month":   "Месяц",
    "quarter": "Квартал",
    "year":    "Год",
}


def _fmt_aspects(aspects: list[dict]) -> str:
    lines = []
    for a in aspects:
        emoji = "✨" if a["nature"] == "harmonious" else ("⚡" if a["nature"] == "tense" else "○")
        lines.append(
            f"  {emoji} Транзитный {a['transit_planet_ru']} {a['aspect_ru']} натальный {a['natal_point_ru']} "
            f"(орбис {a['orb']}°)"
        )
    return "\n".join(lines) if lines else "  (нет активных аспектов)"


async def synthesize_recommendation(
    transit_data: dict,
    portrait_summary: dict,
    chain_narrative: str,
    period: str,
    user_name: str = "",
) -> dict:
    period_ru   = PERIOD_RU.get(period, period)
    high_text   = _fmt_aspects(transit_data.get("high_priority_aspects", []))
    medium_text = _fmt_aspects(transit_data.get("medium_priority_aspects", []))
    energy_sc   = transit_data["energy_score"]
    luck_sc     = transit_data["luck_risk_score"]

    system_prompt = f"""Ты — мастер-интерпретатор астрологических транзитов. Твоя задача — дать конкретный, персональный прогноз на выбранный период.

ПРИНЦИПЫ:
1. Говори КОНКРЕТНО: дай практический совет для бизнеса, отношений, здоровья.
2. Учитывай цепочки управления (dispositor chains) из натальной карты пользователя.
3. Различай высокоприоритетные аспекты (медленные планеты, тесный орбис < 1°) и фоновые (быстрые, орбис 1-3°).
4. Используй уверенный тон — НЕ расплывайся в "возможно", "вероятно". Это не гадание, это навигация.
5. Стиль: премиальный коучинг, психологическая глубина + конкретное действие.
6. Для каждого высокоприоритетного транзита — отдельное событие high_priority.
7. Среднеприоритетные транзиты — группируй по смыслу, не более 3 событий medium_priority.

НАТАЛЬНЫЙ КОНТЕКСТ:
- Имя: {user_name or "Пользователь"}
- Архетип: {portrait_summary.get("core_archetype", "не определён")}
- Тип энергии: {portrait_summary.get("energy_type", "не определён")}
- Текущая динамика: {portrait_summary.get("current_dynamic", "не определена")}
- Цепочка управления: {chain_narrative or "нет данных"}

ФОРМАТ ОТВЕТА — строго JSON, не отступай от схемы:
{{
  "period": "{period_ru}",
  "date_range": "{transit_data['date_from']} — {transit_data['date_to']}",
  "scales": {{
    "energy_score": {energy_sc},
    "luck_risk_score": {luck_sc}
  }},
  "events": {{
    "high_priority": [
      {{"title": "...", "description": "...", "dates": "ДД.ММ"}}
    ],
    "medium_priority": [
      {{"title": "...", "description": "...", "dates": "ДД.ММ"}}
    ]
  }},
  "summary_advice": "2-3 предложения итогового напутствия."
}}"""

    user_prompt = f"""Период: {period_ru} ({transit_data['date_from']} — {transit_data['date_to']})

ВЫСОКОПРИОРИТЕТНЫЕ ТРАНЗИТЫ (медленные планеты, орбис < 1°):
{high_text}

СРЕДНЕПРИОРИТЕТНЫЕ ТРАНЗИТЫ (быстрые планеты, орбис 1-3°):
{medium_text}

Шкалы (рассчитаны математически, не меняй):
- Энергия: {energy_sc}/100
- Удача/Риски: {luck_sc:+d}/50

Дай рекомендацию в указанном JSON-формате. Будь конкретен и точен."""

    try:
        resp = await _client.chat.completions.create(
            model=settings.MODEL_HEAVY,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.75,
            max_completion_tokens=2000,
        )
        result = json.loads(resp.choices[0].message.content)
    except Exception as e:
        logger.error("LLM synthesis failed: %s", e)
        result = {
            "period":       period_ru,
            "date_range":   f"{transit_data['date_from']} — {transit_data['date_to']}",
            "events":       {"high_priority": [], "medium_priority": []},
            "summary_advice": "Данные рассчитаны. LLM-синтез временно недоступен.",
        }

    # Always use mathematically computed scores (prevent LLM from overriding them)
    result["scales"] = {
        "energy_score":    transit_data["energy_score"],
        "luck_risk_score": transit_data["luck_risk_score"],
    }
    return result
