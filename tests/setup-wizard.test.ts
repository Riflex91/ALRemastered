import assert from "node:assert/strict";
import { test } from "node:test";
import { SetupWizardService } from "../src/dashboard/setup-wizard.ts";
import { Logger } from "../src/logging/logger.ts";

function connectedCard(id = "CH_PRIMARY", role: "primary" | "managed" = "primary") {
  return {
    characterId: id,
    characterName: id === "CH_PRIMARY" ? "Primary" : "Ranger",
    characterType: id === "CH_PRIMARY" ? "merchant" : "ranger",
    level: 50,
    accountOnline: false,
    sessionRole: role,
    connectionStatus: "connected",
    serverKey: "SR_EUII",
    hp: 1000,
    maxHp: 1000,
    mp: 500,
    maxMp: 500,
    map: "main",
    target: undefined,
    dead: false,
    health: { status: "healthy", message: "Connected." },
    script: { scope: role === "primary" ? "primary" : "managed", status: role === "primary" ? "unloaded" : "not-available", message: "Ready." },
    controls: {
      start: { enabled: false, reason: "Active." },
      pause: { enabled: false, reason: "Not running." },
      stop: { enabled: true, reason: "Stop." },
    },
  } as any;
}

function harness(primaryActive = false) {
  const logger = new Logger({ component: "setup-wizard-test" });
  let selectedServerKey: string | undefined;
  const cards = new Map<string, any>();
  if (primaryActive) cards.set("CH_PRIMARY", connectedCard());
  const runtimeCalls: string[] = [];
  const farmerCalls: any[] = [];
  let runtimeState: any = {
    status: "unloaded",
    activeTimers: 0,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 0,
    message: "Unloaded.",
  };
  const service = new SetupWizardService({
    logger,
    account: {
      state: () => ({ status: "connected", userId: "U1", message: "Connected." }),
    } as any,
    selection: {
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
    } as any,
    cards: {
      state: () => ({
        status: "ready",
        activeSessionCount: cards.size,
        sessionLimit: 4,
        cards: [...cards.values()],
        message: "Ready.",
      }),
      start: async (id: string) => {
        const role = cards.has("CH_PRIMARY") ? "managed" : "primary";
        cards.set(id, connectedCard(id, role));
        return {
          status: "ready",
          activeSessionCount: cards.size,
          sessionLimit: 4,
          cards: [...cards.values()],
          message: "Ready.",
        };
      },
      stop: async (id: string) => {
        cards.delete(id);
        return {} as any;
      },
    } as any,
    farmer: {
      options: () => ({
        status: "ready",
        message: "Ready.",
        monsters: ["goo", "bee"],
        defaults: { hpThresholdPercent: 50, mpThresholdPercent: 30, loot: true, respawn: true },
      }),
      start: async (config: any) => {
        farmerCalls.push(config);
        return { status: "running", message: "Running." };
      },
      stop: async () => ({ status: "stopped", message: "Stopped." }),
    } as any,
    runtime: {
      state: () => structuredClone(runtimeState),
      load: async ({ name }: any) => {
        runtimeCalls.push(`load:${name}`);
        runtimeState = { ...runtimeState, status: "loaded", scriptName: name };
        return structuredClone(runtimeState);
      },
      start: async () => {
        runtimeCalls.push("start");
        runtimeState = { ...runtimeState, status: "running" };
        return structuredClone(runtimeState);
      },
      stop: async () => {
        runtimeCalls.push("stop");
        runtimeState = { ...runtimeState, status: "stopped" };
        return structuredClone(runtimeState);
      },
    } as any,
  });
  return { service, cards, runtimeCalls, farmerCalls };
}

test("Setup Wizard exposes the required six English stages and supported existing tasks", () => {
  const h = harness();
  const state = h.service.state();
  assert.equal(state.status, "ready");
  assert.deepEqual(state.steps.map((step) => step.label), [
    "Account", "Character", "Server", "Task / Template", "Configuration", "Start",
  ]);
  assert.deepEqual(state.taskTemplates.map((task) => task.id), [
    "connect-only", "simple-farmer", "custom-script",
  ]);
});

test("Connect only starts a Character session without starting a task", async () => {
  const h = harness(true);
  const result = await h.service.start({
    characterId: "CH_RANGER",
    serverKey: "SR_EUII",
    taskTemplateId: "connect-only",
  });
  assert.equal(result.sessionRole, "managed");
  assert.equal(result.startedSession, true);
  assert.equal(result.taskStarted, false);
  assert.equal(h.cards.has("CH_RANGER"), true);
});

test("Simple Farmer reuses existing template configuration and primary runtime only", async () => {
  const h = harness(false);
  const result = await h.service.start({
    characterId: "CH_PRIMARY",
    serverKey: "SR_EUII",
    taskTemplateId: "simple-farmer",
    configuration: { monster: "", hpThresholdPercent: 45, mpThresholdPercent: 25, loot: true, respawn: false },
  });
  assert.equal(result.sessionRole, "primary");
  assert.equal(result.taskStarted, true);
  assert.deepEqual(h.farmerCalls, [{
    monster: "goo",
    hpThresholdPercent: 45,
    mpThresholdPercent: 25,
    loot: true,
    respawn: false,
  }]);
});

test("Custom Script loads and starts the existing isolated primary runtime", async () => {
  const h = harness(false);
  const result = await h.service.start({
    characterId: "CH_PRIMARY",
    serverKey: "SR_EUII",
    taskTemplateId: "custom-script",
    configuration: { scriptName: "wizard-script", scriptSource: "console.info('wizard');" },
  });
  assert.equal(result.taskStarted, true);
  assert.deepEqual(h.runtimeCalls, ["load:wizard-script", "start"]);
});

test("Wizard rolls back a session it started when primary-only automation is selected for a managed Character", async () => {
  const h = harness(true);
  await assert.rejects(
    h.service.start({
      characterId: "CH_RANGER",
      serverKey: "SR_EUII",
      taskTemplateId: "simple-farmer",
      configuration: {},
    }),
    /primary session/,
  );
  assert.equal(h.cards.has("CH_RANGER"), false);
});
