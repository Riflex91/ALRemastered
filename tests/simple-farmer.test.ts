import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSimpleFarmerSource,
  SimpleFarmerTemplateService,
} from "../src/script/simple-farmer.ts";

test("simple farmer source is bounded, escaped, and configured without code", () => {
  const source = createSimpleFarmerSource({
    monster: 'goo"; throw new Error("inject") //',
    hpThresholdPercent: 50,
    mpThresholdPercent: 30,
    loot: true,
    respawn: true,
  });
  assert.match(source, /get_nearest_monster/);
  assert.match(source, /use_hp\(\)/);
  assert.match(source, /use_mp\(\)/);
  assert.match(source, /await respawn\(\)/);
  assert.match(source, /await loot\(\)/);
  assert.match(source, /<= 50/);
  assert.match(source, /<= 30/);
  assert.match(source, /goo\\\"; throw new Error/);
  assert.doesNotMatch(source, /smart_move|xmove\(/);
});

test("simple farmer service only starts for currently visible monster types", async () => {
  let runtimeState:any = {
    status: "unloaded",
    activeTimers: 0,
    activeEventListeners: 0,
    storageEntries: 0,
    logRecords: 0,
    message: "No script loaded.",
  };
  let loaded:any;
  const service = new SimpleFarmerTemplateService({
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_1",
        character: { id: "CH_1", name: "Ranger", type: "ranger", dead: false },
        entities: [
          { id: "M1", kind: "monster", type: "goo", name: "Goo" },
          { id: "M2", kind: "monster", type: "crab", name: "Crab" },
        ],
        message: "connected",
      }),
    } as any,
    runtime: {
      state: () => structuredClone(runtimeState),
      load: async (request:any) => {
        loaded = request;
        runtimeState = { ...runtimeState, status: "loaded", scriptName: request.name };
        return structuredClone(runtimeState);
      },
      start: async () => {
        runtimeState = { ...runtimeState, status: "running", runId: "run-1" };
        return structuredClone(runtimeState);
      },
      stop: async () => {
        runtimeState = { ...runtimeState, status: "stopped" };
        return structuredClone(runtimeState);
      },
    } as any,
  });

  assert.deepEqual(service.options().monsters, ["crab", "goo"]);
  await assert.rejects(
    service.start({ monster: "bee", hpThresholdPercent: 50, mpThresholdPercent: 30, loot: true, respawn: true }),
    /currently visible monster/i,
  );

  const state = await service.start({
    monster: "goo",
    hpThresholdPercent: 45,
    mpThresholdPercent: 25,
    loot: false,
    respawn: true,
  });
  assert.equal(state.status, "running");
  assert.equal(loaded.name, "simple-farmer-template");
  assert.match(loaded.source, /type: "goo"/);
  assert.match(loaded.source, /Loot disabled/);
});
