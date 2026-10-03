import assert from "node:assert/strict";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { Slice54LiveTestService } from "../src/live-test/slice-5-4.ts";
import { Logger } from "../src/logging/logger.ts";
import { WatchdogService } from "../src/recovery/watchdog.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

test("Slice 5.4 verifies stall restart budget and restart-loop protection", async () => {
  const logger = new Logger({ component: "slice-5-4-live-test" });
  const core = new CoreRuntime({ heartbeatIntervalMs: 25 });
  core.start();

  let connected = true;
  const character = {
    state: () => ({
      status: connected ? "connected" as const : "disconnected" as const,
      characterId: "CH_WATCHDOG_LIVE",
      characterName: "WatchdogRogue",
      serverKey: "SR_EUII",
      heartbeatSequence: 10,
      lastHeartbeatAt: new Date().toISOString(),
      message: connected ? "connected" : "disconnected",
    }),
    start: async () => {
      connected = true;
      return character.state();
    },
    stop: async () => {
      connected = false;
      return character.state();
    },
  };

  const runtime = new ScriptRuntimeService({
    logger,
    idFactory: (() => {
      let next = 0;
      return () => `slice54-run-${++next}`;
    })(),
  });
  const watchdog = new WatchdogService({
    logger,
    core,
    character: character as any,
    script: runtime,
    checkIntervalMs: 100,
    staleAfterMs: {
      core: 5_000,
      character: 5_000,
      script: 500,
    },
    maxRestartsPerWindow: 2,
    restartWindowMs: 30_000,
  });
  watchdog.start();
  const liveTest = new Slice54LiveTestService({
    logger,
    watchdog,
    character: character as any,
    script: runtime,
    idFactory: () => "live54-test",
  });

  try {
    const result = await liveTest.run();
    assert.equal(result.outcome, "passed");
    assert.deepEqual(result.steps.map((step) => step.name), [
      "healthy-heartbeat",
      "controlled-restart",
      "restart-budget",
      "no-restart-loop",
      "final-cleanup",
    ]);
    const restart = result.steps.find((step) => step.name === "controlled-restart");
    assert.notEqual(restart?.evidence.runIdBefore, restart?.evidence.runIdAfter);
    const budget = result.steps.find((step) => step.name === "restart-budget");
    assert.equal(budget?.evidence.budgetUsed, 2);
    assert.equal(budget?.evidence.budgetLimit, 2);
    assert.equal(budget?.evidence.blocked, true);
    const loopGuard = result.steps.find((step) => step.name === "no-restart-loop");
    assert.equal(
      loopGuard?.evidence.restartCountBeforeGuard,
      loopGuard?.evidence.restartCountAfterGuard,
    );
    assert.equal(runtime.state().status, "stopped");
    assert.equal(runtime.state().activeTimers, 0);
    assert.equal(runtime.state().activeEventListeners, 0);
    const finalWatchdog = watchdog.state();
    assert.equal(finalWatchdog.components.script.blocked, false);
    assert.equal(finalWatchdog.components.script.budgetUsed, 0);
    assert.ok(finalWatchdog.components.script.restartCount >= 2);
    assert.match(logger.exportText(), /Watchdog restart budget exhausted/);
    assert.match(logger.exportText(), /Slice 5\.4 watchdog\/restart-guard test passed/);
    assert.match(logger.exportText(), /"gameplayMutation":false/);
  } finally {
    runtime.setHeartbeatSuppressedForTest(false);
    await runtime.dispose();
    watchdog.stop();
    core.stop();
  }
});
