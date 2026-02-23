import base64
import hmac
import hashlib
import time
from typing import Optional, Tuple
from app.core.config import settings

def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

def _b64d(s: str) -> bytes:
    pad = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))

def sign_token(user_id: str, ttl_seconds: int = None) -> str:
    ttl = ttl_seconds or settings.TOKEN_TTL_SECONDS
    exp = int(time.time()) + int(ttl)
    payload = f"{user_id}.{exp}".encode("utf-8")
    sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).digest()
    return f"{_b64e(payload)}.{_b64e(sig)}"

def verify_token(token: str) -> Optional[Tuple[str,int]]:
    try:
        p64, s64 = token.split(".", 1)
        payload = _b64d(p64)
        sig = _b64d(s64)
        expected = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        user_id, exp_s = payload.decode("utf-8").split(".", 1)
        exp = int(exp_s)
        if int(time.time()) > exp:
            return None
        return user_id, exp
    except Exception:
        return None
