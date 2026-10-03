import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";
import { ScriptStorageStore } from "../src/script/storage.ts";

test("script storage persists JSON state in isolated hashed namespaces", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-script-storage-"));
  const logger = new Logger({ component: "script-storage-test" });
  try {
    const store = new ScriptStorageStore(root, logger, () => new Date("2026-10-03T17:00:00.000Z"));
    store.set("Alpha Script", "state", { count: 3, flags: ["a", "b"] });
    store.set("Beta Script", "state", { count: 9 });

    assert.deepEqual(store.snapshot("Alpha Script").entries, [{
      key: "state",
      value: { count: 3, flags: ["a", "b"] },
    }]);
    assert.deepEqual(store.snapshot("Beta Script").entries, [{
      key: "state",
      value: { count: 9 },
    }]);

    const files = readdirSync(root);
    assert.equal(files.length, 2);
    assert.equal(files.every((name) => /^[a-f0-9]{64}\.json$/.test(name)), true);
    assert.equal(files.some((name) => name.includes("Alpha")), false);

    const reopened = new ScriptStorageStore(root, logger);
    assert.deepEqual(reopened.snapshot("Alpha Script").entries[0]?.value, {
      count: 3,
      flags: ["a", "b"],
    });

    reopened.delete("Alpha Script", "state");
    assert.equal(reopened.snapshot("Alpha Script").entries.length, 0);
    assert.equal(reopened.snapshot("Beta Script").entries.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isolated worker get/set/del state survives runtime recreation and cannot cross namespaces", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-script-storage-runtime-"));
  const logger = new Logger({ component: "script-storage-runtime-test" });
  try {
    const firstStore = new ScriptStorageStore(root, logger);
    const firstRuntime = new ScriptRuntimeService({ logger, storage: firstStore });
    await firstRuntime.load({
      name: "persistent-script",
      source: [
        "(async () => {",
        "  if (get('counter', 0) !== 0) throw new Error('unexpected initial storage');",
        "  await set('counter', {value: 7});",
        "  if (get('counter').value !== 7) throw new Error('immediate read failed');",
        "  console.info('storage-written');",
        "})()",
      ].join("\n"),
    });
    assert.equal((await firstRuntime.start()).status, "running");
    assert.equal(await waitFor(() => hasLog(logger, "persistent-script", "storage-written"), 1000), true);
    await firstRuntime.dispose();

    const reopenedStore = new ScriptStorageStore(root, logger);
    const secondRuntime = new ScriptRuntimeService({ logger, storage: reopenedStore });
    try {
      await secondRuntime.load({
        name: "persistent-script",
        source: [
          "(async () => {",
          "  const value = get('counter');",
          "  if (!value || value.value !== 7) throw new Error('persisted value missing');",
          "  await del('counter');",
          "  if (get('counter', 'missing') !== 'missing') throw new Error('delete failed');",
          "  console.info('storage-reopened');",
          "})()",
        ].join("\n"),
      });
      assert.equal((await secondRuntime.start()).status, "running");
      assert.equal(await waitFor(() => hasLog(logger, "persistent-script", "storage-reopened"), 1000), true);
      await secondRuntime.stop();

      await secondRuntime.load({
        name: "other-script",
        source: "if (get('counter', 'isolated') !== 'isolated') throw new Error('namespace leaked'); console.info('storage-isolated');",
      });
      assert.equal((await secondRuntime.start()).status, "running");
      assert.equal(await waitFor(() => hasLog(logger, "other-script", "storage-isolated"), 1000), true);
      assert.equal(reopenedStore.snapshot("persistent-script").entries.length, 0);
    } finally {
      await secondRuntime.dispose();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function hasLog(logger: Logger, scriptName: string, message: string): boolean {
  return logger.records().some((record) =>
    record.component === `script:${scriptName}` && record.message === message
  );
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}
