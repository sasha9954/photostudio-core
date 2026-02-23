import json
import re
from typing import Dict, Any, List, Tuple
from .engine_init import EngineConfig
from .media_io import resolve_image_source, bytes_to_b64
from .gemini_rest import post_generate_content, GeminiRestError
def _read_prompt_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()

def build_prompt(prompts_dir: str, variant: str, shot_type: str, camera_angle: str, pose_style: str, fmt: str) -> str:
    base = _read_prompt_text(f"{prompts_dir}/base.txt")
    vmap = {
        "TORSO": _read_prompt_text(f"{prompts_dir}/variant_torso.txt"),
        "LEGS": _read_prompt_text(f"{prompts_dir}/variant_legs.txt"),
        "FULL": _read_prompt_text(f"{prompts_dir}/variant_full.txt"),
    }
    smap = {
        "ITEM": _read_prompt_text(f"{prompts_dir}/shot_item.txt"),
        "DETAIL": _read_prompt_text(f"{prompts_dir}/shot_detail.txt"),
        "LOGO": _read_prompt_text(f"{prompts_dir}/shot_logo.txt"),
    }
    parts = [
        base,
        vmap.get(variant, ""),
        smap.get(shot_type, ""),
        f"РАКУРС КАМЕРЫ: {camera_angle}",
        f"СТИЛЬ ПОЗЫ: {pose_style}",
        f"ФОРМАТ КАДРА: {fmt}",
        "Сделай результат как реалистичную фотографию высокого качества. Без текста на изображении.",
    ]
    return "\n\n".join([p for p in parts if p])

def extract_first_image_b64(resp: Dict[str, Any]) -> Tuple[str, str]:
    # returns (mime, b64)
    try:
        cand = (resp.get("candidates") or [])[0]
        parts = ((cand.get("content") or {}).get("parts") or [])
        for p in parts:
            inline = p.get("inlineData") or p.get("inline_data") or p.get("inlineData".lower())
            if inline:
                mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
                data = inline.get("data") or ""
                if data:
                    return mime, data
    except Exception:
        pass
    return "image/png", ""

def classify_garment(cfg: EngineConfig, image_bytes: bytes, mime: str) -> str:
    # Очень краткая классификация: upper/lower/outfit/unknown
    prompt = (
        "Classify the main garment in the image into one of: upper, lower, outfit, unknown. "
        "Return ONLY the label."
    )
    body = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": mime, "data": bytes_to_b64(image_bytes)}},
            ]
        }]
    }
    resp = post_generate_content(cfg.api_key, cfg.vision_model, body, timeout=60)
    if resp.get("__http_error__"):
        return "unknown"
    text = ""
    try:
        cand = (resp.get("candidates") or [])[0]
        parts = ((cand.get("content") or {}).get("parts") or [])
        for p in parts:
            if "text" in p:
                text += p["text"]
    except Exception:
        pass
    t = (text or "").strip().lower()
    for label in ("upper","lower","outfit","unknown"):
        if label in t:
            return label
    return "unknown"

def validate_variant_against_label(variant: str, label: str) -> Dict[str, Any] | None:
    if variant == "TORSO" and label in ("lower", "outfit"):
        return {"code":"LOOKBOOK_INVALID_GARMENT","message":"В режиме ТОРС нельзя загружать низ/комплект.","hint":"Загрузи только верх (майка/куртка/пальто). Комплект — только в ПОЛНЫЙ РОСТ."}
    if variant == "LEGS" and label in ("upper", "outfit"):
        return {"code":"LOOKBOOK_INVALID_GARMENT","message":"В режиме НОГИ нельзя загружать верх/комплект.","hint":"Загрузи только низ (шорты/брюки/юбка). Комплект — только в ПОЛНЫЙ РОСТ."}
    if variant == "FULL" and label in ("upper","lower"):
        return {"code":"LOOKBOOK_INVALID_GARMENT","message":"В режиме ПОЛНЫЙ РОСТ нужен комплект или комбинезон.","hint":"Загрузи фото комплекта (верх+низ) или цельного комбинезона."}
    return None

