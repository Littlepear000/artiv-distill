/**
 * 访客预览用的示例数据：字段结构与后端 schemas 一一对应，只在浏览器里存在，不连后端。
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const TENANT_ID = id(1);
export const GUEST_USER_ID = id(2);
const U_LIN = id(3);
const U_CHEN = id(4);

export const P_ESG = id(100);
export const P_FIN = id(200);

const daysAgo = (d: number, h = 0) => new Date(Date.now() - (d * 24 + h) * 3600_000).toISOString();

export const guestUser = {
  id: GUEST_USER_ID,
  tenant_id: TENANT_ID,
  email: "guest@preview.local",
  name: "Guest",
  tenant_role: "admin" as const,
};

export const users = [
  { id: GUEST_USER_ID, tenant_id: TENANT_ID, email: guestUser.email, name: "Guest", tenant_role: "admin", is_active: true, created_at: daysAgo(40) },
  { id: U_LIN, tenant_id: TENANT_ID, email: "lin@example.org", name: "Lin Wei", tenant_role: "member", is_active: true, created_at: daysAgo(35) },
  { id: U_CHEN, tenant_id: TENANT_ID, email: "chen@example.org", name: "Chen Yu", tenant_role: "member", is_active: true, created_at: daysAgo(20) },
];
const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? null;

const owners = [{ id: GUEST_USER_ID, name: "Guest", email: guestUser.email }];

export const projects = [
  {
    id: P_ESG, tenant_id: TENANT_ID, name: "ESG report indicator extraction",
    description: "Pull emissions, workforce and governance indicators out of listed-company ESG PDFs",
    created_by: GUEST_USER_ID, created_at: daysAgo(30), my_role: "owner", owners,
    member_count: 3, report_count: 6, workflow_count: 1, last_activity_at: daysAgo(0, 2),
  },
  {
    id: P_FIN, tenant_id: TENANT_ID, name: "Annual report key financials",
    description: "Revenue, net profit and R&D spend from annual reports",
    created_by: GUEST_USER_ID, created_at: daysAgo(12), my_role: "owner", owners,
    member_count: 1, report_count: 3, workflow_count: 0, last_activity_at: daysAgo(3),
  },
];

export const members: Record<string, unknown[]> = {
  [P_ESG]: [
    { id: id(110), project_id: P_ESG, user_id: GUEST_USER_ID, project_role: "owner", created_at: daysAgo(30), user_name: "Guest", user_email: guestUser.email },
    { id: id(111), project_id: P_ESG, user_id: U_LIN, project_role: "editor", created_at: daysAgo(28), user_name: "Lin Wei", user_email: "lin@example.org" },
    { id: id(112), project_id: P_ESG, user_id: U_CHEN, project_role: "viewer", created_at: daysAgo(18), user_name: "Chen Yu", user_email: "chen@example.org" },
  ],
  [P_FIN]: [
    { id: id(210), project_id: P_FIN, user_id: GUEST_USER_ID, project_role: "owner", created_at: daysAgo(12), user_name: "Guest", user_email: guestUser.email },
  ],
};

type Field = { key: string; label: string; data_type: string; group_name: string | null; description: string | null };
const esgFieldDefs: Field[] = [
  { key: "report_year", label: "Report year", data_type: "year", group_name: "Basics", description: "Fiscal year the report covers" },
  { key: "revenue", label: "Revenue (CNY bn)", data_type: "number", group_name: "Basics", description: null },
  { key: "ghg_total", label: "Total GHG emissions (tCO2e)", data_type: "number", group_name: "Environment", description: "Scope 1 + Scope 2" },
  { key: "renewable_share", label: "Renewable electricity share", data_type: "percent", group_name: "Environment", description: null },
  { key: "employees", label: "Employees", data_type: "number", group_name: "Social", description: "Headcount at year end" },
  { key: "female_exec_share", label: "Women in senior management", data_type: "percent", group_name: "Social", description: null },
  { key: "assurance", label: "Third-party assurance", data_type: "text", group_name: "Governance", description: "Name of the assurance provider, if any" },
];
const finFieldDefs: Field[] = [
  { key: "revenue", label: "Revenue (CNY bn)", data_type: "number", group_name: null, description: null },
  { key: "net_profit", label: "Net profit (CNY bn)", data_type: "number", group_name: null, description: null },
  { key: "rnd", label: "R&D spend (CNY bn)", data_type: "number", group_name: null, description: null },
];
const toFields = (pid: string, defs: Field[], base: number) =>
  defs.map((f, i) => ({
    id: id(base + i), project_id: pid, ...f,
    allow_import: true, allow_extract: true, auto_select: "system_first", position: i, created_at: daysAgo(29),
  }));
export const fields: Record<string, ReturnType<typeof toFields>> = {
  [P_ESG]: toFields(P_ESG, esgFieldDefs, 300),
  [P_FIN]: toFields(P_FIN, finFieldDefs, 400),
};

type Src = "manual" | "excel_import" | "system_parse";
const esgRows: [string, Record<string, string>, Src][] = [
  ["Huaxin Cement 2025 ESG Report", { report_year: "2025", revenue: "33.6", ghg_total: "21840000", renewable_share: "18%", employees: "16502", female_exec_share: "22%", assurance: "SGS" }, "system_parse"],
  ["Longi Green Energy 2025 Sustainability Report", { report_year: "2025", revenue: "82.6", ghg_total: "1360000", renewable_share: "61%", employees: "51235", female_exec_share: "27%", assurance: "TÜV Rheinland" }, "system_parse"],
  ["China Merchants Bank 2025 Sustainability Report", { report_year: "2025", revenue: "337.5", ghg_total: "412000", renewable_share: "9%", employees: "117201", female_exec_share: "31%", assurance: "PwC" }, "excel_import"],
  ["BYD 2025 Social Responsibility Report", { report_year: "2025", revenue: "777.1", ghg_total: "5920000", employees: "906321", female_exec_share: "16%" }, "system_parse"],
  ["Midea Group 2025 ESG Report", { report_year: "2025", revenue: "409.1", ghg_total: "1780000", renewable_share: "24%", employees: "198612", assurance: "Bureau Veritas" }, "manual"],
  ["Ping An Insurance 2025 Sustainability Report", { report_year: "2025", revenue: "1028.4", employees: "273053" }, "excel_import"],
];
const finRows: [string, Record<string, string>, Src][] = [
  ["Kweichow Moutai 2025 Annual Report", { revenue: "174.1", net_profit: "86.2", rnd: "0.2" }, "excel_import"],
  ["CATL 2025 Annual Report", { revenue: "362.0", net_profit: "50.7", rnd: "18.6" }, "excel_import"],
  ["Hikvision 2025 Annual Report", { revenue: "92.5" }, "manual"],
];

type ValueRow = {
  id: string; value: string; source: Src; note: string | null; run_id: string | null;
  created_by: string | null; created_by_name: string | null; created_at: string;
  is_selected: boolean; is_pinned: boolean; field_id: string; field_key: string;
};
type Report = {
  id: string; name: string; source_url: string | null; has_file: boolean; uploaded_by: string;
  uploader_name: string | null; created_at: string; updated_at: string;
  values: Record<string, { value_id: string; value: string; source: Src; created_at: string; is_pinned: boolean; history_count: number }>;
};

export const RUN_OK = id(700);
export const RUN_FAIL = id(701);

function buildReports(pid: string, rows: [string, Record<string, string>, Src][], base: number) {
  const fl = fields[pid];
  const reports: Report[] = [];
  const values: Record<string, ValueRow[]> = {};
  rows.forEach(([name, vals, src], i) => {
    const rid = id(base + i * 20);
    const at = daysAgo(25 - i * 3);
    const by = i % 2 ? U_LIN : GUEST_USER_ID;
    const vlist: ValueRow[] = [];
    const sel: Report["values"] = {};
    Object.entries(vals).forEach(([key, value], j) => {
      const f = fl.find((x) => x.key === key)!;
      const vid = id(base + i * 20 + j + 1);
      const fromRun = src === "system_parse";
      vlist.push({
        id: vid, value, source: src, note: null, run_id: fromRun ? RUN_OK : null,
        created_by: fromRun ? null : by, created_by_name: fromRun ? null : nameOf(by), created_at: at,
        is_selected: true, is_pinned: false, field_id: f.id, field_key: key,
      });
      sel[key] = { value_id: vid, value, source: src, created_at: at, is_pinned: false, history_count: 1 };
    });
    if (pid === P_ESG && i === 0) {
      const f = fl.find((x) => x.key === "ghg_total")!;
      vlist.push({
        id: id(base + 19), value: "21500000", source: "manual", note: "Draft figure before restatement", run_id: null,
        created_by: U_LIN, created_by_name: "Lin Wei", created_at: daysAgo(27),
        is_selected: false, is_pinned: false, field_id: f.id, field_key: "ghg_total",
      });
      sel.ghg_total.history_count = 2;
    }
    values[rid] = vlist;
    reports.push({
      id: rid, name, source_url: i % 3 === 2 ? "https://example.org/reports/" + (i + 1) + ".pdf" : null,
      has_file: i % 3 !== 2, uploaded_by: by, uploader_name: nameOf(by), created_at: at, updated_at: at, values: sel,
    });
  });
  return { reports, values };
}
const esg = buildReports(P_ESG, esgRows, 1000);
const fin = buildReports(P_FIN, finRows, 2000);
export const reports: Record<string, Report[]> = { [P_ESG]: esg.reports, [P_FIN]: fin.reports };
export const reportValues: Record<string, ValueRow[]> = { ...esg.values, ...fin.values };

export const WF_ESG = id(500);
export const workflows: Record<string, unknown[]> = {
  [P_ESG]: [{ id: WF_ESG, project_id: P_ESG, name: "ESG indicator extraction", created_by: GUEST_USER_ID, created_at: daysAgo(28), updated_at: daysAgo(2) }],
  [P_FIN]: [],
};

const CODE_EXTRACT = `def run(sdk):
    # Pull plain text out of every uploaded PDF
    for name in sdk.list_inputs():
        text = sdk.extract_pdf_text(name)
        sdk.write_output(name.rsplit(".", 1)[0] + ".txt", text)
`;
const CODE_LLM = `import json

def run(sdk):
    # Ask the model for the indicators defined in the prompt, one JSON object per report
    for name in sdk.list_inputs():
        text = sdk.read_input_bytes(name).decode("utf-8")
        answer = sdk.call_llm(content=text[:60000])
        sdk.write_output(name.replace(".txt", ".json"), json.loads(answer))
`;
const PROMPT_LLM = `You read an ESG / sustainability report and return JSON only.

Keys: report_year, revenue, ghg_total, renewable_share, employees,
female_exec_share, assurance. Use null when the report does not state a value.
Numbers without thousands separators; percentages as "18%".`;
const CODE_TABLE = `import csv, io, json

def run(sdk):
    # Merge per-report JSON into one CSV that the Results page can import
    rows = [json.loads(sdk.read_input_bytes(n)) | {"report": n} for n in sdk.list_inputs()]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=sorted({k for r in rows for k in r}))
    w.writeheader(); w.writerows(rows)
    sdk.write_output("indicators.csv", buf.getvalue())
`;

const node = (n: number, order: number, name: string, code: string, prompt: string, x: number, assets: Partial<Record<string, string | number | null>> = {}) => ({
  id: id(n), workflow_id: WF_ESG, name, code, prompt, order_index: order, position: { x, y: 0 },
  code_asset_id: null, code_asset_version: null, prompt_asset_id: null, prompt_asset_version: null,
  ...assets, created_at: daysAgo(28), updated_at: daysAgo(2),
});
export const ASSET_CODE = id(600);
export const ASSET_PROMPT = id(601);
export const nodes: Record<string, ReturnType<typeof node>[]> = {
  [WF_ESG]: [
    node(510, 0, "Extract PDF text", CODE_EXTRACT, "", 0, { code_asset_id: ASSET_CODE, code_asset_version: 2 }),
    node(511, 1, "LLM indicator extraction", CODE_LLM, PROMPT_LLM, 280, { prompt_asset_id: ASSET_PROMPT, prompt_asset_version: 3 }),
    node(512, 2, "Merge into result table", CODE_TABLE, "", 560),
  ],
};
export const nodeVersions: Record<string, unknown[]> = Object.fromEntries(
  nodes[WF_ESG].map((n) => [
    n.id,
    [2, 1].map((v) => ({ id: id(Number(n.id.slice(-3)) * 10 + v), node_id: n.id, version_no: v, code_snapshot: n.code, prompt_snapshot: n.prompt, saved_by: GUEST_USER_ID, saved_at: daysAgo(v === 2 ? 2 : 20) })),
  ])
);

export const assets: Record<string, { id: string; project_id: string; kind: string; name: string; content: string; created_by: string; created_at: string; updated_at: string }[]> = {
  [P_ESG]: [
    { id: ASSET_CODE, project_id: P_ESG, kind: "code", name: "PDF text extraction", content: CODE_EXTRACT, created_by: GUEST_USER_ID, created_at: daysAgo(29), updated_at: daysAgo(10) },
    { id: ASSET_PROMPT, project_id: P_ESG, kind: "prompt", name: "ESG indicator prompt", content: PROMPT_LLM, created_by: U_LIN, created_at: daysAgo(29), updated_at: daysAgo(4) },
  ],
  [P_FIN]: [],
};
export const assetVersions: Record<string, unknown[]> = {
  [ASSET_CODE]: [2, 1].map((v) => ({ id: id(650 + v), asset_id: ASSET_CODE, version_no: v, content_snapshot: CODE_EXTRACT, saved_by: GUEST_USER_ID, saved_at: daysAgo(v === 2 ? 10 : 29) })),
  [ASSET_PROMPT]: [3, 2, 1].map((v) => ({ id: id(660 + v), asset_id: ASSET_PROMPT, version_no: v, content_snapshot: PROMPT_LLM, saved_by: U_LIN, saved_at: daysAgo(v === 3 ? 4 : 29 - v) })),
};

const file = (n: number, name: string, type: string, size: number, source: string, at: string) => ({
  id: id(n), original_filename: name, content_type: type, size_bytes: size, source, created_at: at,
});
const okAt = daysAgo(2);
const pdfs = [
  file(800, "huaxin_2025_esg.pdf", "application/pdf", 4_812_330, "upload", okAt),
  file(801, "longi_2025_sustainability.pdf", "application/pdf", 9_120_447, "upload", okAt),
];
const nodeRun = (n: number, nd: ReturnType<typeof node>, status: string, ms: number | null, outs: ReturnType<typeof file>[], err: string | null, at: string) => ({
  id: id(n), node_id: nd.id, node_name: nd.name, order_index: nd.order_index, status, duration_ms: ms, error_message: err,
  started_at: status === "pending" ? null : at, finished_at: status === "pending" ? null : at, output_files: outs,
  logs: status === "failed" ? `Traceback (most recent call last):\n  File "node.py", line 8, in run\njson.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)` : status === "success" ? `processed ${pdfs.length} file(s)` : null,
  input_files: [],
});
const [n0, n1, n2] = nodes[WF_ESG];
export const runs: Record<string, ReturnType<typeof runDetail>> = {};
function runDetail(rid: string, status: string, at: string, err: string | null, nrs: ReturnType<typeof nodeRun>[]) {
  return { id: rid, status, triggered_by: GUEST_USER_ID, created_at: at, started_at: at, finished_at: at, error_message: err, input_files: pdfs, node_runs: nrs };
}
const failAt = daysAgo(5);
runs[RUN_OK] = runDetail(RUN_OK, "success", okAt, null, [
  nodeRun(710, n0, "success", 2140, [file(810, "huaxin_2025_esg.txt", "text/plain", 388_201, "node_output", okAt), file(811, "longi_2025_sustainability.txt", "text/plain", 612_090, "node_output", okAt)], null, okAt),
  nodeRun(711, n1, "success", 18_760, [file(812, "huaxin_2025_esg.json", "application/json", 612, "node_output", okAt), file(813, "longi_2025_sustainability.json", "application/json", 598, "node_output", okAt)], null, okAt),
  nodeRun(712, n2, "success", 310, [file(814, "indicators.csv", "text/csv", 1_204, "node_output", okAt)], null, okAt),
]);
runs[RUN_FAIL] = runDetail(RUN_FAIL, "failed", failAt, "Node 'LLM indicator extraction' failed", [
  nodeRun(720, n0, "success", 2010, [file(820, "huaxin_2025_esg.txt", "text/plain", 388_201, "node_output", failAt)], null, failAt),
  nodeRun(721, n1, "failed", 9_420, [], "JSONDecodeError: model returned non-JSON text", failAt),
  nodeRun(722, n2, "pending", null, [], null, failAt),
]);
export const runsByWorkflow: Record<string, string[]> = { [WF_ESG]: [RUN_OK, RUN_FAIL] };

const esgFields = fields[P_ESG];
const columnsOf = (keys: string[]) =>
  keys.map((k) => {
    const f = esgFields.find((x) => x.key === k)!;
    return { key: k, label: f.label, group_name: f.group_name, data_type: f.data_type };
  });
const rowsOf = (n: number, keys: string[]) =>
  esg.reports.slice(0, n).map((r) => ({
    report_name: r.name, report_id: r.id,
    data: Object.fromEntries(keys.filter((k) => r.values[k]).map((k) => [k, r.values[k].value])),
  }));
const allKeys = esgFields.map((f) => f.key);
const envKeys = ["report_year", "ghg_total", "renewable_share"];
const V_RUN = id(900), V_UP = id(901), V_MERGE = id(902), V_SNAP = id(903);
const version = (vid: string, kind: string, label: string, keys: string[], n: number, at: string, extra: Record<string, unknown> = {}) => ({
  id: vid, kind, label, source_filename: null as string | null, run_id: null as string | null, parent_ids: [] as string[],
  row_count: n, column_count: keys.length, created_by: GUEST_USER_ID as string | null, created_by_name: "Guest" as string | null,
  created_at: at, summary: null as Record<string, unknown> | null, ...extra,
  columns: columnsOf(keys), rows: rowsOf(n, keys), parents: [] as { id: string; label: string }[],
});
export const versions: Record<string, ReturnType<typeof version>[]> = {
  [P_ESG]: [
    version(V_SNAP, "snapshot", "Snapshot before Q4 review", allKeys, 6, daysAgo(0, 2)),
    version(V_MERGE, "merge", "Merge: run 2025-10 + analyst sheet", allKeys, 6, daysAgo(1), {
      parent_ids: [V_RUN, V_UP], parents: [{ id: V_RUN, label: "Workflow run · ESG indicator extraction" }, { id: V_UP, label: "analyst_sheet_v3.xlsx" }],
      summary: { conflicts: 2, rows_added: 3 },
    }),
    version(V_UP, "upload", "analyst_sheet_v3.xlsx", allKeys, 4, daysAgo(2), {
      source_filename: "analyst_sheet_v3.xlsx",
      summary: { fields_created: 1, reports_created: 1, reports_updated: 3, values_added: 19, skipped_columns: ["Notes"], missing_fields: [] },
    }),
    version(V_RUN, "run", "Workflow run · ESG indicator extraction", envKeys, 2, okAt, { run_id: RUN_OK, created_by: null, created_by_name: null }),
  ],
  [P_FIN]: [],
};
