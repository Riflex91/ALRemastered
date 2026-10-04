import assert from "node:assert/strict";
import { test } from "node:test";
import { CharacterCardsService } from "../src/dashboard/character-cards.ts";
import { Logger } from "../src/logging/logger.ts";

function connected(id: string, name: string, type = "merchant") {
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

function createHarness(primaryConnected = true) {
  const logger = new Logger({ component: "character-cards-test" });
  let primaryState: any = primaryConnected
    ? connected("CH_PRIMARY", "Primary")
    : { status: "disconnected", message: "Disconnected." };
  const managed = new Map<string, any>();
  let runtimeState: any = {
    status: "running",
    scriptName: "farmer",
    activeTimers: 1,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 1,
    message: "Running.",
  };
  const starts: string[] = [];
  const stops: string[] = [];
  let pauses = 0;

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
    start: async (id: string) => {
      starts.push(`primary:${id}`);
      primaryState = connected(id, id === "CH_PRIMARY" ? "Primary" : "Ranger", id === "CH_PRIMARY" ? "merchant" : "ranger");
      return structuredClone(primaryState);
    },
    stop: async () => {
      stops.push("primary");
      primaryState = { status: "disconnected", message: "Disconnected." };
      return structuredClone(primaryState);
    },
  };
  const sessions = {
    state: () => ({
      status: "ready" as const,
      sessionLimit: 4,
      activeSessionCount: (primaryState.status === "connected" ? 1 : 0) + managed.size,
      managedSessionCount: managed.size,
      availableSlots: 4 - (primaryState.status === "connected" ? 1 : 0) - managed.size,
      sessions: [],
      sharedStaticData: { mode: "shared" as const },
      message: "Ready.",
    }),
    characterStates: () => [
      ...(primaryState.characterId ? [{
        role: "primary" as const,
        characterId: primaryState.characterId,
        state: structuredClone(primaryState),
      }] : []),
      ...[...managed.entries()].map(([id, state]) => ({
        role: "managed" as const,
        characterId: id,
        state: structuredClone(state),
      })),
    ],
    start: async (id: string) => {
      starts.push(`managed:${id}`);
      managed.set(id, connected(id, "Ranger", "ranger"));
      return sessions.state();
    },
    stop: async (id: string) => {
      stops.push(`managed:${id}`);
      managed.delete(id);
      return sessions.state();
    },
  };
  const runtime = {
    state: () => structuredClone(runtimeState),
    pause: async () => {
      pauses += 1;
      runtimeState = { ...runtimeState, status: "paused", activeTimers: 0, message: "Paused." };
      return structuredClone(runtimeState);
    },
    stop: async () => {
      runtimeState = { ...runtimeState, status: "stopped", activeTimers: 0, message: "Stopped." };
      return structuredClone(runtimeState);
    },
  };
  const service = new CharacterCardsService({
    logger,
    selection: selection as any,
    primary: primary as any,
    sessions: sessions as any,
    runtime: runtime as any,
  });
  return { service, starts, stops, getPauses: () => pauses, runtime, sessions };
}

test("Character Cards expose Start/Pause/Stop, HP/MP, Map, Target, Script and Health", async () => {
  const h = createHarness(true);
  const state = h.service.state();
  const primary = state.cards.find((card) => card.characterId === "CH_PRIMARY");
  const ranger = state.cards.find((card) => card.characterId === "CH_RANGER");

  assert.equal(primary?.sessionRole, "primary");
  assert.equal(primary?.hp, 900);
  assert.equal(primary?.maxHp, 1000);
  assert.equal(primary?.mp, 450);
  assert.equal(primary?.maxMp, 500);
  assert.equal(primary?.map, "main");
  assert.equal(primary?.target, "goo-1");
  assert.equal(primary?.script.name, "farmer");
  assert.equal(primary?.script.status, "running");
  assert.equal(primary?.health.status, "healthy");
  assert.equal(primary?.controls.pause.enabled, true);
  assert.equal(primary?.controls.stop.enabled, true);

  assert.equal(ranger?.connectionStatus, "offline");
  assert.equal(ranger?.health.status, "offline");
  assert.equal(ranger?.controls.start.enabled, true);
  assert.equal(ranger?.controls.pause.enabled, false);

  await h.service.pause("CH_PRIMARY");
  assert.equal(h.getPauses(), 1);
  assert.equal(h.service.state().cards.find((card) => card.characterId === "CH_PRIMARY")?.script.status, "paused");
});

test("Character Card Start uses primary when none exists and managed otherwise", async () => {
  const primaryHarness = createHarness(false);
  await primaryHarness.service.start("CH_RANGER");
  assert.deepEqual(primaryHarness.starts, ["primary:CH_RANGER"]);

  const managedHarness = createHarness(true);
  await managedHarness.service.start("CH_RANGER");
  assert.deepEqual(managedHarness.starts, ["managed:CH_RANGER"]);
  const card = managedHarness.service.state().cards.find((item) => item.characterId === "CH_RANGER");
  assert.equal(card?.sessionRole, "managed");
  assert.equal(card?.script.status, "not-available");

  await managedHarness.service.stop("CH_RANGER");
  assert.deepEqual(managedHarness.stops, ["managed:CH_RANGER"]);
  assert.equal(managedHarness.service.state().cards.find((item) => item.characterId === "CH_RANGER")?.connectionStatus, "offline");
});
