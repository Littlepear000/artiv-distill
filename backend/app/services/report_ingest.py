"""Pure helpers for bulk report ingest (folder upload / pasted links)."""
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import unquote, urlsplit

ALLOWED_SCHEMES = ("http", "https", "oss", "s3")
_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")


def clean_name(name: str) -> str:
    return unicodedata.normalize("NFC", name or "").strip()


def name_from_filename(filename: str) -> str | None:
    """Report name for an uploaded PDF, or None when it is not a .pdf / has no usable name."""
    base = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    if not base.lower().endswith(".pdf"):
        return None
    name = clean_name(base[: -len(".pdf")])
    return name or None


def basename(filename: str) -> str:
    return (filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()


def looks_like_url(text: str) -> bool:
    return bool(_SCHEME_RE.match(text.strip()))


def is_valid_url(url: str) -> bool:
    if not url or re.search(r"\s", url):
        return False
    parts = urlsplit(url)
    return parts.scheme.lower() in ALLOWED_SCHEMES and bool(parts.netloc)


def name_from_url(url: str) -> str | None:
    """URL-decoded last non-empty path segment without extension (query/fragment stripped)."""
    parts = urlsplit(url)
    segments = [s for s in parts.path.split("/") if s]
    if not segments:
        return None
    last = unquote(segments[-1])
    stem = last.rsplit(".", 1)[0] if "." in last.strip(".") else last
    name = clean_name(stem)
    return name or None


@dataclass
class LineEntry:
    line: int
    name: str | None
    url: str


@dataclass
class InvalidLine:
    line: int
    text: str
    reason: str


def split_line(text: str) -> tuple[str | None, str]:
    """Split one non-blank line into (name | None, url_candidate)."""
    text = text.strip()
    if looks_like_url(text):
        return None, text
    for sep in ("|", "\t", ","):
        if sep in text:
            left, right = text.split(sep, 1)
            return (clean_name(left) or None), right.strip()
    return None, text


def parse_link_lines(text: str) -> tuple[list[LineEntry], list[InvalidLine]]:
    entries: list[LineEntry] = []
    invalid: list[InvalidLine] = []
    for no, raw in enumerate((text or "").splitlines(), start=1):
        if not raw.strip():
            continue
        name, url = split_line(raw)
        if not is_valid_url(url):
            invalid.append(InvalidLine(no, raw.strip(), "Not a valid URL (allowed: http, https, oss, s3)"))
            continue
        if name is None:
            name = name_from_url(url)
            if name is None:
                invalid.append(InvalidLine(no, raw.strip(), "Could not derive a report name from the URL"))
                continue
        entries.append(LineEntry(no, name, url))
    return entries, invalid


def own_bucket_key(url: str, bucket: str, endpoint_url: str = "") -> str | None:
    """Return the object key when `url` points into our bucket, else None."""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    bucket_l = bucket.lower()
    path = parts.path.lstrip("/")
    if scheme in ("oss", "s3"):
        if host == bucket_l and path:
            return unquote(path)
        return None
    if scheme not in ("http", "https") or not path:
        return None
    # virtual-hosted style on Aliyun OSS: <bucket>.oss-*.aliyuncs.com/key
    if host.startswith(bucket_l + ".") and re.match(r"^oss-[a-z0-9-]+(-internal)?\.aliyuncs\.com$", host[len(bucket_l) + 1:]):
        return unquote(path)
    ep_host = (urlsplit(endpoint_url).hostname or "").lower() if endpoint_url else ""
    if ep_host:
        # virtual-hosted on the configured endpoint
        if host == f"{bucket_l}.{ep_host}":
            return unquote(path)
        # path-style on the configured endpoint
        if host == ep_host and (parts.port or None) == (urlsplit(endpoint_url).port or None):
            prefix = bucket + "/"
            if path.startswith(prefix) and len(path) > len(prefix):
                return unquote(path[len(prefix):])
    return None
