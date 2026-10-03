import assert from "node:assert/strict";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { Slice51LiveTestService } from "../src/live-test/slice-5-1.ts";
import { Logger } from "../src/logging/logger.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

test("Slice 5.1 verifies Core, Character, and Script heartbeats without gameplay mutation", async () => {
  const logger = new Logger({ component: "slice-5-1-test" });
  const core = new CoreRuntime({ heartbeatIntervalMs: 25 });
  core.start();
  const script = new ScriptRuntimeService({ logger });
  let characterSequence = 4;
  let characterUpdatedAt = "2026-10-03T18:30:00.000Z";
  let refreshCalls = 0;
  const character = {
    state: () => ({
      status: "connected",
      characterId: "CH_1",
      characterName: "RangerOne",
      serverKey: "SR_EUII",
      heartbeatSequence: characterSequence,
      lastHeartbeatAt: characterUpdatedAt,
      pingMs: 14,
      message: "connected",
    }),
    requestStateRefresh: () => {
      refreshCalls += 1;
      characterSequence += 1;
      characterUpdatedAt = "2026-10-03T18:30:00.100Z";
    },
  };

  try {
    const service = new Slice51LiveTestService({
      logger,
      core,
      character: character as any,
      script,
      idFactory: () => "live51-test",
    });
    const result = await service.run();
    assert.equal(result.outcome, "passed");
    assert.equal(refreshCalls, 1);
    assert.deepEqual(result.steps.map((step) => step.name), [
      "core-heartbeat",
      "character-heartbeat",
      "script-heartbeat",
      "final-cleanup",
    ]);
    assert.equal(script.state().status, "stopped");
    assert.equal(script.state().activeTimers, 0);
    assert.ok(script.state().heartbeatSequence >= 2);
    assert.match(logger.exportText(), /"gameplayMutation":false/);
    assert.match(logger.exportText(), /"recoveryAction":false/);
  } finally {
    await script.dispose();
    core.stop();
  }
});

test("Slice 5.1 blocks before mutation when no character is connected", async () => {
  const logger = new Logger({ component: "slice-5-1-blocked-test" });
  const core = new CoreRuntime({ heartbeatIntervalMs: 25 });
  core.start();
  const script = new ScriptRuntimeService({ logger });
  try {
    const service = new Slice51LiveTestService({
      logger,
      core,
      character: {
        state: () => ({ status: "disconnected", heartbeatSequence: 0, message: "disconnected" }),
        requestStateRefresh: () => { throw new Error("must not refresh"); },
      } as any,
      script,
      idFactory: () => "live51-blocked",
    });
    const result = await service.run();
    assert.equal(result.outcome, "blocked");
    assert.equal(result.error?.code, "LIVE_TEST_CHARACTER_NOT_CONNECTED");
    assert.equal(script.state().status, "unloaded");
  } finally {
    await script.dispose();
    core.stop();
  }
});
