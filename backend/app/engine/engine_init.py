import os
from dataclasses import dataclass

@dataclass(frozen=True)
class EngineConfig:
    api_key: str
    image_model: str = "gemini-2.5-flash-image"
    vision_model: str = "gemini-2.5-flash"  # для классификации/понимания

def load_engine_config() -> EngineConfig:
    def _norm_env(v: str) -> str:
        # Windows/.env иногда даёт BOM (\ufeff) или кавычки вокруг значения.
        v = (v or "").strip()
        v = v.lstrip("\ufeff")
        if (len(v) >= 2) and ((v[0] == v[-1]) and v[0] in ('"', "'")):
            v = v[1:-1].strip()
        return v

    api_key = _norm_env(os.getenv("GEMINI_API_KEY") or "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    image_model = _norm_env(os.getenv("GEMINI_IMAGE_MODEL") or "gemini-2.5-flash-image")
    vision_model = _norm_env(os.getenv("GEMINI_VISION_MODEL") or "gemini-2.5-flash")
    return EngineConfig(api_key=api_key, image_model=image_model, vision_model=vision_model)
