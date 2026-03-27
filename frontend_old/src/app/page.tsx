"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { useUserStore, useCardsStore } from "@/lib/store";
import { authAPI, cardsAPI, profileAPI } from "@/lib/api";
import { EnergyIcon } from "@/components/EnergyIcon";
import { Skeleton } from "@/components/Skeleton";
import ConsciousnessVisualization from "@/components/ConsciousnessVisualization";
import MasterHubView from "@/components/MasterHubView";
import TabButton from "@/components/TabButton";
import BottomNav from "@/components/BottomNav";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_CARDS = 264;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatScore(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

// ─── Home Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const {
    userId, tgId, setUser, energy, evolutionLevel, title, firstName,
    xp, xpCurrent, xpNext, photoUrl,
  } = useUserStore();
  const { cards, setCards } = useCardsStore();
  const [status, setStatus] = useState<"loading" | "redirecting" | "ready" | "error">("loading");
  const [errorInfo, setErrorInfo] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"avatar" | "about" | "world">("avatar");

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

  // 2. Data Fetching via SWR
  const { data: profile } = useSWR(
    userId && status === "ready" ? ["profile", userId] : null,
    () => profileAPI.get(userId!).then(res => res.data),
    {
      onSuccess: (data) => {
        if (!data.birth_date && !data.onboarding_done) router.push("/onboarding");
        setUser({
          xp: data.xp,
          xpCurrent: data.xp_current,
          xpNext: data.xp_next,
          evolutionLevel: data.evolution_level,
          title: data.title,
          energy: data.energy,
        });
      }
    }
  );

  const { data: cardsData, isValidating: cardsLoading } = useSWR(
    userId && status === "ready" ? ["cards", userId] : null,
    () => cardsAPI.getAll(userId!).then(res => res.data),
    {
      onSuccess: (data) => setCards(data),
      revalidateOnFocus: false,
    }
  );

  const displayCards = useMemo(() => cardsData || cards, [cardsData, cards]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const activeCards = useMemo(() => 
    displayCards?.filter((c: any) => ["synced", "aligned", "aligning"].includes(c.status)).length || 0
  , [displayCards]);

  const totalScore = useMemo(() => 
    displayCards?.reduce((sum: number, c: any) => sum + (c.hawkins_peak || 0), 0) || 0
  , [displayCards]);

  const levelRange = Math.max(xpNext - xpCurrent, 1);
  const xpCollectedInLevel = Math.max(xp - xpCurrent, 0);
  const levelProgress = Math.min(xpCollectedInLevel / levelRange, 1);

  // ── Loading/Error States ───────────────────────────────────────────────────
  if (status === "loading" || status === "redirecting" || !userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ background: "var(--bg-deep)" }}>
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full mb-4 animate-spin" />
        <p className="text-xs text-muted-foreground animate-pulse">
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
        <p className="text-sm text-gray-400 mb-6">{errorInfo}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-violet-600 text-white rounded-lg font-semibold"
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
              <img
                src={photoUrl}
                alt={firstName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "👤"
            )}
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

      {/* ── Tab Switcher (Matches Cards design) ── */}
      <div className="px-4 mb-4">
        <div
          className="grid grid-cols-3 gap-1 p-1"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 14,
          }}
        >
          <TabButton 
            active={activeTab === "avatar"} 
            onClick={() => setActiveTab("avatar")} 
            label="Твой AVATAR" 
          />
          <TabButton 
            active={activeTab === "about"} 
            onClick={() => setActiveTab("about")} 
            label="О тебе" 
          />
          <TabButton 
            active={activeTab === "world"} 
            onClick={() => setActiveTab("world")} 
            label="Твой мир" 
            disabled
          />
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
            {/* ── Rank + Level Progress ── */}
            <div className="px-4 mb-3">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                  {title || "Новичок"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 400 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    ({formatScore(xpCollectedInLevel)} / {formatScore(levelRange)} XP)
                  </span>
                  {" "}
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
            {/* ── Score ── */}
            <div className="px-4 text-center mb-1">
              <p style={{
                fontSize: 48,
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "-1px",
                lineHeight: 1,
                fontFamily: "'Outfit', sans-serif",
              }}>
                {formatScore(totalScore)}
              </p>
              <p style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginTop: 4
              }}>
                Общий Индекс Сознания
              </p>
            </div>

            {/* ── Main Visualization ── */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-[350px]">
              <ConsciousnessVisualization cards={displayCards || []} />
            </div>
          </motion.div>
        )}

        {activeTab === "about" && (
          <motion.div
            key="about-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1"
          >
            <MasterHubView userId={userId} />
          </motion.div>
        )}

        {activeTab === "world" && (
          <motion.div
            key="world-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-10 text-center opacity-30"
          >
            <div className="text-4xl mb-4">🌌</div>
            <p className="text-sm font-medium">Твой мир — персональное пространство,<br/>создаваемое AI на основе твоих данных.</p>
            <p className="text-[10px] uppercase tracking-widest mt-2 font-bold text-violet-400">В разработке...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav active="home" />
    </div>
  );
}
