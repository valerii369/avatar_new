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
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "8px 4px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 500,
        transition: "all 0.2s",
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      {label}
    </button>
  );
}
