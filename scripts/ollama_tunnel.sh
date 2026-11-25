#!/usr/bin/env bash
# Ollama را با OLLAMA_ORIGINS درست بالا می‌آورد و با cloudflared یک آدرس HTTPS می‌دهد،
# تا مدیر مدل روی GitHub Pages بدون خطای mixed content و بدون CORS کار کند.
#
# نمونه:
#   bash scripts/ollama_tunnel.sh
#   bash scripts/ollama_tunnel.sh --port 11434 --origin https://example.dev
#   bash scripts/ollama_tunnel.sh --dry-run
set -euo pipefail

PAGES_ORIGIN="${PAGES_ORIGIN:-https://legolasoriginall.github.io}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1}"
PORT="${PORT:-11434}"
DRY_RUN=0
EXTRA_ORIGINS=()

usage() {
  cat <<'EOF'
استفاده: bash scripts/ollama_tunnel.sh [گزینه‌ها]

  --port N         پورت Ollama (پیش‌فرض 11434 یا مقدار PORT)
  --origin URL     دامنهٔ اضافی برای OLLAMA_ORIGINS (چند بار قابل تکرار)
  --dry-run        فقط دستورها و مقدار OLLAMA_ORIGINS را نشان بده، چیزی اجرا نکن
  -h, --help       همین راهنما

متغیرهای محیطی: PAGES_ORIGIN، OLLAMA_HOST، PORT
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="${2:?--port به شمارهٔ پورت نیاز دارد}"
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      shift
      ;;
    --origin)
      EXTRA_ORIGINS+=("${2:?--origin به یک آدرس نیاز دارد}")
      shift 2
      ;;
    --origin=*)
      EXTRA_ORIGINS+=("${1#*=}")
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "گزینهٔ ناشناخته: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "پورت باید عدد باشد (دریافت شد: $PORT)." >&2
  exit 2
fi

# دامنهٔ سایت Pages + نسخهٔ محلی Flask + هر دامنهٔ اضافی که کاربر می‌دهد.
ORIGINS="$PAGES_ORIGIN,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
for origin in ${EXTRA_ORIGINS[@]+"${EXTRA_ORIGINS[@]}"}; do
  [[ -n "$origin" ]] && ORIGINS="$ORIGINS,$origin"
done

BASE_URL="http://$OLLAMA_HOST:$PORT"

if [[ "$DRY_RUN" == 1 ]]; then
  cat <<EOF
OLLAMA_ORIGINS=$ORIGINS
OLLAMA_HOST=$OLLAMA_HOST:$PORT ollama serve
cloudflared tunnel --url $BASE_URL --no-autoupdate
# سپس آدرس https://…trycloudflare.com را در بخش «مدل‌ها» → «آدرس Ollama» بگذارید.
EOF
  exit 0
fi

for command_name in ollama cloudflared curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "«$command_name» روی PATH پیدا نشد." >&2
    case "$command_name" in
      ollama) echo "نصب: https://ollama.com/download" >&2 ;;
      cloudflared) echo "نصب: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2 ;;
    esac
    exit 1
  fi
done

LOG_DIR="${TMPDIR:-/tmp}"
SERVE_LOG="$LOG_DIR/ollama-tunnel-serve.log"
TUNNEL_LOG="$LOG_DIR/ollama-tunnel-cloudflared.log"
OLLAMA_PID=""
TUNNEL_PID=""

cleanup() {
  # فقط فرآیندهایی که خودمان ساختیم؛ هرگز با الگوی نام پروسه چیزی کشته نمی‌شود.
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  if [[ -n "$OLLAMA_PID" ]] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
    kill "$OLLAMA_PID" 2>/dev/null || true
    wait "$OLLAMA_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

ollama_ready() {
  curl -fsS --max-time 2 "$BASE_URL/api/tags" >/dev/null 2>&1
}

if ollama_ready; then
  echo "Ollama از قبل روی $BASE_URL در حال اجراست."
  echo "توجه: OLLAMA_ORIGINS فقط هنگام شروع فرآیند خوانده می‌شود؛ اگر آن را با"
  echo "OLLAMA_ORIGINS=$ORIGINS اجرا نکرده‌اید، ابتدا آن را ببندید و این اسکریپت را دوباره اجرا کنید."
else
  echo "اجرای Ollama روی $BASE_URL با OLLAMA_ORIGINS=$ORIGINS"
  OLLAMA_ORIGINS="$ORIGINS" OLLAMA_HOST="$OLLAMA_HOST:$PORT" \
    nohup ollama serve >"$SERVE_LOG" 2>&1 &
  OLLAMA_PID=$!

  for _ in $(seq 1 60); do
    if ollama_ready; then
      break
    fi
    if ! kill -0 "$OLLAMA_PID" 2>/dev/null; then
      echo "Ollama بالا نیامد. لاگ: $SERVE_LOG" >&2
      tail -n 20 "$SERVE_LOG" >&2 || true
      exit 1
    fi
    sleep 0.5
  done
  if ! ollama_ready; then
    echo "Ollama در ۳۰ ثانیه پاسخ نداد. لاگ: $SERVE_LOG" >&2
    exit 1
  fi
  echo "Ollama آماده است."
fi

echo "ساخت تونل HTTPS با cloudflared…"
cloudflared tunnel --url "$BASE_URL" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -n 1 || true)"
  if [[ -n "$PUBLIC_URL" ]]; then
    break
  fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "cloudflared بسته شد. لاگ: $TUNNEL_LOG" >&2
    tail -n 20 "$TUNNEL_LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "آدرس تونل در ۶۰ ثانیه پیدا نشد. لاگ: $TUNNEL_LOG" >&2
  exit 1
fi

cat <<EOF

آدرس HTTPS آماده است:
  $PUBLIC_URL

۱. صفحهٔ مدل‌ها را باز کنید: $PAGES_ORIGIN/AI/
۲. در «آدرس Ollama» همین آدرس را بگذارید و «جست‌وجوی دوباره» را بزنید.
۳. نصب و اجرای مدل از همان صفحه انجام می‌شود.

این تونل موقت و عمومی است؛ تا وقتی این اسکریپت باز است فعال می‌ماند.
برای بستن: Ctrl+C (فرآیندهای همین اسکریپت خاموش می‌شوند).
EOF

wait "$TUNNEL_PID" 2>/dev/null || true
