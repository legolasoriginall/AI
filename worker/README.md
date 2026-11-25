# سرور واسط (Cloudflare Worker)

سایت `docs/` روی GitHub Pages استاتیک است؛ برای اینکه دموی آن صفحه بتواند با مدل واقعی (Numes) کار کند، کلید API باید سمت سرور بماند. این Worker همین کار را می‌کند:

```
مرورگر  →  POST /api/chat  →  Worker (کلید در Secret)  →  api.numes.ai/api/v1/chat/completions
```

کلید هرگز به مرورگر نمی‌رسد، در کد سایت نیست و در گیت هم ذخیره نمی‌شود.

## امکانات

- استریم SSE را بدون بافر به مرورگر پاس می‌دهد (`stream: false` هم پشتیبانی می‌شود).
- فقط مبدأ (Origin) مجاز را می‌پذیرد: `ALLOWED_ORIGINS`.
- مدل و سقف توکن‌ها را سرور تعیین می‌کند؛ مقدار مدلِ فرستاده‌شده از مرورگر نادیده گرفته می‌شود تا کسی مدل گران‌تر انتخاب نکند.
- اعتبارسنجی پیام‌ها (تعداد، نقش، طول) و محدودیت حجم بدنه.
- محدودسازی نرخ ساده و بهترین‌تلاش بر اساس IP (در حافظهٔ هر ایزوله).
- خطاهای بالادست با پیام کوتاه و بدون افشای جزئیات کلید برگردانده می‌شوند.
- مسیر `GET /health` برای بررسی استقرار.
- مسیر `GET /api/models` فهرست مدل‌های مجاز همین سرور را برمی‌گرداند تا «مدیر مدل» دمو بتواند مدل‌های سمت سرور را پیدا و انتخاب کند (متغیر `MODELS`؛ پیش‌فرض همان `MODEL`).

## تست‌ها (بدون شبکه)

```bash
node worker/test.mjs
```

۳۲ بررسی: مسیرها، CORS، Origin غیرمجاز، نبود Secret، نوع محتوا، JSON نامعتبر، اعتبارسنجی پیام، فهرست مدل‌ها، استریم، پاسخ غیراستریم، خطاهای بالادست و محدودسازی نرخ. همه با `fetch` شبیه‌سازی‌شده اجرا می‌شوند و به کلید واقعی نیاز ندارند.

## تست محلی با wrangler dev (بدون کلید)

بدون هیچ حساب Cloudflare و بدون کلید API، Worker را روی دستگاه خودتان اجرا و مسیرهای پایه را بررسی کنید:

```bash
cd worker
npx wrangler dev --port 8787        # ترمینال اول
```

```bash
node smoke.mjs                       # ترمینال دوم، از همان پوشهٔ worker
```

اسکریپت `smoke.mjs` به کلید نیاز ندارد و این‌ها را بررسی می‌کند:

- `GET /health` → ۲۰۰ با `ok: true` و مقدار درست `configured`.
- پیش‌پرواز `OPTIONS` → ۲۰۴ با بازتاب Origin مجاز و اجازهٔ `GET, POST`.
- `GET /api/models` با Origin مجاز → ۲۰۰ و فهرست غیرخالی.
- Origin غیرمجاز روی `/api/models` و `POST /api/chat` → ۴۰۳ `origin_not_allowed` و بدون هدر CORS.
- `GET /api/chat` → ۴۰۵ و مسیر ناشناخته → ۴۰۴.
- بدون کلید: `POST /api/chat` با Origin مجاز → ۵۰۰ `server_not_configured`، بدون افشای کلید.

اگر در `.dev.vars` کلید گذاشته باشید، بررسی «کلید تنظیم نشده» به‌جای خطا `SKIP` می‌شود و در عوض نوع محتوای نادرست (۴۱۵) بررسی می‌شود؛ پس همین اسکریپت روی نسخهٔ مستقرشده هم قابل اجرا است.

آدرس و Originها با متغیر محیطی قابل تغییرند:

```bash
WORKER_URL=http://127.0.0.1:8787 ALLOWED_ORIGIN=https://legolasoriginall.github.io node smoke.mjs
```

اگر `ALLOWED_ORIGINS` را در `wrangler.toml` عوض کردید، `ALLOWED_ORIGIN` را هم همان مقدار بدهید. کد خروج ۱ یعنی بررسی‌ای رد شده و کد ۲ یعنی سرور در آن آدرس بالا نیست.

## استقرار

پیش‌نیاز: حساب Cloudflare (پلن رایگان کافی است) و Node.js.

```bash
cd worker
npx wrangler login
npx wrangler secret put NUMES_API_KEY     # کلید را همین‌جا وارد کنید؛ در فایل ذخیره نمی‌شود
npx wrangler deploy
```

پس از استقرار، آدرسی مثل `https://ai-assistant-proxy.<account>.workers.dev` می‌گیرید.

قبل از استقرار، در `wrangler.toml` این‌ها را با مقادیر خودتان هماهنگ کنید:

