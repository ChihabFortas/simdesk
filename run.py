"""Start SIM Desk:  python run.py  (or double-click SIM-Desk.exe)  then open http://localhost:8765"""
import os
import socket
import sys
import threading
import webbrowser

import uvicorn

from app.bridge import load_config
from app.server import app

PORT = int(os.environ.get("SIMDESK_PORT", 8765))


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # Windows console
        except Exception:
            pass
    cfg = load_config()
    print("=" * 56)
    print(f"  SIM Desk  —  http://localhost:{PORT}")
    print(f"  Wi-Fi     —  http://{lan_ip()}:{PORT}")
    print(f"  Clé d'accès (GitHub Pages) / مفتاح الدخول :  {cfg['access_key']}")
    print("  Ne fermez pas cette fenêtre / لا تغلق هذه النافذة")
    print("=" * 56)
    if not os.environ.get("SIMDESK_NO_BROWSER"):
        threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    # 0.0.0.0 = other PCs/phones on the shop Wi-Fi can open it too
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
