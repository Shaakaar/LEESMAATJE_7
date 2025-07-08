import os
import sqlite3
import json
from pathlib import Path

STORAGE_DIR = Path(os.path.dirname(__file__)) / "storage"
DB_PATH = STORAGE_DIR / "database.db"

# Ensure storage directory exists
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

_conn = None

def get_conn():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH)
        _conn.row_factory = sqlite3.Row
    return _conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """CREATE TABLE IF NOT EXISTS teachers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )"""
    )
    cur.execute(
        """CREATE TABLE IF NOT EXISTS results (
                id TEXT PRIMARY KEY,
                teacher_id INTEGER,
                sentence TEXT,
                timestamp TEXT,
                audio_path TEXT,
                json_data TEXT,
                FOREIGN KEY (teacher_id) REFERENCES teachers(id)
            )"""
    )
    conn.commit()


def create_teacher(username: str, password: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO teachers(username, password) VALUES (?, ?)", (username, password))
    conn.commit()
    return cur.lastrowid


def authenticate(username: str, password: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM teachers WHERE username=? AND password=?", (username, password))
    row = cur.fetchone()
    return row["id"] if row else None


def save_result(teacher_id: int, result: dict, audio_path: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO results(id, teacher_id, sentence, timestamp, audio_path, json_data) VALUES(?,?,?,?,?,?)",
        (
            result.get("session_id"),
            teacher_id,
            result.get("reference_text"),
            result.get("start_time"),
            audio_path,
            json.dumps(result, ensure_ascii=False),
        ),
    )
    conn.commit()


def list_results(teacher_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, sentence, timestamp FROM results WHERE teacher_id=? ORDER BY timestamp DESC", (teacher_id,))
    return [dict(r) for r in cur.fetchall()]


def get_result(result_id: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM results WHERE id=?", (result_id,))
    row = cur.fetchone()
    return dict(row) if row else None
