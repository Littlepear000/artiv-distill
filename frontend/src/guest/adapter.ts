/**
 * 访客预览的 axios adapter：读接口从 fixtures 里取，写接口和下载一律返回 403 并广播提示。
 * 请求不出浏览器，后端完全不知道访客的存在。
 */
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import * as fx from "./fixtures";
import { GUEST_BLOCKED_EVENT } from "./mode";

function blockedMessage(): string {
  let zh = false;
  try {
    zh = localStorage.getItem("lang") === "zh";
  } catch {
    /* ignore */
  }
  return zh ? "访客预览是只读的，注册租户后才能修改、上传或下载" : "Guest preview is read-only. Create a tenant to edit, upload or download.";
}

function ok(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { data, status: 200, statusText: "OK", headers: {}, config, request: {} };
}

function fail(config: InternalAxiosRequestConfig, status: number, detail: string): never {
  const response = { data: { detail }, status, statusText: String(status), headers: {}, config, request: {} } as AxiosResponse;
  throw new AxiosError(detail, AxiosError.ERR_BAD_REQUEST, config, {}, response);
}

const NOT_FOUND = Symbol("not-found");

function route(path: string, params: Record<string, unknown>): unknown {
  const seg = path.split("/").filter(Boolean);
  const [a, pid, b, c, d, e, f] = seg;

  if (a === "auth" && pid === "me") return fx.guestUser;
  if (a === "users" && seg.length === 1) return fx.users;
  if (a !== "projects") return NOT_FOUND;
  if (seg.length === 1) return fx.projects;

  const project = fx.projects.find((p) => p.id === pid);
  if (!project) return NOT_FOUND;
  if (seg.length === 2) return project;

  if (b === "members" && seg.length === 3) return fx.members[pid] ?? [];
  if (b === "report-fields" && seg.length === 3) return fx.fields[pid] ?? [];

  if (b === "reports") {
    const all = fx.reports[pid] ?? [];
    if (seg.length === 3) {
      const q = String(params.search ?? "").trim().toLowerCase();
      const items = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all;
      const page = Number(params.page ?? 1);
      const size = Number(params.page_size ?? 50);
      return { items: items.slice((page - 1) * size, page * size), total: items.length };
    }
    const report = all.find((r) => r.id === c);
    if (!report) return NOT_FOUND;
    if (seg.length === 4) return report;
    if (d === "values" && seg.length === 5) return fx.reportValues[report.id] ?? [];
    if (d === "fields" && f === "values") return (fx.reportValues[report.id] ?? []).filter((v) => v.field_id === e);
    return NOT_FOUND;
  }

  if (b === "results" && c === "versions") {
    const list = fx.versions[pid] ?? [];
    if (seg.length === 4) return list.map(({ columns: _c, rows: _r, parents: _p, ...v }) => v);
    return list.find((v) => v.id === d) ?? NOT_FOUND;
  }

  if (b === "assets") {
    const list = fx.assets[pid] ?? [];
    if (seg.length === 3) return list;
    const asset = list.find((x) => x.id === c);
    if (!asset) return NOT_FOUND;
    if (seg.length === 4) return asset;
    if (d === "versions") return fx.assetVersions[asset.id] ?? [];
    return NOT_FOUND;
  }

  if (b === "workflows") {
    const list = (fx.workflows[pid] ?? []) as { id: string }[];
    if (seg.length === 3) return list;
    const wf = list.find((w) => w.id === c);
    if (!wf) return NOT_FOUND;
    if (seg.length === 4) return wf;
    if (d === "nodes") {
      if (seg.length === 5) return fx.nodes[wf.id] ?? [];
      if (seg[6] === "versions") return fx.nodeVersions[e] ?? [];
      return NOT_FOUND;
    }
    if (d === "runs") {
      const ids = fx.runsByWorkflow[wf.id] ?? [];
      if (seg.length === 5) {
        return ids.map((rid) => {
          const { error_message: _e, input_files: _i, node_runs: _n, ...summary } = fx.runs[rid];
          return summary;
        });
      }
      return fx.runs[e] ?? NOT_FOUND;
    }
  }
  return NOT_FOUND;
}

/** 这些 GET 会真正拉文件（下载、预签名链接、模板），访客一律拦下。 */
const BLOCKED_GET = [/\/download$/, /\/file-url$/, /\/import-template$/];

export async function guestAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  await new Promise((r) => setTimeout(r, 120));
  const method = (config.method ?? "get").toLowerCase();
  const path = (config.url ?? "").split("?")[0];

  if (method !== "get" || BLOCKED_GET.some((re) => re.test(path))) {
    window.dispatchEvent(new CustomEvent(GUEST_BLOCKED_EVENT));
    fail(config, 403, blockedMessage());
  }

  const data = route(path, (config.params ?? {}) as Record<string, unknown>);
  if (data === NOT_FOUND) fail(config, 404, "Not found");
  return ok(config, structuredClone(data));
}
