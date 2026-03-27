"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import useSWR, { mutate } from "swr";
import { diaryAPI } from "@/lib/api";
import { useUserStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import { SkeletonCard } from "@/components/Skeleton";

const SPHERE_NAMES: Record<string, string> = {
    IDENTITY: "Личность", RESOURCES: "Деньги", COMMUNICATION: "Связи",
    ROOTS: "Корни", CREATIVITY: "Творчество", SERVICE: "Служение",
    PARTNERSHIP: "Партнерство", TRANSFORMATION: "Тень", EXPANSION: "Поиск",
    STATUS: "Статус", VISION: "Будущее", SPIRIT: "Дух"
};

export default function DiaryPage() {
    const { userId } = useUserStore();
    const [activeFilter, setActiveFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("plan");

    const SPHERES = ["all", "IDENTITY", "RESOURCES", "COMMUNICATION", "ROOTS", "CREATIVITY", "SERVICE", "PARTNERSHIP", "TRANSFORMATION", "EXPANSION", "STATUS", "VISION", "SPIRIT"];

    // SWR Fetcher
    const { data: rawEntries, isValidating: loading } = useSWR(
        userId ? ["diary", userId, activeFilter] : null,
        () => diaryAPI.getAll(userId!, activeFilter === "all" ? undefined : activeFilter, undefined, "reflection").then(res => res.data),
        {
            revalidateOnFocus: false,
            dedupingInterval: 5000,
        }
    );

    // Client-side filtering based on status
    const entries = rawEntries?.filter((entry: any) => {
        if (statusFilter === "done") return entry.integration_done;
        if (statusFilter === "deferred") return false; // Placeholder for now
        return !entry.integration_done; // "plan"
    });

    const handleIntegration = async (entryId: number, done: boolean) => {
        if (!userId) return;
        try {
            await diaryAPI.updateIntegration(userId, entryId, done);
            // Optimistic UI update or just revalidate
            mutate(["diary", userId, activeFilter]);
        } catch (e) {
            console.error("Failed to update integration", e);
        }
    };

    return (
        <div className="min-h-screen pb-24">
            <div className="px-4 pt-6 pb-3">
                <h1 className="text-xl font-bold gradient-text">Дневник</h1>
            </div>

            {/* Status tabs (styled like cards page) */}
            <div className="px-4 mb-4">
                <div
                    className="grid grid-cols-3 gap-1 p-1"
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                    }}
                >
                    {[
                        { key: "plan", label: "План" },
                        { key: "deferred", label: "Отложенные" },
                        { key: "done", label: "Завершенные" },
                    ].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setStatusFilter(t.key)}
                            style={{
                                padding: "8px 4px",
                                borderRadius: 10,
                                fontSize: 11,
                                fontWeight: 500,
                                transition: "all 0.2s",
                                background: statusFilter === t.key ? "rgba(255,255,255,0.1)" : "transparent",
                                color: statusFilter === t.key ? "var(--text-primary)" : "var(--text-muted)",
                                border: "none",
                                cursor: "pointer",
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sphere filter */}
            <div className="flex gap-2 px-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
                {SPHERES.map(s => (
                    <button key={s} onClick={() => setActiveFilter(s)}
                        className="flex-none px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap"
                        style={{
                            background: activeFilter === s ? "rgba(139,92,246,0.1)" : "transparent",
                            color: activeFilter === s ? "var(--violet-l)" : "var(--text-muted)",
                            border: `1px solid ${activeFilter === s ? "var(--violet-l)" : "var(--border)"}`,
                        }}>
                        {s === "all" ? "Все" : SPHERE_NAMES[s]}
                    </button>
                ))}
            </div>

            <div className="px-4 space-y-3">
                {(!entries && loading) ? (
                    <div className="space-y-3">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                ) : (entries && entries.length === 0) ? (
                    <div className="glass p-8 text-center">
                        <p className="text-3xl mb-2">📖</p>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                            Записи появятся после завершения сессии выравнивания
                        </p>
                    </div>
                ) : (
                    entries?.map((entry: any) => (
                        <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className="glass p-4 border border-white/5">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full mr-2 uppercase font-bold tracking-wider"
                                        style={{ background: "rgba(139,92,246,0.15)", color: "var(--violet-l)" }}>
                                        {SPHERE_NAMES[entry.sphere] || entry.sphere}
                                    </span>
                                    <span className="text-[10px] text-white/30 uppercase font-bold tracking-widest">
                                        {entry.created_at?.split("T")[0]}
                                    </span>
                                </div>
                            </div>

                            {entry.content && (
                                <p className="text-sm mb-3 line-clamp-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                                    {entry.content}
                                </p>
                            )}

                            {entry.integration_plan && (
                                <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)" }}>
                                    <p className="text-[10px] uppercase font-black tracking-[0.2em] mb-1" style={{ color: "#68d391" }}>Интеграция</p>
                                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{entry.integration_plan}</p>
                                </div>
                            )}

                            {entry.integration_plan && !entry.integration_done && (
                                <div className="flex gap-2">
                                    <button onClick={() => handleIntegration(entry.id, true)}
                                        className="flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all uppercase tracking-widest"
                                        style={{ background: "rgba(16,185,129,0.15)", color: "#68d391", border: "1px solid rgba(16,185,129,0.3)" }}>
                                        ✅ Выполнено · +20✦
                                    </button>
                                    <button onClick={() => handleIntegration(entry.id, false)}
                                        className="flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest"
                                        style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                                        🌗 Частично
                                    </button>
                                </div>
                            )}

                            {entry.integration_done && (
                                <p className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "#10b981" }}>✅ Интеграция выполнена</p>
                            )}
                        </motion.div>
                    ))
                )}
            </div>

            <BottomNav />
        </div>
    );
}
