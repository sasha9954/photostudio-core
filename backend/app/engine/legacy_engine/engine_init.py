import os
from dataclasses import dataclass

@dataclass(frozen=True)
class EngineConfig:
    api_key: str
    image_model: str = "gemini-2.5-flash-image"
    vision_model: str = "gemini-2.5-flash"  # для классификации/понимания

def load_engine_config() -> EngineConfig:
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    image_model = (os.getenv("GEMINI_IMAGE_MODEL") or "gemini-2.5-flash-image").strip()
    vision_model = (os.getenv("GEMINI_VISION_MODEL") or "gemini-2.5-flash").strip()
    return EngineConfig(api_key=api_key, image_model=image_model, vision_model=vision_model)
