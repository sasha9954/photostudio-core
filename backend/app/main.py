import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.router import api_router
from app.db.sqlite import init_db

app = FastAPI(title="PhotoStudio Core API", version="0.2.0")

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "assets"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "videos"), exist_ok=True)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    # Превращаем в 400, чтобы фронт видел русское сообщение
    return JSONResponse(status_code=400, content={"ok": False, "message": str(exc)})

app.add_middleware(
    CORSMiddleware,
    # Dev: accept any localhost/127.0.0.1 port, keep cookies (allow_credentials)
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Чтобы фронт мог прочитать имя файла при скачивании (Content-Disposition)
    expose_headers=["Content-Disposition"],
)

@app.on_event("startup")
def _startup():
    init_db()


@app.get("/engine/status")
def engine_status():
    return {
        "ok": True,
        "engine": "stub",
        "kling_configured": bool(os.getenv("KLING_API_KEY")),
        "veo_configured": bool(os.getenv("VEO_API_KEY")),
        "time": datetime.now(timezone.utc).isoformat(),
    }

app.include_router(api_router, prefix="/api")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
