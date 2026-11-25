"""تست استریم SSE چت: رویدادها، ذخیرهٔ تاریخچه و مسیر خطا."""
from __future__ import annotations

import providers
import server
import store


def test_chat_streams_deltas_and_saves_history(client, monkeypatch, parse_sse):
    def fake_run(history, settings, max_steps=None):
        yield {"type": "delta", "text": "سلام "}
        yield {"type": "delta", "text": "دنیا"}

    monkeypatch.setattr(server.agent, "run_turn", fake_run)
    res = client.post("/api/chat", json={"message": "سلام"})
    assert res.status_code == 200
    assert res.mimetype == "text/event-stream"

    events = parse_sse(res.data)
    assert events[0] == {"type": "delta", "text": "سلام "}
    assert events[-1]["type"] == "end"

    history = store.get_history(events[-1]["chat_id"])
    assert [message["role"] for message in history] == ["user", "assistant"]
    assert history[0]["content"] == "سلام"
    assert history[1]["content"] == "سلام دنیا"


def test_chat_rejects_empty_message(client):
    res = client.post("/api/chat", json={"message": "   "})
    assert res.status_code == 400


def test_chat_reports_provider_error(client, monkeypatch, parse_sse):
    def boom(history, settings, max_steps=None):
        raise providers.ProviderError("هیچ مدلی پاسخ نداد")
        yield  # pragma: no cover - فقط برای اینکه مولد باشد

    monkeypatch.setattr(server.agent, "run_turn", boom)
    events = parse_sse(client.post("/api/chat", json={"message": "سلام"}).data)
    assert events[0]["type"] == "error"
    assert "هیچ مدلی پاسخ نداد" in events[0]["message"]
    assert events[-1]["type"] == "end"


def test_chat_saves_only_nonempty_answer(client, monkeypatch, parse_sse):
    def empty(history, settings, max_steps=None):
        yield {"type": "delta", "text": "   "}

    monkeypatch.setattr(server.agent, "run_turn", empty)
    events = parse_sse(client.post("/api/chat", json={"message": "سلام"}).data)
    history = store.get_history(events[-1]["chat_id"])
    assert [message["role"] for message in history] == ["user"]


def test_chat_passes_message_to_agent(client, monkeypatch):
    seen = {}

    def recording(history, settings, max_steps=None):
        seen["history"] = list(history)
        seen["provider"] = settings.get("provider")
        yield {"type": "delta", "text": "باشه"}

    store.save_settings({"provider": "ollama", "ollama_model": "llama3.2:3b"})
    monkeypatch.setattr(server.agent, "run_turn", recording)
    res = client.post("/api/chat", json={"message": "فایل بساز"})
    assert res.data
    assert seen["history"][-1] == {"role": "user", "content": "فایل بساز"}
    assert seen["provider"] == "ollama"
