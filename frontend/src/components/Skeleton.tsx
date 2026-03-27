"use client";

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: 12,
        animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div style={{
      padding: 16,
      borderRadius: 20,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <Skeleton style={{ height: 12, width: "40%", marginBottom: 8 }} />
      <Skeleton style={{ height: 18, width: "80%", marginBottom: 12 }} />
      <Skeleton style={{ height: 10, width: "100%", marginBottom: 6 }} />
      <Skeleton style={{ height: 10, width: "90%" }} />
    </div>
  );
}
