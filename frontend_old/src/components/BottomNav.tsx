"use client";

import { useRouter } from "next/navigation";

export interface BottomNavProps {
  active: string;
}

export default function BottomNav({ active }: BottomNavProps) {
  const router = useRouter();
  const navItems = [
    { key: "home", icon: "/icons/home.svg", label: "AVATAR", path: "/" },
    { key: "cards", icon: "/icons/cards.svg", label: "Карточки", path: "/cards" },
    { key: "assistant", icon: "/icons/assistant.svg", label: "Помощник", path: "/assistant" },
    { key: "diary", icon: "/icons/diary.svg", label: "Дневник", path: "/diary" },
    { key: "profile", icon: "/icons/profile.svg", label: "Профиль", path: "/profile" },
  ];

  return (
    <nav style={{
      position: "fixed",
      bottom: 16,
      left: 16,
      right: 16,
      background: "rgba(13,18,38,0.92)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 28,
      display: "flex",
      justifyContent: "space-around",
      alignItems: "center",
      padding: "10px 4px",
      zIndex: 100,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset",
    }}>
      {navItems.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => router.push(item.path)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              borderRadius: 18,
              border: "none",
              cursor: "pointer",
              background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
              transition: "all 0.2s",
              minWidth: 52,
            }}
          >
            <img
              src={item.icon}
              alt={item.label}
              style={{
                width: 24,
                height: 24,
                opacity: isActive ? 1 : 0.5,
                filter: isActive ? "none" : "grayscale(100%) brightness(0.8)",
                transition: "all 0.2s"
              }}
            />
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              color: isActive ? "var(--text-primary)" : "var(--text-muted)",
              letterSpacing: "0.01em",
              transition: "color 0.2s",
            }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
