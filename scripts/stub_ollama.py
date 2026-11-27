#!/usr/bin/env python3
"""Ollama جعلی برای تست دود CLI: فقط همان مسیرهایی که پروژه صدا می‌زند.

استفاده: python3 scripts/stub_ollama.py [PORT]
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELS = ["qwen2.5:3b"]
CHUNKS = ["سلام ", "از ", "مدل محلی"]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _chunked(self, lines) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        for line in lines:
            data = (json.dumps(line) + "\n").encode()
            self.wfile.write(f"{len(data):X}\r\n".encode() + data + b"\r\n")
            self.wfile.flush()
        self.wfile.write(b"0\r\n\r\n")

    def do_GET(self):
        if self.path.startswith("/api/tags"):
            return self._json(
                {
                    "models": [
                        {"name": name, "size": 2_000_000_000, "details": {"parameter_size": "3B"}}
                        for name in MODELS
                    ]
                }
            )
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")
        if self.path.startswith("/api/pull"):
            return self._chunked([{"status": "pulling manifest"}, {"status": "success"}])
        if self.path.startswith("/api/chat"):
            if payload.get("model") not in MODELS:
                return self._json({"error": "model not found"}, 404)
            if payload.get("stream"):
                return self._chunked(
                    [{"message": {"role": "assistant", "content": part}} for part in CHUNKS]
                )
            return self._json(
                {"message": {"role": "assistant", "content": "".join(CHUNKS)}}
            )
        return self._json({"error": "not found"}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 11500
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
