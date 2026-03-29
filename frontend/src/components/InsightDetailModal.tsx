"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, AlertCircle, Zap, Target, Key, Lightbulb, Star } from "lucide-react";
import { SPHERE_BY_ID, INFLUENCE_CONFIG, SYSTEM_SHORT } from "@/lib/constants";
import type { Insight } from "@/lib/store";

interface InsightDetailModalProps {
  insight: Insight | null;
  onClose: () => void;
}

export default function InsightDetailModal({ insight, onClose }: InsightDetailModalProps) {
  if (!insight) return null;

  const sphere = SPHERE_BY_ID[insight.primary_sphere];
  const influence = INFLUENCE_CONFIG[insight.influence_level];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "var(--bg-deep)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 20px 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              padding: "4px 10px", borderRadius: 6,
              fontSize: 9, fontWeight: 800,
              background: influence.bg, color: influence.color,
              border: `1px solid ${influence.color}18`,
            }}>
              {influence.label}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.1em",
            }}>
              {SYSTEM_SHORT[insight.system] || insight.system.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-muted)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "24px 20px 120px",
          display: "flex", flexDirection: "column", gap: 22,
        }}>
          {/* Title block */}
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, color: sphere?.color || "var(--text-muted)",
              fontWeight: 600, marginBottom: 6,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: sphere?.color }} />
              {sphere?.name} · {sphere?.subtitle}
            </div>
            <div style={{
              fontSize: 11, color: "rgba(255,255,255,0.25)",
              marginBottom: 10, fontWeight: 500,
            }}>
              {insight.position}
            </div>
            <h2 style={{
              fontSize: 22, fontWeight: 700, color: "white",
              letterSpacing: "-0.3px", lineHeight: 1.25, margin: 0,
            }}>
              {insight.core_theme}
            </h2>
            {/* Description — concise summary */}
            <p style={{
              fontSize: 14, color: "rgba(255,255,255,0.55)",
              lineHeight: 1.6, fontWeight: 400, margin: 0, marginTop: 10,
            }}>
              {insight.description}
            </p>
          </div>

          {/* Insight — deep psychological understanding */}
          {insight.insight && (
            <Section title="Инсайт" icon={Lightbulb} color="#A78BFA">
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.65, fontWeight: 400, margin: 0 }}>
                {insight.insight}
              </p>
            </Section>
          )}

          {/* Light */}
          <Section title="Свет" icon={Sparkles} color="#10B981">
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, fontWeight: 400, margin: 0 }}>
              {insight.light_aspect}
            </p>
          </Section>

          {/* Shadow */}
          <Section title="Тень" icon={AlertCircle} color="#EF4444">
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.65, fontWeight: 400, margin: 0 }}>
              {insight.shadow_aspect}
            </p>
          </Section>

          {/* Gift — unique talent */}
          {insight.gift && (
            <Section title="Дар" icon={Star} color="#F59E0B">
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, fontWeight: 400, margin: 0 }}>
                {insight.gift}
              </p>
            </Section>
          )}

          {/* Task + Key */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{
              padding: 16, borderRadius: 14,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid var(--border)",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.1em",
                display: "flex", alignItems: "center", gap: 5, marginBottom: 10,
              }}>
                <Target size={11} /> Задача развития
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, fontWeight: 400, margin: 0 }}>
                {insight.developmental_task}
              </p>
            </div>
            <div style={{
              padding: 16, borderRadius: 14,
              background: "rgba(139,92,246,0.03)",
              border: "1px solid rgba(139,92,246,0.08)",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.5)",
                textTransform: "uppercase", letterSpacing: "0.1em",
                display: "flex", alignItems: "center", gap: 5, marginBottom: 10,
              }}>
                <Key size={11} /> Ключ интеграции
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, fontWeight: 400, margin: 0 }}>
                {insight.integration_key}
              </p>
            </div>
          </div>

          {/* Triggers */}
          {insight.triggers?.length > 0 && (
            <Section title="Триггеры проявления" icon={Zap}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {insight.triggers.map((t, i) => (
                  <div key={i} style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    fontSize: 12, color: "rgba(255,255,255,0.55)",
                    fontWeight: 400,
                  }}>
                    {t}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Source */}
          {insight.source && (
            <div style={{
              fontSize: 11, color: "rgba(255,255,255,0.2)",
              fontStyle: "italic", paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}>
              Источник: {insight.source}
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          padding: "16px 20px 24px",
          background: "linear-gradient(to top, var(--bg-deep) 60%, transparent)",
        }}>
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: 14,
              background: "rgba(255,255,255,0.08)",
              color: "var(--text-primary)",
              fontWeight: 600, borderRadius: 14,
              border: "1px solid var(--border)",
              cursor: "pointer", fontSize: 14,
            }}
          >
            Вернуться
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Section({
  title, icon: Icon, color, children,
}: {
  title: string; icon: any; color?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        color: color || "var(--text-muted)",
      }}>
        <Icon size={12} />
        <span style={{
          fontSize: 10, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
