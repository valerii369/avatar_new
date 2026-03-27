"use client";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

export default function TabButton({ active, onClick, label, disabled }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 4px",
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        transition: "all 0.2s",
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: disabled
          ? "rgba(255,255,255,0.15)"
          : active
            ? "var(--text-primary)"
            : "var(--text-muted)",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        flex: 1,
        letterSpacing: "0.01em",
      }}
    >
      {label}
    </button>
  );
}
