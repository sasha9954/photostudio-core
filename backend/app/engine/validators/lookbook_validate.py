from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field

Variant = Literal["TORSO", "LEGS", "FULL"]
ShotType = Literal["ITEM", "DETAIL", "LOGO"]

class ImageRef(BaseModel):
    source: str = Field(..., description="url|dataUrl|file")
    imgUrl: Optional[str] = None
    dataUrl: Optional[str] = None

class Scene(BaseModel):
    model: ImageRef
    location: ImageRef

class Shot(BaseModel):
    id: str
    refImage: ImageRef
    cameraAngle: str
    poseStyle: str
    format: str
    shotType: ShotType = "ITEM"

class PhotoshootRequest(BaseModel):
    studioKey: str = "lookbook"
    variant: Variant
    scene: Scene
    shots: List[Shot] = Field(..., min_length=1, max_length=8)
    debug: bool = False

def user_error(code: str, message: str, hint: str) -> Dict[str, Any]:
    return {"ok": False, "code": code, "message": message, "hint": hint}

def validate_request(req: PhotoshootRequest) -> Optional[Dict[str, Any]]:
    if req.studioKey != "lookbook":
        return user_error("UNSUPPORTED_STUDIO", "Поддерживается только lookbook", "Передай studioKey=lookbook.")
    # форматы только эти три
    if req.variant not in ("TORSO","LEGS","FULL"):
        return user_error("BAD_VARIANT", "Неизвестный режим", "Допустимо: TORSO, LEGS, FULL.")
    # shot format sanity
    for s in req.shots:
        if s.format not in ("9:16","1:1","16:9"):
            return user_error("BAD_FORMAT", "Неверный формат кадра", "Допустимо: 9:16, 1:1, 16:9.")
    return None
