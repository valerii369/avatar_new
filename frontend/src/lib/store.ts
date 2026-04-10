import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NatalPosition {
  key: string;
  label: string;
  position_str: string;
}

export interface Insight {
  id?: string;
  system: string;
  primary_sphere: number;
  rank: number;
  influence_level: "high" | "medium" | "low";
  weight: number;
  position: string;
  core_theme: string;
  description: string;
  light_aspect: string;
  shadow_aspect: string;
  insight: string;
  gift: string;
  developmental_task: string;
  integration_key: string;
  triggers: string[];
  source?: string | null;
}

interface UserState {
  userId: string | null;
  tgId: number | null;
  firstName: string;
  photoUrl: string;
  token: string | null;
  onboardingDone: boolean;
  
  energy: number;
  streak: number;
  evolutionLevel: number;
  title: string;
  xp: number;
  xpCurrent: number;
  xpNext: number;
  referralCode: string;

  // Cached hub data — persisted so the app shows content instantly on re-entry
  hubData: any | null;
  setHubData: (data: any) => void;

  // Assistant History
  assistantMessages: { role: string; content: string }[];
  setAssistantMessages: (messages: { role: string; content: string }[]) => void;

  // Actions
  setUser: (data: Partial<UserState>) => void;
  reset: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null, tgId: null, firstName: "", photoUrl: "", token: null, onboardingDone: false,
      energy: 0, streak: 0, evolutionLevel: 1, title: "Новичок", xp: 0, xpCurrent: 0, xpNext: 1000, referralCode: "",

      hubData: null,
      setHubData: (data) => set({ hubData: data }),

      assistantMessages: [],
      setAssistantMessages: (messages) => set({ assistantMessages: messages }),

      setUser: (data) => set((state) => ({ ...state, ...data })),
      reset: () => set({ userId: null, tgId: null, firstName: "", token: null, onboardingDone: false }),
    }),
    { name: "avatar-user-storage" }
  )
);

interface InsightsState {
  insights: Insight[];
  activeSphere: number | null;
  setInsights: (insights: Insight[]) => void;
  setActiveSphere: (sphereId: number | null) => void;
}

export const useInsightsStore = create<InsightsState>((set) => ({
  insights: [],
  activeSphere: null,
  setInsights: (insights) => set({ insights }),
  setActiveSphere: (sphereId) => set({ activeSphere: sphereId }),
}));
