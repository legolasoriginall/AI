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
python3 cli.py --system-file prompt.md   # دستور سیستمی از فایل
```

گزینه‌ها: `--session ID` برای ادامهٔ نشست، `--new` برای نشست تازه، `--model` برای مدل آنلاین، `--system-file PATH` برای جایگزینی دستور سیستمی از یک فایل متنی UTF-8.

| دستور داخل چت | کار |
| --- | --- |
| `/help` | راهنما |
| `/new` | نشست تازه |
| `/models` | مدل‌های نصب‌شده و پیشنهادی |
| `/use qwen2.5:3b` | فعال‌کردن مدل نصب‌شده |
| `/status` | ارائه‌دهنده و مدل فعال |
| `/system FILE` | تنظیم دستور سیستمی از فایل (بدون آرگومان: نمایش فعلی) |
| `/exit` | خروج |

`cli.py` خودش `.env` را می‌خواند (بدون `python-dotenv`)، ابزارها را در همان لحظه اجرا می‌کند و خروجی آن‌ها را زیر پاسخ نشان می‌دهد.

## مدل‌های باز محلی در خط فرمان

همهٔ چیزهایی که برای اجرای یک مدل باز روی دستگاه خودت لازم است: از نصب تا اتصال به همین پروژه. بدون کلید API و بدون فرستادن گفتگو به بیرون.

### ۱ · نصب Ollama

بستهٔ رسمی را بگیر و روی `/usr` باز کن (بدون پایپ‌کردن اسکریپت به شل):

```bash
# x86_64
curl -fsSL -o /tmp/ollama.tar.zst https://ollama.com/download/ollama-linux-amd64.tar.zst
sudo tar -xf /tmp/ollama.tar.zst -C /usr

# ARM64 (مثلاً سرورهای Ampere)
curl -fsSL -o /tmp/ollama.tar.zst https://ollama.com/download/ollama-linux-arm64.tar.zst
sudo tar -xf /tmp/ollama.tar.zst -C /usr

# کارت AMD: بستهٔ ROCm را هم روی همان مسیر باز کن
curl -fsSL -o /tmp/ollama-rocm.tar.zst https://ollama.com/download/ollama-linux-amd64-rocm.tar.zst
sudo tar -xf /tmp/ollama-rocm.tar.zst -C /usr
```

اگر `tar` از zstd پشتیبانی نکرد: `sudo apt install -y zstd` (یا `sudo dnf install -y zstd`).

بررسی نصب:

```bash
ollama -v
```

اجرای موقت (تا وقتی ترمینال باز است):

```bash
ollama serve
```

اجرای دائمی با systemd — یک فایل واحد بساز:

```ini
# /etc/systemd/system/ollama.service
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false -U -m -d /usr/share/ollama ollama
sudo systemctl daemon-reload
sudo systemctl enable --now ollama
systemctl status ollama --no-pager
```

پیش‌فرض Ollama فقط روی `127.0.0.1:11434` گوش می‌دهد؛ برای همین پروژه همین کافی است.

### ۲ · انتخاب مدل

قاعدهٔ سرانگشتی: در کوانتیزهٔ پیش‌فرض (Q4_K_M) هر یک میلیارد پارامتر حدود ۰٫۸ گیگابایت فایل مدل است و هنگام اجرا کمی بیشتر رم می‌خواهد. مدل باید در رم جا شود، وگرنه بخشی روی CPU/دیسک می‌افتد و کند می‌شود. خود پروژه در حالت `auto` بزرگ‌ترین مدلی را برمی‌دارد که در ۶۰٪ رم جا شود.

| مدل | حجم دانلود | رم پیشنهادی | مناسب برای |
| --- | --- | --- | --- |
| `llama3.2:1b` | ۱٫۳ GB | ۸ GB | سبک‌ترین؛ دستگاه کم‌رم |
| `llama3.2:3b` | ۲٫۰ GB | ۸ GB | تعادل کیفیت و سرعت |
| `qwen2.5:3b` | ۱٫۹ GB | ۸ GB | فارسی و عربی بهتر |
| `gemma2:2b` | ۱٫۶ GB | ۸ GB | پاسخ کوتاه و مرتب |
| `qwen2.5:7b` | ۴٫۷ GB | ۱۶ GB | کد و متن فارسی باکیفیت‌تر |
| `llama3.1:8b` | ۴٫۹ GB | ۱۶ GB | کارهای طولانی و عمومی |

```bash
ollama list                 # مدل‌های نصب‌شده و حجمشان
ollama show qwen2.5:3b      # پارامترها، کوانتیزه و قالب پرامپت
ollama ps                   # مدل‌های در حال اجرا و تقسیم CPU/GPU
ollama rm llama3.2:1b       # آزادکردن فضا
```

نام دقیق کوانتیزه را می‌توانی صریح بدهی: `qwen2.5:3b-instruct-q8_0` (کیفیت بالاتر، حجم بیشتر) یا `qwen2.5:3b-instruct-q4_K_M` (سبک‌تر). ابزار `install_model` خودِ پروژه فقط نام‌های فهرست بالا را نصب می‌کند؛ برای بقیه از `ollama pull` استفاده کن.

### ۳ · گرفتن و اجرای مدل

```bash
ollama pull qwen2.5:3b
ollama run qwen2.5:3b "در یک خط بگو لینوکس چیست"
```

اولین پاسخ کند است چون وزن‌ها از دیسک خوانده می‌شوند؛ پاسخ‌های بعدی سریع‌ترند. برای گفتگوی تعاملی همان `ollama run qwen2.5:3b` را بدون آرگومان بزن (خروج با `/bye`).

بررسی سرویس و API (همان دو مسیری که پروژه صدا می‌زند):

```bash
curl -s http://localhost:11434/api/tags

