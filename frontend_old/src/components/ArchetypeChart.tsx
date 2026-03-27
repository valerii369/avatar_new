"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { cardsAPI } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────────────
interface HistoryItem {
    date: string;
    score: number;
    type?: string;
}

interface ArchetypeChartProps {
    userId: number;
    cardId: number;
    color?: string;
}

// ── Color gradient 0–1000 ─────────────────────────────────────────────────────
function pillColor(v: number) {
    const stops = [
        { v: 0, r: 220, g: 55, b: 10 },
        { v: 150, r: 235, g: 90, b: 15 },
        { v: 250, r: 255, g: 145, b: 20 },
        { v: 350, r: 255, g: 200, b: 20 },
        { v: 500, r: 210, g: 230, b: 20 },
        { v: 650, r: 145, g: 235, b: 30 },
        { v: 1000, r: 55, g: 255, b: 80 },
    ];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (v >= a.v && v <= b.v) {
            const t = (v - a.v) / (b.v - a.v);
            return {
                r: Math.round(a.r + (b.r - a.r) * t),
                g: Math.round(a.g + (b.g - a.g) * t),
                b: Math.round(a.b + (b.b - a.b) * t),
            };
        }
    }
    return { r: 55, g: 255, b: 80 };
}

// ── Hawkins level name ────────────────────────────────────────────────────────
const LEVELS: [number, string][] = [
    [0, "Стыд"], [20, "Вина"], [30, "Апатия"], [50, "Горе"], [75, "Страх"],
    [100, "Желание"], [125, "Гнев"], [150, "Гордость"], [175, "Мужество"],
    [200, "Нейтральность"], [250, "Готовность"], [310, "Принятие"],
    [350, "Разум"], [400, "Любовь"], [500, "Радость"], [540, "Мир"],
    [600, "Просветление"], [700, "Чистое Сознание"], [850, "Абсолют"],
];

function getLevelName(v: number) {
    let result = LEVELS[0];
    for (const l of LEVELS) {
        if (v >= l[0]) result = l;
        else break;
    }
    return result[1];
}

// ── Rounded rect helper ──────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ── Chart Component ───────────────────────────────────────────────────────────
function Canvas({ data, hovered, onHover }: { data: { value: number; date: Date }[], hovered: number | null, onHover: (i: number | null) => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const n = data.length;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const W = canvas.offsetWidth || 360;
            const H = canvas.offsetHeight || 150;

            canvas.width = W * dpr;
            canvas.height = H * dpr;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            const PL = 20, PR = 20, PT = 10, PB = 20;
            const iW = W - PL - PR;
            const iH = H - PT - PB;

            ctx.clearRect(0, 0, W, H);

            const xOf = (i: number) => PL + (i / Math.max(n - 1, 1)) * iW;
            const yOf = (v: number) => PT + iH - (v / 1000) * iH;

            // Vertical grid lines
            for (let i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255,255,255,0.04)";
                ctx.lineWidth = 0.5;
                ctx.moveTo(xOf(i), PT);
                ctx.lineTo(xOf(i), PT + iH);
                ctx.stroke();
            }

            // Pills
            const pillW = Math.max(4, Math.min(14, (iW / n) * 0.45));
            const pillH = 5;
            const R = pillH / 2;

            for (let i = 0; i < n; i++) {
                const { value } = data[i];
                const x = xOf(i);
                const y = yOf(value);
                const c = pillColor(value);
                const isHov = hovered === i;

                // Outer glow - reduced radius and intensity
                const glowRX = pillW * 1.2;
                const glowRY = pillW * 0.6;
                const grd = ctx.createRadialGradient(x, y, 0, x, y, glowRX);
                grd.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${isHov ? 0.4 : 0.12})`);
                grd.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.ellipse(x, y, glowRX, glowRY, 0, 0, Math.PI * 2);
                ctx.fill();

                // Pill body
                const px = x - pillW / 2;
                const py = y - pillH / 2;
                roundRect(ctx, px, py, pillW, pillH, R);
                const pg = ctx.createLinearGradient(px, py, px, py + pillH);
                pg.addColorStop(0, `rgba(${Math.min(255, c.r + 45)},${Math.min(255, c.g + 30)},${Math.min(255, c.b + 12)},1)`);
                pg.addColorStop(1, `rgba(${Math.max(0, c.r - 20)},${Math.max(0, c.g - 12)},${c.b},0.9)`);
                ctx.fillStyle = pg;
                ctx.fill();
            }

            // X-axis labels
            let labelIdxs: number[];
            if (n <= 30) labelIdxs = [0, 7, 14, 21, n - 1];
            else if (n <= 90) labelIdxs = [0, Math.round(n / 3), Math.round(2 * n / 3), n - 1];
            else labelIdxs = [0, Math.round(n / 4), Math.round(n / 2), Math.round(3 * n / 4), n - 1];

            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.font = "8px 'Inter', sans-serif";
            ctx.textAlign = "center";
            labelIdxs.forEach(i => {
                if (!data[i]) return;
                const label = data[i].date.toLocaleDateString("ru", { day: "numeric", month: "short" });
                ctx.fillText(label, xOf(i), H - 4);
            });

            // Hover tooltip
            if (hovered !== null && data[hovered]) {
                const { value } = data[hovered];
                const x = xOf(hovered);
                const y = yOf(value);
                const c = pillColor(value);
                const bW = 86, bH = 38;
                const bX = Math.min(Math.max(x - bW / 2, PL), W - PR - bW);
                const bY = Math.max(y - bH - 12, PT);

                roundRect(ctx, bX, bY, bW, bH, 8);
                ctx.fillStyle = "rgba(10,14,23,0.96)";
                ctx.fill();
                ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.6)`;
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
                ctx.font = "bold 13px 'Outfit', sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(String(value), bX + bW / 2, bY + 16);

                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.font = "600 8px 'Inter', sans-serif";
                ctx.fillText(getLevelName(value).toUpperCase(), bX + bW / 2, bY + 28);
            }
        };

        const timer = setTimeout(draw, 0);
        return () => clearTimeout(timer);
    }, [data, hovered, n]);

    function handleMouseMove(e: React.MouseEvent) {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const idx = Math.round((mx - 8) / (rect.width - 16) * (n - 1));
        onHover(idx >= 0 && idx < n ? idx : null);
    }

    return (
        <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => onHover(null)}
            style={{ display: "block", width: "100%", height: 160, cursor: "crosshair" }}
        />
    );
}

