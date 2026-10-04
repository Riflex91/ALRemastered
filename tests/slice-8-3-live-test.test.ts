import assert from "node:assert/strict";
import { test } from "node:test";
import { TemplateConfigurationService } from "../src/dashboard/template-config.ts";
import { Slice83LiveTestService } from "../src/live-test/slice-8-3.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 8.3 verifies schema-driven settings and exact restoration without runtime side effects", async () => {
  const logger = new Logger({ component: "slice83-live-test" });
  let runtimeState: any = {
    status: "unloaded",
    activeTimers: 0,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 0,
    message: "No script loaded.",
  };
  const config = new TemplateConfigurationService({
    logger,
    farmer: {
      options: () => ({
        status: "ready",
        message: "Ready.",
        monsters: ["goo"],
        defaults: { hpThresholdPercent: 50, mpThresholdPercent: 30, loot: true, respawn: true },
      }),
      state: () => ({ status: "idle", message: "Ready." }),
      start: async () => ({ status: "running", message: "Running." }),
      stop: async () => ({ status: "stopped", message: "Stopped." }),
    } as any,
  });
  const service = new Slice83LiveTestService({
    logger,
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_PRIMARY",
        characterName: "Primary",
        serverKey: "SR_EUII",
        message: "Connected.",
      }),
    } as any,
    config,
    userRuntime: { state: () => structuredClone(runtimeState) } as any,
    clock: () => new Date("2026-10-04T09:00:00.000Z"),
    idFactory: () => "live83-test",
  });

  const result = await service.run();
  assert.equal(result.outcome, "passed");
  assert.deepEqual(result.steps.map((item) => item.name), [
    "schema", "save", "restore", "final-state",
  ]);
  assert.equal(config.snapshotDraft(), undefined);
  const final = result.steps.at(-1)?.evidence as any;
  assert.equal(final.userScriptInterrupted, false);
  assert.equal(final.gameplayMutation, false);
  assert.equal(final.rawSocketAccess, false);
  assert.equal(runtimeState.status, "unloaded");
});
