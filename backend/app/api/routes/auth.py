from fastapi import APIRouter, Response, Request
from pydantic import BaseModel
from app.services.auth_service import create_user, verify_login, get_user_by_id
from app.core.tokens import sign_token, verify_token

router = APIRouter()

COOKIE_NAME = "ps_token"

class RegisterIn(BaseModel):
    email: str
    password: str
    name: str | None = None

class LoginIn(BaseModel):
    email: str
    password: str

def _set_cookie(resp: Response, token: str):
    # allow_credentials=True in CORS => cookies ok for localhost
    resp.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60*60*24*14,
        path="/",
    )

def _clear_cookie(resp: Response):
    resp.delete_cookie(COOKIE_NAME, path="/")

def _current_user_id(req: Request):
    tok = req.cookies.get(COOKIE_NAME)
    if not tok:
        return None
    v = verify_token(tok)
    return v[0] if v else None

@router.post("/auth/register")
def register(payload: RegisterIn, response: Response):
    user = create_user(payload.email, payload.name or "", payload.password)
    token = sign_token(user["id"])
    _set_cookie(response, token)
    return {"ok": True, "user": user}

@router.post("/auth/login")
def login(payload: LoginIn, response: Response):
    user = verify_login(payload.email, payload.password)
    token = sign_token(user["id"])
    _set_cookie(response, token)
    return {"ok": True, "user": user}

@router.post("/auth/logout")
def logout(response: Response):
    _clear_cookie(response)
    return {"ok": True}

@router.get("/auth/me")
def me(request: Request):
    uid = _current_user_id(request)
    if not uid:
        return {"ok": False, "user": None}
    try:
        user = get_user_by_id(uid)
        return {"ok": True, "user": user}
    except Exception:
        return {"ok": False, "user": None}
