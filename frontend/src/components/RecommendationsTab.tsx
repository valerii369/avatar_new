"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { recommendationsAPI } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
type PeriodKey = "week" | "month" | "quarter" | "year";

interface RecommendationEvent {
  sphere?: number;
  title: string;
  description: string;
  dates: string;
}

// ── Sphere metadata ───────────────────────────────────────────────────────────
const SPHERE_NAMES: Record<number, string> = {
  1:  "Личность",    2:  "Ресурсы",      3:  "Связи",
  4:  "Корни",       5:  "Творчество",   6:  "Служение",
  7:  "Партнёрство", 8:  "Психология",   9:  "Мировоззрение",
  10: "Реализация",  11: "Сообщества",   12: "Запредельное",
};

const SPHERE_COLORS: Record<number, string> = {
  1:  "#F87171",  2:  "#FBBF24",  3:  "#34D399",
  4:  "#60A5FA",  5:  "#F472B6",  6:  "#A3E635",
  7:  "#FB923C",  8:  "#C084FC",  9:  "#38BDF8",
  10: "#4ADE80",  11: "#818CF8",  12: "#94A3B8",
};

interface RecommendationData {
  period: string;
  date_range: string;
  scales: {
    energy_score: number;
    luck_risk_score: number;
  };
  events: {
    high_priority: RecommendationEvent[];
    medium_priority: RecommendationEvent[];
  };
  summary_advice: string;
}

interface StoredRec {
  id: string;
  period: string;
  date_from: string;  // "YYYY-MM-DD"
  date_to: string;    // "YYYY-MM-DD"
  result: RecommendationData;
  created_at: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const PERIODS: { key: PeriodKey; label: string; emoji: string }[] = [
  { key: "week",    label: "Неделя",  emoji: "🗓" },
  { key: "month",   label: "Месяц",   emoji: "🌙" },
  { key: "quarter", label: "Квартал", emoji: "🌿" },
  { key: "year",    label: "Год",     emoji: "⭐" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Is the stored recommendation's period already over? */
function isExpired(dateToStr: string): boolean {
  const d = new Date(dateToStr); // "YYYY-MM-DD"
  d.setHours(23, 59, 59, 999);
  return new Date() > d;
}

/** Does the list need a "generate new" button? (no items OR latest is expired) */
function needsNewCard(items: StoredRec[]): boolean {
  if (items.length === 0) return true;
  return isExpired(items[0].date_to);
}

// ── Energy Bar ────────────────────────────────────────────────────────────────
function EnergyBar({ score }: { score: number }) {
  const pct   = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? "#10B981" : pct >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>🔋 Энергия</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg, #F59E0B, ${color})` }}
        />
      </div>
    </div>
  );
}

// ── Luck/Risk Bar (centered) ──────────────────────────────────────────────────
function LuckRiskBar({ score }: { score: number }) {
  const clamped  = Math.max(-50, Math.min(50, score));
  const positive = clamped >= 0;
  const pct      = Math.abs(clamped) * 2;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          {positive ? "🍀" : "⚠️"} Удача / Риски
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: positive ? "#10B981" : "#EF4444" }}>
          {clamped > 0 ? "+" : ""}{clamped}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", position: "relative" }}>
        <div style={{
          position: "absolute", left: "50%", top: 0, bottom: 0,
          width: 1, background: "rgba(255,255,255,0.15)", zIndex: 1,
        }} />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct / 2}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
          style={{
            position: "absolute", height: "100%", borderRadius: 3,
            left:  positive ? "50%" : undefined,
            right: positive ? undefined : "50%",
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

// ── Event Item ────────────────────────────────────────────────────────────────
function EventItem({ event, priority }: { event: RecommendationEvent; priority: "high" | "medium" }) {
  const accent      = priority === "high" ? "#F59E0B" : "#8B5CF6";
  const sphereColor = event.sphere ? (SPHERE_COLORS[event.sphere] ?? accent) : accent;
  const sphereName  = event.sphere ? (SPHERE_NAMES[event.sphere]  ?? `Сфера ${event.sphere}`) : null;

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: `${accent}08`, border: `1px solid ${accent}18`,
    }}>
      {/* Row 1: sphere badge + date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        {sphereName ? (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: sphereColor,
            background: `${sphereColor}18`, border: `1px solid ${sphereColor}30`,
            borderRadius: 5, padding: "2px 7px",
          }}>
            {event.sphere} · {sphereName}
          </span>
        ) : (
          <span />
        )}
        {event.dates && (
          <span style={{ fontSize: 10, color: accent, fontWeight: 600, whiteSpace: "nowrap" }}>
            {event.dates}
          </span>
        )}
      </div>
      {/* Row 2: title */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: accent, flexShrink: 0, marginTop: 4 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35 }}>
          {event.title}
        </span>
      </div>
      {/* Row 3: description */}
      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, paddingLeft: 13 }}>
        {event.description}
      </p>
    </div>
  );
}

