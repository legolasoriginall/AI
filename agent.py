"""حلقهٔ عامل: مدل را صدا می‌زند، کنش‌های JSON را اجرا می‌کند و رویدادها را برمی‌گرداند."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple

import store
import tools
from providers import Brain, ProviderError

SYSTEM_TEMPLATE = """{base}

{memory}
"""


def _json_objects(text: str) -> Iterable[str]:
    """همهٔ آبجکت‌های JSON را از متن بیرون می‌کشد (حتی وقتی مدل متن اضافه نوشته)."""
    decoder = json.JSONDecoder()
    index = 0
    while index < len(text):
        start = text.find("{", index)
        if start == -1:
            return
        try:
            obj, end = decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            index = start + 1
            continue
        if isinstance(obj, dict):
            yield json.dumps(obj)
        index = end


def extract_action(text: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    """اگر پاسخ مدل یک کنش ابزار باشد، نام و آرگومان‌ها را برمی‌گرداند."""
    if not text:
        return None
    blocks = re.findall(r"```(?:json)?\s*(.*?)```", text, re.S)
    candidates = blocks + [text]
    for candidate in candidates:
        for raw in _json_objects(candidate):
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            name = obj.get("tool") or obj.get("action") or obj.get("name")
            args = obj.get("args") or obj.get("arguments") or obj.get("parameters") or {}
            if name in tools.TOOL_SPECS and isinstance(args, dict):
                return str(name), args
    return None


def _memory_briefing(user_text: str) -> str:
    facts = store.search_facts(user_text, limit=5)
    if not facts:
        return ""
    lines = "\n".join(f"- {f['key']}: {f['value']}" for f in facts)
    return "چیزهایی که از قبل در حافظه ثبت شده و ممکن است مرتبط باشند:\n" + lines


def build_system_prompt(settings: Dict[str, Any], user_text: str) -> str:
    base = settings.get("system_prompt") or store.DEFAULT_SETTINGS["system_prompt"]
    return SYSTEM_TEMPLATE.format(
        base=base.strip(),
        memory=_memory_briefing(user_text) + "\n" + store.SYSTEM_PROMPT_TOOLS,
    ).strip()


def run_turn(
    history: List[Dict[str, str]],
    settings: Dict[str, Any],
    max_steps: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """اجرای یک نوبت گفتگو؛ رویدادها: delta / tool_call / tool_result / error."""
    if not history:
        yield {"type": "error", "message": "پیامی برای پردازش وجود ندارد."}
        return

    user_text = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")
    system = build_system_prompt(settings, user_text)
    messages = [dict(m) for m in history if m.get("role") in ("user", "assistant")]
    brain = Brain(settings)
    steps = int(max_steps or settings.get("max_steps") or 8)

    for step in range(steps):
        try:
            reply = brain.chat(messages, system=system)
        except ProviderError as exc:
            yield {"type": "error", "message": str(exc)}
            return
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "message": f"خطا در فراخوانی مدل: {exc}"}
            return

        reply = (reply or "").strip()
        action = extract_action(reply)

        if action is None:
            yield {"type": "delta", "text": reply or "(پاسخ خالی بود)"}
            return

        name, args = action
        yield {"type": "tool_call", "tool": name, "args": args, "step": step + 1}
        result = tools.run_tool(name, args)
        yield {"type": "tool_result", "tool": name, "result": result, "step": step + 1}

        messages.append({"role": "assistant", "content": reply})
        messages.append(
            {
                "role": "user",
                "content": f"نتیجهٔ اجرای ابزار «{name}»:\n{result}\n\nادامه بده یا پاسخ نهایی را بنویس.",
            }
        )

    yield {
        "type": "delta",
        "text": "به سقف تعداد مراحل ابزار رسیدم. اگر لازم است ادامه بدهم، دوباره بگو.",
    }
