"""ابزارهای مشترک تست‌ها: دادهٔ جداشده، کلاینت Flask و یک Ollama جعلی.

هیچ تستی به شبکهٔ بیرونی یا Ollama واقعی نیاز ندارد: همهٔ درخواست‌ها به یک
سرور محلی می‌رود که فقط همان مسیرهایی را دارد که برنامه صدا می‌زند.
"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# دیتابیس و تنظیمات تست‌ها در پوشهٔ موقت ساخته می‌شوند تا دادهٔ واقعی دست نخورد.
TMP = Path(tempfile.mkdtemp(prefix="assistant-tests-"))

import store  # noqa: E402

store.DATA_DIR = TMP
store.DB_PATH = TMP / "assistant.db"
store.SETTINGS_PATH = TMP / "settings.json"
store.init_db()

import server  # noqa: E402

DEFAULT_PULL_PLAN = [
    {"status": "pulling manifest"},
    {"status": "downloading", "completed": 25, "total": 100},
    {"status": "downloading", "completed": 100, "total": 100},
    {"status": "success"},
]


class FakeOllama:
    """Ollama جعلی روی یک پورت آزاد با NDJSON استریم برای pull."""

    def __init__(self) -> None:
        self.tags = ["llama3.2:3b"]
        self.pull_plan = list(DEFAULT_PULL_PLAN)
        self.pull_status = 200
        self.chat_status = 200
        self.pull_requests = 0
        self.disconnected = False
        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self.port = self._httpd.server_address[1]
        self.url = f"http://127.0.0.1:{self.port}"
        threading.Thread(target=self._httpd.serve_forever, daemon=True).start()

    def stop(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()

    def _handler(self):
        fake = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args):
                pass

            def _json(self, payload, status=200):
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path.startswith("/api/tags"):
                    return self._json(
                        {
                            "models": [
                                {
                                    "name": name,
                                    "size": 2_000_000_000,
                                    "details": {"parameter_size": "3B"},
                                }
                                for name in fake.tags
                            ]
                        }
                    )
                return self._json({"error": "not found"}, 404)

            def do_DELETE(self):
                length = int(self.headers.get("Content-Length") or 0)
                payload = json.loads(self.rfile.read(length) or b"{}")
                if payload.get("model") in fake.tags:
                    fake.tags.remove(payload["model"])
                    return self._json({"status": "success"})
                return self._json({"error": "not found"}, 404)

            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                payload = json.loads(self.rfile.read(length) or b"{}")
                if self.path.startswith("/api/pull"):
                    fake.pull_requests += 1
                    if fake.pull_status != 200:
                        return self._json({"error": "pull failed"}, fake.pull_status)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/x-ndjson")
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
                    try:
                        for event in fake.pull_plan:
                            line = (json.dumps(event) + "\n").encode()
                            self.wfile.write(f"{len(line):X}\r\n".encode() + line + b"\r\n")
                            self.wfile.flush()
                        self.wfile.write(b"0\r\n\r\n")
                    except (BrokenPipeError, ConnectionResetError):
                        fake.disconnected = True
                    return
                if self.path.startswith("/api/chat"):
                    if fake.chat_status != 200:
                        return self._json({"error": "boom"}, fake.chat_status)
                    if payload.get("model") not in fake.tags:
                        return self._json({"error": "model not found"}, 404)
                    return self._json(
                        {"message": {"role": "assistant", "content": "سلام از مدل جعلی"}}
                    )
                return self._json({"error": "not found"}, 404)

        return Handler


@pytest.fixture(autouse=True)
def clean_settings():
    """هر تست با تنظیمات پیش‌فرض شروع می‌شود و فایل تنظیمات را جا نمی‌گذارد."""
    store.SETTINGS_PATH.unlink(missing_ok=True)
    yield
    store.SETTINGS_PATH.unlink(missing_ok=True)


@pytest.fixture
def client():
    server.app.config.update(TESTING=True)
    return server.app.test_client()


@pytest.fixture
def ollama():
    fake = FakeOllama()
    store.save_settings({"ollama_url": fake.url})
    yield fake
    fake.stop()


@pytest.fixture
def parse_sse():
    def parse(payload: bytes):
        events = []
        for frame in payload.decode("utf-8").split("\n\n"):
            for line in frame.splitlines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
        return events

    return parse
