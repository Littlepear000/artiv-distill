from app.services import report_ingest as ri


def test_name_from_filename():
    assert ri.name_from_filename("France Art4.PDF") == "France Art4"
    assert ri.name_from_filename("folder/sub\\a.b.pdf") == "a.b"
    assert ri.name_from_filename("notes.txt") is None
    assert ri.name_from_filename(".pdf") is None
    # NFC normalization
    assert ri.name_from_filename("Café.pdf") == "Café"


def test_name_from_url():
    assert ri.name_from_url("https://x.com/a/My%20Report.pdf?x=1#f") == "My Report"
    assert ri.name_from_url("oss://b/dir/%E4%B8%AD%E6%96%87.pdf") == "中文"
    assert ri.name_from_url("https://x.com/a/b/") == "b"
    assert ri.name_from_url("https://x.com") is None
    assert ri.name_from_url("https://x.com/noext") == "noext"


def test_parse_lines():
    text = (
        "https://a.com/x/one.pdf\n"
        "\n"
        "Two | https://a.com/two.pdf\n"
        "Three\thttps://a.com/three.pdf\n"
        "Four, https://a.com/four.pdf\n"
        "ftp://a.com/x.pdf\n"
        "just words\n"
        "https://a.com/f.pdf?a=1,2\n"
        "oss://bkt/\n"
    )
    entries, invalid = ri.parse_link_lines(text)
    assert [(e.line, e.name) for e in entries] == [(1, "one"), (3, "Two"), (4, "Three"), (5, "Four"), (8, "f")]
    assert entries[-1].url == "https://a.com/f.pdf?a=1,2"
    assert [i.line for i in invalid] == [6, 7, 9]


def test_own_bucket_key():
    f = ri.own_bucket_key
    assert f("oss://pdf-workflow/a/b.pdf", "pdf-workflow") == "a/b.pdf"
    assert f("s3://pdf-workflow/a%20b.pdf", "pdf-workflow") == "a b.pdf"
    assert f("s3://other/a.pdf", "pdf-workflow") is None
    assert f("https://pdf-workflow.oss-cn-hangzhou.aliyuncs.com/k/x.pdf?sig=1", "pdf-workflow") == "k/x.pdf"
    assert f("https://other.oss-cn-hangzhou.aliyuncs.com/k/x.pdf", "pdf-workflow") is None
    ep = "http://localhost:4566"
    assert f("http://localhost:4566/pdf-workflow/k/x.pdf", "pdf-workflow", ep) == "k/x.pdf"
    assert f("http://localhost:4566/other/k/x.pdf", "pdf-workflow", ep) is None
    assert f("https://example.com/pdf-workflow/k.pdf", "pdf-workflow", ep) is None
