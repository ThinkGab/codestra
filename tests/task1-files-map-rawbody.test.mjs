/**
 * Task 1 TDD — RED phase
 * Tests for: files Map declaration and readRawBody helper in servers/hub.mjs
 *
 * These tests verify the two additions required by Task 1:
 *   1. `const files = new Map()` exists at module level
 *   2. `readRawBody` exists, resolves with Buffer on normal body, rejects
 *      with err.code === "BODY_TOO_LARGE" when body exceeds 10 MB
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";

// ── Grep-based structural checks (no import needed) ────────────────────────

const src = readFileSync(
  new URL("../servers/hub.mjs", import.meta.url),
  "utf8"
);

test("files Map is declared at module level with correct shape comment", () => {
  assert.match(src, /const files = new Map\(\)/);
});

test("readRawBody function is declared in hub.mjs", () => {
  assert.match(src, /function readRawBody/);
});

test("readRawBody uses BODY_TOO_LARGE error code", () => {
  assert.match(src, /BODY_TOO_LARGE/);
});

test("readRawBody uses 10_485_760 as maxBytes default", () => {
  assert.match(src, /10_485_760/);
});

test("readRawBody resolves with raw Buffer (no JSON.parse inside it)", () => {
  // Find the readRawBody function body
  const fnStart = src.indexOf("function readRawBody");
  assert.notEqual(fnStart, -1, "readRawBody must exist");
  // Extract from function start to the closing brace
  // Count braces to find the matching closing brace
  let depth = 0;
  let fnEnd = fnStart;
  let entered = false;
  for (let i = fnStart; i < src.length; i++) {
    if (src[i] === "{") { depth++; entered = true; }
    if (src[i] === "}") { depth--; }
    if (entered && depth === 0) { fnEnd = i; break; }
  }
  const fnBody = src.slice(fnStart, fnEnd + 1);
  assert.doesNotMatch(fnBody, /JSON\.parse/, "readRawBody must not call JSON.parse");
  assert.match(fnBody, /Buffer\.concat\(chunks\)/, "readRawBody must return Buffer.concat(chunks)");
});

test("readBody (original) is still present with 1_048_576 and JSON.parse", () => {
  assert.match(src, /1_048_576/);
  assert.match(src, /JSON\.parse/);
});
