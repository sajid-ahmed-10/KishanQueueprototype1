from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import get_connection, get_db, init_db


# ---------------------------------------------------------
# APP CONFIGURATION
# ---------------------------------------------------------

app = FastAPI(
    title="KisanQueue",
    description="Smart Farmer Procurement Queue Management System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

CENTRES = [
    "Centre A",
    "Centre B",
    "Centre C"
]

STATUSES = [
    "Waiting",
    "Called",
    "Processing",
    "Completed",
    "Cancelled"
]


# ---------------------------------------------------------
# DATA MODELS
# ---------------------------------------------------------

class Farmer(BaseModel):
    name: str
    phone: str
    village: str


class Booking(BaseModel):
    farmer_id: int
    centre: str
    crop: str
    quantity: float
    slot: str


class StatusUpdate(BaseModel):
    status: str


class PaymentUpdate(BaseModel):
    payment_status: str


# ---------------------------------------------------------
# HEALTH CHECK & METADATA
# ---------------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "success": True,
        "message": "KisanQueue backend is running",
        "status": "online"
    }


@app.get("/api/centres")
def get_centres():
    return {
        "success": True,
        "centres": CENTRES
    }


# ---------------------------------------------------------
# FARMER REGISTRATION
# ---------------------------------------------------------

@app.post("/api/farmers")
def register_farmer(farmer: Farmer):
    name = farmer.name.strip()
    phone = "".join(farmer.phone.strip().split())
    village = farmer.village.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Farmer name is required")

    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    if not village:
        raise HTTPException(status_code=400, detail="Village is required")

    with get_db() as conn:
        cursor = conn.cursor()

        existing = cursor.execute(
            "SELECT id, name, village FROM farmers WHERE phone = ?",
            (phone,)
        ).fetchone()

        if existing:
            # Update profile info and preserve farmer_id so past bookings remain linked
            cursor.execute(
                "UPDATE farmers SET name = ?, village = ? WHERE id = ?",
                (name, village, existing["id"])
            )
            farmer_id = existing["id"]
            message = f"Welcome back, {name}! Existing profile updated."
        else:
            cursor.execute(
                """
                INSERT INTO farmers (name, phone, village)
                VALUES (?, ?, ?)
                """,
                (name, phone, village)
            )
            farmer_id = cursor.lastrowid
            message = "Farmer registered successfully"

    return {
        "success": True,
        "farmer_id": farmer_id,
        "message": message
    }


# ---------------------------------------------------------
# GET FARMER
# ---------------------------------------------------------

@app.get("/api/farmer/{phone}")
def get_farmer(phone: str):
    clean_phone = "".join(phone.strip().split())

    with get_db() as conn:
        cursor = conn.cursor()

        farmer = cursor.execute(
            """
            SELECT *
            FROM farmers
            WHERE phone = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (clean_phone,)
        ).fetchone()

        if not farmer:
            raise HTTPException(
                status_code=404,
                detail="Farmer not found with this mobile number"
            )

        # Retrieve all bookings matching the phone number across any associated profiles
        bookings = cursor.execute(
            """
            SELECT bookings.*
            FROM bookings
            JOIN farmers ON bookings.farmer_id = farmers.id
            WHERE farmers.phone = ?
            ORDER BY bookings.id DESC
            """,
            (clean_phone,)
        ).fetchall()

    return {
        "success": True,
        "farmer": dict(farmer),
        "bookings": [dict(b) for b in bookings]
    }


# ---------------------------------------------------------
# CREATE BOOKING
# ---------------------------------------------------------

@app.post("/api/book")
def create_booking(booking: Booking):
    if booking.centre not in CENTRES:
        raise HTTPException(
            status_code=400,
            detail="Invalid procurement centre"
        )

    if booking.quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than zero"
        )

    with get_db() as conn:
        cursor = conn.cursor()

        farmer = cursor.execute(
            "SELECT * FROM farmers WHERE id = ?",
            (booking.farmer_id,)
        ).fetchone()

        if not farmer:
            raise HTTPException(
                status_code=404,
                detail="Farmer not found"
            )

        # Monotonic sequential token generation preventing duplicate IDs
        max_row = cursor.execute("SELECT COALESCE(MAX(id), 0) AS max_id FROM bookings").fetchone()
        token_number = (max_row["max_id"] or 0) + 1
        token = f"KQ-{token_number:03d}"

        cursor.execute(
            """
            INSERT INTO bookings
            (
                farmer_id,
                centre,
                crop,
                quantity,
                slot,
                token,
                status,
                payment_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                booking.farmer_id,
                booking.centre,
                booking.crop,
                booking.quantity,
                booking.slot,
                token,
                "Waiting",
                "Pending"
            )
        )

        booking_id = cursor.lastrowid

    return {
        "success": True,
        "booking_id": booking_id,
        "token": token,
        "message": "Slot booked successfully"
    }


