import axios from "axios";
import { guestAdapter } from "../guest/adapter";
import { isGuestMode } from "../guest/mode";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
});

apiClient.interceptors.request.use((config) => {
  // 访客预览：请求不发到后端，由本地示例数据回答
  if (isGuestMode()) {
    config.adapter = guestAdapter;
    return config;
  }
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
