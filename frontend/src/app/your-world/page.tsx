"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useUserStore, useInsightsStore, type Insight } from "@/lib/store";
import { dsbAPI } from "@/lib/api";
import { SPHERES, SPHERE_BY_ID, INFLUENCE_SORT } from "@/lib/constants";
import SphereFilter from "@/components/SphereFilter";
import InsightCard from "@/components/InsightCard";
import InsightDetailModal from "@/components/InsightDetailModal";
import { SkeletonCard } from "@/components/Skeleton";
import BottomNav from "@/components/BottomNav";

export default function YourWorldPage() {
  const { userId } = useUserStore();
  const { insights, setInsights, activeSphere, setActiveSphere } = useInsightsStore();
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  // Fetch all insights
  const { isValidating: loading } = useSWR(
    userId ? ["all-insights", userId] : null,
    async () => {
      // Fetch all spheres in parallel
      const results = await Promise.allSettled(
        SPHERES.map(s => dsbAPI.getSphere(userId!, s.id).then(r => r.data))
      );

      const allInsights: Insight[] = [];
      results.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value?.factors) {
          const sphere = SPHERES[idx];
          result.value.factors.forEach((f: any, rank: number) => {
            allInsights.push({
              id: f.id,
              system: f.source_system || "western_astrology",
              primary_sphere: sphere.id,
              rank,
              influence_level: f.influence_level || "medium",
              weight: f.weight || 0.5,
              position: f.position || "",
              core_theme: f.core_theme || "",
              energy_description: f.energy_description || f.description || "",
              light_aspect: f.light_aspect || "",
              shadow_aspect: f.shadow_aspect || "",
              developmental_task: f.developmental_task || "",
              integration_key: f.integration_key || "",
              triggers: f.triggers || [],
              source: f.source || null,
            });
          });
        }
      });

      setInsights(allInsights);
      return allInsights;
    },
    { revalidateOnFocus: false }
  );

  // Filter & sort
  const filteredInsights = useMemo(() => {
    let result = insights;
    if (activeSphere !== null) {
      result = result.filter(i => i.primary_sphere === activeSphere);
    }
    return result.sort((a, b) => {
      if (a.primary_sphere !== b.primary_sphere) return a.primary_sphere - b.primary_sphere;
      return (INFLUENCE_SORT[b.influence_level] || 0) - (INFLUENCE_SORT[a.influence_level] || 0);
    });
  }, [insights, activeSphere]);

  // Group by sphere for section headers
  const groupedInsights = useMemo(() => {
    if (activeSphere !== null) return [{ sphereId: activeSphere, items: filteredInsights }];
    const groups: { sphereId: number; items: Insight[] }[] = [];
    let current: { sphereId: number; items: Insight[] } | null = null;
    for (const ins of filteredInsights) {
      if (!current || current.sphereId !== ins.primary_sphere) {
        current = { sphereId: ins.primary_sphere, items: [] };
        groups.push(current);
      }
      current.items.push(ins);
    }
    return groups;
  }, [filteredInsights, activeSphere]);

  const totalCount = insights.length;
  const sphereCount = new Set(insights.map(i => i.primary_sphere)).size;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-deep)", paddingBottom: 96 }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-2">
        <h1 style={{
          fontSize: 24, fontWeight: 800,
          fontFamily: "'Outfit', sans-serif",
          margin: 0,
          background: "linear-gradient(135deg, var(--violet-l), var(--gold))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Твой мир
        </h1>
        <p style={{
          fontSize: 12, color: "var(--text-muted)",
          fontWeight: 400, marginTop: 4,
        }}>
          {totalCount > 0
            ? `${totalCount} инсайтов по ${sphereCount} сферам`
            : "Полный расчёт по 12 сферам жизни"
          }
        </p>
      </div>

      {/* Sphere Filter */}
      <div className="pt-2 pb-1 px-4">
        <SphereFilter
          activeSphere={activeSphere}
          onSelect={setActiveSphere}
        />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-2">
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
              Пройди онбординг, чтобы получить персональный расчёт по 12 сферам жизни
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSphere ?? "all"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              {groupedInsights.map(group => {
                const sphere = SPHERE_BY_ID[group.sphereId];
                return (
                  <div key={group.sphereId}>
                    {/* Sphere header (only when showing all) */}
                    {activeSphere === null && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        marginBottom: 12, paddingLeft: 2,
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 10,
                          background: `${sphere?.color}15`,
                          border: `1px solid ${sphere?.color}25`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {sphere && <sphere.icon size={14} style={{ color: sphere.color }} />}
                        </div>
                        <div>
                          <h3 style={{
                            fontSize: 14, fontWeight: 700,
                            color: "var(--text-primary)", margin: 0,
                          }}>
                            {sphere?.name}
                          </h3>
                          <span style={{
                            fontSize: 10, color: "var(--text-muted)",
                          }}>
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
                          onClick={() => setSelectedInsight(insight)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedInsight && (
          <InsightDetailModal
            insight={selectedInsight}
            onClose={() => setSelectedInsight(null)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