# ---------------------------------------------------------
# LIVE QUEUE (WITH STATUS FILTERING FOR OPERATOR)
# ---------------------------------------------------------

@app.get("/api/queue/{centre}")
def get_queue(centre: str, status: Optional[str] = Query("active")):
    with get_db() as conn:
        cursor = conn.cursor()

        status_lower = (status or "active").strip().lower()

        if status_lower == "all":
            query = """
                SELECT
                    bookings.*,
                    farmers.name,
                    farmers.phone,
                    farmers.village
                FROM bookings
                JOIN farmers ON bookings.farmer_id = farmers.id
                WHERE bookings.centre = ?
                ORDER BY bookings.id DESC
            """
            params = (centre,)
        elif status_lower == "completed":
            query = """
                SELECT
                    bookings.*,
                    farmers.name,
                    farmers.phone,
                    farmers.village
                FROM bookings
                JOIN farmers ON bookings.farmer_id = farmers.id
                WHERE bookings.centre = ? AND bookings.status = 'Completed'
                ORDER BY bookings.id DESC
            """
            params = (centre,)
        elif status_lower == "cancelled":
            query = """
                SELECT
                    bookings.*,
                    farmers.name,
                    farmers.phone,
                    farmers.village
                FROM bookings
                JOIN farmers ON bookings.farmer_id = farmers.id
                WHERE bookings.centre = ? AND bookings.status = 'Cancelled'
                ORDER BY bookings.id DESC
            """
            params = (centre,)
        else:  # default 'active'
            query = """
                SELECT
                    bookings.*,
                    farmers.name,
                    farmers.phone,
                    farmers.village
                FROM bookings
                JOIN farmers ON bookings.farmer_id = farmers.id
                WHERE bookings.centre = ?
                AND bookings.status IN ('Waiting', 'Called', 'Processing')
                ORDER BY 
                    CASE bookings.status
                        WHEN 'Processing' THEN 1
                        WHEN 'Called' THEN 2
                        WHEN 'Waiting' THEN 3
                        ELSE 4
                    END,
                    bookings.id ASC
            """
            params = (centre,)

        bookings = cursor.execute(query, params).fetchall()

    result = []
    for index, booking in enumerate(bookings):
        data = dict(booking)
        data["people_ahead"] = index
        data["estimated_wait"] = index * 12
        result.append(data)

    return {
        "success": True,
        "centre": centre,
        "filter": status_lower,
        "queue": result
    }


# ---------------------------------------------------------
# UPDATE STATUS
# ---------------------------------------------------------

@app.put("/api/booking/{booking_id}/status")
def update_status(booking_id: int, update: StatusUpdate):
    if update.status not in STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid status"
        )

    with get_db() as conn:
        cursor = conn.cursor()

        booking = cursor.execute(
            "SELECT * FROM bookings WHERE id = ?",
            (booking_id,)
        ).fetchone()

        if not booking:
            raise HTTPException(
                status_code=404,
                detail="Booking not found"
            )

        cursor.execute(
            "UPDATE bookings SET status = ? WHERE id = ?",
            (update.status, booking_id)
        )

    return {
        "success": True,
        "message": f"Booking status changed to {update.status}"
    }


# ---------------------------------------------------------
# UPDATE PAYMENT
# ---------------------------------------------------------

@app.put("/api/booking/{booking_id}/payment")
def update_payment(booking_id: int, update: PaymentUpdate):
    allowed = ["Pending", "Processing", "Paid"]

    if update.payment_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Invalid payment status"
        )

    with get_db() as conn:
        cursor = conn.cursor()

        booking = cursor.execute(
            "SELECT * FROM bookings WHERE id = ?",
            (booking_id,)
        ).fetchone()

        if not booking:
            raise HTTPException(
                status_code=404,
                detail="Booking not found"
            )

        cursor.execute(
            "UPDATE bookings SET payment_status = ? WHERE id = ?",
            (update.payment_status, booking_id)
        )

    return {
        "success": True,
        "message": f"Payment status updated to {update.payment_status}"
    }


# ---------------------------------------------------------
# CALL NEXT FARMER
# ---------------------------------------------------------

@app.post("/api/queue/{centre}/next")
def call_next(centre: str):
    with get_db() as conn:
        cursor = conn.cursor()

        booking = cursor.execute(
            """
            SELECT *
            FROM bookings
            WHERE centre = ?
            AND status = 'Waiting'
            ORDER BY id ASC
            LIMIT 1
            """,
            (centre,)
        ).fetchone()

        if not booking:
            return {
                "success": False,
                "message": "No waiting farmer in queue"
            }

        cursor.execute(
            "UPDATE bookings SET status = 'Called' WHERE id = ?",
            (booking["id"],)
        )

    return {
        "success": True,
        "booking_id": booking["id"],
        "token": booking["token"],
        "message": f"Token {booking['token']} called"
    }


