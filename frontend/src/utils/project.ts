export type ProjectRole = "owner" | "editor" | "viewer";

export interface ProjectOwner {
  id: string;
  name: string;
  email: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  my_role: ProjectRole;
  owners: ProjectOwner[];
  member_count: number;
  report_count: number;
  workflow_count: number;
  last_activity_at: string | null;
}

export function timeAgo(iso: string | null, lang: "en" | "zh"): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const zh = lang === "zh";
  if (min < 1) return zh ? "刚刚" : "just now";
  if (min < 60) return zh ? `${min} 分钟前` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return zh ? `${hr} 小时前` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return zh ? `${day} 天前` : `${day}d ago`;
  return new Date(iso).toLocaleDateString(zh ? "zh-CN" : "en-US");
}
