/* رابط دموی استاتیک دستیار دیجیتال
   داده در data.js، عامل نمایشی در agent.js و رندر مارک‌داون در markdown.js است.
   اگر endpoint سازگار با OpenAI وصل شود، پاسخ‌ها واقعی و استریمی می‌شوند. */

(() => {
  "use strict";

  const { DEFAULT_FILES } = window.DemoData;
  const Agent = window.DemoAgent;
  const { render } = window.DemoMarkdown;

  /* ------------------------------------------------------------ عناصر */
  const $ = (sel) => document.querySelector(sel);
  const messagesEl = $("#messages");
  const inputEl = $("#input");
  const composerEl = $("#composer");
  const sendBtn = $("#sendBtn");
  const stopBtn = $("#stopBtn");
  const modeLabel = $("#modeLabel");
  const modeHint = $("#modeHint");
  const settingsForm = $("#settingsForm");
  const baseUrlEl = $("#baseUrl");
  const modelNameEl = $("#modelName");
  const apiKeyEl = $("#apiKey");
  const proxyUrlEl = $("#proxyUrl");
  const fileListEl = $("#fileList");
  const memListEl = $("#memList");
  const wsCountEl = $("#wsCount");
  const memCountEl = $("#memCount");
  const filePathEl = $("#filePath");
  const filePreviewEl = $("#filePreview");
  const closeFileEl = $("#closeFile");

  const SETTINGS_KEY = "assistant.settings.v1";
  const WORKSPACE_KEY = "assistant.demo.workspace.v2";

  /* ------------------------------------------------------------ وضعیت */
  let settings = { baseUrl: "", model: "", apiKey: "", proxyUrl: "" };
  let workspace = { files: {}, facts: [] };
  let history = [];
  let selectedPath = "";
  let busy = false;
  let run = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const fa = (value) => String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const lineCount = (text) => text.split("\n").length;

  /* ------------------------------------------------------------ فضای کاری */
  function loadWorkspace() {
    try {
      const saved = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || "null");
      if (saved && saved.files && typeof saved.files === "object" && Array.isArray(saved.facts)) {
        workspace = saved;
        return;
      }
    } catch {
      /* از حالت پیش‌فرض شروع کن */
    }
    workspace = { files: { ...DEFAULT_FILES }, facts: [] };
  }

  function saveWorkspace() {
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    } catch {
      /* حالت خصوصی مرورگر */
    }
  }

  function renderWorkspace() {
    const names = Object.keys(workspace.files).sort();
    fileListEl.innerHTML = "";
    if (!names.length) fileListEl.appendChild(el("li", "ws-empty", "فضای کاری خالی است."));

    for (const name of names) {
      const content = workspace.files[name];
      const item = el("li");
      const btn = el("button", "file-item" + (name === selectedPath ? " active" : ""));
      btn.type = "button";
      const icon = name.endsWith(".py") ? "🐍" : name.endsWith(".md") ? "📄" : "📝";
      btn.appendChild(el("span", "file-ico", icon));
      btn.appendChild(el("span", "file-name", name));
      btn.appendChild(el("span", "file-size", fa(lineCount(content)) + " خط"));
      btn.addEventListener("click", () => selectFile(name === selectedPath ? "" : name));
      item.appendChild(btn);
      fileListEl.appendChild(item);
    }
    wsCountEl.textContent = fa(names.length) + " فایل";

    memListEl.innerHTML = "";
    if (!workspace.facts.length) memListEl.appendChild(el("li", "ws-empty", "هنوز چیزی ذخیره نشده."));
    workspace.facts.forEach((fact, index) => {
      const item = el("li", "mem-item");
      item.appendChild(el("span", "mem-text", fact));
      const remove = el("button", "mem-remove", "×");
      remove.type = "button";
      remove.title = "حذف این خاطره";
      remove.setAttribute("aria-label", "حذف خاطره: " + fact);
      remove.addEventListener("click", () => {
        workspace.facts.splice(index, 1);
        saveWorkspace();
        renderWorkspace();
      });
      item.appendChild(remove);
      memListEl.appendChild(item);
    });
    memCountEl.textContent = fa(workspace.facts.length);

    if (selectedPath) {
      filePathEl.textContent = selectedPath;
      filePreviewEl.textContent = workspace.files[selectedPath] || "";
      filePreviewEl.classList.remove("hidden");
      closeFileEl.classList.remove("hidden");
    } else {
      filePathEl.textContent = "یک فایل را انتخاب کنید";
      filePreviewEl.textContent = "";
      filePreviewEl.classList.add("hidden");
      closeFileEl.classList.add("hidden");
    }
  }

  function selectFile(path) {
    selectedPath = path;
    renderWorkspace();
  }

  closeFileEl.addEventListener("click", () => selectFile(""));

  const api = {
    files: () => workspace.files,
    facts: () => workspace.facts,
    readFile: (path) => (Object.prototype.hasOwnProperty.call(workspace.files, path) ? workspace.files[path] : null),
    writeFile: (path, content) => {
      workspace.files[path] = content;
      saveWorkspace();
      renderWorkspace();
    },
    remember: (fact) => {
      if (!workspace.facts.includes(fact)) workspace.facts.push(fact);
      saveWorkspace();
      renderWorkspace();
    },
    openFile: (path) => selectFile(path),
  };

  /* ------------------------------------------------------------ تنظیمات */
  function loadSettings() {
    try {
      settings = {
        baseUrl: "",
        model: "",
        apiKey: "",
        proxyUrl: "",
        ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
      };
    } catch {
      settings = { baseUrl: "", model: "", apiKey: "", proxyUrl: "" };
    }
    baseUrlEl.value = settings.baseUrl;
    modelNameEl.value = settings.model;
    apiKeyEl.value = settings.apiKey;
    proxyUrlEl.value = settings.proxyUrl;
    renderMode();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* نادیده بگیر */
    }
  }

  const proxyBase = () => settings.proxyUrl.trim().replace(/\/+$/, "");
  const isLive = () => Boolean(proxyBase() || (settings.baseUrl && settings.model));

  function endpointUrl(base) {
    const trimmed = base.replace(/\/+$/, "");
    return /\/chat\/completions$/.test(trimmed) ? trimmed : trimmed + "/chat/completions";
  }

  function renderMode() {
    if (proxyBase()) {
      modeLabel.textContent = "متصل به سرور واسط";
      try {
        modeHint.textContent = "کلید سمت سرور · " + new URL(proxyBase()).host;
      } catch {
        modeHint.textContent = "کلید سمت سرور";
      }
    } else if (isLive()) {
      const local = /^(https?:\/\/)?(127\.0\.0\.1|localhost|0\.0\.0\.0)([:/]|$)/i.test(settings.baseUrl);
      modeLabel.textContent = local ? "مدل محلی" : "متصل به مدل";
      try {
        modeHint.textContent = settings.model + " · " + (local ? "Ollama روی همین دستگاه" : new URL(settings.baseUrl).host);
      } catch {
        modeHint.textContent = settings.model;
      }
    } else {
      modeLabel.textContent = "حالت نمایشی";
      modeHint.textContent = "بدون مدل واقعی · پاسخ‌ها و ابزارها شبیه‌سازی می‌شوند";
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
    const proxyUrl = proxyUrlEl.value.trim().replace(/\/+$/, "");
    if (proxyUrl && !/^https?:\/\//i.test(proxyUrl)) {
      sysNotice("آدرس سرور واسط باید با http:// یا https:// شروع شود.", true);
      return;
    }
    settings = { baseUrl, model: modelNameEl.value.trim(), apiKey: apiKeyEl.value.trim(), proxyUrl };
    saveSettings();
    renderMode();
    settingsForm.classList.add("hidden");
    if (proxyBase()) {
      sysNotice("سرور واسط ذخیره شد. کلید API فقط روی سرور است و به مرورگر نمی‌رسد.");
    } else if (isLive()) {
      sysNotice(
        "اتصال ذخیره شد. از این به بعد پیام‌ها با مدل شما و همراه با تاریخچهٔ همین گفتگو پاسخ داده می‌شوند. کلید فقط در localStorage همین مرورگر مانده است."
      );
    } else {
      sysNotice("اتصال ذخیره نشد؛ دمو در حالت نمایشی ادامه می‌یابد. برای اتصال، یا آدرس سرور واسط را بدهید یا هم endpoint و هم نام مدل را.");
    }
  });

  $("#disconnect").addEventListener("click", () => {
    settings = { baseUrl: "", model: "", apiKey: "", proxyUrl: "" };
    baseUrlEl.value = "";
    modelNameEl.value = "";
    apiKeyEl.value = "";
    proxyUrlEl.value = "";
    saveSettings();
    renderMode();
    sysNotice("اتصال قطع شد؛ دمو در حالت نمایشی ادامه می‌یابد.");
  });

  /* ------------------------------------------------------------ رندر پیام */
  function clearWelcome() {
    const welcome = messagesEl.querySelector(".welcome");
    if (welcome) welcome.remove();
  }

  function welcomeMarkup() {
    const wrap = el("div", "welcome");
    wrap.appendChild(el("div", "welcome-logo", "✦"));
    wrap.appendChild(el("h3", "", "سلام! چه کاری برایتان انجام دهم؟"));
    wrap.appendChild(el("p", "muted", "یکی از نمونه‌ها را بزنید تا جریان کار عامل را ببینید."));
    const chips = el("div", "chips");
    const examples = [
      ["ساخت فایل", "یک فایل پایتون بساز که اعداد اول را چاپ کند."],
      ["فیبوناچی", "یک اسکریپت فیبوناچی بساز."],
      ["فهرست فایل‌ها", "فایل‌های پوشه را لیست کن."],
      ["خواندن فایل", "محتوای notes.txt را بخوان."],
      ["یادآوری", "یادت باشه که من توی تهران زندگی می‌کنم."],
      ["اجرای دستور", "دستور git status را اجرا کن."],
      ["چه کاری می‌توانی؟", "چه کارهایی می‌توانی انجام بدهی؟"],
    ];
    for (const [label, prompt] of examples) {
      const chip = el("button", "chip", label);
      chip.type = "button";
      chip.dataset.prompt = prompt;
      chips.appendChild(chip);
    }
    wrap.appendChild(chips);
    return wrap;
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

  function addToolCard(name, args, state) {
    const card = el("div", "tool-card");
    const head = el("div", "tool-head");
    head.appendChild(el("span", "tool-name", name));
    const stateEl = el("span", "tool-state", state);
    head.appendChild(stateEl);
    card.appendChild(head);
    card.appendChild(el("pre", "", JSON.stringify(args, null, 2)));
    messagesEl.appendChild(card);
    scrollDown();
    return (finalState, output) => {
      stateEl.textContent = finalState;
      stateEl.classList.toggle("ok", finalState === "انجام شد");
      stateEl.classList.toggle("fail", finalState === "ناموفق");
      if (output) card.appendChild(el("pre", "", output));
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

  /* ------------------------------------------------------------ پاسخ نمایشی */
  async function runDemo(text) {
    const plan = Agent.plan(text, api);
    for (const step of plan.steps) {
      if (run.cancelled) return;
      const finish = addToolCard(step.tool, step.args, "در حال اجرا…");
      await wait(480);
      if (run.cancelled) {
        finish("متوقف شد");
        return;
      }
      if (typeof step.apply === "function") step.apply();
      finish("انجام شد", step.result);
      await wait(220);
    }

    if (run.cancelled) return;
    const bubble = addAssistantShell();
    await wait(200);
    if (run.cancelled) {
      bubble.textContent = "(متوقف شد)";
      return;
    }
    bubble.textContent = "";
    const paragraphs = plan.reply.split("\n\n");
    for (const chunk of paragraphs) {
      if (run.cancelled) {
        bubble.appendChild(el("p", "muted", "(متوقف شد)"));
        return;
      }
      const block = el("div", "md-block");
      block.appendChild(render(chunk));
      bubble.appendChild(block);
      scrollDown();
      await wait(110);
    }
  }

  /* ------------------------------------------------------------ پاسخ واقعی */
  function pushHistory(role, content) {
    history.push({ role, content });
    if (history.length > 16) history = history.slice(-16);
  }

  async function runLive(text) {
    const bubble = addAssistantShell();
    bubble.textContent = "";
    pushHistory("user", text);

    const messages = [
      {
        role: "system",
        content:
          "تو دستیار دیجیتالی هستی؛ فارسی، کوتاه و روشن پاسخ بده و از مارک‌داون ساده استفاده کن. در این صفحه نسخهٔ استاتیک هستی و به ابزار فایل/شل دسترسی نداری؛ اگر ابزار لازم شد بگو کاربر نسخهٔ کامل را از مخزن گیت‌هاب اجرا کند.",
      },
      ...history,
    ];

    const viaProxy = Boolean(proxyBase());
    const target = viaProxy ? proxyBase() + "/api/chat" : endpointUrl(settings.baseUrl);

    try {
      const response = await fetch(target, {
        method: "POST",
        signal: run.controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(viaProxy || !settings.apiKey ? {} : { Authorization: "Bearer " + settings.apiKey }),
        },
        body: JSON.stringify(viaProxy ? { stream: true, messages } : { model: settings.model, stream: true, messages }),
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

      if (!answer) {
        bubble.textContent = "(پاسخ خالی برگشت؛ نام مدل و آدرس endpoint را بررسی کنید.)";
      } else {
        bubble.replaceChildren(render(answer));
        pushHistory("assistant", answer);
      }
    } catch (error) {
      if (error.name === "AbortError" || run.cancelled) {
        bubble.textContent += "\n(متوقف شد)";
      } else {
        bubble.classList.add("error");
        bubble.textContent =
          "اتصال ممکن نشد: " +
          error.message +
          "\n\nاگر خطای CORS دیدید، endpoint شما اجازهٔ درخواست از مرورگر را نمی‌دهد؛ در این صورت از سرور واسط یا نسخهٔ Flask استفاده کنید.";
      }
    } finally {
      if (run) run.controller = null;
    }
  }

  /* ------------------------------------------------------------ ارسال و توقف */
  function setBusy(value) {
    busy = value;
    sendBtn.disabled = value;
    stopBtn.classList.toggle("hidden", !value);
    inputEl.disabled = value;
  }

  async function send(text) {
    const message = String(text || "").trim();
    if (!message || busy) return;

    run = { cancelled: false, controller: null };
    setBusy(true);
    inputEl.value = "";
    inputEl.style.height = "auto";
    addUser(message);

    try {
      if (isLive()) {
        run.controller = new AbortController();
        await runLive(message);
      } else {
        await runDemo(message);
      }
    } catch (error) {
      sysNotice("خطای غیرمنتظره: " + (error && error.message ? error.message : error), true);
    } finally {
      run = null;
      setBusy(false);
      inputEl.focus();
    }
  }

  function stopRun() {
    if (!run) return;
    run.cancelled = true;
    if (run.controller) {
      try {
        run.controller.abort();
      } catch {
        /* نادیده بگیر */
      }
    }
  }

  composerEl.addEventListener("submit", (event) => {
    event.preventDefault();
    send(inputEl.value);
  });

  stopBtn.addEventListener("click", stopRun);

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(inputEl.value);
    } else if (event.key === "Escape") {
      stopRun();
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

  $("#clearChat").addEventListener("click", () => {
    if (busy) return;
    history = [];
    messagesEl.innerHTML = "";
    messagesEl.appendChild(welcomeMarkup());
    inputEl.focus();
  });

  $("#resetWorkspace").addEventListener("click", () => {
    workspace = { files: { ...DEFAULT_FILES }, facts: [] };
    selectedPath = "";
    saveWorkspace();
    renderWorkspace();
    sysNotice("فضای کاری دمو و حافظه پاک شدند و به حالت اولیه برگشتند. (گفتگو دست نخورده است.)");
  });

  /* ------------------------------------------------------------ پل مدیر مدل‌ها */
  function syncSettingsInputs() {
    baseUrlEl.value = settings.baseUrl;
    modelNameEl.value = settings.model;
    apiKeyEl.value = settings.apiKey;
    proxyUrlEl.value = settings.proxyUrl;
  }

  /* مدیر مدل‌ها (models.js) از این پل مدل انتخاب‌شده را در چت فعال می‌کند. */
  window.AssistantSettings = {
    snapshot: () => ({ baseUrl: settings.baseUrl, model: settings.model, proxyUrl: settings.proxyUrl, apiKey: settings.apiKey }),
    useModel: (choice) => {
      if (!choice) return;
      if (choice.kind === "proxy") {
        settings = { ...settings, proxyUrl: choice.baseUrl || "", baseUrl: "", apiKey: "", model: "" };
        saveSettings();
        syncSettingsInputs();
        renderMode();
        settingsForm.classList.add("hidden");
        sysNotice("سرور واسط «" + (choice.baseUrl || "") + "» برای چت فعال شد؛ مدل را سرور انتخاب می‌کند و کلیدی به مرورگر نمی‌رسد.");
        return;
      }
      settings = { ...settings, proxyUrl: "", baseUrl: choice.baseUrl || "", model: choice.model || "" };
      saveSettings();
      syncSettingsInputs();
      renderMode();
      settingsForm.classList.add("hidden");
      sysNotice(
        "مدل «" +
          (choice.model || "") +
          "» برای چت فعال شد." +
          (choice.kind === "ollama" ? " این مدل روی همین دستگاه با Ollama اجرا می‌شود." : "")
      );
    },
  };

  /* ------------------------------------------------------------ آغاز */
  loadSettings();
  loadWorkspace();
  renderWorkspace();
  if (window.DemoModels) window.DemoModels.init();
})();
