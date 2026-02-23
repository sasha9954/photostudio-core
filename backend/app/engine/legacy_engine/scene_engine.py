import os
from typing import Optional

import requests


def _data_url_to_inline(data_url: str) -> dict:
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        raise ValueError("Expected data URL starting with data:")

    header, sep, data = data_url.partition(",")
    if not sep:
        raise ValueError("Invalid data URL format")

    mime = "image/png"
    if ";" in header:
        mime = header[5:].split(";", 1)[0] or "image/png"

    return {"inlineData": {"mimeType": mime, "data": data}}


def _extract_image_data_from_response(data: dict) -> str:
    if not isinstance(data, dict):
        raise RuntimeError("Malformed Gemini response: expected object")

    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        keys = ", ".join(sorted(data.keys())) if data else "<none>"
        raise RuntimeError(f"Malformed Gemini response: missing candidates (keys: {keys})")

    text_parts: list[str] = []
    for candidate in candidates:
        content = candidate.get("content") if isinstance(candidate, dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            continue

        for part in parts:
            if not isinstance(part, dict):
                continue

            inline = part.get("inlineData")
            if isinstance(inline, dict) and inline.get("data"):
                return inline["data"]

            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())

    if text_parts:
        raise RuntimeError(f"Model returned text instead of image: {' '.join(text_parts)}")

    top_keys = ", ".join(sorted(data.keys())) if data else "<none>"
    raise RuntimeError(f"Model returned no image data (keys: {top_keys})")


def create_asset(kind: str, prompt: str, base_image: Optional[str], details: list[str]):
    """
    Создаёт ассет (model/location) через Gemini Image.
    Важно: Gemini иногда может вернуть ответ без inline image data.
    Мы делаем:
      - 1 retry на той же модели
      - затем (опционально) fallback-модели из GEMINI_IMAGE_MODEL_FALLBACKS (через запятую)
    """
    # Канон: ключ и модель берём из engine_init (env GEMINI_API_KEY / GEMINI_IMAGE_MODEL)
    from app.engine.engine_init import load_engine_config

    cfg = load_engine_config()
    api_key = cfg.api_key

    # 1) Собираем parts: текст + (опционально) базовая картинка + детали
    parts = [{"text": f"Generate {kind} image. {prompt}".strip()}]

    if base_image:
        parts.append(_data_url_to_inline(base_image))

    for detail in (details or []):
        if detail:
            parts.append(_data_url_to_inline(detail))

    payload = {"contents": [{"role": "user", "parts": parts}]}

    def _try_model(model_name: str):
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent?key={api_key}"
        )
        resp = requests.post(url, json=payload, timeout=180)
        resp.raise_for_status()
        data = resp.json()

        try:
            image_b64 = _extract_image_data_from_response(data)
        except Exception:
            # Поднимем более понятную ошибку (нужно для retry/fallback)
            keys = ", ".join(list(data.keys())) if isinstance(data, dict) else type(data).__name__
            raise RuntimeError(f"Model returned no image data (keys: {keys})")

        if not image_b64:
            keys = ", ".join(list(data.keys())) if isinstance(data, dict) else type(data).__name__
            raise RuntimeError(f"Model returned no image data (keys: {keys})")

        return f"data:image/png;base64,{image_b64}"

    # 2) Первая попытка + 1 retry на той же модели
    primary_model = (cfg.image_model or "gemini-2.5-flash-image").strip()
    last_err = None

    for attempt in range(2):
        try:
            return _try_model(primary_model)
        except Exception as e:
            last_err = e
            # retry только на "no image data"
            msg = str(e)
            if "no image data" not in msg.lower():
                raise

    # 3) Fallback-модели (если заданы)
    fallbacks_raw = (os.getenv("GEMINI_IMAGE_MODEL_FALLBACKS") or "").strip()
    if fallbacks_raw:
        models = [m.strip() for m in fallbacks_raw.split(",") if m.strip()]
        # не повторяем primary
        models = [m for m in models if m != primary_model]
        for mname in models:
            try:
                return _try_model(mname)
            except Exception as e:
                last_err = e
                continue

    # Если дошли сюда — возвращаем исходную ошибку
    raise last_err if last_err else RuntimeError("CREATE_ASSET_FAILED")
