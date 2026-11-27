"""تست مدیر مدل‌ها: فهرست، انتخاب مدل و نصب از راه ابزارهای خط فرمان."""
from __future__ import annotations

import store
import tools
from providers import MODEL_CATALOG


def test_list_models_shows_installed_and_catalog(ollama):
    text = tools.list_models()
    assert "llama3.2:3b" in text
    for model in MODEL_CATALOG:
        assert model["id"] in text
    assert "خودکار" in text


def test_use_model_persists_choice(ollama):
    assert "تنظیم شد" in tools.use_model("llama3.2:3b")
    assert store.load_settings()["ollama_model"] == "llama3.2:3b"
    assert store.load_settings()["provider"] == "ollama"


def test_use_model_rejects_model_not_installed(ollama):
    ollama.tags = ["gemma2:2b"]
    message = tools.use_model("llama3.2:3b")
    assert "نصب نیست" in message
    assert store.load_settings()["ollama_model"] == ""


def test_use_model_rejects_invalid_name(ollama):
    assert "مجاز نیست" in tools.use_model("bad name!")
    assert ollama.pull_requests == 0


def test_install_model_downloads_and_reports(ollama):
    message = tools.install_model("llama3.2:3b")
    assert "نصب شد" in message
    assert ollama.pull_requests == 1


def test_install_model_rejects_unknown_name(ollama):
    message = tools.install_model("not-in-catalog:1b")
    assert "فهرست پیشنهادی نیست" in message
    assert ollama.pull_requests == 0


def test_install_model_reports_upstream_error(ollama):
    ollama.pull_plan = [{"error": "disk full"}]
    assert "disk full" in tools.install_model("llama3.2:3b")


def test_install_model_reports_incomplete_pull(ollama):
    ollama.pull_plan = [{"status": "downloading", "completed": 1, "total": 100}]
    assert "کامل نشد" in tools.install_model("llama3.2:3b")
