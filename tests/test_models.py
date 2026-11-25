"""تست مدیر مدل‌ها: فهرست، انتخاب مدل، وضعیت مدل گمشده و استریم SSE نصب."""
from __future__ import annotations

import server
import store
from providers import MODEL_CATALOG


def test_models_lists_installed_and_catalog(client, ollama):
    data = client.get("/api/models").get_json()
    assert data["ollama_ready"] is True
    assert [model["name"] for model in data["installed"]] == ["llama3.2:3b"]
    assert [model["id"] for model in data["catalog"]] == [model["id"] for model in MODEL_CATALOG]


def test_use_model_persists_choice(client, ollama):
    res = client.post("/api/models/use", json={"model": "llama3.2:3b"})
    assert res.status_code == 200
    assert store.load_settings()["ollama_model"] == "llama3.2:3b"

    # کلاینت تازه همان فایل تنظیمات را می‌خواند؛ یعنی انتخاب بعد از بازکردن دوباره می‌ماند.
    fresh = server.app.test_client()
    status = fresh.get("/api/status").get_json()
    assert status["ollama_model"] == "llama3.2:3b"
    assert status["active_model"] == "llama3.2:3b"
    assert status["ollama_model_missing"] is False


def test_use_model_rejects_model_not_installed(client, ollama):
    ollama.tags = ["gemma2:2b"]
    res = client.post("/api/models/use", json={"model": "llama3.2:3b"})
    assert res.status_code == 404
    assert "نصب نیست" in res.get_json()["error"]


def test_use_model_rejects_invalid_name(client, ollama):
    res = client.post("/api/models/use", json={"model": "bad name!"})
    assert res.status_code == 400


def test_status_flags_missing_active_model(client, ollama):
    store.save_settings({"ollama_model": "ghost:1b"})
    data = client.get("/api/status").get_json()
    assert data["active_model"] == "ghost:1b"
    assert data["ollama_model"] == "ghost:1b"
    assert data["ollama_model_missing"] is True


def test_status_does_not_flag_installed_model(client, ollama):
    store.save_settings({"ollama_model": "llama3.2:3b"})
    data = client.get("/api/status").get_json()
    assert data["ollama_model_missing"] is False


def test_pull_streams_progress_and_done(client, ollama, parse_sse):
    res = client.post("/api/models/pull", json={"model": "llama3.2:3b"})
    assert res.status_code == 200
    assert res.mimetype == "text/event-stream"

    events = parse_sse(res.data)
    assert [event["type"] for event in events] == ["progress"] * 4 + ["done"]
    assert [event["percent"] for event in events if event["type"] == "progress"] == [0, 25, 100, 0]
    assert events[-1]["model"] == "llama3.2:3b"
    assert events[-1]["installed"] == ["llama3.2:3b"]
    assert ollama.pull_requests == 1


def test_pull_rejects_invalid_name(client, ollama):
    res = client.post("/api/models/pull", json={"model": "bad name!"})
    assert res.status_code == 400
    assert ollama.pull_requests == 0


def test_pull_reports_upstream_error(client, ollama, parse_sse):
    ollama.pull_plan = [{"error": "disk full"}]
    events = parse_sse(client.post("/api/models/pull", json={"model": "llama3.2:3b"}).data)
    assert events[0]["type"] == "error"
    assert "disk full" in events[0]["message"]
    assert all(event["type"] != "done" for event in events)


def test_pull_closes_upstream_when_client_disconnects(client, monkeypatch):
    closed = []

    def fake_pull(base, name):
        try:
            yield {"status": "downloading", "completed": 1, "total": 100}
            yield {"status": "downloading", "completed": 2, "total": 100}
        finally:
            closed.append(name)

    monkeypatch.setattr(server, "ollama_pull", fake_pull)
    res = client.post("/api/models/pull", json={"model": "llama3.2:3b"}, buffered=False)
    iterator = res.response
    first = next(iterator)
    assert b"progress" in first
    res.close()
    assert closed == ["llama3.2:3b"]
