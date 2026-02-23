from fastapi import APIRouter
router = APIRouter()

@router.get("/health")
def health():
    return {"ok": True, "version": "0.2.0"}
