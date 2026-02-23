import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Body

from app.core.config import settings
from app.api.deps import get_current_user

# Engine
from app.engine.video_engine import generate_video

router = APIRouter(prefix="/video")


def _ensure_videos_dir() -> Path:
    base_app = Path(__file__).resolve().parents[2]  # backend/app
    videos_dir = base_app / "static" / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    return videos_dir


def _public_url_for_video(filename: str) -> str:
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/static/videos/{filename}"


@router.post("/upload")
async def upload_video(file: UploadFile = File(...), user=Depends(get_current_user)):
    # NOTE: user dependency is important for account scoping in future.
    if not file:
        raise HTTPException(status_code=400, detail="No file")
    ct = (file.content_type or "").lower()
    if not (ct.startswith("video/") or file.filename.lower().endswith((".mp4", ".webm"))):
        raise HTTPException(status_code=400, detail="Unsupported file type")

    videos_dir = _ensure_videos_dir()
    ext = ".mp4" if file.filename.lower().endswith(".mp4") else (".webm" if file.filename.lower().endswith(".webm") else ".mp4")
    safe_name = f"clip_{user['id']}_{abs(hash(file.filename))}{ext}"
    out_path = videos_dir / safe_name
    with out_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return {"url": _public_url_for_video(safe_name)}


@router.post("/generate")
async def generate(payload: dict = Body(...), user=Depends(get_current_user)):
    """Generate a short video (Kling or Veo) from 1..3 reference images.

    Accepts flexible payload keys to avoid 422 issues:
      provider: "kling" | "veo"
      sourceImages: [url|dataUrl, ...]   (or source_images)
      aspectRatio: "9:16" | "1:1" | "16:9" (or format)
      seconds: 5|8|10
      prompt, camera, lighting
      count: number of videos (default 1)
    """
    provider = (payload.get("provider") or payload.get("engine") or "kling").strip().lower()

    # Images (allow multiple keys)
    srcs = payload.get("sourceImages") or payload.get("source_images") or payload.get("images") or []
    if isinstance(srcs, str):
        # allow passing single string
        srcs = [srcs]
    if not isinstance(srcs, list) or not srcs or not any(srcs):
        raise HTTPException(status_code=400, detail={"code": "NO_SOURCE_IMAGES", "message": "sourceImages is required"})

    # Format
    fmt = (payload.get("aspectRatio") or payload.get("format") or "9:16").strip()
    if fmt not in ("9:16", "1:1", "16:9"):
        fmt = "9:16"

    seconds = payload.get("seconds") or payload.get("durationSeconds") or payload.get("duration") or 5
    try:
        seconds = int(seconds)
    except Exception:
        seconds = 5

    prompt = (payload.get("prompt") or "").strip()
    camera = (payload.get("camera") or "static").strip()
    lighting = (payload.get("lighting") or "soft").strip()

    count = payload.get("count") or 1
    try:
        count = int(count)
    except Exception:
        count = 1
    count = max(1, min(3, count))

    model = "classic" if provider in ("kling", "standard") else "premium"
    # For Veo: pass list (up to 3) to engine; for Kling: pass first image only
    source_for_engine = srcs if model == "premium" else (srcs[0] if srcs else "")

    videos: List[str] = []
    last_frames: List[Optional[str]] = []
    warnings: List[Optional[str]] = []

    for _ in range(count):
        res = generate_video(
            kind="video_from_image",
            source_image=source_for_engine,
            fmt=fmt,
            model=model,
            camera=camera,
            prompt=prompt,
            seconds=seconds,
            lighting=lighting,
        )
        if not isinstance(res, dict) or not res.get("ok"):
            # normalize error
            code = (res or {}).get("code") if isinstance(res, dict) else None
            msg = (res or {}).get("message") if isinstance(res, dict) else "Generation failed"
            raise HTTPException(status_code=400, detail={"code": code or "GEN_FAILED", "message": msg, "raw": res})

        url = res.get("videoUrl") or res.get("video_url") or res.get("url")
        lf = res.get("lastFrameUrl") or res.get("last_frame_url")
        warn = res.get("warning")
        if url:
            videos.append(url)
            last_frames.append(lf)
            warnings.append(warn)

    return {"ok": True, "provider": provider, "videos": videos, "lastFrames": last_frames, "warnings": warnings}


@router.post("/merge")
async def merge_videos(payload: dict, user=Depends(get_current_user)):
    clip_urls: List[str] = payload.get("clipUrls") or []
    if not isinstance(clip_urls, list) or len(clip_urls) < 2:
        raise HTTPException(status_code=400, detail="clipUrls must contain at least 2 urls")

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise HTTPException(status_code=500, detail="ffmpeg not found. Install ffmpeg and add to PATH")

    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    prefix = f"{base}/static/videos/" if base else "/static/videos/"
    videos_dir = _ensure_videos_dir()

    # Map public urls -> local files (only our own static/videos)
    local_files: List[Path] = []
    for u in clip_urls:
        if not isinstance(u, str):
            continue
        u = u.strip()
        if not u:
            continue
        if base and u.startswith(prefix):
            fname = u.split("/static/videos/")[-1]
        elif (not base) and "/static/videos/" in u:
            fname = u.split("/static/videos/")[-1]
        else:
            raise HTTPException(status_code=400, detail="Only /static/videos/* urls are allowed")
        p = videos_dir / fname
        if not p.exists():
            raise HTTPException(status_code=404, detail=f"Missing clip: {fname}")
        local_files.append(p)

    if len(local_files) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 valid local clips")

    out_name = f"merge_{user['id']}_{int(time.time()*1000)}.mp4"
    out_path = videos_dir / out_name

    # Safer merge: concat + re-encode to avoid codec mismatch between providers
    with tempfile.TemporaryDirectory() as td:
        list_path = Path(td) / "list.txt"
        lines = []
        for p in local_files:
            escaped = str(p).replace("'", "'\''")
            lines.append(f"file '{escaped}'")
        list_path.write_text("\n".join(lines), encoding="utf-8")

        cmd = [
            ffmpeg,
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_path),
            "-vf", "fps=30,format=yuv420p",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "20",
            "-c:a", "aac",
            "-b:a", "128k",
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=f"ffmpeg failed: {proc.stderr[-400:]}" )

    return {"url": _public_url_for_video(out_name)}
