import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdventureLandGameEvent } from "../src/character/game-events.ts";
import type {
  ScriptAdventureApiBridge,
  ScriptAdventureApiDynamicState,
} from "../src/script/adventure-api.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";
import { Logger } from "../src/logging/logger.ts";

test("script send_cm returns Adventure Land-compatible local results and character.on receives cm", async () => {
  const logger = new Logger({ component: "send-cm-script-api-test" });
  const calls: Array<{ method: string; input: Readonly<Record<string, unknown>> }> = [];
  const listeners = new Set<(event: ReturnType<typeof createAdventureLandGameEvent>) => void>();
  const dynamicState: ScriptAdventureApiDynamicState = {
    character: {
      id: "CH_PRIMARY",
      name: "Primary",
      type: "character",
      ctype: "merchant",
      map: "main",
      x: 0,
      y: 0,
      hp: 100,
      max_hp: 100,
      mp: 100,
      max_mp: 100,
      range: 30,
      rip: false,
    },
    Entities: {},
    attackCooldownMs: 0,
    lootChests: [],
  };
  const api: ScriptAdventureApiBridge = {
    bootstrap: () => ({
      G: { version: 17397 },
      state: dynamicState,
    }),
    state: () => dynamicState,
    onEvent: (listener) => {
      listeners.add(listener as any);
      return () => listeners.delete(listener as any);
    },
    call: async (method, input) => {
      calls.push({ method, input });
      if (method !== "send_cm") throw new Error("Unexpected API method.");
      return {
        receivers: ["Secondary"],
        locals: ["Secondary"],
      };
    },
  };
  const runtime = new ScriptRuntimeService({
    logger,
    api,
    apiStateIntervalMs: 50,
  });

  try {
    await runtime.load({
      name: "slice72-send-cm-api",
      source: [
        "character.on('cm', (data) => {",
        "  if (data.name === 'Secondary' && data.message?.token === 'reply-token') {",
        "    console.info('slice72-character-cm-received');",
        "  }",
        "});",
        "(async () => {",
        "  const result = await send_cm(['Secondary', 'Missing'], {kind:'probe', token:'send-token'});",
        "  if (result.receivers.length !== 1 || result.receivers[0] !== 'Secondary') throw new Error('receivers mismatch');",
        "  if (result.locals.length !== 1 || result.locals[0] !== 'Secondary') throw new Error('locals mismatch');",
        "  console.info('slice72-send-cm-result');",
        "})()",
      ].join("\n"),
    });
    assert.equal((await runtime.start()).status, "running");

    const listenerReady = await waitFor(
      () => runtime.state().activeEventListeners === 1,
      1_500,
    );
    assert.equal(listenerReady, true);

    for (const listener of listeners) {
      listener(createAdventureLandGameEvent("cm", {
        name: "Secondary",
        message: { kind: "reply", token: "reply-token" },
      }));
    }

    const completed = await waitFor(
      () => {
        const records = logger.records();
        return records.some((record) =>
          record.component === "script:slice72-send-cm-api" &&
          record.message === "slice72-send-cm-result"
        ) && records.some((record) =>
          record.component === "script:slice72-send-cm-api" &&
          record.message === "slice72-character-cm-received"
        );
      },
      1_500,
    );
    assert.equal(completed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "send_cm");
    assert.deepEqual(calls[0]?.input, {
      to: ["Secondary", "Missing"],
      message: { kind: "probe", token: "send-token" },
    });
  } finally {
    await runtime.dispose();
  }
});

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}
