#!/usr/bin/env python3
"""چت خط فرمان دستیار دیجیتال — مستقیم در ترمینال لینوکس.

    python3 cli.py                      # گفتگوی تعاملی با استریم
    python3 cli.py -m "سلام"             # یک پیام و خروج
    python3 cli.py --list-models        # مدل‌های نصب‌شده و پیشنهادی
    python3 cli.py --system-file p.md   # دستور سیستمی از فایل

ابزارها همان tools.py هستند: خواندن/نوشتن فایل و اجرای دستور bash در پوشهٔ
workspace. کلیدها و مدل هم از .env (در همین پوشه) خوانده می‌شوند.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def load_env(path: Path | None = None) -> None:
    """متغیرهای سادهٔ .env را بدون وابستگی بیرونی در محیط می‌گذارد."""
    env_path = path or (BASE_DIR / ".env")
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


# قبل از ایمپورت store، چون مقادیر پیش‌فرض را از محیط می‌خواند.
load_env()

import agent  # noqa: E402
import store  # noqa: E402
from providers import (  # noqa: E402
    MODEL_CATALOG,
    Brain,
    ProviderError,
    ollama_details,
    valid_model_name,
)

DIM = "\033[2m"
BOLD = "\033[1m"
RED = "\033[31m"
CYAN = "\033[36m"
RESET = "\033[0m"

HELP = """دستورها:
  /help            همین راهنما
  /new             گفتگوی تازه
  /models          مدل‌های نصب‌شده و پیشنهادی
  /use NAME        فعال‌کردن یک مدل نصب‌شده (مثل /use qwen2.5:3b)
  /status          ارائه‌دهنده و مدل فعال
  /system FILE     تنظیم دستور سیستمی از فایل (بدون آرگومان: نمایش فعلی)
  /exit یا /quit   خروج
