import assert from "node:assert/strict";
import { test } from "node:test";
import { Slice45LiveTestService } from "../src/live-test/slice-4-5.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 4.5 bounded farm test starts no-code template, observes script attack, and stops cleanly", async () => {
  const logger = new Logger({ component: "slice45-test" });
  let runtime:any = {
    status: "stopped",
    scriptName: "simple-farmer-template",
    activeTimers: 0,
    activeEventListeners: 0,
    storageEntries: 0,
    logRecords: 0,
    message: "stopped",
  };
  const characterState:any = {
    status: "connected",
    characterId: "CH_1",
    characterName: "Ranger",
    serverKey: "US_I",
    message: "connected",
    character: {
      id: "CH_1", name: "Ranger", type: "ranger", dead: false,
      x: 0, y: 0, hp: 1000, maxHp: 1000, range: 120,
    },
    entities: [{
      id: "M1", name: "Goo", kind: "monster", type: "goo",
      x: 40, y: 0, hp: 80, maxHp: 80,
    }],
  };
  let startedConfig:any;
  const farmer = {
    state: () => ({ status: runtime.status === "running" ? "running" : "stopped", message: "farmer" }),
    start: async (config:any) => {
      startedConfig = config;
      runtime = { ...runtime, status: "running", activeTimers: 1 };
      logger.info(
        "Action gateway request completed.",
        { action: "character.attack", origin: "script", outcome: "success" },
        { requestId: "act-slice45-test", characterId: "CH_1" },
      );
      logger.info(
        "Action gateway request completed.",
        { action: "character.loot", origin: "script", outcome: "success" },
        { requestId: "act-slice45-loot", characterId: "CH_1" },
      );
      return { status: "running", message: "running", config };
    },
    stop: async () => {
      runtime = { ...runtime, status: "stopped", activeTimers: 0, activeEventListeners: 0 };
      return { status: "stopped", message: "stopped" };
    },
  };

  const service = new Slice45LiveTestService({
    logger,
    runtime: { state: () => structuredClone(runtime) } as any,
    farmer: farmer as any,
    character: { state: () => structuredClone(characterState) } as any,
    gameData: () => ({
      monsters: { goo: { hp: 80, attack: 10, xp: 50, gold: 10 } },
    } as any),
    idFactory: () => "live45-test",
    delay: async () => undefined,
  });

  const result = await service.run();
  assert.equal(result.outcome, "passed");
  assert.equal(result.slice, "4.5");
  assert.equal(result.targetType, "goo");
  assert.equal(result.attackCount, 1);
  assert.equal(result.lootCount, 1);
  assert.equal(startedConfig.monster, "goo");
  assert.equal(startedConfig.hpThresholdPercent, 1);
  assert.equal(startedConfig.mpThresholdPercent, 1);
  assert.equal(startedConfig.loot, true);
  assert.equal(startedConfig.respawn, false);
  assert.deepEqual(result.steps.map((step) => step.name), [
    "preflight",
    "no-code-template-config",
    "automated-farm-action",
    "automated-loot",
    "bounded-stop-cleanup",
  ]);
  assert.equal(runtime.status, "stopped");
  assert.equal(runtime.activeTimers, 0);
});

test("Slice 4.5 live test blocks when no headless character is connected", async () => {
  const logger = new Logger({ component: "slice45-block-test" });
  const runtime:any = {
    status: "stopped", activeTimers: 0, activeEventListeners: 0, storageEntries: 0, logRecords: 0, message: "stopped",
  };
  const service = new Slice45LiveTestService({
    logger,
    runtime: { state: () => runtime } as any,
    farmer: { start: async () => ({ status: "running" }), stop: async () => ({ status: "stopped" }), state: () => ({ status: "stopped" }) } as any,
    character: { state: () => ({ status: "idle", message: "idle" }) } as any,
    gameData: () => ({ monsters: {} } as any),
    idFactory: () => "live45-blocked",
    delay: async () => undefined,
  });
  const result = await service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.errorCode, "LIVE_TEST_CHARACTER_NOT_CONNECTED");
});
