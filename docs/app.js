/* دموی استاتیک دستیار دیجیتال
   حالت پیش‌فرض «نمایشی» است و بدون شبکه کار می‌کند.
   اگر کاربر endpoint سازگار با OpenAI وصل کند، پاسخ‌ها واقعی و استریمی می‌شوند. */

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const messagesEl = $("#messages");
  const inputEl = $("#input");
  const composerEl = $("#composer");
  const modeLabel = $("#modeLabel");
  const modeHint = $("#modeHint");
  const settingsForm = $("#settingsForm");
  const baseUrlEl = $("#baseUrl");
  const modelNameEl = $("#modelName");
  const apiKeyEl = $("#apiKey");

  const STORE_KEY = "assistant.settings.v1";

  let settings = { baseUrl: "", model: "", apiKey: "" };
  let busy = false;
  let controller = null;

  /* ------------------------------------------------------------ تنظیمات */
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      settings = { baseUrl: "", model: "", apiKey: "", ...saved };
    } catch {
      settings = { baseUrl: "", model: "", apiKey: "" };
    }
    baseUrlEl.value = settings.baseUrl;
    modelNameEl.value = settings.model;
    apiKeyEl.value = settings.apiKey;
    renderMode();
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch {
      /* حالت خصوصی مرورگر: فقط در همین نشست می‌ماند */
    }
  }

  const isLive = () => Boolean(settings.baseUrl && settings.model);

  function renderMode() {
    if (isLive()) {
      modeLabel.textContent = "متصل به مدل";
      modeHint.textContent = settings.model + " · " + new URL(settings.baseUrl).host;
    } else {
      modeLabel.textContent = "حالت نمایشی";
      modeHint.textContent = "بدون مدل واقعی · پاسخ‌ها نمونه‌اند";
    }
  }

  $("#toggleSettings").addEventListener("click", () => {
    settingsForm.classList.toggle("hidden");
    if (!settingsForm.classList.contains("hidden")) baseUrlEl.focus();
  });

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const baseUrl = baseUrlEl.value.trim().replace(/\/+$/, "");
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
      sysNotice("آدرس endpoint باید با http:// یا https:// شروع شود.", true);
      return;
    }
    settings = {
      baseUrl,
      model: modelNameEl.value.trim(),
      apiKey: apiKeyEl.value.trim(),
    };
    saveSettings();
    renderMode();
    settingsForm.classList.add("hidden");
    sysNotice(
      isLive()
        ? "اتصال ذخیره شد. پیام بعدی با مدل شما پاسخ داده می‌شود. کلید فقط در همین مرورگر ذخیره شده است."
        : "اتصال قطع شد؛ دمو در حالت نمایشی ادامه می‌یابد."
    );
  });

  $("#disconnect").addEventListener("click", () => {
    settings = { baseUrl: "", model: "", apiKey: "" };
    baseUrlEl.value = "";
    modelNameEl.value = "";
    apiKeyEl.value = "";
    saveSettings();
    renderMode();
    sysNotice("اتصال قطع شد؛ دمو در حالت نمایشی ادامه می‌یابد.");
  });

  /* ------------------------------------------------------------ رندر پیام */
  function clearWelcome() {
    const welcome = messagesEl.querySelector(".welcome");
    if (welcome) welcome.remove();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function scrollDown() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addUser(text) {
    clearWelcome();
    const row = el("div", "msg user");
    row.appendChild(el("div", "bubble", text));
    messagesEl.appendChild(row);
    scrollDown();
  }

  function addAssistantShell() {
    clearWelcome();
    const row = el("div", "msg assistant");
    row.appendChild(el("span", "avatar", "✦"));
    const bubble = el("div", "bubble");
    const dots = el("span", "dots");
    dots.innerHTML = "<i></i><i></i><i></i>";
    bubble.appendChild(dots);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollDown();
    return bubble;
  }

  function addToolCard(name, args, state, result) {
    const card = el("div", "tool-card");
    const head = el("div", "tool-head");
    head.appendChild(el("span", "tool-name", name));
    const stateEl = el("span", "tool-state", state);
    head.appendChild(stateEl);
    card.appendChild(head);
    const pre = el("pre", "", JSON.stringify(args, null, 2));
    card.appendChild(pre);
    messagesEl.appendChild(card);
    scrollDown();
    return (finalState, output) => {
      stateEl.textContent = finalState;
      stateEl.classList.toggle("ok", finalState === "انجام شد");
      if (output) {
        const out = el("pre", "", output);
        card.appendChild(out);
      }
      scrollDown();
    };
  }

  function sysNotice(text, isError) {
    clearWelcome();
    const row = el("div", "msg assistant");
    row.appendChild(el("span", "avatar", "!"));
    row.appendChild(el("div", "bubble" + (isError ? " error" : ""), text));
    messagesEl.appendChild(row);
    scrollDown();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ------------------------------------------------------------ پاسخ نمایشی */
  const DEMO_SYSTEM = [
    "این «حالت نمایشی» است و به هیچ مدلی وصل نیست. برای پاسخ واقعی، از دکمهٔ «اتصال مدل» یک endpoint سازگار با OpenAI وصل کنید.",
    "سؤال‌هایی که می‌توانم در نسخهٔ کامل انجام دهم: ساختن و خواندن فایل داخل workspace، اجرای دستور شل، ثبت و بازیابی خاطره، و ادامهٔ گفتگو در چند نشست.",
  ];

  function demoPlan(text) {
    const t = text.toLowerCase();

    if (/اول|prime/.test(t)) {
      return {
        steps: [
          {
            tool: "write_file",
            args: {
              path: "primes.py",
              content:
                "def primes(limit):\n    sieve = [True] * (limit + 1)\n    sieve[0:2] = [False, False]\n    out = []\n    for n in range(2, limit + 1):\n        if sieve[n]:\n            out.append(n)\n            for m in range(n * n, limit + 1, n):\n                sieve[m] = False\n    return out\n\nprint(primes(50))",
            },
            result: "نوشته شد: workspace/primes.py (۲۴ خط)",
          },
        ],
        reply:
          "فایل `primes.py` در workspace ساخته شد. با `python workspace/primes.py` اجرایش کن تا اعداد اول زیر ۵۰ چاپ شوند.\n\nدر نسخهٔ کامل، همان لحظه می‌توانم دستور را هم اجرا کنم و خروجی را نشانت بدهم.",
      };
    }

    if (/لیست|فهرست|list|ls/.test(t)) {
      return {
        steps: [
          { tool: "list_files", args: { path: "." }, result: "README.md\nprimes.py\nnotes.txt" },
        ],
        reply:
          "سه فایل در workspace هست: `README.md`، `primes.py` و `notes.txt`.\n\nاین ابزار فقط داخل پوشهٔ workspace کار می‌کند و مسیرهای بیرون از آن رد می‌شوند.",
      };
    }

    if (/یادت|به ?خاطر|حافظه|remember/.test(t)) {
      return {
        steps: [
          {
            tool: "remember",
            args: { fact: "کاربر در تهران زندگی می‌کند." },
            result: "ثبت شد در جدول facts (id=۱۲)",
          },
        ],
        reply:
          "یادداشت شد و در SQLite ذخیره می‌شود. دفعهٔ بعد که چیزی دربارهٔ محل زندگی بپرسی، `recall` همین حقیقت را برمی‌گرداند و خودکار به دستور سیستمی اضافه می‌شود.",
      };
    }

    if (/اجرا|دستور|bash|shell|git/.test(t)) {
      return {
        steps: [
          {
            tool: "run_command",
            args: { command: "git status --short" },
            result: " M notes.txt\n?? primes.py",
          },
        ],
        reply:
          "دستور اجرا شد و خروجی بالا آمد. دستورهایی مثل `rm -rf /`، `shutdown` و `curl | bash` در `tools.py` مسدود شده‌اند؛ اجرای شل برای استفادهٔ محلی است، نه استقرار عمومی.",
      };
    }

    if (/سلام|درود|هی|hello|hi/.test(t)) {
      return {
        steps: [],
        reply:
          "سلام! من دموی دستیار دیجیتالم.\n\nدر نسخهٔ کامل می‌توانم فایل بسازم، دستور اجرا کنم و خاطره‌ها را نگه دارم. یکی از نمونه‌های بالای صفحه را بزن یا همین‌جا بنویس چه می‌خواهی.",
      };
    }

    return {
      steps: [],
      reply: DEMO_SYSTEM.join("\n\n"),
    };
  }

  function formatInline(text) {
    // تبدیل سادهٔ `code` به عنصر code و **bold** به strong
    const frag = document.createDocumentFragment();
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("`") && part.endsWith("`")) {
        frag.appendChild(el("code", "", part.slice(1, -1)));
      } else if (part.startsWith("**") && part.endsWith("**")) {
        frag.appendChild(el("strong", "", part.slice(2, -2)));
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    return frag;
  }

  async function runDemo(text) {
    const plan = demoPlan(text);
    await sleep(320);
    for (const step of plan.steps) {
      const finish = addToolCard(step.tool, step.args, "در حال اجرا…");
      await sleep(620);
      finish("انجام شد", step.result);
    }
    const bubble = addAssistantShell();
    await sleep(240);
    bubble.textContent = "";
    const lines = plan.reply.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) {
        const paragraph = el("p");
        paragraph.appendChild(formatInline(lines[i]));
        paragraph.style.margin = "0 0 6px";
        bubble.appendChild(paragraph);
      }
      await sleep(90);
      scrollDown();
    }
  }

  /* ------------------------------------------------------------ پاسخ واقعی */
  async function runLive(text) {
    controller = new AbortController();
    const bubble = addAssistantShell();
    bubble.textContent = "";

    try {
      const response = await fetch(settings.baseUrl + "/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { Authorization: "Bearer " + settings.apiKey } : {}),
        },
        body: JSON.stringify({
          model: settings.model,
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "تو دستیار دیجیتالی هستی؛ فارسی، کوتاه و روشن پاسخ بده. در این سایت نسخهٔ استاتیک هستی و به ابزار فایل/شل دسترسی نداری؛ اگر ابزار لازم شد بگو کاربر نسخهٔ کامل را اجرا کند.",
            },
            { role: "user", content: text },
          ],
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error("پاسخ " + response.status + (detail ? " — " + detail.slice(0, 160) : ""));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const chunk of events) {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content || "";
              if (delta) {
                answer += delta;
                bubble.textContent = answer;
                scrollDown();
              }
            } catch {
              /* دادهٔ ناقص را نادیده بگیر */
            }
          }
        }
      }

      if (!answer) bubble.textContent = "(پاسخ خالی برگشت؛ نام مدل و آدرس endpoint را بررسی کنید.)";
    } catch (error) {
      if (error.name === "AbortError") {
        bubble.textContent += "\n(متوقف شد)";
      } else {
        bubble.classList.add("error");
        bubble.textContent =
          "اتصال به مدل ممکن نشد: " + error.message + "\n\nاگر خطای CORS دیدید، endpoint شما اجازهٔ درخواست از مرورگر را نمی‌دهد؛ در این صورت از نسخهٔ Flask استفاده کنید.";
      }
    } finally {
      controller = null;
    }
  }

  /* ------------------------------------------------------------ ارسال */
  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;

    busy = true;
    composerEl.querySelector(".send").disabled = true;
    inputEl.value = "";
    inputEl.style.height = "auto";
    addUser(message);

    try {
      if (isLive()) {
        await runLive(message);
      } else {
        await runDemo(message);
      }
    } finally {
      busy = false;
      composerEl.querySelector(".send").disabled = false;
      inputEl.focus();
    }
  }

  composerEl.addEventListener("submit", (event) => {
    event.preventDefault();
    send(inputEl.value);
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(inputEl.value);
    }
  });

  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
  });

  messagesEl.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (chip) send(chip.dataset.prompt || "");
  });

  loadSettings();
})();
