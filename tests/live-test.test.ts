import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionGatewayResult } from "../src/action/gateway.ts";
import { Slice35LiveTestService } from "../src/live-test/slice-3-5.ts";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  decodeUpdateSessionHandoff,
  encodeUpdateSessionHandoff,
} from "../src/update/session-handoff.ts";
import { AdventureLandAccountService } from "../src/account/service.ts";

function gameData(): AdventureLandGameData {
  return {
    version: 17397,
    items: {
      hpot0: { name: "HP Potion", gives: [["hp", 200]] },
      mpot0: { name: "MP Potion", gives: [["mp", 300]] },
    },
    monsters: {
      goo: { name: "Goo", hp: 100, attack: 25, xp: 100, gold: 10 },
    },
    maps: { main: {} },
    geometry: { main: { x_lines: [], y_lines: [] } },
    skills: {
      track: {
        type: "skill",
        name: "Track",
        class: ["ranger"],
        mp: 80,
        cooldown: 1600,
      },
      use_hp: { cooldown: 2000 },
      use_mp: { cooldown: 2000 },
    },
    classes: {},
    npcs: {},
    drops: {},
    craft: {},
    conditions: {},
  };
}

function connectedState(overrides: Record<string, unknown> = {}): any {
  const baseCharacter = {
    id: "CH_1",
    name: "RangerOne",
    type: "ranger",
    level: 60,
    map: "main",
    x: 100,
    y: 100,
    hp: 800,
    maxHp: 1000,
    mp: 700,
    maxMp: 1000,
    range: 140,
    dead: false,
    gold: 1000,
    inventory: [
      { name: "hpot0", q: 5 },
      { name: "mpot0", q: 5 },
    ],
  };
  return {
    status: "connected",
    characterId: "CH_1",
    characterName: "RangerOne",
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
    message: "Connected.",
    character: {
      ...baseCharacter,
      ...((overrides.character as Record<string, unknown> | undefined) ?? {}),
    },
    entities: (overrides.entities as unknown[]) ?? [],
    party: { inParty: false, members: [], details: {} },
    lootChests: (overrides.lootChests as unknown[]) ?? [{
      id: "chest-1",
      map: "main",
      x: 110,
      y: 100,
      items: 1,
      chest: "chest1",
    }],
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) =>
        !["character", "entities", "lootChests"].includes(key)
      ),
    ),
  };
}

function success<TResult>(
  action: string,
  result: TResult,
  requestId = "act-test",
): ActionGatewayResult<TResult> {
  return {
    requestId,
    action,
    origin: "dashboard",
    characterId: "CH_1",
    outcome: "success",
    startedAt: "2026-10-03T12:00:00.000Z",
    completedAt: "2026-10-03T12:00:00.010Z",
    durationMs: 10,
    result,
  };
}

function failure(
  action: string,
  code: string,
  requestId = "act-failed",
): ActionGatewayResult {
  return {
    requestId,
    action,
    origin: "dashboard",
    characterId: "CH_1",
    outcome: "error",
    startedAt: "2026-10-03T12:00:00.000Z",
    completedAt: "2026-10-03T12:00:00.010Z",
    durationMs: 10,
    error: { code, message: code },
  };
}

