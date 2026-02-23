import requests
from typing import Dict, Any, List, Optional, Tuple

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

def post_generate_content(api_key: str, model: str, body: Dict[str, Any], timeout: int = 120) -> Dict[str, Any]:
    url = f"{BASE_URL}/models/{model}:generateContent"
    r = requests.post(
        url,
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json=body,
        timeout=timeout,
    )
    if r.status_code >= 400:
        # вернём текст ошибки, но без падения
        try:
            return {"__http_error__": True, "status": r.status_code, "text": r.text, "json": r.json()}
        except Exception:
            return {"__http_error__": True, "status": r.status_code, "text": r.text}
    return r.json()
