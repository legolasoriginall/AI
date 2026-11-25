"""سرور دستیار دیجیتال: Flask + استریم SSE + رابط وب فارسی."""
from __future__ import annotations

import json
import os
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

import agent
import store
import tools
from providers import (
    MODEL_CATALOG,
    Brain,
    ProviderError,
    ollama_details,
    ollama_models,
    pull_model as ollama_pull,
    valid_model_name,
)

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"

app = Flask(__name__, static_folder=str(WEB_DIR), static_url_path="/static")
app.config["JSON_AS_ASCII"] = False

store.init_db()


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# --------------------------------------------------------------------- صفحات
@app.get("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


# --------------------------------------------------------------------- وضعیت
@app.get("/api/status")
def status():
    settings = store.load_settings()
    brain = Brain(settings)
    info = brain.describe()
    info["model"] = settings.get("model") or ""
    info["ollama_model"] = settings.get("ollama_model") or (info["ollama_models"][0] if info["ollama_models"] else "")
    info["workspace"] = str(tools.WORKSPACE)
    info["online_base_url"] = settings.get("openai_base_url")
    return jsonify(info)


@app.get("/api/models")
def models():
    """مدل‌های پیدا‌شده (Ollama) + فهرست پیشنهادی برای دانلود."""
    settings = store.load_settings()
    base = settings.get("ollama_url") or "http://localhost:11434"
    installed = ollama_details(base)
    return jsonify(
        {
            "ollama_url": base,
            "ollama_ready": bool(installed),
            "ollama": [m["name"] for m in installed] or ollama_models(base),
            "installed": installed,
            "catalog": MODEL_CATALOG,
            "active": {
                "provider": settings.get("provider", "auto"),
                "ollama_model": settings.get("ollama_model", ""),
                "online_model": settings.get("model", ""),
                "online_base_url": settings.get("openai_base_url", ""),
            },
        }
    )


@app.post("/api/models/pull")
def pull_model_route():
    """نصب مدل با استریم پیشرفت؛ همان کاری که Ollama در ترمینال می‌کند."""
    payload = request.get_json(silent=True) or {}
    name = (payload.get("model") or "").strip()
    if not valid_model_name(name):
        return jsonify({"error": "نام مدل مجاز نیست (فقط حروف، رقم، نقطه، خط تیره، زیرخط و دو نقطه)."}), 400

    base = store.load_settings().get("ollama_url") or "http://localhost:11434"

    def generate():
        stream = ollama_pull(base, name)
        try:
            for event in stream:
                if event.get("error"):
                    yield _sse({"type": "error", "message": event["error"]})
                    return
                total = int(event.get("total") or 0)
                completed = int(event.get("completed") or 0)
                yield _sse(
                    {
                        "type": "progress",
                        "status": event.get("status", ""),
                        "completed": completed,
                        "total": total,
                        "percent": round(completed * 100 / total) if total else 0,
                    }
                )
            yield _sse(
                {
                    "type": "done",
                    "model": name,
                    "installed": [m["name"] for m in ollama_details(base)],
                }
            )
        finally:
            # اگر کلاینت دانلود را لغو کند، بستن این مولد اتصال بالادست را هم می‌بندد
            # تا «ollama pull» در سرور ادامه پیدا نکند.
            close = getattr(stream, "close", None)
            if callable(close):
                close()

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/models/use")
def use_model_route():
    """مدل نصب‌شده را به‌عنوان مدل فعال انتخاب می‌کند."""
    payload = request.get_json(silent=True) or {}
    name = (payload.get("model") or "").strip()
    if not valid_model_name(name):
        return jsonify({"error": "نام مدل مجاز نیست."}), 400

    base = store.load_settings().get("ollama_url") or "http://localhost:11434"
    installed = [m["name"] for m in ollama_details(base)]
    if installed and name not in installed:
        return jsonify({"error": f"مدل «{name}» نصب نیست.", "installed": installed}), 404

    store.save_settings({"provider": "ollama", "ollama_model": name})
    return jsonify({"ok": True, "provider": "ollama", "model": name})


# --------------------------------------------------------------------- تنظیمات
@app.get("/api/settings")
def get_settings():
    settings = store.load_settings()
    safe = dict(settings)
    safe["gemini_api_key"] = "***" if settings.get("gemini_api_key") else ""
    safe["openai_api_key"] = "***" if settings.get("openai_api_key") else ""
    return jsonify(safe)


@app.post("/api/settings")
def update_settings():
    payload = request.get_json(silent=True) or {}
    settings = store.save_settings(payload)
    return jsonify(
        {
            "ok": True,
            "provider": settings["provider"],
            "model": settings.get("model", ""),
            "ollama_url": settings.get("ollama_url", ""),
            "ollama_model": settings.get("ollama_model", ""),
            "system_prompt": settings.get("system_prompt", ""),
        }
    )


# --------------------------------------------------------------------- نشست‌ها
@app.get("/api/chats")
def list_chats():
    sessions = store.list_sessions()
    if not sessions:
        sessions = [store.create_session()]
    return jsonify({"chats": sessions})


@app.post("/api/chats")
def create_chat():
    payload = request.get_json(silent=True) or {}
    return jsonify(store.create_session(payload.get("title") or "گفتگوی جدید"))


@app.get("/api/chats/<chat_id>")
def get_chat(chat_id: str):
    return jsonify({"id": chat_id, "messages": store.get_history(chat_id, limit=200)})


@app.delete("/api/chats/<chat_id>")
def delete_chat(chat_id: str):
    store.delete_session(chat_id)
    return jsonify({"ok": True})


# --------------------------------------------------------------------- چت
@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "متن پیام خالی است."}), 400

    chat_id = payload.get("chat_id") or store.create_session()["id"]
    store.add_message(chat_id, "user", message)
    history = store.get_history(chat_id)
    settings = store.load_settings()

    def generate():
        parts: list[str] = []
        try:
            for event in agent.run_turn(history, settings):
                if event.get("type") == "delta":
                    parts.append(event.get("text", ""))
                yield _sse(event)
        except ProviderError as exc:
            yield _sse({"type": "error", "message": str(exc)})
        except Exception as exc:  # noqa: BLE001
            yield _sse({"type": "error", "message": f"خطای سرور: {exc}"})
        finally:
            answer = "".join(parts).strip()
            if answer:
                store.add_message(chat_id, "assistant", answer)
            yield _sse({"type": "end", "chat_id": chat_id})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --------------------------------------------------------------------- فضای کاری
