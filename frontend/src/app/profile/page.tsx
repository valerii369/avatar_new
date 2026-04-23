"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { authAPI, profileAPI, gameAPI, paymentsAPI, calcAPI } from "@/lib/api";
import { useUserStore } from "@/lib/store";
import { useAudio } from "@/lib/hooks/useAudio";
import BottomNav from "@/components/BottomNav";
import useSWR, { mutate } from "swr";
import { Skeleton } from "@/components/Skeleton";
import { EnergyIcon } from "@/components/EnergyIcon";
import { useTmaSafeArea } from "@/lib/useTmaSafeArea";

// ─── Constants ────────────────────────────────────────────────────────────────



// ─── Profile Page ─────────────────────────────────────────────────────────────

export default function ProfilePage() {
    const router = useRouter();
    const { play } = useAudio();
    const { userId, tgId, firstName, setUser, referralCode, energy, evolutionLevel, photoUrl } = useUserStore();
    const tmaSafeTop = useTmaSafeArea();
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [activeTab, setActiveTabState] = useState<"main" | "settings" | "referrals">("main");
    const [showShop, setShowShop] = useState(false);
    const [showSubscription, setShowSubscription] = useState(false);

    // Load activeTab from localStorage on mount
    useEffect(() => {
        const saved = typeof window !== "undefined" ? localStorage.getItem("profile-active-tab") : null;
        if (saved === "main" || saved === "settings" || saved === "referrals") {
            setActiveTabState(saved);
        }
    }, []);

    // Save activeTab to localStorage on change
    const setActiveTab = (tab: "main" | "settings" | "referrals") => {
        setActiveTabState(tab);
        if (typeof window !== "undefined") {
            localStorage.setItem("profile-active-tab", tab);
        }
    };

    // 1. Auth & Init
    useEffect(() => {
        const initAuth = async () => {
            try {
                const tg = (window as any).Telegram?.WebApp;
                if (tg) { tg.ready(); tg.expand(); }

                const initData = tg?.initData || "";
                const isDev = process.env.NODE_ENV === "development";
                const isDebug = new URLSearchParams(window.location.search).get("debug") === "true";
                const ref = new URLSearchParams(window.location.search).get("ref") || undefined;

                if (!initData && !isDev && !isDebug) {
                    throw new Error("Telegram context missing. Please open via the bot or use ?debug=true for testing.");
                }

                const authRes = await authAPI.login(initData, isDev, undefined, ref);
                const d = authRes.data;

                setUser({
                    userId: d.user_id, tgId: d.tg_id, firstName: d.first_name,
                    token: d.token, energy: d.energy, streak: d.streak,
                    evolutionLevel: d.evolution_level, title: d.title,
                    onboardingDone: d.onboarding_done,
                    referralCode: d.referral_code,
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
    const { data: profile, isValidating: loadingProfile } = useSWR(
        userId && status === "ready" ? ["profile", userId] : null,
        () => profileAPI.get(userId!).then(res => res.data)
    );

    const { data: game, isValidating: loadingGame } = useSWR(
        userId && status === "ready" ? ["game_state", userId] : null,
        () => gameAPI.getState(userId!).then(res => res.data)
    );

    // ── Loading/Error States ──────────────────────────────────────────────────
    if (status === "loading" || !userId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen" style={{ background: "var(--bg-deep)" }}>
                <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full mb-4 animate-spin" />
                <p className="text-xs text-muted-foreground animate-pulse">Загрузка профиля...</p>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col"
            style={{ background: "var(--bg-deep)", height: "100dvh", overflow: "hidden", paddingTop: tmaSafeTop > 0 ? tmaSafeTop : undefined }}
        >
            {/* ── Header ── */}
            <div style={{ padding: "6px 20px 8px" }}>
                <h1 style={{
                    fontSize: 22, fontWeight: 800, fontFamily: "'Outfit', sans-serif",
                    margin: 0,
                    background: "linear-gradient(135deg, var(--violet-l), var(--violet))",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                    Профиль
                </h1>
            </div>

            {/* ── Menu (Tabs) ── */}
            <div className="px-4 mb-3">
                <div
                    className="grid grid-cols-3 gap-1 p-0.5"
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border)",
                        borderRadius: 50,
                    }}
                >
                    <button
                        onClick={() => setActiveTab("main")}
                        style={{
                            padding: "8px 4px",
                            borderRadius: 50,
                            fontSize: 13,
                            fontWeight: 500,
                            transition: "all 0.2s",
                            background: activeTab === "main" ? "rgba(255,255,255,0.1)" : "transparent",
                            color: activeTab === "main" ? "var(--text-primary)" : "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                        }}
                    >
                        Основное
                    </button>
                    <button
                        onClick={() => setActiveTab("settings")}
                        style={{
                            padding: "8px 4px",
                            borderRadius: 50,
                            fontSize: 13,
                            fontWeight: 500,
                            transition: "all 0.2s",
                            background: activeTab === "settings" ? "rgba(255,255,255,0.1)" : "transparent",
                            color: activeTab === "settings" ? "var(--text-primary)" : "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                        }}
                    >
                        Настройки
                    </button>
                    <button
                        onClick={() => setActiveTab("referrals")}
                        style={{
                            padding: "8px 4px",
                            borderRadius: 50,
                            fontSize: 13,
                            fontWeight: 500,
                            transition: "all 0.2s",
                            background: activeTab === "referrals" ? "rgba(255,255,255,0.1)" : "transparent",
                            color: activeTab === "referrals" ? "var(--text-primary)" : "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                        }}
                    >
                        Рефералы
                    </button>
                </div>
            </div>

            {/* ── Tab Content (scrollable) ── */}
            <div className="flex-1" style={{ overflowY: "auto", paddingBottom: 90, WebkitOverflowScrolling: "touch" }}>
                {activeTab === "main" && (
                    <MainProfileView
                        userId={userId!}
                        game={game}
                        loadingGame={loadingGame}
                        profile={profile}
                        setShowShop={setShowShop}
                        setShowSubscription={setShowSubscription}
                        onLocationSaved={() => mutate(["profile", userId])}
                    />
                )}
                {activeTab === "settings" && (
                    <SettingsView userId={userId!} tgId={tgId} />
                )}
                {activeTab === "referrals" && (
                    <ReferralView userId={userId!} referralCode={referralCode} />
                )}
            </div>

            {showShop && (
                <ShopModal onClose={() => setShowShop(false)} userId={userId!} />
            )}

            {showSubscription && (
                <SubscriptionModal onClose={() => setShowSubscription(false)} userId={userId!} />
            )}

            <BottomNav />
        </div>
    );
}

// ─── Sub-Views ───────────────────────────────────────────────────────────────

// ─── LocationSection ─────────────────────────────────────────────────────────
function LocationSection({
    userId,
    currentLocation,
    onSaved,
}: {
    userId: string;
    currentLocation?: string | null;
    onSaved?: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState(currentLocation || "");
    const [geoResult, setGeoResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (currentLocation && !editing) setInput(currentLocation);
    }, [currentLocation]);

    const handleSearch = async () => {
        if (!input.trim()) return;
        setLoading(true);
        setError("");
        setGeoResult(null);
        try {
            const res = await calcAPI.geocode(input);
            setGeoResult(res.data);
        } catch {
            setError("Не удалось найти место. Попробуйте уточнить.");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!geoResult) return;
        setLoading(true);
        setError("");
        try {
            await profileAPI.updateLocation(userId, geoResult.place || input);
            onSaved?.();
            setEditing(false);
            setGeoResult(null);
            setInput(geoResult.place || input);
        } catch {
            setError("Ошибка сохранения. Попробуйте ещё раз.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="px-4 mb-4">
            <div className="glass p-4 space-y-3">
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">
                    Текущее местоположение
                </h3>

                {!editing ? (
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-xl flex-shrink-0">
                                📍
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">
                                    {currentLocation || "Не указано"}
                                </p>
                                <p className="text-[10px] text-white/30">
                                    Влияет на точность транзитов
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => { setEditing(true); setGeoResult(null); setError(""); }}
                            className="px-3 py-1.5 bg-white/10 rounded-xl text-xs font-bold text-violet-300 border border-violet-500/20 flex-shrink-0"
                        >
                            {currentLocation ? "Изменить" : "Указать"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleSearch()}
                                placeholder="Москва, Россия"
                                autoFocus
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-emerald-500/50 transition-all"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={loading || !input.trim()}
                                className="px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-sm font-bold text-emerald-400 disabled:opacity-40 flex-shrink-0"
                            >
                                {loading && !geoResult ? "..." : "Найти"}
                            </button>
                        </div>

                        {error && <p className="text-xs text-rose-400 px-1">{error}</p>}

                        {geoResult && (
                            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
                                <div className="flex flex-col items-center mb-3">
                                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
                                        <span className="text-emerald-400">📍</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">
                                        Место определено
                                    </p>
                                    <p className="text-base font-bold text-white leading-tight">{geoResult.place}</p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 py-3 border-t border-emerald-500/10 text-[10px] text-white/40 font-mono mb-3">
                                    <div className="flex flex-col">
                                        <span className="mb-0.5">ШИРОТА</span>
                                        <span className="text-white/80 font-bold">
                                            {geoResult.lat != null ? geoResult.lat.toFixed(4) : "—"}°
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="mb-0.5">ДОЛГОТА</span>
                                        <span className="text-white/80 font-bold">
                                            {geoResult.lon != null ? geoResult.lon.toFixed(4) : "—"}°
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="mb-0.5">ЗОНА</span>
                                        <span className="text-white/80 font-bold truncate">
                                            {geoResult.tz_name?.split("/").pop() || "—"}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={loading}
                                    className="w-full py-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-sm font-bold text-emerald-400 disabled:opacity-40 transition-all"
                                >
                                    {loading ? "Сохранение..." : "✓ Сохранить местоположение"}
                                </button>
                            </div>
                        )}

                        {!geoResult && currentLocation && (
                            <button
                                onClick={() => { setEditing(false); setError(""); setInput(currentLocation); }}
                                className="w-full text-[10px] font-bold text-white/20 uppercase tracking-widest"
                            >
                                Отмена
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function MainProfileView({ userId, game, loadingGame, profile, setShowShop, setShowSubscription, onLocationSaved }: any) {
    const { play } = useAudio();
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Stats grid */}
            <div className="px-4 mb-5">
                <div className="grid grid-cols-3 gap-2">
                    {loadingGame && !game ? (
                        <>
                            <Skeleton className="h-16 rounded-2xl" />
                            <Skeleton className="h-16 rounded-2xl" />
                            <Skeleton className="h-16 rounded-2xl" />
                        </>
                    ) : (
                        <>
                            <StatTile label="Энергия" value={String(game?.energy || 0)} color="#F59E0B" />
                            <StatTile label="Серия" value={`${game?.streak || 0} дн`} color="#10B981" />
                            <StatTile label="Опыт" value={String(game?.xp || 0)} color="#60A5FA" />
                        </>
                    )}
                </div>
            </div>


            {/* Location section */}
            <LocationSection
                userId={userId}
                currentLocation={profile?.current_location}
                onSaved={onLocationSaved}
            />

            {/* Payments section redesigned as settings-style block */}
            <div className="px-4 mb-6">
                <div className="glass p-4 space-y-2">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-1">Магазин и пополнение</h3>

                    <button
                        onClick={() => {
                            play('click');
                            setShowShop(true);
                        }}
                        className="w-full flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10 active:scale-[0.98] transition-all text-left group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-xl">⚡</div>
                            <div>
                                <p className="text-sm font-semibold text-white">Пополнить Энергию</p>
                                <p className="text-[10px] text-white/30">Магазин энергии</p>
                            </div>
                        </div>
                        <span className="text-white/20 group-hover:translate-x-1 transition-transform">→</span>
                    </button>

                    <button
                        onClick={() => {
                            play('click');
                            setShowSubscription(true);
                        }}
                        className="w-full flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10 active:scale-[0.98] transition-all text-left group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-xl">💎</div>
                            <div>
                                <p className="text-sm font-semibold text-white">Купить Пакет (Подписка)</p>
                                <p className="text-[10px] text-white/30">Доступ ко всем сферам</p>
                            </div>
                        </div>
                        <span className="text-white/20 group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                </div>
            </div>


        </motion.div>
    );
}

// ─── Shared iOS-style UI helpers ──────────────────────────────────────────────

const iosSectionLabel = (text: string) => (
    <p style={{
        fontSize: 12, fontWeight: 500,
        color: "rgba(255,255,255,0.35)",
        textTransform: "uppercase", letterSpacing: "0.05em",
        padding: "0 32px", marginBottom: 6,
    }}>{text}</p>
);

const iosDivider = (indent = 16) => (
    <div style={{ height: 0.5, background: "rgba(255,255,255,0.07)", marginLeft: indent }} />
);

const iosGroup: React.CSSProperties = {
    margin: "0 16px 8px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: 14, overflow: "hidden",
};

const iosRow: React.CSSProperties = {
    display: "flex", alignItems: "center",
    padding: "0 16px", height: 44, gap: 12,
    background: "transparent", border: "none",
    cursor: "pointer", width: "100%", textAlign: "left",
};

const iosIconBox = (bg: string, emoji: string) => (
    <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: bg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16,
    }}>{emoji}</div>
);

const iosChevron = (
    <svg width="8" height="13" viewBox="0 0 8 13" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
        <path d="M1 1l6 5.5L1 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

function IosToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            style={{
                width: 51, height: 31, borderRadius: 16,
                background: enabled ? "#34C759" : "rgba(255,255,255,0.15)",
                border: "none", cursor: "pointer", padding: 0,
                position: "relative", flexShrink: 0,
                transition: "background 0.25s",
            }}
        >
            <motion.div
                animate={{ x: enabled ? 22 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                style={{
                    position: "absolute", top: 2,
                    width: 27, height: 27, borderRadius: 14,
                    background: "white",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                }}
            />
        </button>
    );
}

function SettingsView({ userId, tgId }: { userId: string; tgId: number | null }) {
    const [resetting, setResetting] = useState(false);
    const { musicEnabled, sfxEnabled, toggleMusic, toggleSfx } = useAudio();
    const { reset: resetStore, firstName } = useUserStore();

    const handleReset = async () => {
        if (!confirm("Вы уверены? Это полностью сбросит ваш прогресс, удалит все карточки и сессии.")) return;
        try {
            setResetting(true);
            const tg = (window as any).Telegram?.WebApp;
            const resolvedTgId = tgId ?? tg?.initDataUnsafe?.user?.id ?? 999999999;
            await profileAPI.resetOnboardingData({ userId, tgId: Number(resolvedTgId), clearGeocode: true });
            resetStore();
            localStorage.removeItem("avatar_token");
            window.location.href = "/";
        } catch (e) {
            const msg = (e as any)?.response?.data?.detail || "Ошибка при сбросе профиля";
            alert(msg);
        } finally {
            setResetting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ paddingBottom: 8 }}
        >
            {/* ── App info card ── */}
            <div style={{ margin: "0 16px 24px" }}>
                <div style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 20, padding: "20px 16px",
                    display: "flex", alignItems: "center", gap: 16,
                }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: 14, flexShrink: 0,
                        background: "linear-gradient(135deg, #7C3AED, #4F46E5)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 28,
                    }}>🌌</div>
                    <div>
                        <p style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>AVATAR</p>
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "3px 0 0", lineHeight: 1.4 }}>
                            Система самопознания на основе астрологии и ИИ
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Sound ── */}
            {iosSectionLabel("Звук")}
            <div style={{ ...iosGroup, marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44, gap: 12 }}>
                    {iosIconBox("rgba(255,149,0,0.85)", "🎵")}
                    <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Фоновая музыка</span>
                    <IosToggle enabled={musicEnabled} onToggle={toggleMusic} />
                </div>
                {iosDivider(16 + 30 + 12)}
                <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44, gap: 12 }}>
                    {iosIconBox("rgba(52,199,89,0.85)", "🔔")}
                    <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Звуковые эффекты</span>
                    <IosToggle enabled={sfxEnabled} onToggle={toggleSfx} />
                </div>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "4px 32px 16px", lineHeight: 1.4 }}>
                Звуки воспроизводятся при взаимодействии с интерфейсом
            </p>

            {/* ── Support ── */}
            {iosSectionLabel("Поддержка")}
            <div style={iosGroup}>
                <a
                    href="https://t.me/avatar_matrix_support"
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...iosRow, textDecoration: "none" }}
                >
                    {iosIconBox("rgba(0,122,255,0.85)", "💬")}
                    <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Написать в поддержку</span>
                    {iosChevron}
                </a>
                {iosDivider(16 + 30 + 12)}
                <button
                    style={iosRow}
                    onClick={() => alert("Инструкция будет добавлена в AVATAR v2.0")}
                >
                    {iosIconBox("rgba(88,86,214,0.85)", "📖")}
                    <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Как это работает?</span>
                    {iosChevron}
                </button>
            </div>

            {/* ── Account ── */}
            <div style={{ marginTop: 20 }}>
                {iosSectionLabel("Аккаунт")}
                <div style={iosGroup}>
                    <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44 }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Пользователь</span>
                        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.4)" }}>{firstName || "—"}</span>
                    </div>
                    {iosDivider()}
                    <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44 }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Telegram ID</span>
                        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.4)" }}>{tgId ?? "—"}</span>
                    </div>
                </div>
            </div>

            {/* ── Danger ── */}
            <div style={{ marginTop: 20 }}>
                {iosSectionLabel("Данные")}
                <div style={{ margin: "0 16px 8px", background: "rgba(255,59,48,0.07)", borderRadius: 14, overflow: "hidden" }}>
                    <button
                        onClick={handleReset}
                        disabled={resetting}
                        style={{ ...iosRow, opacity: resetting ? 0.5 : 1 }}
                    >
                        {iosIconBox("rgba(255,59,48,0.85)", "🔄")}
                        <div style={{ flex: 1, textAlign: "left" }}>
                            <p style={{ fontSize: 15, fontWeight: 500, color: "#FF3B30", margin: 0 }}>
                                {resetting ? "Сброс..." : "Перезапуск онбординга"}
                            </p>
                        </div>
                        {iosChevron}
                    </button>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,59,48,0.5)", padding: "4px 32px 16px", lineHeight: 1.4 }}>
                    Сбрасывает прогресс и все данные. Действие необратимо.
                </p>
            </div>

            {/* ── Version ── */}
            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
                    AVATAR v1.4.2 · 2026
                </p>
            </div>
        </motion.div>
    );
}