test("Slice 3.5 one-click test reuses a headless chest and completes loot plus consumable without manual setup", async () => {
  const logger = new Logger({ component: "live-test-pass" });
  let state = connectedState();
  let lootCalls = 0;
  let consumeCalls = 0;
  let attackCalls = 0;
  let movementCalls = 0;
  let skillCalls = 0;

  const lootConsumable = {
    dashboardOptions: () => ({
      status: "ready",
      message: "ready",
      characterId: "CH_1",
      lootChests: state.lootChests.map((chest: any) => ({
        id: chest.id,
        map: chest.map,
        x: chest.x,
        y: chest.y,
        itemCount: chest.items,
        distance: 10,
      })),
      consumables: [
        {
          inventoryIndex: 0,
          itemName: "hpot0",
          displayName: "HP Potion",
          kind: "hp",
          quantity: state.character.inventory[0]?.q ?? 0,
          restoreAmount: 200,
          cooldownMs: 2000,
        },
        {
          inventoryIndex: 1,
          itemName: "mpot0",
          displayName: "MP Potion",
          kind: "mp",
          quantity: state.character.inventory[1]?.q ?? 0,
          restoreAmount: 300,
          cooldownMs: 2000,
        },
      ],
    }),
    runLoot: async ({ chestId }: { chestId: string }) => {
      lootCalls += 1;
      state = {
        ...state,
        lootChests: [],
        character: { ...state.character, gold: state.character.gold + 10 },
      };
      return success("character.loot", {
        chestId,
        map: "main",
        distance: 10,
        itemCount: 1,
        serverAccepted: true as const,
      }, "act-loot");
    },
    runConsumable: async (request: any) => {
      consumeCalls += 1;
      const inventory = [...state.character.inventory];
      inventory[request.inventoryIndex] = {
        ...inventory[request.inventoryIndex],
        q: inventory[request.inventoryIndex].q - 1,
      };
      state = {
        ...state,
        character: {
          ...state.character,
          hp: request.kind === "hp" ? 1000 : state.character.hp,
          mp: request.kind === "mp" ? 1000 : state.character.mp,
          inventory,
        },
      };
      return success("character.consume", {
        ...request,
        displayName: request.kind === "hp" ? "HP Potion" : "MP Potion",
        quantityBefore: 5,
        restoreAmount: request.kind === "hp" ? 200 : 300,
        serverAccepted: true as const,
        cooldownMs: 2000,
      }, "act-consume");
    },
  };

  const service = new Slice35LiveTestService({
    logger,
    character: { state: () => structuredClone(state) } as any,
    attack: {
      run: async () => {
        attackCalls += 1;
        throw new Error("attack must not run when a headless chest already exists");
      },
    } as any,
    movement: {
      run: async () => {
        movementCalls += 1;
        throw new Error("movement must not run when a headless chest already exists");
      },
    } as any,
    skill: {
      dashboardOptions: () => ({ status: "ready", message: "ready", skills: [] }),
      run: async () => {
        skillCalls += 1;
        throw new Error("skill setup is not needed when HP already has a deficit");
      },
    } as any,
    lootConsumable: lootConsumable as any,
    gameData,
  });

  const result = await service.run();
  assert.equal(result.outcome, "passed");
  assert.equal(lootCalls, 1);
  assert.equal(consumeCalls, 1);
  assert.equal(attackCalls, 0);
  assert.equal(movementCalls, 0);
  assert.equal(skillCalls, 0);
  assert.equal(result.steps.some((step) => step.name === "loot-setup-existing-chest"), true);
  assert.equal(result.steps.at(-2)?.name, "loot");
  assert.equal(result.steps.at(-1)?.name, "consumable");
  assert.match(logger.exportText(), /one-click live test passed/);
});

test("Slice 3.5 one-click test creates its own MP deficit when resources are full", async () => {
  const logger = new Logger({ component: "live-test-mp-setup" });
  let state = connectedState({
    character: { hp: 1000, maxHp: 1000, mp: 1000, maxMp: 1000 },
  });
  let skillCalls = 0;
  let consumeCalls = 0;

  const lootConsumable = {
    dashboardOptions: () => ({
      status: "ready",
      message: "ready",
      characterId: "CH_1",
      lootChests: state.lootChests.map((chest: any) => ({
        id: chest.id,
        map: chest.map,
        distance: 10,
      })),
      consumables: [{
        inventoryIndex: 1,
        itemName: "mpot0",
        displayName: "MP Potion",
        kind: "mp",
        quantity: state.character.inventory[1].q,
        restoreAmount: 300,
        cooldownMs: 0,
      }],
    }),
    runLoot: async ({ chestId }: { chestId: string }) => {
      state = {
        ...state,
        lootChests: [],
        character: { ...state.character, gold: state.character.gold + 1 },
      };
      return success("character.loot", {
        chestId,
        serverAccepted: true as const,
      }, "act-loot");
    },
    runConsumable: async (request: any) => {
      consumeCalls += 1;
      const inventory = [...state.character.inventory];
      inventory[1] = { ...inventory[1], q: inventory[1].q - 1 };
      state = {
        ...state,
        character: { ...state.character, mp: 1000, inventory },
      };
      return success("character.consume", {
        ...request,
        displayName: "MP Potion",
        quantityBefore: 5,
        restoreAmount: 300,
        serverAccepted: true as const,
      }, "act-consume");
    },
  };

  const service = new Slice35LiveTestService({
    logger,
    character: { state: () => structuredClone(state) } as any,
    attack: { run: async () => { throw new Error("not used"); } } as any,
    movement: { run: async () => { throw new Error("not used"); } } as any,
    skill: {
      dashboardOptions: () => ({
        status: "ready",
        message: "ready",
        characterId: "CH_1",
        skills: [{
          skillName: "track",
          displayName: "Track",
          targetMode: "none",
          mpCost: 80,
          cooldownMs: 1600,
          targets: [],
        }],
      }),
      run: async () => {
        skillCalls += 1;
        state = {
          ...state,
          character: { ...state.character, mp: 920 },
        };
        return success("character.skill", {
          skillName: "track",
          displayName: "Track",
          mpCost: 80,
          serverAccepted: true as const,
          cooldownMs: 1600,
        }, "act-track");
      },
    } as any,
    lootConsumable: lootConsumable as any,
    gameData,
  });

  const result = await service.run();
  assert.equal(result.outcome, "passed");
  assert.equal(skillCalls, 1);
  assert.equal(consumeCalls, 1);
  const setup = result.steps.find((step) => step.name === "consumable-setup");
  assert.equal(setup?.outcome, "passed");
  assert.deepEqual(setup?.evidence, {
    skillName: "track",
    mpBefore: 1000,
    mpAfter: 920,
  });
});

