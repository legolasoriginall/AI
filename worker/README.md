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

## تست‌ها (بدون شبکه)

```bash
node worker/test.mjs
```

۲۷ بررسی: مسیرها، CORS، Origin غیرمجاز، نبود Secret، نوع محتوا، JSON نامعتبر، اعتبارسنجی پیام، استریم، پاسخ غیراستریم، خطاهای بالادست و محدودسازی نرخ. همه با `fetch` شبیه‌سازی‌شده اجرا می‌شوند و به کلید واقعی نیاز ندارند.

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
| `RATE_LIMIT` / `RATE_WINDOW_MS` | تعداد درخواست مجاز در هر بازه برای هر IP |

اگر دامنهٔ دیگری (مثل دامنهٔ پیش‌نمایش) هم دارید، همان را به `ALLOWED_ORIGINS` اضافه کنید؛ در غیر این صورت مرورگر خطای CORS می‌گیرد.

## بررسی سریع

```bash
curl https://ai-assistant-proxy.<account>.workers.dev/health
# {"ok":true,"configured":true,"model":"openai/gpt-6-luna"}

curl -N https://ai-assistant-proxy.<account>.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://legolasoriginall.github.io" \
  -d '{"messages":[{"role":"user","content":"سلام، یک جمله دربارهٔ پروکسی بگو"}]}'
```

اگر `configured:false` دیدید، Secret را دوباره تنظیم کنید. اگر ۴۰۳ گرفتید، `Origin` در `ALLOWED_ORIGINS` نیست.

## اتصال دموی سایت

در صفحهٔ سایت، بخش «دموی زنده» → «اتصال مدل»:

1. آدرس Worker را در فیلد **«آدرس سرور واسط»** بگذارید و ذخیره کنید.
2. فیلدهای endpoint/مدل/کلید را خالی بگذارید.

از آن به بعد پیام‌ها با مدل واقعی و به‌صورت استریمی پاسخ داده می‌شوند و هیچ کلیدی در مرورگر نیست.

## نکات امنیتی

- کلید را فقط با `wrangler secret put` بگذارید؛ در `wrangler.toml`، کد، `.env` عمومی یا چت قرار ندهید.
- اگر کلیدی جایی لو رفت، در داشبورد Numes باطلش کنید و Secret را با مقدار تازه به‌روز کنید (`wrangler secret put NUMES_API_KEY`).
- این Worker برای یک دموی شخصی است؛ محدودسازی نرخ آن در حافظه است و بین ایزوله‌ها مشترک نیست. برای ترافیک بالا از Durable Object یا Cloudflare Rate Limiting استفاده کنید.
- هزینهٔ درخواست‌ها به حساب Numes شما می‌رود؛ `MAX_TOKENS` و `RATE_LIMIT` را محافظه‌کارانه تنظیم کنید.
