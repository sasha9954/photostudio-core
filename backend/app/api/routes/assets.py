from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import os
import re
import base64
import hashlib
from datetime import datetime
from app.core.config import settings

router = APIRouter()

ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "static", "assets")
ASSETS_DIR = os.path.abspath(ASSETS_DIR)

class FromDataUrlIn(BaseModel):
    dataUrl: str

def _ensure_dir():
    os.makedirs(ASSETS_DIR, exist_ok=True)

def _guess_ext(mime: str) -> str:
    m = (mime or "").lower()
    if m == "image/png":
        return ".png"
    if m in ("image/jpeg", "image/jpg"):
        return ".jpg"
    if m == "image/webp":
        return ".webp"
    return ".png"

@router.post("/assets/fromDataUrl")
def from_data_url(req: Request, body: FromDataUrlIn):
    s = body.dataUrl or ""
    if not s.startswith("data:"):
        raise HTTPException(status_code=400, detail="dataUrl must start with data:")
    m = re.match(r"^data:([^;]+);base64,(.+)$", s, re.IGNORECASE | re.DOTALL)
    if not m:
        raise HTTPException(status_code=400, detail="Invalid dataUrl")
    mime = m.group(1).strip()
    b64 = m.group(2).strip()
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")

    _ensure_dir()
    h = hashlib.sha256(raw).hexdigest()[:16]
    ext = _guess_ext(mime)
    fn = f"{h}{ext}"
    path = os.path.join(ASSETS_DIR, fn)

    # write once (idempotent)
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(raw)

    # return absolute URL (frontend needs correct host)
    base = settings.PUBLIC_BASE_URL.rstrip("/")
    url = f"{base}/static/assets/{fn}"
    return {"url": url, "mime": mime, "bytes": len(raw)}
