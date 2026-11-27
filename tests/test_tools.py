"""تست ابزارهای مدل و مسیرها (بدون مسدودسازی دستور)."""
from __future__ import annotations

import pytest

import store
import tools


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    path = (tmp_path / "workspace").resolve()
    path.mkdir()
    monkeypatch.setattr(tools, "WORKSPACE", path)
    return path


def test_safe_path_blocks_traversal(workspace):
    with pytest.raises(ValueError):
        tools.safe_path("../outside.txt")


def test_absolute_path_is_remapped_inside_workspace(workspace):
    # مسیر مطلق نباید به ریشهٔ سیستم برسد؛ داخل workspace بازنویسی می‌شود.
    assert tools.safe_path("/etc/passwd") == workspace / "etc" / "passwd"


def test_run_command_accepts_pipes(workspace):
    result = tools.run_command("echo hello | tr a-z A-Z")
    assert "HELLO" in result


def test_run_command_executes_inside_workspace(workspace):
    result = tools.run_command("pwd")
    assert str(workspace) in result


def test_write_and_read_roundtrip(workspace):
    assert "نوشته شد" in tools.write_file("notes/today.txt", "سلام")
    assert tools.read_file("notes/today.txt") == "سلام"
    assert "پیدا نشد" in tools.read_file("notes/missing.txt")


def test_write_file_cannot_escape_workspace(workspace):
    result = tools.write_file("../escape.txt", "x")
    assert "مجاز نیست" in result
    assert not (workspace.parent / "escape.txt").exists()


def test_list_files_hides_ignored_directories(workspace):
    (workspace / "visible.txt").write_text("x", encoding="utf-8")
    (workspace / "__pycache__").mkdir()
    (workspace / "__pycache__" / "junk.pyc").write_bytes(b"x")
    listing = tools.list_files(".")
    assert "visible.txt" in listing
    assert "__pycache__" not in listing


def test_unknown_tool_and_bad_arguments(workspace):
    assert "ناشناخته" in tools.run_tool("nope", {})
    assert tools.run_tool("read_file", {"nope": 1}).startswith("آرگومان")


def test_install_model_rejects_invalid_name(workspace):
    assert "مجاز نیست" in tools.install_model("bad name!")


def test_install_model_rejects_name_outside_catalog(workspace):
    assert "فهرست پیشنهادی" in tools.install_model("evil/model")


def test_use_model_requires_installed_model(workspace, ollama):
    assert "نصب نیست" in tools.use_model("gemma2:2b")


def test_use_model_saves_choice(workspace, ollama):
    assert "تنظیم شد" in tools.use_model("llama3.2:3b")
    assert store.load_settings()["ollama_model"] == "llama3.2:3b"


def test_install_model_requires_success_status(workspace, ollama):
    ollama.pull_plan = [{"status": "downloading", "completed": 1, "total": 100}]
    result = tools.install_model("llama3.2:3b")
    assert "کامل نشد" in result
