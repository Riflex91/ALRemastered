import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import {
  AdventureLandLootConsumableService,
} from "../src/action/loot-consumable.ts";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";

function gameData(): AdventureLandGameData {
  return {
    version: 17397,
    items: {
      hpot0: {
        name: "HP Potion",
        gives: [["hp", 200]],
      },
      mpot0: {
        name: "MP Potion",
        gives: [["mp", 300]],
      },
      mixed: {
        name: "Mixed Potion",
        gives: [["hp", 100], ["mp", 100]],
      },
      sword: {
        name: "Sword",
        type: "weapon",
      },
    },
    monsters: {},
    maps: { main: {} },
    geometry: {},
    skills: {
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

function connectedState(overrides: Record<string, unknown> = {}) {
  return {
    status: "connected" as const,
    characterId: "CH_1",
    characterName: "RangerOne",
    message: "Connected.",
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 50,
      map: "main",
      x: 100,
      y: 100,
      hp: 900,
      maxHp: 1000,
      mp: 700,
      maxMp: 1000,
      dead: false,
      inventory: [
        { name: "hpot0", q: 5 },
        { name: "mpot0", q: 3 },
        { name: "mixed", q: 2 },
        { name: "sword" },
      ],
      ...((overrides.character as Record<string, unknown> | undefined) ?? {}),
    },
    entities: [],
    party: { inParty: false, members: [], details: {} },
    lootChests: (overrides.lootChests as any[]) ?? [{
      id: "chest-1",
      map: "main",
      x: 130,
      y: 140,
      items: 2,
      chest: "chest1",
    }],
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) =>
        key !== "character" && key !== "lootChests"
      ),
    ),
  };
}

test("dashboard options expose only live chests and exact HP/MP inventory consumables", () => {
  const logger = new Logger({ component: "loot-consumable-options-test" });
  const service = new AdventureLandLootConsumableService({
    gateway: new ActionGateway({ logger }),
    logger,
    character: {
      state: () => connectedState() as any,
      sendLoot: async () => {
        throw new Error("not used");
      },
      sendConsumable: async () => {
        throw new Error("not used");
      },
      skillCooldownRemainingMs: () => 0,
    } as any,
    gameData,
  });

  const options = service.dashboardOptions();
  assert.equal(options.status, "ready");
  assert.equal(options.characterId, "CH_1");
  assert.deepEqual(options.lootChests, [{
    id: "chest-1",
    map: "main",
    x: 130,
    y: 140,
    itemCount: 2,
    distance: 50,
  }]);
  assert.deepEqual(
    options.consumables.map((item) => ({
      inventoryIndex: item.inventoryIndex,
      itemName: item.itemName,
      kind: item.kind,
      quantity: item.quantity,
      restoreAmount: item.restoreAmount,
      cooldownMs: item.cooldownMs,
    })),
    [
      {
        inventoryIndex: 0,
        itemName: "hpot0",
        kind: "hp",
        quantity: 5,
        restoreAmount: 200,
        cooldownMs: 2000,
      },
      {
        inventoryIndex: 1,
        itemName: "mpot0",
        kind: "mp",
        quantity: 3,
        restoreAmount: 300,
        cooldownMs: 2000,
      },
    ],
  );
});

test("manual loot validates the selected live chest and waits for server confirmation", async () => {
  const logger = new Logger({ component: "loot-success-test" });
  const sent: string[] = [];
  const service = new AdventureLandLootConsumableService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-loot-success",
      nowMs: () => 1000,
    }),
    logger,
    character: {
      state: () => connectedState() as any,
      sendLoot: async ({ chestId }: { chestId: string }) => {
        sent.push(chestId);
        return { chestId, success: true, opener: "RangerOne" };
      },
      sendConsumable: async () => {
        throw new Error("not used");
      },
      skillCooldownRemainingMs: () => 0,
    } as any,
    gameData,
  });

  const result = await service.runDashboardLoot({ chestId: "chest-1" });
  assert.equal(result.requestId, "act-loot-success");
  assert.equal(result.action, "character.loot");
  assert.equal(result.origin, "dashboard");
  assert.equal(result.outcome, "success");
  assert.deepEqual(sent, ["chest-1"]);
  assert.deepEqual(result.result, {
    chestId: "chest-1",
    map: "main",
    distance: 50,
    itemCount: 2,
    serverAccepted: true,
  });
  assert.match(logger.exportText(), /Loot server response confirmed/);

  const missing = new AdventureLandLootConsumableService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-loot-missing",
      nowMs: () => 2000,
    }),
    logger,
    character: {
      state: () => connectedState({ lootChests: [] }) as any,
      sendLoot: async () => {
        throw new Error("must not send");
      },
      sendConsumable: async () => {
        throw new Error("not used");
      },
      skillCooldownRemainingMs: () => 0,
    } as any,
    gameData,
  });
  const rejected = await missing.runDashboardLoot({ chestId: "chest-1" });
  assert.equal(rejected.outcome, "error");
  assert.equal(rejected.error?.code, "LOOT_CHEST_NOT_VISIBLE");
});

