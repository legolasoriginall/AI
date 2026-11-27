"""تست اجرای دستور در tools.py: bash واقعی، بدون فیلتر، بدون سقف خروجی."""
from __future__ import annotations

import os

import pytest

import tools


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    path = (tmp_path / "workspace").resolve()
    path.mkdir()
    monkeypatch.setattr(tools, "WORKSPACE", path)
    return path


def test_shell_features_work(workspace):
    # پایپ، جانشینی فرمان و ریدایرکت باید کار کنند (اجرا با bash، نه argv تکی).
    result = tools.run_command("printf 'a b c\\n' | wc -w")
    assert result.splitlines()[-1].strip() == "3"
    assert "کد خروج: 0" in result


def test_command_substitution_and_variables(workspace):
    result = tools.run_command('echo "$(printf x)$(printf y)"')
    assert "xy" in result


def test_inline_python_is_allowed(workspace):
    result = tools.run_command("python3 -c 'print(6 * 7)'")
    assert "42" in result


def test_commands_are_not_blocked_by_name(workspace):
    # هیچ allowlistی نیست: دستور نامتعارف هم اجرا می‌شود (فقط باید موجود باشد).
    result = tools.run_command("command -v bash")
    assert "/bash" in result
    assert "مسدود" not in result


def test_absolute_paths_are_allowed(workspace):
    result = tools.run_command("ls / | head -3")
    assert "کد خروج: 0" in result
    assert "مسدود" not in result


def test_redirect_inside_workspace(workspace):
    result = tools.run_command("echo hello > out.txt && cat out.txt")
    assert "hello" in result
    assert (workspace / "out.txt").read_text(encoding="utf-8").strip() == "hello"


def test_timeout_kills_the_process(workspace):
    result = tools.run_command("sleep 5", timeout=1)
    assert "متوقف شد" in result


def test_output_is_not_capped(workspace):
    result = tools.run_command("python3 -c \"print('x' * 20000)\"")
    assert "کوتاه شد" not in result
    assert result.count("x") >= 20000


def test_read_file_returns_full_content(workspace):
    tools.write_file("big.txt", "y" * 20000)
    assert len(tools.read_file("big.txt")) == 20000


def test_symlinked_file_is_rejected(workspace, tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("hidden", encoding="utf-8")
    os.symlink(secret, workspace / "link.txt")

    assert "symlink" in tools.read_file("link.txt")
    assert "symlink" in tools.write_file("link.txt", "x")
    assert secret.read_text(encoding="utf-8") == "hidden"


def test_symlinked_directory_is_rejected(workspace, tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "a.txt").write_text("x", encoding="utf-8")
    os.symlink(outside, workspace / "dir")

    assert "symlink" in tools.read_file("dir/a.txt")
    assert "symlink" in tools.list_files("dir")
    with pytest.raises(ValueError):
        tools.safe_path("dir/a.txt")


def test_regular_paths_still_work(workspace):
    tools.write_file("notes/a.txt", "سلام")
    assert tools.read_file("notes/a.txt") == "سلام"
    assert "a.txt" in tools.list_files("notes")
