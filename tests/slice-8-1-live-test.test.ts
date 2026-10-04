import assert from "node:assert/strict";
import { test } from "node:test";
import { CharacterCardsService } from "../src/dashboard/character-cards.ts";
import { Slice81LiveTestService } from "../src/live-test/slice-8-1.ts";
import { Logger } from "../src/logging/logger.ts";

function connected(id: string, name: string, type: string) {
  return {
    status: "connected" as const,
    characterId: id,
    characterName: name,
    serverKey: "SR_EUII",
    character: {
      id,
      name,
      type,
      level: 50,
      hp: 900,
      maxHp: 1000,
      mp: 450,
      maxMp: 500,
      map: "main",
      target: "goo-1",
      dead: false,
    },
    message: "Connected.",
  };
}

function createHarness(userStatus: "unloaded" | "running" = "unloaded") {
  const logger = new Logger({ component: "slice81-live-test" });
  const primaryState = connected("CH_PRIMARY", "Primary", "merchant");
  const managed = new Map<string, any>();
  const selection = {
    state: () => ({
      status: "ready" as const,
      selectedServerKey: "SR_EUII",
      characters: [
        { id: "CH_PRIMARY", name: "Primary", type: "merchant", level: 50, online: false, map: "main", home: "EUII" },
        { id: "CH_RANGER", name: "Ranger", type: "ranger", level: 40, online: false, map: "main", home: "EUII" },
      ],
      servers: [],
      message: "Ready.",
    }),
  };
  const primary = {
    state: () => structuredClone(primaryState),
    start: async () => structuredClone(primaryState),
    stop: async () => structuredClone(primaryState),
  };
  const sessions = {
    state: () => ({
      status: "ready" as const,
      sessionLimit: 4,
      activeSessionCount: 1 + managed.size,
      managedSessionCount: managed.size,
      availableSlots: 3 - managed.size,
      sessions: [],
      sharedStaticData: { mode: "shared" as const },
      message: "Ready.",
    }),
    characterStates: () => [
      { role: "primary" as const, characterId: "CH_PRIMARY", state: structuredClone(primaryState) },
      ...[...managed.entries()].map(([id, state]) => ({
        role: "managed" as const,
        characterId: id,
        state: structuredClone(state),
      })),
    ],
    start: async (id: string) => {
      managed.set(id, connected(id, "Ranger", "ranger"));
      return sessions.state();
    },
    stop: async (id: string) => {
      managed.delete(id);
      return sessions.state();
    },
  };
  const userRuntimeState = {
    status: userStatus,
    scriptName: userStatus === "running" ? "user-script" : undefined,
    activeTimers: userStatus === "running" ? 1 : 0,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 0,
    message: "User runtime.",
  };
  const actualCards = new CharacterCardsService({
    logger,
    selection: selection as any,
    primary: primary as any,
    sessions: sessions as any,
    runtime: {
      state: () => structuredClone(userRuntimeState),
      pause: async () => structuredClone(userRuntimeState),
      stop: async () => structuredClone(userRuntimeState),
    } as any,
  });

  const createProbeRuntime = () => {
    let state: any = {
      status: "unloaded",
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 0,
      message: "Unloaded.",
    };
    return {
      state: () => structuredClone(state),
      load: async ({ name }: any) => {
        state = { ...state, status: "loaded", scriptName: name, message: "Loaded." };
        return structuredClone(state);
      },
      start: async () => {
        state = { ...state, status: "running", activeTimers: 1, message: "Running." };
        return structuredClone(state);
      },
      pause: async () => {
        state = { ...state, status: "paused", activeTimers: 0, message: "Paused." };
        return structuredClone(state);
      },
      stop: async () => {
        state = { ...state, status: "stopped", activeTimers: 0, message: "Stopped." };
        return structuredClone(state);
      },
      dispose: async () => undefined,
    };
  };

  const service = new Slice81LiveTestService({
    logger,
    userRuntime: { state: () => structuredClone(userRuntimeState) } as any,
    createProbeRuntime: createProbeRuntime as any,
    cards: actualCards,
    primary: primary as any,
    selection: selection as any,
    sessions: sessions as any,
    clock: () => new Date("2026-10-04T08:00:00.000Z"),
    idFactory: () => "live81-test",
  });
  return { service, sessions, logger };
}

test("Slice 8.1 live test verifies telemetry, managed Start/Stop, isolated Pause and cleanup", async () => {
  const h = createHarness();
  const result = await h.service.run();
  assert.equal(result.outcome, "passed");
  assert.deepEqual(result.steps.map((item) => item.name), [
    "preflight",
    "managed-start",
    "primary-pause",
    "managed-stop",
    "final-state",
  ]);
  assert.equal(h.sessions.state().managedSessionCount, 0);
  const final = result.steps.find((item) => item.name === "final-state")?.evidence as any;
  assert.equal(final.userScriptInterrupted, false);
  assert.equal(final.gameplayMutation, false);
  assert.equal(final.rawSocketAccess, false);
  assert.match(h.logger.exportText(), /Slice 8\.1 Character Cards live test passed/);
});

test("Slice 8.1 blocks instead of interrupting a running user Script", async () => {
  const h = createHarness("running");
  const result = await h.service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(h.sessions.state().managedSessionCount, 0);
});
