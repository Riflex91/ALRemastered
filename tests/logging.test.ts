import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { REDACTED, sanitizeString, sanitizeValue } from "../src/logging/sanitizer.ts";

test("sanitizer removes common inline secrets", () => {
  const source = [
    "Authorization: Bearer abc.def.ghi",
    "password=hunter2",
    "access_token=token-value",
    "auth=adventure-land-auth",
    "Cookie: session=very-secret",
    "https://user:secret@example.com/path",
  ].join("\n");

  const sanitized = sanitizeString(source);
  assert.doesNotMatch(sanitized, /hunter2|token-value|adventure-land-auth|very-secret|abc\.def\.ghi|user:secret@/);
  assert.match(sanitized, /\[REDACTED\]/);
});

test("sanitizer removes nested secret fields while preserving correlation ids", () => {
  const sanitized = sanitizeValue({
    password: "one",
    authToken: "two",
    auth: "adventure-land-session",
    nested: {
      cookie: "three",
      safe: "visible",
      sessionId: "correlation-session",
      requestId: "request-7",
    },
  }) as Record<string, any>;

  assert.equal(sanitized.password, REDACTED);
  assert.equal(sanitized.authToken, REDACTED);
  assert.equal(sanitized.auth, REDACTED);
  assert.equal(sanitized.nested.cookie, REDACTED);
  assert.equal(sanitized.nested.safe, "visible");
  assert.equal(sanitized.nested.sessionId, "correlation-session");
  assert.equal(sanitized.nested.requestId, "request-7");
});

test("logger stores structured sanitized records in memory and on disk", () => {
  const root = mkdtempSync(join(tmpdir(), "alremastered-log-"));
  try {
    const logFile = join(root, "client.log");
    const logger = new Logger({
      component: "test",
      logFile,
      ringSize: 10,
      clock: () => new Date("2026-10-02T12:00:00.000Z"),
    });

    logger.info(
      "Connected with Authorization: Bearer hidden-token",
      { password: "hidden-password", safe: "visible" },
      { characterId: "Ranger1", sessionId: "session-correlation", requestId: "request-1" },
    );
    logger.error("Request failed token=hidden-inline", new Error("password=hidden-error"));

    const records = logger.records();
    assert.equal(records.length, 2);
    assert.equal(records[0].timestamp, "2026-10-02T12:00:00.000Z");
    assert.equal(records[0].level, "INFO");
    assert.equal(records[0].component, "test");
    assert.equal(records[0].characterId, "Ranger1");
    assert.equal(records[0].sessionId, "session-correlation");
    assert.equal(records[0].requestId, "request-1");

    const exported = logger.exportText();
    const disk = readFileSync(logFile, "utf8");
    for (const value of ["hidden-token", "hidden-password", "hidden-inline", "hidden-error"]) {
      assert.doesNotMatch(exported, new RegExp(value));
      assert.doesNotMatch(disk, new RegExp(value));
    }
    assert.match(disk, /"safe":"visible"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("logger ring buffer is bounded and log files rotate", () => {
  const root = mkdtempSync(join(tmpdir(), "alremastered-log-"));
  try {
    const logFile = join(root, "client.log");
    const logger = new Logger({
      component: "rotation-test",
      logFile,
      ringSize: 2,
      maxFileBytes: 1_024,
      maxArchives: 2,
    });

    for (let index = 0; index < 30; index += 1) {
      logger.info(`Line ${index} ${"x".repeat(80)}`);
    }

    const records = logger.records();
    assert.equal(records.length, 2);
    assert.match(records[0].message, /Line 28/);
    assert.match(records[1].message, /Line 29/);
    assert.equal(existsSync(`${logFile}.1`), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
