import { useState, useEffect, useRef, useMemo } from "react";

// ── Color gradient 0–1000 ─────────────────────────────────────────────────────
function pillColor(v) {
  const stops = [
    { v: 0,    r: 220, g: 55,  b: 10  },
    { v: 150,  r: 235, g: 90,  b: 15  },
    { v: 250,  r: 255, g: 145, b: 20  },
    { v: 350,  r: 255, g: 200, b: 20  },
    { v: 500,  r: 210, g: 230, b: 20  },
    { v: 650,  r: 145, g: 235, b: 30  },
    { v: 1000, r: 55,  g: 255, b: 80  },
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

function toRgba(v, a = 1) {
  const c = pillColor(v);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

// ── Hawkins level name ────────────────────────────────────────────────────────
const LEVELS = [
  [0,"Стыд"],[20,"Вина"],[30,"Апатия"],[50,"Горе"],[75,"Страх"],
  [100,"Желание"],[125,"Гнев"],[150,"Гордость"],[175,"Мужество"],
  [200,"Нейтральность"],[250,"Готовность"],[310,"Принятие"],
  [350,"Разум"],[400,"Любовь"],[500,"Радость"],[540,"Мир"],
  [600,"Просветление"],[700,"Чистое Сознание"],[850,"Абсолют"],
];
function getLevelName(v) {
  let result = LEVELS[0];
  for (const l of LEVELS) {
    if (v >= l[0]) result = l;
    else break;
  }
  return result[1];
}

// ── Rounded rect helper (replaces ctx.roundRect) ──────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
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

// ── Demo data ─────────────────────────────────────────────────────────────────
function genData(days, startVal, trend) {
  let cur = startVal;
  const arr = [];
  for (let i = 0; i < days; i++) {
    cur = Math.max(50, Math.min(980, cur + (trend / days) * (0.5 + Math.random()) + (Math.random() - 0.42) * 24));
    const d = new Date(2025, 2, 9);
    d.setDate(d.getDate() - (days - 1 - i));
    arr.push({ value: Math.round(cur), date: d });
  }
  return arr;
}

const ALL_DATA = genData(365, 140, 420);
const FILTER_DAYS = { month: 30, quarter: 90, year: 365 };

// ── Chart Component ───────────────────────────────────────────────────────────
function Chart({ data, hovered, onHover }) {
  const canvasRef = useRef(null);
  const n = data.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use a small delay to ensure DOM has laid out
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.offsetWidth || 360;
      const H = canvas.offsetHeight || 150;

      canvas.width = W * dpr;
      canvas.height = H * dpr;

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      const PL = 8, PR = 8, PT = 10, PB = 20;
      const iW = W - PL - PR;
      const iH = H - PT - PB;

      ctx.clearRect(0, 0, W, H);

      const xOf = (i) => PL + (i / Math.max(n - 1, 1)) * iW;
      const yOf = (v) => PT + iH - (v / 1000) * iH;

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
      const pillW = Math.max(4, Math.min(20, (iW / n) * 0.6));
      const pillH = 5;
      const R = pillH / 2;

      for (let i = 0; i < n; i++) {
        const { value } = data[i];
        const x = xOf(i);
        const y = yOf(value);
        const c = pillColor(value);
        const isHov = hovered === i;

        // Outer glow
        const grd = ctx.createRadialGradient(x, y, 0, x, y, pillW * 1.5);
        grd.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${isHov ? 0.55 : 0.28})`);
        grd.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(x, y, pillW * 1.5, pillW * 0.8, 0, 0, Math.PI * 2);
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
      let labelIdxs;
      if (n <= 30) labelIdxs = [0, 6, 13, 20, n - 1];
      else if (n <= 90) labelIdxs = [0, Math.round(n / 3), Math.round(2 * n / 3), n - 1];
      else labelIdxs = [0, Math.round(n / 4), Math.round(n / 2), Math.round(3 * n / 4), n - 1];

      ctx.fillStyle = "#374151";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      labelIdxs.forEach(i => {
        if (!data[i]) return;
        const label = n <= 30
          ? String(data[i].date.getDate())
          : data[i].date.toLocaleDateString("ru", { day: "numeric", month: "short" });
        ctx.fillText(label, xOf(i), H - 4);
      });

      // Hover tooltip
      if (hovered !== null && data[hovered]) {
        const { value, date } = data[hovered];
        const x = xOf(hovered);
        const y = yOf(value);
        const c = pillColor(value);
        const bW = 90, bH = 36;
        const bX = Math.min(Math.max(x - bW / 2, PL), W - PR - bW);
        const bY = Math.max(y - bH - 10, PT);

        roundRect(ctx, bX, bY, bW, bH, 6);
        ctx.fillStyle = "rgba(7,11,17,0.97)";
        ctx.fill();
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.7)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(value), bX + bW / 2, bY + 14);

        ctx.fillStyle = "#6b7280";
        ctx.font = "9px monospace";
        ctx.fillText(getLevelName(value), bX + bW / 2, bY + 27);
      }
    };

    const timer = setTimeout(draw, 0);
    return () => clearTimeout(timer);
  }, [data, hovered, n]);

  function handleMouseMove(e) {
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
      style={{ display: "block", width: "100%", height: 150, cursor: "crosshair" }}
    />
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
const ARCHETYPE = { name: "Маг", symbol: "\u2736", value: 540, sphere: "Карьера" };

export default function App() {
  const [filter, setFilter] = useState("month");
  const [hovered, setHovered] = useState(null);

  const data = useMemo(() => ALL_DATA.slice(-FILTER_DAYS[filter]), [filter]);

  const last  = ALL_DATA[ALL_DATA.length - 1].value;
  const avg   = Math.round(data.reduce((s, d) => s + d.value, 0) / data.length);
  const peak  = Math.max(...data.map(d => d.value));
  const delta = last - data[0].value;

  const S = {
    page: {
      minHeight: "100vh",
      background: "#070b10",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "monospace",
      boxSizing: "border-box",
    },
    card: {
      width: "100%",
      maxWidth: 400,
      background: "#0c1219",
      border: `1px solid ${toRgba(ARCHETYPE.value, 0.18)}`,
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: `0 0 40px ${toRgba(ARCHETYPE.value, 0.07)}, 0 24px 48px rgba(0,0,0,0.7)`,
    },
    divider: { borderTop: "1px solid rgba(255,255,255,0.05)" },
  };

  return (
    <div style={S.page}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={S.card}>

          {/* ── HEADER ── */}
          <div style={{
            padding: "18px 20px",
            borderBottom: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* ambient bg glow */}
            <div style={{
              position: "absolute", top: -60, right: -60, width: 160, height: 160,
              background: `radial-gradient(circle, ${toRgba(ARCHETYPE.value, 0.1)} 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />

            {/* Meta: Сфера + Архетип */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 8, letterSpacing: 2, color: "#2d3748", textTransform: "uppercase", minWidth: 52 }}>
                  Сфера
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: toRgba(ARCHETYPE.value, 1) }}>
                  {ARCHETYPE.sphere}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 8, letterSpacing: 2, color: "#2d3748", textTransform: "uppercase", minWidth: 52 }}>
                  Архетип
                </span>
                <span style={{ fontSize: 26, fontWeight: 800, color: "#e2e8f0" }}>
                  {ARCHETYPE.name}
                </span>
              </div>
            </div>

            {/* Current level badge */}
            <div style={{
              textAlign: "center", flexShrink: 0,
              background: `linear-gradient(135deg, ${toRgba(last, 0.14)}, ${toRgba(last, 0.04)})`,
              border: `1px solid ${toRgba(last, 0.28)}`,
              borderRadius: 12,
              padding: "10px 18px",
            }}>
              <div style={{
                fontSize: 28, fontWeight: 800, lineHeight: 1,
                color: toRgba(last, 1),
                textShadow: `0 0 16px ${toRgba(last, 0.45)}`,
              }}>
                {last}
              </div>

            </div>
          </div>


          {/* ── CHART ── */}
          <div style={{ padding: "12px 14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 8, letterSpacing: 2.5, color: "#1f2937", textTransform: "uppercase" }}>
                Шкала Хокинса
              </span>
              <div style={{ display: "flex", gap: 3 }}>
                {[["month", "30Д"], ["quarter", "90Д"], ["year", "365Д"]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    style={{
                      background: filter === key ? "rgba(255,255,255,0.08)" : "transparent",
                      border: `1px solid ${filter === key ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)"}`,
                      borderRadius: 4,
                      padding: "3px 9px",
                      color: filter === key ? "#9ca3af" : "#2d3748",
                      fontSize: 8,
                      letterSpacing: 1,
                      cursor: "pointer",
                      fontFamily: "monospace",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Chart data={data} hovered={hovered} onHover={setHovered} />
          </div>

          {/* ── STATS FOOTER ── */}
          <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            {[
              { label: "Среднее", val: avg },
              { label: "Пик",     val: peak },
              { label: "Старт",   val: data[0].value },
            ].map(({ label, val }, i) => (
              <div key={i} style={{
                flex: 1,
                padding: "11px 0",
                textAlign: "center",
                borderRight: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}>
                <div style={{
                  fontSize: 15, fontWeight: 700,
                  color: toRgba(val),
                  textShadow: `0 0 8px ${toRgba(val, 0.3)}`,
                }}>
                  {val}
                </div>
                <div style={{ fontSize: 8, color: "#2d3748", letterSpacing: 2, textTransform: "uppercase", marginTop: 3 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

        </div>

        <div style={{ textAlign: "center", marginTop: 10, fontSize: 8, color: "#131c28", letterSpacing: 4, textTransform: "uppercase" }}>
          QUANTUM SHIFT
        </div>
      </div>
    </div>
  );
}
