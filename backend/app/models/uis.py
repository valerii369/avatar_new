from pydantic import BaseModel, Field, field_validator
from typing import Literal

InfluenceLevel = Literal["high", "medium", "low"]
PrimarySphere = Literal[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

class UniversalInsight(BaseModel):
    # --- Группировка и ранжирование ---
    primary_sphere: PrimarySphere
    influence_level: InfluenceLevel
    weight: float = Field(..., ge=0.0, le=1.0)

    # --- Астро-источник ---
    position: str = Field(..., min_length=3, max_length=150)

    # --- Контент карточки ---
    core_theme: str = Field(..., min_length=5, max_length=120)
    energy_description: str = Field(..., min_length=30, max_length=400)
    light_aspect: str = Field(..., min_length=20, max_length=300)
    shadow_aspect: str = Field(..., min_length=20, max_length=300)
    developmental_task: str = Field(..., min_length=10, max_length=200)
    integration_key: str = Field(..., min_length=10, max_length=200)
    triggers: list[str] = Field(..., min_length=2, max_length=6)
    
    # --- Источник из книги ---
    source: str | None = None

    @field_validator("weight")
    @classmethod
    def round_weight(cls, v):
        return round(v, 2)

    @field_validator("triggers")
    @classmethod
    def triggers_not_empty(cls, v):
        if any(len(t.strip()) < 5 for t in v):
            raise ValueError("Триггер слишком короткий")
        return v


class UISResponse(BaseModel):
    insights: list[UniversalInsight] = Field(..., min_length=50, max_length=120)

    @field_validator("insights")
    @classmethod
    def check_sphere_coverage(cls, insights):
        spheres = {i.primary_sphere for i in insights}
        missing = set(range(1, 13)) - spheres
        if missing:
            raise ValueError(f"Отсутствуют сферы с номерами: {missing}")
        return insights

    @field_validator("insights")
    @classmethod
    def check_min_per_sphere(cls, insights):
        from collections import Counter
        counts = Counter(i.primary_sphere for i in insights)
        thin = [s for s in range(1, 13) if counts.get(s, 0) < 3]
        if thin:
            raise ValueError(f"Менее 3 инсайтов в сферах: {thin}")
        return insights
