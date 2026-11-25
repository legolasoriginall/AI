"""تست‌های اسکریپت تونل Ollama: نحو، dry-run، ساخت OLLAMA_ORIGINS و راهنما."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "ollama_tunnel.sh"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="bash در دسترس نیست")


def run_script(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(SCRIPT), *args],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=ROOT,
    )


def test_script_exists_and_is_valid_bash():
    assert SCRIPT.is_file()
    result = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


def test_dry_run_needs_no_installed_tools():
    result = run_script("--dry-run")
    assert result.returncode == 0, result.stderr
    assert "OLLAMA_ORIGINS=https://legolasoriginall.github.io" in result.stdout
    assert "http://127.0.0.1:3000" in result.stdout
    assert "ollama serve" in result.stdout
    assert "cloudflared tunnel --url http://127.0.0.1:11434" in result.stdout


def test_dry_run_respects_port_and_extra_origin():
    result = run_script("--dry-run", "--port", "12345", "--origin", "https://example.dev")
    assert result.returncode == 0, result.stderr
    assert "cloudflared tunnel --url http://127.0.0.1:12345" in result.stdout
    assert "OLLAMA_ORIGINS=" in result.stdout
    origins = result.stdout.split("OLLAMA_ORIGINS=", 1)[1].split("\n", 1)[0]
    assert "https://example.dev" in origins.split(",")
    assert origins.startswith("https://legolasoriginall.github.io")


def test_dry_run_accepts_env_overrides():
    result = subprocess.run(
        ["bash", str(SCRIPT), "--dry-run"],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=ROOT,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "PORT": "11500", "PAGES_ORIGIN": "https://demo.example"},
    )
    assert result.returncode == 0, result.stderr
    assert "OLLAMA_ORIGINS=https://demo.example" in result.stdout
    assert "http://127.0.0.1:11500" in result.stdout


def test_invalid_port_is_rejected():
    result = run_script("--dry-run", "--port", "abc")
    assert result.returncode == 2
    assert "پورت" in result.stderr


def test_unknown_flag_is_rejected():
    result = run_script("--nope")
    assert result.returncode == 2
    assert "ناشناخته" in result.stderr


def test_help_mentions_options():
    result = run_script("--help")
    assert result.returncode == 0
    for needle in ("--port", "--origin", "--dry-run"):
        assert needle in result.stdout


def test_script_never_kills_processes_by_name():
    text = SCRIPT.read_text(encoding="utf-8")
    for pattern in ("pkill", "killall", "pgrep"):
        assert pattern not in text
