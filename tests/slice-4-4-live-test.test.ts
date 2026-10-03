import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Slice44LiveTestService } from "../src/live-test/slice-4-4.ts";
import { Logger } from "../src/logging/logger.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";
import { ScriptStorageStore } from "../src/script/storage.ts";

test("Slice 4.4 one-click test verifies persistence, namespace isolation and cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-slice44-"));
  const logger = new Logger({ component: "slice-4-4-test" });
  const storage = new ScriptStorageStore(root, logger);
  const runtime = new ScriptRuntimeService({
    logger,
    storage,
    idFactory: (() => {
      let id = 0;
      return () => `slice44-run-${++id}`;
    })(),
  });
  const liveTest = new Slice44LiveTestService({
    logger,
    runtime,
    storage,
    idFactory: () => "live44-test",
  });

  try {
    const result = await liveTest.run();
    assert.equal(result.outcome, "passed");
    assert.equal(result.slice, "4.4");
    assert.deepEqual(result.steps.map((step) => step.name), [
      "write-and-immediate-read",
      "persist-across-worker-restart",
      "safe-namespace-isolation",
      "delete-and-test-cleanup",
      "final-runtime-cleanup",
    ]);
    assert.equal(runtime.state().status, "stopped");
    assert.equal(runtime.state().activeTimers, 0);
    assert.equal(runtime.state().activeEventListeners, 0);
    assert.equal(storage.snapshot("slice-4-4-storage-primary").entries.length, 0);
    assert.equal(storage.snapshot("slice-4-4-storage-secondary").entries.length, 0);
    assert.equal(
      logger.records().some((record) =>
        record.message === "Slice 4.4 one-click storage test passed."
      ),
      true,
    );
  } finally {
    await runtime.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 4.4 blocks without touching a currently running user script", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-slice44-busy-"));
  const logger = new Logger({ component: "slice-4-4-busy-test" });
  const storage = new ScriptStorageStore(root, logger);
  const runtime = new ScriptRuntimeService({ logger, storage });
  try {
    await runtime.load({
      name: "user-script",
      source: "setInterval(() => {}, 1000);",
    });
    assert.equal((await runtime.start()).status, "running");
    const liveTest = new Slice44LiveTestService({
      logger,
      runtime,
      storage,
      idFactory: () => "live44-busy",
    });
    const result = await liveTest.run();
    assert.equal(result.outcome, "blocked");
    assert.equal(result.error?.code, "SCRIPT_RUNTIME_BUSY");
  } finally {
    await runtime.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
