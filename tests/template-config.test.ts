import assert from "node:assert/strict";
import { test } from "node:test";
import { TemplateConfigurationService } from "../src/dashboard/template-config.ts";
import { Logger } from "../src/logging/logger.ts";

function harness() {
  const calls: any[] = [];
  let farmerState: any = { status: "idle", message: "Ready." };
  const service = new TemplateConfigurationService({
    logger: new Logger({ component: "template-config-test" }),
    farmer: {
      options: () => ({
        status: "ready",
        message: "Ready.",
        monsters: ["bee", "goo"],
        defaults: {
          hpThresholdPercent: 50,
          mpThresholdPercent: 30,
          loot: true,
          respawn: true,
        },
      }),
      state: () => structuredClone(farmerState),
      start: async (config: any) => {
        calls.push(["start", config]);
        farmerState = { status: "running", message: "Running.", config };
        return structuredClone(farmerState);
      },
      stop: async () => {
        calls.push(["stop"]);
        farmerState = { ...farmerState, status: "stopped", message: "Stopped." };
        return structuredClone(farmerState);
      },
    } as any,
  });
  return { service, calls };
}

test("Template Configuration exposes normal Simple Farmer settings without a code field", () => {
  const h = harness();
  const state = h.service.state();
  const template = state.templates[0];
  assert.equal(state.status, "ready");
  assert.equal(state.normalSettingsRequireCodeChanges, false);
  assert.deepEqual(template.fields.map((field) => field.key), [
    "monster", "hpThresholdPercent", "mpThresholdPercent", "loot", "respawn",
  ]);
  assert.equal(template.fields.some((field) => String(field.key).includes("source")), false);
  assert.equal(template.values.monster, "bee");
});

test("Template Configuration saves, starts and stops through the existing Simple Farmer service", async () => {
  const h = harness();
  const saved = h.service.save("simple-farmer", {
    monster: "goo",
    hpThresholdPercent: 45,
    mpThresholdPercent: 25,
    loot: false,
    respawn: true,
  });
  assert.equal(saved.templates[0].configured, true);
  assert.equal(saved.templates[0].values.monster, "goo");

  await h.service.start("simple-farmer");
  assert.deepEqual(h.calls[0], ["start", {
    monster: "goo",
    hpThresholdPercent: 45,
    mpThresholdPercent: 25,
    loot: false,
    respawn: true,
  }]);
  await h.service.stop("simple-farmer");
  assert.deepEqual(h.calls[1], ["stop"]);
});

test("Template Configuration validates visible monsters and can restore an exact draft snapshot", () => {
  const h = harness();
  assert.throws(() => h.service.save("simple-farmer", {
    monster: "not-visible",
    hpThresholdPercent: 50,
    mpThresholdPercent: 30,
    loot: true,
    respawn: true,
  }), /currently visible/);

  const before = h.service.snapshotDraft();
  h.service.save("simple-farmer", {
    monster: "bee",
    hpThresholdPercent: 40,
    mpThresholdPercent: 20,
    loot: true,
    respawn: false,
  });
  h.service.restoreDraft(before);
  assert.equal(h.service.state().templates[0].configured, false);
  assert.equal(h.service.state().templates[0].values.hpThresholdPercent, 50);
});
