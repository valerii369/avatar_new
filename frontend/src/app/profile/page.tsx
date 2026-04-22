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
    const [activeTab, setActiveTab] = useState<"main" | "settings" | "referrals">("main");
    const [showShop, setShowShop] = useState(false);
    const [showSubscription, setShowSubscription] = useState(false);

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
            <div className="px-4 mb-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <button
                    onClick={() => setActiveTab("main")}
                    className="flex-1 py-2.5 px-4 rounded-[16px] flex flex-col items-center justify-center gap-1 min-w-[30%] transition-all"
                    style={{
                        background: activeTab === "main" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                        border: activeTab === "main" ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--border)"
                    }}
                >
                    <span className="text-xl">🌟</span>
                    <span className={`text-[11px] font-medium ${activeTab === "main" ? "text-white" : "text-white/70"}`}>Основное</span>
                </button>
                <button
                    onClick={() => setActiveTab("settings")}
                    className="flex-1 py-2.5 px-4 rounded-[16px] flex flex-col items-center justify-center gap-1 min-w-[30%] transition-all"
                    style={{
                        background: activeTab === "settings" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                        border: activeTab === "settings" ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--border)"
                    }}
                >
                    <span className="text-xl">⚙️</span>
                    <span className={`text-[11px] font-medium ${activeTab === "settings" ? "text-white" : "text-white/70"}`}>Настройки</span>
                </button>
                <button
                    onClick={() => setActiveTab("referrals")}
                    className="flex-1 py-2.5 px-4 rounded-[16px] flex flex-col items-center justify-center gap-1 min-w-[30%] relative overflow-hidden transition-all"
                    style={{
                        background: activeTab === "referrals" ? "linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(236, 72, 153, 0.25))" : "linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(236, 72, 153, 0.1))",
                        border: activeTab === "referrals" ? "1px solid rgba(139, 92, 246, 0.5)" : "1px solid rgba(139, 92, 246, 0.2)"
                    }}
                >
                    {activeTab === "referrals" && <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/20 to-transparent" />}
                    <span className="text-xl">🤝</span>
                    <span className={`text-[11px] font-medium ${activeTab === "referrals" ? "text-violet-100" : "text-violet-200/70"}`}>Рефералы</span>
                </button>
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

function SettingsView({ userId, tgId }: { userId: string; tgId: number | null }) {
    const [lang, setLang] = useState("RU");
    const [resetting, setResetting] = useState(false);
    const { musicEnabled, sfxEnabled, toggleMusic, toggleSfx, play } = useAudio();
    const { reset: resetStore } = useUserStore();

    const toggleLang = () => {
        play('click');
        setLang(l => l === "RU" ? "EN" : "RU");
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="px-4 space-y-4"
        >
            <div className="glass p-4 space-y-2">
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-1">Основные</h3>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white">Язык приложения</span>
                        <span className="text-[10px] text-white/30">Выберите удобный интерфейс</span>
                    </div>
                    <button
                        onClick={toggleLang}
                        className="px-4 py-2 bg-white/10 rounded-xl text-xs font-bold text-violet-300 border border-violet-500/20"
                    >
                        {lang}
                    </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white">Фоновая музыка</span>
                        <span className="text-[10px] text-white/30">Пространственное звучание</span>
                    </div>
                    <button
                        onClick={toggleMusic}
                        className={`w-12 h-6 rounded-full relative transition-colors ${musicEnabled ? 'bg-emerald-500/40' : 'bg-white/10'}`}
                    >
                        <motion.div
                            animate={{ x: musicEnabled ? 26 : 4 }}
                            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
                        />
                    </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white">Звуковые эффекты</span>
                        <span className="text-[10px] text-white/30">Обратная связь в интерфейсе</span>
                    </div>
                    <button
                        onClick={toggleSfx}
                        className={`w-12 h-6 rounded-full relative transition-colors ${sfxEnabled ? 'bg-emerald-500/40' : 'bg-white/10'}`}
                    >
                        <motion.div
                            animate={{ x: sfxEnabled ? 26 : 4 }}
                            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
                        />
                    </button>
                </div>
            </div>

            <div className="glass p-4 space-y-2">
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-1">Обучение и поддержка</h3>

                <a
                    href="https://t.me/avatar_matrix_support"
                    target="_blank"
                    className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10 no-underline"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-lg">💬</span>
                        <span className="text-sm font-semibold text-white">Связаться с поддержкой</span>
                    </div>
                    <span className="text-white/20">→</span>
                </a>

                <button
                    onClick={() => alert("Инструкция будет добавлена в AVATAR v1.2")}
                    className="w-full flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-lg">📖</span>
                        <span className="text-sm font-semibold text-white">Как это работает?</span>
                    </div>
                    <span className="text-white/20">→</span>
                </button>
            </div>

            <div className="glass p-4 space-y-2">
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-1">Опасная зона</h3>
                
                <button
                    onClick={async () => {
                        if (!confirm("Вы уверены? Это полностью сбросит ваш прогресс, удалит все карточки и сессии.")) {
                            return;
                        }
                        try {
                            setResetting(true);
                            const tg = (window as any).Telegram?.WebApp;
                            const resolvedTgId =
                                tgId ??
                                tg?.initDataUnsafe?.user?.id ??
                                999999999;

                            if (!resolvedTgId) {
                                throw new Error("Telegram ID not found");
                            }

                            await profileAPI.resetOnboardingData({
                                userId,
                                tgId: Number(resolvedTgId),
                                clearGeocode: true,
                            });
                            resetStore();
                            localStorage.removeItem("avatar_token");
                            window.location.href = "/";
                        } catch (e) {
                            console.error("Reset error", e);
                            const msg = (e as any)?.response?.data?.detail || "Ошибка при сбросе профиля";
                            alert(msg);
                        } finally {
                            setResetting(false);
                        }
                    }}
                    disabled={resetting}
                    className="w-full flex items-center justify-between p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20 active:scale-[0.98] transition-all text-left group"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-xl">⚠️</div>
                        <div>
                            <p className="text-sm font-semibold text-rose-400">
                                {resetting ? "Перезапуск..." : "Перезапуск онбординга"}
                            </p>
                            <p className="text-[10px] text-rose-500/40">Сброс по Telegram ID и новый старт</p>
                        </div>
                    </div>
                </button>
            </div>

            <div className="text-center py-4">
                <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">AVATAR v1.1.2 — 2026</p>
            </div>
        </motion.div>
    );
}

function ReferralView({ userId, referralCode }: { userId: string; referralCode: string }) {
    const botUsername = "avatarmatrixtest_bot";
    const refLink = `https://t.me/${botUsername}?start=${referralCode}`;
    const { setUser } = useUserStore();

    const { data: referrals, isLoading } = useSWR(
        userId ? ["referrals", userId] : null,
        () => profileAPI.getReferrals(userId).then(res => res.data)
    );

    // Promo code state
    const [promoCode, setPromoCode] = useState("");
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoResult, setPromoResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(refLink);
        alert("Ссылка скопирована!");
    };

    const handleRedeemPromo = async () => {
        if (!promoCode.trim() || promoLoading) return;
        setPromoLoading(true);
        setPromoResult(null);
        try {
            const res = await profileAPI.redeemPromo(userId, promoCode.trim());
            setPromoResult({ success: true, message: res.data.message });
            setPromoCode("");
            // Update energy in store
            if (res.data.new_energy !== undefined) {
                setUser({ energy: res.data.new_energy });
            }
        } catch (err: any) {
            const msg = err.response?.data?.detail || "Ошибка активации промокода";
            setPromoResult({ success: false, message: msg });
        } finally {
            setPromoLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="px-4 space-y-4"
        >
            <div className="glass p-5 space-y-4">
                <div className="text-center">
                    <h3 className="text-lg font-bold text-white mb-1">Реферальная программа</h3>
                    <p className="text-xs text-white/60 mb-4">
                        Приглашайте друзей и получайте ✦ Энергию после того, как они пройдут диагностику (Onboarding)
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2">
                    <div className="bg-white/5 rounded-2xl p-3 border border-white/10 text-center">
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1">Ваш бонус</p>
                        <p className="text-lg font-bold text-amber-400">+100 ✦</p>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-3 border border-white/10 text-center">
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1">Их бонус</p>
                        <p className="text-lg font-bold text-emerald-400">+200 ✦</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-medium text-white/70 ml-1">Ваша ссылка:</p>
                    <div className="flex gap-2">
                        <div className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-white/60">
                            {refLink}
                        </div>
                        <button
                            onClick={handleCopy}
                            className="bg-violet-600 hover:bg-violet-500 text-white px-4 rounded-xl font-bold text-sm transition-colors"
                        >
                            Копия
                        </button>
                    </div>
                </div>
            </div>

            {/* Promo code block */}
            <div className="glass p-5 space-y-3">
                <div>
                    <h4 className="text-sm font-bold text-white mb-0.5">Промокод</h4>
                    <p className="text-xs text-white/40">Введи промокод, чтобы получить бонус ✦ Энергии</p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === "Enter" && handleRedeemPromo()}
                        placeholder="ВВЕДИ ПРОМОКОД"
                        maxLength={32}
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 uppercase tracking-widest outline-none focus:border-violet-500/60 transition-colors"
                    />
                    <button
                        onClick={handleRedeemPromo}
                        disabled={promoLoading || !promoCode.trim()}
                        className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 rounded-xl font-bold text-sm transition-colors flex items-center gap-1.5"
                    >
                        {promoLoading ? (
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : "Активировать"}
                    </button>
                </div>
                {promoResult && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`text-xs font-medium px-3 py-2 rounded-xl border ${
                            promoResult.success
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}
                    >
                        {promoResult.success ? "✓ " : "✗ "}{promoResult.message}
                    </motion.div>
                )}
            </div>

            <div className="glass p-4">
                <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Ваши рефералы</h4>

                {isLoading ? (
                    <div className="flex justify-center py-6">
                        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : referrals && referrals.length > 0 ? (
                    <div className="space-y-3">
                        {referrals.map((ref: any) => (
                            <div key={ref.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
                                <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex-shrink-0 border border-white/10">
                                    {ref.photo_url ? (
                                        <img src={ref.photo_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-lg">👤</div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-bold text-white truncate">{ref.first_name}</p>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${ref.onboarding_done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'}`}>
                                            {ref.onboarding_done ? 'Активен' : 'В пути'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[11px] text-amber-400 font-bold">Lvl {ref.evolution_level}</span>
                                        <span className="text-[10px] text-white/30">{ref.xp.toLocaleString()} XP</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <p className="text-sm text-white/30 italic">Список пока пуст...</p>
                    </div>
                )}
            </div>
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
