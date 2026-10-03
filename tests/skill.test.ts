import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { AdventureLandSkillService } from "../src/action/skill.ts";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";

function gameData(
  skills: Readonly<Record<string, unknown>> = safeSkills(),
): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: { main: {} },
    geometry: {},
    skills,
    classes: {},
    npcs: {},
    drops: {},
    craft: {},
    conditions: {},
  };
}

function safeSkills(): Readonly<Record<string, unknown>> {
  return {
    mluck: {
      type: "skill",
      class: ["merchant"],
      name: "Merchant's Luck",
      level: 40,
      mp: 10,
      range: 320,
      cooldown: 100,
      target: "player",
    },
    massproduction: {
      type: "skill",
      class: ["merchant"],
      name: "Mass Production",
      level: 30,
      mp: 20,
      cooldown: 50,
    },
    blink: {
      type: "skill",
      class: ["merchant"],
      name: "Blink",
      mp: 10,
      cooldown: 1200,
    },
    poisonarrow: {
      type: "skill",
      class: ["merchant"],
      name: "Poison Arrow",
      mp: 10,
      range: 120,
      target: true,
      hostile: true,
      consume: "poison",
    },
    partyheal: {
      type: "skill",
      class: ["merchant"],
      name: "Party Heal",
      mp: 20,
      cooldown: 200,
      multi: true,
      party: true,
    },
    energize: {
      type: "skill",
      class: ["merchant"],
      name: "Energize",
      target: "player",
      range: 320,
      cooldown: 4000,
    },
  };
}

function connectedState(
  overrides: Record<string, unknown> = {},
) {
  return {
    status: "connected" as const,
    characterId: "CH_1",
    characterName: "MerchantOne",
    message: "Connected.",
    character: {
      id: "CH_1",
      name: "MerchantOne",
      type: "merchant",
      level: 50,
      map: "main",
      x: 100,
      y: 100,
      hp: 2000,
      maxHp: 2000,
      mp: 500,
      maxMp: 500,
      range: 120,
      dead: false,
      ...((overrides.character as Record<string, unknown> | undefined) ?? {}),
    },
    entities: (overrides.entities as any[]) ?? [
      {
        id: "MageOne",
        kind: "player",
        name: "MageOne",
        type: "mage",
        map: "main",
        x: 180,
        y: 100,
        hp: 3000,
        maxHp: 3000,
      },
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
      Object.entries(overrides).filter(([key]) =>
        key !== "character" && key !== "entities"
      ),
    ),
  };
}

test("dashboard skill options expose only safe simple class skills", () => {
  const logger = new Logger({ component: "skill-options-test" });
  const service = new AdventureLandSkillService({
    gateway: new ActionGateway({ logger }),
    logger,
    character: {
      state: () => connectedState() as any,
      sendSkill: async () => {
        throw new Error("not used");
      },
      skillCooldownRemainingMs: () => 0,
    } as any,
    gameData: () => gameData(),
  });

  const options = service.dashboardOptions();
  assert.equal(options.status, "ready");
  assert.equal(options.characterId, "CH_1");
  assert.deepEqual(
    options.skills.map((skill) => skill.skillName).sort(),
    ["massproduction", "mluck"],
  );

  const mluck = options.skills.find((skill) => skill.skillName === "mluck");
  assert.ok(mluck);
  assert.equal(mluck.targetMode, "player");
  assert.equal(mluck.mpCost, 10);
  assert.equal(mluck.range, 320);
  assert.deepEqual(
    mluck.targets.map((target) => target.id),
    ["MageOne"],
  );

  const production = options.skills.find((skill) =>
    skill.skillName === "massproduction"
  );
  assert.ok(production);
  assert.equal(production.targetMode, "none");
  assert.deepEqual(production.targets, []);
});

test("safe no-target skill runs once through gateway and waits for server success", async () => {
  const logger = new Logger({ component: "skill-success-test" });
  const sent: Array<{ name: string; targetId?: string; cooldownKey?: string }> = [];
  const service = new AdventureLandSkillService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-skill-success",
      nowMs: () => 1_000,
    }),
    logger,
    character: {
      state: () => connectedState() as any,
      skillCooldownRemainingMs: () => 0,
      sendSkill: async (input: {
        name: string;
        targetId?: string;
        cooldownKey?: string;
      }) => {
        sent.push(input);
        return {
          name: input.name,
          targetId: input.targetId,
          success: true,
          cooldownMs: 50,
        };
      },
    } as any,
    gameData: () => gameData(),
  });

  const result = await service.runDashboardTest({
    skillName: "massproduction",
  });

  assert.equal(result.outcome, "success");
  assert.equal(result.requestId, "act-skill-success");
  assert.equal(result.action, "character.skill");
  assert.equal(result.origin, "dashboard");
  assert.equal(result.characterId, "CH_1");
  assert.deepEqual(sent, [{
    name: "massproduction",
    targetId: undefined,
    cooldownKey: "massproduction",
    signal: sent[0]?.signal,
  }]);
  assert.deepEqual(result.result, {
    skillName: "massproduction",
    displayName: "Mass Production",
    targetId: undefined,
    targetName: undefined,
    targetKind: undefined,
    distance: undefined,
    range: undefined,
    mpCost: 20,
    serverAccepted: true,
    cooldownMs: 50,
  });

  const logs = logger.exportText();
  assert.match(logs, /"requestId":"act-skill-success"/);
  assert.match(logs, /Skill server response confirmed/);
  assert.match(logs, /"skillName":"massproduction"/);
});

