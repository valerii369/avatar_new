"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, AlertCircle, Zap, Target, Key, Lightbulb, Star, Eye, Activity, Anchor } from "lucide-react";
import { SPHERE_BY_ID, INFLUENCE_CONFIG, SYSTEM_SHORT } from "@/lib/constants";
import type { Insight, NatalPosition, NatalAspect } from "@/lib/store";
import { useTmaSafeArea } from "@/lib/useTmaSafeArea";

// Map planet keys → russian/latin keywords to match against insight.position text
const PLANET_KEYWORDS: Record<string, string[]> = {
  sun:            ["солнце", "sun"],
  moon:           ["луна", "луны", "moon"],
  mercury:        ["меркурий", "mercury"],
  venus:          ["венера", "venus"],
  mars:           ["марс", "mars"],
  jupiter:        ["юпитер", "jupiter"],
  saturn:         ["сатурн", "saturn"],
  uranus:         ["уран", "uranus"],
  neptune:        ["нептун", "neptune"],
  pluto:          ["плутон", "pluto"],
  north_node:     ["северный узел", "north node", "с. узел"],
  south_node:     ["южный узел", "south node", "ю. узел"],
  chiron:         ["хирон", "chiron"],
  lilith:         ["лилит", "lilith"],
  asc:            ["асц", "асцендент", "asc", "восходящий"],
  mc:             ["мс", "мидхевен", "mc", "medium coeli"],
  part_of_fortune:["парс", "part of fortune", "фортун"],
};

function matchNatalPositions(positionText: string, natalPositions: NatalPosition[]): NatalPosition[] {
  if (!positionText || !natalPositions?.length) return [];
  const lower = positionText.toLowerCase();
  return natalPositions.filter(p => {
    const keywords = PLANET_KEYWORDS[p.key] || [p.label.toLowerCase()];
    return keywords.some(kw => lower.includes(kw));
  });
}

// Aspect type → colour
const ASPECT_COLORS: Record<string, string> = {
  trine:       "#10B981",
  sextile:     "#3B82F6",
  conjunction: "#A78BFA",
  square:      "#EF4444",
  opposition:  "#F59E0B",
};

interface InsightDetailModalProps {
  insight: Insight | null;
  onClose: () => void;
  natalPositions?: NatalPosition[];
  natalAspects?: NatalAspect[];
}

