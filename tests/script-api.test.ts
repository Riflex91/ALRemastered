import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AdventureLandScriptApiBridge,
  type ScriptAdventureApiBridge,
  type ScriptAdventureApiDynamicState,
} from "../src/script/adventure-api.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";
import { Logger } from "../src/logging/logger.ts";

function actionResult(
  action: string,
  result: Record<string, unknown>,
  requestId = "act-script-test",
) {
  return {
    requestId,
    action,
    origin: "script" as const,
    characterId: "CH_1",
    outcome: "success" as const,
    startedAt: "2026-10-03T14:00:00.000Z",
    completedAt: "2026-10-03T14:00:00.010Z",
    durationMs: 10,
    result,
  };
}

test("Adventure Land script bridge exposes compatible aliases and routes every mutation through existing services", async () => {
  const calls: Array<{ method: string; input: unknown }> = [];
  const characterState = {
    status: "connected" as const,
    characterId: "CH_1",
    characterName: "RangerOne",
    message: "Connected.",
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 45,
      xp: 100,
      maxXp: 1000,
      map: "main",
      x: 100,
      y: 100,
      hp: 4000,
      maxHp: 4200,
      mp: 800,
      maxMp: 900,
      dead: false,
      range: 120,
      inventory: [{ name: "hpot0", q: 5 }],
      equipment: { mainhand: { name: "bow" } },
      gold: 1234,
      conditions: { mluck: { ms: 1000 } },
    },
    entities: [
      {
        id: "m1",
        kind: "monster" as const,
        name: "m1",
        type: "crab",
        map: "main",
        x: 140,
        y: 100,
        hp: 500,
        maxHp: 500,
      },
      {
        id: "p1",
        kind: "player" as const,
        name: "MageOne",
        type: "mage",
        map: "main",
        x: 180,
        y: 100,
        hp: 1000,
        maxHp: 1000,
      },
    ],
    lootChests: [
      { id: "far", map: "main", x: 300, y: 100, items: 1 },
      { id: "near", map: "main", x: 110, y: 100, items: 2 },
    ],
  };
  const bridge = new AdventureLandScriptApiBridge({
    character: {
      state: () => characterState as any,
      attackCooldownRemainingMs: () => 250,
    },
    movement: {
      runScript: async (input: any) => {
        calls.push({ method: "movement", input });
        return actionResult(
          input.mode === "xmove" ? "character.xmove" : "character.move",
          { serverConfirmed: true, targetX: input.x, targetY: input.y },
          "act-move",
        ) as any;
      },
    },
    smartMove: {
      run: async (target: unknown) => {
        calls.push({ method: "smart_move", input: target });
        return {
          status: "already_there",
          target: { map: "main", x: 100, y: 100 },
          route: {
            status: "reachable",
            message: "The target is already reached.",
            from: { map: "main", x: 100, y: 100 },
            to: { map: "main", x: 100, y: 100 },
            waypoints: [],
            legs: [],
            diagnostics: { mapHops: 0 },
          },
        } as any;
      },
    },
    attack: {
      run: async (input: any, origin: any) => {
        calls.push({ method: `attack:${origin}`, input });
        return actionResult("character.attack", { serverAccepted: true }, "act-attack") as any;
      },
    },
    loot: {
      runLoot: async (input: any, origin: any) => {
        calls.push({ method: `loot:${origin}`, input });
        return actionResult("character.loot", { serverAccepted: true, chestId: input.chestId }, "act-loot") as any;
      },
    },
    gameData: () => ({
      version: 17397,
      items: {},
      monsters: { crab: { hp: 500 } },
      maps: { main: {} },
      geometry: {},
      skills: {},
      classes: {},
      npcs: {},
      drops: {},
      craft: {},
      conditions: {},
    }),
  });

  const bootstrap = bridge.bootstrap();
  assert.equal(bootstrap.G.version, 17397);
  assert.equal(bootstrap.state.character.ctype, "ranger");
  assert.equal(bootstrap.state.character.max_hp, 4200);
  assert.equal(bootstrap.state.character.rip, false);
  assert.equal((bootstrap.state.Entities.m1 as any).type, "monster");
  assert.equal((bootstrap.state.Entities.m1 as any).mtype, "crab");
  assert.equal((bootstrap.state.Entities.p1 as any).ctype, "mage");
  assert.equal(bootstrap.state.attackCooldownMs, 250);

  const move = await bridge.call("move", { x: 116, y: 100 }) as any;
  assert.equal(move.requestId, "act-move");
  await bridge.call("xmove", { x: 100, y: 116 });
  const smart = await bridge.call("smart_move", {
    target: { x: 100, y: 100 },
  }) as any;
  assert.equal(smart.status, "already_there");
  await bridge.call("attack", { targetId: "m1" });
  const loot = await bridge.call("loot", {}) as any;
  assert.equal(loot.requestId, "act-loot");
  assert.deepEqual(calls, [
    { method: "movement", input: { mode: "move", x: 116, y: 100 } },
    { method: "movement", input: { mode: "xmove", x: 100, y: 116 } },
    { method: "smart_move", input: { x: 100, y: 100 } },
    { method: "attack:script", input: { targetId: "m1" } },
    { method: "loot:script", input: { chestId: "near" } },
  ]);
});