test("targeted safe skill validates visible target kind and range before mutation", async () => {
  let now = 10_000;
  let state: any = connectedState();
  let calls = 0;
  const logger = new Logger({ component: "skill-target-test" });
  const service = new AdventureLandSkillService({
    gateway: new ActionGateway({
      logger,
      nowMs: () => now,
      idFactory: () => `act-target-${now}`,
    }),
    logger,
    character: {
      state: () => state,
      skillCooldownRemainingMs: () => 0,
      sendSkill: async (input: { name: string; targetId?: string }) => {
        calls += 1;
        return {
          name: input.name,
          targetId: input.targetId,
          success: true,
          cooldownMs: 100,
        };
      },
    } as any,
    gameData: () => gameData(),
  });

  let result = await service.runDashboardTest({
    skillName: "mluck",
    targetId: "MageOne",
  });
  assert.equal(result.outcome, "success");
  assert.equal(result.result?.targetId, "MageOne");
  assert.equal(result.result?.targetKind, "player");
  assert.equal(result.result?.distance, 80);
  assert.equal(calls, 1);

  now += 1_000;
  state = connectedState({
    entities: [{
      id: "MageOne",
      kind: "player",
      name: "MageOne",
      type: "mage",
      x: 500,
      y: 100,
    }],
  });
  result = await service.runDashboardTest({
    skillName: "mluck",
    targetId: "MageOne",
  });
  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "SKILL_OUT_OF_RANGE");
  assert.equal(calls, 1);

  now += 1_000;
  state = connectedState();
  result = await service.runDashboardTest({
    skillName: "mluck",
    targetId: "14",
  });
  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "SKILL_TARGET_INVALID");
  assert.equal(calls, 1);
});

test("skill rejects excluded names, insufficient MP, dead state, and unexpected targets", async () => {
  let now = 20_000;
  let state: any = connectedState();
  let calls = 0;
  const logger = new Logger({ component: "skill-negative-test" });
  const service = new AdventureLandSkillService({
    gateway: new ActionGateway({
      logger,
      nowMs: () => now,
      idFactory: () => `act-negative-${now}`,
    }),
    logger,
    character: {
      state: () => state,
      skillCooldownRemainingMs: () => 0,
      sendSkill: async (input: { name: string }) => {
        calls += 1;
        return { name: input.name, success: true };
      },
    } as any,
    gameData: () => gameData(),
  });

  let result = await service.runDashboardTest({ skillName: "blink" });
  assert.equal(result.error?.code, "SKILL_NOT_ALLOWED");
  assert.equal(calls, 0);

  now += 1_000;
  state = connectedState({ character: { mp: 5 } });
  result = await service.runDashboardTest({ skillName: "massproduction" });
  assert.equal(result.error?.code, "SKILL_NO_MP");
  assert.equal(calls, 0);

  now += 1_000;
  state = connectedState({ character: { dead: true } });
  result = await service.runDashboardTest({ skillName: "massproduction" });
  assert.equal(result.error?.code, "SKILL_CHARACTER_DEAD");
  assert.equal(calls, 0);

  now += 1_000;
  state = connectedState();
  result = await service.runDashboardTest({
    skillName: "massproduction",
    targetId: "MageOne",
  });
  assert.equal(result.error?.code, "SKILL_TARGET_NOT_ALLOWED");
  assert.equal(calls, 0);
});

test("skill exposes local and server cooldowns and gateway rate limiting", async () => {
  let now = 30_000;
  let localCooldown = 350;
  let calls = 0;
  let serverResponse = {
    name: "massproduction",
    success: false,
    reason: "cooldown",
    cooldownMs: 480,
  };
  const logger = new Logger({ component: "skill-cooldown-test" });
  const service = new AdventureLandSkillService({
    gateway: new ActionGateway({
      logger,
      nowMs: () => now,
      idFactory: () => `act-cooldown-${now}`,
    }),
    logger,
    character: {
      state: () => connectedState() as any,
      skillCooldownRemainingMs: () => localCooldown,
      sendSkill: async () => {
        calls += 1;
        return serverResponse;
      },
    } as any,
    gameData: () => gameData(),
  });

  let result = await service.runDashboardTest({
    skillName: "massproduction",
  });
  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "SKILL_COOLDOWN");
  assert.equal(result.retryAfterMs, 350);
  assert.equal(calls, 0);

  now += 1_000;
  localCooldown = 0;
  result = await service.runDashboardTest({
    skillName: "massproduction",
  });
  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "SKILL_COOLDOWN");
  assert.equal(result.retryAfterMs, 480);
  assert.equal(calls, 1);
  assert.match(logger.exportText(), /Skill server response rejected/);

  now += 1_000;
  serverResponse = {
    name: "massproduction",
    success: true,
    reason: undefined as unknown as string,
    cooldownMs: 50,
  };
  result = await service.runDashboardTest({
    skillName: "massproduction",
  });
  assert.equal(result.outcome, "success");
  assert.equal(calls, 2);

  now += 100;
  result = await service.runDashboardTest({
    skillName: "massproduction",
  });
  assert.equal(result.outcome, "rate_limited");
  assert.equal(result.error?.code, "ACTION_RATE_LIMITED");
  assert.ok((result.retryAfterMs ?? 0) > 0);
  assert.equal(calls, 2);
});
