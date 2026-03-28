"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useUserStore, useInsightsStore, type Insight } from "@/lib/store";
import { masterHubAPI } from "@/lib/api";
import { SPHERES, SPHERE_BY_ID, INFLUENCE_SORT } from "@/lib/constants";
import SphereFilter from "@/components/SphereFilter";
import InsightCard from "@/components/InsightCard";
import InsightDetailModal from "@/components/InsightDetailModal";
import { SkeletonCard } from "@/components/Skeleton";
import BottomNav from "@/components/BottomNav";

type Tab = "portrait" | "breakdown" | "sides";

// ─── Portrait Tab ─────────────────────────────────────────────────────────────
function PortraitTab({ hub }: { hub: any }) {
  if (!hub?.portrait_summary) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div style={{ fontSize: 56, marginBottom: 16 }}>✨</div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0, marginBottom: 8 }}>
          Портрет формируется
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.5 }}>
          Пройди онбординг, чтобы получить персональный архетипический портрет
        </p>
      </div>
    );
  }

  const p = hub.portrait_summary;
  const polarities = hub.deep_profile_data?.polarities;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 16 }}>
      {/* Core Identity Card */}
      <div style={{
        padding: 20, borderRadius: 20,
        background: "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(59,130,246,0.05))",
        border: "1px solid rgba(139,92,246,0.18)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -20, right: -20,
          width: 140, height: 140,
          background: "rgba(139,92,246,0.08)", borderRadius: "50%", filter: "blur(40px)",
        }} />
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.2em",
          color: "rgba(139,92,246,0.7)", textTransform: "uppercase", marginBottom: 10,
        }}>
          ● Идентификация Аватара
        </div>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
          {p.core_identity}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
          {[
            { label: "Архетип",  value: p.core_archetype,  color: "#8B5CF6" },
            { label: "Роль",     value: p.narrative_role,  color: "#3B82F6" },
            { label: "Энергия",  value: p.energy_type,     color: "#10B981" },
            { label: "Динамика", value: p.current_dynamic, color: "#F59E0B" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              padding: 10, borderRadius: 12,
              background: `${color}10`, border: `1px solid ${color}20`,
            }}>
              <span style={{
                fontSize: 8, fontWeight: 700, color: `${color}99`,
                textTransform: "uppercase", display: "block", marginBottom: 3,
              }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths / Shadows */}
      {polarities && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <PolarityBlock title="Сильные стороны" items={polarities.core_strengths || []} color="#10B981" icon="✦" />
          <PolarityBlock title="Теневые аспекты" items={polarities.shadow_aspects || []} color="#EF4444" icon="◈" />
        </div>
      )}

      <SphereDistribution hub={hub} />
    </div>
  );
}

