#!/usr/bin/env bash
# استقرار Worker با یک دستور: بررسی ورود، گذاشتن Secret در صورت نبود، deploy،
# چاپ آدرس نهایی و اجرای همان لحظه‌ای smoke.mjs روی نسخهٔ مستقرشده.
#
# نمونه:
#   bash scripts/deploy_worker.sh
#   bash scripts/deploy_worker.sh --dry-run
#   bash scripts/deploy_worker.sh --skip-smoke
#   NUMES_API_KEY=... bash scripts/deploy_worker.sh     # بدون پرسش تعاملی
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker"
SECRET_NAME="${SECRET_NAME:-NUMES_API_KEY}"
DRY_RUN=0
RUN_SMOKE=1

usage() {
  cat <<'EOF'
استفاده: bash scripts/deploy_worker.sh [گزینه‌ها]

  --dry-run        فقط مراحل و دستورها را نشان بده، هیچ‌چیز اجرا یا deploy نکن
  --skip-smoke     بعد از deploy، smoke.mjs را اجرا نکن
  --secret NAME    نام Secret (پیش‌فرض NUMES_API_KEY)
  -h, --help       همین راهنما

متغیرها: NUMES_API_KEY (اگر تعاملی نباشید)، SECRET_NAME، WRANGLER
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-smoke)
      RUN_SMOKE=0
      shift
      ;;
    --secret)
      SECRET_NAME="${2:?--secret به یک نام نیاز دارد}"
      shift 2
      ;;
    --secret=*)
      SECRET_NAME="${1#*=}"
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

if ! [[ "$SECRET_NAME" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
  echo "نام Secret باید مثل NUMES_API_KEY باشد (حروف بزرگ، عدد و _)." >&2
  exit 2
fi

if [[ -n "${WRANGLER:-}" ]]; then
  WRANGLER_CMD=("$WRANGLER")
else
  WRANGLER_CMD=(npx --yes wrangler)
fi
WRANGLER_TEXT="${WRANGLER_CMD[*]}"

if [[ "$DRY_RUN" == 1 ]]; then
  cat <<EOF
[1/4] بررسی ورود:      (cd worker && $WRANGLER_TEXT whoami)
[2/4] بررسی Secret:    (cd worker && $WRANGLER_TEXT secret list)
      اگر «$SECRET_NAME» نبود: printf '%s' "\$$SECRET_NAME" | (cd worker && $WRANGLER_TEXT secret put $SECRET_NAME)
[3/4] استقرار:         (cd worker && $WRANGLER_TEXT deploy)
[4/4] آزمایش نسخهٔ مستقر: WORKER_URL=<آدرس workers.dev> node worker/smoke.mjs
EOF
  exit 0
fi

for command_name in node npx; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "«$command_name» روی PATH نیست؛ Node.js نصب کنید." >&2
    exit 1
  }
done

cd "$WORKER_DIR"

echo "[1/4] بررسی ورود به Cloudflare…"
if ! "${WRANGLER_CMD[@]}" whoami >/tmp/wrangler-whoami.$$ 2>&1; then
  cat /tmp/wrangler-whoami.$$ >&2
  rm -f /tmp/wrangler-whoami.$$
  echo "" >&2
  echo "وارد حساب Cloudflare نشده‌اید. یک بار اجرا کنید:  cd worker && $WRANGLER_TEXT login" >&2
  exit 3
fi
rm -f /tmp/wrangler-whoami.$$
echo "ورود تأیید شد."

echo "[2/4] بررسی Secret «$SECRET_NAME»…"
secrets="$("${WRANGLER_CMD[@]}" secret list 2>/dev/null || true)"
if grep -q "\"name\"[[:space:]]*:[[:space:]]*\"$SECRET_NAME\"" <<<"$secrets"; then
  echo "Secret از قبل تنظیم شده است."
else
  if [[ -n "${!SECRET_NAME:-}" ]]; then
    printf '%s' "${!SECRET_NAME}" | "${WRANGLER_CMD[@]}" secret put "$SECRET_NAME"
    echo "Secret از متغیر محیطی $SECRET_NAME تنظیم شد."
  elif [[ -t 0 ]]; then
    read -rsp "مقدار $SECRET_NAME را وارد کنید (نمایش داده نمی‌شود): " secret_value
    echo ""
    if [[ -z "$secret_value" ]]; then
      echo "مقدار خالی بود؛ Secret تنظیم نشد." >&2
      exit 3
    fi
    printf '%s' "$secret_value" | "${WRANGLER_CMD[@]}" secret put "$SECRET_NAME"
    unset secret_value
    echo "Secret تنظیم شد."
  else
    echo "Secret «$SECRET_NAME» تنظیم نشده و ورودی تعاملی هم نیست." >&2
    echo "یک بار این را اجرا کنید یا متغیر محیطی $SECRET_NAME را بدهید:  cd worker && $WRANGLER_TEXT secret put $SECRET_NAME" >&2
    exit 3
  fi
fi

echo "[3/4] استقرار…"
deploy_log="$(mktemp)"
trap 'rm -f "$deploy_log"' EXIT
if ! "${WRANGLER_CMD[@]}" deploy 2>&1 | tee "$deploy_log"; then
  echo "استقرار شکست خورد (خروجی بالا)." >&2
  exit 4
fi

WORKER_URL="$(grep -Eo 'https://[A-Za-z0-9._-]+\.workers\.dev' "$deploy_log" | head -n 1 || true)"
if [[ -z "$WORKER_URL" ]]; then
  echo "آدرس نسخهٔ مستقرشده در خروجی wrangler پیدا نشد؛ خروجی بالا را ببینید." >&2
  exit 4
fi

cd "$ROOT_DIR"
echo ""
echo "آدرس نهایی: $WORKER_URL"

if [[ "$RUN_SMOKE" == 1 ]]; then
  echo "[4/4] اجرای smoke روی نسخهٔ مستقرشده…"
  echo ""
  if ! WORKER_URL="$WORKER_URL" node "$WORKER_DIR/smoke.mjs"; then
    echo "" >&2
    echo "smoke روی نسخهٔ مستقرشده رد شد (خروجی بالا). استقرار انجام شده ولی نسخه سالم نیست." >&2
    exit 5
  fi
else
  echo "[4/4] smoke رد شد (--skip-smoke)."
fi

cat <<EOF

تمام شد.
آدرس Worker: $WORKER_URL
مرحلهٔ بعد: در سایت، بخش «دموی زنده» → «اتصال مدل» → «آدرس سرور واسط» همین آدرس را بگذارید.
EOF
