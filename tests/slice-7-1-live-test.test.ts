import assert from "node:assert/strict";
import { test } from "node:test";
import { MultiCharacterSessionManagerError } from "../src/character/session-manager.ts";
import { Slice71LiveTestService } from "../src/live-test/slice-7-1.ts";
import { Logger } from "../src/logging/logger.ts";

function managerState(managed = false) {
  return {
    status: "ready" as const,
    sessionLimit: 4,
    activeSessionCount: managed ? 2 : 1,
    managedSessionCount: managed ? 1 : 0,
    availableSlots: managed ? 2 : 3,
    sessions: managed
      ? [
        {
          role: "primary" as const,
          characterId: "CH_PRIMARY",
          characterName: "Primary",
          serverKey: "SR_EUII",
          status: "connected" as const,
          message: "Connected.",
        },
        {
          role: "managed" as const,
          characterId: "CH_SECONDARY",
          characterName: "Secondary",
          serverKey: "SR_EUII",
          status: "connected" as const,
          message: "Connected.",
        },
      ]
      : [{
        role: "primary" as const,
        characterId: "CH_PRIMARY",
        characterName: "Primary",
        serverKey: "SR_EUII",
        status: "connected" as const,
        message: "Connected.",
      }],
    sharedStaticData: {
      mode: "shared" as const,
      gameDataVersion: 17397,
    },
    message: managed
      ? "Multi-character session manager ready. 2/4 active sessions."
      : "Multi-character session manager ready. 1/4 active sessions.",
  };
}

test("Slice 7.1 verifies two concurrent Character sessions, duplicate isolation, shared data, and bounded cleanup", async () => {
  const logger = new Logger({ component: "slice-7-1-live-test" });
  let managed = false;
  let duplicateAttempts = 0;
  const primaryState = {
    status: "connected" as const,
    characterId: "CH_PRIMARY",
    characterName: "Primary",
    serverKey: "SR_EUII",
    message: "Connected.",
  };
  const runtimeState = {
    status: "stopped" as const,
    runId: undefined,
    activeTimers: 0,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 0,
    message: "Stopped.",
  };

  const sessions = {
    state: () => structuredClone(managerState(managed)),
    start: async (characterId: string) => {
      if (managed || characterId === "CH_PRIMARY") {
        duplicateAttempts += 1;
        throw new MultiCharacterSessionManagerError(
          "Already active.",
          "SESSION_CHARACTER_ALREADY_ACTIVE",
        );
      }
      managed = true;
      return structuredClone(managerState(true));
    },
    stop: async (characterId: string) => {
      assert.equal(characterId, "CH_SECONDARY");
      managed = false;
      return structuredClone(managerState(false));
    },
  };

  let clockMs = 1_900_000_000_000;
  const live = new Slice71LiveTestService({
    logger,
    runtime: { state: () => structuredClone(runtimeState) as any },
    primary: { state: () => structuredClone(primaryState) as any },
    selection: {
      state: () => ({
        status: "ready",
        characters: [
          { id: "CH_PRIMARY", name: "Primary", type: "ranger", level: 60, online: false },
          { id: "CH_SECONDARY", name: "Secondary", type: "mage", level: 50, online: false },
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
        message: "Ready.",
      } as any),
    },
    sessions: sessions as any,
    gameData: {
      state: () => ({
        status: "loaded",
        version: 17397,
        message: "Loaded.",
      } as any),
    },
    clock: () => new Date(clockMs++),
    idFactory: () => "live71-test",
  });

  const result = await live.run();

  assert.equal(result.outcome, "passed");
  assert.deepEqual(
    result.steps.map((step) => step.name),
    ["preflight", "parallel-sessions", "isolation-guard", "final-state"],
  );
  assert.equal(duplicateAttempts, 1);
  assert.equal(managed, false);
  assert.equal(
    result.steps.find((step) => step.name === "parallel-sessions")
      ?.evidence.activeSessionCount,
    2,
  );
  assert.equal(
    result.steps.find((step) => step.name === "isolation-guard")
      ?.evidence.duplicateErrorCode,
    "SESSION_CHARACTER_ALREADY_ACTIVE",
  );
  assert.equal(
    result.steps.find((step) => step.name === "final-state")
      ?.evidence.sharedStaticData,
    true,
  );
  assert.equal(
    logger.records().some((record) =>
      record.message === "Slice 7.1 multi-character session live test passed."
    ),
    true,
  );
});

test("Slice 7.1 blocks without touching sessions when a user script is active", async () => {
  const logger = new Logger({ component: "slice-7-1-live-test-busy" });
  let starts = 0;
  const live = new Slice71LiveTestService({
    logger,
    runtime: {
      state: () => ({
        status: "running",
        runId: "script-user",
        scriptName: "user-script",
        activeTimers: 1,
        activeEventListeners: 0,
        logRecords: 1,
        heartbeatSequence: 1,
        message: "Running.",
      } as any),
    },
    primary: {
      state: () => ({
        status: "connected",
        characterId: "CH_PRIMARY",
        characterName: "Primary",
        serverKey: "SR_EUII",
        message: "Connected.",
      } as any),
    },
    selection: { state: () => ({ status: "ready" } as any) },
    sessions: {
      state: () => managerState(false),
      start: async () => {
        starts += 1;
        return managerState(true);
      },
      stop: async () => managerState(false),
    } as any,
    gameData: { state: () => ({ status: "loaded", version: 17397 } as any) },
    idFactory: () => "live71-busy",
  });

  const result = await live.run();

  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(starts, 0);
});

test("Slice 7.1 classifies an unavailable second live session as blocked and keeps the primary untouched", async () => {
  const logger = new Logger({ component: "slice-7-1-live-test-connect-blocked" });
  const primaryState = {
    status: "connected",
    characterId: "CH_PRIMARY",
    characterName: "Primary",
    serverKey: "SR_EUII",
    message: "Connected.",
  } as const;
  const live = new Slice71LiveTestService({
    logger,
    runtime: {
      state: () => ({
        status: "stopped",
        activeTimers: 0,
        activeEventListeners: 0,
        logRecords: 0,
        heartbeatSequence: 0,
        message: "Stopped.",
      } as any),
    },
    primary: { state: () => structuredClone(primaryState) as any },
    selection: {
      state: () => ({
        status: "ready",
        characters: [
          { id: "CH_PRIMARY", name: "Primary", type: "ranger", level: 60, online: false },
          { id: "CH_SECONDARY", name: "Secondary", type: "mage", level: 50, online: false },
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
        message: "Ready.",
      } as any),
    },
    sessions: {
      state: () => managerState(false),
      start: async () => {
        throw new MultiCharacterSessionManagerError(
          "Server rejected the second session.",
          "SESSION_CONNECT_FAILED",
          "limits",
        );
      },
      stop: async () => managerState(false),
    } as any,
    gameData: {
      state: () => ({ status: "loaded", version: 17397, message: "Loaded." } as any),
    },
    idFactory: () => "live71-connect-blocked",
  });

  const result = await live.run();

  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SECONDARY_CONNECT_BLOCKED");
  assert.equal(primaryState.status, "connected");
});
