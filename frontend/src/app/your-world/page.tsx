"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR, { mutate } from "swr";
import { useUserStore, useInsightsStore, type Insight } from "@/lib/store";
import { masterHubAPI, calcAPI, profileAPI } from "@/lib/api";
import { SPHERES, SPHERE_BY_ID, INFLUENCE_SORT } from "@/lib/constants";
import SphereFilter from "@/components/SphereFilter";
import InsightCard from "@/components/InsightCard";
import InsightDetailModal from "@/components/InsightDetailModal";
import { SkeletonCard } from "@/components/Skeleton";
import BottomNav from "@/components/BottomNav";
import { useTmaSafeArea } from "@/lib/useTmaSafeArea";
import RecommendationsTab from "@/components/RecommendationsTab";

type Tab = "portrait" | "recommendations" | "breakdown" | "sides";

// ─── Portrait Lock Screen ────────────────────────────────────────────────────
function PortraitLockScreen({ activeSphereCount }: { activeSphereCount: number }) {
  const pct = Math.round((activeSphereCount / 12) * 100);
  return (
    <div style={{ padding: "48px 0 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 64, height: 64, borderRadius: 20,
          background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.14)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}
      >
        🔒
      </motion.div>

      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, lineHeight: 1.2 }}>
          {activeSphereCount}
          <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 500 }}>/12</span>
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
          сфер открыто
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: 280, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", background: "linear-gradient(90deg, var(--violet), #a78bfa)", borderRadius: 3 }}
        />
      </div>

      <p style={{
        fontSize: 13, color: "var(--text-muted)", textAlign: "center",
        maxWidth: 280, lineHeight: 1.6, margin: 0,
      }}>
        Твой истинный Аватар ещё формируется. Открой все 12 сфер, чтобы собрать полную картину своей личности.
      </p>
    </div>
  );
}

