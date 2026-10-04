import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { PartyCoordinatorService } from "../src/party/coordinator.ts";
import {
  PartyTemplateService,
  recommendedPartyRole,
} from "../src/party/templates.ts";

function character(characterId: string, name: string, type: string) {
  return {
    role: "managed" as const,
    characterId,
    state: {
      status: "connected" as const,
      characterId,
      characterName: name,
      serverKey: "SR_EUII",
      character: {
        id: characterId,
        name,
        type,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
        dead: false,
      },
      party: { inParty: false, members: [], details: {} },
      message: "Connected.",
    },
  };
}

function createHarness() {
  const logger = new Logger({ component: "party-templates-test" });
  const sessions = {
    characterStates: () => [
      { ...character("CH_WARRIOR", "Warrior", "warrior"), role: "primary" as const },
      character("CH_PRIEST", "Priest", "priest"),
      character("CH_RANGER", "Ranger", "ranger"),
    ],
  };
  const coordinator = new PartyCoordinatorService({
    logger,
    sessions: sessions as any,
    now: () => new Date("2026-10-04T02:00:00.000Z"),
  });
  coordinator.setTarget("target-1");
  const templates = new PartyTemplateService({ logger, coordinator });
  return { logger, coordinator, templates };
}

test("Party Templates recommend Warrior Tank, Priest Healer, and DPS", () => {
  assert.equal(recommendedPartyRole("warrior"), "tank");
  assert.equal(recommendedPartyRole("priest"), "healer");
  assert.equal(recommendedPartyRole("ranger"), "dps");
  assert.equal(recommendedPartyRole("merchant"), "dps");
  assert.equal(recommendedPartyRole(undefined), undefined);

  const { templates } = createHarness();
  const before = templates.state();
  assert.equal(before.status, "degraded");
  assert.equal(before.matchedCount, 0);

  const applied = templates.applyRecommendedRoles();
  assert.equal(applied.status, "ready");
  assert.equal(applied.memberCount, 3);
  assert.equal(applied.matchedCount, 3);
  assert.deepEqual(
    applied.assignments.map((item) => [
      item.characterType,
      item.recommendedRole,
      item.currentRole,
      item.status,
    ]),
    [
      ["warrior", "tank", "tank", "matched"],
      ["priest", "healer", "healer", "matched"],
      ["ranger", "dps", "dps", "matched"],
    ],
  );
  assert.equal(applied.templateLayerActive, true);
  assert.equal(applied.gameplayMutation, false);
  assert.equal(applied.rawSocketAccess, false);
  assert.equal(applied.localMessagingRequired, false);
});

test("Party Templates support simple override, clear, and recommendation restore", () => {
  const { coordinator, templates } = createHarness();
  templates.applyRecommendedRoles();

  const override = templates.assignRole("CH_RANGER", "healer");
  const rangerOverride = override.assignments.find((item) => item.characterId === "CH_RANGER");
  assert.equal(rangerOverride?.recommendedRole, "dps");
  assert.equal(rangerOverride?.currentRole, "healer");
  assert.equal(rangerOverride?.status, "override");
  assert.equal(rangerOverride?.matchesRecommendation, false);

  const cleared = templates.clearRole("CH_RANGER");
  const rangerCleared = cleared.assignments.find((item) => item.characterId === "CH_RANGER");
  assert.equal(rangerCleared?.currentRole, undefined);
  assert.equal(rangerCleared?.status, "needs-assignment");

  const restored = templates.applyRecommendedRoles();
  const rangerRestored = restored.assignments.find((item) => item.characterId === "CH_RANGER");
  assert.equal(rangerRestored?.currentRole, "dps");
  assert.equal(rangerRestored?.matchesRecommendation, true);
  assert.equal(coordinator.state().roles.dps.assignedCount, 1);
});
