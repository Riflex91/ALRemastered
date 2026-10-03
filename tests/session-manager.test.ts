import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADVENTURE_LAND_MAX_CONCURRENT_CHARACTERS,
  MultiCharacterSessionManager,
  MultiCharacterSessionManagerError,
} from "../src/character/session-manager.ts";
import { Logger } from "../src/logging/logger.ts";

function connectedState(characterId: string, name: string, serverKey = "SR_EUII") {
  return {
    status: "connected" as const,
    characterId,
    characterName: name,
    serverKey,
    serverRegion: "EU",
    serverName: "II",
    connectedAt: "2026-10-04T00:00:00.000Z",
    heartbeatSequence: 1,
    lastHeartbeatAt: "2026-10-04T00:00:00.000Z",
    message: name + " is connected.",
  };
}

function selectionState() {
  return {
    status: "ready" as const,
    characters: [
      { id: "CH_PRIMARY", name: "Primary", type: "ranger", level: 60, online: false },
      { id: "CH_TWO", name: "Two", type: "mage", level: 50, online: false },
      { id: "CH_THREE", name: "Three", type: "priest", level: 50, online: false },
      { id: "CH_FOUR", name: "Four", type: "merchant", level: 50, online: false },
      { id: "CH_FIVE", name: "Five", type: "warrior", level: 50, online: false },
      { id: "CH_EXTERNAL", name: "External", type: "rogue", level: 50, online: true },
      { id: "CH_FAIL", name: "Fail", type: "paladin", level: 50, online: false },
    ],
    servers: [
      {
        key: "SR_EUII",
        name: "II",
        region: "EU",
        players: 100,
        address: "eu2.example.test",
        path: "/socket.io/",
      },
    ],
    selectedServerKey: "SR_EUII",
    loadedAt: "2026-10-04T00:00:00.000Z",
    message: "Ready.",
  };
}

function fakeSession(
  characterId: string,
  name: string,
  options: { fail?: boolean } = {},
) {
  let state: any = {
    status: "disconnected",
    message: "Disconnected.",
  };
  let stopCalls = 0;
  return {
    service: {
      state: () => structuredClone(state),
      start: async () => {
        state = options.fail
          ? {
            status: "error",
            characterId,
            characterName: name,
            serverKey: "SR_EUII",
            message: "Synthetic isolated connection failure.",
            errorCode: "synthetic_failure",
          }
          : connectedState(characterId, name);
        return structuredClone(state);
      },
      stop: async () => {
        stopCalls += 1;
        state = { status: "disconnected", message: "Disconnected." };
        return structuredClone(state);
      },
    },
    stopCalls: () => stopCalls,
  };
}

test("multi-character manager counts the primary session, shares static data, and manages an additional Character independently", async () => {
  const logger = new Logger({ component: "session-manager-test" });
  const created = new Map<string, ReturnType<typeof fakeSession>>();
  const manager = new MultiCharacterSessionManager({
    logger,
    primary: { state: () => connectedState("CH_PRIMARY", "Primary") as any },
    selection: { state: () => selectionState() as any },
    createSession: () => {
      const session = fakeSession("CH_TWO", "Two");
      created.set("CH_TWO", session);
      return session.service as any;
    },
    sharedGameDataVersion: () => 17397,
  });

  const initial = manager.state();
  assert.equal(initial.sessionLimit, ADVENTURE_LAND_MAX_CONCURRENT_CHARACTERS);
  assert.equal(initial.activeSessionCount, 1);
  assert.equal(initial.availableSlots, 3);
  assert.equal(initial.sharedStaticData.mode, "shared");
  assert.equal(initial.sharedStaticData.gameDataVersion, 17397);

  const started = await manager.start("CH_TWO");
  assert.equal(started.activeSessionCount, 2);
  assert.equal(started.managedSessionCount, 1);
  assert.equal(started.availableSlots, 2);
  assert.deepEqual(
    started.sessions.map((session) => [session.role, session.characterId]),
    [["primary", "CH_PRIMARY"], ["managed", "CH_TWO"]],
  );

  const stopped = await manager.stop("CH_TWO", "test");
  assert.equal(stopped.activeSessionCount, 1);
  assert.equal(stopped.managedSessionCount, 0);
  assert.equal(created.get("CH_TWO")?.stopCalls(), 1);
  assert.match(logger.exportText(), /sharedStaticData/);
});

