"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useUserStore } from "@/lib/store";
import { authAPI, profileAPI, masterHubAPI } from "@/lib/api";
import { EnergyIcon } from "@/components/EnergyIcon";
import TabButton from "@/components/TabButton";
import BottomNav from "@/components/BottomNav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatScore(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

// ─── Home Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const {
    userId, setUser, energy, evolutionLevel, title, firstName,
    xp, xpCurrent, xpNext, photoUrl,
  } = useUserStore();
  const [status, setStatus] = useState<"loading" | "redirecting" | "ready" | "error">("loading");
  const [errorInfo, setErrorInfo] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"avatar" | "about">("avatar");

  // 1. Auth & Init
  useEffect(() => {
    const initAuth = async () => {
      try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) { tg.ready(); tg.expand(); }

        const initData = tg?.initData || "";
        const isDev = process.env.NODE_ENV === "development";
        const isDebug = new URLSearchParams(window.location.search).get("debug") === "true";
        const testUserId = parseInt(new URLSearchParams(window.location.search).get("user_id") || "0") || undefined;

        if (!initData && !isDev && !isDebug) {
          throw new Error("Telegram context missing. Please open via the bot or use ?debug=true for testing.");
        }

        const authRes = await authAPI.login(initData, isDev || isDebug, testUserId);
        const d = authRes.data;

        setUser({
          userId: d.user_id, tgId: d.tg_id, firstName: d.first_name,
          token: d.token, energy: d.energy, streak: d.streak,
          evolutionLevel: d.evolution_level, title: d.title,
          onboardingDone: d.onboarding_done,
          xp: d.xp, xpCurrent: d.xp_current, xpNext: d.xp_next,
          referralCode: d.referral_code,
          photoUrl: d.photo_url || "",
        });

        if (typeof window !== "undefined")
          localStorage.setItem("avatar_token", d.token);

        if (!d.onboarding_done) {
          setStatus("redirecting");
          router.push("/onboarding");
          return;
        }

        setStatus("ready");
      } catch (e: any) {
        console.error("Init error", e);
        setErrorInfo(e.message || "Unknown error");
        setStatus("error");
      }
    };
    initAuth();
  }, [router, setUser]);

  // 2. Profile fetch
  const { data: profile } = useSWR(
    userId && status === "ready" ? ["profile", userId] : null,
    () => profileAPI.get(userId!).then(res => res.data),
    {
      onSuccess: (data) => {
        if (!data.birth_date && !data.onboarding_done) router.push("/onboarding");
        setUser({
          xp: data.xp, xpCurrent: data.xp_current, xpNext: data.xp_next,
          evolutionLevel: data.evolution_level, title: data.title, energy: data.energy,
        });
      }
    }
  );

  // 3. Master Hub
  const { data: hub } = useSWR(
    userId && status === "ready" ? ["master-hub", userId] : null,
    () => masterHubAPI.get(userId!).then(res => res.data).catch(() => null),
    { revalidateOnFocus: false }
  );

  const levelRange = Math.max(xpNext - xpCurrent, 1);
  const xpCollectedInLevel = Math.max(xp - xpCurrent, 0);
  const levelProgress = Math.min(xpCollectedInLevel / levelRange, 1);

  // ── Loading/Error ──
  if (status === "loading" || status === "redirecting" || !userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ background: "var(--bg-deep)" }}>
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full mb-4 animate-spin" />
        <p className="text-xs animate-pulse" style={{ color: "var(--text-muted)" }}>
          {status === "redirecting" ? "Подготовка онбординга..." : "Инициализация..."}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center" style={{ background: "var(--bg-deep)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2">Ошибка инициализации</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>{errorInfo}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 24px", background: "var(--violet)",
            color: "white", borderRadius: 12, fontWeight: 600,
            border: "none", cursor: "pointer",
          }}
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-deep)", paddingBottom: 96 }}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-3">
        <div
          className="flex items-center gap-3 p-3"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--border)",
            borderRadius: 18,
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "var(--text-muted)", flexShrink: 0,
            overflow: "hidden",
          }}>
            {photoUrl ? (
              <img src={photoUrl} alt={firstName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : "👤"}
          </div>
          <div className="flex-1 flex justify-between items-center">
            <div className="flex flex-col">
              <span className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
                {firstName || "Пользователь"}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, marginTop: -2 }}>
                Level <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{evolutionLevel}</span>/100
              </span>
            </div>
            <span className="font-semibold text-base flex items-center gap-0.5" style={{ color: "#F59E0B" }}>
              <EnergyIcon size={20} color="#F59E0B" />
              {energy}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="px-4 mb-4">
        <div
          className="grid grid-cols-2 gap-1 p-1"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 14,
          }}
        >
          <TabButton active={activeTab === "avatar"} onClick={() => setActiveTab("avatar")} label="Твой AVATAR" />
          <TabButton active={activeTab === "about"} onClick={() => setActiveTab("about")} label="О тебе" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "avatar" && (
          <motion.div
            key="avatar-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col"
          >
            {/* Rank + Level Progress */}
            <div className="px-4 mb-3">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                  {title || "Новичок"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 400 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    ({formatScore(xpCollectedInLevel)} / {formatScore(levelRange)} XP)
                  </span>{" "}
                  <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                    {Math.round(levelProgress * 100)}%
                  </span>
                </span>
              </div>
              <div style={{
                height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden",
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${levelProgress * 100}%` }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #10B981, #06B6D4)",
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>

            {/* Main Visualization Area */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
              <div style={{
                width: 200, height: 200,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.03) 50%, transparent 70%)",
                border: "1px solid rgba(139,92,246,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
              }}>
                <div style={{
                  width: 140, height: 140,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
                  border: "1px solid rgba(139,92,246,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    fontSize: 48, fontWeight: 800,
                    fontFamily: "'Outfit', sans-serif",
                    background: "linear-gradient(135deg, var(--violet-l), var(--gold))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>
                    {evolutionLevel}
                  </div>
                </div>
                {/* Orbiting dots */}
                {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                  <div key={i} style={{
                    position: "absolute",
                    width: 6, height: 6, borderRadius: "50%",
                    background: `hsl(${260 + i * 15}, 70%, 60%)`,
                    top: `${50 - 48 * Math.cos(deg * Math.PI / 180)}%`,
                    left: `${50 + 48 * Math.sin(deg * Math.PI / 180)}%`,
                    transform: "translate(-50%, -50%)",
                    boxShadow: `0 0 8px hsl(${260 + i * 15}, 70%, 60%)`,
                  }} />
                ))}
              </div>
              <p style={{
                fontSize: 12, fontWeight: 600,
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginTop: 16,
              }}>
                Уровень Сознания
              </p>
            </div>
          </motion.div>
        )}

        {activeTab === "about" && (
          <motion.div
            key="about-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 px-4"
          >
            {hub ? (
              <div className="space-y-4">
                {/* Portrait Summary */}
                {hub.portrait_summary && (
                  <div style={{
                    padding: 20, borderRadius: 20,
                    background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.04))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{
                      position: "absolute", top: -10, right: -10,
                      width: 120, height: 120,
                      background: "rgba(139,92,246,0.08)",
                      borderRadius: "50%", filter: "blur(40px)",
                    }} />
                    <div style={{
                      fontSize: 9, fontWeight: 800,
                      color: "rgba(139,92,246,0.6)",
                      textTransform: "uppercase",
                      letterSpacing: "0.2em",
                      marginBottom: 10,
                    }}>
                      ● Идентификация Аватара
                    </div>
                    <p style={{
                      fontSize: 14, fontWeight: 500,
                      color: "var(--text-primary)",
                      lineHeight: 1.5,
                    }}>
                      {hub.portrait_summary.core_identity}
                    </p>
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr",
                      gap: 8, marginTop: 12,
                    }}>
                      <InfoTag label="Архетип" value={hub.portrait_summary.core_archetype} color="var(--violet)" />
                      <InfoTag label="Роль" value={hub.portrait_summary.narrative_role} color="#3B82F6" />
                      <InfoTag label="Энергия" value={hub.portrait_summary.energy_type} color="#10B981" />
                      <InfoTag label="Фокус" value={hub.portrait_summary.current_dynamic} color="#F59E0B" />
                    </div>
                  </div>
                )}

                {/* Strengths/Shadows */}
                {hub.deep_profile_data?.polarities && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <PolarityBlock
                      title="Сильные стороны"
                      items={hub.deep_profile_data.polarities.core_strengths || []}
                      color="#10B981"
                    />
                    <PolarityBlock
                      title="Теневые аспекты"
                      items={hub.deep_profile_data.polarities.shadow_aspects || []}
                      color="#EF4444"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-10 text-center" style={{ opacity: 0.5 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  Твой портрет формируется...
                </p>
                <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                  Пройди онбординг для создания расчёта
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}

// ── Sub-components ──

function InfoTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: 8, borderRadius: 10,
      background: `${color}10`,
      border: `1px solid ${color}20`,
    }}>
      <span style={{
        fontSize: 8, fontWeight: 700,
        color: `${color}80`,
        textTransform: "uppercase",
        display: "block", marginBottom: 2,
      }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 700,
        color, letterSpacing: "-0.01em",
      }}>{value}</span>
    </div>
  );
}

function PolarityBlock({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{
      padding: 16, borderRadius: 20,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        color, marginBottom: 10,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length > 0 ? items.map((item, i) => (
          <div key={i} style={{
            fontSize: 11, color: "rgba(255,255,255,0.7)",
            lineHeight: 1.3, fontWeight: 300,
            display: "flex", gap: 6,
          }}>
            <span style={{ opacity: 0.3 }}>•</span> {item}
          </div>
        )) : (
          <span style={{ fontSize: 10, fontStyle: "italic", color: "rgba(255,255,255,0.2)" }}>
            Исследуется...
          </span>
        )}
      </div>
    </div>
  );
}
