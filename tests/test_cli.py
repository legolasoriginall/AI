"""تست CLI خط فرمان و استریم: با ابزارها."""
from __future__ import annotations

import json

import agent
import cli
import providers
import store


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


def test_system_file_replaces_prompt(tmp_path, monkeypatch):
    prompt_file = tmp_path / "prompt.md"
    prompt_file.write_text("تو یک دستیار تستی هستی.", encoding="utf-8")
    seen = {}

    def fake_turn(history, settings, max_steps=None):
        seen["prompt"] = settings.get("system_prompt")
        yield {"type": "final"}

    monkeypatch.setattr(agent, "stream_turn", fake_turn)
    assert cli.main(["-m", "سلام", "--system-file", str(prompt_file)]) == 0
    assert seen["prompt"] == "تو یک دستیار تستی هستی."
    assert store.load_settings()["system_prompt"] == "تو یک دستیار تستی هستی."


def test_system_file_missing_fails_without_changing_prompt(tmp_path, capsys):
    before = store.load_settings()["system_prompt"]
    assert cli.main(["-m", "سلام", "--system-file", str(tmp_path / "nope.md")]) == 1
    assert "پیدا نشد" in capsys.readouterr().out
    assert store.load_settings()["system_prompt"] == before


def test_system_command_reads_prompt_file(tmp_path, capsys):
    prompt_file = tmp_path / "prompt.txt"
    prompt_file.write_text("فقط فارسی جواب بده.", encoding="utf-8")
    keep_going, session_id = cli._handle_command(f"/system {prompt_file}", "sid")
    assert keep_going is True and session_id == "sid"
    assert store.load_settings()["system_prompt"] == "فقط فارسی جواب بده."
    assert "تنظیم شد" in capsys.readouterr().out

    cli._handle_command("/system", "sid")
    assert "فقط فارسی جواب بده." in capsys.readouterr().out


def test_json_mode_emits_ndjson(monkeypatch, capsys):
    def fake_turn(history, settings, max_steps=None):
        yield {"type": "token", "text": "سلام"}
        yield {"type": "tool_call", "tool": "list_files", "args": {"path": "."}}
        yield {"type": "tool_result", "tool": "list_files", "result": "ok"}
        yield {"type": "final"}

    monkeypatch.setattr(agent, "stream_turn", fake_turn)
    assert cli.main(["-m", "سلام", "--json"]) == 0
    out = capsys.readouterr().out
    events = [json.loads(line) for line in out.splitlines() if line.strip()]
    assert [event["type"] for event in events] == ["token", "tool_call", "tool_result", "final"]
    assert "\x1b[" not in out


def test_json_mode_reads_stdin_lines(tmp_path, monkeypatch, capsys):
    def fake_turn(history, settings, max_steps=None):
        yield {"type": "token", "text": history[-1]["content"]}
        yield {"type": "final"}

    monkeypatch.setattr(agent, "stream_turn", fake_turn)
    monkeypatch.setattr("sys.stdin", __import__("io").StringIO("یک\nدو\n"))
    assert cli.main(["--json"]) == 0
    events = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line]
    assert [event.get("text") for event in events if event["type"] == "token"] == ["یک", "دو"]


def test_json_mode_routes_slash_commands(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin", __import__("io").StringIO("/model\n"))
    assert cli.main(["--json"]) == 0
    payloads = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line]
    assert payloads == [{"type": "model", "provider": "auto", "model": None}]


def test_tools_command_lists_tool_specs(capsys):
    keep_going, _ = cli._handle_command("/tools", "sid")
    assert keep_going is True
    out = capsys.readouterr().out
    assert "read_file" in out and "run_command" in out
    assert "خواندن کامل فایل" in out


def test_remember_command_stores_and_lists(capsys):
    cli._handle_command("/remember شهر=تهران", "sid")
    assert "ثبت شد" in capsys.readouterr().out
    assert store.search_facts("شهر")[0]["value"] == "تهران"

    cli._handle_command("/remember", "sid")
    assert "تهران" in capsys.readouterr().out


def test_model_command_switches_provider_and_model(capsys, ollama):
    cli._handle_command("/model groq", "sid")
    assert store.load_settings()["provider"] == "groq"

    cli._handle_command("/model llama3.2:3b", "sid")
    settings = store.load_settings()
    assert settings["provider"] == "ollama"
    assert settings["ollama_model"] == "llama3.2:3b"

    cli._handle_command("/model", "sid")
    assert "llama3.2:3b" in capsys.readouterr().out


def test_model_command_json_output(capsys):
    cli._handle_command("/model", "sid", True)
    payload = json.loads(capsys.readouterr().out)
    assert payload["type"] == "model"
    assert payload["provider"] == "auto"


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
