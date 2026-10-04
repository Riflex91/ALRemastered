import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { PartyCoordinatorService } from "../src/party/coordinator.ts";
import { Slice73LiveTestService } from "../src/live-test/slice-7-3.ts";

function connectedCharacter(characterId: string, name: string, type: string) {
  return {
    status: "connected" as const,
    characterId,
    characterName: name,
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
    connectedAt: "2026-10-04T01:00:00.000Z",
    message: \`\${name} connected.\`,
    character: {
      id: characterId,
      name,
      type,
      level: 80,
      hp: 8000,
      maxHp: 10000,
      mp: 2500,
      maxMp: 3000,
      dead: false,
    },
    party: { inParty: false, members: [], details: {} },
  };
}

function selectionState() {
  return {
    status: "ready" as const,
    characters: [
      { id: "CH_PRIMARY", name: "Primary", type: "warrior", level: 80, online: true },
      { id: "CH_SECONDARY", name: "Secondary", type: "priest", level: 80, online: false },
    ],
    servers: [{
      key: "SR_EUII",
      name: "II",
      region: "EU",
      players: 100,
      address: "eu2.example.test",
      path: "/socket.io/",
    }],
    selectedServerKey: "SR_EUII",
    loadedAt: "2026-10-04T01:00:00.000Z",
    message: "Ready.",
  };
}

function createHarness(userStatus: "unloaded" | "running" = "unloaded") {
  const logger = new Logger({ component: "slice73-live-test" });
  const primary = connectedCharacter("CH_PRIMARY", "Primary", "warrior");
  let managed: any | undefined;
  const stopReasons: string[] = [];
  const sessions = {
    state: () => ({
      status: "ready" as const,
      sessionLimit: 4,
      activeSessionCount: managed ? 2 : 1,
      managedSessionCount: managed ? 1 : 0,
      availableSlots: managed ? 2 : 3,
      sessions: [
        {
          role: "primary" as const,
          characterId: "CH_PRIMARY",
          characterName: "Primary",
          serverKey: "SR_EUII",
          status: "connected" as const,
          message: "Connected.",
        },
        ...(managed ? [{
          role: "managed" as const,
          characterId: "CH_SECONDARY",
          characterName: "Secondary",
          serverKey: "SR_EUII",
          status: "connected" as const,
          message: "Connected.",
        }] : []),
      ],
      sharedStaticData: { mode: "shared" as const, gameDataVersion: 17397 },
      message: "Ready.",
    }),
    characterStates: () => [
      { role: "primary" as const, characterId: "CH_PRIMARY", state: structuredClone(primary) },
      ...(managed
        ? [{ role: "managed" as const, characterId: "CH_SECONDARY", state: structuredClone(managed) }]
        : []),
    ],
    start: async (characterId: string) => {
      assert.equal(characterId, "CH_SECONDARY");
      managed = connectedCharacter("CH_SECONDARY", "Secondary", "priest");
      return sessions.state();
    },
    stop: async (characterId: string, reason: string) => {
      assert.equal(characterId, "CH_SECONDARY");
      stopReasons.push(reason);
      managed = undefined;
      return sessions.state();
    },
  };
  const coordinator = new PartyCoordinatorService({ logger, sessions: sessions as any });
  coordinator.assignRole("CH_PRIMARY", "dps");
  coordinator.setTarget("preexisting-target");
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
      requestCount: 12,
      localDeliveryCount: 10,
      unavailableRecipientCount: 2,
      listenerCount: 0,
      localOnly: true as const,
      rawSocketAccess: false as const,
      message: "Ready.",
    }),
  };
  const service = new Slice73LiveTestService({
    logger,
    userRuntime: userRuntime as any,
    primary: { state: () => structuredClone(primary) as any },
    selection: { state: () => selectionState() as any },
    sessions: sessions as any,
    coordinator,
    messaging: messaging as any,
    clock: () => new Date("2026-10-04T01:05:00.000Z"),
    idFactory: () => "live73-test",
  });
  return { logger, service, sessions, coordinator, stopReasons };
}

test("Slice 7.3 one-click test covers roles, target, role change, removal, and state restoration", async () => {
  const harness = createHarness();
  const before = harness.coordinator.state();
  const result = await harness.service.run();
  assert.equal(result.outcome, "passed");
  assert.deepEqual(result.steps.map((item) => item.name), [
    "preflight",
    "roles-and-target",
    "role-change",
    "member-removal",
    "final-state",
  ]);
  assert.deepEqual(harness.stopReasons, ["slice73_live_test"]);
  assert.equal(harness.sessions.state().managedSessionCount, 0);
  const after = harness.coordinator.state();
  assert.equal(after.target?.id, before.target?.id);
  assert.deepEqual(
    after.members.filter((member) => member.role).map((member) => [member.characterId, member.role]),
    before.members.filter((member) => member.role).map((member) => [member.characterId, member.role]),
  );
  const evidence = result.steps.find((item) => item.name === "final-state")?.evidence as any;
  assert.equal(evidence.localMessagingRequestDelta, 0);
  assert.equal(evidence.localMessagingDeliveryDelta, 0);
  assert.equal(evidence.gameplayMutation, false);
  assert.equal(evidence.rawSocketAccess, false);
  assert.equal(evidence.partyTemplatesActive, false);
  assert.match(harness.logger.exportText(), /Party Coordinator live test passed/);
});

test("Slice 7.3 blocks rather than interrupting a running user Script", async () => {
  const harness = createHarness("running");
  const before = harness.coordinator.state();
  const result = await harness.service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(harness.sessions.state().managedSessionCount, 0);
  assert.equal(harness.stopReasons.length, 0);
  assert.equal(harness.coordinator.state().target?.id, before.target?.id);
});