// ── Recommendation Card (expandable) ─────────────────────────────────────────
function RecCard({
  rec,
  userId,
  onDeleted,
  defaultExpanded,
}: {
  rec: StoredRec;
  userId: string;
  onDeleted: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [deleting, setDeleting] = useState(false);
  const data = rec.result;
  const expired = isExpired(rec.date_to);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await recommendationsAPI.invalidate(userId, rec.period);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      layout
      style={{
        borderRadius: 18,
        background: "rgba(255,255,255,0.03)",
        border: expired
          ? "1px solid rgba(255,255,255,0.04)"
          : "1px solid rgba(139,92,246,0.15)",
        overflow: "hidden",
        opacity: expired ? 0.72 : 1,
      }}
    >
      {/* ── Header (always visible) ── */}
      <div
        style={{ padding: "16px 18px", cursor: "pointer" }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {data.date_range}
            </div>
            {expired && (
              <div style={{ fontSize: 10, color: "rgba(239,68,68,0.5)", marginTop: 2 }}>
                Период завершён
              </div>
            )}
          </div>
          {/* Chevron */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1 }}
          >
            ▼
          </motion.div>
        </div>

        {/* Scales — always visible */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <EnergyBar score={data.scales.energy_score} />
          <LuckRiskBar score={data.scales.luck_risk_score} />
        </div>
      </div>

      {/* ── Expanded detail ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
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
              display: "flex", flexDirection: "column", gap: 12,
            }}>

              {/* High priority */}
              {data.events.high_priority.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "rgba(245,158,11,0.6)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
                  }}>
                    ⭐ Ключевые события
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.events.high_priority.map((ev, i) => (
                      <EventItem key={i} event={ev} priority="high" />
                    ))}
                  </div>
                </div>
              )}

              {/* Medium priority */}
              {data.events.medium_priority.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.6)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
                  }}>
                    Фоновые темы
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.events.medium_priority.map((ev, i) => (
                      <EventItem key={i} event={ev} priority="medium" />
                    ))}
                  </div>
                </div>
              )}

              {/* Summary advice */}
              {data.summary_advice && (
                <div style={{
                  padding: "12px 14px", borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
                  border: "1px solid rgba(139,92,246,0.12)",
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.5)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
                  }}>
                    Напутствие
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>
                    {data.summary_advice}
                  </p>
                </div>
              )}

              {/* Delete (only for current active period) */}
              {!expired && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  disabled={deleting}
                  style={{
                    width: "100%", padding: "8px 0", borderRadius: 8,
                    background: "transparent", border: "1px solid rgba(255,255,255,0.06)",
                    color: "var(--text-muted)", fontSize: 11, cursor: "pointer",
                    opacity: deleting ? 0.5 : 1,
                  }}
                >
                  ↻ Пересчитать
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Generate Button ───────────────────────────────────────────────────────────
function GenerateButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width: "100%", padding: "12px 0", borderRadius: 14,
        background: loading
          ? "rgba(139,92,246,0.1)"
          : "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.12))",
        border: "1px solid rgba(139,92,246,0.3)",
        color: loading ? "var(--text-muted)" : "var(--violet)",
        fontSize: 13, fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        transition: "all 0.2s",
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
        "✦ Посмотреть рекомендацию"
      )}
    </button>
  );
}

