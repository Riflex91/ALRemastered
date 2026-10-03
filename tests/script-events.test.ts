import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAdventureLandGameEvent,
  type AdventureLandGameEvent,
} from "../src/character/game-events.ts";
import type { ScriptAdventureApiBridge } from "../src/script/adventure-api.ts";
import { Logger } from "../src/logging/logger.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

test("game event snapshots sanitize secrets before entering the script bridge", () => {
  const event = createAdventureLandGameEvent("player", {
    id: "RangerOne",
    auth: "private-auth",
    nested: { access_token: "secret-token", hp: 100 },
  }, "2026-10-03T16:00:00.000Z");
  assert.equal(event.name, "player");
  assert.equal(event.observedAt, "2026-10-03T16:00:00.000Z");
  assert.equal(event.payload.auth, "[REDACTED]");
  assert.deepEqual(event.payload.nested, {
    access_token: "[REDACTED]",
    hp: 100,
  });
});

test("isolated worker exposes bounded on/off event listeners with cleanup", async () => {
  const logger = new Logger({ component: "script-event-test" });
  const listeners = new Set<(event: AdventureLandGameEvent) => void>();
  const api: ScriptAdventureApiBridge = {
    bootstrap: () => ({
      G: {},
      state: { character: {}, Entities: {}, attackCooldownMs: 0, lootChests: [] },
    }),
    state: () => ({ character: {}, Entities: {}, attackCooldownMs: 0, lootChests: [] }),
    onEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    call: async () => ({}),
  };
  const runtime = new ScriptRuntimeService({ logger, api, idFactory: (() => {
    let id = 0;
    return () => `event-run-${++id}`;
  })() });

  const emit = (event: AdventureLandGameEvent) => {
    for (const listener of [...listeners]) listener(event);
  };

  try {
    await runtime.load({
      name: "event-api-test",
      source: [
        "function handler(payload) {",
        "  console.info('event:' + payload.id);",
        "  off('player', handler);",
        "}",
        "on('player', handler);",
      ].join("\n"),
    });
    assert.equal((await runtime.start()).status, "running");
    assert.equal(await waitFor(() => runtime.state().activeEventListeners === 1), true);

    emit(createAdventureLandGameEvent("entities", { type: "all" }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(logger.records().some((record) => record.message.startsWith("event:")), false);

    emit(createAdventureLandGameEvent("player", { id: "RangerOne" }));
    assert.equal(await waitFor(() => logger.records().some((record) => record.message === "event:RangerOne")), true);
    assert.equal(await waitFor(() => runtime.state().activeEventListeners === 0), true);

    emit(createAdventureLandGameEvent("player", { id: "RangerTwo" }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(logger.records().some((record) => record.message === "event:RangerTwo"), false);

    await runtime.load({
      name: "event-pause-test",
      source: "on('player', () => console.info('paused-event'));",
    });
    const first = await runtime.start();
    assert.equal(await waitFor(() => runtime.state().activeEventListeners === 1), true);
    assert.equal((await runtime.pause()).activeEventListeners, 0);
    emit(createAdventureLandGameEvent("player", { id: "ignored" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(logger.records().some((record) => record.message === "paused-event"), false);

    const restarted = await runtime.start();
    assert.notEqual(restarted.runId, first.runId);
    assert.equal(await waitFor(() => runtime.state().activeEventListeners === 1), true);
    await runtime.stop();
    assert.equal(runtime.state().activeEventListeners, 0);
    assert.equal(listeners.size, 0);
  } finally {
    await runtime.dispose();
  }
});

async function waitFor(check: () => boolean, timeoutMs = 1_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}
