"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR, { mutate } from "swr";
import { useUserStore, useInsightsStore, type Insight } from "@/lib/store";
import { masterHubAPI, calcAPI } from "@/lib/api";
import { SPHERES, SPHERE_BY_ID, INFLUENCE_SORT } from "@/lib/constants";
import SphereFilter from "@/components/SphereFilter";
import InsightCard from "@/components/InsightCard";
import InsightDetailModal from "@/components/InsightDetailModal";
import { SkeletonCard } from "@/components/Skeleton";
import BottomNav from "@/components/BottomNav";
import { useTmaSafeArea } from "@/lib/useTmaSafeArea";

type Tab = "portrait" | "breakdown" | "sides";

// ─── Portrait Tab ────────────────────────────────────────────────────────────
function PortraitTab({ hub }: { hub: any }) {
  if (!hub?.portrait_summary) {
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
          Портрет формируется
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.5 }}>
          Пройди онбординг, чтобы получить персональный архетипический портрет
        </p>
      </div>
    );
  }

  const p = hub.portrait_summary;
  const polarities = hub.deep_profile_data?.polarities;
  const [expandedCard, setExpandedCard] = useState<{ label: string; value: string; color: string } | null>(null);

  const attrs = [
    { label: "Архетип",  value: p.core_archetype,  color: "#8B5CF6" },
    { label: "Роль",     value: p.narrative_role,   color: "#3B82F6" },
    { label: "Энергия",  value: p.energy_type,      color: "#10B981" },
    { label: "Динамика", value: p.current_dynamic,  color: "#F59E0B" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Core Identity */}
      <div style={{
        padding: 20, borderRadius: 16,
        background: "linear-gradient(145deg, rgba(139,92,246,0.06), rgba(59,130,246,0.03))",
        border: "1px solid rgba(139,92,246,0.12)",
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.5)",
          textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10,
        }}>
          Идентификация Аватара
        </div>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
          {p.core_identity}
        </p>
      </div>

      {/* Attributes — truncated, tap to expand */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {attrs.map(({ label, value, color }) => {
          const truncated = value && value.length > 40 ? value.slice(0, 37) + "..." : value;
          return (
            <div key={label} onClick={() => setExpandedCard({ label, value, color })} style={{
              padding: "12px 14px", borderRadius: 14,
              background: `${color}08`, border: `1px solid ${color}15`,
              cursor: "pointer", minHeight: 70, display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: `${color}80`,
                textTransform: "uppercase", letterSpacing: "0.08em",
                display: "block", marginBottom: 6,
              }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3 }}>
                {truncated}
              </span>
            </div>
          );
        })}
      </div>

      {/* Expanded card modal */}
      <AnimatePresence>
        {expandedCard && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setExpandedCard(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 340, borderRadius: 20,
                background: "var(--bg-card)", border: `1px solid ${expandedCard.color}25`,
                padding: 24,
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, color: `${expandedCard.color}80`,
                textTransform: "uppercase", letterSpacing: "0.12em",
                display: "block", marginBottom: 12,
              }}>
                {expandedCard.label}
              </span>
              <p style={{
                fontSize: 15, fontWeight: 600, color: expandedCard.color,
                lineHeight: 1.5, margin: 0, marginBottom: 16,
              }}>
                {expandedCard.value}
              </p>
              <button
                onClick={() => setExpandedCard(null)}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 12,
                  background: `${expandedCard.color}15`, border: "none",
                  color: expandedCard.color, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Закрыть
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Strengths / Shadows */}
      {polarities && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <PolarityBlock title="Сильные стороны" items={polarities.core_strengths || []} color="#10B981" />
          <PolarityBlock title="Теневые аспекты" items={polarities.shadow_aspects || []} color="#EF4444" />
        </div>
      )}

      <SphereDistribution hub={hub} />
    </div>
  );
}

