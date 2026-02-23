import base64
import re
from typing import Tuple, Optional
import requests

_DATAURL_RE = re.compile(r"^data:(?P<mime>[-\w.+/]+);base64,(?P<data>.+)$", re.DOTALL)

def sniff_mime_from_bytes(b: bytes) -> str:
    # очень грубо, но достаточно для png/jpg
    if b.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if b.startswith(b"\xff\xd8"):
        return "image/jpeg"
    return "application/octet-stream"

def bytes_to_b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")

def dataurl_to_bytes(data_url: str) -> Tuple[bytes, str]:
    m = _DATAURL_RE.match(data_url.strip())
    if not m:
        raise ValueError("Invalid dataUrl")
    mime = m.group("mime")
    data = m.group("data")
    return base64.b64decode(data), mime

def fetch_url_to_bytes(url: str, timeout: int = 25) -> Tuple[bytes, str]:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    b = r.content
    ct = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
    if not ct:
        ct = sniff_mime_from_bytes(b)
    return b, ct

def resolve_image_source(obj: dict) -> Tuple[bytes, str]:
    # expects {source: "url"|"dataUrl", imgUrl: "..."} OR {source:"file", dataUrl:"..."} (фронт может прислать)
    source = (obj.get("source") or "").strip()
    if source == "dataUrl":
        return dataurl_to_bytes(obj.get("imgUrl") or obj.get("dataUrl") or "")
    if source == "url":
        return fetch_url_to_bytes(obj.get("imgUrl") or "")
    if source == "file":
        # blob: на фронте не работает. ждём dataUrl
        du = obj.get("dataUrl") or obj.get("imgUrl") or ""
        if isinstance(du, str) and du.startswith("data:"):
            return dataurl_to_bytes(du)
        raise ValueError("File source requires dataUrl (blob: URL is not supported on backend)")
    # авто-режим: если imgUrl - data:
    s = obj.get("imgUrl") or ""
    if isinstance(s, str) and s.startswith("data:"):
        return dataurl_to_bytes(s)
    if isinstance(s, str) and (s.startswith("http://") or s.startswith("https://")):
        return fetch_url_to_bytes(s)
    raise ValueError("Unsupported image source")
