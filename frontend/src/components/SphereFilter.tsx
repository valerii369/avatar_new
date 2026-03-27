"use client";

import { SPHERES, type SphereMeta } from "@/lib/constants";

interface SphereFilterProps {
  activeSphere: number | null;
  onSelect: (sphereId: number | null) => void;
  showAll?: boolean;
}

export default function SphereFilter({ activeSphere, onSelect, showAll = true }: SphereFilterProps) {
  return (
    <div
      className="scrollbar-hide"
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: "0 16px 8px",
        margin: "0 -16px",
      }}
    >
      {showAll && (
        <button
          onClick={() => onSelect(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 12,
            border: `1px solid ${activeSphere === null ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)"}`,
            background: activeSphere === null ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)",
            color: activeSphere === null ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          Все сферы
        </button>
      )}
      {SPHERES.map((sphere: SphereMeta) => {
        const isActive = activeSphere === sphere.id;
        const Icon = sphere.icon;
        return (
          <button
            key={sphere.id}
            onClick={() => onSelect(sphere.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 12,
              border: `1px solid ${isActive ? `${sphere.color}40` : "rgba(255,255,255,0.05)"}`,
              background: isActive ? `${sphere.color}15` : "rgba(255,255,255,0.02)",
              color: isActive ? sphere.color : "var(--text-muted)",
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
              transition: "all 0.2s",
              transform: isActive ? "scale(1.02)" : "scale(1)",
            }}
          >
            <Icon size={14} />
            {sphere.name}
          </button>
        );
      })}
    </div>
  );
}
