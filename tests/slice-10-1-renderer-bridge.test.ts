import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import { RendererBridge } from "../src/renderer/bridge.ts";

test("Slice 10.1 renderer bridge exposes snapshot and sequenced SSE state events", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const logger = new Logger({ component: "slice-10-1-http-test" });
  const gateway = new ActionGateway({ logger });
  const bridge = new RendererBridge({
    logger,
    core: () => runtime.health(),
    character: () => ({ status: "disconnected", message: "No Character is connected." }),
    sessions: () => ({
      status: "ready",
      sessionLimit: 4,
      activeSessionCount: 0,
      managedSessionCount: 0,
      availableSlots: 4,
      sessions: [],
      sharedStaticData: { mode: "shared" },
      message: "Multi-character session manager ready. 0/4 active sessions.",
    }),
    script: () => ({
      status: "unloaded",
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 0,
      message: "No script loaded.",
    }),
    actionGateway: () => gateway.state(),
    diagnostics: () => ({
      sanitized: true,
      components: [{ name: "core", status: "healthy", message: "Core runtime is running." }],
      recentErrors: [],
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
  const controller = new AbortController();

  try {
    const snapshotResponse = await fetch(`${url}/api/renderer/snapshot`);
    assert.equal(snapshotResponse.status, 200);
    const before = await snapshotResponse.json();
    assert.equal(before.bridge.status, "running");
    assert.equal(before.snapshot.schemaVersion, 1);
    assert.equal(before.snapshot.core.status, "running");
    assert.equal(before.snapshot.actionGateway.totalRequests, 0);
    assert.equal(before.snapshot.diagnostics.sanitized, true);

    const streamResponse = await fetch(`${url}/api/renderer/stream`, {
      signal: controller.signal,
    });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.ok(streamResponse.body);

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    bridge.publishStateForTest();

    let received = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += decoder.decode(chunk.value, { stream: true });
      if ((received.match(/event: state/g) ?? []).length >= 2) break;
    }

    assert.match(received, /event: state/);
    assert.match(received, /id: \d+/);
    assert.match(received, /"schemaVersion":1/);
    assert.match(received, /"type":"state"/);
    assert.equal(bridge.state().subscribers, 1);
    assert.equal(gateway.state().totalRequests, 0);

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(bridge.state().subscribers, 0);
  } finally {
    controller.abort();
    await dashboard.stop();
    bridge.stop();
    runtime.stop();
  }
});

test("Slice 10.1 exposes only read-only renderer bridge transport and Current verification", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="11\.4"/);
  assert.match(html, /data-verification-test="10\.1" hidden/);
  assert.match(html, /id="start-slice-10-1-live-test"/);
  assert.match(html, />Start renderer bridge test</);

  assert.match(server, /GET" && path === "\/api\/renderer\/snapshot"/);
  assert.match(server, /GET" && path === "\/api\/renderer\/stream"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/renderer/);

  assert.match(main, /new RendererBridge/);
  assert.match(main, /rendererBridge\.start\(\)/);
  assert.match(main, /rendererBridge\?\.stop\(\)/);

  assert.match(script, /waitForRendererStateEvent/);
  assert.match(script, /Renderer transport: /);
  assert.match(script, /Renderer mutation API: false/);
  assert.match(script, /Core restart:/);
  assert.match(script, /Character restart:/);
  assert.match(script, /Script restart:/);
  assert.match(script, /Action Gateway requests:/);
  assert.match(script, /Raw socket access: false/);
  assert.match(script, /User Script touched: false/);
  assert.doesNotMatch(script, /window\.open\([^)]*renderer|openRendererWindow|closeRendererWindow/);
});
