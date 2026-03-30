"use client";

import { motion } from "framer-motion";
import { SPHERE_BY_ID, INFLUENCE_CONFIG, SYSTEM_SHORT } from "@/lib/constants";
import type { Insight } from "@/lib/store";

interface InsightCardProps {
  insight: Insight;
  onClick?: () => void;
}

export default function InsightCard({ insight, onClick }: InsightCardProps) {
  const sphere = SPHERE_BY_ID[insight.primary_sphere];
  const influence = INFLUENCE_CONFIG[insight.influence_level];
  const systemLabel = SYSTEM_SHORT[insight.system] || "DSB";

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.2s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Top row: system · sphere | influence badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: sphere?.color || "#8B5CF6",
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}>
            {systemLabel} · {sphere?.name || `Сфера ${insight.primary_sphere}`}
          </span>
        </div>
        <div style={{
          padding: "2px 8px", borderRadius: 8, flexShrink: 0,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
          background: influence.bg, color: influence.color,
        }}>
          {influence.label}
        </div>
      </div>

      {/* Title */}
      <h4 style={{
        fontSize: 15, fontWeight: 700,
        color: "rgba(255,255,255,0.92)",
        lineHeight: 1.3, margin: 0,
      }}>
        {insight.core_theme}
      </h4>

      {/* Description — 2 lines max */}
      <p style={{
        fontSize: 13, color: "rgba(255,255,255,0.4)",
        lineHeight: 1.5, fontWeight: 400, margin: 0,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {insight.description}
      </p>

      {/* Compact tags: свет + тень + triggers */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {insight.light_aspect && (
          <span style={{
            padding: "3px 8px", borderRadius: 8,
            fontSize: 10, fontWeight: 500,
            color: "#10B981",
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.12)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 160,
          }}>
            {insight.light_aspect}
          </span>
        )}
        {insight.shadow_aspect && (
          <span style={{
            padding: "3px 8px", borderRadius: 8,
            fontSize: 10, fontWeight: 500,
            color: "#EF4444",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 160,
          }}>
            {insight.shadow_aspect}
          </span>
        )}
        {insight.triggers?.slice(0, 2).map((t, i) => (
          <span key={i} style={{
            padding: "3px 8px", borderRadius: 8,
            fontSize: 10, fontWeight: 500,
            color: "rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}>
            {t}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
