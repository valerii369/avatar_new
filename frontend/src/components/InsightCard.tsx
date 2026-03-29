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
        padding: "12px 14px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.2s",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Top row: system + position | influence badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: sphere?.color || "#8B5CF6",
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            {systemLabel}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>·</span>
          <span style={{
            fontSize: 10, color: "rgba(255,255,255,0.25)",
            fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {insight.position}
          </span>
        </div>
        <div style={{
          padding: "3px 8px", borderRadius: 6, flexShrink: 0, marginLeft: 8,
          fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
          background: influence.bg, color: influence.color,
          border: `1px solid ${influence.color}18`,
        }}>
          {influence.label}
        </div>
      </div>

      {/* Title */}
      <h4 style={{
        fontSize: 14, fontWeight: 700,
        color: "rgba(255,255,255,0.9)",
        lineHeight: 1.35, margin: 0,
      }}>
        {insight.core_theme}
      </h4>

      {/* Description */}
      <p style={{
        fontSize: 12, color: "rgba(255,255,255,0.45)",
        lineHeight: 1.5, fontWeight: 400, margin: 0,
      }}>
        {insight.description}
      </p>

      {/* Light / Shadow */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{
          padding: "8px 10px", borderRadius: 10,
          background: "rgba(16,185,129,0.04)",
          border: "1px solid rgba(16,185,129,0.08)",
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#10B981",
            textTransform: "uppercase", letterSpacing: "0.1em",
            display: "block", marginBottom: 4,
          }}>Свет</span>
          <p style={{
            fontSize: 11, color: "rgba(255,255,255,0.55)",
            lineHeight: 1.4, margin: 0, fontWeight: 400,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {insight.light_aspect}
          </p>
        </div>
        <div style={{
          padding: "8px 10px", borderRadius: 10,
          background: "rgba(239,68,68,0.03)",
          border: "1px solid rgba(239,68,68,0.06)",
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#EF4444",
            textTransform: "uppercase", letterSpacing: "0.1em",
            display: "block", marginBottom: 4,
          }}>Тень</span>
          <p style={{
            fontSize: 11, color: "rgba(255,255,255,0.45)",
            lineHeight: 1.4, margin: 0, fontWeight: 400,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {insight.shadow_aspect}
          </p>
        </div>
      </div>

      {/* Triggers */}
      {insight.triggers?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {insight.triggers.slice(0, 3).map((t, i) => (
            <span key={i} style={{
              padding: "2px 8px", borderRadius: 10,
              fontSize: 10, fontWeight: 500,
              color: "rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
