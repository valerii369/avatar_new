"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
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

type Tab = "portrait" | "recommendations" | "breakdown";

// ─── Energy Toast ─────────────────────────────────────────────────────────────
function Toast({ type, title, message, onClose }: {
  type: "energy" | "error";
  title: string;
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const isEnergy = type === "energy";

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      style={{
        position: "fixed",
        bottom: 96,
        left: 16,
        right: 16,
        zIndex: 9999,
        background: isEnergy
          ? "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(239,68,68,0.12) 100%)"
          : "linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(139,92,246,0.08) 100%)",
        border: isEnergy
          ? "1px solid rgba(245,158,11,0.35)"
          : "1px solid rgba(239,68,68,0.30)",
        borderRadius: 18,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
      onClick={onClose}
    >
      <span style={{ fontSize: 26 }}>{isEnergy ? "⚡️" : "⚠️"}</span>
      <div style={{ flex: 1 }}>
        <p style={{
          fontSize: 14, fontWeight: 700, margin: 0, marginBottom: 2,
          color: isEnergy ? "#F59E0B" : "#EF4444",
        }}>
          {title}
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0 }}>
          {message}
        </p>
      </div>
    </motion.div>
  );
}

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

// ─── Portrait Tab ────────────────────────────────────────────────────────────
function PortraitTab({ hub, insights, onSphereClick, userId, onGenerateSphere, generating }: {
  hub: any;
  insights: Insight[];
  onSphereClick: (data: { sphereId: number; name: string; color: string; summary: string; archetype: string }) => void;
  userId: string | null;
  onGenerateSphere: (sphereId: number) => Promise<void>;
  generating: number | null;
}) {
  const activeSphereCount: number = hub?.active_spheres_count ?? 0;
  const masterPortrait = hub?.master_portrait;
  const portraitSummary = hub?.portrait_summary;
  const sphereSummaries: Record<string, string> = hub?.sphere_summaries || {};
  const sphereArchetypes: Record<string, string> = hub?.sphere_archetypes || {};
  const natalPositions: any[] = hub?.natal_positions || [];
  const polarities = hub?.deep_profile_data?.polarities;

  const [modal, setModal] = useState<{
    type: "attr" | "sphere";
    label?: string; value?: string; description?: string; color?: string;
    sphereId?: number; name?: string; summary?: string; archetype?: string;
  } | null>(null);

  // No data at all
  if (!portraitSummary && activeSphereCount === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
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

  // Build master portrait attribute cards
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

  // Key natal positions for astro strip
  const KEY_PLANETS = ["sun", "moon", "asc", "mercury", "venus"];
  const PLANET_EMOJI: Record<string, string> = { sun: "☀️", moon: "🌙", asc: "↑", mercury: "☿", venus: "♀" };
  const astroStrip = natalPositions.filter(p => KEY_PLANETS.includes(p.key)).slice(0, 4);

  const pct = Math.round((activeSphereCount / 12) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── МАСТЕР-ПОРТРЕТ (если готов) ── */}
      {masterPortrait && (
        <>
          <div style={{
            padding: "18px 20px", borderRadius: 16,
            background: "linear-gradient(145deg, rgba(139,92,246,0.1), rgba(59,130,246,0.05))",
            border: "1px solid rgba(139,92,246,0.18)",
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(139,92,246,0.55)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>
              ✦ Аватар собран
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.55, margin: 0 }}>
              {masterPortrait?.identification?.description ?? portraitSummary?.core_identity ?? ""}
            </p>
          </div>

          {/* Attribute cards 2×3 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {attrs.map(({ label, value, description, color }) => (
              <motion.div
                key={label}
                whileTap={{ scale: 0.97 }}
                onClick={() => setModal({ type: "attr", label, value, description, color })}
                style={{
                  padding: "12px 14px", borderRadius: 14,
                  background: `${color}08`, border: `1px solid ${color}18`,
                  cursor: "pointer", minHeight: 72, display: "flex", flexDirection: "column",
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: `${color}70`, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 5 }}>
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3, flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {value}
                </span>
                {description && (
                  <span style={{ fontSize: 9, color: `${color}40`, marginTop: 4 }}>↗ подробнее</span>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ── 12 ГРАНЕЙ АВАТАРА ── */}
      <div style={{ borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", overflow: "hidden" }}>
        {/* Header + progress */}
        <div style={{ padding: "14px 16px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              12 Граней Аватара
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--violet)" }}>{activeSphereCount}/12</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{ height: "100%", background: "linear-gradient(90deg, var(--violet), #a78bfa)", borderRadius: 2 }}
            />
          </div>
        </div>

        {/* Lock hint under progress bar */}
        {activeSphereCount < 12 && activeSphereCount > 0 && (
          <div style={{ padding: "5px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.4 }}>
              Открой все 12 сфер, чтобы разблокировать мастер-портрет
            </p>
          </div>
        )}

        {/* 2-column facet cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "rgba(255,255,255,0.04)" }}>
          {SPHERES.map((s, idx) => {
            const summary = sphereSummaries[String(s.id)];
            const archetype = sphereArchetypes[String(s.id)];
            const isActive = !!summary;
            const isLast = idx === SPHERES.length - 1;
            return (
              <motion.div
                key={s.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (isActive) {
                    onSphereClick({ sphereId: s.id, name: s.name, color: s.color, summary: summary || "", archetype: archetype || "" });
                  } else if (userId) {
                    onGenerateSphere(s.id);
                  }
                }}
                style={{
                  padding: "10px 12px",
                  background: isActive ? `${s.color}06` : "rgba(10,10,15,0.95)",
                  cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 6,
                  transition: "background 0.2s",
                  gridColumn: isLast && SPHERES.length % 2 !== 0 ? "1 / -1" : undefined,
                }}
              >
                {/* Sphere name capsule */}
                <div style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "4px 10px", borderRadius: 16,
                  background: isActive ? `${s.color}12` : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isActive ? `${s.color}30` : "rgba(255,255,255,0.12)"}`,
                  width: "fit-content",
                }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? s.color : "rgba(255,255,255,0.3)" }}>
                    {s.id} · {s.name}
                  </span>
                </div>

                {isActive ? (
                  <>
                    <p style={{
                      fontSize: 13, fontWeight: 700, color: s.color,
                      margin: 0, lineHeight: 1.3,
                      display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>
                      {archetype || "..."}
                    </p>
                    <p style={{
                      fontSize: 11, color: "rgba(255,255,255,0.4)",
                      margin: 0, lineHeight: 1.4,
                      display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>
                      {summary}
                    </p>
                  </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {generating === s.id ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                        style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.15)", borderTopColor: "var(--text-muted)" }}
                      />
                    ) : (
                      <>
                        <p style={{
                          fontSize: 13, fontWeight: 700,
                          color: "rgba(255,255,255,0.25)",
                          margin: 0, lineHeight: 1.3,
                        }}>
                          Сфера не открыта
                        </p>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                          <p style={{ margin: 0 }}>Открыть · 10 ⚡</p>
                          <p style={{ margin: 0 }}>Нажми для разблокировки</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── MODAL (attr card or sphere facet) ── */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setModal(null)}
            style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 340, borderRadius: 20, background: "var(--bg-card)", padding: 24, border: `1px solid ${(modal.color || "#8B5CF6")}20` }}
            >
              <>
                <span style={{ fontSize: 9, fontWeight: 700, color: `${modal.color}70`, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8 }}>
                  {modal.label}
                </span>
                <p style={{ fontSize: 17, fontWeight: 700, color: modal.color, lineHeight: 1.3, margin: "0 0 12px" }}>
                  {modal.value}
                </p>
                {modal.description && (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: "0 0 16px" }}>
                    {modal.description}
                  </p>
                )}
              </>
              <button
                onClick={() => setModal(null)}
                style={{ width: "100%", padding: "10px 0", borderRadius: 12, background: `${(modal.color || "#8B5CF6")}12`, border: "none", color: modal.color || "#8B5CF6", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
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
  const [toast, setToast] = useState<{ type: "energy" | "error"; title: string; message: string } | null>(null);

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
      const status = err.response?.status;
      const detail = err.response?.data?.detail || "Ошибка генерации";
      if (status === 402) {
        setToast({ type: "energy", title: "Не хватает энергии", message: "Пополни энергию через промокод или реферальную программу" });
      } else {
        setToast({ type: "error", title: "Ошибка генерации", message: "Попробуй ещё раз — сервер временно недоступен" });
      }
    } finally {
      setGenerating(null);
    }
  };

  return (
    <>
      <AnimatePresence>
        {toast && (
          <Toast
            type={toast.type}
            title={toast.title}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>
      <div style={{ marginBottom: 16 }}>
        <SphereFilter activeSphere={activeSphere} onSelect={setActiveSphere} showAll={false} />
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
                      Получить разбор · 10 ⚡
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

// ─── Sphere Detail View (full-screen, replaces popup) ────────────────────────
function SphereDetailView({ sphereId, name, color, summary, archetype, insights, onClose }: {
  sphereId: number; name: string; color: string; summary: string; archetype: string;
  insights: Insight[]; onClose: () => void;
}) {
  const sphere = SPHERE_BY_ID[sphereId];
  const sphereInsights = insights.filter(i => i.primary_sphere === sphereId);
  const lights = sphereInsights.map(i => i.light_aspect).filter(Boolean);
  const shadows = sphereInsights.map(i => i.shadow_aspect).filter(Boolean);

  const tmaSafeTop = useTmaSafeArea();

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "var(--bg-deep)",
        display: "flex", flexDirection: "column",
        paddingTop: tmaSafeTop > 0 ? tmaSafeTop : undefined,
      }}
    >
      {/* Header — matches InsightDetailModal style exactly */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px 12px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            padding: "3px 10px", borderRadius: 20,
            fontSize: 11, fontWeight: 500,
            color: color,
            background: `${color}10`,
            border: `1px solid ${color}`,
          }}>
            {name}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>·</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Сфера {sphereId}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 34, height: 34, borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)",
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Body — scrollable */}
      <div style={{
        flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
        padding: "20px 20px 40px",
        display: "flex", flexDirection: "column", gap: 22,
      }}>
        {/* Archetype */}
        {archetype && (
          <div style={{ display: "inline-block" }}>
            <div style={{ padding: "5px 14px", borderRadius: 10, background: `${color}10`, border: `1px solid ${color}20`, display: "inline-block" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color }}>{archetype}</span>
            </div>
          </div>
        )}

        {/* Summary */}
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.65, margin: 0 }}>
          {summary}
        </p>

        {/* Тень — red left border, first */}
        {shadows.length > 0 && (
          <div style={{ paddingLeft: 16, borderLeft: "2px solid rgba(239,68,68,0.45)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, color: "#EF4444" }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Тень</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {shadows.map((text, i) => (
                <p key={i} style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: 0 }}>
                  {text}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Свет — green left border, after */}
        {lights.length > 0 && (
          <div style={{ paddingLeft: 16, borderLeft: "2px solid rgba(16,185,129,0.45)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, color: "#10B981" }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Свет</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {lights.map((text, i) => (
                <p key={i} style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0 }}>
                  {text}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer button — matches InsightDetailModal */}
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

function PipelineLoading({ onRetry }: { onRetry?: () => void }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8 * 60 * 1000); // 8 min
    return () => clearTimeout(t);
  }, []);

  const steps = [
    "Расчёт натальной карты",
    "Анализ 12 сфер жизни",
    "Формирование инсайтов",
    "Сборка архетипного портрета",
  ];

  if (timedOut) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "60px 20px", textAlign: "center",
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16, marginBottom: 20,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24,
        }}>
          ⚠️
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Анализ затянулся
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.6, marginBottom: 24 }}>
          Расчёт занял дольше обычного. Попробуй обновить страницу — данные могли уже сохраниться.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: "12px 28px", borderRadius: 14,
              background: "var(--violet)", color: "#fff",
              border: "none", fontSize: 14, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
        )}
      </div>
    );
  }

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
        Агенты анализируют натальную карту и формируют инсайты — обычно 2–5 минут
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
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "portrait";
    const saved = localStorage.getItem("your-world-tab");
    return (saved === "portrait" || saved === "recommendations" || saved === "breakdown") ? saved : "portrait";
  });
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [selectedSphere, setSelectedSphere] = useState<{ sphereId: number; name: string; color: string; summary: string; archetype: string } | null>(null);
  const [generatingSphere, setGeneratingSphere] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("generating-sphere");
    return saved ? parseInt(saved) : null;
  });

  const handleGenerateSphere = async (sphereId: number) => {
    if (!userId || generatingSphere) return;
    setGeneratingSphere(sphereId);
    try {
      await calcAPI.generateSphere(userId, sphereId);
      // Force SWR to refetch fresh data
      await mutate(["master-hub", userId]);
    } catch (err: any) {
      console.error("Generate sphere error", err);
    } finally {
      setGeneratingSphere(null);
    }
  };

  // Sync generatingSphere to localStorage and clear when sphere appears in hub
  useEffect(() => {
    if (generatingSphere) {
      localStorage.setItem("generating-sphere", String(generatingSphere));
    } else {
      localStorage.removeItem("generating-sphere");
    }
  }, [generatingSphere]);

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
      refreshInterval: (data: any) => {
        // Poll more frequently if a sphere is generating
        if (generatingSphere) return 2000;
        // Normal polling if pending
        if (!data || data?.status === "pending") return 4000;
        return 0;
      },
      // Show cached data instantly on re-entry, revalidate in background
      fallbackData: hubData ?? undefined,
      onSuccess: (data) => {
        if (data && data.status !== "pending") setHubData(data);
      },
    }
  );

  // Clear generating state when sphere is actually unlocked
  useEffect(() => {
    if (!generatingSphere || !hub) return;
    const sphereSummaries = hub?.sphere_summaries || {};
    if (sphereSummaries[String(generatingSphere)]) {
      setGeneratingSphere(null);
    }
  }, [hub, generatingSphere]);

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
  // If hub is "pending" but profile says pipeline_started=false → pipeline failed (not running)
  const pipelineFailed = isPending && userProfile && userProfile.pipeline_started === false;
  const totalCount = insights.length;
  const sphereCount = new Set(insights.map(i => i.primary_sphere)).size;

  const TABS: { id: Tab; label: string }[] = [
    { id: "portrait",        label: "Портрет" },
    { id: "breakdown",       label: "Разбор" },
    { id: "recommendations", label: "Прогноз" },
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
        {hub?.status === "pending" && !pipelineFailed ? (
          <motion.span
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            style={{ fontSize: 11, color: "var(--violet)", fontWeight: 500 }}
          >
            вычисляется...
          </motion.span>
        ) : totalCount > 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
            {totalCount} фактов · {sphereCount} сфер
          </span>
        ) : null}
      </div>

      {/* Tab switcher */}
      <div className="px-4 mb-3">
        <div
          className="grid grid-cols-3 gap-1 p-1"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 14,
          }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); localStorage.setItem("your-world-tab", tab.id); }}
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
          pipelineFailed ? (
            // Pipeline failed — show error immediately, don't spin forever
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, marginBottom: 20, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                ⚠️
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Что-то пошло не так
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.6, marginBottom: 24 }}>
                Расчёт прервался. Пройди онбординг ещё раз — это займёт пару минут.
              </p>
            </div>
          ) : (
            <PipelineLoading onRetry={() => mutate(["master-hub", userId])} />
          )
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "portrait" && <PortraitTab hub={hub} insights={insights} onSphereClick={setSelectedSphere} userId={userId} onGenerateSphere={handleGenerateSphere} generating={generatingSphere} />}
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

      <AnimatePresence>
        {selectedSphere && (
          <SphereDetailView
            {...selectedSphere}
            insights={insights}
            onClose={() => setSelectedSphere(null)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
