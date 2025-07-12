import os
import sqlite3
import json
import time
from pathlib import Path

STORAGE_DIR = Path(os.path.dirname(__file__)) / "storage"
DB_PATH = STORAGE_DIR / "database.db"

# Ensure storage directory exists
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

_conn = None

def get_conn():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
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
        """CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                teacher_id INTEGER,
                FOREIGN KEY (teacher_id) REFERENCES teachers(id)
            )"""
    )
    cur.execute(
        """CREATE TABLE IF NOT EXISTS results (
                id TEXT PRIMARY KEY,
                teacher_id INTEGER,
                student_id INTEGER,
                sentence TEXT,
                timestamp TEXT,
                audio_path TEXT,
                json_data TEXT,
                FOREIGN KEY (teacher_id) REFERENCES teachers(id),
                FOREIGN KEY (student_id) REFERENCES students(id)
            )"""
    )
    # Simple schema migration for older databases without student_id column
    cur.execute("PRAGMA table_info(results)")
    columns = [row[1] for row in cur.fetchall()]
    if "student_id" not in columns:
        cur.execute("ALTER TABLE results ADD COLUMN student_id INTEGER")
        conn.commit()
    conn.commit()


def create_teacher(username: str, password: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO teachers(username, password) VALUES (?, ?)", (username, password))
    conn.commit()
    return cur.lastrowid


def authenticate_teacher(username: str, password: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM teachers WHERE username=? AND password=?", (username, password))
    row = cur.fetchone()
    return row["id"] if row else None


def teacher_exists(teacher_id: int) -> bool:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM teachers WHERE id=?", (teacher_id,))
    return cur.fetchone() is not None


def create_student(username: str, password: str, teacher_id: int | None):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO students(username, password, teacher_id) VALUES(?,?,?)",
        (username, password, teacher_id),
    )
    conn.commit()
    return cur.lastrowid


def authenticate_student(username: str, password: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, teacher_id FROM students WHERE username=? AND password=?",
        (username, password),
    )
    row = cur.fetchone()
    return (row["id"], row["teacher_id"]) if row else (None, None)


def save_result(teacher_id: int, student_id: int, result: dict, audio_path: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO results(id, teacher_id, student_id, sentence, timestamp, audio_path, json_data) VALUES(?,?,?,?,?,?,?)",
        (
            result.get("session_id"),
            teacher_id,
            student_id,
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
    cur.execute(
        (
            "SELECT results.id, sentence, timestamp, students.username AS student "
            "FROM results JOIN students ON results.student_id = students.id "
            "WHERE results.teacher_id=? ORDER BY timestamp DESC"
        ),
        (teacher_id,),
    )
    return [dict(r) for r in cur.fetchall()]


def list_student_results(student_id: int):
    """Return all results for a student including stored JSON data and audio path."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, sentence, timestamp, audio_path, json_data FROM results WHERE student_id=? ORDER BY timestamp DESC",
        (student_id,),
    )
    rows = []
    for r in cur.fetchall():
        row = dict(r)
        try:
            row["json_data"] = json.loads(row["json_data"])
        except Exception:
            row["json_data"] = {}
        rows.append(row)
    return rows


def list_student_summaries(teacher_id: int):
    """Return per-student summary stats for a teacher."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, username FROM students WHERE teacher_id=?",
        (teacher_id,),
    )
    students = [dict(r) for r in cur.fetchall()]

    one_week_ago = time.time() - 7 * 24 * 3600
    for stu in students:
        sid = stu["id"]
        cur.execute(
            "SELECT timestamp, json_data FROM results WHERE student_id=? ORDER BY timestamp DESC LIMIT 1",
            (sid,),
        )
        row = cur.fetchone()
        stu["last_session"] = row["timestamp"] if row else None

        cur.execute(
            "SELECT json_data FROM results WHERE student_id=? AND timestamp>=?",
            (sid, one_week_ago),
        )
        total_seconds = 0.0
        for r in cur.fetchall():
            try:
                j = json.loads(r["json_data"])
                start = j.get("start_time") or 0
                end = j.get("end_time") or start
                total_seconds += max(0, end - start)
            except Exception:
                continue
        stu["minutes_7d"] = round(total_seconds / 60, 1)
    return students


def get_result(result_id: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM results WHERE id=?", (result_id,))
    row = cur.fetchone()
    return dict(row) if row else None
