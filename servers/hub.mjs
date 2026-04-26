#!/usr/bin/env node
/**
 * Codestra — Hub Server
 *
 * Central HTTP broker that manages worker registration, status tracking,
 * and inter-instance messaging across a LAN.
 *
 * Usage:
 *   SWARM_PORT=7800 SWARM_SECRET=mysecret node hub.mjs
 *
 * Environment:
 *   SWARM_PORT   — listen port (default 7800)
 *   SWARM_HOST   — bind address (default 0.0.0.0 for LAN access)
 *   SWARM_SECRET — shared secret for basic auth (optional but recommended on LAN)
 */

import http from "node:http";
import crypto from "node:crypto";

const PORT = parseInt(process.env.SWARM_PORT || "7800", 10);
const HOST = process.env.SWARM_HOST || "0.0.0.0";
const SECRET = process.env.SWARM_SECRET || "";

// ── State ───────────────────────────────────────────────────────────────────

/** @type {Map<string, {id: string, role: string, task: string, status: string, cwd: string, host: string, registeredAt: string, lastSeen: string}>} */
const workers = new Map();

/** @type {Array<{id: string, from: string, to: string, body: string, timestamp: string, read: boolean}>} */
const messages = [];

/** @type {Map<string, {id: string, swarmId: string, filename: string, content: Buffer, size: number, mimeType: string, uploadedAt: string}>} */
const files = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, maxBytes = 1_048_576 /* 1 MB */) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        return reject(new Error("Request body too large"));
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req, maxBytes = 10_485_760 /* 10 MB */) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        const err = new Error("Request body too large");
        err.code = "BODY_TOO_LARGE";
        return reject(err);
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function authorize(req, res) {
  if (!SECRET) return true;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  // Constant-time comparison to prevent timing attacks
  const tokenBuf  = Buffer.from(token.padEnd(SECRET.length));
  const secretBuf = Buffer.from(SECRET);
  if (
    tokenBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(tokenBuf, secretBuf)
  ) return true;
  json(res, 401, { error: "Unauthorized — set SWARM_SECRET" });
  return false;
}

function generateId() {
  return crypto.randomBytes(4).toString("hex");
}

function isLanUrl(raw) {
  try {
    const { hostname } = new URL(raw);
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  } catch { return false; }
}

