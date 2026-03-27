"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import useSWR from "swr";
import { useUserStore, useCardsStore, type CardProgress } from "@/lib/store";
import { authAPI, cardsAPI } from "@/lib/api";
import { EnergyIcon } from "@/components/EnergyIcon";
import BottomNav from "@/components/BottomNav";
import { Skeleton, MiniCardSkeleton } from "@/components/Skeleton";

// ─── Constants ────────────────────────────────────────────────────────────────

const SPHERES = [
    { key: "ALL", name: "Все", color: "#ffffff" },
    { key: "IDENTITY", name: "Личность", color: "#F59E0B" },
    { key: "RESOURCES", name: "Деньги", color: "#10B981" },
    { key: "COMMUNICATION", name: "Связи", color: "#06B6D4" },
    { key: "ROOTS", name: "Корни", color: "#F97316" },
    { key: "CREATIVITY", name: "Творчество", color: "#EC4899" },
    { key: "SERVICE", name: "Служение", color: "#14B8A6" },
    { key: "PARTNERSHIP", name: "Партнерство", color: "#3B82F6" },
    { key: "TRANSFORMATION", name: "Тень", color: "#6366F1" },
    { key: "EXPANSION", name: "Поиск", color: "#8B5CF6" },
    { key: "STATUS", name: "Статус", color: "#EF4444" },
    { key: "VISION", name: "Будущее", color: "#D946EF" },
    { key: "SPIRIT", name: "Дух", color: "#64748B" },
];

const SPHERE_EMOJI: Record<string, string> = {
    IDENTITY: "✦", RESOURCES: "◈", COMMUNICATION: "❤", ROOTS: "⚘",
    CREATIVITY: "◉", SERVICE: "⬡", PARTNERSHIP: "◐", TRANSFORMATION: "∞",
    EXPANSION: "▲", STATUS: "◈", VISION: "◌", SPIRIT: "◑",
};

// Status labels & colors as shown on the screenshot
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    locked: { label: "Не открыта", color: "rgba(255,255,255,0.35)" },
    recommended: { label: "Рекомендация", color: "#F59E0B" },
    in_sync: { label: "Синхронизация", color: "#06B6D4" },
    synced: { label: "Активна", color: "#10B981" },
    aligning: { label: "Активна", color: "#10B981" },
    aligned: { label: "Активна", color: "#10B981" },
};