function ReferralView({ userId, referralCode }: { userId: string; referralCode: string }) {
    const { setUser } = useUserStore();

    const { data: refLink, error: refLinkError, isLoading } = useSWR(
        userId ? ["referral-link", userId] : null,
        async () => {
            try {
                const res = await profileAPI.getReferralLink(userId);
                const link = res.data?.referral_link || res.data;
                if (link) {
                    console.log("✓ Referral link from API:", link);
                    return link;
                }
                throw new Error("No referral_link in response");
            } catch (err) {
                console.error("API referral link failed, using fallback:", err);
                return null;
            }
        },
        { revalidateOnFocus: false }
    );

    // Fallback: construct Telegram Mini App link from referralCode if API fails
    const generatedLink = refLink || (referralCode ? `https://t.me/avatarmatrix_bot/app?ref=${referralCode}` : null);

    // Debug logging
    if (typeof window !== "undefined") {
        console.log("ReferralView debug:", { userId, referralCode, refLink, isLoading, generatedLink });
    }

    const { data: referrals, isLoading: referralsLoading } = useSWR(
        userId ? ["referrals", userId] : null,
        () => profileAPI.getReferrals(userId).then(res => res.data)
    );

    const [promoCode, setPromoCode] = useState("");
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoResult, setPromoResult] = useState<{ success: boolean; message: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!generatedLink) return;
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        if (!generatedLink) return;
        if (navigator.share) {
            await navigator.share({ title: "Avatar", url: generatedLink });
        } else {
            handleCopy();
        }
    };

    const handleRedeemPromo = async () => {
        if (!promoCode.trim() || promoLoading) return;
        setPromoLoading(true);
        setPromoResult(null);
        try {
            const res = await profileAPI.redeemPromo(userId, promoCode.trim());
            setPromoResult({ success: true, message: res.data.message });
            setPromoCode("");
            if (res.data.new_energy !== undefined) setUser({ energy: res.data.new_energy });
        } catch (err: any) {
            const msg = err.response?.data?.detail || "Ошибка активации промокода";
            setPromoResult({ success: false, message: msg });
        } finally {
            setPromoLoading(false);
        }
    };

    const activeCount = referrals?.filter((r: any) => r.onboarding_done).length ?? 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ paddingBottom: 8 }}
        >
            {/* ── Hero stats ── */}
            <div style={{ margin: "0 16px 24px" }}>
                <div style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 20,
                    padding: "20px 16px 16px",
                    display: "flex", gap: 0,
                }}>
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <p style={{ fontSize: 34, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1, margin: 0 }}>
                            {referrals?.length ?? "—"}
                        </p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>приглашено</p>
                    </div>
                    <div style={{ width: 0.5, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <p style={{ fontSize: 34, fontWeight: 700, color: "#34D399", lineHeight: 1, margin: 0 }}>
                            {activeCount}
                        </p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>активных</p>
                    </div>
                    <div style={{ width: 0.5, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <p style={{ fontSize: 34, fontWeight: 700, color: "#F59E0B", lineHeight: 1, margin: 0 }}>
                            {activeCount * 50}
                        </p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>⚡ заработано</p>
                    </div>
                </div>
            </div>

            {/* ── Reward info ── */}
            {iosSectionLabel("Награды")}
            <div style={iosGroup}>
                <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44, gap: 12 }}>
                    {iosIconBox("rgba(245,158,11,0.85)", "⚡")}
                    <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Ваш бонус</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#F59E0B" }}>+50 ⚡</span>
                </div>
                {iosDivider(16 + 30 + 12)}
                <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44, gap: 12 }}>
                    {iosIconBox("rgba(52,211,153,0.85)", "🎁")}
                    <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>Бонус друга</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#34D399" }}>+50 ⚡</span>
                </div>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "4px 32px 16px", lineHeight: 1.4 }}>
                Бонус начисляется после прохождения диагностики
            </p>

            {/* ── Referral link ── */}
            <div style={{ marginTop: 4 }}>
                {iosSectionLabel("Ваша ссылка")}
                <div style={iosGroup}>
                    <div style={{ display: "flex", alignItems: "center", padding: "0 16px", minHeight: 52, gap: 12 }}>
                        {iosIconBox("rgba(88,86,214,0.85)", "🔗")}
                        <p style={{
                            fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)",
                            wordBreak: "break-all", lineHeight: 1.5, margin: 0, flex: 1,
                        }}>
                            {isLoading ? "Загрузка ссылки..." : (generatedLink || "Ошибка загрузки ссылки")}
                        </p>
                    </div>
                    {iosDivider(16 + 30 + 12)}
                    <button
                        onClick={handleCopy}
                        disabled={!generatedLink}
                        style={{ ...iosRow, justifyContent: "center", opacity: !generatedLink ? 0.4 : 1 }}
                    >
                        <span style={{ fontSize: 15, fontWeight: 500, color: copied ? "#34D399" : "#818CF8" }}>
                            {copied ? "✓ Скопировано" : "Скопировать"}
                        </span>
                    </button>
                    {iosDivider()}
                    <button
                        onClick={handleShare}
                        disabled={!generatedLink}
                        style={{ ...iosRow, justifyContent: "center", opacity: !generatedLink ? 0.4 : 1 }}
                    >
                        <span style={{ fontSize: 15, fontWeight: 500, color: "#818CF8" }}>Поделиться</span>
                    </button>
                </div>
            </div>

            {/* ── Promo code ── */}
            <div style={{ marginTop: 20, marginBottom: 8 }}>
                {iosSectionLabel("Промокод")}
                <div style={iosGroup}>
                    <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 44, gap: 12 }}>
                        {iosIconBox("rgba(52,199,89,0.85)", "🎟")}
                        <input
                            type="text"
                            value={promoCode}
                            onChange={e => setPromoCode(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && handleRedeemPromo()}
                            placeholder="Введи промокод"
                            maxLength={32}
                            style={{
                                flex: 1, background: "transparent", border: "none",
                                outline: "none", fontSize: 15, fontWeight: 500,
                                color: "var(--text-primary)", padding: 0,
                                letterSpacing: promoCode ? "0.05em" : 0,
                            }}
                        />
                    </div>
                    {iosDivider(16 + 30 + 12)}
                    <button
                        onClick={handleRedeemPromo}
                        disabled={promoLoading || !promoCode.trim()}
                        style={{ ...iosRow, justifyContent: "center", opacity: (!promoCode.trim() || promoLoading) ? 0.4 : 1 }}
                    >
                        {promoLoading ? (
                            <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin 0.6s linear infinite" }} />
                        ) : (
                            <span style={{ fontSize: 15, fontWeight: 500, color: "#818CF8" }}>Активировать</span>
                        )}
                    </button>
                </div>
                {promoResult && (
                    <motion.p
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ fontSize: 12, margin: "6px 32px 0", color: promoResult.success ? "#34D399" : "#F87171" }}
                    >
                        {promoResult.success ? "✓ " : "✗ "}{promoResult.message}
                    </motion.p>
                )}
            </div>

            {/* ── Referrals list ── */}
            {(referralsLoading || (referrals && referrals.length > 0)) && (
                <div style={{ marginTop: 20 }}>
                    {iosSectionLabel("Приглашённые")}
                    <div style={iosGroup}>
                        {referralsLoading ? (
                            <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                                <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.4)", borderTopColor: "#7C3AED", animation: "spin 0.6s linear infinite" }} />
                            </div>
                        ) : referrals.map((ref: any, i: number) => (
                            <div key={ref.id}>
                                <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: 12, minHeight: 52 }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 18,
                                        overflow: "hidden", flexShrink: 0,
                                        background: "rgba(255,255,255,0.08)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                        {ref.photo_url
                                            ? <img src={ref.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            : <span style={{ fontSize: 18 }}>👤</span>
                                        }
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", margin: 0, lineHeight: 1.2 }}>
                                            {ref.first_name}
                                        </p>
                                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "3px 0 0", lineHeight: 1 }}>
                                            Ур. {ref.evolution_level} · {ref.xp.toLocaleString()} XP
                                        </p>
                                    </div>
                                    <span style={{
                                        fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
                                        padding: "4px 10px", borderRadius: 12,
                                        background: ref.onboarding_done ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.07)",
                                        color: ref.onboarding_done ? "#34D399" : "rgba(255,255,255,0.3)",
                                        whiteSpace: "nowrap",
                                    }}>
                                        {ref.onboarding_done ? "✓ Активен" : "→ В пути"}
                                    </span>
                                </div>
                                {i < referrals.length - 1 && iosDivider(16 + 36 + 12)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

// ─── StatTile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "12px 10px",
            textAlign: "center",
        }}>
            <p style={{ fontSize: 11, color, fontWeight: 600, marginBottom: 4, lineHeight: 1 }}>
                {label}
            </p>
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                {value}
            </p>
        </div>
    );
}

