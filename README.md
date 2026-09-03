# 🌾 KisanQueue | Smart Farmer Procurement Queue System

A high-performance queue management system designed to streamline agricultural procurement centres, eliminate unorganized waiting lines for farmers, and give operators real-time workload and payment tracking.

---

## 🚀 Quick Start (1-Click Run)

### Option 1: Using the launcher script
Double-click `start.bat` or run in terminal:
```powershell
python run.py
```
This starts the FastAPI backend on `http://127.0.0.1:8000` and automatically opens the user interface in your default browser.

### Option 2: Running directly with uvicorn
```powershell
cd backend
python -m uvicorn main:app --reload --port 8000
```
Then visit [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

---

## 🌟 Features

### 👨‍🌾 Farmer Portal
- **Registration**: Register farmer profile (Name, Mobile, Village). Auto-populates booking form.
- **Smart Booking**: Select Procurement Centre, Crop type, Quantity (in Quintals), and Preferred Time Slot. Generates a unique monotonic digital token (`KQ-001`, etc.).
- **Live Queue**: Real-time queue tracker showing position, people ahead, estimated wait time, and live status.

### 🧑‍💼 Operator Dashboard
- **Centre Metrics**: Live counts of Waiting, Processing, and Completed farmers, plus Centre Workload percentage meter.
- **Crop Distribution**: Visual statistics of crops registered at the centre.
- **Queue Control**:
  - 📢 **Call**: Move next farmer from *Waiting* to *Called*.
  - ▶ **Start**: Transition farmer to *Processing*.
  - ✅ **Complete**: Mark processing completed.
  - 💰 **Mark Paid**: Update farmer payment status to *Paid*.
  - ✖ **Cancel**: Cancel a booking.
- **Queue Filters**: Filter between **Active Queue**, **Completed / Payments**, and **All Bookings**.
- **Demo Data Generator**: Seed sample data with one click.

### 🔎 Farmer Tracking ("My Booking")
- Search by mobile number to see all past and current bookings, status, and payment records.

---

## ⚡ Architectural Improvements & Efficiency

1. **Auto-Detecting Frontend Connection**:
   - The frontend automatically detects its host environment. Whether served directly by FastAPI (`http://127.0.0.1:8000`), VS Code Live Server (`http://127.0.0.1:5500`), or opened via `file://`, requests automatically route to `http://127.0.0.1:8000/api`.
2. **Real-time Backend Status Indicator**:
   - The top navigation bar monitors connection health (`/api/health`), showing **System Online (Green)** or **Backend Offline (Red)** with a one-click reconnect trigger and actionable guidance.
3. **Database Concurrency (SQLite WAL Mode)**:
   - Enabled Write-Ahead Logging (`WAL`), 5000ms busy timeout, and B-Tree indexes on `phone`, `status`, and `farmer_id` for instant, non-blocking concurrent reads and writes.
4. **Non-Blocking Toast System**:
   - Replaced disruptive browser `alert()` popups with modern animated toast notifications.
5. **Smart Resource-Saving Polling**:
   - Automatically pauses background network requests when the browser tab is hidden or minimized (`document.hidden`), and only polls the active tab.

---

## 📁 Project Structure

```
├── backend/
│   ├── database.py         # SQLite WAL connection, migrations, and index definitions
│   ├── kisanqueue.db       # Database file
│   ├── main.py             # FastAPI REST endpoints and frontend static mount
│   └── requirements.txt    # Python dependencies (fastapi, uvicorn, pydantic)
├── frontend/
│   ├── index.html          # Responsive single-page interface
│   ├── script.js           # Dynamic API connector, polling, and state management
│   └── style.css           # Modern styles, status badges, toast notifications
├── run.py                  # Root launcher with automatic browser opening
├── start.bat               # Windows 1-click batch launcher
└── README.md               # Documentation
```