test("manual consumable uses exactly the selected inventory slot and waits for server success", async () => {
  const logger = new Logger({ component: "consumable-success-test" });
  const sent: Array<{
    inventoryIndex: number;
    itemName: string;
    kind: string;
  }> = [];
  const service = new AdventureLandLootConsumableService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-consume-success",
      nowMs: () => 3000,
    }),
    logger,
    character: {
      state: () => connectedState() as any,
      sendLoot: async () => {
        throw new Error("not used");
      },
      sendConsumable: async (input: any) => {
        sent.push({
          inventoryIndex: input.inventoryIndex,
          itemName: input.itemName,
          kind: input.kind,
        });
        return {
          inventoryIndex: input.inventoryIndex,
          itemName: input.itemName,
          kind: input.kind,
          success: true,
          cooldownMs: 1950,
        };
      },
      skillCooldownRemainingMs: () => 0,
    } as any,
    gameData,
  });

  const result = await service.runDashboardConsumable({
    inventoryIndex: 0,
    itemName: "hpot0",
    kind: "hp",
  });
  assert.equal(result.requestId, "act-consume-success");
  assert.equal(result.action, "character.consume");
  assert.equal(result.origin, "dashboard");
  assert.equal(result.outcome, "success");
  assert.deepEqual(sent, [{
    inventoryIndex: 0,
    itemName: "hpot0",
    kind: "hp",
  }]);
  assert.deepEqual(result.result, {
    inventoryIndex: 0,
    itemName: "hpot0",
    displayName: "HP Potion",
    kind: "hp",
    quantityBefore: 5,
    restoreAmount: 200,
    serverAccepted: true,
    cooldownMs: 1950,
  });
  assert.match(logger.exportText(), /Consumable server response confirmed/);
});

test("consumable rejects full resources, slot drift, mixed items, cooldown and rapid repeats", async () => {
  let now = 5000;
  let state: any = connectedState();
  let cooldown = 0;
  let calls = 0;
  const logger = new Logger({ component: "consumable-guards-test" });
  const service = new AdventureLandLootConsumableService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-consume-" + now,
      nowMs: () => now,
    }),
    logger,
    character: {
      state: () => state,
      sendLoot: async () => {
        throw new Error("not used");
      },
      sendConsumable: async (input: any) => {
        calls += 1;
        return {
          inventoryIndex: input.inventoryIndex,
          itemName: input.itemName,
          kind: input.kind,
          success: true,
        };
      },
      skillCooldownRemainingMs: () => cooldown,
    } as any,
    gameData,
  });

  state = connectedState({ character: { hp: 1000, maxHp: 1000 } });
  let result = await service.runDashboardConsumable({
    inventoryIndex: 0,
    itemName: "hpot0",
    kind: "hp",
  });
  assert.equal(result.error?.code, "CONSUMABLE_RESOURCE_FULL");
  assert.equal(calls, 0);

  now += 1000;
  state = connectedState({
    character: {
      inventory: [{ name: "mpot0", q: 5 }],
    },
  });
  result = await service.runDashboardConsumable({
    inventoryIndex: 0,
    itemName: "hpot0",
    kind: "hp",
  });
  assert.equal(result.error?.code, "CONSUMABLE_ITEM_CHANGED");
  assert.equal(calls, 0);

  now += 1000;
  state = connectedState();
  result = await service.runDashboardConsumable({
    inventoryIndex: 2,
    itemName: "mixed",
    kind: "hp",
  });
  assert.equal(result.error?.code, "CONSUMABLE_NOT_ALLOWED");
  assert.equal(calls, 0);

  now += 1000;
  cooldown = 350;
  result = await service.runDashboardConsumable({
    inventoryIndex: 0,
    itemName: "hpot0",
    kind: "hp",
  });
  assert.equal(result.error?.code, "CONSUMABLE_COOLDOWN");
  assert.equal(result.retryAfterMs, 350);
  assert.equal(calls, 0);

  now += 1000;
  cooldown = 0;
  result = await service.runDashboardConsumable({
    inventoryIndex: 0,
    itemName: "hpot0",
    kind: "hp",
  });
  assert.equal(result.outcome, "success");
  assert.equal(calls, 1);

  now += 100;
  result = await service.runDashboardConsumable({
    inventoryIndex: 0,
    itemName: "hpot0",
    kind: "hp",
  });
  assert.equal(result.outcome, "rate_limited");
  assert.equal(result.error?.code, "ACTION_RATE_LIMITED");
  assert.equal(calls, 1);
});
