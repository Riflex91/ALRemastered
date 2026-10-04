import assert from "node:assert/strict";
import { test } from "node:test";
import { SetupWizardService } from "../src/dashboard/setup-wizard.ts";
import { Slice82LiveTestService } from "../src/live-test/slice-8-2.ts";
import { Logger } from "../src/logging/logger.ts";

function createHarness() {
  const logger = new Logger({ component: "slice82-live-test" });
  const primaryState: any = {
    status: "connected",
    characterId: "CH_PRIMARY",
    characterName: "Primary",
    serverKey: "SR_EUII",
    character: { id: "CH_PRIMARY", name: "Primary", type: "merchant", level: 50, hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, map: "main", dead: false },
    message: "Connected.",
  };
  const managed = new Map<string, any>();
  let selectedServerKey = "SR_EUII";
  const selection = {
    state: () => ({
      status: "ready",
      selectedServerKey,
      characters: [
        { id: "CH_PRIMARY", name: "Primary", type: "merchant", level: 50, online: false, map: "main", home: "EUII" },
        { id: "CH_RANGER", name: "Ranger", type: "ranger", level: 40, online: false, map: "main", home: "EUII" },
      ],
      servers: [{ key: "SR_EUII", name: "II", region: "EU", players: 40, address: "x", path: "/ws2/" }],
      message: "Ready.",
    }),
    selectServer: (key: string) => {
      selectedServerKey = key;
      return {} as any;
    },
  };
  const cards: any = {
    state: () => ({
      status: "ready",
      activeSessionCount: 1 + managed.size,
      sessionLimit: 4,
      cards: [
        {
          characterId: "CH_PRIMARY", characterName: "Primary", characterType: "merchant", level: 50,
          accountOnline: false, sessionRole: "primary", connectionStatus: "connected", serverKey: "SR_EUII",
          hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, map: "main", dead: false,
          health: { status: "healthy", message: "Connected." },
          script: { scope: "primary", status: "unloaded", message: "Unloaded." },
          controls: { start: { enabled:false, reason:"Active." }, pause:{enabled:false,reason:"No script."}, stop:{enabled:true,reason:"Stop."} },
        },
        ...[...managed.entries()].map(([id]) => ({
          characterId: id, characterName: "Ranger", characterType: "ranger", level: 40,
          accountOnline: false, sessionRole: "managed", connectionStatus: "connected", serverKey: "SR_EUII",
          hp: 900, maxHp: 1000, mp: 400, maxMp: 500, map: "main", dead: false,
          health: { status: "healthy", message: "Connected." },
          script: { scope: "managed", status: "not-available", message: "Unavailable." },
          controls: { start:{enabled:false,reason:"Active."},pause:{enabled:false,reason:"Primary only."},stop:{enabled:true,reason:"Stop."} },
        })),
      ],
      message: "Ready.",
    }),
    start: async (id: string) => {
      managed.set(id, true);
      return cards.state();
    },
    stop: async (id: string) => {
      managed.delete(id);
      return cards.state();
    },
  };
  const runtimeState: any = {
    status: "unloaded", activeTimers: 0, activeEventListeners: 0,
    logRecords: 0, heartbeatSequence: 0, message: "Unloaded.",
  };
  const wizard = new SetupWizardService({
    logger,
    account: { state: () => ({ status: "connected", userId: "U1", message: "Connected." }) } as any,
    selection: selection as any,
    cards,
    farmer: {
      options: () => ({ status:"ready", message:"Ready.", monsters:["goo"], defaults:{hpThresholdPercent:50,mpThresholdPercent:30,loot:true,respawn:true} }),
      start: async () => ({ status:"running", message:"Running." }),
      stop: async () => ({ status:"stopped", message:"Stopped." }),
    } as any,
    runtime: {
      state: () => structuredClone(runtimeState),
      load: async () => structuredClone(runtimeState),
      start: async () => structuredClone(runtimeState),
      stop: async () => structuredClone(runtimeState),
    } as any,
  });
  const sessions: any = {
    state: () => ({
      status:"ready", sessionLimit:4, activeSessionCount:1+managed.size,
      managedSessionCount:managed.size, availableSlots:3-managed.size, sessions:[], sharedStaticData:{mode:"shared"}, message:"Ready.",
    }),
    characterStates: () => [
      { role:"primary", characterId:"CH_PRIMARY", state:structuredClone(primaryState) },
      ...[...managed.keys()].map((id) => ({ role:"managed", characterId:id, state:{...primaryState,characterId:id,characterName:"Ranger"} })),
    ],
  };
  const service = new Slice82LiveTestService({
    logger,
    account: { state: () => ({ status:"connected", userId:"U1", message:"Connected." }) } as any,
    selection: selection as any,
    primary: { state: () => structuredClone(primaryState) } as any,
    sessions,
    cards,
    wizard,
    userRuntime: { state: () => structuredClone(runtimeState) } as any,
    clock: () => new Date("2026-10-04T08:30:00.000Z"),
    idFactory: () => "live82-test",
  });
  return { service, sessions };
}

test("Slice 8.2 live test verifies the six stages, bounded Start and cleanup", async () => {
  const h = createHarness();
  const result = await h.service.run();
  assert.equal(result.outcome, "passed");
  assert.deepEqual(result.steps.map((step) => step.name), [
    "account", "character", "server", "task-template", "configuration", "start", "final-state",
  ]);
  assert.equal(h.sessions.state().managedSessionCount, 0);
  const final = result.steps.at(-1)?.evidence as any;
  assert.equal(final.userScriptInterrupted, false);
  assert.equal(final.gameplayMutation, false);
  assert.equal(final.rawSocketAccess, false);
});
