import axios from "axios";

/** 取后端 FastAPI 返回的 detail 作为错误文案，取不到就用兜底文案。 */
export function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}
