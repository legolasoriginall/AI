#!/usr/bin/env python3
"""بررسی سلامت محیط اجرای دستیار: پایتون، venv، وابستگی‌ها، پورت، .env، Ollama و data.

    python3 scripts/doctor.py            # گزارش خوانا + دستور اصلاح هر خطا
    python3 scripts/doctor.py --json     # همان گزارش به‌صورت JSON (کد خروج ۱ اگر خطا باشد)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
MIN_PYTHON = (3, 10)
SUGGESTED_MODEL = "qwen2.5:3b"
DEFAULT_URL = "http://localhost:11434"
OK, WARN, FAIL = "ok", "warn", "fail"


def _check(name: str, status: str, detail: str, fix: str = "") -> dict:
    return {"name": name, "status": status, "detail": detail, "fix": fix}


# --------------------------------------------------------------------- بررسی‌ها
def check_python() -> dict:
    version = ".".join(str(part) for part in sys.version_info[:3])
    if sys.version_info >= MIN_PYTHON:
        return _check("python", OK, f"پایتون {version}")
    minimum = ".".join(str(part) for part in MIN_PYTHON)
    return _check(
        "python",
        FAIL,
        f"پایتون {version} قدیمی است (حداقل {minimum})",
        "sudo apt install -y python3.12 python3.12-venv   # یا معادل توزیع خودت",
    )


def check_venv() -> dict:
    active = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    if active:
        return _check("venv", OK, f"محیط مجازی فعال: {sys.prefix}")
    return _check(
        "venv",
        FAIL,
        "داخل venv نیستی؛ وابستگی‌ها ممکن است سیستم را تغییر دهند",
        "python3 -m venv .venv && source .venv/bin/activate",
    )


def check_dependencies() -> dict:
    missing = [name for name in ("requests",) if importlib.util.find_spec(name) is None]
    if missing:
        return _check(
            "dependencies",
            FAIL,
            "بستهٔ پیدا نشده: " + ", ".join(missing),
            "pip install -r requirements.txt",
        )
    import requests

    return _check("dependencies", OK, f"requests {requests.__version__}")


def read_env_file(path: Path | None) -> dict | None:
    """متغیرهای سادهٔ .env را برمی‌گرداند یا None اگر فایل نبود."""
    if not path or not Path(path).is_file():
        return None
    values: dict[str, str] = {}
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            values[key] = value.strip().strip('"').strip("'")
    return values


def check_env_file(path: Path, values: dict | None) -> dict:
    if values is None:
        return _check(
            "env",
            WARN,
            f"فایل {path} نیست؛ فقط متغیرهای محیطی شل استفاده می‌شوند",
            f"cp .env.example {path}",
        )
    if not values:
        return _check(
            "env",
            WARN,
            f"{path} خالی است یا فقط کامنت دارد",
            f"cp .env.example {path}",
        )
    # همان کاری که cli.py می‌کند: فقط متغیرهای تعریف‌نشده را پر می‌کند.
    for key, value in values.items():
        os.environ.setdefault(key, value)
    return _check("env", OK, f"{len(values)} متغیر از {path.name} خوانده شد")


def check_port(host: str, port: int, timeout: float = 1.5) -> dict:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return _check("port", OK, f"چیزی روی {host}:{port} گوش می‌دهد")
    except OSError as exc:
        return _check(
            "port",
            WARN,
            f"پورت {port} بسته است ({exc.__class__.__name__})",
            "ollama serve   # یا اگر پورت را عوض کردی: OLLAMA_URL را در .env به‌روز کن",
        )


def http_tags(url: str, timeout: float = 3.0) -> dict:
    target = f"{url.rstrip('/')}/api/tags"
    with urllib.request.urlopen(target, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def check_ollama(url: str, timeout: float = 3.0) -> dict:
    try:
        payload = http_tags(url, timeout=timeout)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        reason = getattr(exc, "reason", exc)
        return _check(
            "ollama",
            FAIL,
            f"اتصال به {url} ممکن نشد: {reason}",
            "ollama serve   # بعد در ترمینال دیگر: ollama pull " + SUGGESTED_MODEL,
        )
    models = [item.get("name", "") for item in payload.get("models", []) if item.get("name")]
    if not models:
        return _check(
            "ollama",
            WARN,
            "سرویس بالاست اما هیچ مدلی نصب نیست",
            "ollama pull " + SUGGESTED_MODEL,
        )
    return _check("ollama", OK, f"{len(models)} مدل: " + ", ".join(models))


def check_data_dir(path: Path) -> dict:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".doctor-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as exc:
        return _check(
            "data",
            FAIL,
            f"نوشتن در {path} ممکن نیست: {exc}",
            f"sudo mkdir -p {path} && sudo chown -R \"$USER\" {path}",
        )
    return _check("data", OK, f"نوشتن در {path} ممکن است")


def collect(url: str, env_path: Path, data_dir: Path, timeout: float = 3.0) -> dict:
    values = read_env_file(env_path)
    if values:
        active_url = values.get("OLLAMA_URL") or os.environ.get("OLLAMA_URL") or url
    else:
        active_url = os.environ.get("OLLAMA_URL") or url
    parsed = urlparse(active_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or 11434

    checks = [
        check_python(),
        check_venv(),
        check_dependencies(),
        check_env_file(env_path, values),
        check_port(host, port, timeout=min(timeout, 1.5)),
        check_ollama(active_url, timeout=timeout),
        check_data_dir(data_dir),
    ]
    counts = {status: sum(1 for check in checks if check["status"] == status) for status in (OK, WARN, FAIL)}
    return {
        "ok": counts[FAIL] == 0,
        "ollama_url": active_url,
        "checks": checks,
        "summary": counts,
    }


# --------------------------------------------------------------------- خروجی
def print_human(report: dict) -> None:
    symbols = {OK: "✔", WARN: "!", FAIL: "✖"}
    for check in report["checks"]:
        print(f"{symbols[check['status']]} {check['name']:<12} {check['detail']}")
        if check["fix"]:
            print(f"   اصلاح: {check['fix']}")
    counts = report["summary"]
    print(f"\n{counts['ok']} سالم، {counts['warn']} هشدار، {counts['fail']} خطا — {report['ollama_url']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="بررسی محیط اجرای دستیار دیجیتال")
    parser.add_argument("--json", action="store_true", help="گزارش ماشین‌خوان (JSON)")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"آدرس Ollama پیش‌فرض ({DEFAULT_URL})")
    parser.add_argument("--env-file", default=str(ROOT / ".env"), help="مسیر فایل .env")
    parser.add_argument("--data-dir", default=str(ROOT / "data"), help="پوشهٔ داده برای تست نوشتن")
    parser.add_argument("--timeout", type=float, default=3.0, help="مهلت هر بررسی شبکه‌ای (ثانیه)")
    args = parser.parse_args(argv)

    report = collect(args.url, Path(args.env_file), Path(args.data_dir), timeout=args.timeout)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