هر متن دیگری به مدل می‌رود؛ ابزارها خودکار اجرا می‌شوند."""


def _paint(text: str, color: str) -> str:
    return text if not sys.stdout.isatty() else f"{color}{text}{RESET}"


def _read_prompt_file(path: str) -> str:
    """دستور سیستمی را از یک فایل متنی UTF-8 می‌خواند."""
    target = Path(path).expanduser()
    if not target.is_file():
        raise FileNotFoundError(f"فایل «{path}» پیدا نشد.")
    text = target.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"فایل «{path}» خالی است.")
    return text


def _show_models() -> None:
    base = (store.load_settings().get("ollama_url") or "http://localhost:11434").rstrip("/")
    installed = ollama_details(base)
    print(f"Ollama: {base}")
    if installed:
        for model in installed:
            gb = model["size"] / (1024**3) if model["size"] else 0
            print(f"  • {model['name']}" + (f" ({gb:.1f} GB)" if gb else ""))
    else:
        print("  (هیچ مدلی پیدا نشد؛ ollama serve و ollama pull را اجرا کنید)")
    print("پیشنهاد: " + ", ".join(m["id"] for m in MODEL_CATALOG))


def _show_status(settings: dict) -> None:
    info = Brain(settings).describe()
    print(f"ارائه‌دهنده: {info['provider']}")
    print(f"مدل محلی فعال: {settings.get('ollama_model') or info.get('best_local_model') or '—'}")
    print(f"سرویس‌های رایگان آماده: {', '.join(info['free_providers']) or '—'}")
    print(f"Gemini: {'آماده' if info['gemini_ready'] else '—'} | OpenAI: {'آماده' if info['openai_ready'] else '—'}")


def chat_once(text: str, session_id: str) -> None:
    """یک پیام را با استریم به مدل می‌دهد و ابزارها را اجرا می‌کند."""
    store.add_message(session_id, "user", text)
    history = store.get_history(session_id)
    settings = store.load_settings()

    answer: list[str] = []
    for event in agent.stream_turn(history, settings):
        kind = event.get("type")
        if kind == "token":
            chunk = event.get("text", "")
            answer.append(chunk)
            sys.stdout.write(chunk)
            sys.stdout.flush()
        elif kind == "tool_call":
            args = json.dumps(event.get("args") or {}, ensure_ascii=False)
            name = event.get("tool")
            sys.stdout.write("\n" + _paint(f"⚙ {name} {args}", DIM) + "\n")
            sys.stdout.flush()
        elif kind == "tool_result":
            lines = str(event.get("result", "")).splitlines()
            head = "\n".join(lines[:8])
            if len(lines) > 8:
                head += f"\n… ({len(lines) - 8} خط دیگر)"
            print(_paint(head or "(بدون خروجی)", DIM))
        elif kind == "error":
            print(_paint(f"\nخطا: {event.get('message')}", RED))
    print()

    reply = "".join(answer).strip()
    if reply:
        store.add_message(session_id, "assistant", reply)


def _handle_command(line: str, session_id: str) -> tuple[bool, str]:
    """دستورهای اسلش را اجرا می‌کند؛ (ادامه بده؟, شناسهٔ نشست)."""
    parts = line.split(maxsplit=1)
    command = parts[0].lower()
    arg = parts[1].strip() if len(parts) > 1 else ""

    if command in ("/exit", "/quit", "/q"):
        return False, session_id
    if command == "/help":
        print(HELP)
    elif command == "/new":
        session_id = store.create_session()["id"]
        print(_paint(f"گفتگوی تازه: {session_id}", DIM))
    elif command == "/models":
        _show_models()
    elif command == "/use":
        if not arg or not valid_model_name(arg):
            print("نام مدل درست نیست. مثال: /use qwen2.5:3b")
        else:
            installed = [m["name"] for m in ollama_details(
                (store.load_settings().get("ollama_url") or "http://localhost:11434")
            )]
            if installed and arg not in installed:
                print(f"«{arg}» نصب نیست. نصب‌شده‌ها: {', '.join(installed)}")
            else:
                store.save_settings({"provider": "ollama", "ollama_model": arg})
                print(f"مدل فعال: {arg}")
    elif command == "/status":
        _show_status(store.load_settings())
    elif command == "/system":
        if not arg:
            current = (store.load_settings().get("system_prompt") or "").strip()
            preview = "\n".join(current.splitlines()[:6])
            print(_paint("دستور سیستمی فعلی:", DIM))
            print(preview or "(خالی — پیش‌فرض استفاده می‌شود)")
        else:
            try:
                prompt = _read_prompt_file(arg)
            except (OSError, ValueError) as exc:
                print(_paint(f"خطا: {exc}", RED))
            else:
                store.save_settings({"system_prompt": prompt})
                print(f"دستور سیستمی از «{arg}» تنظیم شد ({len(prompt)} کاراکتر).")
    else:
        print(f"دستور ناشناخته: {command} — /help را بزنید.")
    return True, session_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="چت خط فرمان دستیار دیجیتال (لینوکس، بدون مرورگر)")
    parser.add_argument("-m", "--message", help="فقط یک پیام بفرست و خارج شو")
    parser.add_argument("--list-models", action="store_true", help="مدل‌های نصب‌شده و پیشنهادی")
    parser.add_argument("--provider", help="auto | ollama | gemini | groq | openrouter-free | openai")
    parser.add_argument("--model", help="مدل آنلاین (مثل llama-3.3-70b-versatile)")
    parser.add_argument("--ollama-model", help="مدل محلی نصب‌شده")
    parser.add_argument("--session", help="ادامهٔ یک نشست با شناسه")
    parser.add_argument("--new", action="store_true", help="نشست تازه بساز")
    parser.add_argument("--system-file", help="فایل دستور سیستمی (UTF-8) برای جایگزینی پیش‌فرض")
    args = parser.parse_args(argv)

    if args.list_models:
        _show_models()
        return 0

    overrides = {
        key: value
        for key, value in (
            ("provider", args.provider),
            ("model", args.model),
            ("ollama_model", args.ollama_model),
        )
        if value
    }
    if args.system_file:
        try:
            overrides["system_prompt"] = _read_prompt_file(args.system_file)
        except (OSError, ValueError) as exc:
            print(_paint(f"خطا: {exc}", RED))
            return 1

    if overrides:
        store.save_settings(overrides)

    store.init_db()
    if args.session:
        session_id = args.session
    elif args.new or not args.message:
        session_id = store.create_session()["id"]
    else:
        session_id = store.create_session()["id"]

    try:
        if args.message:
            chat_once(args.message, session_id)
            return 0

        print(_paint(f"دستیار دیجیتال — چت خط فرمان  ({session_id})", BOLD))
        print(_paint("برای راهنما /help، برای خروج /exit", DIM))
        while True:
            try:
                line = input(_paint("\n» ", CYAN)).strip()
            except EOFError:
                print()
                return 0
            if not line:
                continue
            if line.startswith("/"):
                keep_going, session_id = _handle_command(line, session_id)
                if not keep_going:
                    return 0
                continue
            chat_once(line, session_id)
    except KeyboardInterrupt:
        print("\nخروج.")
        return 130
    except ProviderError as exc:
        print(_paint(f"خطا: {exc}", RED))
        return 1


if __name__ == "__main__":
    sys.exit(main())
