import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { AdventureLandAttackService } from "../src/action/attack.ts";
import { Logger } from "../src/logging/logger.ts";

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
      level: 45,
      map: "main",
      x: 100,
      y: 100,
      hp: 4000,
      maxHp: 4000,
      range: 120,
      dead: false,
      ...((overrides.character as Record<string, unknown> | undefined) ?? {}),
    },
    entities: (overrides.entities as any[]) ?? [
      {
        id: "14",
        kind: "monster",
        name: "14",
        type: "goo",
        map: "main",
        x: 150,
        y: 100,
        hp: 120,
        maxHp: 120,
      },
    ],
    party: { inParty: false, members: [], details: {} },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "character" && key !== "entities"),
    ),
  };
}

test("manual attack validates live target, awaits server success, and logs result", async () => {
  const logger = new Logger({ component: "attack-test" });
  const sent: string[] = [];
  const service = new AdventureLandAttackService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-attack-success",
      nowMs: () => 1_000,
    }),
    logger,
    character: {
      state: () => connectedState() as any,
      attackCooldownRemainingMs: () => 0,
      sendAttack: async ({ targetId }: { targetId: string }) => {
        sent.push(targetId);
        return {
          targetId,
          success: true,
          cooldownMs: 725,
        };
      },
    } as any,
  });

  const result = await service.runDashboardTest({ targetId: "14" });
  assert.equal(result.outcome, "success");
  assert.equal(result.requestId, "act-attack-success");
  assert.equal(result.action, "character.attack");
  assert.equal(result.origin, "dashboard");
  assert.equal(result.characterId, "CH_1");
  assert.deepEqual(sent, ["14"]);
  assert.deepEqual(result.result, {
    targetId: "14",
    targetName: "14",
    targetType: "goo",
    distance: 50,
    range: 120,
    serverAccepted: true,
    cooldownMs: 725,
  });

  const logs = logger.exportText();
  assert.match(logs, /"requestId":"act-attack-success"/);
  assert.match(logs, /Attack server response confirmed/);
  assert.match(logs, /"targetId":"14"/);
  assert.match(logs, /"distance":50/);
  assert.match(logs, /"range":120/);
  assert.match(logs, /"cooldownMs":725/);
});

test("attack rejects non-visible, non-monster, dead, and out-of-range targets before mutation", async () => {
  let sent = 0;
  let now = 10_000;
  const logger = new Logger({ component: "attack-negative-test" });
  let state: any = connectedState();
  const service = new AdventureLandAttackService({
    gateway: new ActionGateway({
      logger,
      nowMs: () => now,
      idFactory: () => `act-neg-${now}`,
    }),
    logger,
    character: {
      state: () => state,
      attackCooldownRemainingMs: () => 0,
      sendAttack: async () => {
        sent += 1;
        return { targetId: "14", success: true };
      },
    } as any,
  });

  let result = await service.runDashboardTest({ targetId: "missing" });
  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "ATTACK_TARGET_NOT_VISIBLE");
  assert.equal(sent, 0);

  now += 1_000;
  state = connectedState({
    entities: [{ id: "MageOne", kind: "player", name: "MageOne", type: "mage", x: 110, y: 100 }],
  });
  result = await service.runDashboardTest({ targetId: "MageOne" });
  assert.equal(result.error?.code, "ATTACK_TARGET_NOT_VISIBLE");
  assert.equal(sent, 0);

  now += 1_000;
  state = connectedState({
    entities: [{ id: "14", kind: "monster", name: "14", type: "goo", x: 150, y: 100, hp: 0 }],
  });
  result = await service.runDashboardTest({ targetId: "14" });
  assert.equal(result.error?.code, "ATTACK_TARGET_DEAD");
  assert.equal(sent, 0);

  now += 1_000;
  state = connectedState({
    entities: [{ id: "14", kind: "monster", name: "14", type: "goo", x: 300, y: 100, hp: 120 }],
  });
  result = await service.runDashboardTest({ targetId: "14" });
  assert.equal(result.error?.code, "ATTACK_OUT_OF_RANGE");
  assert.equal(sent, 0);

  now += 1_000;
  state = connectedState({ character: { dead: true } });
  result = await service.runDashboardTest({ targetId: "14" });
  assert.equal(result.error?.code, "ATTACK_CHARACTER_DEAD");
  assert.equal(sent, 0);
});

test("attack exposes local and server cooldowns as structured retry hints", async () => {
  let now = 20_000;
  let localCooldown = 350;
  const logger = new Logger({ component: "attack-cooldown-test" });
  let serverResponse = { targetId: "14", success: false, reason: "cooldown", cooldownMs: 480 };
  const service = new AdventureLandAttackService({
    gateway: new ActionGateway({
      logger,
      nowMs: () => now,
      idFactory: () => `act-cd-${now}`,
    }),
    logger,
    character: {
      state: () => connectedState() as any,
      attackCooldownRemainingMs: () => localCooldown,
      sendAttack: async () => serverResponse,
    } as any,
  });

  let result = await service.runDashboardTest({ targetId: "14" });
  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "ATTACK_COOLDOWN");
  assert.equal(result.retryAfterMs, 350);

  now += 1_000;
  localCooldown = 0;
  result = await service.runDashboardTest({ targetId: "14" });
  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "ATTACK_COOLDOWN");
  assert.equal(result.retryAfterMs, 480);
  assert.match(logger.exportText(), /Attack server response rejected/);
  assert.match(logger.exportText(), /"reason":"cooldown"/);
});

test("attack uses a conservative gateway rate guard and never auto-repeats", async () => {
  let now = 30_000;
  let calls = 0;
  const logger = new Logger({ component: "attack-rate-test" });
  const service = new AdventureLandAttackService({
    gateway: new ActionGateway({
      logger,
      nowMs: () => now,
      idFactory: () => `act-rate-${calls + 1}`,
    }),
    logger,
    character: {
      state: () => connectedState() as any,
      attackCooldownRemainingMs: () => 0,
      sendAttack: async ({ targetId }: { targetId: string }) => {
        calls += 1;
        return { targetId, success: true };
      },
    } as any,
  });

  const first = await service.runDashboardTest({ targetId: "14" });
  assert.equal(first.outcome, "success");
  assert.equal(calls, 1);

  now += 100;
  const second = await service.runDashboardTest({ targetId: "14" });
  assert.equal(second.outcome, "rate_limited");
  assert.equal(second.error?.code, "ACTION_RATE_LIMITED");
  assert.ok((second.retryAfterMs ?? 0) > 0);
  assert.equal(calls, 1);
});
