import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAdventureLandGameEvent,
  type AdventureLandGameEvent,
} from "../src/character/game-events.ts";
import type { ScriptAdventureApiBridge } from "../src/script/adventure-api.ts";
import { Slice43LiveTestService } from "../src/live-test/slice-4-3.ts";
import { Logger } from "../src/logging/logger.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

function connectedState() {
  return {
    status: "connected" as const,
    characterId: "CH_1",
    characterName: "RangerOne",
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 45,
      dead: false,
    },
    message: "Connected.",
  };
}

test("Slice 4.3 one-click test verifies real-event plumbing and lifecycle cleanup", async () => {
  const logger = new Logger({ component: "slice-4-3-test" });
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
  const runtime = new ScriptRuntimeService({
    logger,
    api,
    idFactory: (() => {
      let id = 0;
      return () => `live43-run-${++id}`;
    })(),
  });
  const character = {
    state: () => connectedState(),
    requestStateRefresh: () => {
      queueMicrotask(() => {
        const event = createAdventureLandGameEvent("player", {
          id: "CH_1",
          name: "RangerOne",
          hp: 4000,
          auth: "must-not-leak",
        });
        for (const listener of [...listeners]) listener(event);
      });
    },
  };
  const liveTest = new Slice43LiveTestService({
    logger,
    runtime,
    character: character as any,
    idFactory: () => "live43-test",
  });

  try {
    const result = await liveTest.run();
    assert.equal(result.outcome, "passed");
    assert.equal(result.slice, "4.3");
    assert.equal(result.observedEvent, "player");
    assert.deepEqual(result.steps.map((step) => step.name), [
      "subscribe-real-event-and-off",
      "off-and-stop-suppress-callbacks",
      "pause-and-restart-cleanup",
      "handler-crash-isolation",
      "final-runtime-cleanup",
    ]);
    assert.equal(runtime.state().status, "stopped");
    assert.equal(runtime.state().activeEventListeners, 0);
    assert.equal(listeners.size, 0);
    assert.equal(
      logger.records().some((record) =>
        record.message === "Slice 4.3 one-click live test passed."
      ),
      true,
    );
  } finally {
    await runtime.dispose();
  }
});

test("Slice 4.3 blocks cleanly when no headless character is connected", async () => {
  const logger = new Logger({ component: "slice-4-3-blocked-test" });
  const runtime = new ScriptRuntimeService({ logger });
  const liveTest = new Slice43LiveTestService({
    logger,
    runtime,
    character: {
      state: () => ({ status: "disconnected", message: "Disconnected." }) as any,
      requestStateRefresh: () => undefined,
    } as any,
    idFactory: () => "live43-blocked",
  });
  try {
    const result = await liveTest.run();
    assert.equal(result.outcome, "blocked");
    assert.equal(result.error?.code, "CHARACTER_NOT_CONNECTED");
    assert.equal(runtime.state().status, "unloaded");
  } finally {
    await runtime.dispose();
  }
});
