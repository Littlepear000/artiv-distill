import io
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from openpyxl import Workbook

from app.services import report_values as rv


def V(source, minutes):
    return SimpleNamespace(source=source, created_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=minutes))


def F(label, key, allow_import=True):
    return SimpleNamespace(label=label, key=key, allow_import=allow_import)


def test_slugify():
    assert rv.slugify("Primary deficit") == "primary_deficit"
    assert rv.slugify("  GDP (%) -- 2024 ") == "gdp_2024"
    assert rv.slugify("赤字") == "field"


def test_normalize_name():
    assert rv.normalize_name("reports/2024/My_Report-v2.PDF") == "my report v2"
    assert rv.normalize_name("政府工作报告_2024.pdf") == "政府工作报告 2024"


def test_auto_select():
    vals = [V("manual", 1), V("system_parse", 2), V("excel_import", 3)]
    assert rv.pick_auto_selected(vals, "system_first") is vals[1]
    assert rv.pick_auto_selected(vals, "latest") is vals[2]
    assert rv.pick_auto_selected(vals[::2], "system_first") is vals[2]
    assert rv.pick_auto_selected([], "latest") is None


def test_timestamps_strictly_increase():
    a, b = rv.next_timestamp(), rv.next_timestamp()
    assert b > a


def test_match_names():
    names = {"1": "Annual Report 2024", "2": "Budget", "3": "Missing", "4": "Dup"}
    keys = ["p/annual_report_2024.pdf", "p/Budget Summary.pdf", "p/dup.pdf", "p/dup.PDF", "p/other.pdf"]
    matched, amb, unmatched, unkeys = rv.match_names_to_keys(names, keys)
    assert matched == {"1": "p/annual_report_2024.pdf", "2": "p/Budget Summary.pdf"}
    assert set(amb) == {"4"}
    assert unmatched == ["3"]
    assert unkeys == ["p/other.pdf"]


def test_xlsx_roundtrip_and_headers():
    fields = [F("Primary deficit", "primary_deficit"), F("Year", "year"), F("Hidden", "hidden", False)]
    template = rv.build_template_workbook(fields)
    headers, rows = rv.read_workbook_rows(template)
    assert headers == ["name", "url", "Primary deficit", "Year"] and rows == []

    wb = Workbook()
    ws = wb.active
    ws.append(["Report Name", "LINK", "primary_deficit", "Year", "Hidden", "Foo"])
    ws.append(["A", "http://x", 3.0, 2024, "z", "q"])
    ws.append([None] * 6)
    buf = io.BytesIO()
    wb.save(buf)
    headers, rows = rv.read_workbook_rows(buf.getvalue())
    layout = rv.map_headers(headers, fields)
    assert layout.name_col == 0 and layout.url_col == 1
    assert sorted(f.key for f in layout.field_cols.values()) == ["primary_deficit", "year"]
    assert layout.unknown_columns == ["Hidden", "Foo"]
    assert rows == [(2, ["A", "http://x", "3", "2024", "z", "q"])]
