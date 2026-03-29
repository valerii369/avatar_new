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
      className="flex gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: "none" }}
    >
      {showAll && (
        <button
          onClick={() => onSelect(null)}
          className="flex-none px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap"
          style={{
            background: activeSphere === null ? "rgba(139,92,246,0.1)" : "transparent",
            color: activeSphere === null ? "var(--violet-l)" : "var(--text-muted)",
            border: `1px solid ${activeSphere === null ? "var(--violet-l)" : "var(--border)"}`,
          }}
        >
          Все
        </button>
      )}
      {SPHERES.map((sphere: SphereMeta) => {
        const isActive = activeSphere === sphere.id;
        return (
          <button
            key={sphere.id}
            onClick={() => onSelect(sphere.id)}
            className="flex-none px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap"
            style={{
              background: isActive ? "rgba(139,92,246,0.1)" : "transparent",
              color: isActive ? "var(--violet-l)" : "var(--text-muted)",
              border: `1px solid ${isActive ? "var(--violet-l)" : "var(--border)"}`,
            }}
          >
            {sphere.name}
          </button>
        );
      })}
    </div>
  );
}
