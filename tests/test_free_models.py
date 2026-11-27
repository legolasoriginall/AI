"""تست انتخاب خودکار بهترین مدل رایگان: اول محلی، بعد سرویس‌های رایگان."""
from __future__ import annotations

import store
from providers import Brain


def test_best_local_model_prefers_largest_that_fits_ram():
    import providers

    models = ["llama3.2:1b", "qwen2.5:7b", "llama3.2:3b"]
    assert providers.best_ollama_model(models, ram_bytes=8 * 1024**3) == "llama3.2:3b"
    assert providers.best_ollama_model(models, ram_bytes=32 * 1024**3) == "qwen2.5:7b"
    assert providers.best_ollama_model([], ram_bytes=8 * 1024**3) == ""


def test_best_local_model_falls_back_to_smallest_when_nothing_fits():
    import providers

    models = ["llama3.1:8b", "qwen2.5:7b"]
    assert providers.best_ollama_model(models, ram_bytes=4 * 1024**3) == "qwen2.5:7b"


def test_auto_chain_puts_local_first_then_free_apis(monkeypatch):
    import providers

    monkeypatch.setattr(providers, "ollama_models", lambda url: ["qwen2.5:3b"])
    brain = providers.Brain(
        {
            "ollama_url": "http://example.invalid",
            "gemini_api_key": "g",
            "groq_api_key": "k",
            "openrouter_api_key": "o",
            "openai_api_key": "p",
        }
    )
    assert brain._chain() == ["ollama", "gemini", "groq", "openrouter-free", "openai"]


def test_free_provider_uses_its_own_endpoint_and_model(monkeypatch):
    import providers

    calls = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}]}

    def fake_post(url, json=None, headers=None, timeout=None):
        calls["url"] = url
        calls["model"] = json["model"]
        calls["auth"] = headers["Authorization"]
        return FakeResponse()

    monkeypatch.setattr(providers, "ollama_models", lambda url: [])
    monkeypatch.setattr(providers.requests, "post", fake_post)
    brain = providers.Brain({"provider": "groq", "groq_api_key": "secret"})

    assert brain.chat([{"role": "user", "content": "سلام"}]) == "ok"
    assert calls == {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.3-70b-versatile",
        "auth": "Bearer secret",
    }


def test_configured_local_model_missing_falls_back_to_installed(ollama):
    store.save_settings({"ollama_model": "ghost:1b"})
    brain = Brain(store.load_settings())
    assert brain.chat([{"role": "user", "content": "سلام"}]) == "سلام از مدل جعلی"


def test_describe_exposes_best_local_model(ollama):
    info = Brain(store.load_settings()).describe()
    assert info["best_local_model"] == "llama3.2:3b"
    assert info["free_providers"] == []
    assert info["ollama_ready"] is True