def generate_shot(cfg: EngineConfig, prompts_dir: str, variant: str, scene_model: Dict[str, Any], scene_location: Dict[str, Any], shot: Dict[str, Any], debug: bool=False) -> Dict[str, Any]:
    # resolve images
    model_b, model_mime = resolve_image_source(scene_model)
    loc_b, loc_mime = resolve_image_source(scene_location)
    ref_b, ref_mime = resolve_image_source(shot["refImage"])

    # classify and enforce strict rules
    label = classify_garment(cfg, ref_b, ref_mime)
    ve = validate_variant_against_label(variant, label)
    if ve:
        return {"ok": False, **ve, "shotId": shot.get("id")}

    prompt = build_prompt(prompts_dir, variant, shot.get("shotType","ITEM"), shot.get("cameraAngle",""), shot.get("poseStyle",""), shot.get("format","9:16"))

    body = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": model_mime, "data": bytes_to_b64(model_b)}},
                {"inlineData": {"mimeType": loc_mime, "data": bytes_to_b64(loc_b)}},
                {"inlineData": {"mimeType": ref_mime, "data": bytes_to_b64(ref_b)}},
            ]
        }]
    }
    resp = post_generate_content(cfg.api_key, cfg.image_model, body, timeout=180)
    if resp.get("__http_error__"):
        return {
            "ok": False,
            "code": "ENGINE_UPSTREAM_ERROR",
            "message": "Gemini API вернул ошибку",
            "hint": "Проверь GEMINI_API_KEY, модель и лимиты. Подробности см. debug.",
            "shotId": shot.get("id"),
            "debug": resp if debug else None,
        }
    mime, b64 = extract_first_image_b64(resp)
    if not b64:
        return {
            "ok": False,
            "code": "ENGINE_NO_IMAGE",
            "message": "Движок не вернул изображение",
            "hint": "Попробуй другой реф/ракурс или модель gemini-3-pro-image-preview.",
            "shotId": shot.get("id"),
            "debug": resp if debug else None,
        }
    out = {"ok": True, "id": shot.get("id"), "mime": mime, "b64": b64}
    if debug:
        out["debug"] = {"prompt": prompt[:1200], "label": label}
    return out

def photoshoot(cfg: EngineConfig, prompts_dir: str, variant: str, scene: Dict[str, Any], shots: List[Dict[str, Any]], debug: bool=False) -> Dict[str, Any]:
    results = []
    for shot in shots:
        r = generate_shot(cfg, prompts_dir, variant, scene["model"], scene["location"], shot, debug=debug)
        if not r.get("ok"):
            # fail-fast: возвращаем понятную ошибку
            return {"ok": False, **{k:r.get(k) for k in ("code","message","hint")}, "shotId": r.get("shotId"), "debug": r.get("debug")}
        results.append({"id": r["id"], "image": f"data:{r['mime']};base64,{r['b64']}", "debug": r.get("debug")})
    return {"ok": True, "variant": variant, "results": results, "meta": {"modelLock": True, "sceneLock": True}}
def _format_gemini_http_error(http_err: dict) -> tuple[str, str]:
    """Return (message, hint) based on gemini_rest __http_error__ structure."""
    try:
        status = http_err.get("status") or http_err.get("status_code") or http_err.get("code")
        j = http_err.get("json") if isinstance(http_err.get("json"), dict) else None
        text = http_err.get("text") or ""
        # Try to pull a useful error message from JSON
        j_msg = None
        if j:
            # common: {"error": {"message": "...", "status": "..."}}
            if isinstance(j.get("error"), dict) and j["error"].get("message"):
                j_msg = j["error"]["message"]
            elif j.get("message"):
                j_msg = j.get("message")
        msg = j_msg or text
        msg = (msg or "").strip().replace("\n", " ")
        if len(msg) > 260:
            msg = msg[:260] + "…"
        message = f"Gemini API error{f' ({status})' if status else ''}: {msg or 'unknown'}"
        hint = 'Проверь GEMINI_API_KEY, доступ к модели и лимиты. Если в ошибке видно "model"/"not found" — укажи правильный EngineConfig.image_model (env GEMINI_IMAGE_MODEL).'
        return message, hint
    except Exception:
        return "Gemini API error: unknown", "Проверь GEMINI_API_KEY и лимиты."


