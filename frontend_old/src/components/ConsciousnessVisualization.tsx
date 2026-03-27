import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import SphereInfoPanel from "./SphereInfoPanel";

const SPHERES = [
    { id: 1,  key: "IDENTITY",       icon: "user",           name: "Личность",   color: [245, 158, 11] },  // #F59E0B
    { id: 2,  key: "RESOURCES",      icon: "database",       name: "Деньги",     color: [16, 185, 129] },  // #10B981
    { id: 3,  key: "COMMUNICATION",  icon: "message-circle",  name: "Связи",       color: [6, 182, 212] },   // #06B6D4
    { id: 4,  key: "ROOTS",          icon: "home",           name: "Корни",       color: [249, 115, 22] },  // #F97316
    { id: 5,  key: "CREATIVITY",     icon: "heart",          name: "Творчество",  color: [236, 72, 153] },  // #EC4899
    { id: 6,  key: "SERVICE",        icon: "clipboard",      name: "Служение",    color: [20, 184, 166] },  // #14B8A6
    { id: 7,  key: "PARTNERSHIP",    icon: "link",           name: "Партнерство", color: [59, 130, 246] },  // #3B82F6
    { id: 8,  key: "TRANSFORMATION", icon: "zap",            name: "Тень",        color: [99, 102, 241] },  // #6366F1
    { id: 9,  key: "EXPANSION",      icon: "compass",        name: "Поиск",       color: [139, 92, 246] },  // #8B5CF6
    { id: 10, key: "STATUS",         icon: "award",          name: "Статус",      color: [239, 68, 68] },   // #EF4444
    { id: 11, key: "VISION",         icon: "users",          name: "Будущее",     color: [217, 70, 239] },  // #D946EF
    { id: 12, key: "SPIRIT",         icon: "moon",           name: "Дух",         color: [100, 116, 139] }, // #64748B
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easePow = (t: number, p: number) => Math.pow(t, p);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function hawkinsToRank(s: number) {
    const t = [20, 50, 100, 175, 200, 310, 400, 500, 600, 1000];
    const i = t.findIndex(v => s <= v);
    return i === -1 ? 10 : i + 1;
}

function getTier(): "high" | "medium" | "low" {
    if (typeof window === "undefined" || typeof navigator === "undefined") return "medium";
    const mob = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency || 2;
    if (!mob && cores >= 6) return 'high';
    if (mob && cores >= 6) return 'medium';
    return mob ? 'low' : 'medium';
}

const TIERS = {
    high: { dpr: 2, particles: 100, steps: 50, maxThreads: 18, glowLayers: 6, interThreads: 4, dots: 12, sphereRings: 3, sphereSparkles: 10 },
    medium: { dpr: 1.5, particles: 50, steps: 30, maxThreads: 10, glowLayers: 3, interThreads: 2, dots: 6, sphereRings: 2, sphereSparkles: 6 },
    low: { dpr: 1.5, particles: 25, steps: 18, maxThreads: 6, glowLayers: 2, interThreads: 1, dots: 3, sphereRings: 1, sphereSparkles: 3 },
};

interface CardData {
    id: number;
    sphere: string;
    hawkins_peak: number;
    status: string;
}

interface ConsciousnessProps {
    cards: CardData[];
}

export default function ConsciousnessVisualization({ cards = [] }: ConsciousnessProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const router = useRouter();

    const particlesRef = useRef<any[]>([]);
    const smoothRef = useRef<number[]>(SPHERES.map(() => 0));
    const tierRef = useRef<"high" | "medium" | "low">('high');
    const fpsRef = useRef({ count: 0, last: 0, current: 60 });
    const introRef = useRef(0);
    const startTimeRef = useRef(0);

    const states = useMemo(() => {
        return SPHERES.map((sphereDef) => {
            let sphereCards = cards.filter(c => c.sphere === sphereDef.key);

            // 🛠 MOCK DATA FOR TESTING IDENTITY CHART
            if (sphereDef.key === "IDENTITY") {
                sphereCards = Array.from({ length: 22 }, (_, i) => {
                    const status = i < 8 ? "active" : i < 16 ? "recommended" : "locked";
                    return {
                        id: 2000 + i,
                        sphere: sphereDef.key, // Added missing property
                        archetype_name: "", // Will fallback to default in SphereInfoPanel
                        // Only 'active' cards have scores; others are 0
                        hawkins_peak: status === "active" ? Math.round(20 + (i * (800 - 20) / 7)) : 0,
                        status: status
                    };
                }) as any[];
            }

            const active = sphereCards.filter(c => (c.status !== "locked" && (c.hawkins_peak ?? 0) > 0) || sphereDef.key === "IDENTITY");
            const activeCount = active.length;

            const cappedCount = Math.min(22, activeCount);
            const totalHawkins = active.slice(0, 22).reduce((s, c) => s + (c.hawkins_peak || 20), 0);

            const active_cards = active.map((c, i) => ({
                id: i,
                hawkins_score: c.hawkins_peak || 20
            }));

            return {
                active_count: cappedCount,
                sphere_score: totalHawkins / 22000,
                sphere_hawkins: cappedCount > 0 ? Math.round(totalHawkins / cappedCount) : 0,
                active_cards: active_cards,
                cards: sphereCards,
            };
        });
    }, [cards]);

    const initParticles = useCallback((w: number, h: number, count: number) => {
        particlesRef.current = Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.25,
            vy: (Math.random() - 0.5) * 0.25,
            size: Math.random() * 2 + 0.5,
            alpha: Math.random() * 0.25 + 0.06,
            pulse: Math.random() * Math.PI * 2,
        }));
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        let w = 0, h = 0;
        tierRef.current = getTier();
        let T = TIERS[tierRef.current];
        startTimeRef.current = performance.now();

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, T.dpr);
            const rect = canvas.getBoundingClientRect();
            w = rect.width;
            h = rect.height;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            initParticles(w, h, T.particles);
        };
        resize();
        window.addEventListener("resize", resize);

        const getPositions = () => {
            const cx = w / 2, cy = h * 0.44, r = Math.min(w, h) * 0.35;
            return SPHERES.map((s, i) => {
                const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                return {
                    x: cx + Math.cos(a) * r,
                    y: cy + Math.sin(a) * r,
                    ...s
                };
            });
        };

        const drawBg = (t: number) => {
            // Match the app's deep background exactly
            ctx.fillStyle = "#060818";
            ctx.fillRect(0, 0, w, h);

            // Subtle glow in the center to depth
            const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
            g.addColorStop(0, "rgba(20,24,60,0.4)");
            g.addColorStop(1, "rgba(6,8,24,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);

            for (let i = 0; i < 3; i++) {
                const nx = w * (0.25 + i * 0.25) + Math.sin(t * 0.00015 + i * 2) * 40;
                const ny = h * (0.3 + i * 0.15) + Math.cos(t * 0.0002 + i) * 25;
                const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, w * 0.3);
                const hu = (210 + i * 50 + t * 0.005) % 360;
                ng.addColorStop(0, `hsla(${hu},50%,18%,0.08)`);
                ng.addColorStop(0.5, `hsla(${hu},35%,12%,0.04)`);
                ng.addColorStop(1, "transparent");
                ctx.fillStyle = ng;
                ctx.fillRect(0, 0, w, h);
            }
        };

        const drawParts = (t: number, intro: number) => {
            const pAlpha = intro;
            particlesRef.current.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
                const pu = Math.sin(t * 0.002 + p.pulse) * 0.3 + 0.7;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * pu, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200,220,255,${p.alpha * 1.5 * pu * pAlpha})`;
                ctx.fill();
            });
        };

        const drawCenter = (t: number, cx: number, cy: number, sts: any[], intro: number) => {
            const gs = sts.reduce((s, st) => s + st.sphere_score, 0) / 12;
            const gi = Math.max(0.15, easePow(gs, 1.1)) * intro;
            const bR = Math.min(w, h) * 0.13;
            const br = Math.sin(t * 0.0008) * 4;

            for (let l = 4; l >= 0; l--) {
                const sp = bR * 1.2 + l * (15 + gi * 25) + br;
                if (sp <= 0) continue;
                const al = (0.07 + gi * 0.08) * (1 - l / 5);
                const ag = ctx.createRadialGradient(cx, cy, Math.max(0, bR * 0.3), cx, cy, sp);
                ag.addColorStop(0, `rgba(180,200,255,${al})`);
                ag.addColorStop(0.4, `rgba(140,160,230,${al * 0.6})`);
                ag.addColorStop(1, "transparent");
                ctx.fillStyle = ag;
                ctx.beginPath();
                ctx.arc(cx, cy, sp, 0, Math.PI * 2);
                ctx.fill();
            }

            const fR = bR * 0.55, rot = t * 0.0002;
            ctx.save();
            ctx.translate(cx, cy);

            for (let rn = 3; rn >= 1; rn--) {
                const rr = Math.max(0, fR * rn * 0.65);
                ctx.strokeStyle = `rgba(180,210,255,${(0.12 + gi * 0.15) * (1 - rn * 0.2) * (Math.sin(t * 0.001 + rn) * 0.15 + 0.85)})`;
                ctx.lineWidth = 0.8 + gi * 0.8;
                ctx.beginPath();
                ctx.arc(0, 0, rr, 0, Math.PI * 2);
                ctx.stroke();
            }

            const cp = Math.sin(t * 0.0015) * 0.1 + 0.9;
            ctx.strokeStyle = `rgba(210,235,255,${(0.2 + gi * 0.25) * cp})`;
            ctx.lineWidth = 1.0 + gi * 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(0, fR * cp), 0, Math.PI * 2);
            ctx.stroke();

            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + rot, pp = Math.sin(t * 0.0012 + i * 1.05) * 0.1 + 0.9;
                const si2 = i % 12;
                const [sr, sg, sb] = SPHERES[si2].color;
                const inf = Math.max(0.2, easePow(sts[si2].sphere_score, 1.2));
                ctx.strokeStyle = `rgba(${Math.floor(lerp(180, sr, inf * 0.6))},${Math.floor(lerp(210, sg, inf * 0.6))},${Math.floor(lerp(255, sb, inf * 0.6))},${(0.15 + gi * 0.2) * pp})`;
                ctx.lineWidth = 0.8 + gi * 1.0;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * fR, Math.sin(a) * fR, Math.max(0, fR * pp), 0, Math.PI * 2);
                ctx.stroke();
            }

            if (gi > 0.05) {
                const oa = Math.max(0.05, (gi - 0.05) * 0.3);
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + rot + Math.PI / 6, pp = Math.sin(t * 0.001 + i * 0.9 + 2) * 0.1 + 0.9;
                    ctx.strokeStyle = `rgba(180, 210, 255, ${oa * pp})`;
                    ctx.lineWidth = 0.6 + gi * 0.6;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * fR * 1.73, Math.sin(a) * fR * 1.73, Math.max(0, fR * pp), 0, Math.PI * 2); ctx.stroke();
                }
            }

            if (gi > 0.02) {
                const la = Math.min(0.25, Math.max(0.08, gi - 0.02) * 0.3);
                ctx.strokeStyle = `rgba(220, 240, 255, ${la})`; ctx.lineWidth = 0.6;
                for (let i = 0; i < 6; i++) {
                    const a1 = (i / 6) * Math.PI * 2 + rot, a2 = ((i + 2) / 6) * Math.PI * 2 + rot;
                    ctx.beginPath(); ctx.moveTo(Math.cos(a1) * fR, Math.sin(a1) * fR); ctx.lineTo(Math.cos(a2) * fR, Math.sin(a2) * fR); ctx.stroke();
                }
                for (let tr = 0; tr < 2; tr++) {
                    ctx.beginPath();
                    for (let v = 0; v < 3; v++) {
                        const a = ((v * 2 + tr) / 6) * Math.PI * 2 + rot;
                        if (v === 0) ctx.moveTo(Math.cos(a) * fR * 1.15, Math.sin(a) * fR * 1.15);
                        else ctx.lineTo(Math.cos(a) * fR * 1.15, Math.sin(a) * fR * 1.15);
                    }
                    ctx.closePath(); ctx.strokeStyle = `rgba(220, 240, 255, ${la * 0.9})`; ctx.lineWidth = 0.8 + gi * 0.8; ctx.stroke();
                }
            }

            const cPu = Math.sin(t * 0.002) * 0.2 + 0.8;
            if (fR * 0.54 > 0) {
                const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, fR * 0.54);
                cg.addColorStop(0, `rgba(255,255,255,${(0.5 + gi * 0.4) * cPu})`);
                cg.addColorStop(0.3, `rgba(200,220,255,${(0.2 + gi * 0.2) * cPu})`);
                cg.addColorStop(1, "transparent");
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(0, 0, fR * 0.54, 0, Math.PI * 2); ctx.fill();
            }

            const dc = T.dots;
            for (let d = 0; d < dc; d++) {
                const or2 = fR * (0.4 + (d / dc) * 1.2), spd = 0.0006 + (d % 3) * 0.0002, dir = d % 2 === 0 ? 1 : -1;
                const da = t * spd * dir + (d / dc) * Math.PI * 2;
                const dotA = (0.2 + gi * 0.5) * (Math.sin(t * 0.003 + d * 1.7) * 0.3 + 0.7);
                const ds = 1 + gi * 2;
                const dg = ctx.createRadialGradient(Math.cos(da) * or2, Math.sin(da) * or2, 0, Math.cos(da) * or2, Math.sin(da) * or2, ds * 3);
                dg.addColorStop(0, `rgba(220,240,255,${dotA})`); dg.addColorStop(1, "transparent");
                ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(Math.cos(da) * or2, Math.sin(da) * or2, ds * 3, 0, Math.PI * 2); ctx.fill();
            }

            const axG = ctx.createLinearGradient(0, -fR * 1.6, 0, fR * 1.6);
            axG.addColorStop(0, `rgba(200,160,255,${0.05 + gi * 0.1})`);
            axG.addColorStop(0.5, `rgba(120,255,180,${0.08 + gi * 0.12})`);
            axG.addColorStop(1, `rgba(255,100,100,${0.05 + gi * 0.1})`);
            ctx.strokeStyle = axG; ctx.lineWidth = 0.8 + gi; ctx.beginPath(); ctx.moveTo(0, -fR * 1.6); ctx.lineTo(0, fR * 1.6); ctx.stroke();

            const chakras: [number, number[]][] = [
                [-1.4, [200, 160, 255]], [-0.95, [100, 150, 255]], [-0.5, [100, 220, 255]],
                [0, [120, 255, 180]], [0.5, [255, 255, 100]], [0.95, [255, 180, 80]], [1.4, [255, 100, 100]]
            ];
            chakras.forEach(([yf, [cr, cg2, cb]], i) => {
                const yy = fR * yf, pu = Math.sin(t * 0.003 + i * 0.9) * 0.4 + 0.6, sz = 3 + gi * 4;
                const chG = ctx.createRadialGradient(0, yy, 0, 0, yy, sz * 3);
                chG.addColorStop(0, `rgba(${cr},${cg2},${cb},${(0.6 + gi * 0.3) * pu})`);
                chG.addColorStop(0.5, `rgba(${cr},${cg2},${cb},${0.15 * pu})`);
                chG.addColorStop(1, "transparent");
                ctx.fillStyle = chG; ctx.beginPath(); ctx.arc(0, yy, sz * 3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = `rgba(${Math.min(255, cr + 60)},${Math.min(255, cg2 + 60)},${Math.min(255, cb + 60)},${0.5 * pu})`;
                ctx.beginPath(); ctx.arc(0, yy, sz * 0.6, 0, Math.PI * 2); ctx.fill();
            });

            ctx.restore();
        };

        const drawFlow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, t: number, activeCards: any[], ss: number, color: number[], idx: number) => {
            if (!activeCards.length) return;
            const dx = x2 - x1, dy = y2 - y1, dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx), perpX = -Math.sin(angle), perpY = Math.cos(angle);
            const maxSpread = 8 + ss * 60;
            const steps = T.steps;

            const visible = activeCards.length <= T.maxThreads
                ? activeCards
                : [...activeCards].sort((a, b) => b.hawkins_score - a.hawkins_score).slice(0, T.maxThreads);

            visible.forEach((card) => {
                const ci2 = card.hawkins_score / 1000;
                const tw = 1.1 + ci2 * 3.4; // Balanced (between 0.8 and 1.5)
                const ta = 0.22 + ci2 * 0.28; // Balanced (between 0.12 and 0.35)
                const tAmp = 3 + ci2 * 25;
                const tSpd = 0.001 + ci2 * 0.002;
                const freq = 0.012 + (card.id % 5) * 0.003;
                const [r, g, b] = color;
                const dim = 0.65 + ci2 * 0.35; // Balanced vibrancy
                const pr = Math.floor(r * dim), pg = Math.floor(g * dim), pb = Math.floor(b * dim);
                const pulseA = 0.75 + Math.sin(t * 0.0012 + card.id * 0.5) * 0.25;
                const pos = visible.length === 1 ? 0 : (visible.indexOf(card) / (visible.length - 1) - 0.5) * maxSpread;

                ctx.beginPath();
                for (let s = 0; s <= steps; s++) {
                    const p = s / steps, fe = Math.sin(p * Math.PI);
                    const px = x1 + dx * p, py = y1 + dy * p;
                    const wv = Math.sin(p * dist * freq - t * tSpd + idx + card.id * 0.7) * tAmp * fe;
                    const wv2 = Math.sin(p * dist * freq * 2.1 - t * tSpd * 1.3 + card.id) * tAmp * 0.15 * fe;
                    const wx = px + perpX * (wv + wv2 + pos * fe), wy = py + perpY * (wv + wv2 + pos * fe);
                    if (s === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
                }

                // Subtler Gloom
                ctx.strokeStyle = `rgba(${r},${g},${b},${ta * pulseA * 0.25})`;
                ctx.lineWidth = tw * 5;
                ctx.stroke();

                // Core Thread
                ctx.strokeStyle = `rgba(${pr},${pg},${pb},${ta * pulseA})`;
                ctx.lineWidth = tw;
                ctx.stroke();

                // Soft highlight
                if (ci2 > 0.3) {
                    ctx.strokeStyle = `rgba(255,255,255,${(ci2 - 0.2) * 0.2 * pulseA})`;
                    ctx.lineWidth = tw * 0.3;
                    ctx.stroke();
                }
            });

            if (ss > 0.1) {
                const ca = Math.max(0, ss - 0.1) * 0.55;
                ctx.beginPath();
                for (let s = 0; s <= steps; s++) {
                    const p = s / steps, fe = Math.sin(p * Math.PI);
                    const px = x1 + dx * p, py = y1 + dy * p;
                    const wv = Math.sin(p * dist * 0.014 - t * 0.002 + idx) * 5 * fe;
                    if (s === 0) ctx.moveTo(px + perpX * wv, py + perpY * wv);
                    else ctx.lineTo(px + perpX * wv, py + perpY * wv);
                }
                const [r, g, b] = color;
                ctx.strokeStyle = `rgba(${r},${g},${b},${ca * 0.12})`;
                ctx.lineWidth = 4 + ss * 8;
                ctx.stroke();
                ctx.strokeStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)},${ca})`;
                ctx.lineWidth = 1 + ss * 2.5;
                ctx.stroke();
            }

            if (ss > 0.15) {
                const pc = Math.floor(Math.max(0, ss - 0.15) * 12);
                for (let p = 0; p < pc; p++) {
                    const prog = ((t * 0.0003 + p / pc + idx * 0.1) % 1), fe = Math.sin(prog * Math.PI);
                    const px = x1 + dx * prog, py = y1 + dy * prog;
                    const off = Math.sin(t * 0.003 + p * 2.1) * maxSpread * 0.5 * fe;
                    const fx = px + perpX * off, fy = py + perpY * off;
                    const [r, g, b] = color;
                    const pA = fe * ss * 0.5, pS = 1 + ss * 2;
                    const pgr = ctx.createRadialGradient(fx, fy, 0, fx, fy, pS * 2);
                    pgr.addColorStop(0, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},${pA})`);
                    pgr.addColorStop(1, "transparent");
                    ctx.fillStyle = pgr; ctx.beginPath(); ctx.arc(fx, fy, pS * 2, 0, Math.PI * 2); ctx.fill();
                }
            }
        };

        const drawSphere = (ctx: CanvasRenderingContext2D, x: number, y: number, name: string, icon: string, st: any, color: number[], t: number, idx: number, isSel: boolean, intro: number) => {
            const ss = st.sphere_score, vis = easePow(ss, 1.3);
            const minR = Math.min(w, h) * 0.053, maxR = Math.min(w, h) * 0.105; // Increased by 40%
            const bR = minR + (maxR - minR) * vis;
            const br = Math.sin(t * 0.0015 + idx * 0.8) * (1.5 + vis * 3);
            const cR = bR + br;
            if (cR <= 0) return;
            const [r, g, b] = color;

            const stagger = idx * 0.08;
            const sphereIntro = clamp((intro - stagger) / (1 - stagger + 0.01), 0, 1);
            const sScale = 0.3 + sphereIntro * 0.7;
            const sAlpha = sphereIntro;
            if (sAlpha < 0.01) return;

            ctx.save();
            ctx.globalAlpha = sAlpha;
            ctx.translate(x, y);
            ctx.scale(sScale, sScale);
            ctx.translate(-x, -y);

            const baseGlow = 0.05; // Increased from 0.03
            const gL = Math.max(2, Math.min(T.glowLayers, 2 + Math.floor(vis * 4)));
            for (let l = gL; l >= 0; l--) {
                const sp = cR + l * (8 + vis * 16);
                const al = (baseGlow + vis * 0.08) * (1 - l / (gL + 1));
                if (sp <= 0) continue;
                const gl = ctx.createRadialGradient(x, y, Math.max(0, cR * 0.2), x, y, sp);
                gl.addColorStop(0, `rgba(${r},${g},${b},${al})`);
                gl.addColorStop(0.6, `rgba(${r},${g},${b},${al * 0.4})`);
                gl.addColorStop(1, "transparent");
                ctx.fillStyle = gl;
                ctx.beginPath();
                ctx.arc(x, y, sp, 0, Math.PI * 2);
                ctx.fill();
            }

            const rayCount = ss > 0 ? Math.floor(6 + vis * 10) : 4;
            const rayRot = t * 0.0003 + idx * 0.8;
            const rayMaxLen = cR * (1.6 + vis * 3.5), rayMinLen = cR * (0.9 + vis * 0.6);

            for (let ri = 0; ri < rayCount; ri++) {
                const rAngle = (ri / rayCount) * Math.PI * 2 + rayRot;
                const pulse = Math.sin(t * 0.002 + ri * 1.7 + idx * 0.5) * 0.4 + 0.6;
                const rLen = lerp(rayMinLen, rayMaxLen, pulse);
                const rWidth = (1.0 + vis * 3.5) * pulse, rAlpha = (0.06 + vis * 0.22) * pulse;
                const dormantMul = ss > 0 ? 1 : 0.6;

                const tipX = x + Math.cos(rAngle) * rLen * dormantMul, tipY = y + Math.sin(rAngle) * rLen * dormantMul;
                const perpA = rAngle + Math.PI / 2, baseW = rWidth * dormantMul;
                const bx1 = x + Math.cos(perpA) * baseW, by1 = y + Math.sin(perpA) * baseW;
                const bx2 = x - Math.cos(perpA) * baseW, by2 = y - Math.sin(perpA) * baseW;

                const rg = ctx.createLinearGradient(x, y, tipX, tipY);
                rg.addColorStop(0, `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)},${rAlpha * dormantMul})`);
                rg.addColorStop(0.3, `rgba(${r},${g},${b},${rAlpha * 0.6 * dormantMul})`);
                rg.addColorStop(1, `rgba(${r},${g},${b},0)`);

                ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(tipX, tipY); ctx.lineTo(bx2, by2); ctx.closePath(); ctx.fill();
            }

            const rings = T.sphereRings;
            for (let rn = 1; rn <= rings; rn++) {
                const rr = cR * (0.5 + rn * 0.23), ringPulse = Math.sin(t * 0.0018 + idx * 1.2 + rn * 0.8) * 0.15 + 0.85;
                if (rr > 0) {
                    ctx.strokeStyle = `rgba(${r},${g},${b},${(0.06 + vis * 0.12) * ringPulse})`; ctx.lineWidth = 0.5 + vis * 0.5;
                    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
                }
            }

            const sG = ctx.createRadialGradient(x - cR * 0.2, y - cR * 0.2, 0, x, y, cR);
            const bodyBase = ss > 0 ? 0.25 : 0.15; // Increased prominence
            sG.addColorStop(0, `rgba(${Math.min(255, r + 110)},${Math.min(255, g + 110)},${Math.min(255, b + 110)},${bodyBase + vis * 0.3})`);
            sG.addColorStop(0.4, `rgba(${r},${g},${b},${bodyBase * 0.7 + vis * 0.2})`);
            sG.addColorStop(0.85, `rgba(${Math.floor(r * 0.5)},${Math.floor(g * 0.5)},${Math.floor(b * 0.5)},${0.08 + vis * 0.15})`);
            sG.addColorStop(1, `rgba(${Math.floor(r * 0.3)},${Math.floor(g * 0.3)},${Math.floor(b * 0.3)},0.04)`);
            ctx.fillStyle = sG; ctx.beginPath(); ctx.arc(x, y, cR, 0, Math.PI * 2); ctx.fill();

            ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + vis * 0.5})`; ctx.lineWidth = 1.0 + vis * 2;
            ctx.beginPath(); ctx.arc(x, y, cR, 0, Math.PI * 2); ctx.stroke();

            const sc = Math.max(2, Math.floor(T.sphereSparkles * Math.max(0.2, vis)));
            for (let s = 0; s < sc; s++) {
                const sa = (s / sc) * Math.PI * 2 + t * 0.0015, sr = cR * (0.5 + Math.sin(t * 0.003 + s * 1.3 + idx) * 0.4);
                const sparkA = (0.2 + Math.sin(t * 0.004 + s) * 0.25) * Math.max(0.3, vis);
                ctx.fillStyle = `rgba(${Math.min(255, r + 120)},${Math.min(255, g + 120)},${Math.min(255, b + 120)},${sparkA})`;
                ctx.beginPath(); ctx.arc(x + Math.cos(sa) * sr, y + Math.sin(sa) * sr, 0.7 + vis * 2, 0, Math.PI * 2); ctx.fill();
            }

            if (vis > 0.35) {
                const pR = cR * (0.35 + Math.sin(t * 0.003 + idx) * 0.12);
                if (pR > 0) {
                    const pg = ctx.createRadialGradient(x, y, 0, x, y, pR);
                    pg.addColorStop(0, `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)},${(vis - 0.3) * 0.5})`);
                    pg.addColorStop(1, "transparent");
                    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, pR, 0, Math.PI * 2); ctx.fill();
                }
            }

            const coreP = Math.sin(t * 0.003 + idx * 1.1) * 0.2 + 0.8;
            const coreR = (2.5 + vis * 5) * coreP;
            if (coreR > 0) {
                const coreG = ctx.createRadialGradient(x, y, 0, x, y, coreR);
                coreG.addColorStop(0, `rgba(255,255,255,${(0.4 + vis * 0.5) * coreP})`);
                coreG.addColorStop(0.4, `rgba(${Math.min(255, r + 100)},${Math.min(255, g + 100)},${Math.min(255, b + 100)},${(0.2 + vis * 0.35) * coreP})`);
                coreG.addColorStop(1, "transparent");
                ctx.fillStyle = coreG; ctx.beginPath(); ctx.arc(x, y, coreR, 0, Math.PI * 2); ctx.fill();
            }

            ctx.fillStyle = `rgb(${r},${g},${b})`; // 100% visible
            ctx.font = `500 ${10 + vis * 2}px "Segoe UI",system-ui,sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(name, x, y + cR + 15);

            ctx.fillStyle = `rgba(${r},${g},${b}, 0.8)`; // High visibility for rank
            ctx.font = `600 ${8 + vis * 1}px "Segoe UI",system-ui,sans-serif`;
            ctx.fillText(`${st.active_count}/22 · LVL ${hawkinsToRank(st.sphere_hawkins)}`, x, y + cR + 27);

            if (isSel) {
                ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
                ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
                ctx.beginPath(); ctx.arc(x, y, cR + 12, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
        };

        const draw = (ts: number) => {
            fpsRef.current.count++;
            if (ts - fpsRef.current.last >= 3000) {
                const fps = fpsRef.current.count / ((ts - fpsRef.current.last) / 1000);
                fpsRef.current.current = fps;
                if (fps < 28 && tierRef.current !== "low") { tierRef.current = "low"; T = TIERS.low; }
                else if (fps < 40 && tierRef.current === "high") { tierRef.current = "medium"; T = TIERS.medium; }
                fpsRef.current.count = 0; fpsRef.current.last = ts;
            }

            const elapsed = ts - startTimeRef.current;
            introRef.current = clamp(elapsed / 2500, 0, 1);
            const intro = 1 - Math.pow(1 - introRef.current, 3);

            for (let i = 0; i < 12; i++) smoothRef.current[i] = lerp(smoothRef.current[i], states[i].sphere_score, 0.05);

            drawBg(ts);
            drawParts(ts, intro);

            const pos = getPositions();
            const cx = w / 2, cy = h * 0.44; // Adjusted height pos

            ctx.globalAlpha = intro;
            pos.forEach((sp, i) => drawFlow(ctx, cx, cy, sp.x, sp.y, ts, states[i].active_cards, smoothRef.current[i], sp.color, i * 1.5));
            ctx.globalAlpha = 1;

            drawCenter(ts, cx, cy, states, intro);

            pos.forEach((sp, i) => drawSphere(ctx, sp.x, sp.y, sp.name, sp.icon, states[i], sp.color, ts, i, selected === i, intro));

            animRef.current = requestAnimationFrame(draw);
        };

        fpsRef.current.last = performance.now();
        animRef.current = requestAnimationFrame(draw);

        const handleClick = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const pos = getPositions();
            let cl: number | null = null;
            pos.forEach((sp, i) => {
                const vis = easePow(states[i].sphere_score, 1.3);
                const hitR = Math.min(w, h) * 0.028 + (Math.min(w, h) * 0.075 - Math.min(w, h) * 0.028) * vis + 18;
                if (Math.sqrt((mx - sp.x) ** 2 + (my - sp.y) ** 2) < hitR) cl = i;
            });
            setSelected(cl);
        };

        canvas.addEventListener("click", handleClick);
        return () => {
            window.removeEventListener("resize", resize);
            canvas.removeEventListener("click", handleClick);
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, [states, selected, initParticles]);

    return (
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
            
            {selected !== null && states[selected] && (
                <SphereInfoPanel
                    visible={true}
                    sphere={SPHERES[selected] as any}
                    state={states[selected] as any}
                    cards={states[selected].cards as any}
                    onCardTap={(card) => {
                        if (card.id) router.push(`/card/${card.id}`);
                    }}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
