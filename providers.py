"""روتر مدل‌های زبانی: آفلاین (Ollama) و آنلاین (Gemini / هر API سازگار با OpenAI)."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterator, List

import requests


class ProviderError(RuntimeError):
    """هیچ‌کدام از مدل‌های موجود پاسخ ندادند."""


# مدل‌های محلی پیشنهادی برای دانلود؛ همان فهرست docs/models.js
MODEL_CATALOG: List[Dict[str, Any]] = [
    {"id": "llama3.2:1b", "label": "Llama 3.2 1B", "size": "1.3 GB", "ram": "8 GB", "note": "سبک‌ترین گزینه؛ برای شروع و دستگاه‌های کم‌رم."},
    {"id": "llama3.2:3b", "label": "Llama 3.2 3B", "size": "2.0 GB", "ram": "8 GB", "note": "تعادل خوب کیفیت و سرعت؛ انتخاب پیشنهادی."},
    {"id": "qwen2.5:3b", "label": "Qwen 2.5 3B", "size": "1.9 GB", "ram": "8 GB", "note": "فارسی و عربی را بهتر از هم‌اندازه‌هایش می‌فهمد."},
    {"id": "gemma2:2b", "label": "Gemma 2 2B", "size": "1.6 GB", "ram": "8 GB", "note": "پاسخ‌های کوتاه و مرتب برای پرسش‌های روزمره."},
    {"id": "qwen2.5:7b", "label": "Qwen 2.5 7B", "size": "4.7 GB", "ram": "16 GB", "note": "کیفیت بالاتر برای کد و متن فارسی؛ رم بیشتری می‌خواهد."},
    {"id": "llama3.1:8b", "label": "Llama 3.1 8B", "size": "4.9 GB", "ram": "16 GB", "note": "مدل عمومی قوی‌تر برای کارهای طولانی."},
]

MODEL_NAME_RE = re.compile(r"^[A-Za-z0-9._:\-/]{1,80}$")


def ollama_models(base_url: str) -> List[str]:
    """فهرست مدل‌های نصب‌شده روی Ollama؛ در صورت در دسترس نبودن، لیست خالی."""
    try:
        resp = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=3)
        if resp.status_code == 200:
            return [m.get("name", "") for m in resp.json().get("models", []) if m.get("name")]
    except requests.RequestException:
        pass
    return []


def ollama_details(base_url: str) -> List[Dict[str, Any]]:
    """فهرست مدل‌های نصب‌شده همراه با اندازه و تعداد پارامتر."""
    try:
        resp = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=3)
        if resp.status_code != 200:
            return []
        items = resp.json().get("models", [])
    except (requests.RequestException, ValueError):
        return []
    result: List[Dict[str, Any]] = []
    for item in items:
        name = item.get("name")
        if not name:
            continue
        details = item.get("details") or {}
        result.append(
            {
                "name": name,
                "size": int(item.get("size") or 0),
                "params": details.get("parameter_size", ""),
                "modified_at": item.get("modified_at", ""),
            }
        )
    return sorted(result, key=lambda model: model["size"])


def valid_model_name(name: str) -> bool:
    return bool(MODEL_NAME_RE.match(name or ""))


def pull_model(base_url: str, name: str) -> Iterator[Dict[str, Any]]:
    """نصب یک مدل با Ollama و برگرداندن رخدادهای پیشرفت (NDJSON)."""
    if not valid_model_name(name):
        yield {"error": "نام مدل مجاز نیست."}
        return
    try:
        with requests.post(
            f"{base_url.rstrip('/')}/api/pull",
            json={"model": name, "stream": True},
            stream=True,
            timeout=(5, 900),
        ) as resp:
            if resp.status_code != 200:
                yield {"error": f"Ollama پاسخ {resp.status_code} داد."}
                return
            for line in resp.iter_lines(decode_unicode=True):
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except requests.RequestException as exc:
        yield {"error": f"اتصال به Ollama ممکن نشد: {exc}"}


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
        if not model:
            if not models:
                raise RuntimeError("Ollama در دسترس نیست")
            model = models[0]
        elif model not in models:
            raise RuntimeError(
                f"مدل فعال «{model}» دیگر روی این دستگاه نصب نیست. "
                "از دکمهٔ مدل‌ها یکی از مدل‌های نصب‌شده را انتخاب کنید یا همان مدل را دوباره دانلود کنید."
            )
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
