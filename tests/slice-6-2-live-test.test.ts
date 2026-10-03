import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Slice62LiveTestService } from "../src/live-test/slice-6-2.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandMapModelService } from "../src/navigation/map-model.ts";
import { SimplePathPlannerService } from "../src/navigation/path-planner.ts";

function liveData(): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: {
      main: {
        spawns: [[0, 0], [100, 0]],
        doors: [[50, 0, 20, 30, "cave", 0, 0]],
      },
      cave: {
        spawns: [[0, 0], [100, 0]],
        doors: [[0, 20, 20, 20, "main", 0, 0]],
      },
    },
    geometry: {
      main: {
        min_x: -100,
        min_y: -100,
        max_x: 200,
        max_y: 100,
        x_lines: [],
        y_lines: [],
      },
      cave: {
        min_x: -100,
        min_y: -100,
        max_x: 200,
        max_y: 100,
        x_lines: [],
        y_lines: [],
      },
    },
    skills: {},
    classes: {},
    npcs: {},
    drops: {},
    craft: {},
    conditions: {},
  };
}

test("Slice 6.2 verifies a reachable passive cross-map route with waypoints and diagnostics", async () => {
  const logger = new Logger({ component: "slice-6-2-live-test" });
  const data = liveData();
  let loadCalls = 0;
  const gameData = {
    state: () => ({
      status: "loaded" as const,
      version: data.version,
      cacheStatus: "stored" as const,
      familyCount: 10,
      loadedFamilyCount: 10,
      families: [],
    }),
    data: () => data,
    loadNow: async () => {
      loadCalls += 1;
      return gameData.state();
    },
  };
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => data,
  });
  const planner = new SimplePathPlannerService({ logger, mapModel });
  const character = {
    state: () => ({
      status: "disconnected" as const,
      heartbeatSequence: 0,
      message: "Disconnected.",
    }),
  };
  const service = new Slice62LiveTestService({
    logger,
    gameData: gameData as any,
    mapModel,
    planner,
    character: character as any,
    idFactory: () => "live62-test",
    clock: (() => {
      let now = Date.parse("2026-10-03T22:00:00.000Z");
      return () => new Date(now += 10);
    })(),
  });

  const result = await service.run();
  assert.equal(result.outcome, "passed");
  assert.equal(result.testId, "live62-test");
  assert.equal(loadCalls, 1);
  assert.deepEqual(result.steps.map((step) => step.name), [
    "navigation-model",
    "reachable-route",
    "waypoints",
    "route-diagnostics",
    "final-state",
  ]);
  assert.equal(result.route?.status, "reachable");
  assert.equal(result.route?.diagnostics.mapHops, 1);
  assert.ok((result.route?.waypoints.length ?? 0) >= 3);
  assert.ok(result.route?.legs.some((leg) => leg.kind === "walk"));
  assert.ok(result.route?.legs.some((leg) => leg.kind === "transition"));
  assert.equal(result.steps[3]?.evidence.validatedWalkLegs, 1);
  assert.equal(result.steps[3]?.evidence.validatedTransitionLegs, 1);
  assert.equal(result.steps[4]?.evidence.characterRequired, false);
  assert.equal(result.steps[4]?.evidence.movementExecution, false);
  assert.equal(result.steps[4]?.evidence.gameplayMutation, false);
  assert.equal(result.steps[4]?.evidence.rawSocketAccess, false);
  assert.match(logger.exportText(), /Slice 6\.2 simple path-planner test passed/);
});

test("Slice 6.2 blocks when fresh live game data cannot be loaded", async () => {
  const logger = new Logger({ component: "slice-6-2-blocked-test" });
  let loadCalls = 0;
  const gameData = {
    state: () => ({ status: "error" as const }),
    data: () => undefined,
    loadNow: async () => {
      loadCalls += 1;
      return gameData.state();
    },
  };
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => undefined,
  });
  const planner = new SimplePathPlannerService({ logger, mapModel });
  const service = new Slice62LiveTestService({
    logger,
    gameData: gameData as any,
    mapModel,
    planner,
    character: {
      state: () => ({
        status: "disconnected" as const,
        heartbeatSequence: 0,
        message: "Disconnected.",
      }),
    } as any,
    idFactory: () => "live62-blocked",
  });

  const result = await service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_GAME_DATA_UNAVAILABLE");
  assert.equal(loadCalls, 1);
});
