import assert from "node:assert/strict";
import { test } from "node:test";
import { AdventureLandAttackService } from "../src/action/attack.ts";
import { ActionGateway } from "../src/action/gateway.ts";
import { AdventureLandLootConsumableService } from "../src/action/loot-consumable.ts";
import { AdventureLandMovementService } from "../src/action/movement.ts";
import { Slice42LiveTestService } from "../src/live-test/slice-4-2.ts";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandScriptApiBridge } from "../src/script/adventure-api.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

function gameData(): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {
      crab: {
        hp: 120,
        attack: 20,
        xp: 50,
        gold: 25,
      },
    },
    maps: { main: {} },
    geometry: {
      main: {
        x_lines: [],
        y_lines: [],
      },
    },
    skills: {},
    classes: {},
    npcs: {},
    drops: {},
    craft: {},
    conditions: {},
  };
}

test("Slice 4.2 one-click farmer runs compatible script API through the production action services", async () => {
  const logger = new Logger({ component: "slice-4-2-integration-test" });
  let now = 100_000;
  const gateway = new ActionGateway({
    logger,
    nowMs: () => now,
    idFactory: (() => {
      let id = 0;
      return () => `act-live42-${++id}`;
    })(),
  });

  let state: any = {
    status: "connected",
    characterId: "CH_1",
    characterName: "RangerOne",
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
    message: "Connected.",
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 45,
      map: "main",
      x: 100,
      y: 100,
      hp: 4100,
      maxHp: 4200,
      mp: 800,
      maxMp: 900,
      dead: false,
      range: 120,
      gold: 1000,
      inventory: [],
      equipment: {},
      conditions: {},
    },
    entities: [{
      id: "monster-1",
      kind: "monster",
      name: "monster-1",
      type: "crab",
      map: "main",
      x: 140,
      y: 100,
      hp: 120,
      maxHp: 120,
    }],
    party: { inParty: false, members: [], details: {} },
    lootChests: [],
  };

  let attackCalls = 0;
  let lootCalls = 0;
  let stateReads = 0;
  const movementCalls: Array<{ x: number; y: number }> = [];
  const character = {
    state: () => {
      stateReads += 1;
      if (
        stateReads === 2 &&
        state.entities.length === 1 &&
        state.entities[0]?.id === "monster-1"
      ) {
        state.entities = [{
          ...state.entities[0],
          id: "monster-2",
          name: "monster-2",
          x: 145,
        }];
      }
      return structuredClone(state);
    },
    attackCooldownRemainingMs: () => 0,
    skillCooldownRemainingMs: () => 0,
    async sendAttack({ targetId }: { targetId: string }) {
      attackCalls += 1;
      assert.equal(targetId, "monster-2");
      state.entities = [];
      state.lootChests = [{
        id: "chest-live42",
        map: "main",
        x: 145,
        y: 100,
        items: 1,
        chest: "chest1",
      }];
      now += 600;
      return {
        targetId,
        success: true,
        cooldownMs: 0,
      };
    },
    async sendLoot({ chestId }: { chestId: string }) {
      lootCalls += 1;
      assert.equal(chestId, "chest-live42");
      state.lootChests = [];
      state.character.gold += 25;
      now += 600;
      return {
        chestId,
        success: true,
        opener: state.character.name,
      };
    },
    async sendDirectMovement({ x, y }: { x: number; y: number }) {
      const fromX = state.character.x;
      const fromY = state.character.y;
      movementCalls.push({ x, y });
      state.character.x = x;
      state.character.y = y;
      now += 600;
      return {
        fromX,
        fromY,
        targetX: x,
        targetY: y,
        confirmedX: x,
        confirmedY: y,
      };
    },
    async sendConsumable() {
      throw new Error("Slice 4.2 live test must not use consumables.");
    },
  };

  const movement = new AdventureLandMovementService({
    gateway,
    character: character as any,
    gameData,
  });
  const attack = new AdventureLandAttackService({
    gateway,
    logger,
    character: character as any,
  });
  const loot = new AdventureLandLootConsumableService({
    gateway,
    logger,
    character: character as any,
    gameData,
  });
  const api = new AdventureLandScriptApiBridge({
    character: character as any,
    movement,
    attack,
    loot,
    gameData,
  });
  const runtime = new ScriptRuntimeService({
    logger,
    api,
    apiStateIntervalMs: 50,
  });
  const liveTest = new Slice42LiveTestService({
    logger,
    runtime,
    character: character as any,
    gameData,
  });

  try {
    const result = await liveTest.run();
    assert.equal(result.outcome, "passed");
    assert.equal(result.targetId, "monster-1");
    assert.equal(result.targetType, "crab");
    assert.equal(attackCalls, 1);
    assert.equal(lootCalls, 1);
    assert.equal(movementCalls.length, 2);
    assert.deepEqual(movementCalls[1], { x: 100, y: 100 });
    assert.equal(state.character.x, 100);
    assert.equal(state.character.y, 100);
    assert.equal(state.character.gold, 1025);
    assert.equal(runtime.state().status, "stopped");

    const steps = result.steps.map((step) => step.name);
    assert.deepEqual(steps, [
      "preflight",
      "globals-and-helpers",
      "script-farmer-actions",
      "script-movement",
    ]);

    const logs = logger.records();
    assert.equal(
      logs.some((record) =>
        record.message === "Action gateway request completed." &&
        (record.context as any)?.origin === "script" &&
        (record.context as any)?.action === "character.attack"
      ),
      true,
    );
    assert.equal(
      logs.some((record) =>
        record.component === "script:slice-4-2-live-farmer" &&
        record.message === "slice42:target-reacquired:monster-1:monster-2"
      ),
      true,
    );
    assert.equal(
      logs.some((record) =>
        record.component === "script:slice-4-2-live-farmer" &&
        record.message === "slice42:target-locked:monster-2"
      ),
      true,
    );
    assert.equal(
      logs.some((record) =>
        record.component === "script:slice-4-2-live-farmer" &&
        record.message === "slice42:passed"
      ),
      true,
    );
    assert.equal(
      logs.some((record) => record.message === "Slice 4.2 one-click live test passed."),
      true,
    );
  } finally {
    await runtime.dispose();
  }
});

