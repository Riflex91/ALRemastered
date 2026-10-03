import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { WatchdogService } from "../src/recovery/watchdog.ts";

test("watchdog restarts stale Core and Character components in place", async () => {
  const logger = new Logger({ component: "watchdog-component-test" });
  let nowMs = Date.parse("2026-10-03T20:00:10.000Z");
  const now = () => new Date(nowMs);

  let coreStatus: "running" | "stopped" = "running";
  let coreHeartbeat = new Date(nowMs - 2_000).toISOString();
  let coreStarts = 0;
  let coreStops = 0;
  const core = {
    health: () => ({
      application: "ALRemastered" as const,
      version: "0.1.0-test",
      platform: process.platform,
      status: coreStatus,
      startedAt: "2026-10-03T20:00:00.000Z",
      heartbeatSequence: 10,
      lastHeartbeatAt: coreHeartbeat,
    }),
    start: () => {
      coreStarts += 1;
      coreStatus = "running";
      coreHeartbeat = now().toISOString();
    },
    stop: () => {
      coreStops += 1;
      coreStatus = "stopped";
    },
  };

  let characterStatus: "connected" | "disconnected" = "connected";
  let characterHeartbeat = new Date(nowMs - 2_000).toISOString();
  const characterStarts: string[] = [];
  let characterStops = 0;
  const character = {
    state: () => ({
      status: characterStatus,
      characterId: "CH_WATCHDOG",
      characterName: "WatchdogRogue",
      serverKey: "SR_EUII",
      lastHeartbeatAt: characterHeartbeat,
      heartbeatSequence: 20,
      message: "test",
    }),
    start: async (characterId: string) => {
      characterStarts.push(characterId);
      characterStatus = "connected";
      characterHeartbeat = now().toISOString();
      return character.state();
    },
    stop: async () => {
      characterStops += 1;
      characterStatus = "disconnected";
      return character.state();
    },
  };

  const script = {
    state: () => ({
      status: "stopped" as const,
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 0,
      message: "stopped",
    }),
    start: async () => script.state(),
    stop: async () => script.state(),
  };

  const watchdog = new WatchdogService({
    logger,
    core: core as any,
    character: character as any,
    script: script as any,
    now,
    checkIntervalMs: 10_000,
    staleAfterMs: { core: 500, character: 500, script: 500 },
  });
  watchdog.start();
  try {
    await watchdog.checkNow();
    const state = watchdog.state();
    assert.equal(coreStops, 1);
    assert.equal(coreStarts, 1);
    assert.equal(characterStops, 1);
    assert.deepEqual(characterStarts, ["CH_WATCHDOG"]);
    assert.equal(state.components.core.restartCount, 1);
    assert.equal(state.components.character.restartCount, 1);
    assert.equal(state.components.core.stale, false);
    assert.equal(state.components.character.stale, false);
    assert.match(logger.exportText(), /Watchdog controlled restart completed/);
  } finally {
    watchdog.stop();
  }
});

test("watchdog restart budget blocks repeated Script stalls instead of looping forever", async () => {
  const logger = new Logger({ component: "watchdog-budget-test" });
  let nowMs = Date.parse("2026-10-03T20:10:00.000Z");
  const now = () => new Date(nowMs);
  const core = {
    health: () => ({
      application: "ALRemastered" as const,
      version: "0.1.0-test",
      platform: process.platform,
      status: "stopped" as const,
      startedAt: now().toISOString(),
      heartbeatSequence: 0,
    }),
    start: () => undefined,
    stop: () => undefined,
  };
  const character = {
    state: () => ({ status: "disconnected" as const, message: "disconnected" }),
    start: async () => ({ status: "disconnected" as const, message: "disconnected" }),
    stop: async () => ({ status: "disconnected" as const, message: "disconnected" }),
  };

  let heartbeatAt = new Date(nowMs - 2_000).toISOString();
  let runNumber = 1;
  let scriptStarts = 0;
  let scriptStops = 0;
  const script = {
    state: () => ({
      status: "running" as const,
      scriptName: "watchdog-probe",
      runId: `run-${runNumber}`,
      startedAt: now().toISOString(),
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: runNumber,
      lastHeartbeatAt: heartbeatAt,
      message: "running",
    }),
    start: async () => {
      scriptStarts += 1;
      runNumber += 1;
      heartbeatAt = now().toISOString();
      return script.state();
    },
    stop: async () => {
      scriptStops += 1;
      return {
        ...script.state(),
        status: "stopped" as const,
      };
    },
  };

  const watchdog = new WatchdogService({
    logger,
    core: core as any,
    character: character as any,
    script: script as any,
    now,
    checkIntervalMs: 10_000,
    staleAfterMs: { script: 500 },
    maxRestartsPerWindow: 2,
    restartWindowMs: 30_000,
  });
  watchdog.start();
  try {
    await watchdog.checkNow();
    assert.equal(scriptStarts, 1);

    nowMs += 1_000;
    await watchdog.checkNow();
    assert.equal(scriptStarts, 2);

    nowMs += 1_000;
    await watchdog.checkNow();
    const blocked = watchdog.state();
    assert.equal(blocked.components.script.blocked, true);
    assert.equal(blocked.components.script.restartCount, 2);
    assert.equal(blocked.components.script.budgetUsed, 2);

    nowMs += 1_000;
    await watchdog.checkNow();
    assert.equal(scriptStarts, 2);
    assert.equal(scriptStops, 2);
    assert.match(logger.exportText(), /Watchdog restart budget exhausted/);
    assert.match(logger.exportText(), /"noRestartLoop":true/);

    watchdog.resetBudget("script");
    assert.equal(watchdog.state().components.script.blocked, false);
    assert.equal(watchdog.state().components.script.budgetUsed, 0);
  } finally {
    watchdog.stop();
  }
});
