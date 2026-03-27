"use client";
import { useEffect, useRef } from "react";

const SPHERES_COLORS = [
    [245, 158, 11], [16, 185, 129], [6, 182, 212], [249, 115, 22],
    [236, 72, 153], [20, 184, 166], [59, 130, 246], [99, 102, 241],
    [139, 92, 246], [239, 68, 68], [217, 70, 239], [100, 116, 139]
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easePow = (t: number, p: number) => Math.pow(t, p);

interface LogoProps {
    size?: number;
    progress?: number; // 0 to 1, affects complexity of geometry
}

export default function SacredGeometryLogo({ size = 120, progress = 0.8 }: LogoProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (typeof window === "undefined") return;
        const dpr = window.devicePixelRatio || 2;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        let animId: number;
        const w = size, h = size;

        const render = (t: number) => {
            try {
                ctx.clearRect(0, 0, w, h);

                const cx = w / 2, cy = h / 2;
                const gi = easePow(progress, 1.3);
                const bR = Math.min(w, h) * 0.25;
                const br = Math.sin(t * 0.0008) * 2;

                // Aura
                for (let l = 3; l >= 0; l--) {
                    const sp = bR * 1.2 + l * (4 + gi * 10) + br;
                    const al = (0.04 + gi * 0.05) * (1 - l / 4);
                    if (sp <= 0) continue;
                    const ag = ctx.createRadialGradient(cx, cy, Math.max(0, bR * 0.3), cx, cy, sp);
                    ag.addColorStop(0, `rgba(180, 200, 255, ${al})`);
                    ag.addColorStop(0.4, `rgba(140, 160, 230, ${al * 0.5})`);
                    ag.addColorStop(1, "transparent");
                    ctx.fillStyle = ag;
                    ctx.beginPath(); ctx.arc(cx, cy, sp, 0, Math.PI * 2); ctx.fill();
                }

                const fR = bR * 0.55, rot = t * 0.0002;
                ctx.save();
                ctx.translate(cx, cy);

                // Rings
                for (let rn = 3; rn >= 1; rn--) {
                    const rr = Math.max(0, fR * rn * 0.65);
                    ctx.strokeStyle = `rgba(180, 210, 255, ${((0.06 + gi * 0.08) * (1 - rn * 0.2)) * (Math.sin(t * 0.001 + rn) * 0.15 + 0.85)})`;
                    ctx.lineWidth = 0.5 + gi * 0.5;
                    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
                }

                // Center circle
                const cp = Math.sin(t * 0.0015) * 0.1 + 0.9;
                ctx.strokeStyle = `rgba(200, 225, 255, ${(0.12 + gi * 0.15) * cp})`;
                ctx.lineWidth = 0.6 + gi * 0.8;
                ctx.beginPath(); ctx.arc(0, 0, Math.max(0, fR * cp), 0, Math.PI * 2); ctx.stroke();

                // 6 petals
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + rot, pp = Math.sin(t * 0.0012 + i * 1.05) * 0.1 + 0.9;
                    const [sr, sg, sb] = SPHERES_COLORS[i % 8];
                    const inf = progress;
                    ctx.strokeStyle = `rgba(${Math.floor(lerp(180, sr, inf * 0.5))}, ${Math.floor(lerp(210, sg, inf * 0.5))}, ${Math.floor(lerp(255, sb, inf * 0.5))}, ${(0.15 + gi * 0.2) * pp})`;
                    ctx.lineWidth = 0.5 + gi * 0.7;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * fR, Math.sin(a) * fR, Math.max(0, fR * pp), 0, Math.PI * 2); ctx.stroke();
                }

                // Sacred Geometry
                if (gi > 0.15) {
                    const oa = Math.min(0.2, (gi - 0.15) * 0.3);
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2 + rot + Math.PI / 6, pp = Math.sin(t * 0.001 + i * 0.9 + 2) * 0.1 + 0.9;
                        const rr = Math.max(0, fR * pp);
                        ctx.strokeStyle = `rgba(160, 190, 240, ${oa * pp})`;
                        ctx.lineWidth = 0.4 + gi * 0.4;
                        ctx.beginPath(); ctx.arc(Math.cos(a) * fR * 1.73, Math.sin(a) * fR * 1.73, rr, 0, Math.PI * 2); ctx.stroke();
                    }
                }

                if (gi > 0.08) {
                    const la = Math.min(0.18, (gi - 0.08) * 0.25);
                    ctx.strokeStyle = `rgba(200, 220, 255, ${la})`; ctx.lineWidth = 0.4;
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
                        ctx.closePath(); ctx.strokeStyle = `rgba(200, 220, 255, ${la * 0.8})`; ctx.lineWidth = 0.5 + gi * 0.5; ctx.stroke();
                    }
                }

                // Core
                const cPu = Math.sin(t * 0.002) * 0.2 + 0.8;
                const coreR = fR * 0.54;
                if (coreR > 0) {
                    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
                    cg.addColorStop(0, `rgba(255, 255, 255, ${(0.6 + gi * 0.4) * cPu})`);
                    cg.addColorStop(0.3, `rgba(200, 220, 255, ${(0.3 + gi * 0.2) * cPu})`);
                    cg.addColorStop(1, "transparent");
                    ctx.fillStyle = cg;
                    ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
                }

                // Chakra axis
                const axG = ctx.createLinearGradient(0, -fR * 1.6, 0, fR * 1.6);
                axG.addColorStop(0, `rgba(200, 160, 255, ${0.1 + gi * 0.2})`);
                axG.addColorStop(0.5, `rgba(120, 255, 180, ${0.15 + gi * 0.25})`);
                axG.addColorStop(1, `rgba(255, 100, 100, ${0.1 + gi * 0.2})`);
                ctx.strokeStyle = axG; ctx.lineWidth = 1 + gi; ctx.beginPath(); ctx.moveTo(0, -fR * 1.6); ctx.lineTo(0, fR * 1.6); ctx.stroke();

                const centers: [number, number[]][] = [
                    [-1.4, [200, 160, 255]], [-0.95, [100, 150, 255]], [-0.5, [100, 220, 255]],
                    [0, [120, 255, 180]], [0.5, [255, 255, 100]], [0.95, [255, 180, 80]], [1.4, [255, 100, 100]]
                ];
                centers.forEach(([yf, [cr, cg2, cb]], i) => {
                    const yy = fR * yf, pu = Math.sin(t * 0.003 + i * 0.9) * 0.4 + 0.6, sz = 2.5 + gi * 3;
                    const chG = ctx.createRadialGradient(0, yy, 0, 0, yy, sz * 3);
                    chG.addColorStop(0, `rgba(${cr}, ${cg2}, ${cb}, ${(0.8 + gi * 0.3) * pu})`);
                    chG.addColorStop(0.5, `rgba(${cr}, ${cg2}, ${cb}, ${0.2 * pu})`);
                    chG.addColorStop(1, "transparent");
                    ctx.fillStyle = chG; ctx.beginPath(); ctx.arc(0, yy, sz * 3, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = `rgba(${Math.min(255, cr + 60)}, ${Math.min(255, cg2 + 60)}, ${Math.min(255, cb + 60)}, ${0.7 * pu})`;
                    ctx.beginPath(); ctx.arc(0, yy, sz * 0.6, 0, Math.PI * 2); ctx.fill();
                });

                ctx.restore();
            } catch (err) {
                console.error("SacredGeometryLogo render error:", err);
            }
            animId = requestAnimationFrame(render);
        };

        animId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animId);
    }, [size, progress]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: size, height: size, display: "block", margin: "0 auto" }}
        />
    );
}
