import worker from "./index.js";

/* اجرا: node worker/test.mjs
   تست‌ها به شبکه دسترسی ندارند؛ fetch بالادست شبیه‌سازی می‌شود. */

let failures = 0;
let passed = 0;

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${extra ? " → " + extra : ""}`);
  }
}

const BASE_ENV = {
  NUMES_API_KEY: "test-key",
  ALLOWED_ORIGINS: "https://legolasoriginall.github.io",
  MODEL: "openai/gpt-6-luna",
  MAX_TOKENS: "500",
  RATE_LIMIT: "1000",
};

const requests = [];
let upstreamResponse = null;

globalThis.fetch = async (url, init) => {
  requests.push({ url, init });
  return typeof upstreamResponse === "function" ? upstreamResponse() : upstreamResponse;
};

function call(path, init = {}, env = BASE_ENV) {
  const request = new Request("https://proxy.example.com" + path, init);
  return worker.fetch(request, env);
}

function jsonBody(messages, extra = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://legolasoriginall.github.io", "CF-Connecting-IP": "1.2.3.4" },
    body: JSON.stringify({ messages, ...extra }),
  };
}

const goodMessages = [{ role: "user", content: "سلام" }];

/* ---------------------------------------------------------------- مسیرها */
{
  const res = await call("/nope", { method: "GET" });
  check("404 for unknown path", res.status === 404, res.status);
}

{
  const res = await call("/health", { method: "GET" });
  const body = await res.json();
  check("health returns configured flag", res.status === 200 && body.configured === true, JSON.stringify(body));
}

{
  const res = await call("/api/chat", { method: "GET" });
  check("405 for GET on /api/chat", res.status === 405, res.status);
}

{
  const res = await call("/api/models", { method: "GET", headers: { Origin: "https://legolasoriginall.github.io" } });
  const body = await res.json();
  check(
    "models lists server model",
    res.status === 200 && body.models.some((model) => model.id === "openai/gpt-6-luna"),
    JSON.stringify(body)
  );
  check("models default comes from env", body.default === "openai/gpt-6-luna", body.default);
}

{
  const res = await call(
    "/api/models",
    { method: "GET", headers: { Origin: "https://legolasoriginall.github.io" } },
    { ...BASE_ENV, MODELS: "a/one,b/two" }
  );
  const body = await res.json();
  check("models uses MODELS allowlist", body.models.length === 2 && body.models[1].id === "b/two", JSON.stringify(body));
}

{
  const res = await call("/api/models", { method: "POST" });
  check("405 for POST on /api/models", res.status === 405, res.status);
}

{
  const res = await call("/api/models", { method: "GET", headers: { Origin: "https://evil.example" } });
  check("403 for foreign origin on models", res.status === 403, res.status);
}

{
  const res = await call("/api/chat", {
    method: "OPTIONS",
    headers: { Origin: "https://legolasoriginall.github.io" },
  });
  check("preflight 204 with CORS header",
    res.status === 204 && res.headers.get("Access-Control-Allow-Origin") === "https://legolasoriginall.github.io",
    res.status + " " + res.headers.get("Access-Control-Allow-Origin"));
}

{
  const res = await call("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ messages: goodMessages }),
  });
  check("403 for foreign origin", res.status === 403, res.status);
}

{
  const res = await call("/api/chat", jsonBody(goodMessages), { ...BASE_ENV, NUMES_API_KEY: "" });
  check("500 when secret is missing", res.status === 500, res.status);
}

{
  const res = await call("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Origin: "https://legolasoriginall.github.io" },
    body: "hello",
  });
  check("415 for wrong content type", res.status === 415, res.status);
}

{
  const res = await call("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://legolasoriginall.github.io" },
    body: "{not json",
  });
  check("400 for invalid JSON", res.status === 400, res.status);
}

{
  const res = await call("/api/chat", jsonBody([]));
  check("400 for empty messages", res.status === 400, res.status);
}

{
  const res = await call("/api/chat", jsonBody([{ role: "tool", content: "x" }]));
  check("400 for bad role", res.status === 400, res.status);
}

{
  const res = await call("/api/chat", jsonBody([{ role: "user", content: "x".repeat(9000) }]));
  check("400 for oversized message", res.status === 400, res.status);
}

/* ---------------------------------------------------------------- استریم موفق */
{
  requests.length = 0;
  upstreamResponse = new Response("data: {\"choices\":[{\"delta\":{\"content\":\"سلام\"}}]}\n\ndata: [DONE]\n\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
  const res = await call("/api/chat", jsonBody(goodMessages));
  const text = await res.text();
  const sent = JSON.parse(requests[0].init.body);
  check("stream returns 200 event-stream", res.status === 200 && res.headers.get("Content-Type").startsWith("text/event-stream"), res.status);
  check("stream body is forwarded", text.includes("\"content\":\"سلام\""), text.slice(0, 80));
  check("authorization uses secret", requests[0].init.headers.Authorization === "Bearer test-key", requests[0].init.headers.Authorization);
  check("model comes from server env", sent.model === "openai/gpt-6-luna", sent.model);
  check("max_tokens capped by env", sent.max_tokens === 500, String(sent.max_tokens));
  check("client model is ignored", sent.model !== "client/model", sent.model);
  check("upstream url is numes", requests[0].url === "https://api.numes.ai/api/v1/chat/completions", requests[0].url);
  check("cors header echoed", res.headers.get("Access-Control-Allow-Origin") === "https://legolasoriginall.github.io");
}

{
  requests.length = 0;
  upstreamResponse = new Response("data: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
  await call("/api/chat", jsonBody(goodMessages), { ...BASE_ENV, UPSTREAM_URL: "https://stub.example/v1/chat/completions" });
  check("upstream url is overridable", requests[0].url === "https://stub.example/v1/chat/completions", requests[0].url);
}

/* ---------------------------------------------------------------- پاسخ غیراستریم */
{
  requests.length = 0;
  upstreamResponse = new Response(JSON.stringify({ id: "gen_1", model: "openai/gpt-6-luna", choices: [{ message: { content: "پاسخ" } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const res = await call("/api/chat", jsonBody(goodMessages, { stream: false }));
  const body = await res.json();
  check("non-stream returns text", res.status === 200 && body.text === "پاسخ", JSON.stringify(body));
  check("non-stream upstream flag", JSON.parse(requests[0].init.body).stream === false);
}

/* ---------------------------------------------------------------- خطای بالادست */
{
  upstreamResponse = new Response(JSON.stringify({ error: { message: "model not found", code: "not_found" } }), { status: 404 });
  const res = await call("/api/chat", jsonBody(goodMessages));
  const body = await res.json();
  check("upstream error mapped to 502", res.status === 502 && body.error === "upstream_error", res.status + " " + JSON.stringify(body));
  check("upstream message sanitized", body.message === "model not found", body.message);
}

{
  upstreamResponse = new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 });
  const res = await call("/api/chat", jsonBody(goodMessages));
  check("upstream 429 preserved", res.status === 429, res.status);
}

{
  upstreamResponse = () => {
    throw new Error("network down");
  };
  const res = await call("/api/chat", jsonBody(goodMessages));
  const body = await res.json();
  check("network failure mapped to 502", res.status === 502 && body.error === "upstream_unreachable", res.status);
}

/* ---------------------------------------------------------------- نرخ */
{
  const env = { ...BASE_ENV, RATE_LIMIT: "2", RATE_WINDOW_MS: "60000" };
  upstreamResponse = new Response("data: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const headers = { "Content-Type": "application/json", Origin: "https://legolasoriginall.github.io", "CF-Connecting-IP": "9.9.9.9" };
  const init = { method: "POST", headers, body: JSON.stringify({ messages: goodMessages }) };
  const first = await call("/api/chat", init, env);
  const second = await call("/api/chat", init, env);
  const third = await call("/api/chat", init, env);
  check("rate limit allows first two", first.status === 200 && second.status === 200, first.status + "/" + second.status);
  check("rate limit blocks third", third.status === 429, third.status);
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures) process.exit(1);