test("isolated worker exposes character, G, Entities, helpers and async action RPCs", async () => {
  const logger = new Logger({ component: "script-api-runtime-test" });
  const calls: Array<{ method: string; input: Readonly<Record<string, unknown>> }> = [];
  let dynamicState: ScriptAdventureApiDynamicState = {
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "character",
      ctype: "ranger",
      map: "main",
      x: 100,
      y: 100,
      hp: 4000,
      max_hp: 4200,
      range: 120,
      rip: false,
    },
    Entities: {
      m1: {
        id: "m1",
        name: "m1",
        type: "monster",
        mtype: "crab",
        map: "main",
        x: 140,
        y: 100,
        hp: 500,
        max_hp: 500,
        rip: false,
      },
    },
    attackCooldownMs: 0,
    lootChests: [{ id: "chest-1", x: 110, y: 100, map: "main" }],
  };
  const api: ScriptAdventureApiBridge = {
    bootstrap: () => ({
      G: { version: 17397, monsters: { crab: { hp: 500 } }, skills: {} },
      state: dynamicState,
    }),
    state: () => dynamicState,
    call: async (method, input) => {
      calls.push({ method, input });
      return {
        requestId: `act-${method}`,
        serverConfirmed: method === "move" || method === "xmove",
        serverAccepted: method === "attack" || method === "loot",
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
      name: "slice42-api-test",
      source: [
        "(async () => {",
        "  if (character.ctype !== 'ranger') throw new Error('character alias missing');",
        "  if (!G.monsters.crab) throw new Error('G missing');",
        "  if (!Entities.m1) throw new Error('Entities missing');",
        "  const target = get_nearest_monster({type:'crab'});",
        "  if (!target || target.id !== 'm1') throw new Error('nearest helper failed');",
        "  if (!is_in_range(target)) throw new Error('range helper failed');",
        "  if (!can_attack(target)) throw new Error('can_attack helper failed');",
        "  await move(116, 100);",
        "  await xmove(100, 100);",
        "  const smart = await smart_move({x:100,y:100});",
        "  if (!smart || !smart.requestId) throw new Error('smart_move missing');",
        "  await attack(target);",
        "  await loot();",
        "  console.info('slice42-api-done');",
        "})()",
      ].join("\n"),
    });
    assert.equal((await runtime.start()).status, "running");

    const completed = await waitFor(
      () => logger.records().some((record) =>
        record.component === "script:slice42-api-test" &&
        record.message === "slice42-api-done"
      ),
      1_500,
    );
    assert.equal(completed, true);
    assert.deepEqual(calls.map((entry) => entry.method), [
      "move",
      "xmove",
      "smart_move",
      "attack",
      "loot",
    ]);
    assert.deepEqual(calls[0]?.input, { x: 116, y: 100 });
    assert.deepEqual(calls[2]?.input, { targetId: "m1" });
    assert.deepEqual(calls[3]?.input, {});

    dynamicState = {
      ...dynamicState,
      Entities: {},
      attackCooldownMs: 500,
    };
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(runtime.state().status, "running");
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
