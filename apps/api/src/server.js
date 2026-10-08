import { createServer } from "node:http";
import { askAgent } from "./agent.js";
import { buildCitations, repairCitations } from "./cite.js";
import { createRateLimiter } from "./rate-limit.js";
import { validateChatRequest } from "./validate.js";

const DEFAULT_MAX_BODY_BYTES = 30 * 1024 * 1024; // up to 4 images of about 6 MB each, as base64

// config: { n8nChatUrl, internalKey, rateLimitPerMinute, agentTimeoutMs, maxBodyBytes, fetchImpl, retrieve }
// retrieve(question, history) searches the knowledge base: { status: "ok" | "unavailable", passages }
export function createApp(config) {
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const limiter = createRateLimiter({ limit: config.rateLimitPerMinute ?? 30 });

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { status: "ok" });
    }

    if (path === "/api/chat") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST.", code: "invalid_request" });
      return handleChat(req, res);
    }

    return sendJson(res, 404, { error: "Not found.", code: "invalid_request" });
  });

  async function handleChat(req, res) {
    const started = Date.now();
    const client = clientAddress(req);

    if (!limiter.allow(client)) {
      log({ status: 429, code: "rate_limited", ms: Date.now() - started });
      return sendJson(res, 429, { error: "Too many requests. Please wait a moment.", code: "rate_limited" });
    }

    const body = await readJson(req, maxBodyBytes);
    if (!body.ok) {
      log({ status: body.status, code: body.code, ms: Date.now() - started });
      return sendJson(res, body.status, { error: body.error, code: body.code });
    }

    const checked = validateChatRequest(body.value);
    if (!checked.ok) {
      log({ status: checked.status, code: checked.code, ms: Date.now() - started });
      return sendJson(res, checked.status, { error: checked.error, code: checked.code });
    }

    // Search the approved sources first: the agent may only answer from what is found here
    const knowledge = config.retrieve
      ? await config.retrieve(checked.value.question, checked.value.history)
      : { status: "unavailable", passages: [] };

    const result = await askAgent({ ...checked.value, knowledge: knowledge.status, passages: knowledge.passages }, {
      url: config.n8nChatUrl,
      internalKey: config.internalKey,
      timeoutMs: config.agentTimeoutMs,
      fetchImpl: config.fetchImpl,
    });

    if (!result.ok) {
      log({ status: result.status, code: result.code, ms: Date.now() - started });
      return sendJson(res, result.status, { error: result.error, code: result.code });
    }

    // markers the model put under the wrong number are moved to the passage that holds the fact
    const repair = repairCitations(result.value.answer, knowledge.passages);
    const cited = buildCitations(repair.answer, knowledge.passages);
    const value = { ...result.value, answer: cited.answer, sources: cited.sources };

    // Only metadata is logged, never the questions or answers
    log({
      status: 200,
      tier: value.tier,
      knowledge: knowledge.status,
      found: knowledge.passages.length,
      cited: value.sources.length,
      repaired: repair.repaired,
      unverified: repair.unverified,
      ms: Date.now() - started,
    });
    return sendJson(res, 200, value);
  }

  server.on("close", () => limiter.stop());
  return server;
}

function sendJson(res, status, data) {
  const text = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
}

// Reads and parses the JSON body, refusing anything larger than `limit` bytes
function readJson(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        return resolve({ ok: false, status: 413, code: "attachments_invalid", error: "The request is too large." });
      }
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      } catch {
        resolve({ ok: false, status: 400, code: "invalid_request", error: "Invalid JSON body." });
      }
    });
    req.on("error", () => resolve({ ok: false, status: 400, code: "invalid_request", error: "Could not read the request." }));
  });
}

// Behind Netlify and Render the real client is the first address in X-Forwarded-For
function clientAddress(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function log(fields) {
  console.log(JSON.stringify({ time: new Date().toISOString(), route: "/api/chat", ...fields }));
}
