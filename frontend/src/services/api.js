// IMPORTANT: cookie-session with SameSite=Lax won't work reliably if frontend and backend
// are on different "sites" (e.g. localhost vs 127.0.0.1). Поэтому подстраиваемся под
// текущий hostname, чтобы API_BASE совпадал со "сайтом" фронта.
export const API_BASE = `http://${window.location.hostname}:8000`;
export async function fetchJson(path,{method="GET",headers={},body}={}){
  const res = await fetch(`${API_BASE}${path}`,{
    credentials: "include",
    method,
    headers: {"Content-Type":"application/json",...headers},
    body: body?JSON.stringify(body):undefined
  });
  const text = await res.text();
  let data=null;
  try{ data = text?JSON.parse(text):null; }catch{ data={raw:text}; }
  if(!res.ok){
    // FastAPI часто возвращает {detail: ...}
    const msg = data?.message || data?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
export async function health(){ return fetchJson("/api/health"); }
