import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from app.core.config import settings

def _ensure_dir(path: str):
    d = os.path.dirname(path)
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)

def get_db_path() -> str:
    return settings.DB_PATH

def connect():
    path = get_db_path()
    _ensure_dir(path)
    con = sqlite3.connect(path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con

@contextmanager
def db():
    con = connect()
    try:
        yield con
        con.commit()
    finally:
        con.close()

def init_db():
    with db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS users(
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            pwd_hash TEXT NOT NULL,
            pwd_salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS ledger(
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            delta INTEGER NOT NULL,
            reason TEXT NOT NULL,
            ref TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")
        con.execute("""CREATE INDEX IF NOT EXISTS idx_ledger_user_time
            ON ledger(user_id, created_at DESC)""")
        con.execute("""CREATE TABLE IF NOT EXISTS scenes(
            user_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS lookbook_sessions(
            user_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(user_id, mode),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")
        con.execute("""CREATE INDEX IF NOT EXISTS idx_lookbook_user_time
            ON lookbook_sessions(user_id, updated_at DESC)""")

        # Lookbook long-running jobs (so UI can resume after navigation / refresh)
        con.execute("""CREATE TABLE IF NOT EXISTS lookbook_jobs(
            job_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            state TEXT NOT NULL,
            progress INTEGER NOT NULL,
            result_json TEXT,
            error TEXT,
            spent INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")
        con.execute("""CREATE INDEX IF NOT EXISTS idx_lb_jobs_user_time
            ON lookbook_jobs(user_id, updated_at DESC)""")

        # Scene long-running jobs (model/location generation and apply details)
        con.execute("""CREATE TABLE IF NOT EXISTS scene_jobs(
            job_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            kind TEXT NOT NULL,      -- model|location
            action TEXT NOT NULL,    -- generate|applyDetails
            state TEXT NOT NULL,
            progress INTEGER NOT NULL,
            result_json TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")
        con.execute("""CREATE INDEX IF NOT EXISTS idx_scene_jobs_user_time
            ON scene_jobs(user_id, updated_at DESC)""")


        # Video long-running jobs (generate and merge)
        con.execute("""CREATE TABLE IF NOT EXISTS video_jobs(
            job_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,    -- generate|merge
            state TEXT NOT NULL,
            progress INTEGER NOT NULL,
            result_json TEXT,
            error TEXT,
            spent INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")
        con.execute("""CREATE INDEX IF NOT EXISTS idx_video_jobs_user_time
            ON video_jobs(user_id, updated_at DESC)""")
