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
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        padding: 16,
        borderRadius: 20,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header: System + Influence */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            backgroundColor: sphere?.color || "#8B5CF6",
          }} />
          <span style={{
            fontSize: 8, fontWeight: 800,
            color: "rgba(255,255,255,0.25)",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
          }}>
            {systemLabel}
          </span>
        </div>
        <div style={{
          padding: "2px 8px",
          borderRadius: 6,
          fontSize: 8,
          fontWeight: 900,
          letterSpacing: "0.05em",
          backgroundColor: influence.bg,
          color: influence.color,
          border: `1px solid ${influence.color}20`,
        }}>
          {influence.label}
        </div>
      </div>

      {/* Position (astro marker) */}
      <div style={{
        fontSize: 10,
        color: "rgba(255,255,255,0.35)",
        fontWeight: 500,
        letterSpacing: "0.02em",
      }}>
        {insight.position}
      </div>

      {/* Core Theme (title) */}
      <h4 style={{
        fontSize: 14,
        fontWeight: 700,
        color: "rgba(255,255,255,0.9)",
        lineHeight: 1.3,
        margin: 0,
      }}>
        {insight.core_theme}
      </h4>

      {/* Energy Description */}
      <p style={{
        fontSize: 12,
        color: "rgba(255,255,255,0.50)",
        lineHeight: 1.5,
        fontWeight: 300,
        margin: 0,
      }}>
        {insight.energy_description}
      </p>

      {/* Light / Shadow compact */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{
          padding: "8px 10px",
          borderRadius: 12,
          background: "rgba(16, 185, 129, 0.06)",
          border: "1px solid rgba(16, 185, 129, 0.1)",
        }}>
          <span style={{
            fontSize: 7, fontWeight: 800,
            color: "#10B981",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            display: "block",
            marginBottom: 4,
          }}>Свет</span>
          <p style={{
            fontSize: 10, color: "rgba(255,255,255,0.6)",
            lineHeight: 1.4, margin: 0, fontWeight: 300,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {insight.light_aspect}
          </p>
        </div>
        <div style={{
          padding: "8px 10px",
          borderRadius: 12,
          background: "rgba(239, 68, 68, 0.04)",
          border: "1px solid rgba(239, 68, 68, 0.08)",
        }}>
          <span style={{
            fontSize: 7, fontWeight: 800,
            color: "#EF4444",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            display: "block",
            marginBottom: 4,
          }}>Тень</span>
          <p style={{
            fontSize: 10, color: "rgba(255,255,255,0.5)",
            lineHeight: 1.4, margin: 0, fontWeight: 300,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {insight.shadow_aspect}
          </p>
        </div>
      </div>

    </motion.div>
  );
}
