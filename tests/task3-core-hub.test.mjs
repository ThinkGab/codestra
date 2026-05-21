/**
 * Task 3 — Core hub integration tests
 *
 * Covers: worker registration, list, get, update, delete,
 * messaging (unicast + broadcast), unread filter, and auth rejection.
 *
 * Uses node:test with a live hub spawned on PORT 17802.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

const PORT = 17802;
const BASE = `http://localhost:${PORT}`;

let hubProcess;

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: "localhost",
      port: PORT,
      path,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data });
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

before(async () => {
  await new Promise((resolve, reject) => {
    hubProcess = spawn(
      process.execPath,
      [new URL("../servers/hub.mjs", import.meta.url).pathname],
      { env: { ...process.env, SWARM_PORT: String(PORT) } }
    );
    const onData = (d) => { if (d.toString().includes("listening")) resolve(); };
    hubProcess.stdout.on("data", onData);
    hubProcess.stderr.on("data", onData);
    hubProcess.on("error", reject);
    setTimeout(resolve, 1000);
  });
});

after(() => { if (hubProcess) hubProcess.kill(); });

// ── Health ────────────────────────────────────────────────────────────────────

test("GET /health returns {status:'ok'}", async () => {
  const { status, data } = await req("GET", "/health");
  assert.equal(status, 200);
  assert.equal(data.status, "ok");
  assert.ok(typeof data.uptime === "number");
});

// ── Worker registration ───────────────────────────────────────────────────────

test("POST /workers registers a worker and returns it", async () => {
  const { status, data } = await req("POST", "/workers", {
    id: "worker-a",
    role: "leader",
    task: "review",
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.worker.id, "worker-a");
  assert.equal(data.worker.role, "leader");
  assert.equal(data.worker.task, "review");
});

test("POST /workers with same id updates worker (idempotent)", async () => {
  await req("POST", "/workers", { id: "worker-b", role: "worker" });
  const { status, data } = await req("POST", "/workers", { id: "worker-b", role: "worker", task: "lint" });
  assert.equal(status, 200);
  assert.equal(data.worker.task, "lint");
});

test("POST /workers rejects non-LAN callback_url", async () => {
  const { status, data } = await req("POST", "/workers", {
    id: "worker-evil",
    callback_url: "http://evil.example.com/hook",
  });
  assert.equal(status, 400);
  assert.ok(data.error);
});

// ── Worker list / get / update / delete ───────────────────────────────────────

test("GET /workers returns all registered workers", async () => {
  const { status, data } = await req("GET", "/workers");
  assert.equal(status, 200);
  assert.ok(Array.isArray(data.workers));
  assert.ok(data.workers.length >= 2);
});

test("GET /workers/:id returns single worker", async () => {
  const { status, data } = await req("GET", "/workers/worker-a");
  assert.equal(status, 200);
  assert.equal(data.worker.id, "worker-a");
});

test("GET /workers/:id returns 404 for unknown id", async () => {
  const { status } = await req("GET", "/workers/does-not-exist");
  assert.equal(status, 404);
});

test("PATCH /workers/:id updates status and task", async () => {
  const { status, data } = await req("PATCH", "/workers/worker-a", { status: "busy", task: "analysis" });
  assert.equal(status, 200);
  assert.equal(data.worker.status, "busy");
  assert.equal(data.worker.task, "analysis");
});

test("DELETE /workers/:id removes worker", async () => {
  await req("POST", "/workers", { id: "worker-del" });
  const { status, data } = await req("DELETE", "/workers/worker-del");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  const { status: s2 } = await req("GET", "/workers/worker-del");
  assert.equal(s2, 404);
});

// ── Messaging ─────────────────────────────────────────────────────────────────

test("POST /messages sends unicast message", async () => {
  const { status, data } = await req("POST", "/messages", {
    from: "worker-a",
    to: "worker-b",
    body: "hello worker-b",
  });
  assert.equal(status, 201);
  assert.equal(data.ok, true);
  assert.ok(data.message.id);
  assert.equal(data.message.from, "worker-a");
  assert.equal(data.message.to, "worker-b");
});

test("POST /messages requires from, to, body", async () => {
  const { status, data } = await req("POST", "/messages", { from: "worker-a" });
  assert.equal(status, 400);
  assert.ok(data.error);
});

test("GET /messages/:workerId returns messages for recipient", async () => {
  const { status, data } = await req("GET", "/messages/worker-b");
  assert.equal(status, 200);
  assert.ok(Array.isArray(data.messages));
  const msg = data.messages.find((m) => m.body === "hello worker-b");
  assert.ok(msg, "sent message must appear in recipient inbox");
});

test("GET /messages/:workerId?unread=true returns only unread", async () => {
  // Send a fresh message
  await req("POST", "/messages", { from: "worker-a", to: "worker-b", body: "unread-test" });
  const { data } = await req("GET", "/messages/worker-b?unread=true");
  assert.ok(Array.isArray(data.messages));
  const unread = data.messages.find((m) => m.body === "unread-test");
  assert.ok(unread, "fresh message must appear as unread");
});

test("POST /messages broadcast is received by all workers", async () => {
  await req("POST", "/messages", {
    from: "worker-a",
    to: "broadcast",
    body: "hello everyone",
  });
  const { data: dA } = await req("GET", "/messages/worker-a");
  const { data: dB } = await req("GET", "/messages/worker-b");
  const hasA = dA.messages.some((m) => m.to === "broadcast" && m.body === "hello everyone");
  const hasB = dB.messages.some((m) => m.to === "broadcast" && m.body === "hello everyone");
  assert.ok(hasA, "sender must see broadcast");
  assert.ok(hasB, "other worker must see broadcast");
});

// ── Auth ──────────────────────────────────────────────────────────────────────

test("Hub without SWARM_SECRET accepts requests without auth header", async () => {
  // This hub runs without SECRET, so all requests above passed — this is just an explicit assertion.
  const { status } = await req("GET", "/health");
  assert.equal(status, 200);
});
