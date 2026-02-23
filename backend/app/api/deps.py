from fastapi import Request, HTTPException
from app.core.tokens import verify_token
from app.services.auth_service import get_user_by_id

COOKIE_NAME = "ps_token"

def get_current_user(request: Request):
    """FastAPI dependency: returns current user dict, raises 401 if not authenticated."""
    tok = request.cookies.get(COOKIE_NAME)
    if not tok:
        raise HTTPException(status_code=401, detail="Not authenticated")
    v = verify_token(tok)
    uid = v[0] if v else None
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        return get_user_by_id(uid)
    except Exception:
        raise HTTPException(status_code=401, detail="User not found")
