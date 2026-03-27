"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { cardsAPI } from "@/lib/api";
import { useUserStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import ArchetypeChart from "@/components/ArchetypeChart";
import HawkinsBar from "@/components/HawkinsBar";

type TabKey = "desc" | "shadow" | "light" | "status";
const TABS: { key: TabKey, label: string }[] = [
    { key: "desc", label: "Описание" },
    { key: "shadow", label: "Тень" },
    { key: "light", label: "Свет" },
    { key: "status", label: "Статус" }
];

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; statusLabel: string; color: string }> = {
    locked: { label: "ЗАКРЫТА", statusLabel: "ЗАКРЫТА", color: "rgba(255,255,255,0.3)" },
    recommended: { label: "РЕКОМЕНДОВАНА", statusLabel: "ДОСТУПНА", color: "#F59E0B" },
    in_sync: { label: "В ПРОЦЕССЕ", statusLabel: "В ПРОЦЕССЕ", color: "#06B6D4" },
    synced: { label: "АКТИВНА", statusLabel: "АКТИВНА", color: "#10B981" },
    aligning: { label: "АКТИВНА", statusLabel: "АКТИВНА", color: "#10B981" },
    aligned: { label: "АКТИВНА", statusLabel: "АКТИВНА", color: "#10B981" },
};

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CardPage() {
    const router = useRouter();
    const params = useParams();
    const { userId } = useUserStore();
    const [card, setCard] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>("desc");

    useEffect(() => {
        if (!userId || !params.id) return;
        cardsAPI.getOne(userId, Number(params.id))
            .then((r) => {
                setCard(r.data);
                setLoading(false);
                // Removed auto-sync if recommended to let user see card details first
            })
            .catch(() => setLoading(false));
    }, [userId, params.id, router]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-deep)" }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full" />
        </div>
    );

    if (!card) return null;

    const statusCfg = STATUS_CONFIG[card.status] ?? STATUS_CONFIG.locked;
    const canSync = ["recommended", "in_sync"].includes(card.status);
    const canAlign = ["synced", "aligning", "aligned"].includes(card.status);
    const isResuming = card.status === "in_sync";
    const sphereColor = card.sphere_color ?? "#10B981";

    return (
        <div className="min-h-screen pb-28" style={{ background: "var(--bg-deep)" }}>

            {/* ── Back button ──────────────────────────────────────────────── */}
            <div style={{ padding: "16px 20px 8px" }}>
                <button
                    onClick={() => router.back()}
                    style={{
                        fontSize: 15,
                        color: "rgba(255,255,255,0.5)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    {"< Назад"}
                </button>
            </div>

            {/* ── Sphere + Name + Score ────────────────────────────────────── */}
            <div style={{ padding: "4px 20px 4px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                {/* Left: sphere label + archetype name */}
                <div>
                    <p style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        color: "rgba(255,255,255,0.45)",
                        marginBottom: 4,
                        textTransform: "uppercase",
                    }}>
                        Сфера: {card.sphere_name_ru}
                    </p>
                    <h1 style={{
                        fontSize: 26,
                        fontWeight: 900,
                        color: "var(--text-primary)",
                        margin: 0,
                        lineHeight: 1,
                        fontFamily: "'Outfit', sans-serif",
                    }}>
                        {card.archetype_name}
                    </h1>
                </div>

                {/* Right: lvl + hawkins score */}
                <div style={{ textAlign: "right" }}>
                    <p style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.45)",
                        marginBottom: 4,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                    }}>
                        LVL {card.rank}
                    </p>
                    <p style={{
                        fontSize: 26,
                        fontWeight: 800,
                        color: card.hawkins_peak > 0 ? getHawkinsColor(card.hawkins_peak) : "rgba(255,255,255,0.2)",
                        margin: 0,
                        lineHeight: 1,
                        fontFamily: "'Outfit', sans-serif",
                    }}>
                        {card.hawkins_peak > 0 ? card.hawkins_peak : "—"}
                    </p>
                </div>
            </div>

            {/* ── Status row ───────────────────────────────────────────────── */}
            <div style={{
                padding: "4px 20px 8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                marginBottom: 4
            }}>
                <p style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    color: "rgba(255,255,255,0.35)",
                    margin: 0,
                    textTransform: "uppercase",
                }}>
                    Статус: {statusCfg.label}
                </p>
                <p style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: statusCfg.color,
                    margin: 0,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                }}>
                    {statusCfg.statusLabel}
                </p>
            </div>

            {/* ── Archetype Image ──────────────────────────────────────────── */}
            <div style={{ padding: "0 16px" }}>
                <div style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    borderRadius: 20,
                    overflow: "hidden",
                    position: "relative",
                    background: `linear-gradient(135deg, ${sphereColor}18 0%, rgba(0,0,0,0.7) 100%)`,
                    border: "1px solid rgba(255,255,255,0.08)",
                }}>
                    <img
                        src={`/archetypes/${card.archetype_id}.webp`}
                        alt={card.archetype_name}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center top",
                            display: "block",
                            filter: canAlign ? "none" : "grayscale(100%)",
                            transition: "filter 0.5s ease",
                        }}
                    />
                    {/* Bottom gradient overlay for readability */}
                    <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0, height: "30%",
                        background: "linear-gradient(to top, rgba(6,8,24,0.8) 0%, transparent 100%)",
                        pointerEvents: "none",
                    }} />
                </div>
            </div>

            {/* ── Hawkins Scale ── */}
            <HawkinsBar value={card.hawkins_peak || 0} />

            {/* ── Info block ───────────────────────────────────────────────── */}
            <div style={{ padding: "0 20px 0" }}>

                {/* ── Action buttons ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 15 }}>

                    {card.status === "locked" && (
                        <div style={{
                            padding: "14px 16px", borderRadius: 16,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            textAlign: "center",
                        }}>
                            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
                                🔒 Сначала пройдите рекомендованные карты
                            </p>
                        </div>
                    )}

                    {canSync && (
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => router.push(`/sync/${card.id}`)}
                            style={{
                                width: "100%",
                                padding: "18px 20px",
                                borderRadius: 18,
                                border: "1px solid rgba(255,255,255,0.1)",
                                cursor: "pointer",
                                background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                                color: "#000",
                                fontWeight: 800,
                                fontSize: 14,
                                letterSpacing: "0.1em",
                                boxShadow: "0 10px 30px -10px rgba(16,185,129,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
                                fontFamily: "'Outfit', sans-serif",
                                textTransform: "uppercase",
                            }}
                        >
                            {isResuming ? "Продолжить активацию" : `Активировать карту · 25 ✦`}
                        </motion.button>
                    )}

                    {canAlign && (
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => router.push(`/session/${card.id}`)}
                            style={{
                                width: "100%",
                                padding: "18px 20px",
                                borderRadius: 18,
                                border: "1px solid rgba(255,255,255,0.1)",
                                cursor: "pointer",
                                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                                color: "#000",
                                fontWeight: 800,
                                fontSize: 14,
                                letterSpacing: "0.1em",
                                boxShadow: "0 10px 30px -10px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
                                fontFamily: "'Outfit', sans-serif",
                                textTransform: "uppercase",
                            }}
                        >
                            Сессия выравнивания · 40 ✦
                        </motion.button>
                    )}
                </div>

                {/* ── Energy Info Hint ── */}
                <p style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.25)",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: 10,
                    marginTop: 20,
                    paddingLeft: 4
                }}>
                    Информация об энергии архетипа
                </p>

                {/* ── Tabs Navigation ── */}
                <div style={{ paddingBottom: "12px" }}>
                    <div
                        className="grid gap-1 p-1"
                        style={{
                            gridTemplateColumns: `repeat(${card.hawkins_peak > 0 ? 4 : 3}, minmax(0, 1fr))`,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 14,
                        }}
                    >
                        {TABS.filter(t => t.key !== 'status' || card.hawkins_peak > 0).map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    padding: "8px 4px",
                                    borderRadius: 10,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    transition: "all 0.2s",
                                    background: activeTab === tab.key ? "rgba(255,255,255,0.1)" : "transparent",
                                    color: activeTab === tab.key ? "#fff" : "rgba(255,255,255,0.4)",
                                    border: "none",
                                    cursor: "pointer",
                                    textAlign: "center",
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Tab Content ── */}
                <div style={{ minHeight: "200px" }}>
                    {activeTab === "desc" && (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0 }}>
                                {card.archetype_description || "Описание формируется..."}
                            </p>
                        </motion.div>
                    )}

                    {activeTab === "shadow" && (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0 }}>
                                {card.archetype_shadow || "—"}
                            </p>
                        </motion.div>
                    )}

                    {activeTab === "light" && (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0 }}>
                                {card.archetype_light || "—"}
                            </p>
                        </motion.div>
                    )}

                    {activeTab === "status" && card.hawkins_peak > 0 && (
                        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                            <ArchetypeChart userId={userId!} cardId={card.id} />
                        </motion.div>
                    )}
                </div>
            </div>

            <BottomNav active="cards" />
        </div>
    );
}
