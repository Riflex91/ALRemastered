import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { PartyCoordinatorService } from "../src/party/coordinator.ts";
import { PartyTemplateService } from "../src/party/templates.ts";
import { Slice74LiveTestService } from "../src/live-test/slice-7-4.ts";

function connectedCharacter(characterId: string, name: string, type: string) {
  return {
    status: "connected" as const,
    characterId,
    characterName: name,
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
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
  };
}

function createHarness(userStatus: "unloaded" | "running" = "unloaded") {
  const logger = new Logger({ component: "slice74-live-test" });
  const primary = connectedCharacter("CH_PRIMARY", "Primary", "merchant");
  const managed = new Map<string, any>();
  const stopReasons: string[] = [];
  const selectionState = () => ({
    status: "ready" as const,
    characters: [
      { id: "CH_PRIMARY", name: "Primary", type: "merchant", level: 1, online: false, map: "main", home: "EUII" },
      { id: "CH_WARRIOR", name: "Warrior", type: "warrior", level: 1, online: false, map: "main", home: "EUII" },
      { id: "CH_PRIEST", name: "Priest", type: "priest", level: 1, online: false, map: "main", home: "EUII" },
    ],
    servers: [],
    selectedServerKey: "SR_EUII",
    loadedAt: "2026-10-04T02:00:00.000Z",
    message: "Ready.",
  });
  const sessions = {
    state: () => ({
      status: "ready" as const,
      sessionLimit: 4,
      activeSessionCount: 1 + managed.size,
      managedSessionCount: managed.size,
      availableSlots: 3 - managed.size,
      sessions: [
        {
          role: "primary" as const,
          characterId: "CH_PRIMARY",
          characterName: "Primary",
          serverKey: "SR_EUII",
          status: "connected" as const,
          message: "Connected.",
        },
        ...[...managed.values()].map((item) => ({
          role: "managed" as const,
          characterId: item.characterId,
          characterName: item.characterName,
          serverKey: "SR_EUII",
          status: "connected" as const,
          message: "Connected.",
        })),
      ],
      sharedStaticData: { mode: "shared" as const, gameDataVersion: 17397 },
      message: "Ready.",
    }),
    characterStates: () => [
      { role: "primary" as const, characterId: "CH_PRIMARY", state: structuredClone(primary) },
      ...[...managed.values()].map((state) => ({
        role: "managed" as const,
        characterId: state.characterId,
        state: structuredClone(state),
      })),
    ],
    start: async (characterId: string) => {
      if (characterId === "CH_WARRIOR") {
        managed.set(characterId, connectedCharacter(characterId, "Warrior", "warrior"));
      } else if (characterId === "CH_PRIEST") {
        managed.set(characterId, connectedCharacter(characterId, "Priest", "priest"));
      } else {
        throw new Error("Unexpected candidate.");
      }
      return sessions.state();
    },
    stop: async (characterId: string, reason: string) => {
      stopReasons.push(reason);
      managed.delete(characterId);
      return sessions.state();
    },
  };
  const coordinator = new PartyCoordinatorService({
    logger,
    sessions: sessions as any,
    now: () => new Date("2026-10-04T02:00:00.000Z"),
  });
  const templates = new PartyTemplateService({ logger, coordinator });
  const userRuntime = {
    state: () => ({
      status: userStatus,
      message: "Runtime.",
      scriptName: userStatus === "running" ? "user-script" : undefined,
      runId: userStatus === "running" ? "run-user" : undefined,
      activeTimers: 0,
      activeEventListeners: 0,
    }),
  };
  const messaging = {
    state: () => ({
      status: "ready" as const,
      requestCount: 20,
      localDeliveryCount: 19,
      unavailableRecipientCount: 1,
      listenerCount: 0,
      localOnly: true as const,
      rawSocketAccess: false as const,
      message: "Ready.",
    }),
  };
  const service = new Slice74LiveTestService({
    logger,
    userRuntime: userRuntime as any,
    primary: { state: () => structuredClone(primary) as any },
    selection: { state: () => selectionState() as any },
    sessions: sessions as any,
    coordinator,
    templates,
    messaging: messaging as any,
    clock: () => new Date("2026-10-04T02:00:00.000Z"),
    idFactory: () => "live74-test",
  });
  return { logger, service, sessions, coordinator, templates, stopReasons };
}

test("Slice 7.4 one-click test covers all templates, manual assignment, cleanup, and restore", async () => {
  const harness = createHarness();
  harness.coordinator.assignRole("CH_PRIMARY", "tank");
  harness.coordinator.setTarget("before-target");
  const before = harness.coordinator.state();

  const result = await harness.service.run();
  assert.equal(result.outcome, "passed");
  assert.deepEqual(result.steps.map((item) => item.name), [
    "preflight",
    "recommended-templates",
    "simple-assignment",
    "member-removal",
    "final-state",
  ]);
  assert.equal(result.managedCharacters.length, 2);
  assert.deepEqual(
    result.managedCharacters.map((item) => [item.characterType, item.expectedRole]).sort(),
    [["priest", "healer"], ["warrior", "tank"]],
  );
  assert.deepEqual(harness.stopReasons, ["slice74_live_test", "slice74_live_test"]);
  assert.equal(harness.sessions.state().managedSessionCount, 0);
  const after = harness.coordinator.state();
  assert.equal(after.target?.id, before.target?.id);
  assert.equal(after.members.find((item) => item.characterId === "CH_PRIMARY")?.role, "tank");

  const finalEvidence = result.steps.find((item) => item.name === "final-state")?.evidence as any;
  assert.equal(finalEvidence.localMessagingRequestDelta, 0);
  assert.equal(finalEvidence.localMessagingDeliveryDelta, 0);
  assert.equal(finalEvidence.gameplayMutation, false);
  assert.equal(finalEvidence.rawSocketAccess, false);
  assert.equal(finalEvidence.localMessagingRequired, false);
  assert.equal(finalEvidence.userScriptInterrupted, false);
  assert.match(harness.logger.exportText(), /Party Templates live test passed/);
});

test("Slice 7.4 blocks rather than interrupting a running user Script", async () => {
  const harness = createHarness("running");
  const result = await harness.service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(harness.sessions.state().managedSessionCount, 0);
  assert.equal(harness.stopReasons.length, 0);
});