export default function ArchetypeChart({ userId, cardId, color }: ArchetypeChartProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"month" | "quarter" | "year">("month");
    const [hovered, setHovered] = useState<number | null>(null);

    useEffect(() => {
        setLoading(true);
        cardsAPI.getHistory(userId, cardId)
            .then(res => {
                setHistory(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load history", err);
                setLoading(false);
            });
    }, [userId, cardId]);

    const FILTER_DAYS = { month: 30, quarter: 90, year: 365 };

    const chartData = useMemo(() => {
        if (!history) return [];
        const n = FILTER_DAYS[filter];
        // Sort by date just in case
        const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Get last N days
        const now = new Date();
        const cutoff = new Date();
        cutoff.setDate(now.getDate() - n);

        // For realistic feel, if we have very little data, we might want to pad it or just show what we have.
        // The reference generated 365 days. Here we use actual data.
        const filtered = sorted.filter(d => new Date(d.date) >= cutoff);

        return filtered.map(d => ({
            value: d.score,
            date: new Date(d.date)
        }));
    }, [history, filter]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48 bg-white/5 rounded-2xl border border-white/5">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full"
                />
            </div>
        );
    }

    if (!history || history.length === 0) {
        return (
            <div className="flex items-center justify-center h-40 bg-white/5 rounded-2xl border border-white/5">
                <span className="text-xs text-white/20 uppercase font-bold tracking-widest">Нет данных для анализа</span>
            </div>
        );
    }

    return (
        <div className="glass p-4 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Шкала Хокинса</span>
                <div className="flex gap-1.5 p-1 bg-black/20 rounded-lg">
                    {(["month", "quarter", "year"] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1 rounded-md text-[9px] font-bold transition-all ${filter === f ? "bg-white/10 text-white shadow-sm" : "text-white/20 hover:text-white/40"
                                }`}
                        >
                            {f === "month" ? "30Д" : f === "quarter" ? "90Д" : "365Д"}
                        </button>
                    ))}
                </div>
            </div>

            <Canvas data={chartData} hovered={hovered} onHover={setHovered} />

            {/* Summary stats */}
            <div className="grid grid-cols-3 border-t border-white/5 pt-4">
                {[
                    { label: "Старт", val: chartData[0]?.value || 0 },
                    { label: "Пик", val: Math.max(...chartData.map((d: any) => d.value), 0) },
                    { label: "Среднее", val: Math.round(chartData.slice(-10).reduce((s: number, d: any) => s + d.value, 0) / (Math.min(chartData.length, 10) || 1)) },
                ].map((s, i) => {
                    const c = pillColor(s.val);
                    return (
                        <div key={i} className={`text-center ${i < 2 ? "border-r border-white/5" : ""}`}>
                            <div
                                className="text-lg font-extrabold font-outfit"
                                style={{ color: `rgb(${c.r},${c.g},${c.b})`, textShadow: `0 0 12px rgba(${c.r},${c.g},${c.b},0.3)` }}
                            >
                                {s.val || "—"}
                            </div>
                            <div className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-1">{s.label}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
