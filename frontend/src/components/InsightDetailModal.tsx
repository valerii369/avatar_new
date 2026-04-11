"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Sparkles, AlertCircle, Zap, Target, Key } from "lucide-react";
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
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "#050505",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 24,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              padding: "3px 10px", borderRadius: 6,
              fontSize: 9, fontWeight: 900,
              backgroundColor: influence.bg, color: influence.color,
              border: `1px solid ${influence.color}20`,
            }}>
              {influence.label}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.15em",
            }}>
              {SYSTEM_SHORT[insight.system] || insight.system.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <ArrowLeft size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
          paddingBottom: 120,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}>
          {/* Title */}
          <div>
            <div style={{
              fontSize: 11, color: sphere?.color || "var(--text-muted)",
              fontWeight: 600, marginBottom: 4,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                backgroundColor: sphere?.color,
              }} />
              {sphere?.name} • {sphere?.subtitle}
            </div>
            <div style={{
              fontSize: 11, color: "rgba(255,255,255,0.3)",
              marginBottom: 8, fontWeight: 400,
            }}>
              {insight.position}
            </div>
            <h2 style={{
              fontSize: 24, fontWeight: 700,
              color: "white", letterSpacing: "-0.5px",
              lineHeight: 1.2, margin: 0,
            }}>
              {insight.core_theme}
            </h2>
          </div>

          {/* Energy */}
          <Section title="Энергия и потенциал" icon={Sparkles}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, fontWeight: 300, margin: 0 }}>
              {insight.energy_description}
            </p>
          </Section>

          {/* Psychological Insight */}
          {insight.insight && (
            <Section title="Психологический инсайт" icon={Sparkles} color="#8B5CF6">
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, fontWeight: 300, margin: 0 }}>
                {insight.insight}
              </p>
            </Section>
          )}

          {/* Gift */}
          {insight.gift && (
            <Section title="Ключевой дар" icon={Zap} color="#F59E0B">
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, fontWeight: 300, margin: 0 }}>
                {insight.gift}
              </p>
            </Section>
          )}

          {/* Light */}
          <Section title="Свет / Потенциал" icon={Sparkles} color="#10B981">
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, fontWeight: 300, margin: 0 }}>
              {insight.light_aspect}
            </p>
          </Section>

          {/* Shadow */}
          <Section title="Тень / Ловушка" icon={AlertCircle} color="#EF4444">
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, fontWeight: 300, margin: 0 }}>
              {insight.shadow_aspect}
            </p>
          </Section>

          {/* Task + Key grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{
              padding: 16, borderRadius: 16,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}>
              <span style={{
                fontSize: 8, fontWeight: 800,
                color: "rgba(255,255,255,0.2)",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                display: "flex", alignItems: "center", gap: 4,
                marginBottom: 8,
              }}>
                <Target size={10} /> Задача развития
              </span>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, fontWeight: 300, margin: 0 }}>
                {insight.developmental_task}
              </p>
            </div>
            <div style={{
              padding: 16, borderRadius: 16,
              background: "rgba(139, 92, 246, 0.05)",
              border: "1px solid rgba(139, 92, 246, 0.1)",
            }}>
              <span style={{
                fontSize: 8, fontWeight: 800,
                color: "rgba(139, 92, 246, 0.6)",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                display: "flex", alignItems: "center", gap: 4,
                marginBottom: 8,
              }}>
                <Key size={10} /> Ключ интеграции
              </span>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, fontWeight: 300, margin: 0 }}>
                {insight.integration_key}
              </p>
            </div>
          </div>

          {/* Triggers */}
          {insight.triggers?.length > 0 && (
            <Section title="Триггеры проявления" icon={Zap}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {insight.triggers.map((t, i) => (
                  <div key={i} style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.6)",
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
              fontStyle: "italic", paddingTop: 8,
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}>
              Источник: {insight.source}
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          padding: 24,
          background: "linear-gradient(to top, black, transparent)",
        }}>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: 16,
              background: "white",
              color: "black",
              fontWeight: 700,
              borderRadius: 16,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
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
  title,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  icon: any;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        color: color || "rgba(255,255,255,0.2)",
      }}>
        <Icon size={12} />
        <span style={{
          fontSize: 9, fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