| متغیر | معنا |
| --- | --- |
| `ALLOWED_ORIGINS` | دامنه‌های مجاز، با کاما جدا می‌شوند؛ مثلاً `https://legolasoriginall.github.io` |
| `MODEL` | شناسهٔ مدل Numes، مثل `openai/gpt-6-luna` |
| `MAX_TOKENS` | سقف توکن خروجی (حداکثر ۲۰۰۰) |
| `MODELS` | اختیاری: فهرست مدل‌های قابل انتخاب با کاما برای `GET /api/models`؛ اگر خالی باشد فقط `MODEL` معرفی می‌شود |
| `RATE_LIMIT` / `RATE_WINDOW_MS` | تعداد درخواست مجاز در هر بازه برای هر IP |

اگر دامنهٔ دیگری (مثل دامنهٔ پیش‌نمایش) هم دارید، همان را به `ALLOWED_ORIGINS` اضافه کنید؛ در غیر این صورت مرورگر خطای CORS می‌گیرد.

## بررسی سریع

```bash
curl https://ai-assistant-proxy.<account>.workers.dev/health
# {"ok":true,"configured":true,"model":"openai/gpt-6-luna"}

curl https://ai-assistant-proxy.<account>.workers.dev/api/models
# {"models":[{"id":"openai/gpt-6-luna","label":"openai/gpt-6-luna"}],"default":"openai/gpt-6-luna"}

curl -N https://ai-assistant-proxy.<account>.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://legolasoriginall.github.io" \
  -d '{"messages":[{"role":"user","content":"سلام، یک جمله دربارهٔ پروکسی بگو"}]}'
```

اگر `configured:false` دیدید، Secret را دوباره تنظیم کنید. اگر ۴۰۳ گرفتید، `Origin` در `ALLOWED_ORIGINS` نیست.

## آزمایش پیام استریمی با کلید واقعی

کلید را فقط در `.dev.vars` بگذارید (این فایل در `.gitignore` است؛ در `wrangler.toml`، کد یا گیت نباشد):

```bash
cd worker
printf 'NUMES_API_KEY=your-key-here\n' > .dev.vars
npx wrangler dev --port 8787
```

`GET /health` باید `configured: true` بدهد. سپس یک پیام استریمی بفرستید؛ هدر `Origin` باید یکی از مقادیر `ALLOWED_ORIGINS` باشد وگرنه ۴۰۳ می‌گیرید:

```bash
curl -N http://127.0.0.1:8787/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://legolasoriginall.github.io" \
  -d '{"messages":[{"role":"user","content":"سلام، خودت را در یک جمله معرفی کن"}]}'
```

خروجی باید چند خط `data: {...}` و در پایان `data: [DONE]` باشد؛ `-N` بافر شدن curl را خاموش می‌کند تا استریم را زنده ببینید. برای پاسخ یک‌جا و بدون استریم:

```bash
curl -s http://127.0.0.1:8787/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://legolasoriginall.github.io" \
  -d '{"stream":false,"messages":[{"role":"user","content":"سلام"}]}'
# {"text":"...","id":"...","model":"openai/gpt-6-luna"}
```

خطاهای رایج:

| پاسخ | معنا و راه‌حل |
| --- | --- |
| ۴۰۳ `origin_not_allowed` | مقدار `Origin` در `ALLOWED_ORIGINS` نیست |
| ۵۰۰ `server_not_configured` | `.dev.vars` خوانده نشده؛ `wrangler dev` را ری‌استارت کنید |
| ۵۰۲ `upstream_error` | کلید یا شناسهٔ مدل در Numes پذیرفته نشد؛ پیام `message` را ببینید |
| ۴۲۹ | `RATE_LIMIT` برای همان IP پر شده؛ برای تست موقتاً بالا ببرید |

همین بررسی‌ها را روی نسخهٔ مستقرشده هم می‌توانید اجرا کنید (بررسی‌های وابسته به کلید خودکار `SKIP` می‌شوند):

```bash
WORKER_URL=https://ai-assistant-proxy.<account>.workers.dev node smoke.mjs
```

## اتصال دموی سایت

در صفحهٔ سایت، بخش «دموی زنده» → «اتصال مدل»:

1. آدرس Worker را در فیلد **«آدرس سرور واسط»** بگذارید و ذخیره کنید.
2. فیلدهای endpoint/مدل/کلید را خالی بگذارید.

از آن به بعد پیام‌ها با مدل واقعی و به‌صورت استریمی پاسخ داده می‌شوند و هیچ کلیدی در مرورگر نیست. بخش «مدل‌ها» هم مدل‌های همین سرور را از `GET /api/models` می‌خواند.

## نکات امنیتی

- کلید را فقط با `wrangler secret put` بگذارید؛ در `wrangler.toml`، کد، `.env` عمومی یا چت قرار ندهید.
- اگر کلیدی جایی لو رفت، در داشبورد Numes باطلش کنید و Secret را با مقدار تازه به‌روز کنید (`wrangler secret put NUMES_API_KEY`).
- این Worker برای یک دموی شخصی است؛ محدودسازی نرخ آن در حافظه است و بین ایزوله‌ها مشترک نیست. برای ترافیک بالا از Durable Object یا Cloudflare Rate Limiting استفاده کنید.
- هزینهٔ درخواست‌ها به حساب Numes شما می‌رود؛ `MAX_TOKENS` و `RATE_LIMIT` را محافظه‌کارانه تنظیم کنید.