test("multi-character manager blocks duplicate, externally online, and over-limit Character sessions", async () => {
  const logger = new Logger({ component: "session-manager-limit-test" });
  const names: Record<string, string> = {
    CH_TWO: "Two",
    CH_THREE: "Three",
    CH_FOUR: "Four",
    CH_FIVE: "Five",
  };
  const manager = new MultiCharacterSessionManager({
    logger,
    primary: { state: () => connectedState("CH_PRIMARY", "Primary") as any },
    selection: { state: () => selectionState() as any },
    createSession: () => {
      let requestedId = "";
      return {
        state: () => requestedId
          ? connectedState(requestedId, names[requestedId] ?? requestedId) as any
          : ({ status: "disconnected", message: "Disconnected." } as any),
        start: async (characterId: string) => {
          requestedId = characterId;
          return connectedState(characterId, names[characterId] ?? characterId) as any;
        },
        stop: async () => ({ status: "disconnected", message: "Disconnected." } as any),
      };
    },
  });

  await assert.rejects(
    () => manager.start("CH_PRIMARY"),
    (error: unknown) =>
      error instanceof MultiCharacterSessionManagerError &&
      error.code === "SESSION_CHARACTER_ALREADY_ACTIVE",
  );
  await assert.rejects(
    () => manager.start("CH_EXTERNAL"),
    (error: unknown) =>
      error instanceof MultiCharacterSessionManagerError &&
      error.code === "SESSION_CHARACTER_ALREADY_ONLINE",
  );

  await manager.start("CH_TWO");
  await manager.start("CH_THREE");
  await manager.start("CH_FOUR");
  assert.equal(manager.state().activeSessionCount, 4);
  assert.equal(manager.state().availableSlots, 0);

  await assert.rejects(
    () => manager.start("CH_FIVE"),
    (error: unknown) =>
      error instanceof MultiCharacterSessionManagerError &&
      error.code === "SESSION_LIMIT_REACHED",
  );
});

test("a managed Character connection failure is isolated from the primary and other managed sessions", async () => {
  const logger = new Logger({ component: "session-manager-isolation-test" });
  const primary = connectedState("CH_PRIMARY", "Primary");
  const sessions = new Map<string, ReturnType<typeof fakeSession>>();
  const manager = new MultiCharacterSessionManager({
    logger,
    primary: { state: () => structuredClone(primary) as any },
    selection: { state: () => selectionState() as any },
    createSession: () => {
      const pendingId = sessions.has("CH_TWO") ? "CH_FAIL" : "CH_TWO";
      const session = fakeSession(
        pendingId,
        pendingId === "CH_TWO" ? "Two" : "Fail",
        { fail: pendingId === "CH_FAIL" },
      );
      sessions.set(pendingId, session);
      return session.service as any;
    },
  });

  await manager.start("CH_TWO");
  await assert.rejects(
    () => manager.start("CH_FAIL"),
    (error: unknown) =>
      error instanceof MultiCharacterSessionManagerError &&
      error.code === "SESSION_CONNECT_FAILED" &&
      error.causeCode === "synthetic_failure",
  );

  const state = manager.state();
  assert.equal(state.activeSessionCount, 2);
  assert.equal(state.managedSessionCount, 1);
  assert.equal(state.sessions.some((session) => session.characterId === "CH_TWO"), true);
  assert.equal(state.sessions.some((session) => session.characterId === "CH_FAIL"), false);
  assert.equal(state.sessions[0]?.characterId, "CH_PRIMARY");
  assert.equal(state.lastError?.code, "SESSION_CONNECT_FAILED");
  assert.equal(state.lastError?.causeCode, "synthetic_failure");
  assert.match(logger.exportText(), /failed independently/);
});


test("multi-character manager releases a reserved slot when session start throws synchronously", async () => {
  const logger = new Logger({ component: "session-manager-sync-failure-test" });
  const manager = new MultiCharacterSessionManager({
    logger,
    primary: { state: () => connectedState("CH_PRIMARY", "Primary") as any },
    selection: { state: () => selectionState() as any },
    createSession: () => ({
      state: () => ({ status: "disconnected", message: "Disconnected." } as any),
      start: () => {
        const error = new Error("Synthetic synchronous start failure.") as Error & { code: string };
        error.code = "synthetic_sync_failure";
        throw error;
      },
      stop: async () => ({ status: "disconnected", message: "Disconnected." } as any),
    }) as any,
  });

  await assert.rejects(
    () => manager.start("CH_TWO"),
    (error: unknown) =>
      error instanceof MultiCharacterSessionManagerError &&
      error.code === "SESSION_CONNECT_FAILED" &&
      error.causeCode === "synthetic_sync_failure",
  );

  const state = manager.state();
  assert.equal(state.activeSessionCount, 1);
  assert.equal(state.managedSessionCount, 0);
  assert.equal(state.availableSlots, 3);
  assert.equal(state.lastError?.causeCode, "synthetic_sync_failure");
});