const TOTAL_CARDS = 264;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CardsPage() {
    const router = useRouter();
    const { userId, firstName, setUser, energy, evolutionLevel, photoUrl } = useUserStore();
    const { cards, setCards, setLoading, filterTab, sphereFilter, setFilters } = useCardsStore();
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    // 1. Auth & Init
    useEffect(() => {
        const initAuth = async () => {
            try {
                const tg = (window as any).Telegram?.WebApp;
                if (tg) { tg.ready(); tg.expand(); }

                const initData = tg?.initData || "";
                const isDev = process.env.NODE_ENV === "development";
                const isDebug = new URLSearchParams(window.location.search).get("debug") === "true";

                if (!initData && !isDev && !isDebug) {
                    throw new Error("Telegram context missing. Please open via the bot or use ?debug=true for testing.");
                }

                const authRes = await authAPI.login(initData, isDev);
                const d = authRes.data;

                setUser({
                    userId: d.user_id, tgId: d.tg_id, firstName: d.first_name,
                    token: d.token, energy: d.energy, streak: d.streak,
                    evolutionLevel: d.evolution_level, title: d.title,
                    onboardingDone: d.onboarding_done,
                });

                if (typeof window !== "undefined")
                    localStorage.setItem("avatar_token", d.token);

                setStatus("ready");
            } catch (e: any) {
                console.error("Init error", e);
                setStatus("error");
            }
        };
        if (!userId) {
            initAuth();
        } else {
            setStatus("ready");
        }
    }, [userId, setUser]);

    // 2. Data Fetching via SWR
    const { data: cardsData, isValidating: cardsLoading } = useSWR(
        userId && status === "ready" ? ["cards", userId] : null,
        () => cardsAPI.getAll(userId!).then(res => res.data),
        {
            onSuccess: (data) => setCards(data),
            revalidateOnFocus: false,
        }
    );

    const displayCards = cardsData || cards;

    // ── Derived stats ────────────────────────────────────────────────────────
    const openedSpheres = new Set(
        displayCards.filter((c: any) => c.status !== "locked" && c.hawkins_peak > 0).map((c: any) => c.sphere)
    ).size;
    const openedCards = displayCards.filter((c: any) => c.status !== "locked").length;
    const recommended = displayCards.filter((c: any) => c.is_recommended_astro || c.is_recommended_ai).length;
    const activeCards = displayCards.filter((c: any) => ["synced", "aligned", "aligning"].includes(c.status)).length;
    // ── Tabs filter ──────────────────────────────────────────────────────────
    const byTab = (c: CardProgress) => {
        if (filterTab === "recommended") return c.is_recommended_astro || c.is_recommended_ai;
        if (filterTab === "active") return ["synced", "aligned", "aligning"].includes(c.status);
        return true;
    };

    // ── Sphere filter ────────────────────────────────────────────────────────
    const bySphere = (c: CardProgress) =>
        sphereFilter === "ALL" || c.sphere === sphereFilter;

    const visible = displayCards.filter((c: any) => byTab(c as any) && bySphere(c as any));

    // ── Loading/Error States ──────────────────────────────────────────────────
    if (status === "loading" || !userId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen" style={{ background: "var(--bg-deep)" }}>
                <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full mb-4 animate-spin" />
                <p className="text-xs text-muted-foreground animate-pulse">Загрузка карточек...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-28" style={{ background: "var(--bg-deep)" }}>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="px-4 pt-5 pb-3">
                <div
                    className="flex items-center gap-3 p-3"
                    style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid var(--border)",
                        borderRadius: 18,
                    }}
                >
                    {/* Avatar circle */}
                    <div
                        style={{
                            width: 44, height: 44, borderRadius: "50%",
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 20, color: "var(--text-muted)",
                            flexShrink: 0,
                            overflow: "hidden",
                        }}
                    >
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

            {/* ── Stats row ──────────────────────────────────────────────────── */}
            <div className="px-4 mb-4">
                <div className="grid grid-cols-3 gap-2">
                    {cardsLoading && !cardsData ? (
                        <>
                            <Skeleton className="h-16 rounded-2xl" />
                            <Skeleton className="h-16 rounded-2xl" />
                            <Skeleton className="h-16 rounded-2xl" />
                        </>
                    ) : (
                        <>
                            <StatTile label="Сферы" value={`${openedSpheres}/12`} color="#F59E0B" />
                            <StatTile label="Карточки" value={`${activeCards}/${TOTAL_CARDS}`} color="#10B981" />
                            <StatTile label="Рекомендовано" value={String(recommended)} color="#60A5FA" />
                        </>
                    )}
                </div>
            </div>

            {/* ── Category tabs ──────────────────────────────────────────────── */}
            <div className="px-4 mb-3">
                <div
                    className="grid grid-cols-3 gap-1 p-1"
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                    }}
                >
                    {[
                        { key: "all", label: "Все" },
                        { key: "recommended", label: "Рекомендованные" },
                        { key: "active", label: "Активные" },
                    ].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setFilters(t.key as any)}
                            style={{
                                padding: "8px 4px",
                                borderRadius: 10,
                                fontSize: 11,
                                fontWeight: 500,
                                transition: "all 0.2s",
                                background: filterTab === t.key ? "rgba(255,255,255,0.1)" : "transparent",
                                color: filterTab === t.key ? "var(--text-primary)" : "var(--text-muted)",
                                border: "none",
                                cursor: "pointer",
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Sphere filter (horizontal scroll) ──────────────────────────── */}
            <div
                className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "none" }}
            >
                {SPHERES.map((s) => {
                    const active = sphereFilter === s.key;
                    return (
                        <button
                            key={s.key}
                            onClick={() => setFilters(undefined, s.key)}
                            style={{
                                flexShrink: 0,
                                padding: "6px 14px",
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 500,
                                border: `1px solid ${active ? s.color : "var(--border)"}`,
                                background: active ? `${s.color}22` : "transparent",
                                color: active ? s.color : "var(--text-muted)",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {s.name}
                        </button>
                    );
                })}
            </div>

            {/* ── 2-column card grid ─────────────────────────────────────────── */}
            <div className="px-4 grid grid-cols-2 gap-3">
                {cardsLoading && !cardsData ? (
                    Array.from({ length: 6 }).map((_, i: number) => (
                        <MiniCardSkeleton key={i} />
                    ))
                ) : visible.length === 0 ? (
                    <div
                        className="col-span-2 text-center py-12"
                        style={{ color: "var(--text-muted)", fontSize: 14 }}
                    >
                        Нет карточек по выбранному фильтру
                    </div>
                ) : (
                    visible.map((card: any, i: number) => (
                        <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.025 }}
                        >
                            <MiniCard card={card} onClick={() => router.push(`/card/${card.id}`)} />
                        </motion.div>
                    ))
                )}
            </div>

            <BottomNav active="cards" />
        </div>
    );
}

// ─── StatTile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div
            style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "12px 10px",
                textAlign: "center",
            }}
        >
            <p style={{ fontSize: 11, color: color, fontWeight: 600, marginBottom: 4, lineHeight: 1 }}>
                {label}
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                {value}
            </p>
        </div>
    );
}

