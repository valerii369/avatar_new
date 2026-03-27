import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
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
