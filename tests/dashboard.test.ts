import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { DiagnosticsService } from "../src/diagnostics/service.ts";
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
    "Diagnostics overview",
    "Recent errors",
    "Copy diagnostic snapshot",
    "Download diagnostic package",
    "Check game version",
    "Adventure Land version",
    "Game version status",
    "Last deploy",
    "Game data",
    "Reload game data",
    "Game data status",
    "Game data version",
    "Loaded families",
    "Loaded at",
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


test("dashboard exposes sanitized diagnostics snapshot and package", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-diagnostics-test" });
  const diagnostics = new DiagnosticsService(logger, () => runtime.health());
  diagnostics.registerComponent("core", () => ({
    name: "core",
    status: "healthy",
    message: "Core runtime is running.",
  }));
  logger.error(
    "Dashboard request failed.",
    new Error("password=diagnostic-secret"),
    { token: "hidden-token", route: "/api/synthetic" },
  );

  const dashboard = new DashboardServer({
    logger,
    runtime,
    diagnostics,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const snapshotResponse = await fetch(`${url}/api/diagnostics/snapshot`);
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.sanitized, true);
    assert.equal(snapshot.recentErrors.length, 1);
    assert.equal(snapshot.components[0].name, "core");
    assert.doesNotMatch(JSON.stringify(snapshot), /diagnostic-secret|hidden-token/);

    const packageResponse = await fetch(`${url}/api/diagnostics/package`);
    assert.equal(packageResponse.status, 200);
    assert.match(packageResponse.headers.get("content-disposition") ?? "", /ALRemastered-diagnostics-/);
    const diagnosticPackage = await packageResponse.text();
    assert.match(diagnosticPackage, /ALRemasteredDiagnosticPackage/);
    assert.doesNotMatch(diagnosticPackage, /diagnostic-secret|hidden-token/);
  } finally {
    await dashboard.stop();
    diagnostics.dispose();
    runtime.stop();
  }
});

test("dashboard script provides technical details and Copy full log on error cards", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /Technical details/);
  assert.match(script, /copy\.textContent = "Copy full log"/);
  assert.match(script, /refreshDiagnostics/);
});


test("dashboard game version API exposes state and manual checks", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-game-version-test" });
  const current = {
    status: "current",
    currentVersion: 15555,
    storedVersion: 15555,
    lastDeploy: "[10/09/26]",
    checkedAt: "2026-10-02T16:30:00.000Z",
    sourceUrl: "https://example.test/version.js",
    message: "Stored Adventure Land version matches the current online version.",
  };
  let checks = 0;
  const fakeGameVersionService = {
    state: () => current,
    checkNow: async () => {
      checks += 1;
      return current;
    },
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    gameVersionService: fakeGameVersionService,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const stateResponse = await fetch(`${url}/api/game-version`);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.currentVersion, 15555);
    assert.equal(state.status, "current");

    const checkResponse = await fetch(`${url}/api/game-version/check`, { method: "POST" });
    assert.equal(checkResponse.status, 200);
    assert.equal((await checkResponse.json()).currentVersion, 15555);
    assert.equal(checks, 1);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard script renders Adventure Land version state", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /refreshGameVersion/);
  assert.match(script, /Changed from/);
  assert.match(script, /Checking Adventure Land game version/);
});


test("dashboard game data API exposes loading state and manual reload", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-game-data-test" });
  const loaded = {
    status: "loaded",
    version: 15555,
    loadedAt: "2026-10-02T17:00:00.000Z",
    sourceUrl: "https://example.test/data.js",
    bytes: 1234,
    familyCount: 14,
    loadedFamilyCount: 14,
    families: [
      { name: "items", required: true, loaded: true, count: 900 },
      { name: "geometry", required: true, loaded: true, count: 42 },
      { name: "events", required: false, loaded: true, count: 8 },
    ],
    message: "Adventure Land game data is loaded and available.",
  };
  let reloads = 0;
  const fakeGameDataService = {
    state: () => loaded,
    loadNow: async () => {
      reloads += 1;
      return loaded;
    },
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    gameDataService: fakeGameDataService,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const stateResponse = await fetch(`${url}/api/game-data`);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.status, "loaded");
    assert.equal(state.version, 15555);
    assert.equal(state.loadedFamilyCount, 14);

    const reloadResponse = await fetch(`${url}/api/game-data/reload`, { method: "POST" });
    assert.equal(reloadResponse.status, 200);
    assert.equal((await reloadResponse.json()).status, "loaded");
    assert.equal(reloads, 1);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard script renders Adventure Land game data families and counts", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /refreshGameData/);
  assert.match(script, /G\.\$\{family\.name\}/);
  assert.match(script, /entries/);
  assert.match(script, /Reloading Adventure Land game data/);
});
