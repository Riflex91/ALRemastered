import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { AdventureLandRespawnService } from "../src/action/respawn.ts";
import { Slice53LiveTestService } from "../src/live-test/slice-5-3.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandScriptApiBridge } from "../src/script/adventure-api.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

test("Slice 5.3 verifies real death evidence, gateway respawn, and same-worker continuation", async () => {
  const logger = new Logger({ component: "slice-5-3-test" });
  let characterState: any = {
    status: "connected",
    characterId: "CH_1",
    characterName: "RangerOne",
    serverKey: "SR_EUII",
    heartbeatSequence: 20,
    deathCount: 1,
    respawnCount: 0,
    lastDeathAt: "2026-10-03T20:00:00.000Z",
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 45,
      map: "main",
      x: 100,
      y: 100,
      hp: 0,
      maxHp: 4000,
      mp: 900,
      maxMp: 1000,
      dead: true,
      range: 120,
    },
    entities: [],
    lootChests: [],
    message: "dead",
  };
  logger.warn("Adventure Land headless character died.", {
    characterId: "CH_1",
    characterName: "RangerOne",
    serverKey: "SR_EUII",
    deathCount: 1,
    lastDeathAt: characterState.lastDeathAt,
    automation: true,
  });

  let requestStateRefreshCalls = 0;
  const character = {
    state: () => structuredClone(characterState),
    attackCooldownRemainingMs: () => 0,
    requestStateRefresh: () => {
      requestStateRefreshCalls += 1;
    },
    sendRespawn: async () => {
      setTimeout(() => {
        characterState = {
          ...characterState,
          heartbeatSequence: 21,
          respawnCount: 1,
          lastRespawnAt: "2026-10-03T20:00:01.000Z",
          character: {
            ...characterState.character,
            hp: 4000,
            dead: false,
          },
        };
        logger.info("Adventure Land headless character respawned.", {
          characterId: "CH_1",
          characterName: "RangerOne",
          serverKey: "SR_EUII",
          respawnCount: 1,
          lastRespawnAt: characterState.lastRespawnAt,
          automation: true,
        });
      }, 75);
      return { success: true as const };
    },
  };

  const gateway = new ActionGateway({
    logger,
    idFactory: () => "act-slice53-respawn",
  });
  const respawn = new AdventureLandRespawnService({
    gateway,
    logger,
    character: character as any,
  });
  const api = new AdventureLandScriptApiBridge({
    character: character as any,
    movement: { runScript: async () => ({}) } as any,
    attack: { run: async () => ({}) } as any,
    respawn,
    gameData: () => ({ monsters: {} }) as any,
  });
  const runtime = new ScriptRuntimeService({
    logger,
    api,
    apiStateIntervalMs: 50,
    idFactory: () => "script-run-slice53",
  });
  const service = new Slice53LiveTestService({
    logger,
    character: character as any,
    script: runtime,
    idFactory: () => "live53-test",
  });

  try {
    const result = await service.run();
    assert.equal(result.outcome, "passed");
    assert.deepEqual(result.steps.map((step) => step.name), [
      "death-state",
      "script-death-observation",
      "respawn-confirmed",
      "script-continuation",
      "final-cleanup",
    ]);
    const continuation = result.steps.find((step) => step.name === "script-continuation");
    assert.equal(continuation?.evidence.runIdBeforeRespawn, "script-run-slice53");
    assert.equal(continuation?.evidence.runIdAfterRespawn, "script-run-slice53");
    assert.equal(characterState.character.dead, false);
    assert.equal(characterState.respawnCount, 1);
    assert.ok(requestStateRefreshCalls >= 1);
    assert.equal(runtime.state().status, "stopped");
    assert.equal(runtime.state().activeTimers, 0);
    assert.match(logger.exportText(), /"action":"character\.respawn"/);
    assert.match(logger.exportText(), /"origin":"script"/);
    assert.match(logger.exportText(), /slice53:continued-after-respawn/);
  } finally {
    await runtime.dispose();
  }
});

test("Slice 5.3 blocks an alive character instead of fabricating a death socket command", async () => {
  const logger = new Logger({ component: "slice-5-3-blocked-test" });
  let scriptLoaded = false;
  const service = new Slice53LiveTestService({
    logger,
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_1",
        characterName: "RangerOne",
        serverKey: "SR_EUII",
        character: { id: "CH_1", name: "RangerOne", dead: false },
        message: "connected",
      }),
      requestStateRefresh: () => undefined,
    } as any,
    script: {
      state: () => ({
        status: "stopped",
        activeTimers: 0,
        activeEventListeners: 0,
        logRecords: 0,
        heartbeatSequence: 0,
        message: "stopped",
      }),
      load: async () => {
        scriptLoaded = true;
        throw new Error("should not load");
      },
      start: async () => {
        throw new Error("should not start");
      },
      stop: async () => {
        throw new Error("should not stop");
      },
    } as any,
    idFactory: () => "live53-blocked",
  });

  const result = await service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_REAL_DEATH_REQUIRED");
  assert.equal(scriptLoaded, false);
  assert.match(logger.exportText(), /"deathInjection":false/);
  assert.match(logger.exportText(), /"rawSocketAccess":false/);
});