export default function InsightDetailModal({ insight, onClose, natalPositions = [], natalAspects = [] }: InsightDetailModalProps) {
  const tmaSafeTop = useTmaSafeArea();

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
          paddingTop: tmaSafeTop > 0 ? tmaSafeTop : undefined,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Sphere pill — styled like filter chip */}
            <span style={{
              padding: "3px 10px", borderRadius: 20,
              fontSize: 11, fontWeight: 500,
              color: sphere?.color || "var(--violet-l)",
              background: `${sphere?.color || "#8B5CF6"}10`,
              border: `1px solid ${sphere?.color || "#8B5CF6"}`,
            }}>
              {sphere?.name}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>·</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              {SYSTEM_SHORT[insight.system] || insight.system.toUpperCase()}
            </span>
            <span style={{
              fontSize: 9, color: "rgba(255,255,255,0.15)",
              fontWeight: 500, maxWidth: 100,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {insight.position}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: "20px 20px 120px",
          display: "flex", flexDirection: "column", gap: 22,
        }}>
          {/* Title block */}
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10,
            }}>
              <h2 style={{
                fontSize: 22, fontWeight: 700, color: "white",
                letterSpacing: "-0.3px", lineHeight: 1.25, margin: 0,
                flex: 1,
              }}>
                {insight.core_theme}
              </h2>
              <div style={{
                padding: "3px 10px", borderRadius: 8, flexShrink: 0,
                fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                background: influence.bg, color: influence.color,
              }}>
                {influence.label}
              </div>
            </div>
            <p style={{
              fontSize: 14, color: "rgba(255,255,255,0.5)",
              lineHeight: 1.6, fontWeight: 400, margin: 0, marginTop: 10,
            }}>
              {insight.description}
            </p>
          </div>

          {/* Инсайт — text with subtle left border */}
          {insight.insight && (
            <div style={{
              paddingLeft: 16,
              borderLeft: "2px solid rgba(167,139,250,0.4)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                color: "#A78BFA",
              }}>
                <Lightbulb size={12} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Инсайт
                </span>
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.65, margin: 0 }}>
                {insight.insight}
              </p>
            </div>
          )}

          {/* Дар — text with subtle left border (gold) */}
          {insight.gift && (
            <div style={{
              paddingLeft: 16,
              borderLeft: "2px solid rgba(245,158,11,0.4)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                color: "#F59E0B",
              }}>
                <Star size={12} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Дар
                </span>
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: 0 }}>
                {insight.gift}
              </p>
            </div>
          )}

          {/* Слепая зона — amber/orange left border */}
          {insight.blind_spot && (
            <div style={{
              paddingLeft: 16,
              borderLeft: "2px solid rgba(245,158,11,0.35)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                color: "#F59E0B",
              }}>
                <Eye size={12} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Слепая зона
                </span>
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: 0 }}>
                {insight.blind_spot}
              </p>
            </div>
          )}

          {/* Ритм энергии — cyan left border */}
          {insight.energy_rhythm && (
            <div style={{
              paddingLeft: 16,
              borderLeft: "2px solid rgba(6,182,212,0.35)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                color: "#06B6D4",
              }}>
                <Activity size={12} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Ритм энергии
                </span>
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: 0 }}>
                {insight.energy_rhythm}
              </p>
            </div>
          )}

          {/* Точка опоры — green left border */}
          {insight.crisis_anchor && (
            <div style={{
              paddingLeft: 16,
              borderLeft: "2px solid rgba(16,185,129,0.4)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                color: "#10B981",
              }}>
                <Anchor size={12} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Точка опоры
                </span>
              </div>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: 0 }}>
                {insight.crisis_anchor}
              </p>
            </div>
          )}

          {/* Свет — green left border */}
          <div style={{ paddingLeft: 16, borderLeft: "2px solid rgba(16,185,129,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: "#10B981" }}>
              <Sparkles size={12} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Свет</span>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: 0 }}>
              {insight.light_aspect}
            </p>
          </div>

          {/* Тень — red left border */}
          <div style={{ paddingLeft: 16, borderLeft: "2px solid rgba(239,68,68,0.35)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: "#EF4444" }}>
              <AlertCircle size={12} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Тень</span>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.65, margin: 0 }}>
              {insight.shadow_aspect}
            </p>
          </div>

          {/* Divider before practical section */}
          <div style={{ height: 1, background: "var(--border)" }} />

          {/* Задача + Ключ — redesigned as action items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
                background: "rgba(59,130,246,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Target size={13} style={{ color: "#3B82F6" }} />
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(59,130,246,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Задача развития
                </span>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, margin: 0, marginTop: 4 }}>
                  {insight.developmental_task}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
                background: "rgba(139,92,246,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Key size={13} style={{ color: "#8B5CF6" }} />
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Ключ интеграции
                </span>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, margin: 0, marginTop: 4 }}>
                  {insight.integration_key}
                </p>
              </div>
            </div>
          </div>

          {/* Divider before triggers */}
          {insight.triggers?.length > 0 && <div style={{ height: 1, background: "var(--border)" }} />}

          {/* Триггеры */}
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

          {/* Natal positions + aspects for this insight */}
          {(() => {
            const matched = matchNatalPositions(insight.position, natalPositions);
            if (!matched.length) return null;
            const matchedKeys = new Set(matched.map(p => p.key));
            // Aspects where at least one planet is in matched set
            const relevantAspects = natalAspects.filter(
              a => matchedKeys.has(a.planet_a) || matchedKeys.has(a.planet_b)
            );
            return (
              <div style={{
                paddingTop: 12,
                borderTop: insight.source ? "none" : "1px solid var(--border)",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {/* Planet positions */}
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
                  }}>
                    Точные позиции
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {matched.map(p => (
                      <div key={p.key} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 10px", borderRadius: 8,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>
                          {p.label}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.55)",
                          fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em",
                        }}>
                          {p.position_str}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Aspects */}
                {relevantAspects.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)",
                      textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
                    }}>
                      Аспекты
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {relevantAspects.map((a, i) => {
                        const col = ASPECT_COLORS[a.type] || "rgba(255,255,255,0.4)";
                        return (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "6px 10px", borderRadius: 8,
                            background: `${col}06`,
                            border: `1px solid ${col}18`,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: col,
                                minWidth: 76,
                              }}>
                                {a.type_label}
                              </span>
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                                {a.label_a} · {a.label_b}
                              </span>
                            </div>
                            <span style={{
                              fontSize: 11, color: "rgba(255,255,255,0.3)",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {a.angle}° <span style={{ opacity: 0.6 }}>orb {a.orb}°</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
