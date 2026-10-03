import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";
import { Slice41LiveTestService } from "../src/live-test/slice-4-1.ts";

test("isolated script runtime loads, starts, pauses and stops with timer cleanup", async () => {
  const logger = new Logger({ component: "script-runtime-test" });
  const runtime = new ScriptRuntimeService({
    logger,
    idFactory: () => "script-run-1",
  });
  try {
    const loaded = await runtime.load({
      name: "timer-test",
      source: [
        'console.info("boot");',
        'setInterval(() => console.info("tick"), 25);',
      ].join("\n"),
    });
    assert.equal(loaded.status, "loaded");

    const running = await runtime.start();
    assert.equal(running.status, "running");
    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(runtime.state().activeTimers, 1);
    assert.equal(
      logger.records().some((record) =>
        record.component === "script:timer-test" &&
        record.message === "tick"
      ),
      true,
    );

    const paused = await runtime.pause();
    assert.equal(paused.status, "paused");
    assert.equal(paused.activeTimers, 0);
    const count = logger.records().length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(logger.records().length, count);

    const restarted = await runtime.start();
    assert.equal(restarted.status, "running");
    const stopped = await runtime.stop();
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.activeTimers, 0);
  } finally {
    await runtime.dispose();
  }
});

test("script crash is isolated and a new script can run afterwards", async () => {
  const logger = new Logger({ component: "script-crash-test" });
  const runtime = new ScriptRuntimeService({ logger });
  try {
    await runtime.load({
      name: "crasher",
      source: 'throw new Error("intentional isolated crash");',
    });
    const crashed = await runtime.start();
    assert.equal(crashed.status, "crashed");
    assert.match(crashed.error?.message ?? "", /intentional isolated crash/);
    assert.match(logger.exportText(), /Script runtime crashed/);

    await runtime.load({
      name: "recovery",
      source: 'console.info("recovered");',
    });
    const recovered = await runtime.start();
    assert.equal(recovered.status, "running");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      logger.records().some((record) =>
        record.component === "script:recovery" &&
        record.message === "recovered"
      ),
      true,
    );
  } finally {
    await runtime.dispose();
  }
});

test("script sandbox does not expose Node process or require globals", async () => {
  const logger = new Logger({ component: "script-global-test" });
  const runtime = new ScriptRuntimeService({ logger });
  try {
    await runtime.load({
      name: "global-test",
      source: 'console.info(typeof process + ":" + typeof require + ":" + typeof fetch);',
    });
    const state = await runtime.start();
    assert.equal(state.status, "running");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      logger.records().some((record) =>
        record.component === "script:global-test" &&
        record.message === "undefined:undefined:undefined"
      ),
      true,
    );
  } finally {
    await runtime.dispose();
  }
});

test("Slice 4.1 one-click test verifies lifecycle, timer cleanup, crash isolation and recovery", async () => {
  const logger = new Logger({ component: "slice-4-1-live-test" });
  const runtime = new ScriptRuntimeService({ logger });
  const liveTest = new Slice41LiveTestService({ logger, runtime });
  try {
    const result = await liveTest.run();
    assert.equal(result.outcome, "passed");
    assert.deepEqual(
      result.steps.map((step) => step.name),
      [
        "load-start-and-script-logging",
        "pause-clears-timers",
        "restart-and-stop",
        "crash-isolation",
        "post-crash-recovery",
      ],
    );
    assert.equal(runtime.state().status, "stopped");
    assert.match(logger.exportText(), /Slice 4\.1 one-click live test passed/);
    assert.match(logger.exportText(), /"component":"script:slice-4-1-live-timers"/);
  } finally {
    await runtime.dispose();
  }
});
