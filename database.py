import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATABASE = Path(__file__).resolve().parent / "kisanqueue.db"


def get_connection():
    conn = sqlite3.connect(DATABASE, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS farmers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                village TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                farmer_id INTEGER NOT NULL,
                centre TEXT NOT NULL,
                crop TEXT NOT NULL,
                quantity REAL NOT NULL,
                slot TEXT NOT NULL,
                token TEXT NOT NULL,
                status TEXT DEFAULT 'Waiting',
                payment_status TEXT DEFAULT 'Pending'
            )
        """)

        # Safe migration if an older database exists
        columns = [
            row["name"]
            for row in cursor.execute("PRAGMA table_info(bookings)").fetchall()
        ]

        if "payment_status" not in columns:
            cursor.execute(
                "ALTER TABLE bookings ADD COLUMN payment_status TEXT DEFAULT 'Pending'"
            )

        # Performance Indexes for high concurrency and fast lookups
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers(phone);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_bookings_centre_status ON bookings(centre, status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_bookings_farmer_id ON bookings(farmer_id);")