function PolarityBlock({ title, items, color, icon }: { title: string; items: string[]; color: string; icon: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(255,255,255,0.03)", border: `1px solid ${color}15`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color, marginBottom: 10 }}>
        <span style={{ fontSize: 10 }}>{icon}</span>
        <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {items.length > 0 ? items.map((item: string, i: number) => (
          <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.3, fontWeight: 300, display: "flex", gap: 6 }}>
            <span style={{ opacity: 0.3, flexShrink: 0 }}>•</span> {item}
          </div>
        )) : (
          <span style={{ fontSize: 10, fontStyle: "italic", color: "rgba(255,255,255,0.2)" }}>Исследуется...</span>
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
    <div style={{ padding: 16, borderRadius: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 12 }}>
        Активные сферы
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {activeSpheres.map(s => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 10,
            background: `${s.color}12`, border: `1px solid ${s.color}25`,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
            <span style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.name}</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{counts[s.id]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Breakdown Tab ────────────────────────────────────────────────────────────
function BreakdownTab({
  insights, loading, activeSphere, setActiveSphere, onSelect,
}: {
  insights: Insight[]; loading: boolean;
  activeSphere: number | null; setActiveSphere: (id: number | null) => void;
  onSelect: (i: Insight) => void;
}) {
  const filteredInsights = useMemo(() => {
    let result = insights;
    if (activeSphere !== null) result = result.filter(i => i.primary_sphere === activeSphere);
    return [...result].sort((a, b) => {
      if (a.primary_sphere !== b.primary_sphere) return a.primary_sphere - b.primary_sphere;
      return (INFLUENCE_SORT[b.influence_level] || 0) - (INFLUENCE_SORT[a.influence_level] || 0);
    });
  }, [insights, activeSphere]);

  const groupedInsights = useMemo(() => {
    if (activeSphere !== null) return [{ sphereId: activeSphere, items: filteredInsights }];
    const groups: { sphereId: number; items: Insight[] }[] = [];
    let current: { sphereId: number; items: Insight[] } | null = null;
    const sorted = [...filteredInsights].sort((a, b) => a.primary_sphere - b.primary_sphere);
    for (const ins of sorted) {
      if (!current || current.sphereId !== ins.primary_sphere) {
        current = { sphereId: ins.primary_sphere, items: [] };
        groups.push(current);
      }
      current.items.push(ins);
    }
    return groups;
  }, [filteredInsights, activeSphere]);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <SphereFilter activeSphere={activeSphere} onSelect={setActiveSphere} />
      </div>
      {loading && insights.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : insights.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div style={{ fontSize: 56, marginBottom: 16 }}>🌌</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0, marginBottom: 8 }}>
            Твой мир формируется
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.5 }}>
            Пройди онбординг для персонального расчёта по 12 сферам
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSphere ?? "all"}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: "flex", flexDirection: "column", gap: 20 }}
          >
            {groupedInsights.map(group => {
              const sphere = SPHERE_BY_ID[group.sphereId];
              return (
                <div key={group.sphereId}>
                  {activeSphere === null && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingLeft: 2 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 10,
                        background: `${sphere?.color}15`, border: `1px solid ${sphere?.color}25`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {sphere && <sphere.icon size={14} style={{ color: sphere.color }} />}
                      </div>
                      <div>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                          {sphere?.name}
                        </h3>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {group.items.length} инсайтов • {sphere?.subtitle}
                        </span>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {group.items.map((insight, idx) => (
                      <InsightCard
                        key={insight.id || `${insight.primary_sphere}-${idx}`}
                        insight={insight}
                        onClick={() => onSelect(insight)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </>
  );
}

// ─── Sides Tab ────────────────────────────────────────────────────────────────
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div style={{ fontSize: 56, marginBottom: 16 }}>⚡</div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0, marginBottom: 8 }}>
          Стороны не определены
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.5 }}>
          Пройди онбординг, чтобы раскрыть свет и тень каждой сферы жизни
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <SphereFilter activeSphere={activeSphere} onSelect={setActiveSphere} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSphere ?? "all"}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {grouped.map(({ sphereId, items }) => {
            const sphere = SPHERE_BY_ID[sphereId];
            const lights = items.map(i => i.light_aspect).filter(Boolean);
            const shadows = items.map(i => i.shadow_aspect).filter(Boolean);

            return (
              <div key={sphereId} style={{
                borderRadius: 20, overflow: "hidden",
                border: `1px solid ${sphere?.color || "#fff"}18`,
              }}>
                {/* Sphere header */}
                <div style={{
                  padding: "12px 16px",
                  background: `${sphere?.color || "#fff"}0d`,
                  borderBottom: `1px solid ${sphere?.color || "#fff"}15`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  {sphere && (
                    <div style={{
                      width: 26, height: 26, borderRadius: 8,
                      background: `${sphere.color}20`, border: `1px solid ${sphere.color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <sphere.icon size={13} style={{ color: sphere.color }} />
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      {sphere?.name}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>
                      {sphere?.subtitle}
                    </span>
                  </div>
                </div>

                {/* Light + Shadow grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{ padding: 14, borderRight: "1px solid rgba(16,185,129,0.1)", background: "rgba(16,185,129,0.03)" }}>
                    <div style={{
                      fontSize: 8, fontWeight: 800, color: "#10B981",
                      textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10,
                    }}>✦ Свет</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {lights.slice(0, 3).map((text, i) => (
                        <p key={i} style={{
                          fontSize: 11, color: "rgba(255,255,255,0.65)",
                          lineHeight: 1.4, fontWeight: 300, margin: 0,
                          display: "flex", gap: 5, alignItems: "flex-start",
                        }}>
                          <span style={{ color: "#10B981", opacity: 0.6, flexShrink: 0, marginTop: 1 }}>•</span>
                          {text}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: 14, background: "rgba(239,68,68,0.03)" }}>
                    <div style={{
                      fontSize: 8, fontWeight: 800, color: "#EF4444",
                      textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10,
                    }}>◈ Тень</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {shadows.slice(0, 3).map((text, i) => (
                        <p key={i} style={{
                          fontSize: 11, color: "rgba(255,255,255,0.55)",
                          lineHeight: 1.4, fontWeight: 300, margin: 0,
                          display: "flex", gap: 5, alignItems: "flex-start",
                        }}>
                          <span style={{ color: "#EF4444", opacity: 0.5, flexShrink: 0, marginTop: 1 }}>•</span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function YourWorldPage() {
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
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-deep)", paddingBottom: 96 }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h1 style={{
          fontSize: 24, fontWeight: 800, fontFamily: "'Outfit', sans-serif",
          margin: 0, marginBottom: 2,
          background: "linear-gradient(135deg, var(--violet-l), var(--gold))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Твой мир</h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, margin: 0 }}>
          {totalCount > 0 ? `${totalCount} инсайтов по ${sphereCount} сферам` : "Полный расчёт по 12 сферам жизни"}
        </p>
      </div>

      {/* Tab switcher */}
      <div className="px-4 mb-3">
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 4, padding: 4,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--border)", borderRadius: 14,
        }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer",
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 700 : 500,
              background: activeTab === tab.id ? "rgba(255,255,255,0.1)" : "transparent",
              color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.2s",
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "portrait"  && <PortraitTab hub={hub} />}
            {activeTab === "breakdown" && (
              <BreakdownTab
                insights={insights} loading={loading}
                activeSphere={activeSphere} setActiveSphere={setActiveSphere}
                onSelect={setSelectedInsight}
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
