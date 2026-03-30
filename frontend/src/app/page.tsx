"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import useSWR from "swr";
import { useUserStore } from "@/lib/store";
import { authAPI, profileAPI, masterHubAPI } from "@/lib/api";
import { EnergyIcon } from "@/components/EnergyIcon";
import BottomNav from "@/components/BottomNav";
import { useTmaSafeArea } from "@/lib/useTmaSafeArea";

function formatScore(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

export default function HomePage() {
  const router = useRouter();
  const tmaSafeTop = useTmaSafeArea();
  const {
    userId, setUser, energy, evolutionLevel, title, firstName,
    xp, xpCurrent, xpNext, photoUrl,
  } = useUserStore();
  const [status, setStatus] = useState<"loading" | "redirecting" | "ready" | "error">("loading");
  const [errorInfo, setErrorInfo] = useState<string>("");

  // 1. Auth & Init
  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
          tg.ready();
          tg.expand();
          // Full screen for TMA v8+
          if (typeof tg.requestFullscreen === "function") {
            try { tg.requestFullscreen(); } catch {}
          }
          // Disable vertical swipe to close (keeps app open on swipe down)
          try {
            if (typeof tg.disableVerticalSwipes === "function") {
              tg.disableVerticalSwipes();
            }
          } catch {}
        }

        const isDev = process.env.NODE_ENV === "development";
        const isDebug = new URLSearchParams(window.location.search).get("debug") === "true";
        const testUserId = parseInt(new URLSearchParams(window.location.search).get("user_id") || "0") || undefined;
        const initData = tg?.initData || "";

        // Fast path: if we have a cached session, show UI immediately
        const cached = useUserStore.getState();
        if (cached.userId && cached.token && cached.onboardingDone) {
          if (!cancelled) setStatus("ready");
          // Refresh in background (non-blocking)
          authAPI.login(initData, isDev || isDebug, testUserId).then(res => {
            if (cancelled) return;
            const d = res.data;
            setUser({
              userId: d.user_id, tgId: d.tg_id, firstName: d.first_name,
              token: d.token, energy: d.energy, streak: d.streak,
              evolutionLevel: d.evolution_level, title: d.title,
              onboardingDone: d.onboarding_done,
              xp: d.xp, xpCurrent: d.xp_current, xpNext: d.xp_next,
              referralCode: d.referral_code,
              photoUrl: d.photo_url || "",
            });
            if (!d.onboarding_done) {
              router.push("/onboarding");
            }
          }).catch(() => {});
          return;
        }

        if (!initData && !isDev && !isDebug) {
          throw new Error("Открой приложение через Telegram бот.");
        }

        const authRes = await authAPI.login(initData, isDev || isDebug, testUserId);
        if (cancelled) return;
        const d = authRes.data;

        const prevOnboardingDone = cached.onboardingDone;
        const onboardingDone = d.onboarding_done || prevOnboardingDone;

        setUser({
          userId: d.user_id, tgId: d.tg_id, firstName: d.first_name,
          token: d.token, energy: d.energy, streak: d.streak,
          evolutionLevel: d.evolution_level, title: d.title,
          onboardingDone: onboardingDone,
          xp: d.xp, xpCurrent: d.xp_current, xpNext: d.xp_next,
          referralCode: d.referral_code,
          photoUrl: d.photo_url || "",
        });

        if (typeof window !== "undefined")
          localStorage.setItem("avatar_token", d.token);

        if (!onboardingDone) {
          setStatus("redirecting");
          router.push("/onboarding");
          return;
        }

        if (!cancelled) setStatus("ready");
      } catch (e: any) {
        if (cancelled) return;
        console.error("Init error", e);
        const msg = e?.code === "ECONNABORTED" || e?.message?.includes("timeout")
          ? "Сервер не отвечает. Проверь подключение и попробуй снова."
          : e?.code === "ERR_NETWORK" || e?.message === "Network Error"
          ? "Нет соединения с сервером. Попробуй снова."
          : e?.response?.status === 404
          ? "Сервис временно недоступен. Попробуй позже."
          : e.message || "Ошибка инициализации";
        setErrorInfo(msg);
        setStatus("error");
      }
    };

    initAuth();
    return () => { cancelled = true; };
  }, [router, setUser]);

  // 2. Profile fetch
  const { data: profile } = useSWR(
    userId && status === "ready" ? ["profile", userId] : null,
    () => profileAPI.get(userId!).then(res => res.data),
    {
      refreshInterval: (data) => (!data || !data.onboarding_done) ? 5000 : 0,
      onSuccess: (data) => {
        setUser({
          xp: data.xp, xpCurrent: data.xp_current, xpNext: data.xp_next,
          evolutionLevel: data.evolution_level, title: data.title, energy: data.energy,
          onboardingDone: data.onboarding_done,
        });
      }
    }
  );

  const isBuilding = status === "ready" && useUserStore.getState().onboardingDone && profile && !profile.onboarding_done;

  // 3. Master Hub
  const { data: hub } = useSWR(
    userId && status === "ready" ? ["master-hub", userId] : null,
    () => masterHubAPI.get(userId!).then(res => res.data).catch(() => null),
    { revalidateOnFocus: false }
  );

  const levelRange = Math.max(xpNext - xpCurrent, 1);
  const xpCollectedInLevel = Math.max(xp - xpCurrent, 0);
  const levelProgress = Math.min(xpCollectedInLevel / levelRange, 1);

  // Error state — must come before loading to avoid !userId masking it
  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center" style={{ background: "var(--bg-deep)" }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 20 }}>!</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Ошибка инициализации</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24, maxWidth: 280, lineHeight: 1.5 }}>{errorInfo}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 32px", background: "var(--violet)",
            color: "white", borderRadius: 14, fontWeight: 600,
            border: "none", cursor: "pointer", fontSize: 14,
          }}
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  // Building Avatar screen
  if (isBuilding) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6" style={{ background: "var(--bg-deep)" }}>
        <div className="relative" style={{ width: 72, height: 72 }}>
          <div className="absolute inset-0 rounded-full animate-spin"
            style={{ border: "2px solid rgba(139,92,246,0.15)", borderTopColor: "var(--violet)" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--violet)", boxShadow: "0 0 16px var(--violet)" }} />
          </div>
        </div>
        <div className="text-center">
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            Строим твой Аватар
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Анализируем натальную карту и создаём портрет...
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map(i => (
            <motion.div key={i}
              style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)" }}
              animate={{ opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35 }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Loading/Error
  if (status === "loading" || status === "redirecting" || !userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ background: "var(--bg-deep)" }}>
        <div className="w-10 h-10 border-2 rounded-full mb-4 animate-spin"
          style={{ borderColor: "rgba(139,92,246,0.2)", borderTopColor: "var(--violet)" }} />
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {status === "redirecting" ? "Подготовка онбординга..." : "Инициализация..."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-deep)", paddingBottom: 100, paddingTop: tmaSafeTop > 0 ? tmaSafeTop : undefined }}>

      {/* Header */}
      <div style={{ padding: "12px 10px 10px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 14px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--border)",
          borderRadius: 16,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            {photoUrl ? (
              <img src={photoUrl} alt={firstName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 16, color: "var(--text-muted)" }}>
                {firstName ? firstName[0].toUpperCase() : "?"}
              </span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
              {firstName || "Пользователь"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, marginTop: 2 }}>
              {title || "Новичок"} · Ур.{evolutionLevel}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <EnergyIcon size={16} color="#F59E0B" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#F59E0B" }}>{energy}</span>
          </div>
        </div>
      </div>

      {/* Level Display */}
      <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: "12px 20px 24px" }}>
        <div style={{ position: "relative", width: 160, height: 160 }}>
          <svg width="160" height="160" viewBox="0 0 160 160" style={{ position: "absolute", inset: 0 }}>
            <circle cx="80" cy="80" r="75" fill="none" stroke="rgba(139,92,246,0.08)" strokeWidth="1.5" />
            <circle cx="80" cy="80" r="75" fill="none" stroke="url(#levelGrad)" strokeWidth="2"
              strokeDasharray={`${levelProgress * 471} 471`}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
              style={{ transition: "stroke-dasharray 1s ease-out" }}
            />
            <defs>
              <linearGradient id="levelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--violet)" />
                <stop offset="100%" stopColor="var(--cyan)" />
              </linearGradient>
            </defs>
          </svg>

          <div style={{
            position: "absolute", inset: 18,
            borderRadius: "50%",
            background: "radial-gradient(circle at 40% 35%, rgba(139,92,246,0.12), transparent 70%)",
            border: "1px solid rgba(139,92,246,0.08)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <span style={{
              fontSize: 40, fontWeight: 800,
              fontFamily: "'Outfit', sans-serif",
              background: "linear-gradient(135deg, var(--violet-l), var(--gold))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              lineHeight: 1,
            }}>
              {evolutionLevel}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 4,
            }}>
              уровень
            </span>
          </div>
        </div>

        <p style={{
          fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.2)",
          textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 16,
        }}>
          Уровень Сознания
        </p>
      </div>

      {/* Brief identity — full portrait lives in "Твой мир" */}
      <div style={{ padding: "0 20px" }}>
        {hub?.portrait_summary ? (
          <div style={{
            padding: "16px 18px", borderRadius: 14,
            background: "linear-gradient(145deg, rgba(139,92,246,0.06), rgba(59,130,246,0.03))",
            border: "1px solid rgba(139,92,246,0.12)",
          }}>
            <p style={{
              fontSize: 13, fontWeight: 500, color: "var(--text-primary)",
              lineHeight: 1.6, margin: 0, textAlign: "center",
            }}>
              {hub.portrait_summary.core_identity}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center" style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 12,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--violet)", opacity: 0.4 }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
              Портрет формируется
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 240, lineHeight: 1.5 }}>
              Пройди онбординг для создания расчёта
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

// ── Sub-components ──

function AttributeCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 14,
      background: `${color}08`,
      border: `1px solid ${color}15`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: `${color}80`,
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3 }}>
        {value}
      </div>
    </div>
  );
}

function PolarityCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${color}10`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color,
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.length > 0 ? items.map((item, i) => (
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
