from types import SimpleNamespace

import pytest

from app.services import result_versions as rvs


def F(key, label, group=None):
    return SimpleNamespace(key=key, label=label, group_name=group, data_type="text", allow_import=False)


def C(key, label=None, group=None):
    return {"key": key, "label": label or key.title(), "group_name": group, "data_type": "text"}


def R(name, **data):
    return {"report_name": name, "report_id": None, "data": data}


def test_match_headers_by_label_or_key_ignores_allow_import():
    fields = [F("primary_deficit", "Primary deficit"), F("year", "Year")]
    m = rvs.match_upload_headers(["Report Name", "URL", "primary deficit", "YEAR", "Other"], fields)
    assert m["name_idx"] == 0 and m["url_idx"] == 1
    assert {i: f.key for i, f in m["matched"].items()} == {2: "primary_deficit", 3: "year"}
    assert m["unmatched"] == [4]


def test_match_headers_explicit_name_column():
    fields = [F("year", "Year")]
    m = rvs.match_upload_headers(["Doc", "Year"], fields, "doc")
    assert m["name_idx"] == 0 and m["matched"][1].key == "year"
    with pytest.raises(ValueError):
        rvs.match_upload_headers(["Doc"], fields, "nope")


def test_match_headers_no_name_column():
    m = rvs.match_upload_headers(["Year"], [F("year", "Year")])
    assert m["name_idx"] is None


def test_merge_basic_and_order():
    base_cols = [C("a"), C("b")]
    other_cols = [C("b"), C("c")]
    base = [R("Alpha", a="1", b="2"), R("Beta", a="3")]
    other = [R("alpha!", b="9", c="x"), R("Gamma", c="y")]
    cols, rows, s = rvs.merge_tables(base_cols, base, other_cols, other, "other")
    assert [c["key"] for c in cols] == ["a", "b", "c"]
    assert [r["report_name"] for r in rows] == ["Alpha", "Beta", "Gamma"]
    assert rows[0]["data"] == {"a": "1", "b": "9", "c": "x"}
    assert rows[1]["data"] == {"a": "3"}
    assert s["columns"] == {"base": 2, "other": 2, "merged": 3, "duplicate": 1, "only_base": ["A"], "only_other": ["C"]}
    assert s["rows"] == {"base": 2, "other": 2, "merged": 3, "matched": 1, "only_base": 1, "only_other": 1}
    assert s["conflicts"]["cells"] == 1 and s["conflicts"]["rows"] == 1
    assert s["conflicts"]["examples"] == [
        {"report_name": "Alpha", "field_label": "B", "base_value": "2", "other_value": "9"}
    ]


def test_merge_conflict_base_wins_and_equal_not_conflict():
    cols = [C("a"), C("b")]
    base = [R("X", a="1", b="same")]
    other = [R("X", a="2", b="same")]
    _, rows, s = rvs.merge_tables(cols, base, cols, other, "base")
    assert rows[0]["data"] == {"a": "1", "b": "same"}
    assert s["conflicts"]["cells"] == 1


def test_merge_empty_values_do_not_conflict():
    cols = [C("a")]
    _, rows, s = rvs.merge_tables(cols, [R("X", a="")], cols, [R("X", a="5")], "base")
    assert rows[0]["data"] == {"a": "5"} and s["conflicts"]["cells"] == 0


def test_merge_conflict_examples_capped():
    cols = [C("a")]
    base = [R(f"r{i}", a="1") for i in range(30)]
    other = [R(f"r{i}", a="2") for i in range(30)]
    _, _, s = rvs.merge_tables(cols, base, cols, other, "other")
    assert s["conflicts"]["cells"] == 30 and len(s["conflicts"]["examples"]) == 20


def test_merge_invalid_mode():
    with pytest.raises(ValueError):
        rvs.merge_tables([], [], [], [], "x")
