import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import { RendererBridge } from "../src/renderer/bridge.ts";
import { RendererHandoffService } from "../src/renderer/handoff.ts";

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
}

test("Slice 10.4 binds Browser renderer attach/detach to the SSE lifecycle", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const logger = new Logger({ component: "slice-10-4-live-handoff-test" });
  const character = {
    status: "connected" as const,
    characterId: "character-1",
    characterName: "Merchant",
    serverKey: "SR_EUII",
    connectedAt: "2026-10-04T13:00:00.000Z",
    reconnectCount: 0,
    message: "Character connected.",
  };
  const handoff = new RendererHandoffService({
    character: () => character,
  });
  const bridge = new RendererBridge({
    logger,
    core: () => runtime.health(),
    character: () => character,
    script: () => ({
      status: "running",
      scriptName: "user-script",
      runId: "run-1",
      loadedAt: "2026-10-04T12:59:00.000Z",
      startedAt: "2026-10-04T13:00:00.000Z",
      activeTimers: 1,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 10,
      message: "Script is running.",
    }),
    stateIntervalMs: 50,
  });
  bridge.start();

  const dashboard = new DashboardServer({
    logger,
    runtime,
    rendererBridge: bridge,
    rendererHandoffService: handoff,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  const controller = new AbortController();
  try {
    const before = await (await fetch(`${url}/api/renderer/handoff`)).json();
    assert.equal(before.mode, "headless");
    assert.equal(before.attachedRenderers, 0);
    assert.equal(before.socketOwnership, "headless-core");

    const stream = await fetch(
      `${url}/api/renderer/stream?clientId=browser-test-1`,
      { signal: controller.signal },
    );
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);

    await waitFor(
      () => handoff.state().attachedRenderers === 1,
      "Browser renderer did not attach.",
    );
    const attached = handoff.state();
    assert.equal(attached.mode, "browser");
    assert.equal(attached.socketStrategy, "preserve");
    assert.equal(bridge.state().subscribers, 1);

    controller.abort();
    await waitFor(
      () => handoff.state().attachedRenderers === 0,
      "Browser renderer did not detach.",
    );
    const detached = handoff.state();
    assert.equal(detached.mode, "headless");
    assert.equal(detached.lastSocketContinuity, true);
    assert.equal(detached.reconnectFallback, "soft-handoff");
    assert.equal(bridge.state().subscribers, 0);
  } finally {
    controller.abort();
    await dashboard.stop();
    bridge.stop();
    runtime.stop();
  }
});

test("Slice 10.4 is the current one-click verification and preserves prior Slice 10 history", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../dashboard/browser-view.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="12\.6"/);
  assert.match(html, /data-verification-test="10\.3" hidden/);
  assert.match(html, /data-verification-test="10\.4" hidden/);
  assert.match(html, /id="start-slice-10-4-live-test"/);
  assert.match(html, /existing headless Character socket is preserved/);

  assert.match(app, /renderer-attach/);
  assert.match(app, /renderer-detach/);
  assert.match(app, /socket-continuity-browser/);
  assert.match(app, /socket-preserved/);
  assert.match(app, /soft-handoff-policy/);
  assert.match(app, /Reconnect fallback:/);
  assert.match(app, /Action Gateway requests:/);
  assert.match(app, /Gameplay mutation: false/);

  assert.match(browser, /clientId=/);
  assert.match(browser, /api\/renderer\/handoff/);
  assert.doesNotMatch(browser, /new WebSocket\(/);

  assert.match(server, /GET" && path === "\/api\/renderer\/handoff"/);
  assert.match(server, /rendererClientId\(pathWithQuery\)/);
  assert.match(server, /rendererHandoffService\.attach/);
  assert.match(server, /rendererHandoffService\.detach/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/renderer\/handoff"/);

  assert.match(main, /new RendererHandoffService/);
  assert.match(main, /rendererHandoffService,/);
});
