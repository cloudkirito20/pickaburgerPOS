import json
import os
import socket
import psycopg2
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"

DATABASE_URL = os.environ.get("DATABASE_URL")

DEFAULT_DATA = {
    "inventory": [],
    "menu": [],
    "rawDeliveries": [],
    "orders": [],
    "users": [
        {
            "id": "default-admin",
            "fullName": "Default Administrator",
            "username": "admin",
            "password": "admin123",
            "role": "admin",
            "status": "approved"
        },
        {
            "id": "default-cashier",
            "fullName": "Default Cashier",
            "username": "cashier",
            "password": "cashier123",
            "role": "cashier",
            "status": "approved"
        }
    ],
    "monthlyInventoryCounts": [],
    "settings": {
        "buildBurgerBasePrice": 50
    }
}


def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set.")
    return psycopg2.connect(DATABASE_URL)


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_data (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            json_data TEXT NOT NULL
        )
    """)

    cur.execute("SELECT json_data FROM app_data WHERE id = 1")
    row = cur.fetchone()

    if row is None:
        cur.execute(
            "INSERT INTO app_data (id, json_data) VALUES (1, %s)",
            (json.dumps(DEFAULT_DATA),)
        )

    conn.commit()
    cur.close()
    conn.close()


def get_data():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT json_data FROM app_data WHERE id = 1")
    row = cur.fetchone()

    cur.close()
    conn.close()

    return json.loads(row[0]) if row else DEFAULT_DATA


def save_data(data):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO app_data (id, json_data)
        VALUES (1, %s)
        ON CONFLICT (id)
        DO UPDATE SET json_data = EXCLUDED.json_data
    """, (json.dumps(data),))

    conn.commit()
    cur.close()
    conn.close()


class POSHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, format, *args):
        return

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/database":
            return self._send_json({"data": get_data()})

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/database":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8")
                payload = json.loads(raw) if raw else {}
                data = payload.get("data", DEFAULT_DATA)

                save_data(data)

                return self._send_json({"ok": True})

            except Exception as e:
                return self._send_json({"error": str(e)}, 500)

        return self._send_json({"error": "Not found"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def get_local_network_urls(port):
    ips = []

    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ip = probe.getsockname()[0]
        probe.close()

        if ip and not ip.startswith("127."):
            ips.append(ip)

    except Exception:
        pass

    try:
        hostname = socket.gethostname()

        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]

            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)

    except Exception:
        pass

    return [f"http://{ip}:{port}" for ip in ips]


def open_laptop_browser(port):
    try:
        import threading
        import time
        import webbrowser

        def _open():
            time.sleep(1.5)
            webbrowser.open(f"http://localhost:{port}")

        threading.Thread(target=_open, daemon=True).start()

    except Exception:
        pass


if __name__ == "__main__":
    init_db()

    host = "0.0.0.0"
    port = int(os.environ.get("PORT", 8080))

    laptop_url = f"http://localhost:{port}"
    phone_urls = get_local_network_urls(port)

    print("============================================================")
    print(" Pick'a Burger POS Server is running")
    print("============================================================")
    print("Database: PostgreSQL")
    print("")
    print("LAPTOP URL:")
    print(f"  {laptop_url}")
    print("")
    print("IPHONE / IPAD URL:")
    if phone_urls:
        for url in phone_urls:
            print(f"  {url}")
    else:
        print("  No local network IP was detected automatically.")
    print("============================================================")
    print("")

    open_laptop_browser(port)

    ThreadingHTTPServer((host, port), POSHandler).serve_forever()
