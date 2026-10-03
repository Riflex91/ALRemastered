import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalCharacterMessagingService } from "../src/character/messaging.ts";
import { Slice72LiveTestService } from "../src/live-test/slice-7-2.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandScriptApiBridge } from "../src/script/adventure-api.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

function connectedPrimaryState() {
  return {
    status: "connected" as const,
    characterId: "CH_PRIMARY",
    characterName: "Primary",
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
    character: {
      id: "CH_PRIMARY",
      name: "Primary",
      type: "merchant",
      level: 60,
      map: "main",
      x: 0,
      y: 0,
      hp: 100,
      maxHp: 100,
      mp: 100,
      maxMp: 100,
      dead: false,
      inventory: [],
      equipment: {},
      conditions: {},
      range: 30,
    },
    entities: [],
    lootChests: [],
    message: "Connected.",
  };
}

function managerState(managed: boolean) {
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
    sharedStaticData: { mode: "shared" as const, gameDataVersion: 17397 },
    message: "Ready.",
  };
}

test("Slice 7.2 proves real worker send_cm plus character.on cm over the local messaging bus", async () => {
  const logger = new Logger({ component: "slice72-live-test" });
  let managed = false;
  const sessions = {
    state: () => structuredClone(managerState(managed)),
    start: async (characterId: string) => {
      assert.equal(characterId, "CH_SECONDARY");
      managed = true;
      return structuredClone(managerState(true));
    },
    stop: async (characterId: string) => {
      assert.equal(characterId, "CH_SECONDARY");
      managed = false;
      return structuredClone(managerState(false));
    },
  };
  const messaging = new LocalCharacterMessagingService({
    logger,
    sessions: sessions as any,
  });
  const primary = {
    state: () => structuredClone(connectedPrimaryState()) as any,
    attackCooldownRemainingMs: () => 0,
    onGameEvent: () => () => undefined,
  };
  const api = new AdventureLandScriptApiBridge({
    character: primary as any,
    movement: { runScript: async () => { throw new Error("movement not expected"); } } as any,
    attack: { run: async () => { throw new Error("attack not expected"); } } as any,
    messaging,
    gameData: () => ({ version: 17397 } as any),
  });

  const live = new Slice72LiveTestService({
    logger,
    userRuntime: {
      state: () => ({
        status: "unloaded",
        activeTimers: 0,
        activeEventListeners: 0,
        logRecords: 0,
        heartbeatSequence: 0,
        message: "No script loaded.",
      }),
    },
    createProbeRuntime: () => new ScriptRuntimeService({
      logger,
      api,
      apiStateIntervalMs: 50,
    }),
    primary: primary as any,
    selection: {
      state: () => ({
        status: "ready",
        characters: [
          { id: "CH_PRIMARY", name: "Primary", type: "merchant", level: 60, online: false },
          { id: "CH_SECONDARY", name: "Secondary", type: "ranger", level: 60, online: false },
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
    messaging,
    idFactory: () => "live72-test",
  });

  const result = await live.run();

  assert.equal(result.outcome, "passed");
  assert.deepEqual(
    result.steps.map((step) => step.name),
    ["preflight", "local-send", "compatible-receive", "final-state"],
  );
  assert.equal(managed, false);
  assert.equal(messaging.state().requestCount, 2);
  assert.equal(messaging.state().localDeliveryCount, 2);
  assert.equal(messaging.state().unavailableRecipientCount, 1);
  assert.equal(
    result.steps.find((step) => step.name === "compatible-receive")
      ?.evidence.characterOnCm,
    true,
  );
  assert.equal(
    result.steps.find((step) => step.name === "final-state")
      ?.evidence.gameplayMutation,
    false,
  );
});

test("Slice 7.2 blocks without creating a managed session when the user Script runtime is active", async () => {
  const logger = new Logger({ component: "slice72-live-test-busy" });
  let starts = 0;
  const sessions = {
    state: () => managerState(false),
    start: async () => {
      starts += 1;
      return managerState(true);
    },
    stop: async () => managerState(false),
  };
  const messaging = new LocalCharacterMessagingService({
    logger,
    sessions: sessions as any,
  });

  const live = new Slice72LiveTestService({
    logger,
    userRuntime: {
      state: () => ({
        status: "running",
        scriptName: "user-script",
        runId: "script-user",
        activeTimers: 1,
        activeEventListeners: 0,
        logRecords: 0,
        heartbeatSequence: 1,
        message: "Running.",
      } as any),
    },
    createProbeRuntime: () => {
      throw new Error("Probe runtime must not be created.");
    },
    primary: { state: () => connectedPrimaryState() as any },
    selection: { state: () => ({ status: "ready" } as any) },
    sessions: sessions as any,
    messaging,
    idFactory: () => "live72-busy",
  });

  const result = await live.run();

  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(starts, 0);
  assert.equal(messaging.state().requestCount, 0);
});
