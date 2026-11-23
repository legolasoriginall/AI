"""روتر مدل‌های زبانی: آفلاین (Ollama) و آنلاین (Gemini / هر API سازگار با OpenAI)."""
from __future__ import annotations

from typing import Any, Dict, List

import requests


class ProviderError(RuntimeError):
    """هیچ‌کدام از مدل‌های موجود پاسخ ندادند."""


def ollama_models(base_url: str) -> List[str]:
    """فهرست مدل‌های نصب‌شده روی Ollama؛ در صورت در دسترس نبودن، لیست خالی."""
    try:
        resp = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=3)
        if resp.status_code == 200:
            return [m.get("name", "") for m in resp.json().get("models", []) if m.get("name")]
    except requests.RequestException:
        pass
    return []


class Brain:
    """انتخاب خودکار ارائه‌دهنده و فراخوانی مدل با متن گفتگو."""

    def __init__(self, settings: Dict[str, Any]):
        self.settings = settings or {}
        self.ollama_url = (self.settings.get("ollama_url") or "http://localhost:11434").rstrip("/")
        self.temperature = float(self.settings.get("temperature", 0.3))

    # ------------------------------------------------------------------ وضعیت
    def describe(self) -> Dict[str, Any]:
        models = ollama_models(self.ollama_url)
        return {
            "provider": self.settings.get("provider", "auto"),
            "ollama_url": self.ollama_url,
            "ollama_models": models,
            "ollama_ready": bool(models),
            "gemini_ready": bool(self.settings.get("gemini_api_key")),
            "openai_ready": bool(self.settings.get("openai_api_key")),
            "public_fallback": bool(self.settings.get("allow_public_fallback")),
        }

    def _chain(self) -> List[str]:
        available = {
            "gemini": bool(self.settings.get("gemini_api_key")),
            "ollama": bool(ollama_models(self.ollama_url)),
            "openai": bool(self.settings.get("openai_api_key")),
            "pollinations": bool(self.settings.get("allow_public_fallback")),
        }
        chosen = self.settings.get("provider", "auto")
        if chosen != "auto":
            if not available.get(chosen):
                raise ProviderError(
                    f"ارائه‌دهندهٔ «{chosen}» تنظیم شده اما آماده نیست. "
                    "کلید/سرویس مربوطه را بررسی کنید یا حالت auto را انتخاب کنید."
                )
            return [chosen]
        order = ["gemini", "ollama", "openai", "pollinations"]
        chain = [name for name in order if available[name]]
        if not chain:
            raise ProviderError(
                "هیچ مدلی در دسترس نیست. برای حالت آفلاین Ollama را اجرا و یک مدل نصب کنید "
                "(مثلاً: ollama pull llama3.2). برای حالت آنلاین GEMINI_API_KEY یا "
                "OPENAI_API_KEY و OPENAI_BASE_URL را در .env بگذارید."
            )
        return chain

    # ------------------------------------------------------------------ فراخوانی
    def chat(self, messages: List[Dict[str, str]], system: str = "") -> str:
        chain = self._chain()
        errors: List[str] = []
        for name in chain:
            try:
                if name == "gemini":
                    return self._gemini(messages, system)
                if name == "ollama":
                    return self._ollama(messages, system)
                if name == "openai":
                    return self._openai(messages, system)
                if name == "pollinations":
                    return self._pollinations(messages, system)
            except Exception as exc:  # noqa: BLE001 - هر خطایی باید به ارائه‌دهندهٔ بعدی برود
                errors.append(f"{name}: {exc}")
        raise ProviderError("هیچ مدلی پاسخ نداد → " + " | ".join(errors))

    # ------------------------------------------------------------------ پیاده‌سازی‌ها
    def _ollama(self, messages: List[Dict[str, str]], system: str) -> str:
        model = self.settings.get("ollama_model") or ""
        models = ollama_models(self.ollama_url)
        if not model or model not in models:
            if not models:
                raise RuntimeError("Ollama در دسترس نیست")
            model = models[0]
        payload = {
            "model": model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "stream": False,
            "options": {"temperature": self.temperature},
        }
        resp = requests.post(f"{self.ollama_url}/api/chat", json=payload, timeout=180)
        resp.raise_for_status()
        return (resp.json().get("message") or {}).get("content", "")

    def _openai(self, messages: List[Dict[str, str]], system: str) -> str:
        base = (self.settings.get("openai_base_url") or "https://api.openai.com/v1").rstrip("/")
        model = self.settings.get("model") or "gpt-4o-mini"
        payload = {
            "model": model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "temperature": self.temperature,
        }
        headers = {"Authorization": f"Bearer {self.settings.get('openai_api_key', '')}"}
        resp = requests.post(f"{base}/chat/completions", json=payload, headers=headers, timeout=180)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def _gemini(self, messages: List[Dict[str, str]], system: str) -> str:
        key = self.settings.get("gemini_api_key", "")
        model = self.settings.get("model") if str(self.settings.get("model", "")).startswith("gemini") else "gemini-2.0-flash"
        contents = [
            {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
            for m in messages
        ]
        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {"temperature": self.temperature},
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        resp = requests.post(url, json=payload, timeout=180)
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    def _pollinations(self, messages: List[Dict[str, str]], system: str) -> str:
        # سرویس عمومی و بدون کلید؛ برای دادهٔ خصوصی مناسب نیست و به‌صورت پیش‌فرض خاموش است.
        payload = {
            "model": "openai",
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
        }
        resp = requests.post("https://text.pollinations.ai/openai", json=payload, timeout=90)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
