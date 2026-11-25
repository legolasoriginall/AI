/* «تست اتصال» برای سرور واسط: /health و /api/models را صدا می‌زند و
   نتیجه یا خطای دقیق (۴۰۳، configured:false، CORS، ۴۰۴) را فارسی نشان می‌دهد.
   مستقل کار می‌کند: فقط از #proxyUrl و window.AssistantSettings می‌خواند. */

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const button = $("#testProxy");
  const statusEl = $("#proxyStatus");
  const input = $("#proxyUrl");
  if (!button || !statusEl || !input) return;

  const fa = (value) => String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
    statusEl.classList.remove("hidden");
  }

  function clearStatus() {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    delete statusEl.dataset.tone;
  }

  function timeoutSignal(ms) {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      return undefined;
    }
  }

  function savedProxy() {
    const api = window.AssistantSettings;
    if (!api || typeof api.snapshot !== "function") return "";
    try {
      return (api.snapshot() || {}).proxyUrl || "";
    } catch {
      return "";
    }
  }

  async function callWorker(base, path) {
    const response = await fetch(base + path, {
      headers: { Accept: "application/json" },
      signal: timeoutSignal(8000),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { response, body };
  }

  function networkHint(base, error) {
    if (error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return "پاسخ در ۸ ثانیه نرسید. Worker یا تونل بالاست؟ آدرس و شبکه را بررسی کنید.";
    }
    let host = base;
    try {
      host = new URL(base).host;
    } catch {
      /* آدرس نامعتبر */
    }
    return (
      "اتصال برقرار نشد (" +
      host +
      "). معمولاً یعنی CORS بسته است، آدرس اشتباه است یا دامنه بالا نیست. Worker باید ALLOWED_ORIGINS=" +
      location.origin +
      " داشته باشد؛ جزئیات دقیق در Console مرورگر است."
    );
  }

  async function testConnection() {
    const base = (input.value.trim() || savedProxy()).replace(/\/+$/, "");
    if (!base) {
      setStatus("اول آدرس سرور واسط را بگذارید (مثل https://ai-assistant-proxy.<account>.workers.dev).", "warn");
      input.focus();
      return;
    }
    if (!/^https?:\/\//i.test(base)) {
      setStatus("آدرس باید با http:// یا https:// شروع شود.", "err");
      return;
    }
    if (location.protocol === "https:" && /^http:\/\//i.test(base)) {
      setStatus(
        "این صفحه HTTPS است و مرورگر اجازهٔ تماس با آدرس HTTP را نمی‌دهد (mixed content). از آدرس https:// استفاده کنید؛ برای Ollama می‌توانید scripts/ollama_tunnel.sh را اجرا کنید.",
        "err"
      );
      return;
    }

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "در حال بررسی…";
    setStatus("بررسی " + base + " …", "warn");

    try {
      let health;
      try {
        health = await callWorker(base, "/health");
      } catch (error) {
        setStatus(networkHint(base, error), "err");
        return;
      }

      if (health.response.status === 404) {
        setStatus(
          "۴۰۴ در /health: این آدرس ریشهٔ Worker نیست. آدرس را بدون مسیر اضافه بگذارید (مثل https://ai-assistant-proxy.<account>.workers.dev) و دوباره تست کنید.",
          "err"
        );
        return;
      }
      if (health.response.status === 403) {
        setStatus("۴۰۳ در /health: این آدرس به Worker دیگری می‌خورد یا مسیر مسدود است. آدرس را از خروجی deploy بردارید.", "err");
        return;
      }
      if (!health.response.ok || !health.body) {
        setStatus("پاسخ /health قابل خواندن نبود (کد " + fa(health.response.status) + "). آدرس و لاگ Worker را بررسی کنید.", "err");
        return;
      }
      if (health.body.configured !== true) {
        setStatus(
          "Worker بالاست ولی کلید API روی آن تنظیم نشده (configured:false). یک بار اجرا کنید: npx wrangler secret put NUMES_API_KEY و بعد این تست را تکرار کنید.",
          "err"
        );
        return;
      }

      let models;
      try {
        models = await callWorker(base, "/api/models");
      } catch (error) {
        setStatus(networkHint(base, error), "err");
        return;
      }

      if (models.response.status === 403) {
        setStatus(
          "۴۰۳ از /api/models: دامنهٔ این صفحه (" +
            location.origin +
            ") در ALLOWED_ORIGINS خود Worker نیست. آن را به wrangler.toml اضافه کنید و دوباره deploy کنید.",
          "err"
        );
        return;
      }
      if (models.response.status === 404) {
        setStatus("۴۰۴ از /api/models: این Worker مسیر مدل‌ها را ندارد؛ نسخهٔ قدیمی است یا آدرس اشتباه. دوباره deploy کنید.", "err");
        return;
      }
      if (!models.response.ok || !models.body) {
        setStatus("پاسخ /api/models قابل خواندن نبود (کد " + fa(models.response.status) + ").", "err");
        return;
      }

      const list = Array.isArray(models.body.models) ? models.body.models.filter((item) => item && item.id) : [];
      const ready = models.body.default || (list[0] && list[0].id) || health.body.model || "";
      if (!list.length) {
        setStatus("اتصال برقرار است و کلید تنظیم شده، ولی فهرست مدل خالی است (MODEL/MODELS را در wrangler.toml بررسی کنید).", "warn");
        return;
      }

      const names = list.slice(0, 4).map((item) => item.id).join("، ");
      const more = list.length > 4 ? " و " + fa(list.length - 4) + " مدل دیگر" : "";
      setStatus(
        "اتصال برقرار است ✅ مدل آماده: " +
          ready +
          "\nمدل‌های سرور (" +
          fa(list.length) +
          "): " +
          names +
          more +
          "\nبرای استفاده، «ذخیره و استفاده» را بزنید.",
        "ok"
      );
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  button.addEventListener("click", testConnection);
  input.addEventListener("input", clearStatus);
})();