// ── Location Guard Modal ───────────────────────────────────────────────────────
function LocationGuardModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 320, borderRadius: 24,
          background: "var(--bg-card)",
          border: "1px solid rgba(139,92,246,0.2)",
          padding: 24, textAlign: "center",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, margin: "0 auto 16px",
        }}>
          📍
        </div>

        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Укажи местоположение
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 20 }}>
          Для точного расчёта транзитных аспектов необходима твоя текущая геолокация. Укажи её в профиле.
        </p>

        <button
          onClick={() => router.push("/profile")}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 14,
            background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.12))",
            border: "1px solid rgba(139,92,246,0.3)",
            color: "var(--violet)", fontSize: 13, fontWeight: 700, cursor: "pointer",
            marginBottom: 10,
          }}
        >
          Открыть Профиль →
        </button>

        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "8px 0", background: "transparent",
            border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer",
          }}
        >
          Закрыть
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RecommendationsTab({
  userId,
  currentLocation,
}: {
  userId: string;
  currentLocation?: string | null;
}) {
  const [activePeriod,    setActivePeriod]    = useState<PeriodKey>("week");
  const [items,           setItems]           = useState<StoredRec[]>([]);
  const [loadingList,     setLoadingList]     = useState(false);
  const [generating,      setGenerating]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [showLocModal,    setShowLocModal]    = useState(false);

  // ── Load list when period changes ────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await recommendationsAPI.list(userId, activePeriod);
      setItems(res.data.items || []);
    } catch {
      setError("Не удалось загрузить список");
    } finally {
      setLoadingList(false);
    }
  }, [userId, activePeriod]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // ── Generate new recommendation ──────────────────────────────────────────
  const handleGenerate = async () => {
    if (generating) return;
    // Block if we know location is missing (null = loaded but empty)
    if (currentLocation === null || currentLocation === "") {
      setShowLocModal(true);
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await recommendationsAPI.generate(userId, activePeriod);
      await loadList();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Ошибка расчёта");
    } finally {
      setGenerating(false);
    }
  };

  const showGenerateBtn = !loadingList && needsNewCard(items);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
          Персональный прогноз
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
          Транзитные аспекты к твоей натальной карте.
        </p>
      </div>

      {/* ── Period filter pills ── */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {PERIODS.map(p => {
          const isActive = activePeriod === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setActivePeriod(p.key)}
              className="flex-none px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap"
              style={{
                background: isActive ? "rgba(139,92,246,0.1)" : "transparent",
                color:      isActive ? "var(--violet-l)" : "var(--text-muted)",
                border:     `1px solid ${isActive ? "var(--violet-l)" : "var(--border)"}`,
              }}
            >
              {p.emoji} {p.label}
            </button>
          );
        })}
      </div>

      {/* ── Error ── */}
      {error && (
        <p style={{ fontSize: 12, color: "#EF4444", textAlign: "center", margin: 0 }}>{error}</p>
      )}

      {/* ── Generate button (when period expired or first time) ── */}
      <AnimatePresence>
        {showGenerateBtn && (
          <motion.div
            key="generate-btn"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <GenerateButton loading={generating} onClick={handleGenerate} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List loading skeleton ── */}
      {loadingList && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2].map(i => (
            <div
              key={i}
              style={{
                height: 110, borderRadius: 18,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            />
          ))}
        </div>
      )}

      {/* ── Cards list ── */}
      {!loadingList && (
        <AnimatePresence mode="popLayout">
          {items.length === 0 && !showGenerateBtn && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}
            >
              Ещё нет прогнозов для этого периода
            </motion.div>
          )}
          {items.map((rec, idx) => (
            <motion.div
              key={rec.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, delay: idx * 0.04 }}
            >
              <RecCard
                rec={rec}
                userId={userId}
                onDeleted={loadList}
                defaultExpanded={idx === 0 && !isExpired(rec.date_to)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      )}

      {/* ── Location guard modal ── */}
      <AnimatePresence>
        {showLocModal && (
          <LocationGuardModal onClose={() => setShowLocModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
