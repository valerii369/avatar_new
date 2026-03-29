import axios from "axios";

// In production, Next.js rewrites proxy /api/* → backend (see next.config.ts).
// No baseURL needed — all requests go to the same origin, avoiding mixed content.
// In development, rewrites also handle it via NEXT_PUBLIC_API_URL.
export const api = axios.create({
  timeout: 15000,
});

// Auto-inject token if exists
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("avatar_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const authAPI = {
  login: (initData: string, isDev: boolean = false, testUserId?: number) =>
    api.post("/api/auth/login", { init_data: initData, is_dev: isDev, test_user_id: testUserId }),
};

export const profileAPI = {
  get: (userId: string) => api.get(`/api/auth/profile?user_id=${userId}`),
  reset: (userId: string | number) => api.post(`/api/auth/reset`, { user_id: userId }),
  getReferrals: (userId: string) => api.get(`/api/auth/referrals?user_id=${userId}`),
};

export const calcAPI = {
  geocode: (place: string) => api.post("/api/auth/geocode", { place }),
  calculate: (data: any) => api.post("/api/auth/calculate", data),
};

export const masterHubAPI = {
  get: (userId: string) => api.get(`/api/portraits/${userId}`),
};

export const assistantAPI = {
  init: (userId: string) => api.get(`/api/assistant/init/${userId}`),
  chat: (userId: string, sessionId: number, message: string) =>
    api.post("/api/assistant/chat", { user_id: userId, session_id: sessionId, message }),
  finish: (userId: string, sessionId: number) =>
    api.post("/api/assistant/finish", { user_id: userId, session_id: sessionId }),
  saveToDiary: (userId: string, sessionId: number) =>
    api.post("/api/assistant/diary/save", { user_id: userId, session_id: sessionId }),
};

export const diaryAPI = {
  list: (userId: string) => api.get(`/api/diary?user_id=${userId}`),
  getAll: (userId: string, filter?: string, _cursor?: any, type?: string) =>
    api.get(`/api/diary?user_id=${userId}${filter ? `&filter=${filter}` : ""}${type ? `&type=${type}` : ""}`),
  get: (userId: string, entryId: string) => api.get(`/api/diary/${entryId}?user_id=${userId}`),
  delete: (userId: string, entryId: string) => api.delete(`/api/diary/${entryId}?user_id=${userId}`),
  updateIntegration: (userId: string, entryId: string | number, done: boolean) =>
    api.patch(`/api/diary/${entryId}/integration`, { user_id: userId, done }),
};

export const gameAPI = {
  getState: (userId: string) => api.get(`/api/game/state?user_id=${userId}`),
};

export const paymentsAPI = {
  getOffers: () => api.get("/api/payments/offers"),
  createInvoice: (userId: string, offerId: string) =>
    api.post("/api/payments/invoice", { user_id: userId, offer_id: offerId }),
};

export const voiceAPI = {
  transcribe: (userId: string | number, audioBlob: Blob, context: string) => {
    const formData = new FormData();
    formData.append("file", audioBlob);
    formData.append("user_id", userId.toString());
    formData.append("context", context);
    return api.post("/api/assistant/transcribe", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export default api;
