/* سرور واسط (Cloudflare Worker) برای دموی سایت
 *
 * کلید API فقط در Secret محیطی NUMES_API_KEY نگه داشته می‌شود و هرگز به مرورگر نمی‌رسد.
 * مرورگر فقط به POST /api/chat روی همین Worker پیام می‌فرستد.
 *
 * مسیرها:
 *   POST /api/chat   { messages: [{role, content}], stream?: boolean }
 *   OPTIONS *        پیش‌پرواز CORS
 *   GET  /health     بررسی سریع استقرار (بدون تماس با سرویس بالادست)
 */

const UPSTREAM_URL = "https://api.numes.ai/api/v1/chat/completions";

const LIMITS = {
  maxMessages: 30,
  maxCharsPerMessage: 8000,
  maxTotalChars: 24000,
  maxBodyBytes: 200_000,
  maxTokensCap: 2000,
  upstreamTimeoutMs: 90_000,
};

/* بهترین تلاش برای محدودسازی نرخ: حافظهٔ هر ایزوله، نه ماندگار. */
const buckets = new Map();

function rateLimited(env, ip) {
  const limit = Number(env.RATE_LIMIT || 20);
  const windowMs = Number(env.RATE_WINDOW_MS || 10 * 60 * 1000);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const now = Date.now();
  const entry = buckets.get(ip);
  if (!entry || entry.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

function list(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const allowlist = list(allowedOrigins);
  const headers = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (!allowlist.length) {
    headers["Access-Control-Allow-Origin"] = origin || "*";
  } else if (origin && allowlist.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!origin) {
    headers["Access-Control-Allow-Origin"] = allowlist[0];
  }
  return headers;
}

function jsonResponse(status, payload, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safeMessage(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function validateMessages(input) {
  if (!Array.isArray(input) || input.length === 0) return "messages must be a non-empty array";
  if (input.length > LIMITS.maxMessages) return `messages must contain at most ${LIMITS.maxMessages} items`;
  let total = 0;
  for (const message of input) {
    if (!message || typeof message !== "object") return "each message must be an object";
    if (!["system", "user", "assistant"].includes(message.role)) return "message.role must be system, user or assistant";
    if (typeof message.content !== "string") return "message.content must be a string";
    if (message.content.length > LIMITS.maxCharsPerMessage) {
      return `message.content must be at most ${LIMITS.maxCharsPerMessage} characters`;
    }
    total += message.content.length;
  }
  if (total > LIMITS.maxTotalChars) return `messages must total at most ${LIMITS.maxTotalChars} characters`;
  return "";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowlist = list(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health") {
      if (request.method !== "GET") return jsonResponse(405, { error: "method_not_allowed" }, cors);
      return jsonResponse(
        200,
        { ok: true, configured: Boolean(env.NUMES_API_KEY), model: env.MODEL || "openai/gpt-6-luna" },
        cors
      );
    }

    if (url.pathname !== "/api/chat") {
      return jsonResponse(404, { error: "not_found" }, cors);
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" }, cors);
    }

    if (allowlist.length && origin && !allowlist.includes(origin)) {
      return jsonResponse(403, { error: "origin_not_allowed" }, { Vary: "Origin" });
    }

    if (!env.NUMES_API_KEY) {
      return jsonResponse(500, { error: "server_not_configured", message: "NUMES_API_KEY is not set" }, cors);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse(415, { error: "unsupported_media_type" }, cors);
    }

    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > LIMITS.maxBodyBytes) {
      return jsonResponse(413, { error: "payload_too_large" }, cors);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > LIMITS.maxBodyBytes) return jsonResponse(413, { error: "payload_too_large" }, cors);
      body = JSON.parse(raw);
    } catch {
      return jsonResponse(400, { error: "invalid_json" }, cors);
    }

    const problem = validateMessages(body && body.messages);
    if (problem) return jsonResponse(400, { error: "invalid_messages", message: problem }, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(env, ip)) {
      return jsonResponse(429, { error: "rate_limited", message: "Too many requests, try again later." }, cors);
    }

    const wantsStream = body.stream !== false;
    const maxTokens = Math.min(Number(env.MAX_TOKENS || 800) || 800, LIMITS.maxTokensCap);

    const upstreamPayload = {
      model: env.MODEL || "openai/gpt-6-luna",
      messages: body.messages.map((message) => ({ role: message.role, content: message.content })),
      max_tokens: maxTokens,
      stream: wantsStream,
    };

    let upstream;
    try {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout
        ? AbortSignal.timeout(LIMITS.upstreamTimeoutMs)
        : undefined;
      upstream = await fetch(UPSTREAM_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NUMES_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(upstreamPayload),
        signal,
      });
    } catch (error) {
      return jsonResponse(
        502,
        { error: "upstream_unreachable", message: safeMessage(error && error.message) },
        cors
      );
    }

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      let message = "";
      try {
        const parsed = JSON.parse(detail);
        message = safeMessage((parsed.error && (parsed.error.message || parsed.error.code)) || parsed.message);
      } catch {
        message = safeMessage(detail);
      }
      const status = upstream.status === 429 ? 429 : 502;
      const error = upstream.status === 429 ? "upstream_rate_limited" : "upstream_error";
      return jsonResponse(status, { error, status: upstream.status, message }, cors);
    }

    if (!wantsStream) {
      let payload = null;
      try {
        payload = await upstream.json();
      } catch {
        return jsonResponse(502, { error: "upstream_invalid_response" }, cors);
      }
      const text = (payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content) || "";
      return jsonResponse(200, { text, id: payload.id || null, model: payload.model || upstreamPayload.model }, cors);
    }

    if (!upstream.body) {
      return jsonResponse(502, { error: "upstream_invalid_response" }, cors);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  },
};
