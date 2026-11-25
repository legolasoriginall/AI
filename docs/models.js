/* مدیر مدل‌ها: پیدا کردن مدل‌های موجود، دانلود/نصب مدل و اجرای آزمایشی.
   Ollama همین دستگاه، فهرست سرور واسط و مدل‌های endpoint آنلاین بررسی می‌شوند.
   اگر مرورگر اجازهٔ تماس نداد، دستور آمادهٔ ترمینال پیشنهاد می‌شود. */
window.DemoModels = (() => {
  "use strict";

  /* همان فهرست providers.MODEL_CATALOG در نسخهٔ پایتون */
  const CATALOG = [
    { id: "llama3.2:1b", label: "Llama 3.2 1B", size: "1.3 GB", ram: "8 GB", badge: "سبک", note: "سبک‌ترین گزینه؛ برای شروع و دستگاه‌های کم‌رم." },
    { id: "llama3.2:3b", label: "Llama 3.2 3B", size: "2.0 GB", ram: "8 GB", badge: "پیشنهادی", note: "تعادل خوب کیفیت و سرعت." },
    { id: "qwen2.5:3b", label: "Qwen 2.5 3B", size: "1.9 GB", ram: "8 GB", badge: "فارسی", note: "فارسی و عربی را بهتر می‌فهمد." },
    { id: "gemma2:2b", label: "Gemma 2 2B", size: "1.6 GB", ram: "8 GB", badge: "", note: "پاسخ‌های کوتاه و مرتب." },
    { id: "qwen2.5:7b", label: "Qwen 2.5 7B", size: "4.7 GB", ram: "16 GB", badge: "کیفیت", note: "کیفیت بالاتر برای کد و متن؛ رم بیشتر." },
    { id: "llama3.1:8b", label: "Llama 3.1 8B", size: "4.9 GB", ram: "16 GB", badge: "", note: "مدل عمومی قوی‌تر." },
  ];

  const OLLAMA_KEY = "assistant.ollama.url.v1";
  const ACTIVE_KEY = "assistant.activeModel.v1";
  const DEFAULT_OLLAMA = "http://127.0.0.1:11434";
  const LABEL = { ollama: "Ollama", proxy: "سرور واسط", online: "آنلاین" };
  const $ = (id) => document.getElementById(id);
  const fa = (value) => String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const trim = (value) => String(value || "").trim().replace(/\/+$/, "");

  let ollamaBase = DEFAULT_OLLAMA;
  try {
    ollamaBase = trim(localStorage.getItem(OLLAMA_KEY)) || DEFAULT_OLLAMA;
  } catch {
    /* حالت خصوصی */
  }

  let logLines = [];
  let pullAbort = null;
  const state = {
    ollama: { online: false, models: [], error: "" },
    proxy: { configured: false, online: false, models: [], error: "" },
    online: { configured: false, online: false, models: [], error: "" },
    pulling: "",
  };

  /* ---------------------------------------------------------- کمکی */
  const settings = () =>
    window.AssistantSettings ? window.AssistantSettings.snapshot() : { baseUrl: "", model: "", proxyUrl: "", apiKey: "" };

  function describeError(error) {
    if (!error) return "خطای نامشخص";
    if (error.name === "AbortError") return "زمان تمام شد";
    if (error instanceof TypeError) return "مرورگر اتصال را مسدود کرد (CORS یا HTTPS)";
    return error.message || String(error);
  }

  async function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 4000);
    try {
      const response = await fetch(url, { cache: "no-store", ...options, signal: controller.signal });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return "";
    const gb = bytes / 1024 / 1024 / 1024;
    return gb >= 1 ? gb.toFixed(1) + " GB" : Math.round(bytes / 1024 / 1024) + " MB";
  }

  function log(line) {
    const stamp = new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logLines.push("[" + stamp + "] " + line);
    if (logLines.length > 80) logLines = logLines.slice(-80);
    const box = $("modelLog");
    if (box) {
      box.textContent = logLines.join("\n");
      box.scrollTop = box.scrollHeight;
    }
  }

  function setStatus(text, tone) {
    const node = $("modelsStatus");
    if (!node) return;
    node.textContent = text;
    node.className = "model-status" + (tone ? " " + tone : "");
  }

  function showCommand(command) {
    const wrap = $("modelCmdWrap");
    const code = $("modelCmd");
    if (!wrap || !code) return;
    code.textContent = command;
    wrap.classList.remove("hidden");
  }

  /* ---------------------------------------------------------- جست‌وجو */
  async function probeOllama(base) {
    const data = await fetchJson(base + "/api/tags", {}, 3500);
    return (data.models || [])
      .filter((item) => item && item.name)
      .map((item) => ({
        id: item.name,
        source: "ollama",
        base,
        size: Number(item.size) || 0,
        params: (item.details && item.details.parameter_size) || "",
      }))
      .sort((a, b) => a.size - b.size);
  }

  async function probeServer(base, source, headers) {
    const payload = await fetchJson(base + (source === "proxy" ? "/api/models" : "/models"), { headers }, 5000);
    const raw = (payload && (payload.models || payload.data)) || [];
    return raw
      .map((item) => {
        const id = typeof item === "string" ? item : item && (item.id || item.name);
        return id ? { id: String(id), source, base, size: 0, params: "" } : null;
      })
      .filter(Boolean);
  }

  async function refresh() {
    const s = settings();
    const proxy = trim(s.proxyUrl);
    const online = trim(s.baseUrl);
    state.proxy.configured = Boolean(proxy) && !online;
    state.online.configured = Boolean(online);
    setStatus("در حال جست‌وجوی مدل‌ها…");

    const jobs = [
      probeOllama(ollamaBase)
        .then((models) => {
          state.ollama = { online: true, models, error: "" };
          log("Ollama پیدا شد · " + fa(models.length) + " مدل نصب‌شده");
        })
        .catch((error) => {
          state.ollama = { online: false, models: [], error: describeError(error) };
          log("Ollama در " + ollamaBase + " پاسخ نداد: " + describeError(error));
        }),
    ];

    if (state.proxy.configured) {
      jobs.push(
        probeServer(proxy, "proxy")
          .then((models) => {
            state.proxy = { configured: true, online: true, models, error: "" };
            log("سرور واسط " + fa(models.length) + " مدل معرفی کرد");
          })
          .catch((error) => {
            state.proxy = { configured: true, online: false, models: [], error: describeError(error) };
            log("فهرست مدل‌های سرور واسط خوانده نشد: " + describeError(error));
          })
      );
    }

    if (state.online.configured) {
      const headers = s.apiKey ? { Authorization: "Bearer " + s.apiKey } : {};
      jobs.push(
        probeServer(online, "online", headers)
          .then((models) => {
            state.online = { configured: true, online: true, models, error: "" };
            log("endpoint آنلاین " + fa(models.length) + " مدل معرفی کرد");
          })
          .catch((error) => {
            state.online = { configured: true, online: false, models: [], error: describeError(error) };
            log("فهرست مدل‌های endpoint خوانده نشد: " + describeError(error));
          })
      );
    }

    await Promise.all(jobs);
    render();
    verifySavedModel();
  }

  /* مدل فعال ذخیره‌شده پس از باز کردن دوبارهٔ صفحه هم باید همان مدل باشد؛
     اگر دیگر نصب نباشد، پیام روشن می‌دهیم تا کاربر مدل تازه‌ای انتخاب کند. */
  function savedActive() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function verifySavedModel() {
    const saved = savedActive();
    if (!saved || !saved.id || saved.kind !== "ollama") return;
    if (settings().model !== saved.id) return;
    if (!state.ollama.online) {
      setStatus("مدل فعال «" + saved.id + "» در دسترس نیست: Ollama پاسخ نمی‌دهد. Ollama را اجرا کنید یا مدل دیگری انتخاب کنید.", "fail");
      log("⚠ مدل فعال «" + saved.id + "» در دسترس نیست؛ Ollama پاسخ نداد.");
      return;
    }
    const installed = state.ollama.models.some(
      (item) => item.id === saved.id || item.id === saved.id + ":latest" || saved.id === item.id + ":latest"
    );
    if (!installed) {
      setStatus(
        "مدل فعال «" + saved.id + "» دیگر نصب نیست. یکی از مدل‌های زیر را انتخاب کنید یا همان مدل را دوباره دانلود کنید؛ تا آن موقع پاسخ‌های چت با خطا روبه‌رو می‌شوند.",
        "fail"
      );
      log("⚠ مدل فعال «" + saved.id + "» روی این دستگاه نصب نیست.");
    }
  }

  /* ---------------------------------------------------------- اجرا */
  const entries = () => [...state.ollama.models, ...state.proxy.models, ...state.online.models];

  function useModel(entry) {
    if (!window.AssistantSettings) return;
    if (entry.source === "ollama") {
      window.AssistantSettings.useModel({ kind: "ollama", model: entry.id, baseUrl: entry.base + "/v1" });
    } else if (entry.source === "proxy") {
      window.AssistantSettings.useModel({ kind: "proxy", baseUrl: entry.base, model: entry.id });
    } else {
      window.AssistantSettings.useModel({ kind: "online", model: entry.id, baseUrl: trim(settings().baseUrl) });
    }
    log("مدل فعال: " + entry.id + " · " + LABEL[entry.source]);
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({ kind: entry.source, id: entry.id, base: entry.base }));
    } catch {
      /* حالت خصوصی */
    }
  }

  async function testModel(entry) {
    log("اجرای آزمایشی " + entry.id + " …");
    const prompt = "سلام! در یک جمله بگو آمادهٔ کمک هستی.";
    try {
      let text = "";
      if (entry.source === "ollama") {
        const data = await fetchJson(
          entry.base + "/v1/chat/completions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: entry.id, messages: [{ role: "user", content: prompt }], max_tokens: 80, stream: false }),
          },
          120000
        );
        text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      } else if (entry.source === "proxy") {
        const data = await fetchJson(
          entry.base + "/api/chat",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stream: false, messages: [{ role: "user", content: prompt }] }),
          },
          120000
        );
        text = data.text || (data.choices && data.choices[0] && data.choices[0].message.content) || "";
      } else {
        const key = settings().apiKey;
        const data = await fetchJson(
          trim(entry.base) + "/chat/completions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
            body: JSON.stringify({ model: entry.id, messages: [{ role: "user", content: prompt }], max_tokens: 80, stream: false }),
          },
          120000
        );
        text = (data.choices && data.choices[0] && data.choices[0].message.content) || "";
      }
      log("✅ " + entry.id + " پاسخ داد: " + (text || "(پاسخ خالی)").trim().slice(0, 400));
      setStatus("اجرا موفق بود: " + entry.id, "ok");
    } catch (error) {
      log("✗ اجرای " + entry.id + " ناموفق: " + describeError(error));
      setStatus("اجرا ناموفق: " + describeError(error), "fail");
    }
  }

  /* ---------------------------------------------------------- رندر */
  function render() {
    renderInstalled();
    renderCatalog();
    renderStatus();
  }

  function renderInstalled() {
    const list = $("installedList");
    if (!list) return;
    const all = entries();
    if (!all.length) {
      list.innerHTML = '<li class="ws-empty">مدلی پیدا نشد. Ollama را اجرا کنید یا از فهرست پایین دانلود کنید.</li>';
      return;
    }
    list.innerHTML = all
      .map((entry, index) => {
        const active = Boolean(settings().model) && entry.id === settings().model;
        return `<li class="model-row">
          <span class="model-src ${entry.source}">${LABEL[entry.source]}</span>
          <strong class="model-name" dir="ltr">${esc(entry.id)}</strong>
          <span class="muted small model-meta">${esc([active ? "فعال" : "", formatBytes(entry.size), entry.params].filter(Boolean).join(" · ") || "آماده")}</span>
          <span class="model-actions">
            <button class="mini ghost" type="button" data-act="test" data-i="${index}">اجرا</button>
            <button class="mini primary" type="button" data-act="use" data-i="${index}">استفاده در چت</button>
          </span>
        </li>`;
      })
      .join("");
    list.querySelectorAll("button[data-act]").forEach((button) => {
      const entry = all[Number(button.dataset.i)];
      button.addEventListener("click", () => (button.dataset.act === "test" ? testModel(entry) : useModel(entry)));
    });
  }

  function renderCatalog() {
    const grid = $("catalogList");
    if (!grid) return;
    const installed = new Set(entries().map((entry) => (entry.id.includes(":") ? entry.id : entry.id + ":latest")));
    grid.innerHTML = CATALOG.map((model) => {
      const ready = installed.has(model.id + ":latest") || installed.has(model.id);
      const pulling = state.pulling === model.id;
      const action = ready
        ? '<span class="model-src ollama">نصب‌شده</span><button class="mini primary" type="button" data-act="use">استفاده در چت</button>'
        : pulling
          ? '<button class="mini ghost" type="button" data-act="cancel">لغو</button>'
          : `<button class="mini primary" type="button" data-act="pull">${state.ollama.online ? "دانلود و نصب" : "دستور نصب"}</button>`;
      return `<article class="catalog-item" data-model-id="${model.id}">
        <div class="catalog-head"><strong dir="ltr">${model.label}</strong>${model.badge ? `<span class="badge">${model.badge}</span>` : ""}</div>
        <p class="muted small">${model.note}</p>
        <div class="catalog-meta"><span>دانلود: ${model.size}</span><span>رم پیشنهادی: ${model.ram}</span></div>
        <div class="catalog-progress"><i></i></div>
        <div class="catalog-state small muted"></div>
        <div class="catalog-actions">${action}<button class="mini ghost" type="button" data-act="cmd">دستور دستی</button></div>
      </article>`;
    }).join("");

    grid.querySelectorAll(".catalog-item").forEach((card) => {
      const model = CATALOG.find((item) => item.id === card.dataset.modelId);
      const pull = card.querySelector('button[data-act="pull"]');
      if (pull) {
        pull.disabled = Boolean(state.pulling);
        pull.addEventListener("click", () => {
          if (state.ollama.online) {
            startPull(model.id);
          } else {
            showCommand("ollama pull " + model.id);
            log("Ollama در دسترس نیست؛ دستور «ollama pull " + model.id + "» آماده شد.");
          }
        });
      }
      const use = card.querySelector('button[data-act="use"]');
      if (use) use.addEventListener("click", () => useModel({ id: model.id, source: "ollama", base: ollamaBase, size: 0, params: "" }));
      const cancel = card.querySelector('button[data-act="cancel"]');
      if (cancel) cancel.addEventListener("click", cancelPull);
      card.querySelector('button[data-act="cmd"]').addEventListener("click", () => {
        showCommand("ollama pull " + model.id);
        log("دستور دستی: ollama pull " + model.id);
      });
    });
  }

  function renderStatus() {
    const parts = [
      state.ollama.online ? "Ollama آماده (" + fa(state.ollama.models.length) + " مدل)" : "Ollama در دسترس نیست",
    ];
    if (state.proxy.configured) {
      parts.push(state.proxy.online ? "سرور واسط: " + fa(state.proxy.models.length) + " مدل" : "سرور واسط: فهرست مدل ندارد");
    }
    if (state.online.configured) {
      parts.push(state.online.online ? "endpoint: " + fa(state.online.models.length) + " مدل" : "endpoint: فهرست مدل ندارد");
    }
    setStatus(parts.join(" · "), state.ollama.online || state.proxy.online || state.online.online ? "ok" : "warn");

    const hint = $("ollamaHelp");
    if (!hint) return;
    if (state.ollama.online) {
      hint.textContent = "مدل‌ها از Ollama همین دستگاه خوانده شدند؛ «استفاده در چت» مدل فعال را عوض می‌کند.";
    } else if (location.protocol === "https:") {
      hint.textContent =
        "این صفحه HTTPS است و مرورگر با http://127.0.0.1 تماس نمی‌گیرد. برای نصب و اجرا از داخل برنامه، نسخهٔ کامل را روی همین دستگاه اجرا کنید (python server.py → دکمهٔ مدل‌ها)، یا Ollama را پشت یک آدرس HTTPS با CORS بگذارید و همان را اینجا وارد کنید. وگرنه دستور ollama pull را در ترمینال اجرا کنید.";
    } else {
      hint.textContent =
        "اگر Ollama دیده نمی‌شود، آن را با اجازهٔ همین دامنه اجرا کنید: OLLAMA_ORIGINS=" + location.origin + " ollama serve";
    }
  }

  /* ---------------------------------------------------------- نصب */
  function cancelPull() {
    if (!pullAbort) return;
    log("لغو دانلود …");
    try {
      pullAbort.abort();
    } catch {
      /* نادیده بگیر */
    }
  }

  async function startPull(model) {
    if (state.pulling) return;
    state.pulling = model;
    const card = document.querySelector('.catalog-item[data-model-id="' + model + '"]');
    const bar = card && card.querySelector(".catalog-progress i");
    const stateLine = card && card.querySelector(".catalog-state");
    const controller = new AbortController();
    pullAbort = controller;
    let note = "";
    if (card) card.classList.add("pulling");
    log("شروع دانلود و نصب " + model + " — ممکن است چند دقیقه طول بکشد…");

    let last = "";
    try {
      const response = await fetch(ollamaBase + "/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: true }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("HTTP " + response.status);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const chunk = await reader.read();
        finished = chunk.done;
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.error) throw new Error(event.error);
          const total = Number(event.total) || 0;
          const completed = Number(event.completed) || 0;
          if (total > 0 && bar) bar.style.width = Math.min(100, Math.round((completed / total) * 100)) + "%";
          const text = [event.status, total ? fa(Math.round((completed / total) * 100)) + "٪" : ""].filter(Boolean).join(" · ");
          if (text && text !== last) {
            last = text;
            if (stateLine) stateLine.textContent = text;
          }
          if (event.status === "success" && bar) bar.style.width = "100%";
        }
      }

      log("✅ نصب " + model + " تمام شد؛ فهرست مدل‌ها به‌روز شد.");
      await refresh();
    } catch (error) {
      if (error.name === "AbortError") {
        note = "لغو شد";
        if (stateLine) stateLine.textContent = note;
        if (bar) bar.style.width = "0%";
        log("⏹ دانلود " + model + " لغو شد؛ فایل نیمه‌کاره‌ای نصب نمی‌شود.");
      } else {
        const message = describeError(error);
        note = "ناموفق: " + message;
        log("✗ نصب " + model + " ناموفق: " + message);
        if (stateLine) stateLine.textContent = note;
        showCommand("ollama pull " + model);
        if (error instanceof TypeError) {
          log(
            location.protocol === "https:"
              ? "صفحهٔ HTTPS اجازهٔ تماس با Ollama محلی را ندارد: دستور بالا را در ترمینال اجرا کنید، یا نسخهٔ کامل را باز کنید، یا آدرس HTTPS تونل‌شده را در فیلد بالا بگذارید."
              : "Ollama را با این دستور اجرا کنید و صفحه را نوسازی کنید: OLLAMA_ORIGINS=" + location.origin + " ollama serve"
          );
        }
      }
    } finally {
      pullAbort = null;
      state.pulling = "";
      if (card) card.classList.remove("pulling");
      renderCatalog();
      if (note) {
        const fresh = document.querySelector('.catalog-item[data-model-id="' + model + '"] .catalog-state');
        if (fresh) fresh.textContent = note;
      }
    }
  }

  /* ---------------------------------------------------------- رویدادها */
  function bind() {
    const input = $("ollamaUrl");
    if (input) {
      input.value = ollamaBase;
      const apply = () => {
        const next = trim(input.value);
        if (!/^https?:\/\//i.test(next)) {
          setStatus("آدرس Ollama باید با http:// شروع شود.", "fail");
          return;
        }
        ollamaBase = next;
        try {
          localStorage.setItem(OLLAMA_KEY, ollamaBase);
        } catch {
          /* حالت خصوصی */
        }
        refresh();
      };
      input.addEventListener("change", apply);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        }
      });
    }

    const refreshBtn = $("modelsRefresh");
    if (refreshBtn) refreshBtn.addEventListener("click", refresh);

    const copyBtn = $("copyModelCmd");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText($("modelCmd").textContent);
          copyBtn.textContent = "کپی شد";
          setTimeout(() => (copyBtn.textContent = "کپی"), 1600);
        } catch {
          setStatus("کپی خودکار ممکن نشد؛ دستور را دستی انتخاب کنید.", "warn");
        }
      });
    }

    const clearBtn = $("modelLogClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        logLines = [];
        $("modelLog").textContent = "";
        $("modelCmdWrap").classList.add("hidden");
      });
    }

    const openBtn = $("openModels");
    if (openBtn) {
      openBtn.addEventListener("click", () => {
        $("models").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function init() {
    if (!$("models")) return;
    bind();
    log("مدیر مدل‌ها آماده است؛ در حال جست‌وجوی مدل‌ها…");
    refresh();
  }

  return { init, refresh, CATALOG };
})();