@app.get("/api/workspace/tree")
def workspace_tree():
    entries = []
    for path in sorted(tools.WORKSPACE.rglob("*")):
        if any(part in tools.IGNORED_DIRS for part in path.parts):
            continue
        rel = path.relative_to(tools.WORKSPACE).as_posix()
        entries.append(
            {
                "path": rel,
                "type": "dir" if path.is_dir() else "file",
                "size": 0 if path.is_dir() else path.stat().st_size,
            }
        )
    return jsonify({"workspace": str(tools.WORKSPACE), "entries": entries})


@app.route("/api/workspace/file", methods=["GET", "PUT"])
def workspace_file():
    if request.method == "GET":
        rel = request.args.get("path", "")
    else:
        rel = (request.get_json(silent=True) or {}).get("path", "")
    if not rel:
        return jsonify({"error": "مسیر فایل مشخص نشده است."}), 400
    try:
        target = tools.safe_path(rel)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 403

    if request.method == "GET":
        if not target.is_file():
            return jsonify({"error": "فایل پیدا نشد."}), 404
        return jsonify({"path": rel, "content": target.read_text(encoding="utf-8", errors="replace")})

    content = (request.get_json(silent=True) or {}).get("content", "")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return jsonify({"ok": True, "path": rel, "size": len(content)})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "3000"))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
