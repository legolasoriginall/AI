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

# سرویس‌های ابری رایگان سازگار با OpenAI؛ هر کدام کلید خودش را در .env دارد.
FREE_API_PROFILES: List[Dict[str, str]] = [
    {
        "id": "groq",
        "label": "Groq (سهمیهٔ رایگان)",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
        "key_setting": "groq_api_key",
    },
    {
        "id": "openrouter-free",
        "label": "OpenRouter (مدل‌های free)",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "meta-llama/llama-3.3-70b-instruct:free",
        "key_setting": "openrouter_api_key",
    },
]

PARAM_RE = re.compile(r"(?:^|[:_\-])(\d+(?:\.\d+)?)b(?=$|[:_\-.])", re.I)
QUALITY_ORDER = ("qwen", "llama", "gemma", "mistral", "phi")


def _ram_bytes(path: str = "/proc/meminfo") -> int:
    """کل رم دستگاه؛ روی لینوکس از /proc خوانده می‌شود."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) * 1024
    except (OSError, ValueError):
        return 0
    return 0


def model_billions(name: str) -> float:
    """اندازهٔ تقریبی مدل از نامش (مثل qwen2.5:7b → 7)."""
    match = PARAM_RE.search(name or "")
    return float(match.group(1)) if match else 0.0


def model_rank(name: str) -> tuple:
    lowered = (name or "").lower()
    family = next((index for index, key in enumerate(QUALITY_ORDER) if key in lowered), len(QUALITY_ORDER))
    return (model_billions(lowered), -family)


def best_ollama_model(models: List[str], ram_bytes: int | None = None) -> str:
    """بهترین مدل نصب‌شده بر اساس کیفیت و رم موجود؛ اگر هیچ‌کدام جا نشد، سبک‌ترین."""
    names = [name for name in (models or []) if name]
    if not names:
        return ""
    ram = _ram_bytes() if ram_bytes is None else ram_bytes
    budget_gb = (ram / (1024 ** 3)) * 0.6 if ram else 0.0

    def fits(name: str) -> bool:
        if not budget_gb:
            return True
        return model_billions(name) * 0.8 + 1.2 <= budget_gb

    for name in sorted(names, key=model_rank, reverse=True):
        if fits(name):
            return name
    return sorted(names, key=model_rank)[0]


def free_api_profiles(settings: Dict[str, Any]) -> List[Dict[str, str]]:
    """سرویس‌های رایگانی که کلیدشان تنظیم شده است."""
    return [profile for profile in FREE_API_PROFILES if settings.get(profile["key_setting"])]


def free_api_profile(provider_id: str) -> Dict[str, str] | None:
    return next((profile for profile in FREE_API_PROFILES if profile["id"] == provider_id), None)


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
            "best_local_model": best_ollama_model(models),
            "gemini_ready": bool(self.settings.get("gemini_api_key")),
            "free_providers": [profile["id"] for profile in free_api_profiles(self.settings)],
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
        for profile in FREE_API_PROFILES:
            available[profile["id"]] = bool(self.settings.get(profile["key_setting"]))
        chosen = self.settings.get("provider", "auto")
        if chosen != "auto":
            if not available.get(chosen):
                raise ProviderError(
                    f"ارائه‌دهندهٔ «{chosen}» تنظیم شده اما آماده نیست. "
                    "کلید/سرویس مربوطه را بررسی کنید یا حالت auto را انتخاب کنید."
                )
            return [chosen]
        # رایگان‌ها اول: مدل محلی، بعد Gemini و سرویس‌های رایگان، بعد سرویس پولی/عمومی.
        order = ["ollama", "gemini"] + [profile["id"] for profile in FREE_API_PROFILES] + ["openai", "pollinations"]
        chain = [name for name in order if available[name]]
        if not chain:
            raise ProviderError(
                "هیچ مدلی در دسترس نیست. برای حالت آفلاین Ollama را اجرا و یک مدل نصب کنید "
                "(مثلاً: ollama pull qwen2.5:3b). برای حالت آنلاین یکی از GEMINI_API_KEY، "
                "GROQ_API_KEY یا OPENROUTER_API_KEY را در .env بگذارید."
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
                profile = free_api_profile(name)
                if profile:
                    return self._free_api(profile, messages, system)
            except Exception as exc:  # noqa: BLE001 - هر خطایی باید به ارائه‌دهندهٔ بعدی برود
                errors.append(f"{name}: {exc}")
        raise ProviderError("هیچ مدلی پاسخ نداد → " + " | ".join(errors))

    # ------------------------------------------------------------------ پیاده‌سازی‌ها
    def _ollama(self, messages: List[Dict[str, str]], system: str) -> str:
        model = self.settings.get("ollama_model") or ""
        models = ollama_models(self.ollama_url)
        if not models:
            raise RuntimeError("Ollama در دسترس نیست")
        if model not in models:
            # انتخاب خودکار بهترین مدل نصب‌شده، حتی اگر مدل ذخیره‌شده حذف شده باشد.
            model = best_ollama_model(models)
        payload = {
            "model": model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "stream": False,
            "options": {"temperature": self.temperature},
        }
        resp = requests.post(f"{self.ollama_url}/api/chat", json=payload, timeout=180)
        resp.raise_for_status()
        return (resp.json().get("message") or {}).get("content", "")

    def _openai_compatible(
        self,
        base_url: str,
        model: str,
        api_key: str,
        messages: List[Dict[str, str]],
        system: str,
    ) -> str:
        payload = {
            "model": model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "temperature": self.temperature,
        }
        headers = {"Authorization": f"Bearer {api_key}"}
        resp = requests.post(
            f"{base_url.rstrip('/')}/chat/completions", json=payload, headers=headers, timeout=180
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def _openai(self, messages: List[Dict[str, str]], system: str) -> str:
        base = self.settings.get("openai_base_url") or "https://api.openai.com/v1"
        model = self.settings.get("model") or "gpt-4o-mini"
        return self._openai_compatible(
            base, model, self.settings.get("openai_api_key", ""), messages, system
        )

    def _free_api(
        self, profile: Dict[str, str], messages: List[Dict[str, str]], system: str
    ) -> str:
        return self._openai_compatible(
            profile["base_url"],
            profile["model"],
            self.settings.get(profile["key_setting"], ""),
            messages,
            system,
        )

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
