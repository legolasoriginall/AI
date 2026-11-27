# دستیار دیجیتال (AI) — دستیار خط فرمان لینوکس

یک دستیار شخصی فارسی‌زبان برای ترمینال: هم **آفلاین** (Ollama) و هم **آنلاین** (Gemini، Groq، OpenRouter free یا هر API سازگار با OpenAI) کار می‌کند؛ فایل می‌سازد، دستور bash اجرا می‌کند و اطلاعات را در حافظهٔ محلی نگه می‌دارد.

بدون رابط وب، بدون Flask و بدون محیط دمو: تنها محیط اجرا، خط فرمان لینوکس (`bash`) است. تاریخچهٔ گفتگوها در SQLite روی همان دستگاه می‌ماند.

## امکانات

- **دو حالت اجرا:** آفلاین با Ollama، آنلاین با Gemini یا endpoint سازگار با OpenAI؛ انتخاب خودکار در حالت `auto`.
- **میزبانی رایگان اول:** مدل محلی، بعد سرویس‌های رایگان با کلید، و در آخر سرویس پولی.
- **ابزارها:** فهرست فایل‌ها، خواندن/نوشتن فایل و اجرای هر دستور bash (پایپ، ریدایرکت، sudo) — از داخل پوشهٔ `workspace`.
- **حافظه:** ثبت و بازیابی حقایق (`remember` / `recall`) و تزریق خودکار خاطرات مرتبط به دستور سیستمی.
- **گفتگو با استریم:** پاسخ‌ها همان لحظه روی ترمینال می‌آیند و JSON خام ابزار چاپ نمی‌شود.
- **چند گفتگو:** نشست تازه با `/new`؛ تاریخچه در SQLite ذخیره می‌شود.
- **مدیریت مدل:** فهرست مدل‌های نصب‌شده، نصب مدل پیشنهادی و انتخاب مدل فعال — با `/models`، `/use` یا ابزارهای عامل.
- **دستور سیستمی باز:** بدون محدودیت موضوعی و بدون امتناع.
- **کلیدها:** فقط از `.env` خوانده می‌شوند و در کد نیستند.

## پیش‌نیازها

