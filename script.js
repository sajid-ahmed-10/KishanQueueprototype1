// =====================================================
// API CONFIGURATION & AUTO-DETECTION
// =====================================================

// Automatically detect the backend API URL:
// - If served from FastAPI (e.g. http://127.0.0.1:8000), use "/api"
// - If opened via file://, VS Code Live Server (port 5500), Vite, etc., use http://127.0.0.1:8000/api
const API = (() => {
    if (window.location.protocol.startsWith("http") && (window.location.port === "8000" || window.location.port === "")) {
        return "/api";
    }
    return "http://127.0.0.1:8000/api";
})();

let isBackendOnline = false;
let currentOperatorFilter = "active";
let lastQueueJson = "";
let lastOperatorQueueJson = "";
let activeTabId = "farmerTab";


// =====================================================
// TOAST NOTIFICATIONS (Replaces blocking browser alerts)
// =====================================================

function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "❌";

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}


// =====================================================
// BACKEND HEALTH & CONNECTION STATUS
// =====================================================

async function checkBackendHealth(notify = false) {
    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");
    const offlineBanner = document.getElementById("offlineBanner");
    const endpointText = document.getElementById("apiEndpointText");

    if (endpointText) {
        endpointText.textContent = API;
    }

    if (statusDot) statusDot.className = "status-dot connecting";
    if (statusText) statusText.textContent = "Connecting...";

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${API}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            isBackendOnline = true;
            if (statusDot) statusDot.className = "status-dot online";
            if (statusText) statusText.textContent = "System Online";
            if (offlineBanner) offlineBanner.classList.add("hidden");
            if (notify) showToast("Connected to KisanQueue backend!", "success");
            return true;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (err) {
        isBackendOnline = false;
        if (statusDot) statusDot.className = "status-dot offline";
        if (statusText) statusText.textContent = "Backend Offline";
        if (offlineBanner) offlineBanner.classList.remove("hidden");
        if (notify) showToast("Backend is offline. Ensure FastAPI is running on port 8000.", "error");
        return false;
    }
}


// =====================================================
// TAB NAVIGATION
// =====================================================

function showTab(tabId, button) {
    activeTabId = tabId;

    document.querySelectorAll(".tab-content").forEach(section => {
        section.classList.add("hidden");
    });

    const target = document.getElementById(tabId);
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });

    if (button) button.classList.add("active");

    if (tabId === "operatorTab") {
        loadDashboard();
    } else if (tabId === "farmerTab") {
        loadQueue(true);
    }
}


// =====================================================
// FARMER REGISTRATION
// =====================================================