test("Slice 4.2 blocks before mutation when no safe in-range target exists", async () => {
  const logger = new Logger({ component: "slice-4-2-blocked-test" });
  const runtime = new ScriptRuntimeService({ logger });
  const state = {
    status: "connected" as const,
    characterId: "CH_1",
    characterName: "RangerOne",
    serverKey: "SR_EUII",
    message: "Connected.",
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 45,
      map: "main",
      x: 100,
      y: 100,
      hp: 4100,
      maxHp: 4200,
      dead: false,
      range: 120,
    },
    entities: [{
      id: "boss-1",
      kind: "monster" as const,
      name: "boss-1",
      type: "danger",
      map: "main",
      x: 110,
      y: 100,
      hp: 10000,
      maxHp: 10000,
    }],
    party: { inParty: false, members: [], details: {} },
    lootChests: [],
  };
  const liveTest = new Slice42LiveTestService({
    logger,
    runtime,
    character: { state: () => state as any },
    gameData: () => ({
      ...gameData(),
      monsters: {
        danger: { hp: 10000, attack: 1000, xp: 1000, gold: 1000, boss: true },
      },
    }),
  });

  try {
    const result = await liveTest.run();
    assert.equal(result.outcome, "blocked");
    assert.equal(result.errorCode, "LIVE_TEST_NO_SAFE_SCRIPT_TARGET");
    assert.equal(runtime.state().status, "unloaded");
    assert.equal(
      logger.records().some((record) =>
        record.message === "Slice 4.2 one-click live test blocked."
      ),
      true,
    );
  } finally {
    await runtime.dispose();
  }
});
