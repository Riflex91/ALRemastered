import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes status, logs and sanitized export on loopback", async () => {
  const runtime = new CoreRuntime();
  runtime.start();

  const logger = new Logger({ component: "test", ringSize: 20 });
  logger.info("Connected token=secret-value", { password: "hidden-password", safe: "visible" });

  const dashboard = new DashboardServer({
    logger,
    runtime,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const status = await fetch(`${url}/api/status`);
    assert.equal(status.status, 200);
    const statusPayload = await status.json();
    assert.equal(statusPayload.application, "ALRemastered");
    assert.equal(statusPayload.status, "running");

    const logs = await fetch(`${url}/api/logs`);
    assert.equal(logs.status, 200);
    const logPayload = await logs.json();
    assert.ok(logPayload.records.length >= 2);

    const exported = await fetch(`${url}/api/logs/export`);
    assert.equal(exported.status, 200);
    const exportPayload = await exported.json();
    assert.equal(exportPayload.sanitized, true);
    assert.doesNotMatch(exportPayload.text, /secret-value|hidden-password/);
    assert.match(exportPayload.text, /Secrets sanitized: yes/);

    const traversal = await fetch(`${url}/package.json`);
    assert.equal(traversal.status, 404);

    const cleared = await fetch(`${url}/api/logs/clear`, { method: "POST" });
    assert.equal(cleared.status, 200);
    const afterClear = await fetch(`${url}/api/logs`);
    const afterClearPayload = await afterClear.json();
    assert.equal(afterClearPayload.records.length, 0);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard streams new log records with server-sent events", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "stream-test" });
  const dashboard = new DashboardServer({ logger, runtime, host: "127.0.0.1", port: 0 });
  const url = await dashboard.start();

  const controller = new AbortController();
  try {
    const response = await fetch(`${url}/api/logs/stream`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.ok(response.body);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    logger.warn("Live dashboard event.");

    let received = "";
    for (let attempt = 0; attempt < 5 && !received.includes("Live dashboard event."); attempt += 1) {
      const result = await reader.read();
      if (result.done) break;
      received += decoder.decode(result.value, { stream: true });
    }

    assert.match(received, /event: log/);
    assert.match(received, /Live dashboard event\./);
  } finally {
    controller.abort();
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard user interface contains the required English controls", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  for (const label of [
    "Core status",
    "Client version",
    "Uptime",
    "Debug Console",
    "Auto-scroll",
    "Copy full log",
    "Copy filtered log",
    "Download log",
    "Clear log",
    "Check for updates",
    "Install update",
    "Skip this version",
    "Remind me tomorrow",
    "Release notes",
  ]) {
    assert.equal(html.includes(label), true, `Missing dashboard label: ${label}`);
  }
});


test("dashboard update API delegates update actions", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-update-test" });
  const available = {
    status: "available",
    currentVersion: "0.1.0-alpha.4",
    latestVersion: "0.1.0-alpha.5",
    publishedAt: "2026-10-02T14:00:00.000Z",
    releaseNotesUrl: "https://github.com/Riflex91/ALRemastered/releases/tag/v0.1.0-alpha.5",
  };
  const fakeUpdateService = {
    state: () => available,
    checkNow: async () => available,
    skipVersion: () => ({ ...available, status: "deferred", message: "This version will be skipped." }),
    remindTomorrow: () => ({ ...available, status: "deferred", message: "This update will be shown again tomorrow." }),
    installUpdate: async () => ({ ...available, status: "installing", progressPercent: 100 }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    updateService: fakeUpdateService,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/update`);
    assert.equal((await current.json()).status, "available");

    const checked = await fetch(`${url}/api/update/check`, { method: "POST" });
    assert.equal((await checked.json()).latestVersion, "0.1.0-alpha.5");

    const skipped = await fetch(`${url}/api/update/skip`, { method: "POST" });
    assert.equal((await skipped.json()).status, "deferred");

    const reminded = await fetch(`${url}/api/update/remind`, { method: "POST" });
    assert.equal((await reminded.json()).status, "deferred");

    const installing = await fetch(`${url}/api/update/install`, { method: "POST" });
    assert.equal((await installing.json()).status, "installing");
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
