/**
 * Task 2 TDD — RED phase
 * Tests for: four file route handlers in servers/hub.mjs
 *
 * Uses node:http to start the actual hub and makes real HTTP requests.
 * Tests all five ROADMAP.md success criteria plus structural checks.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

// ── Structural checks (grep-based, no server needed) ──────────────────────

const src = readFileSync(
  new URL("../servers/hub.mjs", import.meta.url),
  "utf8"
);

test('PUT /files/:swarmId/:filename route is declared in routes object', () => {
  assert.match(src, /"PUT \/files\/:swarmId\/:filename"/);
});

test('GET /files/:swarmId/:filename route is declared in routes object', () => {
  assert.match(src, /"GET \/files\/:swarmId\/:filename"/);
});

test('GET /files/:swarmId route is declared in routes object', () => {
  assert.match(src, /"GET \/files\/:swarmId"/);
});

test('DELETE /files/:swarmId/:filename route is declared in routes object', () => {
  assert.match(src, /"DELETE \/files\/:swarmId\/:filename"/);
});

test('PUT handler uses crypto.randomUUID() (not generateId())', () => {
  assert.match(src, /crypto\.randomUUID\(\)/);
});

test('PUT handler calls readRawBody (not readBody)', () => {
  assert.match(src, /await readRawBody\(req\)/);
});

// ── Integration tests (real HTTP server) ──────────────────────────────────

const PORT = 17801;
const BASE = `http://localhost:${PORT}`;
const SWARM = "test-swarm-001";

let hubProcess;

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ statusCode: res.statusCode, data });
      });
    });
    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

before(async () => {
  await new Promise((resolve, reject) => {
    hubProcess = spawn(
      process.execPath,
      [new URL("../servers/hub.mjs", import.meta.url).pathname],
      { env: { ...process.env, SWARM_PORT: String(PORT) } }
    );
    hubProcess.stderr.on("data", (d) => {
      if (d.toString().includes("listening")) resolve();
    });
    hubProcess.stdout.on("data", (d) => {
      if (d.toString().includes("listening")) resolve();
    });
    hubProcess.on("error", reject);
    setTimeout(resolve, 1000); // fallback
  });
});

after(() => {
  if (hubProcess) hubProcess.kill();
});

// SC1: PUT returns {id, filename, size, mimeType, uploadedAt} with UUID v4
test("SC1: PUT /files/:swarmId/:filename returns correct shape with UUID v4 id", async () => {
  const body = Buffer.from("hello world");
  const res = await httpRequest({
    method: "PUT",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}/report.txt`,
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": body.length,
    },
  }, body);

  assert.equal(res.statusCode, 200);
  assert.ok(res.data.id, "response must have id");
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(res.data.id),
    `id must be UUID v4, got: ${res.data.id}`
  );
  assert.equal(res.data.filename, "report.txt");
  assert.equal(res.data.size, 11);
  assert.equal(res.data.mimeType, "text/plain");
  assert.ok(res.data.uploadedAt, "response must have uploadedAt");
});

// SC2: GET /files/:swarmId/:filename returns paginated content
test("SC2: GET /files/:swarmId/:filename returns paginated content", async () => {
  const res = await httpRequest({
    method: "GET",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}/report.txt?offset=0&max_bytes=5`,
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.data.content !== undefined, "must have content");
  assert.ok(res.data.offset !== undefined, "must have offset");
  assert.ok(res.data.total_size !== undefined, "must have total_size");
  assert.ok(res.data.has_more !== undefined, "must have has_more");
  assert.equal(res.data.content, "hello");
  assert.equal(res.data.offset, 0);
  assert.equal(res.data.total_size, 11);
  assert.equal(res.data.has_more, true);
});

// SC3: GET /files/:swarmId returns array; two uploads = two elements, no content field
test("SC3: GET /files/:swarmId returns array of metadata without content field", async () => {
  // Upload second file
  const body2 = Buffer.from("another file");
  await httpRequest({
    method: "PUT",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}/second.txt`,
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": body2.length,
    },
  }, body2);

  const res = await httpRequest({
    method: "GET",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}`,
  });

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.data), "must return array");
  assert.equal(res.data.length, 2, "must have 2 elements");
  for (const item of res.data) {
    assert.ok(item.id, "item must have id");
    assert.ok(item.filename, "item must have filename");
    assert.ok(item.size !== undefined, "item must have size");
    assert.ok(item.mimeType, "item must have mimeType");
    assert.ok(item.uploadedAt, "item must have uploadedAt");
    assert.ok(item.content === undefined, "item must NOT have content field");
  }
});

// SC4: DELETE then GET returns 404
test("SC4: DELETE /files/:swarmId/:filename then GET returns 404", async () => {
  const delRes = await httpRequest({
    method: "DELETE",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}/report.txt`,
  });
  assert.equal(delRes.statusCode, 200);
  assert.deepEqual(delRes.data, { deleted: true });

  const getRes = await httpRequest({
    method: "GET",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}/report.txt`,
  });
  assert.equal(getRes.statusCode, 404);
});

// SC5: PUT with body > 10 MB returns 413
test("SC5: PUT with body exceeding 10 MB returns HTTP 413", async () => {
  const bigBody = Buffer.alloc(10_500_000, "x");
  const res = await httpRequest({
    method: "PUT",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}/big.bin`,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": bigBody.length,
    },
  }, bigBody);

  assert.equal(res.statusCode, 413);
  assert.ok(res.data.error, "must have error field");
});

// Path traversal: ../etc/passwd stored as opaque metadata, never touches disk
test("Path traversal filename stored as opaque metadata", async () => {
  const body = Buffer.from("evil");
  const res = await httpRequest({
    method: "PUT",
    hostname: "localhost",
    port: PORT,
    path: `/files/${SWARM}/../etc/passwd`,
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": body.length,
    },
  }, body);

  // Hub responds with valid JSON containing a filename field
  assert.equal(res.statusCode, 200);
  assert.ok(res.data.filename !== undefined, "must have filename field (opaque)");
});

// Existing routes still work
test("Existing health route still returns {status: 'ok'}", async () => {
  const res = await httpRequest({
    method: "GET",
    hostname: "localhost",
    port: PORT,
    path: "/health",
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.status, "ok");
});
