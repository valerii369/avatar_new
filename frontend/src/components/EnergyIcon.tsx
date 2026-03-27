"use client";

export function EnergyIcon({ size = 20, color = "#F59E0B" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M11 2L4 11h5l-1 7 7-9h-5l1-7z" fill={color} />
    </svg>
  );
}
