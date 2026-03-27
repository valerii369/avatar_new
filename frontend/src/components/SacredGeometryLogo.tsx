"use client";

import { motion } from "framer-motion";

interface Props {
  size?: number;
  progress?: number;
}

export default function SacredGeometryLogo({ size = 200, progress = 0.9 }: Props) {
  const r = size / 2;
  const cr = r * 0.35;

  return (
    <div style={{
      width: size, height: size,
      margin: "0 auto",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer ring */}
        <circle cx={r} cy={r} r={r * 0.9} fill="none"
          stroke="rgba(139,92,246,0.1)" strokeWidth={1} />

        {/* Inner hexagon */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle1 = (i * 60 - 90) * (Math.PI / 180);
          const angle2 = ((i + 1) * 60 - 90) * (Math.PI / 180);
          const x1 = r + cr * Math.cos(angle1);
          const y1 = r + cr * Math.sin(angle1);
          const x2 = r + cr * Math.cos(angle2);
          const y2 = r + cr * Math.sin(angle2);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(139,92,246,0.15)" strokeWidth={1} />
          );
        })}

        {/* Progress arc */}
        {progress > 0 && (
          <circle
            cx={r} cy={r} r={r * 0.9}
            fill="none"
            stroke="rgba(139,92,246,0.4)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * r * 0.9 * progress} ${2 * Math.PI * r * 0.9}`}
            transform={`rotate(-90 ${r} ${r})`}
          />
        )}

        {/* 6 vertex dots */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i * 60 - 90) * (Math.PI / 180);
          const x = r + r * 0.9 * Math.cos(angle);
          const y = r + r * 0.9 * Math.sin(angle);
          return (
            <circle key={i} cx={x} cy={y} r={2}
              fill={`hsl(${260 + i * 15}, 60%, 65%)`} />
          );
        })}
      </svg>

      {/* Center glow */}
      <div style={{
        position: "absolute",
        width: size * 0.3,
        height: size * 0.3,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
      }} />
    </div>
  );
}
