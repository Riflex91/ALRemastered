import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import { RendererBridge } from "../src/renderer/bridge.ts";

test("Slice 10.2 serves a read-only Browser View over the existing Renderer Bridge", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const logger = new Logger({ component: "slice-10-2-browser-view-test" });
  const bridge = new RendererBridge({
    logger,
    core: () => runtime.health(),
    character: () => ({
      status: "connected",
      characterId: "character-1",
      characterName: "Merchant",
      serverKey: "SR_EUII",
      serverRegion: "EU",
      serverName: "II",
      connectedAt: "2026-10-04T12:00:00.000Z",
      character: {
        id: "character-1",
        name: "Merchant",
        type: "merchant",
        level: 80,
        map: "main",
        x: 10,
        y: 20,
        hp: 500,
        maxHp: 500,
        mp: 300,
        maxMp: 300,
        dead: false,
      },
      message: "Character connected.",
    }),
    script: () => ({
      status: "unloaded",
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 0,
      message: "No script loaded.",
    }),
    stateIntervalMs: 50,
  });
  bridge.start();

  const dashboard = new DashboardServer({
    logger,
    runtime,
    rendererBridge: bridge,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const page = await fetch(`${url}/browser-view`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<h1>Browser View<\/h1>/);
    assert.match(html, />Current Character state</);
    assert.match(html, /id="close-browser-view"/);
    assert.match(html, /src="\/browser-view\.js"/);

    const script = await fetch(`${url}/browser-view.js`);
    assert.equal(script.status, 200);
    const javascript = await script.text();
    assert.match(javascript, /fetch\("\/api\/renderer\/snapshot"/);
    assert.match(javascript, /\/api\/renderer\/stream\?clientId=/);
    assert.match(javascript, /window\.close\(\)/);
    assert.doesNotMatch(javascript, /method:\s*["']POST["']/);
    assert.doesNotMatch(javascript, /api\/action-gateway/);

    const snapshot = await fetch(`${url}/api/renderer/snapshot`);
    const payload = await snapshot.json();
    assert.equal(payload.snapshot.character.characterName, "Merchant");
    assert.equal(payload.snapshot.core.status, "running");
  } finally {
    await dashboard.stop();
    bridge.stop();
    runtime.stop();
  }
});

test("Slice 10.2 is the single current one-click verification and preserves 10.1 as history", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../dashboard/browser-view.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.3"/);
  assert.match(html, /data-verification-test="10\.1" hidden/);
  assert.match(html, /data-verification-test="10\.2" hidden/);
  assert.match(html, /id="open-browser-view"/);
  assert.match(html, /id="start-slice-10-2-live-test"/);
  assert.match(html, />Start test<\/button>/);

  assert.match(app, /openBrowserViewWindow/);
  assert.match(app, /window\.open\(/);
  assert.match(app, /character-state-rendered/);
  assert.match(app, /browser-close/);
  assert.match(app, /Core restart:/);
  assert.match(app, /Character restart:/);
  assert.match(app, /Script restart:/);
  assert.match(app, /Action Gateway requests:/);

  assert.match(browser, /__alrBrowserViewState/);
  assert.match(browser, /characterName/);
  assert.match(browser, /window\.close\(\)/);

  assert.match(server, /"\/browser-view": "browser-view\.html"/);
  assert.match(server, /GET" && path === "\/api\/renderer\/snapshot"/);
  assert.match(server, /GET" && path === "\/api\/renderer\/stream"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/renderer/);
});
