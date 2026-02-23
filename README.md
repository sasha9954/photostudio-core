# PhotoStudio Core (SERVER) — v0.1

## Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

- http://127.0.0.1:8000/api/health
- http://127.0.0.1:8000/docs

## Frontend
cd frontend
npm install
npm run dev

- http://localhost:5173/

## Splash
Put video: frontend/public/splash/splash.mp4
