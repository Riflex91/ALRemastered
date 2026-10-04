import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { RendererBridge } from "../src/renderer/bridge.ts";

function coreHealth(sequence = 1) {
  return {
    application: "ALRemastered",
    version: "0.1.0-test",
    platform: "linux",
    status: "running",
    startedAt: "2026-10-04T12:30:00.000Z",
    heartbeatSequence: sequence,
    lastHeartbeatAt: "2026-10-04T12:30:01.000Z",
  };
}

test("renderer bridge exposes read-only snapshots and sequenced state events", () => {
  const logger = new Logger({ component: "renderer-bridge-test" });
  let coreSequence = 1;
  const bridge = new RendererBridge({
    logger,
    core: () => coreHealth(coreSequence),
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
    actionGateway: () => ({
      status: "ready",
      active: 0,
      totalRequests: 0,
    }),
    diagnostics: () => ({
      sanitized: true,
      components: [{ name: "core", status: "healthy", message: "Core runtime is running." }],
      recentErrors: [],
    }),
    stateIntervalMs: 10_000,
  });

  assert.equal(bridge.start().status, "running");
  const initial = bridge.snapshot();
  assert.equal(initial.schemaVersion, 1);
  assert.equal(initial.core.heartbeatSequence, 1);
  assert.equal(initial.actionGateway?.totalRequests, 0);
  assert.equal(initial.diagnostics?.sanitized, true);

  const events = [];
  const unsubscribe = bridge.subscribe((event) => events.push(event));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "state");

  coreSequence = 2;
  bridge.publishStateForTest();
  assert.equal(events.length, 2);
  assert.equal(events[1].type, "state");
  assert.equal(events[1].snapshot?.core.heartbeatSequence, 2);
  assert.ok(events[1].sequence > events[0].sequence);
  assert.equal(bridge.state().subscribers, 1);

  unsubscribe();
  assert.equal(bridge.state().subscribers, 0);
  assert.equal(bridge.stop().status, "stopped");
});

test("renderer bridge forwards sanitized logger records as renderer events", () => {
  const logger = new Logger({ component: "renderer-log-test" });
  const bridge = new RendererBridge({
    logger,
    core: () => coreHealth(),
    stateIntervalMs: 10_000,
  });
  bridge.start();

  const events = [];
  const unsubscribe = bridge.subscribe((event) => events.push(event), false);
  logger.info("Renderer event token=super-secret", {
    password: "hidden-password",
    safe: "visible",
  });

  const log = events.find((event) => event.type === "log");
  assert.ok(log);
  assert.match(log.log?.message ?? "", /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(log), /super-secret|hidden-password/);
  assert.match(JSON.stringify(log), /visible/);

  unsubscribe();
  bridge.stop();
});

test("renderer bridge tolerates unavailable optional state providers", () => {
  const logger = new Logger({ component: "renderer-provider-test" });
  const bridge = new RendererBridge({
    logger,
    core: () => coreHealth(),
    character: () => {
      throw new Error("Character state unavailable.");
    },
    script: () => {
      throw new Error("Script state unavailable.");
    },
    stateIntervalMs: 10_000,
  });

  bridge.start();
  const snapshot = bridge.snapshot();
  assert.equal(snapshot.core.status, "running");
  assert.equal(snapshot.character, undefined);
  assert.equal(snapshot.script, undefined);
  bridge.stop();
});