document.getElementById("farmerForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const name = document.getElementById("farmerName").value.trim();
    const phone = document.getElementById("farmerPhone").value.trim();
    const village = document.getElementById("farmerVillage").value.trim();
    const messageEl = document.getElementById("farmerMessage");

    try {
        const response = await fetch(`${API}/farmers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, phone, village })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Registration failed");
        }

        // Store farmer ID and phone for convenience
        try {
            localStorage.setItem("kq_farmer_id", data.farmer_id);
            localStorage.setItem("kq_farmer_phone", phone);
        } catch (e) {}

        messageEl.innerHTML = `
            <div class="success">
                ✅ ${data.message}<br><br>
                <strong>Your Farmer ID:</strong>
                <span style="font-size: 1.2em; font-weight: bold; color: #0d5c3b;">${data.farmer_id}</span>
                <br><br>
                This ID has been automatically placed into the booking form.
            </div>
        `;

        showToast(`Farmer ID: ${data.farmer_id} ready!`, "success");

        const bookingFarmerId = document.getElementById("bookingFarmerId");
        if (bookingFarmerId) bookingFarmerId.value = data.farmer_id;

        const searchPhone = document.getElementById("searchPhone");
        if (searchPhone) searchPhone.value = phone;

        document.getElementById("farmerForm").reset();
    } catch (error) {
        messageEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        showToast(error.message, "error");
    }
});


// =====================================================
// BOOKING
// =====================================================

document.getElementById("bookingForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const farmer_id = Number(document.getElementById("bookingFarmerId").value);
    const centre = document.getElementById("centre").value;
    const crop = document.getElementById("crop").value;
    const quantity = Number(document.getElementById("quantity").value);
    const slot = document.getElementById("slot").value;
    const messageEl = document.getElementById("bookingMessage");

    try {
        const response = await fetch(`${API}/book`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ farmer_id, centre, crop, quantity, slot })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Booking failed");
        }

        messageEl.innerHTML = `
            <div class="success">
                🎫 <strong>Booking Confirmed!</strong><br><br>
                Your Token:
                <div class="big-token">${data.token}</div>
                Booking ID: <strong>${data.booking_id}</strong><br><br>
                Centre: <strong>${centre}</strong> • Slot: <strong>${slot}</strong><br>
                Please arrive at the procurement centre on time.
            </div>
        `;

        showToast(`Booking Confirmed! Token: ${data.token}`, "success");

        // Align live queue centre with booked centre
        const queueCentre = document.getElementById("queueCentre");
        if (queueCentre && queueCentre.value !== centre) {
            queueCentre.value = centre;
        }

        document.getElementById("bookingForm").reset();
        loadQueue(true);
    } catch (error) {
        messageEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        showToast(error.message, "error");
    }
});


// =====================================================
// LIVE QUEUE (FARMER PORTAL)
// =====================================================

async function loadQueue(force = false) {
    const queueCentre = document.getElementById("queueCentre");
    if (!queueCentre) return;

    const centre = queueCentre.value;
    const container = document.getElementById("queue");
    if (!container) return;

    try {
        const response = await fetch(`${API}/queue/${encodeURIComponent(centre)}?status=active`);
        const data = await response.json();

        if (!data.success) {
            throw new Error("Unable to load queue");
        }

        // Avoid re-rendering if data hasn't changed
        const currentJson = JSON.stringify(data.queue);
        if (!force && currentJson === lastQueueJson) {
            return;
        }
        lastQueueJson = currentJson;

        if (data.queue.length === 0) {
            container.innerHTML = `
                <div class="queue-item">
                    <div class="queue-info">
                        <strong>No active farmers in queue for ${centre}</strong>
                        <small>New bookings will appear here in real time.</small>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = data.queue.map((item, index) => {
            const statusLower = item.status ? item.status.toLowerCase() : "waiting";
            return `
                <div class="queue-item">
                    <div>
                        <div class="token">${item.token}</div>
                        <small>Position ${index + 1}</small>
                    </div>
                    <div class="queue-info">
                        <strong>${item.name}</strong>
                        <small>
                            ${item.crop} • ${item.quantity} quintal • Slot: ${item.slot}
                        </small>
                        <br>
                        <small>
                            👥 ${item.people_ahead} ahead • ⏱️ ${item.estimated_wait} min estimated wait
                        </small>
                    </div>
                    <div>
                        <span class="status-badge status-${statusLower}">
                            ${item.status}
                        </span>
                    </div>
                </div>
            `;
        }).join("");
    } catch (error) {
        container.innerHTML = `
            <div class="error">
                ❌ Could not load queue. Make sure the backend server is running.
            </div>
        `;
    }
}


// =====================================================
// OPERATOR DASHBOARD
// =====================================================

async function loadDashboard() {
    const operatorCentre = document.getElementById("operatorCentre");
    if (!operatorCentre) return;

    const centre = operatorCentre.value;

    try {
        const response = await fetch(`${API}/dashboard/${encodeURIComponent(centre)}`);
        const data = await response.json();

        if (!data.success) return;

        document.getElementById("total").textContent = data.total;
        document.getElementById("waiting").textContent = data.waiting;
        document.getElementById("processing").textContent = data.processing;
        document.getElementById("completed").textContent = data.completed;

        document.getElementById("workload").textContent = `${data.workload}%`;
        document.getElementById("workloadBar").style.width = `${data.workload}%`;

        const cropStats = document.getElementById("cropStats");
        if (cropStats) {
            if (data.crop_stats.length === 0) {
                cropStats.innerHTML = `<p style="color: #888; font-size: 13px;">No crop data yet.</p>`;
            } else {
                cropStats.innerHTML = data.crop_stats.map(crop => `
                    <div class="crop-row">
                        <span>🌾 ${crop.crop}</span>
                        <strong>${crop.total} bookings</strong>
                    </div>
                `).join("");
            }
        }

        await loadOperatorQueue();
    } catch (error) {
        console.error("Dashboard error:", error);
    }
}


// =====================================================
// OPERATOR QUEUE (WITH FILTER SUPPORT)
// =====================================================

function setOperatorFilter(filterName, button) {
    currentOperatorFilter = filterName;
    document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
    if (button) button.classList.add("active");
    loadOperatorQueue(true);
}

async function loadOperatorQueue(force = false) {
    const operatorCentre = document.getElementById("operatorCentre");
    if (!operatorCentre) return;

    const centre = operatorCentre.value;
    const container = document.getElementById("operatorQueue");
    if (!container) return;

    try {
        const response = await fetch(
            `${API}/queue/${encodeURIComponent(centre)}?status=${encodeURIComponent(currentOperatorFilter)}`
        );
        const data = await response.json();

        if (!data.success) return;

        const currentJson = JSON.stringify(data.queue);
        if (!force && currentJson === lastOperatorQueueJson) {
            return;
        }
        lastOperatorQueueJson = currentJson;

        if (data.queue.length === 0) {
            container.innerHTML = `
                <div class="queue-item">
                    <div class="queue-info">
                        <strong>No bookings found for "${currentOperatorFilter}" filter.</strong>
                        <small>Switch filters or create a new booking.</small>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = data.queue.map(item => {
            const statusLower = item.status ? item.status.toLowerCase() : "waiting";
            const paymentLower = item.payment_status ? item.payment_status.toLowerCase() : "pending";

            return `
                <div class="queue-item">
                    <div>
                        <div class="token">${item.token}</div>
                        <small>ID: ${item.id}</small>
                    </div>

                    <div class="queue-info">
                        <strong>${item.name} (${item.village})</strong>
                        <small>
                            ${item.crop} • ${item.quantity} quintal • Slot: ${item.slot} • Ph: ${item.phone}
                        </small>
                        <br>
                        <div style="margin-top: 6px; display: flex; gap: 8px; align-items: center;">
                            <span class="status-badge status-${statusLower}">
                                ${item.status}
                            </span>
                            <span class="status-badge status-${paymentLower}">
                                Payment: ${item.payment_status}
                            </span>
                        </div>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px;">
                        ${item.status === "Waiting" ? `
                            <button class="action-btn" onclick="updateStatus(${item.id}, 'Called')">
                                📢 Call
                            </button>
                        ` : ""}

                        ${item.status === "Called" ? `
                            <button class="action-btn" onclick="updateStatus(${item.id}, 'Processing')">
                                ▶ Start
                            </button>
                        ` : ""}

                        ${item.status === "Processing" ? `
                            <button class="action-btn" onclick="updateStatus(${item.id}, 'Completed')">
                                ✅ Complete
                            </button>
                        ` : ""}

                        ${item.status !== "Completed" && item.status !== "Cancelled" ? `
                            <button class="action-btn" onclick="updateStatus(${item.id}, 'Cancelled')" style="color: #9d2525;">
                                ✖ Cancel
                            </button>
                        ` : ""}

                        ${item.status === "Completed" && item.payment_status !== "Paid" ? `
                            <button class="action-btn" onclick="updatePayment(${item.id}, 'Paid')" style="background: #ddf5e3; color: #176335; font-weight: bold;">
                                💰 Mark Paid
                            </button>
                        ` : ""}
                    </div>
                </div>
            `;
        }).join("");
    } catch (error) {
        container.innerHTML = `
            <div class="error">
                ❌ Unable to load operator queue.
            </div>
        `;
    }
}


// =====================================================
// CALL NEXT FARMER
// =====================================================

async function callNext() {
    const centre = document.getElementById("operatorCentre").value;

    try {
        const response = await fetch(`${API}/queue/${encodeURIComponent(centre)}/next`, {
            method: "POST"
        });
        const data = await response.json();

        if (data.success) {
            showToast(`📢 Token ${data.token} called!`, "success");
        } else {
            showToast(`ℹ️ ${data.message}`, "info");
        }

        loadDashboard();
        loadQueue(true);
    } catch (error) {
        showToast("Could not call next farmer.", "error");
    }
}


// =====================================================
// UPDATE STATUS
// =====================================================

async function updateStatus(bookingId, status) {
    try {
        const response = await fetch(`${API}/booking/${bookingId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Update failed");

        showToast(`Status updated to: ${status}`, "success");
        loadDashboard();
        loadQueue(true);
    } catch (error) {
        showToast(error.message, "error");
    }
}


// =====================================================
// UPDATE PAYMENT
// =====================================================

async function updatePayment(bookingId, payment_status) {
    try {
        const response = await fetch(`${API}/booking/${bookingId}/payment`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_status })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Payment update failed");

        showToast("💰 Payment marked as Paid", "success");
        loadDashboard();
    } catch (error) {
        showToast(error.message, "error");
    }
}


// =====================================================
// DEMO DATA RESET
// =====================================================

async function loadDemoData() {
    const confirmed = confirm("Reset database with fresh sample farmers and bookings?");
    if (!confirmed) return;

    try {
        const response = await fetch(`${API}/demo/reset`, { method: "POST" });
        const data = await response.json();

        showToast("⚡ " + data.message, "success");
        loadDashboard();
        loadQueue(true);
    } catch (error) {
        showToast("Could not load demo data.", "error");
    }
}


// =====================================================
// TRACK MY BOOKING (SEARCH BY PHONE)
// =====================================================

document.getElementById("searchForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const phone = document.getElementById("searchPhone").value.trim();
    const result = document.getElementById("farmerResult");

    try {
        const response = await fetch(`${API}/farmer/${encodeURIComponent(phone)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Farmer not found");
        }

        if (data.bookings.length === 0) {
            result.innerHTML = `
                <div class="booking-result">
                    <h3>👨‍🌾 ${data.farmer.name} (${data.farmer.village})</h3>
                    <p style="color: #666; margin-top: 8px;">No bookings found for this mobile number.</p>
                </div>
            `;
            return;
        }

        result.innerHTML = `
            <div class="booking-result">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf1ee; padding-bottom: 12px; margin-bottom: 15px;">
                    <div>
                        <h3 style="font-size: 20px;">👨‍🌾 ${data.farmer.name}</h3>
                        <p style="color: #666; font-size: 13px;">Village: <strong>${data.farmer.village}</strong> • Mobile: <strong>${data.farmer.phone}</strong></p>
                    </div>
                    <span class="badge">Farmer ID: ${data.farmer.id}</span>
                </div>

                <h4 style="margin-bottom: 12px; color: #0d5c3b;">Your Bookings (${data.bookings.length})</h4>

                ${data.bookings.map(item => {
                    const statusLower = item.status ? item.status.toLowerCase() : "waiting";
                    const paymentLower = item.payment_status ? item.payment_status.toLowerCase() : "pending";

                    return `
                        <div class="card" style="margin-bottom: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div class="big-token" style="margin: 0;">${item.token}</div>
                                <div style="display: flex; gap: 8px;">
                                    <span class="status-badge status-${statusLower}">${item.status}</span>
                                    <span class="status-badge status-${paymentLower}">Payment: ${item.payment_status}</span>
                                </div>
                            </div>
                            <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                                <p>🌾 Crop: <strong>${item.crop}</strong></p>
                                <p>📦 Quantity: <strong>${item.quantity} quintal</strong></p>
                                <p>🏢 Centre: <strong>${item.centre}</strong></p>
                                <p>🕘 Slot: <strong>${item.slot}</strong></p>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
        showToast(`Found ${data.bookings.length} booking(s)`, "info");
    } catch (error) {
        result.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        showToast(error.message, "error");
    }
});


// =====================================================
// SMART AUTO-REFRESH (Resource-Saving Polling)
// =====================================================

setInterval(() => {
    // Stop background polling when the browser tab is not visible
    if (document.hidden) return;

    if (activeTabId === "farmerTab") {
        loadQueue();
    } else if (activeTabId === "operatorTab") {
        loadDashboard();
    }
}, 4000);


// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Verify backend health
    await checkBackendHealth();

    // 2. Pre-fill stored farmer details if available
    try {
        const savedId = localStorage.getItem("kq_farmer_id");
        const savedPhone = localStorage.getItem("kq_farmer_phone");

        if (savedId) {
            const idInput = document.getElementById("bookingFarmerId");
            if (idInput && !idInput.value) idInput.value = savedId;
        }

        if (savedPhone) {
            const phoneInput = document.getElementById("searchPhone");
            if (phoneInput && !phoneInput.value) phoneInput.value = savedPhone;
        }
    } catch (e) {}

    // 3. Initial Queue Load
    loadQueue(true);
});

// Run immediate health check and load in case DOM is already parsed
checkBackendHealth();
loadQueue(true);