test("Slice 3.5 one-click test blocks cleanly when no safe loot setup exists", async () => {
  const logger = new Logger({ component: "live-test-blocked" });
  const state = connectedState({ lootChests: [], entities: [] });
  let mutations = 0;

  const service = new Slice35LiveTestService({
    logger,
    character: { state: () => structuredClone(state) } as any,
    attack: { run: async () => { mutations += 1; throw new Error("must not run"); } } as any,
    movement: { run: async () => { mutations += 1; throw new Error("must not run"); } } as any,
    skill: {
      dashboardOptions: () => ({ status: "ready", message: "ready", skills: [] }),
      run: async () => { mutations += 1; throw new Error("must not run"); },
    } as any,
    lootConsumable: {
      dashboardOptions: () => ({
        status: "ready",
        message: "ready",
        characterId: "CH_1",
        lootChests: [],
        consumables: [],
      }),
      runLoot: async () => { mutations += 1; throw new Error("must not run"); },
      runConsumable: async () => { mutations += 1; throw new Error("must not run"); },
    } as any,
    gameData,
  });

  const result = await service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.errorCode, "LIVE_TEST_NO_SAFE_LOOT_TARGET");
  assert.equal(mutations, 0);
});

test("Slice 3.5 one-click test never retries a failed non-idempotent loot send", async () => {
  const logger = new Logger({ component: "live-test-no-retry" });
  const state = connectedState();
  let lootCalls = 0;
  let laterMutations = 0;

  const service = new Slice35LiveTestService({
    logger,
    character: { state: () => structuredClone(state) } as any,
    attack: { run: async () => { laterMutations += 1; throw new Error("not used"); } } as any,
    movement: { run: async () => { laterMutations += 1; throw new Error("not used"); } } as any,
    skill: {
      dashboardOptions: () => ({ status: "ready", message: "ready", skills: [] }),
      run: async () => { laterMutations += 1; throw new Error("not used"); },
    } as any,
    lootConsumable: {
      dashboardOptions: () => ({
        status: "ready",
        message: "ready",
        characterId: "CH_1",
        lootChests: [{ id: "chest-1", map: "main", distance: 10 }],
        consumables: [{
          inventoryIndex: 0,
          itemName: "hpot0",
          displayName: "HP Potion",
          kind: "hp",
          quantity: 5,
          restoreAmount: 200,
        }],
      }),
      runLoot: async () => {
        lootCalls += 1;
        return failure("character.loot", "LOOT_SERVER_REJECTED");
      },
      runConsumable: async () => {
        laterMutations += 1;
        throw new Error("must stop before consumable");
      },
    } as any,
    gameData,
  });

  const result = await service.run();
  assert.equal(result.outcome, "failed");
  assert.equal(result.errorCode, "LIVE_TEST_LOOT_FAILED");
  assert.equal(lootCalls, 1);
  assert.equal(laterMutations, 0);
});

test("update handoff round-trips only the active session binding and account restore never logs auth", () => {
  const handoff = encodeUpdateSessionHandoff(
    {
      userId: "US_1",
      auth: "handoff-auth-secret",
      language: "de",
    },
    "SR_EUII",
    "CH_1",
  );
  assert.ok(handoff);
  assert.doesNotMatch(handoff, /handoff-auth-secret/);

  const decoded = decodeUpdateSessionHandoff(handoff);
  assert.deepEqual(decoded, {
    schemaVersion: 1,
    session: {
      userId: "US_1",
      auth: "handoff-auth-secret",
      language: "de",
    },
    selectedServerKey: "SR_EUII",
    characterId: "CH_1",
  });
  assert.equal(decodeUpdateSessionHandoff("not-valid-base64-json"), undefined);
  assert.equal(encodeUpdateSessionHandoff(undefined, "SR_EUII", "CH_1"), undefined);

  const logger = new Logger({ component: "handoff-account-test" });
  const account = new AdventureLandAccountService({
    logger,
    source: {
      login: async () => {
        throw new Error("not used");
      },
    },
    now: () => new Date("2026-10-03T12:00:00.000Z"),
  });
  const restored = account.restoreSession(decoded!.session);
  assert.equal(restored.status, "connected");
  assert.equal(account.session()?.auth, "handoff-auth-secret");
  assert.doesNotMatch(logger.exportText(), /handoff-auth-secret/);
  assert.match(logger.exportText(), /secretPersisted/);
});
