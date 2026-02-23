import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.core.config import settings
from app.api.deps import get_current_user

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

  out_name = f"merge_{user['id']}_{int(__import__('time').time()*1000)}.mp4"
  out_path = videos_dir / out_name

  # concat demuxer
  with tempfile.TemporaryDirectory() as td:
    list_path = Path(td) / "list.txt"
    lines = []
    for p in local_files:
      escaped = str(p).replace("'", "'\\''")
      lines.append(f"file '{escaped}'")
    list_path.write_text("\n".join(lines), encoding="utf-8")

    cmd = [
      ffmpeg,
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", str(list_path),
      "-c", "copy",
      str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
      raise HTTPException(status_code=500, detail=f"ffmpeg failed: {proc.stderr[-400:]}" )

  return {"url": _public_url_for_video(out_name)}
