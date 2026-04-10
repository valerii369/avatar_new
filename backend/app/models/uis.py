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
    position: str = Field(..., min_length=2, max_length=150)

    # --- Контент карточки ---
    core_theme: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=5, max_length=800)
    light_aspect: str = Field(..., min_length=3, max_length=1000)
    shadow_aspect: str = Field(..., min_length=3, max_length=1000)
    insight: str = Field(..., min_length=5, max_length=1500)
    gift: str = Field(..., min_length=3, max_length=800)

    # --- Детальный экран ---
    developmental_task: str = Field(..., min_length=5, max_length=400)
    integration_key: str = Field(..., min_length=5, max_length=400)
    triggers: list[str] = Field(..., min_length=1, max_length=8)

    # --- Ultimate Synthesis Engine extras ---
    blind_spot:    str | None = Field(None, max_length=800)
    energy_rhythm: str | None = Field(None, max_length=500)
    crisis_anchor: str | None = Field(None, max_length=500)

    # --- Источник из книги ---
    source: str | None = None

    @field_validator("weight")
    @classmethod
    def round_weight(cls, v):
        return round(v, 2)

    @field_validator("influence_level", mode="before")
    @classmethod
    def normalize_influence(cls, v):
        """Fix typos like 'medum' → 'medium'."""
        if isinstance(v, str):
            v = v.strip().lower()
            if v.startswith("h"): return "high"
            if v.startswith("m"): return "medium"
            if v.startswith("l"): return "low"
        return v

    @field_validator("triggers")
    @classmethod
    def triggers_not_empty(cls, v):
        return [t.strip() for t in v if t.strip()]


class SphereResponse(BaseModel):
    """Single-sphere response from a worker agent. No coverage validation."""
    insights: list[UniversalInsight] = Field(..., min_length=1, max_length=18)


class UISResponse(BaseModel):
    """Full chart response. Requires all 12 spheres."""
    insights: list[UniversalInsight] = Field(..., min_length=12, max_length=220)

    @field_validator("insights")
    @classmethod
    def check_sphere_coverage(cls, insights):
        spheres = {i.primary_sphere for i in insights}
        missing = set(range(1, 13)) - spheres
        if missing:
            raise ValueError(f"Отсутствуют сферы с номерами: {missing}")
        return insights