// ─── MiniCard ─────────────────────────────────────────────────────────────────
// Horizontal layout: square image left, text right, lvl|action bottom

const getHawkinsColor = (score: number) => {
    // New logic based on 10 levels with 200 and 500 thresholds
    if (score <= 200) {
        // Red to Yellow: 0 to 200
        const ratio = score / 200;
        const r = Math.round(239 + (245 - 239) * ratio); // 239 -> 245
        const g = Math.round(68 + (158 - 68) * ratio);   // 68 -> 158
        const b = Math.round(68 + (11 - 68) * ratio);    // 68 -> 11
        return `rgb(${r}, ${g}, ${b})`;
    } else if (score <= 500) {
        // Yellow to Green/Blueish
        const ratio = (score - 200) / 300;
        const r = Math.round(245 + (16 - 245) * ratio);
        const g = Math.round(158 + (185 - 158) * ratio);
        const b = Math.round(11 + (129 - 11) * ratio);
        return `rgb(${r}, ${g}, ${b})`;
    } else {
        // Upper states to White/Light
        const ratio = Math.min(1, (score - 500) / 500);
        const r = Math.round(16 + (255 - 16) * ratio);
        const g = Math.round(185 + (255 - 185) * ratio);
        const b = Math.round(129 + (255 - 129) * ratio);
        return `rgb(${r}, ${g}, ${b})`;
    }
};

function MiniCard({ card, onClick }: { card: CardProgress; onClick: () => void }) {
    const cfg = STATUS_CONFIG[card.status] ?? STATUS_CONFIG.locked;
    const isActive = ["synced", "aligned", "aligning"].includes(card.status);
    const isAiRecommended = card.is_recommended_ai && !isActive;
    const sphereColor = SPHERES.find((s) => s.key === card.sphere)?.color ?? "#ffffff";
    const actionText = isActive ? `Energy ${card.hawkins_peak}` : "Открыть";
    const actionColor = isActive ? getHawkinsColor(card.hawkins_peak || 0) : "#F59E0B";

    return (
        <button
            onClick={onClick}
            className={isAiRecommended ? "animate-pulse" : ""}
            style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid",
                borderColor: isAiRecommended ? "#F59E0B" : "var(--border)",
                boxShadow: isAiRecommended ? "0 0 15px rgba(245,158,11,0.4)" : "none",
                borderRadius: 16,
                overflow: "hidden",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                padding: 0,
                transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = `${sphereColor}55`;
                el.style.boxShadow = `0 0 14px ${sphereColor}20`;
            }}
            onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = isAiRecommended ? "#F59E0B" : "var(--border)";
                el.style.boxShadow = isAiRecommended ? "0 0 15px rgba(245,158,11,0.4)" : "none";
            }}
        >
            {/* ── Top row: image + text ── */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>

                {/* Square image */}
                <div
                    style={{
                        width: 68,
                        minHeight: 68,
                        flexShrink: 0,
                        background: `linear-gradient(135deg, ${sphereColor}18 0%, rgba(0,0,0,0.3) 100%)`,
                        position: "relative",
                        borderRight: "1px solid var(--border)",
                        overflow: "hidden",
                    }}
                >
                    <img
                        src={`/archetypes/${card.archetype_id}.webp`}
                        alt={card.archetype_name}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            opacity: isActive ? 1 : 0.6,
                            filter: isActive ? "none" : "grayscale(80%)",
                        }}
                    />
                    {isActive && (
                        <div style={{
                            position: "absolute", inset: 0,
                            background: `radial-gradient(circle at 50% 50%, ${sphereColor}40 0%, transparent 70%)`,
                            pointerEvents: "none",
                            mixBlendMode: "overlay"
                        }} />
                    )}
                </div>

                {/* Text block */}
                <div style={{ flex: 1, padding: "10px 10px 8px", minWidth: 0 }}>
                    <p style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginBottom: 3,
                        lineHeight: 1,
                    }}>
                        {card.sphere_name_ru}
                    </p>
                    <p style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        lineHeight: 1.25,
                        marginBottom: 5,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                    }}>
                        {card.archetype_name}
                    </p>
                    <p style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: cfg.color,
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                    }}>
                        {isAiRecommended ? (
                            <><span className="mr-1 opacity-80 text-amber-500">AI</span>{cfg.label}</>
                        ) : (
                            cfg.label
                        )}
                    </p>
                </div>
            </div>

            {/* ── Bottom row: lvl | action ── */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                borderTop: "1px solid var(--border)",
            }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                    lvl {card.rank}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: actionColor }}>
                    {actionText}
                </span>
            </div>
        </button>
    );
}
