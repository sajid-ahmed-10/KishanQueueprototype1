import os
import sys
import threading
import time
import webbrowser

# Add backend directory to module search path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

def open_browser():
    time.sleep(1.2)
    url = "http://127.0.0.1:8000"
    print(f"\n[KisanQueue] Opening web application at {url} ...\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass

if __name__ == "__main__":
    import uvicorn

    print("=" * 60)
    print("🌾 KisanQueue - Smart Farmer Procurement System")
    print("Starting FastAPI Backend at http://127.0.0.1:8000")
    print("API Documentation: http://127.0.0.1:8000/docs")
    print("=" * 60)

    # Launch browser automatically in background thread
    threading.Thread(target=open_browser, daemon=True).start()

    os.chdir(backend_dir)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
