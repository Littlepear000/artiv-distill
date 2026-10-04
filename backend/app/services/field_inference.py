"""从用户粘贴的散乱文本（表头、样例数据、字段说明混在一起）里识别报告字段。

有 DEEPSEEK_API_KEY 就让 DeepSeek（OpenAI 兼容接口）抽取；没配就退化为按 Tab/逗号分隔的规则解析。
"""
import csv
import io
import json
import re

import httpx

from app.config import settings
from app.services.report_values import infer_data_type

VALID_TYPES = {"text", "number", "percent", "date", "year"}

SYSTEM_PROMPT = """You help configure a report-data-extraction tool. The user pastes messy, unstructured text:
Excel column headers, sample rows, notes, maybe several tables mixed together, in any language.
Identify the distinct DATA FIELDS (columns/attributes) that would be extracted from each report.
Do not treat the columns that only identify the report (report name/title, link/url) as fields; list them under "name_column" / "url_column" if present.
Return ONLY a JSON object:
{"name_column": string|null, "url_column": string|null,
 "fields": [{"label": string (clean human-readable name, keep the user's wording),
             "data_type": "text"|"number"|"percent"|"date"|"year",
             "description": string (one short sentence on what to extract),
             "group": string (short 1-3 word thematic group name shared by related fields, e.g. "Fiscal", "Debt", "Identification"),
             "samples": [up to 3 example values found in the text, may be empty]}]}
Merge duplicates, drop junk. Never invent fields that are not suggested by the text."""


class InferenceError(Exception):
    pass


def llm_available() -> bool:
    return bool(settings.deepseek_api_key)


def infer_with_llm(text: str) -> list[dict]:
    try:
        resp = httpx.post(
            settings.deepseek_base_url.rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
            json={
                "model": settings.deepseek_model,
                "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": text}],
                "response_format": {"type": "json_object"},
                "temperature": 0,
            },
            timeout=90,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
    except httpx.HTTPStatusError as exc:
        raise InferenceError(f"DeepSeek API returned HTTP {exc.response.status_code}")
    except (httpx.HTTPError, KeyError, ValueError):
        raise InferenceError("Could not get a valid answer from DeepSeek")

    out = []
    for f in data.get("fields", []):
        label = str(f.get("label", "")).strip()
        if not label:
            continue
        dtype = f.get("data_type") if f.get("data_type") in VALID_TYPES else "text"
        out.append(
            {
                "label": label,
                "data_type": dtype,
                "description": (str(f.get("description") or "").strip() or None),
                "samples": [str(s) for s in (f.get("samples") or [])][:3],
                "group": (str(f.get("group") or "").strip() or None),
            }
        )
    return out


def infer_heuristic(text: str) -> list[dict]:
    """无 Key 时的兜底：第一行当表头，按 Tab（从 Excel 复制）或逗号切分。"""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    delim = "\t" if "\t" in lines[0] else ","
    rows = list(csv.reader(io.StringIO("\n".join(lines)), delimiter=delim))
    headers = [h.strip() for h in rows[0]]
    if len(headers) < 2 and len(lines) > 1 and not re.search(r"[\t,]", lines[0]):
        headers = [ln.strip() for ln in lines]  # 每行一个列名
        rows = [headers]
    out = []
    for i, h in enumerate(headers):
        if not h:
            continue
        samples = [r[i].strip() for r in rows[1:] if i < len(r) and r[i].strip()]
        out.append({"label": h, "data_type": infer_data_type(h, samples), "description": None, "samples": samples[:3]})
    return out


GROUP_PROMPT = """You organize data fields of a report-extraction tool into a few thematic groups.
Input JSON: {"fields": [{"label","description"}], "existing_groups": [names already in use]}.
Assign EVERY field to exactly one group. Reuse an existing group name when it fits; otherwise create a short (1-3 words) name,
in the same language as the field labels. Aim for 3-8 groups total, no singleton groups unless unavoidable.
Return ONLY JSON: {"groups": {"<field label>": "<group name>", ...}}"""


def group_with_llm(fields: list[dict], existing_groups: list[str]) -> dict[str, str]:
    try:
        resp = httpx.post(
            settings.deepseek_base_url.rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
            json={
                "model": settings.deepseek_model,
                "messages": [
                    {"role": "system", "content": GROUP_PROMPT},
                    {"role": "user", "content": json.dumps({"fields": fields, "existing_groups": existing_groups}, ensure_ascii=False)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0,
            },
            timeout=90,
        )
        resp.raise_for_status()
        data = json.loads(resp.json()["choices"][0]["message"]["content"])
        groups = data["groups"]
        return {str(k): str(v) for k, v in groups.items()}
    except httpx.HTTPStatusError as exc:
        raise InferenceError(f"DeepSeek API returned HTTP {exc.response.status_code}")
    except (httpx.HTTPError, KeyError, ValueError, AttributeError):
        raise InferenceError("Could not get a valid answer from DeepSeek")