- لینوکس و `bash`
- پایتون ۳.۱۰ یا بالاتر
- برای حالت آفلاین: [Ollama](https://ollama.com) روی همان دستگاه

## نصب

```bash
git clone https://github.com/legolasoriginall/AI.git
cd AI
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # اختیاری: کلید یا آدرس مدل
```

اگر `python3-venv` نصب نیست:

```bash
sudo apt install -y python3 python3-venv   # دبیان/اوبونتو
sudo dnf install -y python3 python3-pip    # فدورا
```

## اجرا

```bash
python3 cli.py                 # گفتگوی تعاملی با استریم
python3 cli.py -m "سلام"        # یک پیام و خروج
python3 cli.py --list-models   # مدل‌های نصب‌شده و پیشنهادی
python3 cli.py --provider ollama --ollama-model qwen2.5:3b
```

گزینه‌ها: `--session ID` برای ادامهٔ نشست، `--new` برای نشست تازه، `--model` برای مدل آنلاین.

| دستور داخل چت | کار |
| --- | --- |
| `/help` | راهنما |
| `/new` | نشست تازه |
| `/models` | مدل‌های نصب‌شده و پیشنهادی |
| `/use qwen2.5:3b` | فعال‌کردن مدل نصب‌شده |
| `/status` | ارائه‌دهنده و مدل فعال |
| `/exit` | خروج |

`cli.py` خودش `.env` را می‌خواند (بدون `python-dotenv`)، ابزارها را در همان لحظه اجرا می‌کند و خروجی آن‌ها را زیر پاسخ نشان می‌دهد.

## حالت آفلاین (Ollama)

```bash
ollama serve
ollama pull qwen2.5:3b
```

بدون هیچ کلیدی کار می‌کند. اگر آدرس Ollama جای دیگری است، در `.env` بگذارید:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

## حالت آنلاین

در `.env` یکی از این‌ها را بگذارید:

```env
# هر API سازگار با OpenAI
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=...
ONLINE_MODEL=gpt-4o-mini

# یا Gemini
GEMINI_API_KEY=...

# یا سرویس رایگان
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

### Numes.ai

```env
OPENAI_BASE_URL=https://api.numes.ai/api/v1
OPENAI_API_KEY=...
ONLINE_MODEL=openai/gpt-6-luna
```

کلیدها را فقط در `.env` یا متغیر محیطی همان شل بگذارید؛ `.env` در `.gitignore` است.

## انتخاب خودکار بهترین مدل رایگان

حالت `auto` بدون تنظیم دستی این ترتیب را امتحان می‌کند و اولین پاسخ‌دهنده برنده است:

1. **Ollama محلی** — بزرگ‌ترین مدل نصب‌شده که در ۶۰٪ رم جا شود، با اولویت `qwen` و `llama`. بدون کلید.
2. **Gemini** — با `GEMINI_API_KEY`.
3. **Groq** — با `GROQ_API_KEY` (`llama-3.3-70b-versatile`).
4. **OpenRouter free** — با `OPENROUTER_API_KEY` (`meta-llama/llama-3.3-70b-instruct:free`).
5. در آخر `OPENAI_*` پولی و fallback عمومی (پیش‌فرض خاموش).

| سرویس | متغیر `.env` | مدل پیش‌فرض |
| --- | --- | --- |
| Ollama | — | خودکار از مدل‌های نصب‌شده |
| Gemini | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| OpenRouter | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` |

### فهرست پیشنهادی

`llama3.2:1b` · `llama3.2:3b` · `qwen2.5:3b` · `gemma2:2b` · `qwen2.5:7b` · `llama3.1:8b`

فهرست در `providers.MODEL_CATALOG` نگه داشته می‌شود؛ نام مدل پیش از نصب اعتبارسنجی می‌شود و فقط نام‌های همین فهرست با ابزار عامل قابل نصب‌اند.

## ابزارهای عامل

| ابزار | کار |
| --- | --- |
| `list_files` | فهرست فایل‌های `workspace` |
| `read_file` | خواندن کامل فایل |
| `write_file` | ساخت/بازنویسی فایل |
| `run_command` | اجرای دستور با `bash -lc` در `workspace` |
| `remember` / `recall` | حافظهٔ محلی |
| `list_models` / `install_model` / `use_model` | مدیریت مدل‌های Ollama |

مسیرهای ابزارهای فایل به `workspace` محدود شده‌اند (ضد Path Traversal و symlink)؛ خود `run_command` فیلتر یا allowlist ندارد و آزادانه با bash کار می‌کند.

## نحوهٔ کار عامل

مدل با یک دستور سیستمی راهنما می‌شود که هرگاه به ابزار نیاز داشت، فقط یک آبجکت JSON برگرداند:

```json
{"tool": "write_file", "args": {"path": "hello.py", "content": "print('سلام')"}}
```

برنامه ابزار را اجرا می‌کند، نتیجه را به مدل برمی‌گرداند و این چرخه تا پاسخ نهایی (یا سقف `max_steps`) ادامه دارد.

## ساختار پروژه

| فایل | نقش |
| --- | --- |
| `cli.py` | چت ترمینالی با استریم، دستورهای اسلش و اجرای ابزارها |
| `providers.py` | روتر مدل‌ها: Ollama، Gemini، Groq/OpenRouter free، OpenAI-compatible |
| `agent.py` | حلقهٔ عامل: پارس کنش JSON، اجرای ابزار، پاسخ نهایی |
| `tools.py` | ابزارهای فایل/شل/حافظه؛ bash بدون فیلتر |
| `store.py` | SQLite برای نشست‌ها، پیام‌ها و حقایق + تنظیمات |
| `tests/` | تست‌های pytest (بدون شبکهٔ بیرونی) |
| `workspace/` | پوشهٔ کار ابزارها (محتوا در گیت نیست) |

## Docker

```bash
docker build -t assistant .
docker run --rm -it --env-file .env -v "$PWD/workspace:/app/workspace" assistant -m "سلام"
```

یا با Compose:

```bash
docker compose run --rm assistant        # شل تعاملی CLI
```

## عیب‌یابی

- **«هیچ مدلی در دسترس نیست»** → `ollama serve` اجرا است؟ `python3 cli.py --list-models` را ببینید؛ یا یکی از کلیدها را در `.env` بگذارید.
- **Ollama جواب نمی‌دهد** → `curl http://localhost:11434/api/tags` را امتحان کنید و `OLLAMA_URL` را درست بگذارید.
- **پاسخ خیلی کند است** → مدل کوچک‌تر نصب کنید (`llama3.2:1b`) یا مدل فعال را با `/use` عوض کنید.
- **مدل JSON ابزار را درست نمی‌سازد** → مدل بزرگ‌تر (۷B به بالا) یا سرویس آنلاین رایگان را امتحان کنید.
- **کلید کار نمی‌کند** → مطمئن شوید `.env` در همان پوشهٔ `cli.py` است و متغیر در شل دیگری override نشده است.

## محدودیت‌ها

- کیفیت پاسخ به مدل انتخابی وابسته است؛ مدل‌های کوچک محلی ممکن است در تولید JSON درست ضعیف باشند.
- اجرای دستور شل برای دستیار محلی طراحی شده است، نه برای سرویس عمومی؛ این پروژه هیچ لایهٔ شبکه‌ای یا احراز هویتی ندارد.
- فیلتر محتوای مدل‌ها در خود مدل است، نه در این برنامه.
- `allow_public_fallback` پیش‌فرض خاموش است، چون داده را به یک سرویس عمومی می‌فرستد.
