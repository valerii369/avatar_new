"use client";

import { useMemo, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
// SphereInfoPanel — нижняя плашка сферы с recharts bar chart (22 архетипа)
//
// Stack: Next.js 16 · React 19 · Tailwind 4 · recharts · framer-motion
//
// Замена текущего блока:
//   {selected !== null && states[selected] && (
//     <SphereInfoPanel
//       visible
//       sphere={SPHERES[selected]}
//       state={states[selected]}
//       cards={states[selected].cards ?? []}
//       onCardTap={(card) => router.push(`/card/${card.id}`)}
//       onClose={() => setSelected(null)}
//     />
//   )}
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardData {
  id?: number;
  archetype_name: string;
  hawkins_peak?: number;
  hawkins?: number;
  status?: string;
}

export interface SphereState {
  active_count: number;
  sphere_hawkins: number;
  cards?: CardData[];
}

export interface SphereConfig {
  name: string;
  color: number[]; // [r, g, b]
}

interface Props {
  visible: boolean;
  sphere: SphereConfig;
  state: SphereState;
  cards: CardData[];
  onCardTap?: (card: CardData) => void;
  onClose?: () => void;
}

function hawkColor(s: number): string {
  if (s <= 0) return "rgba(255,255,255,0.06)";
  
  // 0 - 150: Critical Shadow (Deep Red)
  if (s < 150) {
    const t = s / 150;
    return `rgb(${~~(176 + 33 * t)}, ${~~(30 + 6 * t)}, ${~~(30 + 6 * t)})`;
  }
  
  // 150 - 250: The Bridge (Red to Amber) - Uniform transition around the 200 line
  if (s < 250) {
    const t = (s - 150) / 100;
    return `rgb(${~~(209 + 36 * t)}, ${~~(36 + 122 * t)}, ${~~(36 - 16 * t)})`;
  }
  
  // 250 - 500: Transformation (Amber to Lime)
  if (s < 500) {
    const t = (s - 250) / 250;
    return `rgb(${~~(245 - 113 * t)}, ${~~(158 + 46 * t)}, ${~~(20 + 2 * t)})`;
  }
  
  // 500 - 1000: Mastery (Lime to Emerald)
  const t = Math.min(1, (s - 500) / 500);
  return `rgb(${~~(132 - 116 * t)}, ${~~(204 - 19 * t)}, ${~~(22 + 107 * t)})`;
}

// ─── Abbreviation map & Fallback ─────────────────────────────────────────────

const ABBR: Record<string, string> = {
  "Шут": "Шт", "Маг": "Мг", "Жрица": "Жр", "Императрица": "Им",
  "Император": "Ип", "Иерофант": "Ие", "Влюблённые": "Вл", "Колесница": "Кл",
  "Сила": "Сл", "Отшельник": "От", "Колесо Фортуны": "Кф", "Фортуна": "Фр",
  "Справедливость": "Сп", "Повешенный": "Пв", "Смерть": "См", "Умеренность": "Ум",
  "Дьявол": "Дв", "Башня": "Бш", "Звезда": "Зв", "Луна": "Лн",
  "Солнце": "Сн", "Суд": "Сд", "Мир": "Мр"
};

const DEFAULT_ARCHETYPES = [
  "Шут", "Маг", "Жрица", "Императрица", "Император", "Иерофант",
  "Влюблённые", "Колесница", "Сила", "Отшельник", "Фортуна",
  "Справедливость", "Повешенный", "Смерть", "Умеренность",
  "Дьявол", "Башня", "Звезда", "Луна", "Солнце", "Суд", "Мир"
];

// ─── Custom tooltip ───────────────────────────────────────────────────────────

interface TooltipPayload {
  name: string;
  fullName: string;
  hawkins: number;
  color: string;
  status: string;
}

function ChartTooltip({ active, payload }: {
  active?: boolean;
  payload?: { payload: TooltipPayload }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.hawkins <= 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-[#121636]/95 px-3 py-2 backdrop-blur-sm">
      <p className="text-[11px] font-medium text-white/80">{d.fullName}</p>
      <p className="text-sm font-semibold" style={{ color: d.color }}>
        {d.hawkins}
      </p>
    </div>
  );
}

// ─── Custom bar shape (rounded top) ───────────────────────────────────────────

function RoundedBar(props: any) {
  const { x, y, width, height, fill, opacity } = props;
  if (height <= 0) return null;
  const r = Math.min(6, width / 2, height / 2);

  return (
    <g>
      <path
        d={`
          M${x},${y + height}
          V${y + r}
          Q${x},${y} ${x + r},${y}
          H${x + width - r}
          Q${x + width},${y} ${x + width},${y + r}
          V${y + height}
          Z
        `}
        fill={fill}
        opacity={opacity ?? 0.85}
      />
      {/* Subtle top highlight for a modern, slightly glossy look */}
      <path
        d={`
          M${x + 0.5},${y + r}
          Q${x + 0.5},${y + 0.5} ${x + r},${y + 0.5}
          H${x + width - r}
          Q${x + width - 0.5},${y + 0.5} ${x + width - 0.5},${y + r}
        `}
        fill="none"
        stroke="white"
        strokeOpacity={0.2}
        strokeWidth={1}
      />
      {/* Glassy edge highlight (right side) */}
      <path
        d={`
          M${x + width - 1},${y + r}
          V${y + height}
        `}
        fill="none"
        stroke="white"
        strokeOpacity={0.08}
        strokeWidth={1}
      />
      {/* Glossy overlay gradient */}
      <path
        d={`
          M${x},${y + r}
          Q${x},${y} ${x + r},${y}
          H${x + width - r}
          Q${x + width},${y} ${x + width},${y + r}
          V${y + height}
          H${x}
          Z
        `}
        fill="url(#barGradient)"
      />
      {/* Performance/Tip accent line */}
      <path
        d={`
          M${x + r},${y + 1.5}
          H${x + width - r}
        `}
        fill="none"
        stroke="white"
        strokeOpacity={0.4}
        strokeWidth={1}
      />
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SphereInfoPanel({
  visible,
  sphere,
  state,
  cards,
  onCardTap: _onCardTap, // Prefix as unused
  onClose,
}: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const sphereRgb = `rgb(${sphere.color.join(",")})`;

  // Normalize to 22 chart entries
  const chartData = useMemo(() => {
    const slots: TooltipPayload[] = [];
    
    // We always want to show 22 slots
    for (let i = 0; i < 22; i++) {
      const card = cards[i];
      const fallbackName = DEFAULT_ARCHETYPES[i] || `X${i + 1}`;
      const archetypeName = card?.archetype_name || fallbackName;
      const h = card?.hawkins_peak ?? card?.hawkins ?? 0;

      slots.push({
        name: ABBR[archetypeName] || archetypeName.substring(0, 2),
        fullName: archetypeName,
        hawkins: h,
        color: hawkColor(h),
        status: card?.status || "locked",
      });
    }

    return slots;
  }, [cards]);

  const handleBarClick = useCallback(
    (_data: any, index: number) => {
      setActiveIdx((prev) => (prev === index ? null : index));
    },
    [],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="fixed bottom-[110px] left-4 right-4 z-50 rounded-[20px] border border-white/[0.08] p-3.5 pb-2.5"
          style={{
            background: "rgba(13,18,38,0.92)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 -4px 40px rgba(0,0,0,0.4)",
          }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: sphereRgb }}>
              {sphere.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/40">
                {state.active_count}/22 · {state.sphere_hawkins} ✦
              </span>
              {onClose && (
                <button
                  onClick={onClose}
                  className="pl-1 text-white/20 transition-colors hover:text-white/50"
                  aria-label="Закрыть"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 3l8 8M11 3l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="h-px bg-white/[0.06] mt-1 mb-3 -mx-3.5" />

          <div className="-mx-1 mt-1">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 4, bottom: 0, left: 0 }}
                barCategoryGap="23%"
                onMouseMove={(state) => {
                  if (state?.activeTooltipIndex !== undefined) {
                    setActiveIdx(state.activeTooltipIndex as number);
                  }
                }}
                onMouseLeave={() => setActiveIdx(null)}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity={0.15} />
                    <stop offset="40%" stopColor="white" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="white" stopOpacity={0} />
                  </linearGradient>
                  
                  {/* Specialized color glows */}
                  <filter id="glowRed" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feFlood floodColor="#ff3030" floodOpacity="0.4" result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glow" />
                    <feComposite in="SourceGraphic" in2="glow" operator="over" />
                  </filter>
                  <filter id="glowYellow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feFlood floodColor="#ffcc00" floodOpacity="0.3" result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glow" />
                    <feComposite in="SourceGraphic" in2="glow" operator="over" />
                  </filter>
                  <filter id="glowGreen" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feFlood floodColor="#00ffcc" floodOpacity="0.4" result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glow" />
                    <feComposite in="SourceGraphic" in2="glow" operator="over" />
                  </filter>
                </defs>

                {/* Y-axis */}
                <YAxis
                  domain={[0, 1000]}
                  ticks={[0, 200, 500, 999]}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                  tickFormatter={(val) => val.toString()}
                  tick={({ x: _x, y, payload }: any) => (
                    <text
                      x={4}
                      y={Number(y) + 4}
                      textAnchor="start"
                      fill={payload.value === 200 ? "rgba(220,38,38,0.8)" : "rgba(255,255,255,0.15)"}
                      fontSize={11}
                      fontWeight={payload.value === 200 ? 600 : 400}
                    >
                      {payload.value}
                    </text>
                  )}
                />

                {/* X-axis: abbreviated names */}
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={({ x, y, payload, index }: any) => {
                    const data = chartData[index];
                    const isActive = data?.status === "active";
                    const isRecommended = data?.status === "recommended";
                    
                    const color = isActive 
                      ? "rgba(255, 255, 255, 0.5)" // Muted gray for active
                      : isRecommended 
                        ? "rgba(253, 186, 116, 0.3)" // Even more muted orange
                        : "rgba(255, 255, 255, 0.12)";

                    return (
                      <text
                        x={x}
                        y={y + 10}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={isActive || isRecommended ? 700 : 400}
                        fill={color}
                        style={{ transition: "all 0.3s ease" }}
                      >
                        {payload.value}
                      </text>
                    );
                  }}
                />

                {/* Grid lines */}
                <ReferenceLine
                  y={0}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={0.5}
                />
                <ReferenceLine
                  y={200}
                  stroke="rgba(220,38,38,0.3)"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                />
                <ReferenceLine
                  y={500}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={0.5}
                />
                <ReferenceLine
                  y={999}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={0.5}
                />

                {/* Tooltip */}
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={false}
                  isAnimationActive={false}
                />

                {/* Bars */}
                <Bar
                  dataKey="hawkins"
                  shape={<RoundedBar />}
                  background={{ fill: "rgba(255,255,255,0.05)", radius: 6 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                  animationBegin={100}
                  onClick={handleBarClick}
                  style={{ cursor: "pointer" }}
                >
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.color}
                      style={{
                        filter: activeIdx === i 
                          ? (entry.hawkins < 200 ? "url(#glowRed)" : entry.hawkins < 500 ? "url(#glowYellow)" : "url(#glowGreen)")
                          : "none",
                        transition: "filter 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
                      }}
                      opacity={
                        entry.hawkins <= 0
                          ? 0.12
                          : activeIdx === i
                            ? 1
                            : 0.7
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
