"use client";

import { useEffect, useState, useMemo } from "react";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ZAxis,
    Cell
} from "recharts";
import { cardsAPI } from "@/lib/api";

type StateHistoryItem = {
    date: string;
    score: number;
    type: string;
};

type TimeRange = "month" | "quarter" | "year" | "all";

const RANGE_LABELS: Record<TimeRange, string> = {
    month: "Месяц",
    quarter: "Квартал",
    year: "Год",
    all: "Весь период"
};

export default function StateGraph({ userId, cardId, currentScore }: { userId: number, cardId: number, currentScore: number }) {
    const [history, setHistory] = useState<StateHistoryItem[]>([]);
    const [range, setRange] = useState<TimeRange>("month");
    const [loading, setLoading] = useState(true);

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

    // Format data for recharts
    const chartData = useMemo(() => {
        if (!history || history.length === 0) return [];

        let filtered = history;
        const now = new Date();

        if (range !== "all") {
            const cutoffDate = new Date();
            if (range === "month") cutoffDate.setMonth(now.getMonth() - 1);
            if (range === "quarter") cutoffDate.setMonth(now.getMonth() - 3);
            if (range === "year") cutoffDate.setFullYear(now.getFullYear() - 1);

            filtered = history.filter(item => new Date(item.date) >= cutoffDate);
        }

        return filtered.map(item => {
            const dateObj = new Date(item.date);
            const formattedDate = dateObj.toLocaleDateString("ru-RU", { day: '2-digit', month: '2-digit' });
            return {
                ...item,
                timestamp: dateObj.getTime(),
                displayDate: formattedDate,
            };
        });
    }, [history, range]);

    // Helper for color based on score
    const getScoreColor = (score: number) => {
        if (score >= 500) return "#BEF264"; // Toxic Green from screenshot
        if (score >= 200) return "#FACC15"; // Yellow
        return "#EA580C"; // Orange/Red
    };

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const p = payload[0].payload;
            let typeLabel = "Синхронизация";
            if (p.type === "align_start") typeLabel = "Начало сессии";
            if (p.type === "align_end") typeLabel = "Итог сессии";

            return (
                <div style={{
                    background: "#0D0E15",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}>
                    <p style={{ margin: "0 0 4px", fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                        {p.displayDate} • {typeLabel}
                    </p>
                    <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: getScoreColor(p.score) }}>
                        Шкала Хокинса: {p.score}
                    </p>
                </div>
            );
        }
        return null;
    };

    const SegmentShape = (props: any) => {
        const { cx, cy, payload } = props;
        const color = getScoreColor(payload.score);
        return (
            <g>
                <filter id={`shadow-${payload.timestamp}`}>
                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={color} />
                </filter>
                <rect
                    x={cx - 10}
                    y={cy - 2}
                    width={20}
                    height={4}
                    fill={color}
                    rx={2}
                    filter={`url(#shadow-${payload.timestamp})`}
                    style={{ transition: "all 0.5s ease" }}
                />
            </g>
        );
    };

    return (
        <div style={{
            background: "rgba(255,255,255,0.02)",
            borderRadius: "20px",
            border: "1px solid rgba(255,255,255,0.05)",
            padding: "20px 16px",
            marginTop: "16px"
        }}>

            {/* Range Selector */}
            <div style={{
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                paddingBottom: "16px",
                scrollbarWidth: "none",
                msOverflowStyle: "none"
            }}>
                {(Object.keys(RANGE_LABELS) as TimeRange[]).map(r => (
                    <button
                        key={r}
                        onClick={() => setRange(r)}
                        style={{
                            background: range === r ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${range === r ? "rgba(255,255,255,0.2)" : "transparent"}`,
                            color: range === r ? "#fff" : "rgba(255,255,255,0.4)",
                            padding: "6px 14px",
                            borderRadius: "14px",
                            fontSize: "12px",
                            fontWeight: range === r ? 600 : 500,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            transition: "all 0.2s ease"
                        }}
                    >
                        {RANGE_LABELS[r]}
                    </button>
                ))}
            </div>

            {/* Graph area */}
            <div style={{ height: 260, position: "relative" }}>
                {loading ? (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Загрузка...</span>
                    </div>
                ) : chartData.length === 0 ? (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Нет данных</span>
                    </div>
                ) : (
                    <>
                        <ResponsiveContainer width="100%" height="80%">
                            <ScatterChart margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid
                                    strokeDasharray="0"
                                    stroke="rgba(255,255,255,0.05)"
                                    horizontal={false}
                                    vertical={true}
                                />
                                <XAxis
                                    dataKey="timestamp"
                                    type="number"
                                    domain={['auto', 'auto']}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, dy: 10 }}
                                    ticks={range === "month" && chartData.length > 0 ? (() => {
                                        const minT = Math.min(...chartData.map(d => d.timestamp));
                                        return [0, 6, 13, 20, 27, 29].map(d => minT + d * (24 * 60 * 60 * 1000));
                                    })() : undefined}
                                    tickFormatter={(val) => {
                                        if (range === "month") {
                                            const minT = Math.min(...chartData.map(d => d.timestamp));
                                            const dayDiff = Math.round((val - minT) / (24 * 60 * 60 * 1000));
                                            const labels = [1, 7, 14, 21, 28, 30];
                                            const indices = [0, 6, 13, 20, 27, 29];
                                            const idx = indices.indexOf(dayDiff);
                                            return idx !== -1 ? labels[idx].toString() : "";
                                        }
                                        const date = new Date(val);
                                        return date.getDate().toString();
                                    }}
                                />
                                <YAxis
                                    domain={[0, 1000]}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                                />
                                <ZAxis type="number" range={[100, 100]} />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 1 }} />

                                <Scatter data={chartData} shape={<SegmentShape />}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>

                        {/* Bottom Timeline Bar */}
                        <div style={{
                            marginTop: "20px",
                            height: "4px",
                            width: "100%",
                            background: "rgba(255,255,255,0.05)",
                            borderRadius: "2px",
                            display: "flex",
                            gap: "1px",
                            overflow: "hidden",
                        }}>
                            {chartData.map((item, i) => (
                                <div
                                    key={`bar-${i}`}
                                    style={{
                                        flex: 1,
                                        height: "100%",
                                        backgroundColor: getScoreColor(item.score),
                                        boxShadow: `0 0 4px ${getScoreColor(item.score)}44`,
                                    }}
                                />
                            ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>0</span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: "0.05em" }}>
                                {chartData.length} СЕССИЙ
                            </span>
                        </div>
                    </>
                )}
            </div>

            <div style={{ textAlign: "center", marginTop: 12 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    ГРАФИК СОСТОЯНИЙ
                </span>
            </div>
        </div>
    );
}
