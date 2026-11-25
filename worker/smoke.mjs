/* تست محلی Worker در حالت wrangler dev — بدون کلید واقعی.
 *
 * اجرا:
 *   ترمینال اول:  cd worker && npx wrangler dev --port 8787
 *   ترمینال دوم:  node worker/smoke.mjs
 *
 * آدرس با آرگومان یا متغیر محیطی قابل تغییر است:
 *   node worker/smoke.mjs http://127.0.0.1:8787
 *   WORKER_URL=http://localhost:8787 node worker/smoke.mjs
 *
 * بررسی‌ها: /health، پیش‌پرواز CORS، رد شدن Origin غیرمجاز، مسیر ناشناخته،
 * متد نادرست و پاسخ «کلید تنظیم نشده». اگر در .dev.vars کلید گذاشته باشید،
 * بررسی‌های وابسته به کلید به‌جای خطا SKIP می‌شوند.
 */

const BASE = (process.argv[2] || process.env.WORKER_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const ALLOWED = process.env.ALLOWED_ORIGIN || "https://legolasoriginall.github.io";
const FOREIGN = process.env.FOREIGN_ORIGIN || "https://evil.example";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 8000) || 8000;

let passed = 0;
let skipped = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log("PASS " + name);
  } else {
    failures.push(name);
    console.log("FAIL " + name + (detail ? " → " + detail : ""));
  }
}

function skip(name, why) {
  skipped += 1;
  console.log("SKIP " + name + (why ? " → " + why : ""));
}

async function request(path, init = {}) {
  const response = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let text = "";
  try {
    text = await response.text();
  } catch {
    /* بدنهٔ خالی */
  }
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* بدنهٔ غیر JSON */
  }
  return { response, text, json };
}

function postChat(messages, headers = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ messages }),
  };
}

const userMessage = [{ role: "user", content: "سلام" }];

console.log("آزمایش " + BASE + " …\n");

let health;
try {
  health = await request("/health");
} catch (error) {
  console.error("اتصال برقرار نشد: " + (error && error.message ? error.message : error));
  console.error("اول در ترمینال دیگری اجرا کنید:  cd worker && npx wrangler dev");
  process.exit(2);
}

/* ------------------------------------------------------------- /health */
check("health returns 200", health.response.status === 200, String(health.response.status));
check("health body is JSON", Boolean(health.json), health.text.slice(0, 80));
check("health reports ok:true", Boolean(health.json && health.json.ok === true), health.text.slice(0, 120));

const configured = Boolean(health.json && health.json.configured);
console.log("\nکلید در این اجرا " + (configured ? "تنظیم شده است" : "تنظیم نشده است") + "\n");

/* ------------------------------------------------------------- CORS */
{
  const { response } = await request("/api/chat", {
    method: "OPTIONS",
    headers: { Origin: ALLOWED, "Access-Control-Request-Method": "POST" },
  });
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const allowMethods = response.headers.get("access-control-allow-methods") || "";
  check("preflight returns 204", response.status === 204, String(response.status));
  check("preflight echoes allowed origin", allowOrigin === ALLOWED, String(allowOrigin));
  check("preflight allows GET and POST", allowMethods.includes("GET") && allowMethods.includes("POST"), allowMethods);
}

/* ------------------------------------------------------------- مسیرها */
{
  const { response } = await request("/nope", { headers: { Origin: ALLOWED } });
  check("unknown path returns 404", response.status === 404, String(response.status));
}

{
  const { response } = await request("/api/chat", { headers: { Origin: ALLOWED } });
  check("GET on /api/chat returns 405", response.status === 405, String(response.status));
}

/* ------------------------------------------------------------- مدل‌ها */
{
  const { response, json } = await request("/api/models", { headers: { Origin: ALLOWED } });
  const models = (json && Array.isArray(json.models) && json.models) || [];
  check("models returns 200", response.status === 200, String(response.status));
  check("models lists at least one model", models.length > 0 && Boolean(models[0].id), JSON.stringify(json).slice(0, 120));
}

/* ------------------------------------------------------------- Origin غیرمجاز */
{
  const { response, json } = await request("/api/models", { headers: { Origin: FOREIGN } });
  check("models rejects foreign origin with 403", response.status === 403, String(response.status));
  check("models denial has no CORS header", response.headers.get("access-control-allow-origin") === null);
  check("models denial names origin_not_allowed", Boolean(json && json.error === "origin_not_allowed"), JSON.stringify(json));
}

{
  const { response, json } = await request("/api/chat", postChat(userMessage, { Origin: FOREIGN, "CF-Connecting-IP": "203.0.113.7" }));
  check("chat rejects foreign origin with 403", response.status === 403, String(response.status));
  check("chat denial names origin_not_allowed", Boolean(json && json.error === "origin_not_allowed"), JSON.stringify(json));
}

/* ------------------------------------------------------------- کلید */
if (configured) {
  skip("chat without key returns 500", "کلید تنظیم شده است");
  {
    const { response } = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: ALLOWED, "CF-Connecting-IP": "203.0.113.9" },
      body: "hello",
    });
    check("wrong content type returns 415", response.status === 415, String(response.status));
  }
} else {
  {
    const { response, json } = await request("/api/chat", postChat(userMessage, { Origin: ALLOWED, "CF-Connecting-IP": "203.0.113.8" }));
    check("chat without key returns 500", response.status === 500, String(response.status));
    check("server_not_configured is named", Boolean(json && json.error === "server_not_configured"), JSON.stringify(json));
    check("error message does not leak a key", !/bearer\s+\S{8,}/i.test(JSON.stringify(json)), JSON.stringify(json));
  }

  skip("wrong content type returns 415", "بدون کلید، بررسی کلید جلوتر از نوع محتوا اجرا می‌شود");
}

/* ------------------------------------------------------------- نتیجه */
console.log("");
console.log(passed + " passed, " + failures.length + " failed, " + skipped + " skipped");
if (failures.length) {
  console.log("\nبررسی‌های ناموفق:");
  for (const name of failures) console.log(" - " + name);
  console.log("\nاگر سرور بالا نیست، wrangler dev را اجرا کنید؛ اگر ۴۰۳ غیرمنتظره دیدید، ALLOWED_ORIGINS در wrangler.toml را با ALLOWED_ORIGIN این اسکریپت هماهنگ کنید.");
  process.exit(1);
}
