#!/usr/bin/env bash
# تست دود دستورهای مستندشده: venv تازه، نصب وابستگی‌ها، Ollama بدلی و cli.py.
#
#   bash scripts/smoke_cli.sh            # venv موقت می‌سازد و در پایان پاک می‌کند
#   KEEP_VENV=1 bash scripts/smoke_cli.sh  # venv را نگه می‌دارد
#   SMOKE_PORT=11500 ...                 # پورت Ollama بدلی
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
VENV="${VENV:-.venv-smoke}"
PORT="${SMOKE_PORT:-11500}"
BASE="http://127.0.0.1:${PORT}"
OUT="$(mktemp)"
STUB_PID=""

cleanup() {
  if [[ -n "$STUB_PID" ]]; then
    kill "$STUB_PID" 2>/dev/null || true
    wait "$STUB_PID" 2>/dev/null || true
  fi
  rm -f "$ROOT/.env" "$ROOT/.settings.json" "$OUT"
  if [[ "${KEEP_VENV:-0}" != "1" ]]; then
    rm -rf "$VENV"
  fi
}
trap cleanup EXIT

echo "== venv تازه: $VENV =="
rm -rf "$VENV"
"$PYTHON" -m venv "$VENV"
"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet -r requirements.txt

echo "== Ollama بدلی روی $BASE =="
"$VENV/bin/python" scripts/stub_ollama.py "$PORT" &
STUB_PID=$!
for _ in $(seq 1 50); do
  if curl -sf "$BASE/api/tags" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
if ! curl -sf "$BASE/api/tags" >/dev/null 2>&1; then
  echo "Ollama بدلی بالا نیامد" >&2
  exit 1
fi

printf 'OLLAMA_URL=%s\nOLLAMA_MODEL=qwen2.5:3b\n' "$BASE" > .env

echo "== cli.py --list-models =="
LISTED="$("$VENV/bin/python" cli.py --list-models)"
grep -q "qwen2.5:3b" <<<"$LISTED"
grep -q "$BASE" <<<"$LISTED"

echo "== cli.py -m ... --json =="
"$VENV/bin/python" cli.py -m "سلام" --json >"$OUT"
"$VENV/bin/python" - "$OUT" <<'PY'
import json
import sys

events = [json.loads(line) for line in open(sys.argv[1], encoding="utf-8") if line.strip()]
types = [event["type"] for event in events]
assert types[-1] == "final", types
assert "token" in types, types
text = "".join(event.get("text", "") for event in events if event["type"] == "token")
assert "مدل" in text, text
print("رخدادها:", " ".join(types))
PY

echo "== دستورهای اسلش در حالت JSON =="
printf '/tools\n/model\n' | "$VENV/bin/python" cli.py --json >"$OUT"
"$VENV/bin/python" - "$OUT" <<'PY'
import json
import sys

events = [json.loads(line) for line in open(sys.argv[1], encoding="utf-8") if line.strip()]
assert [event["type"] for event in events] == ["tools", "model"], events
names = [tool["name"] for tool in events[0]["tools"]]
assert "run_command" in names and "read_file" in names, names
assert events[1]["provider"] == "auto", events[1]
print("ابزارها:", len(names))
PY

echo "== cli.py --help =="
"$VENV/bin/python" cli.py --help >/dev/null

echo "همهٔ بررسی‌ها سبز."