function PolarityBlock({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: "rgba(255,255,255,0.02)", border: `1px solid ${color}10`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color,
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.length > 0 ? items.map((item: string, i: number) => (
          <div key={i} style={{
            fontSize: 12, color: "rgba(255,255,255,0.6)",
            lineHeight: 1.4, fontWeight: 400,
            display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span style={{ color, opacity: 0.5, flexShrink: 0, lineHeight: 1.4 }}>·</span>
            <span>{item}</span>
          </div>
        )) : (
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Исследуется...</span>
        )}
      </div>
    </div>
  );
}

function SphereDistribution({ hub }: { hub: any }) {
  const systems = hub?.insights || {};
  const counts: Record<number, number> = {};
  Object.values(systems).forEach((spheres: any) => {
    Object.entries(spheres).forEach(([sphereId, items]: [string, any]) => {
      counts[parseInt(sphereId)] = (counts[parseInt(sphereId)] || 0) + items.length;
    });
  });
  const activeSpheres = SPHERES.filter(s => counts[s.id]);
  if (activeSpheres.length === 0) return null;

  return (
    <div style={{
      padding: 16, borderRadius: 14,
      background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 12,
      }}>
        Активные сферы
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {activeSpheres.map(s => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: 8,
            background: `${s.color}08`, border: `1px solid ${s.color}15`,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
            <span style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.name}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{counts[s.id]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Breakdown Tab ───────────────────────────────────────────────────────────
function BreakdownTab({
  insights, loading, activeSphere, setActiveSphere, onSelect, userId, onRefresh,
}: {
  insights: Insight[]; loading: boolean;
  activeSphere: number | null; setActiveSphere: (id: number | null) => void;
  onSelect: (i: Insight) => void;
  userId: string | null;
  onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState<number | null>(null);

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
      {loading && insights.length === 0 ? (
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
                  <button
                    onClick={() => handleGenerate(sphereId)}
                    disabled={!!generating}
                    style={{
                      width: "100%", padding: "16px",
                      marginTop: 8, borderRadius: 14,
                      background: isGenerating ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px dashed ${isGenerating ? "var(--violet)" : "rgba(255,255,255,0.1)"}`,
                      cursor: generating ? "wait" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      color: isGenerating ? "var(--violet)" : "var(--text-muted)",
                      fontSize: 13, fontWeight: 500,
                      transition: "all 0.2s",
                    }}
                  >
                    {isGenerating ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--violet)", borderTopColor: "transparent" }}
                        />
                        Генерирую...
                      </>
                    ) : (
                      <>Собрать разбор · 10 ⚡</>
                    )}
                  </button>
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

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function YourWorldPage() {
  const tmaSafeTop = useTmaSafeArea();
  const { userId } = useUserStore();
  const { insights, setInsights, activeSphere, setActiveSphere } = useInsightsStore();
  const [activeTab, setActiveTab] = useState<Tab>("portrait");
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  const { data: hub, isValidating: loading } = useSWR(
    userId ? ["master-hub", userId] : null,
    async () => {
      const res = await masterHubAPI.get(userId!);
      const data = res.data;
      if (data.status === "pending") return data;

      const allInsights: Insight[] = [];
      const systems = data.insights || {};
      Object.keys(systems).forEach(sys => {
        const spheres = systems[sys];
        Object.keys(spheres).forEach(sphereId => {
          spheres[sphereId].forEach((item: any, rank: number) => {
            allInsights.push({
              ...item,
              id: item.id || `${sys}-${sphereId}-${rank}`,
              system: sys,
              primary_sphere: parseInt(sphereId),
              rank: item.rank ?? rank,
            });
          });
        });
      });

      setInsights(allInsights);
      return data;
    },
    { revalidateOnFocus: false }
  );

  const totalCount = insights.length;
  const sphereCount = new Set(insights.map(i => i.primary_sphere)).size;

  const TABS: { id: Tab; label: string }[] = [
    { id: "portrait",  label: "Портрет" },
    { id: "breakdown", label: "Разбор" },
    { id: "sides",     label: "Стороны" },
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
        {totalCount > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
            {totalCount} · {sphereCount} сфер
          </span>
        )}
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
              />
            )}
            {activeTab === "sides" && <SidesTab insights={insights} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedInsight && (
          <InsightDetailModal insight={selectedInsight} onClose={() => setSelectedInsight(null)} />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