# ---------------------------------------------------------
# DASHBOARD
# ---------------------------------------------------------

@app.get("/api/dashboard/{centre}")
def dashboard(centre: str):
    with get_db() as conn:
        cursor = conn.cursor()

        total = cursor.execute(
            "SELECT COUNT(*) AS total FROM bookings WHERE centre = ?",
            (centre,)
        ).fetchone()["total"]

        waiting = cursor.execute(
            "SELECT COUNT(*) AS total FROM bookings WHERE centre = ? AND status = 'Waiting'",
            (centre,)
        ).fetchone()["total"]

        called = cursor.execute(
            "SELECT COUNT(*) AS total FROM bookings WHERE centre = ? AND status = 'Called'",
            (centre,)
        ).fetchone()["total"]

        processing = cursor.execute(
            "SELECT COUNT(*) AS total FROM bookings WHERE centre = ? AND status = 'Processing'",
            (centre,)
        ).fetchone()["total"]

        completed = cursor.execute(
            "SELECT COUNT(*) AS total FROM bookings WHERE centre = ? AND status = 'Completed'",
            (centre,)
        ).fetchone()["total"]

        cancelled = cursor.execute(
            "SELECT COUNT(*) AS total FROM bookings WHERE centre = ? AND status = 'Cancelled'",
            (centre,)
        ).fetchone()["total"]

        crop_rows = cursor.execute(
            """
            SELECT crop, COUNT(*) AS total
            FROM bookings
            WHERE centre = ?
            GROUP BY crop
            ORDER BY total DESC
            """,
            (centre,)
        ).fetchall()

    capacity = 100
    active = waiting + called + processing
    workload = min(100, round((active / capacity) * 100))

    return {
        "success": True,
        "centre": centre,
        "total": total,
        "waiting": waiting,
        "called": called,
        "processing": processing,
        "completed": completed,
        "cancelled": cancelled,
        "active": active,
        "capacity": capacity,
        "workload": workload,
        "crop_stats": [dict(row) for row in crop_rows]
    }


# ---------------------------------------------------------
# DEMO DATA
# ---------------------------------------------------------

@app.post("/api/demo/reset")
def reset_demo():
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("DELETE FROM bookings")
        cursor.execute("DELETE FROM farmers")

        farmers = [
            ("Rahul Das", "9000000001", "Rampur"),
            ("Amit Kumar", "9000000002", "Lakshmipur"),
            ("Suman Roy", "9000000003", "Haripur"),
            ("Rina Das", "9000000004", "Beldanga"),
            ("Arif Khan", "9000000005", "Nadia"),
            ("Priya Singh", "9000000006", "Krishnanagar")
        ]

        farmer_ids = []
        for name, phone, village in farmers:
            cursor.execute(
                """
                INSERT INTO farmers (name, phone, village)
                VALUES (?, ?, ?)
                """,
                (name, phone, village)
            )
            farmer_ids.append(cursor.lastrowid)

        demo_bookings = [
            (farmer_ids[0], "Centre A", "Paddy", 50, "09:00 AM", "KQ-001", "Waiting", "Pending"),
            (farmer_ids[1], "Centre A", "Wheat", 40, "09:15 AM", "KQ-002", "Waiting", "Pending"),
            (farmer_ids[2], "Centre A", "Paddy", 60, "09:30 AM", "KQ-003", "Processing", "Processing"),
            (farmer_ids[3], "Centre B", "Paddy", 45, "09:00 AM", "KQ-004", "Waiting", "Pending"),
            (farmer_ids[4], "Centre B", "Rice", 30, "09:30 AM", "KQ-005", "Called", "Pending"),
            (farmer_ids[5], "Centre C", "Wheat", 55, "10:00 AM", "KQ-006", "Completed", "Paid")
        ]

        cursor.executemany(
            """
            INSERT INTO bookings
            (
                farmer_id,
                centre,
                crop,
                quantity,
                slot,
                token,
                status,
                payment_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            demo_bookings
        )

    return {
        "success": True,
        "message": "Demo data loaded successfully"
    }


# ---------------------------------------------------------
# SERVE FRONTEND
# ---------------------------------------------------------

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

# IMPORTANT:
# API routes are declared above.
# This mount is placed LAST so /api/... continues to work.
app.mount(
    "/",
    StaticFiles(
        directory=FRONTEND_DIR,
        html=True
    ),
    name="frontend"
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)