// ─── ShopModal ──────────────────────────────────────────────────────────────

function ShopModal({ onClose, userId }: { onClose: () => void; userId: string }) {
    const { play } = useAudio();
    const { data: offers, isLoading, error: offersError } = useSWR("payment_offers", () => paymentsAPI.getOffers().then(res => res.data?.offers ?? res.data));
    const [buyingId, setBuyingId] = useState<string | null>(null);

    const handleBuy = async (offerId: string) => {
        setBuyingId(offerId);
        try {
            const res = await paymentsAPI.createInvoice(userId, offerId);
            const { invoice_link } = res.data;
            if (!invoice_link) {
                alert("Не удалось создать инвойс");
                setBuyingId(null);
                return;
            }
            const tgApp = (window as any).Telegram?.WebApp;
            if (tgApp?.openInvoice) {
                tgApp.openInvoice(invoice_link, (status: string) => {
                    if (status === "paid") {
                        play('success');
                        onClose();
                    }
                    setBuyingId(null);
                });
            } else {
                window.open(invoice_link, "_blank");
                setBuyingId(null);
            }
        } catch (e: any) {
            console.error("Invoice error", e);
            const msg = e.response?.data?.detail || "Ошибка создания инвойса";
            alert(msg);
            setBuyingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-20 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }}
                className="w-full max-w-md glass p-6 rounded-[32px] space-y-6"
            >
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">Магазин Энергии</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60">✕</button>
                </div>

                <div className="space-y-3">
                    {isLoading ? (
                        <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : offersError ? (
                        <p className="text-center text-white/40 py-6 text-sm">Не удалось загрузить пакеты. Попробуйте позже.</p>
                    ) : offers?.filter((o: any) => o.id !== "pack_premium").map((offer: any) => (
                        <button
                            key={offer.id}
                            disabled={!!buyingId}
                            onClick={() => handleBuy(offer.id)}
                            className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="text-2xl">⚡</div>
                                <div className="text-left">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-white">{offer.name}</p>
                                        {offer.id === "pack_300" && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md border border-emerald-500/20">-2%</span>}
                                        {offer.id === "pack_500" && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md border border-emerald-500/20">-5%</span>}
                                        {offer.id === "pack_1000" && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md border border-emerald-500/20">-10%</span>}
                                    </div>
                                    <p className="text-[11px] text-white/40">Начислится моментально</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30">
                                <span className="text-xs font-bold text-amber-400">⭐️ {offer.stars}</span>
                                {buyingId === offer.id && <div className="w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />}
                            </div>
                        </button>
                    ))}
                </div>

                <p className="text-[10px] text-center text-white/30 uppercase font-bold tracking-widest">
                    Оплата через Telegram Stars
                </p>
            </motion.div>
        </div>
    );
}

// ─── SubscriptionModal ───────────────────────────────────────────────────────

function SubscriptionModal({ onClose, userId }: { onClose: () => void; userId: string }) {
    const { play } = useAudio();
    const [isBuying, setIsBuying] = useState(false);

    const handleBuy = async () => {
        setIsBuying(true);
        try {
            const res = await paymentsAPI.createInvoice(userId, "pack_premium");
            const { invoice_link } = res.data;
            if (!invoice_link) {
                alert("Не удалось создать инвойс");
                setIsBuying(false);
                return;
            }
            const tgApp = (window as any).Telegram?.WebApp;
            if (tgApp?.openInvoice) {
                tgApp.openInvoice(invoice_link, (status: string) => {
                    if (status === "paid") {
                        play('success');
                        onClose();
                    }
                    setIsBuying(false);
                });
            } else {
                window.open(invoice_link, "_blank");
                setIsBuying(false);
            }
        } catch (e: any) {
            console.error("Invoice error", e);
            const msg = e.response?.data?.detail || "Ошибка создания инвойса";
            alert(msg);
            setIsBuying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-20 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }}
                className="w-full max-w-md glass p-6 rounded-[32px] space-y-6 text-center"
            >
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">Активация Пакета</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60">✕</button>
                </div>

                <div className="w-20 h-20 bg-violet-500/20 rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-lg shadow-violet-500/20">💎</div>

                <div className="space-y-2">
                    <h4 className="text-lg font-bold text-white">AVATAR Premium</h4>
                    <p className="text-sm text-white/60">Откройте безграничные возможности вашей эволюции</p>
                </div>

                <div className="grid grid-cols-1 gap-3 text-left">
                    {[
                        "Доступ ко всем 12 сферам жизни",
                        "Приоритетные сессии с ИИ",
                        "Эксклюзивные архетипические отчеты",
                        "Увеличенный лимит Энергии"
                    ].map((feature, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm text-white/80 bg-white/5 p-3 rounded-xl border border-white/5">
                            <span className="text-emerald-400 font-bold">✓</span>
                            {feature}
                        </div>
                    ))}
                </div>

                <button
                    disabled={isBuying}
                    onClick={handleBuy}
                    className="w-full py-4 bg-violet-600 rounded-2xl font-bold text-white shadow-lg shadow-violet-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {isBuying ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <span>Купить за ⭐️ 800</span>
                    )}
                </button>
            </motion.div>
        </div>
    );
}