async function pushToWorker(worker, msg) {
  if (!worker.callback_url) return false;
  try {
    // No Authorization header on outbound push — workers don't need to
    // authenticate the hub, and forwarding SECRET to callback_url would
    // allow a malicious worker to exfiltrate the shared secret.
    const res = await fetch(worker.callback_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: msg.id,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok; // true on 2xx
  } catch {
    return false;
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

const routes = {
  // Health check
  "GET /health": (_req, res) => {
    json(res, 200, { status: "ok", workers: workers.size, uptime: process.uptime() });
  },

  // Register / update a worker
  "POST /workers": async (req, res) => {
    const body = await readBody(req);
    // Reject non-LAN callback_url to prevent SSRF / secret exfiltration
    if (body.callback_url && !isLanUrl(body.callback_url)) {
      return json(res, 400, { error: "callback_url must be a LAN address" });
    }
    const id = body.id || generateId();
    const worker = {
      id,
      role: body.role || "worker",
      task: body.task || "",
      status: body.status || "idle",
      cwd: body.cwd || "",
      host: body.host || req.socket.remoteAddress || "unknown",
      registeredAt: workers.has(id) ? workers.get(id).registeredAt : new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      callback_url: body.callback_url || null,
    };
    workers.set(id, worker);
    json(res, 200, { ok: true, worker });
  },

  // List all workers
  "GET /workers": (_req, res) => {
    json(res, 200, { workers: [...workers.values()] });
  },

  // Get single worker
  "GET /workers/:id": (req, res, params) => {
    const w = workers.get(params.id);
    if (!w) return json(res, 404, { error: "Worker not found" });
    json(res, 200, { worker: w });
  },

  // Update worker status
  "PATCH /workers/:id": async (req, res, params) => {
    const w = workers.get(params.id);
    if (!w) return json(res, 404, { error: "Worker not found" });
    const body = await readBody(req);
    if (body.status !== undefined) w.status = body.status;
    if (body.task   !== undefined) w.task   = body.task;
    w.lastSeen = new Date().toISOString();
    json(res, 200, { ok: true, worker: w });
  },

  // Remove a worker
  "DELETE /workers/:id": (_req, res, params) => {
    const deleted = workers.delete(params.id);
    if (!deleted) return json(res, 404, { error: "Worker not found" });
    json(res, 200, { ok: true });
  },

  // Send a message
  "POST /messages": async (req, res) => {
    const body = await readBody(req);
    if (!body.from || !body.to || !body.body) {
      return json(res, 400, { error: "Required fields: from, to, body" });
    }
    const msg = {
      id: generateId(),
      from: body.from,
      to: body.to, // worker id or "broadcast"
      body: body.body,
      timestamp: new Date().toISOString(),
      readBy: new Set(),
    };
    messages.push(msg);
    // D-03: response contract unchanged — {ok, message}
    // D-07: respond FIRST, push async — sender never hangs waiting for worker
    json(res, 201, { ok: true, message: { ...msg, readBy: [...msg.readBy] } });

    setImmediate(async () => {
      if (msg.to === "broadcast") {
        // D-01: push to ALL workers with a callback_url; per-worker silent fallback
        const targets = [...workers.values()].filter((w) => w.callback_url);
        await Promise.allSettled(
          targets.map(async (worker) => {
            const ok = await pushToWorker(worker, msg);
            if (ok) msg.readBy.add(worker.id); // D-02: mark delivered per worker
          })
        );
      } else {
        // Unicast: push to the specific recipient if they have a callback_url
        const worker = workers.get(msg.to);
        if (worker) {
          const ok = await pushToWorker(worker, msg);
          if (ok) msg.readBy.add(worker.id); // D-02: mark delivered
          // D-05: if !ok, message stays in store-and-forward (readBy unchanged)
        }
      }
    });
  },

  // Read messages for a worker
  "GET /messages/:workerId": (req, res, params) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const matching = messages.filter((m) => {
      const isRecipient = m.to === params.workerId || m.to === "broadcast";
      return unreadOnly ? isRecipient && !m.readBy.has(params.workerId) : isRecipient;
    });
    // Mark as read for this worker
    matching.forEach((m) => { m.readBy.add(params.workerId); });
    json(res, 200, { messages: matching.map(m => ({ ...m, readBy: [...m.readBy] })) });
  },
};

// ── Router ──────────────────────────────────────────────────────────────────

function matchRoute(method, pathname) {
  // Try exact match first
  const exact = `${method} ${pathname}`;
  if (routes[exact]) return { handler: routes[exact], params: {} };

  // Try parameterized routes
  for (const [pattern, handler] of Object.entries(routes)) {
    const [pMethod, pPath] = pattern.split(" ");
    if (pMethod !== method) continue;
    const pParts = pPath.split("/");
    const uParts = pathname.split("/");
    if (pParts.length !== uParts.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(":")) {
        params[pParts[i].slice(1)] = uParts[i];
      } else if (pParts[i] !== uParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { handler, params };
  }
  return null;
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (!authorize(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = matchRoute(req.method, url.pathname);

  if (!route) {
    return json(res, 404, { error: "Not found" });
  }

  try {
    await route.handler(req, res, route.params);
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🐝 Codestra Hub listening on http://${HOST}:${PORT}`);
  if (SECRET) console.log("🔒 Auth enabled (SWARM_SECRET set)");
  else console.log("⚠️  No SWARM_SECRET — hub is open (fine for trusted LAN)");
});
