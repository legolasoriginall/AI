"""تست CLI خط فرمان و استریم: با ابزارها."""
from __future__ import annotations

import json

import agent
import cli
import providers


def test_cli_oneshot_streams_answer(capsys, monkeypatch):
    def fake_turn(history, settings, max_steps=None):
        yield {"type": "token", "text": "سلام "}
        yield {"type": "token", "text": "دنیا"}
        yield {"type": "final"}

    monkeypatch.setattr(agent, "stream_turn", fake_turn)
    assert cli.main(["-m", "سلام"]) == 0
    out = capsys.readouterr().out
    assert "سلام دنیا" in out


def test_cli_loads_dotenv(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("CLI_TEST_KEY=secret\n# comment\nEMPTY=\n", encoding="utf-8")
    monkeypatch.delenv("CLI_TEST_KEY", raising=False)
    cli.load_env(env_file)
    assert __import__("os").environ["CLI_TEST_KEY"] == "secret"


def test_stream_turn_streams_prose(monkeypatch):
    class FakeBrain:
        def __init__(self, settings):
            pass

        def stream_chat(self, messages, system=""):
            yield "یک "
            yield "پاسخ"

    monkeypatch.setattr(agent, "Brain", FakeBrain)
    events = list(agent.stream_turn([{"role": "user", "content": "سلام"}], {}))
    assert "".join(e["text"] for e in events if e["type"] == "token") == "یک پاسخ"
    assert events[-1]["type"] == "final"


def test_stream_turn_hides_tool_json(monkeypatch):
    calls = {"n": 0}

    class ToolBrain:
        def __init__(self, settings):
            pass

        def stream_chat(self, messages, system=""):
            calls["n"] += 1
            if calls["n"] == 1:
                yield "```json\n"
                yield '{"tool": "list_files", "args": {"path": "."}}'
                yield "\n```"
            else:
                yield "تمام شد."

    monkeypatch.setattr(agent, "Brain", ToolBrain)
    events = list(agent.stream_turn([{"role": "user", "content": "فایل‌ها"}], {}))
    tokens = "".join(e["text"] for e in events if e["type"] == "token")
    assert '"tool"' not in tokens
    assert any(e["type"] == "tool_call" for e in events)
    assert tokens.strip().endswith("تمام شد.")


class FakeStreamResponse:
    def __init__(self, lines):
        self.lines = lines

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def raise_for_status(self):
        return None

    def iter_lines(self, decode_unicode=False):
        return iter(self.lines)


def test_openai_stream_parses_sse(monkeypatch):
    lines = [
        'data: {"choices":[{"delta":{"content":"سلام"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":" دنیا"}}]}',
        "data: [DONE]",
    ]
    monkeypatch.setattr(providers.requests, "post", lambda *a, **k: FakeStreamResponse(lines))
    brain = providers.Brain({"provider": "openai", "openai_api_key": "k"})
    assert "".join(brain.stream_chat([{"role": "user", "content": "x"}])) == "سلام دنیا"


def test_ollama_stream_parses_ndjson(monkeypatch):
    lines = [
        json.dumps({"message": {"role": "assistant", "content": "سلام"}}),
        json.dumps({"message": {"role": "assistant", "content": "!"}}),
        json.dumps({"done": True}),
    ]
    monkeypatch.setattr(providers, "ollama_models", lambda url: ["qwen2.5:3b"])
    monkeypatch.setattr(providers.requests, "post", lambda *a, **k: FakeStreamResponse(lines))
    brain = providers.Brain({"provider": "ollama", "ollama_url": "http://example.invalid"})
    assert "".join(brain.stream_chat([{"role": "user", "content": "x"}])) == "سلام!"