curl -s http://localhost:11434/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:3b","messages":[{"role":"user","content":"سلام"}],"stream":false}'
```

پاسخ دوم باید یک آبجکت JSON با `message.content` باشد. اگر `connection refused` گرفتی، سرویس بالا نیست؛ اگر `model not found` گرفتی، اسم مدل در `ollama list` را بگذار.

### ۴ · اتصال به پروژه

در `.env` همان پوشهٔ `cli.py`:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

بعد از این، پروژه اول سراغ همین مدل می‌رود و تا وقتی پاسخ بدهد سراغ سرویس‌های آنلاین نمی‌رود:

```bash
python3 cli.py --list-models
# Ollama: http://localhost:11434
#   • qwen2.5:3b (1.9 GB)
# پیشنهاد: llama3.2:1b, llama3.2:3b, qwen2.5:3b, ...

python3 cli.py --provider ollama --ollama-model qwen2.5:3b
```

داخل گفتگو:

```
/models            فهرست نصب‌شده‌ها + پیشنهاد دانلود
/use qwen2.5:3b    همین مدل را فعال کن (در تنظیمات می‌ماند)
/status            ارائه‌دهنده و مدل فعال
```

همین کارها را می‌توانی به خود عامل بسپاری: «چه مدل‌هایی نصب است؟»، «مدل qwen2.5:3b را نصب کن»، «مدل فعال را عوض کن» (ابزارهای `list_models`، `install_model`، `use_model`).

در Docker روی لینوکس، `localhost` داخل کانتینر به میزبان اشاره نمی‌کند؛ یکی از این دو را بگذار:

```bash
docker run --rm -it --network=host --env-file .env -v "$PWD/workspace:/app/workspace" assistant

# یا بدون host network:
docker run --rm -it --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  --env-file .env -v "$PWD/workspace:/app/workspace" assistant
```

### ۵ · تنظیم سرعت و حافظه

این‌ها را با `sudo systemctl edit ollama` در بخش `[Service]` بگذار، بعد `sudo systemctl daemon-reload && sudo systemctl restart ollama`:

```ini
[Service]
Environment="OLLAMA_KEEP_ALIVE=30m"
Environment="OLLAMA_MODELS=/srv/ollama/models"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
```

- `OLLAMA_KEEP_ALIVE` (پیش‌فرض `5m`): مدل بعد از آخرین استفاده چند دقیقه در رم بماند؛ مقدار بیشتر یعنی پاسخ اولِ سریع‌تر و رم اشغال‌تر. `-1` یعنی همیشه بمان.
- `OLLAMA_MODELS`: جای فایل‌های مدل؛ اگر خانهٔ کاربر `ollama` روی دیسک کوچک است، به مسیر بزرگ‌تر منتقلش کن.
- `OLLAMA_MAX_LOADED_MODELS`: با ۱ مدل، رم کمتری اشغال می‌شود؛ برای چند مدل هم‌زمان بالاترش ببر.
- `OLLAMA_CONTEXT_LENGTH`: پنجرهٔ متن؛ برای کد و فایل‌های بزرگ بالاتر (مثلاً `8192`) بگذار و بدان که رم بیشتری می‌خواهد.

`ollama ps` ستون `PROCESSOR` را نشان می‌دهد؛ اگر `100% CPU` دیدی یعنی مدل در حافظهٔ کارت جا نشده و باید مدل کوچک‌تر یا کوانتیزهٔ سبک‌تر بگیری.

### ۶ · عیب‌یابی

| نشانه | علت و راه‌حل |
| --- | --- |
| `connection refused` روی ۱۱۴۳۴ | سرویس بالا نیست: `systemctl start ollama` یا `ollama serve` |
| `model not found` | اسم دقیق از `ollama list` را بده؛ با `ollama pull` نصبش کن |
| پاسخ اول خیلی کند | وزن‌ها سرد هستند: `OLLAMA_KEEP_ALIVE=30m` یا یک `ollama run` گرم‌کننده |
| کشته‌شدن یا `out of memory` | مدل بزرگ‌تر از رم است: مدل کوچک‌تر یا کوانتیزهٔ `q4` |
| پورت ۱۱۴۳۴ اشغال است | `OLLAMA_HOST=127.0.0.1:11435` و همان آدرس را در `OLLAMA_URL` بگذار |
| فایل‌ها در `/usr/share/ollama` جا نمی‌شوند | `OLLAMA_MODELS` را به مسیر دیگر بده و مالکیت را به کاربر `ollama` بده |

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
