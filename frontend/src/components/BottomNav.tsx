"use client";

import { useRouter, usePathname } from "next/navigation";
import { Home, Globe, MessageCircle, BookOpen, UserCircle } from "lucide-react";

const navItems = [
  { key: "home",      icon: Home,          label: "Главная",    path: "/" },
  { key: "world",     icon: Globe,         label: "Твой мир",   path: "/your-world" },
  { key: "assistant", icon: MessageCircle,  label: "Ассистент",  path: "/assistant" },
  { key: "diary",     icon: BookOpen,      label: "Дневник",    path: "/diary" },
  { key: "profile",   icon: UserCircle,    label: "Профиль",    path: "/profile" },
];

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const getActiveKey = () => {
    if (pathname === "/") return "home";
    for (const item of navItems) {
      if (item.path !== "/" && pathname.startsWith(item.path)) return item.key;
    }
    return "home";
  };

  const active = getActiveKey();

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
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            id={`nav-${item.key}`}
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
            <Icon
              size={22}
              strokeWidth={isActive ? 2.2 : 1.5}
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                transition: "all 0.2s",
              }}
            />
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 600 : 500,
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
