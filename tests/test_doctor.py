"""تست کوتاه scripts/doctor.py: پارس .env، خطای نوشتن و خروجی JSON."""
from __future__ import annotations

import json

from scripts import doctor


def test_read_env_file_parses_values(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "OLLAMA_URL=http://127.0.0.1:9\n# comment\nQUOTED='x'\nEMPTY=\n", encoding="utf-8"
    )
    values = doctor.read_env_file(env_file)
    assert values == {"OLLAMA_URL": "http://127.0.0.1:9", "QUOTED": "x", "EMPTY": ""}


def test_missing_env_file_is_a_warning(tmp_path):
    check = doctor.check_env_file(tmp_path / ".env", None)
    assert check["status"] == "warn"
    assert "cp .env.example" in check["fix"]


def test_data_dir_reports_fix_when_write_fails(tmp_path):
    target = tmp_path / "data"
    target.write_text("not a directory", encoding="utf-8")
    check = doctor.check_data_dir(target)
    assert check["status"] == "fail"
    assert "mkdir -p" in check["fix"]


def test_json_mode_reports_every_check(tmp_path, monkeypatch, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text("OLLAMA_URL=http://127.0.0.1:9\n", encoding="utf-8")

    def refuse(url, timeout=3.0):
        raise OSError("connection refused")

    monkeypatch.setattr(doctor, "http_tags", refuse)
    code = doctor.main(
        [
            "--json",
            "--env-file",
            str(env_file),
            "--data-dir",
            str(tmp_path / "data"),
            "--timeout",
            "0.2",
        ]
    )
    report = json.loads(capsys.readouterr().out)
    assert code == 1
    names = [check["name"] for check in report["checks"]]
    assert names == ["python", "venv", "dependencies", "env", "port", "ollama", "data"]
    failed = [check for check in report["checks"] if check["status"] == "fail"]
    assert failed and all(check["fix"] for check in failed)
    assert report["summary"]["fail"] == len(failed)
    assert report["ollama_url"] == "http://127.0.0.1:9"


def test_ollama_check_lists_models(monkeypatch):
    monkeypatch.setattr(
        doctor, "http_tags", lambda url, timeout=3.0: {"models": [{"name": "qwen2.5:3b"}]}
    )
    check = doctor.check_ollama("http://example.invalid")
    assert check["status"] == "ok"
    assert "qwen2.5:3b" in check["detail"]


def test_ollama_check_without_models_warns(monkeypatch):
    monkeypatch.setattr(doctor, "http_tags", lambda url, timeout=3.0: {"models": []})
    check = doctor.check_ollama("http://example.invalid")
    assert check["status"] == "warn"
    assert "ollama pull" in check["fix"]
