"""موقت: متن راهنمای scripts/ollama_tunnel.sh را به بخش «مدل‌ها» اضافه می‌کند."""
from __future__ import annotations

from pathlib import Path

INDEX_OLD = """          <p class="muted small">
            دانلود مستقیم از مرورگر فقط وقتی کار می‌کند که Ollama اجازهٔ همین دامنه را داشته باشد:
            <code dir="ltr">OLLAMA_ORIGINS=https://legolasoriginall.github.io ollama serve</code>
          </p>"""

INDEX_NEW = """          <p class="muted small">
            دانلود مستقیم از مرورگر فقط وقتی کار می‌کند که Ollama اجازهٔ همین دامنه را داشته باشد و صفحه با آدرس HTTPS به آن وصل شود:
            <code dir="ltr">OLLAMA_ORIGINS=https://legolasoriginall.github.io ollama serve</code>
            <br />
            راه ساده‌تر: <code dir="ltr">bash scripts/ollama_tunnel.sh</code> — Ollama را با همین دامنه بالا می‌آورد و با cloudflared آدرس <code dir="ltr">https://…trycloudflare.com</code> می‌دهد؛ همان را در فیلد «آدرس Ollama» بگذارید. جزئیات در README، بخش «مدل‌ها».
          </p>"""

JS_OLD = "یا Ollama را پشت یک آدرس HTTPS با CORS بگذارید و همان را اینجا وارد کنید."
JS_NEW = "یا با «bash scripts/ollama_tunnel.sh» یک آدرس HTTPS بسازید و همان را اینجا وارد کنید (راهنما در README، بخش «مدل‌ها»)."


def apply(root: Path) -> None:
    index = root / "docs" / "index.html"
    text = index.read_text(encoding="utf-8")
    if text.count(INDEX_OLD) != 1:
        raise SystemExit(f"لنگر index.html پیدا نشد ({text.count(INDEX_OLD)} بار).")
    index.write_text(text.replace(INDEX_OLD, INDEX_NEW), encoding="utf-8")

    models = root / "docs" / "models.js"
    script = models.read_text(encoding="utf-8")
    if script.count(JS_OLD) != 1:
        raise SystemExit(f"لنگر models.js پیدا نشد ({script.count(JS_OLD)} بار).")
    models.write_text(script.replace(JS_OLD, JS_NEW), encoding="utf-8")


if __name__ == "__main__":
    apply(Path(__file__).resolve().parent.parent)
    print("راهنمای اسکریپت تونل به بخش «مدل‌ها» اضافه شد.")
