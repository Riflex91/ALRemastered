import assert from "node:assert/strict";
import { test } from "node:test";
import { ExplainabilityService } from "../src/dashboard/explainability.ts";

function service(overrides: any = {}) {
  let gatewayRequests = 3;
  const characterState = overrides.characterState ?? {
    status: "connected",
    characterId: "CH_A",
    characterName: "Hero",
    serverKey: "SR_EUII",
    character: {
      id: "CH_A", name: "Hero", type: "merchant", level: 10, map: "main",
      x: 0, y: 0, hp: 900, maxHp: 1000, mp: 500, maxMp: 1000,
      dead: false, range: 100,
    },
    entities: [
      { id: "goo-near", kind: "monster", name: "Goo A", type: "goo", map: "main", x: 30, y: 0, hp: 100 },
      { id: "goo-far", kind: "monster", name: "Goo B", type: "goo", map: "main", x: 80, y: 0, hp: 100 },
      { id: "bee", kind: "monster", name: "Bee", type: "bee", map: "main", x: 10, y: 0, hp: 100 },
    ],
    lootChests: [],
  };
  return {
    explainability: new ExplainabilityService({
      character: {
        state: () => structuredClone(characterState),
        attackCooldownRemainingMs: () => overrides.attackCooldownMs ?? 0,
        skillCooldownRemainingMs: (name: string) => name === "use_hp"
          ? overrides.hpCooldownMs ?? 0
          : overrides.mpCooldownMs ?? 0,
      } as any,
      farmer: {
        state: () => ({
          status: overrides.farmerStatus ?? "running",
          message: "Running.",
          config: { monster: "goo", hpThresholdPercent: 50, mpThresholdPercent: 30, loot: true, respawn: true },
        }),
      } as any,
      config: {
        state: () => ({
          status: "ready",
          selectedTemplateId: "simple-farmer",
          templates: [],
          normalSettingsRequireCodeChanges: false,
          gameplayMutation: false,
          rawSocketAccess: false,
          message: "Ready.",
        }),
      } as any,
      gateway: {
        state: () => ({
          status: "ready", active: 0, totalRequests: gatewayRequests,
          lastResult: overrides.lastResult,
        }),
      } as any,
      movementDebug: {
        state: () => ({
          status: "ready", trailLimit: 120, trailPointCount: 0, movementCount: 0,
          plannedRouteCount: 0, trail: [], message: "Ready.", plannedRoute: overrides.plannedRoute,
        }),
      } as any,
    }),
    gatewayRequests: () => gatewayRequests,
  };
}

test("Explainability mirrors Simple Farmer target choice, rejected targets, range and next action", () => {
  const { explainability } = service();
  const state = explainability.state();
  assert.equal(state.status, "ready");
  assert.equal(state.strategy.name, "Simple Farmer");
  assert.equal(state.strategy.active, true);
  assert.equal(state.currentTarget?.id, "goo-near");
  assert.equal(state.currentTarget?.distance, 30);
  assert.equal(state.currentTarget?.inRange, true);
  assert.match(state.selectionReason, /Nearest visible goo/);
  assert.equal(state.rejectedTargets.some((item) => item.id === "bee" && /Different/.test(item.reason)), true);
  assert.equal(state.rejectedTargets.some((item) => item.id === "goo-far" && /Farther/.test(item.reason)), true);
  assert.equal(state.nextAction.key, "attack");
  assert.equal(state.readOnly, true);
  assert.equal(state.gameplayMutation, false);
  assert.equal(state.rawSocketAccess, false);
});

test("Explainability mirrors farmer priority for HP, cooldowns and out-of-range blockers", () => {
  const lowHp = service({
    characterState: {
      status: "connected", characterId: "CH_A", characterName: "Hero", serverKey: "SR_EUII",
      character: { id:"CH_A",name:"Hero",type:"merchant",level:10,map:"main",x:0,y:0,hp:400,maxHp:1000,mp:500,maxMp:1000,dead:false,range:20 },
      entities: [{id:"goo",kind:"monster",name:"Goo",type:"goo",map:"main",x:50,y:0,hp:100}],
      lootChests: [],
    },
    hpCooldownMs: 250,
  }).explainability.state();
  assert.equal(lowHp.nextAction.key, "wait");
  assert.match(lowHp.nextAction.reason, /use_hp cooldown/);
  assert.equal(lowHp.currentTarget?.inRange, false);
  assert.equal(lowHp.blockers.some((item) => /outside attack range/.test(item)), true);
  assert.equal(lowHp.cooldowns.hpMs, 250);
});

test("Explainability reports movement telemetry without dispatching actions", () => {
  const { explainability, gatewayRequests } = service({
    lastResult: {
      requestId:"act-1",action:"character.move",origin:"script",outcome:"success",
      startedAt:"2026-10-04T09:00:00Z",completedAt:"2026-10-04T09:00:00Z",durationMs:1,
      result:{map:"main",targetX:12,targetY:34},
    },
  });
  const before = gatewayRequests();
  const state = explainability.state();
  assert.equal(state.movementTarget.status, "telemetry");
  assert.equal(state.movementTarget.x, 12);
  assert.equal(state.movementTarget.y, 34);
  assert.equal(state.movementTarget.source, "last-gateway-action");
  assert.equal(gatewayRequests(), before);
});
