"use client";
import { motion } from "framer-motion";

// ═══════════════════════════════════════════════════════════════════
// HawkinsBar — шкала сознания 0–1000
// Props: value (number), animated? (boolean)
// ═══════════════════════════════════════════════════════════════════

const LEVELS = [
  { ru: "Стыд",         v: 20  },
  { ru: "Вина",         v: 30  },
  { ru: "Апатия",       v: 50  },
  { ru: "Горе",         v: 75  },
  { ru: "Страх",        v: 100 },
  { ru: "Желание",      v: 125 },
  { ru: "Гнев",         v: 150 },
  { ru: "Гордыня",      v: 175 },
  { ru: "Смелость",     v: 200 },
  { ru: "Нейтралитет",  v: 250 },
  { ru: "Готовность",   v: 310 },
  { ru: "Принятие",     v: 350 },
  { ru: "Разум",        v: 400 },
  { ru: "Любовь",       v: 500 },
  { ru: "Радость",      v: 540 },
  { ru: "Покой",        v: 600 },
  { ru: "Просветление", v: 700 },
];

function getLevel(v: number) {
  let m = LEVELS[0];
  for (const l of LEVELS) if (v >= l.v) m = l;
  return m;
}

function color(s: number): string {
  if (s < 200) {
    const t = s / 200;
    return `rgb(${~~(185 + 55 * t)},${~~(48 + 88 * t)},${~~(48 - 8 * t)})`;
  }
  if (s < 500) {
    const t = (s - 200) / 300;
    return `rgb(${~~(240 - 196 * t)},${~~(136 + 52 * t)},${~~(40 + 80 * t)})`;
  }
  const t = Math.min(1, (s - 500) / 500);
  return `rgb(${~~(44 + 56 * t)},${~~(188 + 47 * t)},${~~(120 + 55 * t)})`;
}

function gradient(v: number) {
  if (v < 200) return "linear-gradient(90deg, #A43028, #D06828)";
  const c = color(v);
  const knee = (20 / (v / 1000 * 100)) * 100;
  return `linear-gradient(90deg, #A43028 0%, #D06828 ${knee}%, #28905C ${knee + 10}%, ${c} 100%)`;
}

interface Props {
  value: number;
  animated?: boolean;
}

export default function HawkinsBar({ value, animated = true }: Props) {
  const pct = Math.min(Math.max(value / 1000, 0), 1) * 100;
  const lvl = getLevel(value);
  const c = color(value);

  const fill = animated ? (
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${pct}%` }}
      transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1], delay: 0.3 }}
      style={{
        position: "absolute", left: 0, top: 0, height: "100%",
        borderRadius: 3, background: gradient(value),
      }}
    />
  ) : (
    <div style={{
      position: "absolute", left: 0, top: 0, height: "100%",
      width: `${pct}%`, borderRadius: 3, background: gradient(value),
    }} />
  );

  return (
    <div style={{
      margin: "12px 20px 12px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 12,
        padding: "12px 20px 0",
      }}>
        <span style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase" as const,
          color: "rgba(240,237,230,0.28)",
        }}>
          Уровень сознания
        </span>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          {value > 0 ? (
            <>
              <span style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(240,237,230,0.50)",
              }}>
                {lvl.ru}
              </span>
              <span style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.18em",
                color: c,
              }}>
                {value}
              </span>
            </>
          ) : (
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(240,237,230,0.25)",
            }}>
              Не активирована
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: "0 20px 8px" }}>
        {/* Track */}
        <div style={{
          position: "relative",
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.04)",
        }}>
          {/* Zone underlays */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 3,
            overflow: "hidden", display: "flex",
          }}>
            <div style={{ width: "20%", background: "rgba(164,48,40,0.12)" }} />
            <div style={{ flex: 1, background: "rgba(40,144,92,0.06)" }} />
          </div>

          {fill}

          {/* 200 threshold */}
          <div style={{
            position: "absolute", left: "20%", top: -3, width: 1,
            height: 12, background: "rgba(240,237,230,0.12)",
            borderRadius: 1,
          }} />
        </div>

        {/* Ticks */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontFamily: "'Outfit', sans-serif",
          fontSize: 10,
          fontWeight: 400,
          color: "rgba(240,237,230,0.15)",
          letterSpacing: "0.04em",
        }}>
          <span>0</span>
          <span>200</span>
          <span>500</span>
          <span>1000</span>
        </div>
      </div>
    </div>
  );
}
