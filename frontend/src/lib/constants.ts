import type React from "react";
import {
  Users, Briefcase, Heart, Home, GraduationCap,
  Smile, Shield, Globe, Star, Zap,
  Compass, Eye, User
} from "lucide-react";

export type SphereMeta = {
  id: number;
  name: string;
  subtitle: string;
  color: string;
  icon: React.ComponentType<any>;
};

export const SPHERES = [
  { id: 1, name: "Личность", subtitle: "Ядро и маска", color: "#8B5CF6", icon: User },
  { id: 2, name: "Ресурсы", subtitle: "Ценности и финансы", color: "#10B981", icon: Zap },
  { id: 3, name: "Связи", subtitle: "Интеллект и окружение", color: "#3B82F6", icon: Globe },
  { id: 4, name: "Корни", subtitle: "Дом и предки", color: "#F59E0B", icon: Home },
  { id: 5, name: "Творчество", subtitle: "Радость и дети", color: "#EF4444", icon: Heart },
  { id: 6, name: "Служение", subtitle: "Здоровье и труд", color: "#06B6D4", icon: Shield },
  { id: 7, name: "Партнерство", subtitle: "Отражения и союзы", color: "#EC4899", icon: Users },
  { id: 8, name: "Психология", subtitle: "Кризисы и тайны", color: "#6366F1", icon: Eye },
  { id: 9, name: "Мировоззрение", subtitle: "Поиск и расширение", color: "#F97316", icon: GraduationCap },
  { id: 10, name: "Реализация", subtitle: "Цели и статус", color: "#14B8A6", icon: Briefcase },
  { id: 11, name: "Сообщества", subtitle: "Друзья и будущее", color: "#F43F5E", icon: Smile },
  { id: 12, name: "Запредельное", subtitle: "Уединение и дух", color: "#A855F7", icon: Compass },
];

export const SPHERE_BY_ID: Record<number, any> = SPHERES.reduce((acc, s) => {
  acc[s.id] = s;
  return acc;
}, {} as any);

export const INFLUENCE_SORT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const INFLUENCE_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  high:   { bg: "rgba(139,92,246,0.15)", color: "#8B5CF6",               label: "СИЛЬНОЕ" },
  medium: { bg: "rgba(59,130,246,0.12)",  color: "#3B82F6",               label: "СРЕДНЕЕ" },
  low:    { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", label: "ФОНОВОЕ" },
};

export const SYSTEM_SHORT: Record<string, string> = {
  western_astrology: "АСТРО",
  numerology:        "ЧИСЛА",
  human_design:      "HD",
  tarot:             "ТАРО",
  dsb:               "DSB",
};
