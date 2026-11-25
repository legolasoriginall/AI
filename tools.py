"""ابزارهای عامل: فایل، دستور شل و حافظه — همه محدود به پوشهٔ workspace."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict

import providers
import store

BASE_DIR = Path(__file__).resolve().parent
WORKSPACE = (BASE_DIR / "workspace").resolve()
WORKSPACE.mkdir(exist_ok=True)

MAX_READ = 12_000
MAX_OUTPUT = 8_000
IGNORED_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv"}

# دستورهایی که هرگز اجرا نمی‌شوند (حذف مخرب، خاموش‌کردن سیستم، دسترسی روت و…)
BLOCKED_PATTERNS = (
    "rm -rf /",
    "rm -rf /*",
    "shutdown",
    "reboot",
    "mkfs",
    "dd if=",
    "sudo ",
    ":(){",
    "chmod 777 /",
    "> /dev/sda",
    "curl | sh",
    "wget | sh",
    "poweroff",
    "init 0",
)

# «curl … | sh» با هر آدرسی: هر چیزی که مستقیم به شل داده شود مسدود است.
PIPE_TO_SHELL_RE = re.compile(r"\|\s*(?:ba|z|da)?sh\b", re.IGNORECASE)


def safe_path(rel_path: str) -> Path:
    """مسیر نسبی را داخل workspace حل می‌کند و از Path Traversal جلوگیری می‌کند."""
    cleaned = (rel_path or ".").strip().replace("\\", "/").lstrip("/")
    target = (WORKSPACE / cleaned).resolve()
    if target != WORKSPACE and WORKSPACE not in target.parents:
        raise ValueError("دسترسی به خارج از پوشهٔ workspace مجاز نیست.")
    return target


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n… (کوتاه شد؛ {len(text) - limit} کاراکتر دیگر)"


def list_files(path: str = ".") -> str:
    try:
        target = safe_path(path)
    except ValueError as exc:
        return str(exc)
    if not target.exists():
        return f"مسیر «{path}» وجود ندارد."
    if target.is_file():
        return f"{path} یک فایل است ({target.stat().st_size} بایت)."
    lines = []
    for entry in sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name)):
        if entry.name in IGNORED_DIRS:
            continue
        rel = entry.relative_to(WORKSPACE).as_posix()
        if entry.is_dir():
            lines.append(f"[dir]  {rel}/")
        else:
            lines.append(f"[file] {rel}  ({entry.stat().st_size} بایت)")
    return "\n".join(lines) if lines else "پوشه خالی است."


def read_file(path: str) -> str:
    try:
        target = safe_path(path)
    except ValueError as exc:
        return str(exc)
    if not target.is_file():
        return f"فایل «{path}» پیدا نشد."
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return f"خطا در خواندن فایل: {exc}"
    return _truncate(content, MAX_READ)


def write_file(path: str, content: str = "") -> str:
    try:
        target = safe_path(path)
    except ValueError as exc:
        return str(exc)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"فایل «{target.relative_to(WORKSPACE).as_posix()}» نوشته شد ({len(content)} کاراکتر)."


def run_command(command: str, timeout: int = 60) -> str:
    command = (command or "").strip()
    if not command:
        return "دستور خالی است."
    lowered = command.lower()
    for pattern in BLOCKED_PATTERNS:
        if pattern in lowered:
            return f"دستور مسدود شد (الگوی خطرناک: «{pattern}»)."
    if PIPE_TO_SHELL_RE.search(command):
        return "دستور مسدود شد (اجرای محتوای دریافتی با شل مجاز نیست)."
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=WORKSPACE,
            capture_output=True,
            text=True,
            timeout=min(int(timeout), 180),
        )
    except subprocess.TimeoutExpired:
        return f"دستور پس از {timeout} ثانیه متوقف شد."
    except OSError as exc:
        return f"خطا در اجرای دستور: {exc}"
    output = (result.stdout or "") + (("\n[stderr]\n" + result.stderr) if result.stderr else "")
    output = _truncate(output.strip() or "(بدون خروجی)", MAX_OUTPUT)
    return f"کد خروج: {result.returncode}\n{output}"


def remember(key: str, value: str) -> str:
    if not key.strip():
        return "کلید حافظه خالی است."
    store.remember(key, value)
    return f"«{key}» در حافظه ثبت شد."


def recall(query: str = "") -> str:
    facts = store.search_facts(query)
    if not facts:
        return "چیزی در حافظه پیدا نشد."
    return "\n".join(f"- {f['key']}: {f['value']}" for f in facts)


def _ollama_base() -> str:
    return (store.load_settings().get("ollama_url") or "http://localhost:11434").rstrip("/")


def list_models() -> str:
    """مدل‌های نصب‌شده روی Ollama به‌همراه فهرست پیشنهادی برای دانلود."""
    base = _ollama_base()
    installed = providers.ollama_details(base)
    lines = [f"Ollama: {base}"]
    if installed:
        lines.append("نصب‌شده:")
        for model in installed:
            gb = model["size"] / (1024**3) if model["size"] else 0
            lines.append(f"- {model['name']}" + (f" ({gb:.1f} GB)" if gb else ""))
    else:
        lines.append("هیچ مدلی پیدا نشد؛ یا Ollama اجرا نیست یا هنوز مدلی نصب نشده است.")
    active = store.load_settings().get("ollama_model") or "(خودکار)"
    lines.append(f"مدل فعال: {active}")
    lines.append("پیشنهاد دانلود: " + ", ".join(m["id"] for m in providers.MODEL_CATALOG))
    return "\n".join(lines)


def install_model(name: str) -> str:
    """نصب (دانلود) یک مدل با Ollama؛ ممکن است چند دقیقه طول بکشد."""
    if not providers.valid_model_name(name):
        return "نام مدل مجاز نیست (مثال درست: llama3.2:3b)."
    metric = {m["id"] for m in providers.MODEL_CATALOG}
    if name not in metric:
        known = ", ".join(sorted(metric))
        return f"مدل «{name}» در فهرست پیشنهادی نیست. از یکی از این‌ها استفاده کن: {known}"
    last: Dict[str, Any] = {}
    for event in providers.pull_model(_ollama_base(), name):
        if event.get("error"):
            return event["error"]
        last = event
    if last.get("status") != "success":
        return f"نصب {name} کامل نشد (آخرین وضعیت: {last.get('status') or 'نامشخص'})."
    return f"مدل «{name}» نصب شد. برای فعال‌کردنش ابزار use_model را با همین نام صدا بزن."


def use_model(name: str) -> str:
    """یک مدل نصب‌شده را به‌عنوان مدل فعال انتخاب می‌کند."""
    if not providers.valid_model_name(name):
        return "نام مدل مجاز نیست."
    installed = [m["name"] for m in providers.ollama_details(_ollama_base())]
    if installed and name not in installed:
        return f"مدل «{name}» نصب نیست. نصب‌شده‌ها: {', '.join(installed)}"
    store.save_settings({"provider": "ollama", "ollama_model": name})
    return f"مدل فعال روی «{name}» تنظیم شد؛ از پیام بعدی همین مدل پاسخ می‌دهد."


TOOL_SPECS: Dict[str, Callable[..., str]] = {
    "list_files": list_files,
    "read_file": read_file,
    "write_file": write_file,
    "run_command": run_command,
    "remember": remember,
    "recall": recall,
    "list_models": list_models,
    "install_model": install_model,
    "use_model": use_model,
}


def run_tool(name: str, args: Dict[str, Any]) -> str:
    func = TOOL_SPECS.get(name)
    if func is None:
        return f"ابزار ناشناخته: {name}"
    if not isinstance(args, dict):
        return "آرگومان‌های ابزار باید یک آبجکت JSON باشند."
    try:
        return func(**args)
    except TypeError as exc:
        return f"آرگومان‌های ابزار درست نیست: {exc}"
    except ValueError as exc:
        return str(exc)
    except Exception as exc:  # noqa: BLE001 - خطای ابزار نباید کل گفتگو را بشکند
        return f"خطای ابزار: {exc}"
