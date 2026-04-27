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
  login: (initData: string, isDev: boolean = false, testUserId?: number, ref?: string) =>
    api.post("/api/auth/login", { init_data: initData, is_dev: isDev, test_user_id: testUserId, ref }),
};

export const profileAPI = {
  get: (userId: string) => api.get(`/api/auth/profile?user_id=${userId}`),
  reset: (userId: string | number) => api.post(`/api/auth/reset`, { user_id: userId }),
  resetOnboardingData: (params: { userId?: string; tgId?: number; clearGeocode?: boolean }) =>
    api.post(`/api/auth/reset`, {
      user_id: params.userId,
      tg_id: params.tgId,
      clear_geocode: params.clearGeocode ?? false,
    }),
  getReferralLink: (userId: string) => api.get(`/api/auth/referral-link?user_id=${userId}`),
  getReferrals: (userId: string) => api.get(`/api/auth/referrals?user_id=${userId}`),
  redeemPromo: (userId: string, code: string) =>
    api.post("/api/auth/redeem-promo", { user_id: userId, code }),
  updateLocation: (userId: string, location: string) =>
    api.post(`/api/auth/location`, { user_id: userId, current_location: location }),
};

export const calcAPI = {
  geocode: (place: string) => api.post("/api/auth/geocode", { place }),
  calculate: (data: any) => api.post("/api/auth/calculate", data),
  generateSphere: (userId: string, sphereId: number) =>
    api.post("/api/auth/generate-sphere", { user_id: userId, sphere_id: sphereId }, { timeout: 120000 }),
};

export const masterHubAPI = {
  get: (userId: string) => api.get(`/api/portraits/${userId}`),
};

export const recommendationsAPI = {
  list:     (userId: string, period: string) =>
    api.get(`/api/recommendations/${userId}/${period}`),
  generate: (userId: string, period: string) =>
    api.post(`/api/recommendations/${userId}/${period}`, {}, { timeout: 60000 }),
  invalidate: (userId: string, period: string) =>
    api.delete(`/api/recommendations/${userId}/${period}`),
};

export const assistantAPI = {
  init: (userId: string) => api.get(`/api/assistant-v2/init/${userId}`),
  chat: (userId: string, sessionId: number, message: string) =>
    api.post("/api/assistant-v2/chat", { user_id: userId, session_id: sessionId, message }),
  finish: (userId: string, sessionId: number) =>
    api.post("/api/assistant-v2/finish", { user_id: userId, session_id: sessionId }),
  saveToDiary: (userId: string, sessionId: number) =>
    api.post("/api/assistant-v2/diary/save", { user_id: userId, session_id: sessionId }),
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
    console.log(`[voiceAPI.transcribe] 📤 Sending blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

    if (!audioBlob || audioBlob.size === 0) {
      console.error("[voiceAPI.transcribe] ❌ Empty blob!");
      throw new Error("Audio blob is empty");
    }

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("user_id", userId.toString());
    formData.append("context", context);

    // For FormData, let axios handle Content-Type automatically
    return api.post("/api/assistant-v2/transcribe", formData, {
      timeout: 60000
    }).then(res => {
      console.log("[voiceAPI.transcribe] ✅ Success response:", res.data);
      return res;
    }).catch(err => {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("[voiceAPI.transcribe] ❌ Error:", errorMsg, "Status:", err.response?.status);
      throw err;
    });
  },
};

export default api;
