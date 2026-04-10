"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserStore } from "@/lib/store";
import { recommendationsAPI } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
type PeriodKey = "week" | "month" | "quarter" | "year";

interface RecommendationEvent {
  title: string;
  description: string;
  dates: string;
}

interface RecommendationData {
  period: string;
  date_range: string;
  scales: {
    energy_score: number;      // 0-100
    luck_risk_score: number;   // -50 to +50
  };
  events: {
    high_priority: RecommendationEvent[];
    medium_priority: RecommendationEvent[];
  };
  summary_advice: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const PERIODS: { key: PeriodKey; label: string; emoji: string; desc: string }[] = [
  { key: "week",    label: "Неделя",   emoji: "🗓",  desc: "7 дней" },
  { key: "month",   label: "Месяц",    emoji: "🌙",  desc: "30 дней" },
  { key: "quarter", label: "Квартал",  emoji: "🌿",  desc: "3 месяца" },
  { key: "year",    label: "Год",      emoji: "⭐",  desc: "365 дней" },
];

// ── Energy Bar ────────────────────────────────────────────────────────────────
function EnergyBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? "#10B981" : pct >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>🔋 Энергия</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{
        height: 6, borderRadius: 3,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          style={{
            height: "100%",
            borderRadius: 3,
            background: `linear-gradient(90deg, #F59E0B, ${color})`,
          }}
        />
      </div>
    </div>
  );
}

// ── Luck/Risk Bar (centered) ──────────────────────────────────────────────────
function LuckRiskBar({ score }: { score: number }) {
  const clamped  = Math.max(-50, Math.min(50, score));
  const positive = clamped >= 0;
  const pct      = Math.abs(clamped) * 2; // 0-100%

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          {positive ? "🍀" : "⚠️"} Удача / Риски
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: positive ? "#10B981" : "#EF4444",
        }}>
          {clamped > 0 ? "+" : ""}{clamped}
        </span>
      </div>
      {/* Centered track */}
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", position: "relative" }}>
        {/* Center line */}
        <div style={{
          position: "absolute", left: "50%", top: 0, bottom: 0,
          width: 1, background: "rgba(255,255,255,0.15)", zIndex: 1,
        }} />
        {/* Fill from center */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct / 2}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
          style={{
            position: "absolute",
            height: "100%",
            borderRadius: 3,
            left:       positive ? "50%" : undefined,
            right:      positive ? undefined : "50%",
            background: positive
              ? "linear-gradient(90deg, #10B981aa, #10B981)"
              : "linear-gradient(90deg, #EF4444, #EF4444aa)",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 9, color: "rgba(239,68,68,0.5)" }}>−50 Риск</span>
        <span style={{ fontSize: 9, color: "rgba(16,185,129,0.5)" }}>Удача +50</span>
      </div>
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────
function EventCard({ event, priority }: { event: RecommendationEvent; priority: "high" | "medium" }) {
  const isHigh  = priority === "high";
  const accent  = isHigh ? "#F59E0B" : "#8B5CF6";

  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 12,
      background: `${accent}08`,
      border: `1px solid ${accent}18`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: accent, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 12, fontWeight: 700, color: "var(--text-primary)", flex: 1,
        }}>
          {event.title}
        </span>
        {event.dates && (
          <span style={{ fontSize: 10, color: accent, fontWeight: 600, whiteSpace: "nowrap" }}>
            {event.dates}
          </span>
        )}
      </div>
      <p style={{
        fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5,
        margin: 0, paddingLeft: 14,
      }}>
        {event.description}
      </p>
    </div>
  );
}

// ── Period Card ───────────────────────────────────────────────────────────────
function PeriodCard({
  period,
  userId,
}: {
  period: typeof PERIODS[number];
  userId: string;
}) {
  const [loading,  setLoading]  = useState(false);
  const [data,     setData]     = useState<RecommendationData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await recommendationsAPI.generate(userId, period.key);
      setData(res.data.data);
      setExpanded(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Ошибка расчёта");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      layout
      style={{
        borderRadius: 18,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>{period.emoji}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                {period.label}
              </div>
              {data ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                  {data.date_range}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                  {period.desc}
                </div>
              )}
            </div>
          </div>

          {/* Toggle expanded if data loaded */}
          {data && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.2)",
                color: "var(--violet)",
                fontSize: 14, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>

        {/* Scales (always visible when data loaded) */}
        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <EnergyBar score={data.scales.energy_score} />
            <LuckRiskBar score={data.scales.luck_risk_score} />
          </div>
        )}

        {/* Generate button */}
        {!data && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              marginTop: 12, width: "100%",
              padding: "10px 0",
              borderRadius: 10,
              background: loading
                ? "rgba(139,92,246,0.15)"
                : "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.15))",
              border: "1px solid rgba(139,92,246,0.25)",
              color: loading ? "var(--text-muted)" : "var(--violet)",
              fontSize: 12, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {loading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: "2px solid rgba(139,92,246,0.2)",
                    borderTopColor: "var(--violet)",
                  }}
                />
                Рассчитывается...
              </>
            ) : (
              "Посмотреть рекомендацию"
            )}
          </button>
        )}

        {error && (
          <p style={{ fontSize: 11, color: "#EF4444", marginTop: 8, textAlign: "center" }}>
            {error}
          </p>
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && data && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              padding: "0 18px 18px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              paddingTop: 14,
            }}>

              {/* High priority events */}
              {data.events.high_priority.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "rgba(245,158,11,0.6)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
                  }}>
                    ⭐ Ключевые события
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.events.high_priority.map((ev, i) => (
                      <EventCard key={i} event={ev} priority="high" />
                    ))}
                  </div>
                </div>
              )}

              {/* Medium priority events */}
              {data.events.medium_priority.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.6)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
                  }}>
                    Фоновые темы
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.events.medium_priority.map((ev, i) => (
                      <EventCard key={i} event={ev} priority="medium" />
                    ))}
                  </div>
                </div>
              )}

              {/* Summary advice */}
              {data.summary_advice && (
                <div style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
                  border: "1px solid rgba(139,92,246,0.12)",
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.5)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
                  }}>
                    Напутствие
                  </div>
                  <p style={{
                    fontSize: 13, color: "var(--text-primary)",
                    lineHeight: 1.5, margin: 0,
                  }}>
                    {data.summary_advice}
                  </p>
                </div>
              )}

              {/* Refresh button */}
              <button
                onClick={async () => {
                  await recommendationsAPI.invalidate(userId, period.key);
                  setData(null);
                  setExpanded(false);
                }}
                style={{
                  marginTop: 12, width: "100%",
                  padding: "8px 0",
                  borderRadius: 8,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "var(--text-muted)",
                  fontSize: 11, cursor: "pointer",
                }}
              >
                ↻ Пересчитать
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RecommendationsTab({ userId }: { userId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{
          fontSize: 15, fontWeight: 700, color: "var(--text-primary)",
          margin: "0 0 4px",
        }}>
          Персональный прогноз
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
          Транзитные аспекты к твоей натальной карте. Нажми на период — получишь развёрнутую рекомендацию.
        </p>
      </div>
      {PERIODS.map(p => (
        <PeriodCard key={p.key} period={p} userId={userId} />
      ))}
    </div>
  );
}
