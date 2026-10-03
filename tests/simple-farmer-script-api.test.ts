import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

test("isolated worker exposes validated consume and respawn API calls", async () => {
  const logger = new Logger({ component: "farmer-script-api-test" });
  const calls:string[] = [];
  const runtime = new ScriptRuntimeService({
    logger,
    api: {
      bootstrap: () => ({ G: {}, state: { character: {}, Entities: {}, attackCooldownMs: 0, lootChests: [] } }),
      state: () => ({ character: {}, Entities: {}, attackCooldownMs: 0, lootChests: [] }),
      call: async (method:any) => {
        calls.push(method);
        return { ok: true };
      },
    },
  });
  try {
    await runtime.load({
      name: "farmer-api-probe",
      source: "(async () => { await use_hp(); await use_mp(); await respawn(); console.info('farmer-api-ok'); })()",
    });
    assert.equal((await runtime.start()).status, "running");
    const deadline = Date.now() + 1000;
    while (Date.now() <= deadline && !logger.records().some((r) => r.message === "farmer-api-ok")) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.deepEqual(calls, ["consume", "consume", "respawn"]);
    assert.equal(logger.records().some((r) => r.message === "farmer-api-ok"), true);
  } finally {
    await runtime.dispose();
  }
});