// ─── Sphere Progress Grid ────────────────────────────────────────────────────
function SphereProgressGrid({ hub }: { hub: any }) {
  const sphereSummaries: Record<string, string> = hub?.sphere_summaries || {};
  const activeSphereCount: number = hub?.active_spheres_count ?? Object.keys(sphereSummaries).length;
  const [selectedSphere, setSelectedSphere] = useState<{ id: number; name: string; color: string; summary: string } | null>(null);
  const pct = Math.round((activeSphereCount / 12) * 100);

  return (
    <div style={{ padding: "16px", borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Активные сферы
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--violet)" }}>{activeSphereCount}/12</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginBottom: 14, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ height: "100%", background: "linear-gradient(90deg, var(--violet), #a78bfa)", borderRadius: 2 }}
        />
      </div>

      {/* 12-cell grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {SPHERES.map(s => {
          const summary = sphereSummaries[String(s.id)];
          const isActive = !!summary;
          return (
            <motion.div
              key={s.id}
              whileTap={isActive ? { scale: 0.93 } : {}}
              onClick={() => isActive && setSelectedSphere({ id: s.id, name: s.name, color: s.color, summary })}
              style={{
                padding: "10px 6px", borderRadius: 12,
                background: isActive ? `${s.color}08` : "rgba(255,255,255,0.02)",
                border: `1px solid ${isActive ? `${s.color}25` : "rgba(255,255,255,0.04)"}`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                cursor: isActive ? "pointer" : "default",
                transition: "background 0.2s, border 0.2s",
              }}
            >
              {isActive ? (
                <s.icon size={13} style={{ color: s.color }} />
              ) : (
                <div style={{ width: 13, height: 13, borderRadius: 3, background: "rgba(255,255,255,0.05)" }} />
              )}
              <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? s.color : "rgba(255,255,255,0.12)", textAlign: "center", lineHeight: 1.1 }}>
                {s.id}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Sphere summary modal */}
      <AnimatePresence>
        {selectedSphere && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedSphere(null)}
            style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 340, borderRadius: 20, background: "var(--bg-card)", border: `1px solid ${selectedSphere.color}20`, padding: 24 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${selectedSphere.color}12`, border: `1px solid ${selectedSphere.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {(() => { const s = SPHERE_BY_ID[selectedSphere.id]; return s ? <s.icon size={16} style={{ color: selectedSphere.color }} /> : null; })()}
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: `${selectedSphere.color}80`, margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>Сфера {selectedSphere.id}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: selectedSphere.color, margin: 0 }}>{selectedSphere.name}</p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: "0 0 16px" }}>
                {selectedSphere.summary}
              </p>
              <button onClick={() => setSelectedSphere(null)} style={{ width: "100%", padding: "10px 0", borderRadius: 12, background: `${selectedSphere.color}12`, border: "none", color: selectedSphere.color, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Закрыть
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Portrait Tab ────────────────────────────────────────────────────────────
function PortraitTab({ hub }: { hub: any }) {
  const activeSphereCount: number = hub?.active_spheres_count ?? 0;
  const masterPortrait = hub?.master_portrait;
  const portraitSummary = hub?.portrait_summary;

  const [expandedCard, setExpandedCard] = useState<{
    label: string; value: string; description?: string; color: string;
  } | null>(null);

  // No data at all
  if (!portraitSummary && activeSphereCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--violet)", opacity: 0.4 }} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Портрет формируется</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.5 }}>
          Пройди онбординг, чтобы получить персональный архетипический портрет
        </p>
      </div>
    );
  }

  // Sphere grid is always shown at top
  // Portrait is locked until 12 spheres
  const isLocked = activeSphereCount < 12 || !masterPortrait;

  // Build attribute cards from master_portrait (preferred) or fallback to portrait_summary
  const attrs: { label: string; value: string; description?: string; color: string }[] = masterPortrait ? [
    { label: "Идентификация", value: masterPortrait.identification?.value ?? "", description: masterPortrait.identification?.description, color: "#8B5CF6" },
    { label: "Архетип",       value: masterPortrait.archetype?.value      ?? "", description: masterPortrait.archetype?.description,       color: "#3B82F6" },
    { label: "Роль",          value: masterPortrait.role?.value            ?? "", description: masterPortrait.role?.description,            color: "#10B981" },
    { label: "Энергия",       value: masterPortrait.energy?.value          ?? "", description: masterPortrait.energy?.description,          color: "#F59E0B" },
    { label: "Динамика",      value: masterPortrait.dynamics?.value        ?? "", description: masterPortrait.dynamics?.description,        color: "#EF4444" },
    { label: "Атмосфера",     value: masterPortrait.atmosphere?.value      ?? "", description: masterPortrait.atmosphere?.description,      color: "#EC4899" },
  ] : portraitSummary ? [
    { label: "Архетип",  value: portraitSummary.core_archetype,  color: "#8B5CF6" },
    { label: "Роль",     value: portraitSummary.narrative_role,   color: "#3B82F6" },
    { label: "Энергия",  value: portraitSummary.energy_type,      color: "#10B981" },
    { label: "Динамика", value: portraitSummary.current_dynamic,  color: "#F59E0B" },
  ] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Sphere progress grid — always at top */}
      <SphereProgressGrid hub={hub} />

      {/* Portrait lock screen */}
      {isLocked ? (
        <PortraitLockScreen activeSphereCount={activeSphereCount} />
      ) : (
        <>
          {/* Master portrait header */}
          <div style={{
            padding: 20, borderRadius: 16,
            background: "linear-gradient(145deg, rgba(139,92,246,0.08), rgba(59,130,246,0.04))",
            border: "1px solid rgba(139,92,246,0.15)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
              Аватар раскрыт
            </div>
            <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>
              {masterPortrait?.identification?.description ?? portraitSummary?.core_identity ?? ""}
            </p>
          </div>

          {/* Attribute cards — 2 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {attrs.map(({ label, value, description, color }) => (
              <div
                key={label}
                onClick={() => setExpandedCard({ label, value, description, color })}
                style={{
                  padding: "12px 14px", borderRadius: 14,
                  background: `${color}08`, border: `1px solid ${color}15`,
                  cursor: "pointer", minHeight: 70, display: "flex", flexDirection: "column", justifyContent: "flex-start",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: `${color}80`, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {value}
                </span>
                {description && (
                  <span style={{ fontSize: 9, color: `${color}50`, marginTop: 4, fontWeight: 500 }}>Нажми для описания</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tooltip modal (works in both locked and unlocked states) */}
      <AnimatePresence>
        {expandedCard && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setExpandedCard(null)}
            style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 340, borderRadius: 20, background: "var(--bg-card)", border: `1px solid ${expandedCard.color}25`, padding: 24 }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: `${expandedCard.color}80`, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8 }}>
                {expandedCard.label}
              </span>
              <p style={{ fontSize: 17, fontWeight: 700, color: expandedCard.color, lineHeight: 1.3, margin: "0 0 12px" }}>
                {expandedCard.value}
              </p>
              {expandedCard.description && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: "0 0 16px" }}>
                  {expandedCard.description}
                </p>
              )}
              <button onClick={() => setExpandedCard(null)} style={{ width: "100%", padding: "10px 0", borderRadius: 12, background: `${expandedCard.color}15`, border: "none", color: expandedCard.color, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Закрыть
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SphereDistribution({ hub }: { hub: any }) {
  // Kept for backward compat — renders nothing (replaced by SphereProgressGrid in PortraitTab)
  return null;
}

// ─── Breakdown Tab ───────────────────────────────────────────────────────────
function BreakdownTab({
  insights, loading, activeSphere, setActiveSphere, onSelect, userId, onRefresh,
  generating, setGenerating, dataReady,
}: {
  insights: Insight[]; loading: boolean;
  activeSphere: number | null; setActiveSphere: (id: number | null) => void;
  onSelect: (i: Insight) => void;
  userId: string | null;
  onRefresh: () => void;
  generating: number | null;
  setGenerating: (id: number | null) => void;
  dataReady: boolean;
}) {

  const insightsBySphere = useMemo(() => {
    const map: Record<number, Insight[]> = {};
    for (const ins of insights) {
      if (!map[ins.primary_sphere]) map[ins.primary_sphere] = [];
      map[ins.primary_sphere].push(ins);
    }
    // Sort within each sphere
    for (const key of Object.keys(map)) {
      map[Number(key)].sort((a, b) => (INFLUENCE_SORT[b.influence_level] || 0) - (INFLUENCE_SORT[a.influence_level] || 0));
    }
    return map;
  }, [insights]);

  const spheresToShow = useMemo(() => {
    if (activeSphere !== null) return [activeSphere];
    return SPHERES.map(s => s.id);
  }, [activeSphere]);

  const handleGenerate = async (sphereId: number) => {
    if (!userId || generating) return;
    setGenerating(sphereId);
    try {
      await calcAPI.generateSphere(userId, sphereId);
      // Force SWR to refetch fresh data
      await onRefresh();
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Ошибка генерации";
      alert(detail);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SphereFilter activeSphere={activeSphere} onSelect={setActiveSphere} />
      </div>
      {!dataReady ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {spheresToShow.map(sphereId => {
            const sphere = SPHERE_BY_ID[sphereId];
            const items = insightsBySphere[sphereId] || [];
            const isEmpty = items.length === 0;
            const isGenerating = generating === sphereId;

            return (
              <div key={sphereId}>
                {/* Sphere header */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: isEmpty ? 0 : 10, paddingLeft: 2,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: sphere?.color || "#8B5CF6",
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      {sphere?.name}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                      {sphere?.subtitle}
                    </span>
                  </div>
                  {!isEmpty && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
                      {items.length}
                    </span>
                  )}
                </div>

                {/* Content or unlock button */}
                {isEmpty ? (
                  isGenerating ? (
                    <div style={{
                      width: "100%", padding: "24px 16px",
                      marginTop: 8, borderRadius: 14,
                      background: "rgba(139,92,246,0.04)",
                      border: "1px solid rgba(139,92,246,0.12)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                    }}>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                        style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.2)", borderTopColor: "var(--violet)" }}
                      />
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--violet)", margin: 0, marginBottom: 4 }}>
                          Анализирую {sphere?.name?.toLowerCase()}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
                          Агент изучает натальную карту и формирует инсайты...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGenerate(sphereId)}
                      disabled={!!generating}
                      style={{
                        width: "100%", padding: "16px",
                        marginTop: 8, borderRadius: 14,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px dashed rgba(255,255,255,0.1)",
                        cursor: generating ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        color: generating ? "rgba(255,255,255,0.15)" : "var(--text-muted)",
                        fontSize: 13, fontWeight: 500,
                        transition: "all 0.2s",
                        opacity: generating ? 0.5 : 1,
                      }}
                    >
                      Собрать разбор · 10 ⚡
                    </button>
                  )
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((insight, idx) => (
                      <InsightCard
                        key={insight.id || `${insight.primary_sphere}-${idx}`}
                        insight={insight}
                        onClick={() => onSelect(insight)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Sides Tab ───────────────────────────────────────────────────────────────
function SidesTab({ insights }: { insights: Insight[] }) {
  const [activeSphere, setActiveSphere] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const filtered = activeSphere !== null ? insights.filter(i => i.primary_sphere === activeSphere) : insights;
    const map: Record<number, Insight[]> = {};
    for (const ins of filtered) {
      if (!map[ins.primary_sphere]) map[ins.primary_sphere] = [];
      map[ins.primary_sphere].push(ins);
    }
    return Object.entries(map)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([id, items]) => ({ sphereId: parseInt(id), items }));
  }, [insights, activeSphere]);

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--violet)", opacity: 0.4 }} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
          Стороны не определены
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.5 }}>
          Пройди онбординг, чтобы раскрыть свет и тень каждой сферы
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SphereFilter activeSphere={activeSphere} onSelect={setActiveSphere} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSphere ?? "all"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {grouped.map(({ sphereId, items }) => {
            const sphere = SPHERE_BY_ID[sphereId];
            const lights = items.map(i => i.light_aspect).filter(Boolean);
            const shadows = items.map(i => i.shadow_aspect).filter(Boolean);

            return (
              <div key={sphereId} style={{
                borderRadius: 16, overflow: "hidden",
                border: `1px solid ${sphere?.color || "#fff"}12`,
                background: "rgba(255,255,255,0.01)",
              }}>
                {/* Sphere header */}
                <div style={{
                  padding: "12px 16px",
                  background: `${sphere?.color || "#fff"}08`,
                  borderBottom: `1px solid ${sphere?.color || "#fff"}10`,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  {sphere && (
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: `${sphere.color}10`, border: `1px solid ${sphere.color}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <sphere.icon size={13} style={{ color: sphere.color }} />
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      {sphere?.name}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                      {sphere?.subtitle}
                    </span>
                  </div>
                </div>

                {/* Light + Shadow */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{
                    padding: 14,
                    borderRight: "1px solid rgba(255,255,255,0.04)",
                    background: "rgba(16,185,129,0.02)",
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: "#10B981",
                      textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10,
                    }}>Свет</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {lights.slice(0, 3).map((text, i) => (
                        <p key={i} style={{
                          fontSize: 12, color: "rgba(255,255,255,0.6)",
                          lineHeight: 1.4, fontWeight: 400, margin: 0,
                          display: "flex", gap: 6, alignItems: "flex-start",
                        }}>
                          <span style={{ color: "#10B981", opacity: 0.5, flexShrink: 0 }}>·</span>
                          {text}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    padding: 14,
                    background: "rgba(239,68,68,0.02)",
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: "#EF4444",
                      textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10,
                    }}>Тень</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {shadows.slice(0, 3).map((text, i) => (
                        <p key={i} style={{
                          fontSize: 12, color: "rgba(255,255,255,0.5)",
                          lineHeight: 1.4, fontWeight: 400, margin: 0,
                          display: "flex", gap: 6, alignItems: "flex-start",
                        }}>
                          <span style={{ color: "#EF4444", opacity: 0.4, flexShrink: 0 }}>·</span>
                          {text}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// ─── Pipeline Loading Screen ─────────────────────────────────────────────────
function PipelineStep({ label, index }: { label: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.4, duration: 0.4 }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", borderRadius: 10,
        background: "rgba(139,92,246,0.04)",
        border: "1px solid rgba(139,92,246,0.10)",
      }}
    >
      <motion.div
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.8, repeat: Infinity, delay: index * 0.45 }}
        style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--violet)", flexShrink: 0 }}
      />
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{label}</span>
    </motion.div>
  );
}

function PipelineLoading() {
  const steps = [
    "Расчёт натальной карты",
    "Анализ 12 сфер жизни",
    "Формирование инсайтов",
    "Сборка архетипного портрета",
  ];
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "60px 20px", textAlign: "center",
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        style={{
          width: 52, height: 52, borderRadius: "50%",
          border: "2px solid rgba(139,92,246,0.12)",
          borderTopColor: "var(--violet)",
          marginBottom: 24,
        }}
      />
      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
        Строится твой мир
      </p>
      <p style={{
        fontSize: 12, color: "var(--text-muted)", maxWidth: 260,
        lineHeight: 1.6, marginBottom: 24,
      }}>
        12 агентов параллельно анализируют натальную карту — обычно 1–2 минуты
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 300 }}>
        {steps.map((s, i) => <PipelineStep key={i} label={s} index={i} />)}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function YourWorldPage() {
  const tmaSafeTop = useTmaSafeArea();
  const { userId, hubData, setHubData } = useUserStore();
  const { activeSphere, setActiveSphere } = useInsightsStore();
  const [activeTab, setActiveTab] = useState<Tab>("portrait");
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [generatingSphere, setGeneratingSphere] = useState<number | null>(null);

  const { data: userProfile } = useSWR(
    userId ? ["profile", userId] : null,
    () => profileAPI.get(userId!).then(res => res.data),
    { revalidateOnFocus: false }
  );

  const { data: hub, isValidating: loading } = useSWR(
    userId ? ["master-hub", userId] : null,
    async () => {
      const res = await masterHubAPI.get(userId!);
      return res.data;
    },
    {
      revalidateOnFocus: false,
      refreshInterval: (data: any) => data?.status === "pending" ? 4000 : 0,
      // Show cached data instantly on re-entry, revalidate in background
      fallbackData: hubData ?? undefined,
      onSuccess: (data) => {
        if (data && data.status !== "pending") setHubData(data);
      },
    }
  );

  // Derive insights directly from hub — avoids Zustand persistence issues and SWR key collisions
  const insights = useMemo<Insight[]>(() => {
    if (!hub || hub.status === "pending") return [];
    const result: Insight[] = [];
    const systems = hub.insights || {};
    Object.keys(systems).forEach(sys => {
      const spheres = systems[sys];
      Object.keys(spheres).forEach(sphereId => {
        spheres[sphereId].forEach((item: any, rank: number) => {
          result.push({
            ...item,
            id: item.id || `${sys}-${sphereId}-${rank}`,
            system: sys,
            primary_sphere: parseInt(sphereId),
            rank: item.rank ?? rank,
          });
        });
      });
    });
    return result;
  }, [hub]);

  const isPending = hub?.status === "pending";
  const totalCount = insights.length;
  const sphereCount = new Set(insights.map(i => i.primary_sphere)).size;

  const TABS: { id: Tab; label: string }[] = [
    { id: "portrait",        label: "Портрет" },
    { id: "recommendations", label: "Прогноз" },
    { id: "breakdown",       label: "Разбор" },
    { id: "sides",           label: "Стороны" },
  ];

  return (
    <div className="flex flex-col" style={{ background: "var(--bg-deep)", height: "100dvh", overflow: "hidden", paddingTop: tmaSafeTop > 0 ? tmaSafeTop : undefined }}>

      {/* Header */}
      <div style={{ padding: "6px 20px 8px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{
          fontSize: 22, fontWeight: 800, fontFamily: "'Outfit', sans-serif",
          margin: 0,
          background: "linear-gradient(135deg, var(--violet-l), var(--violet))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Твой мир
        </h1>
        {hub?.status === "pending" ? (
          <motion.span
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            style={{ fontSize: 11, color: "var(--violet)", fontWeight: 500 }}
          >
            вычисляется...
          </motion.span>
        ) : totalCount > 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
            {totalCount} · {sphereCount} сфер
          </span>
        ) : null}
      </div>

      {/* Tab switcher */}
      <div className="px-4 mb-3">
        <div
          className="grid grid-cols-4 gap-1 p-1"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 14,
          }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 4px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500,
                transition: "all 0.2s",
                background: activeTab === tab.id ? "rgba(255,255,255,0.1)" : "transparent",
                color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content — scrollable */}
      <div style={{ flex: 1, padding: "0 20px", overflowY: "auto", paddingBottom: 90, WebkitOverflowScrolling: "touch" }}>
        {hub?.status === "pending" ? (
          <PipelineLoading />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "portrait" && <PortraitTab hub={hub} />}
              {activeTab === "breakdown" && (
                <BreakdownTab
                  insights={insights} loading={loading}
                  activeSphere={activeSphere} setActiveSphere={setActiveSphere}
                  onSelect={setSelectedInsight}
                  userId={userId}
                  onRefresh={() => mutate(["master-hub", userId])}
                  generating={generatingSphere}
                  setGenerating={setGeneratingSphere}
                  dataReady={!!hub && hub.status !== "pending"}
                />
              )}
              {activeTab === "sides" && <SidesTab insights={insights} />}
              {activeTab === "recommendations" && userId && (
                <RecommendationsTab
                  userId={userId}
                  currentLocation={userProfile?.current_location ?? null}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {selectedInsight && (
          <InsightDetailModal
            insight={selectedInsight}
            onClose={() => setSelectedInsight(null)}
            natalPositions={hub?.natal_positions ?? []}
            natalAspects={hub?.natal_aspects ?? []}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
