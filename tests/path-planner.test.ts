import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  AdventureLandMapModelService,
  buildAdventureLandNavigationModel,
} from "../src/navigation/map-model.ts";
import {
  planSimplePath,
  SimplePathPlannerService,
} from "../src/navigation/path-planner.ts";

function data(options?: { conditionalDoor?: boolean }): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: {
      main: {
        spawns: [[0, 0], [100, 0]],
        doors: [[50, 0, 20, 30, "cave", 0, 0, ...(options?.conditionalDoor ? ["key"] : [])]],
      },
      cave: {
        spawns: [[0, 0], [100, 0]],
        doors: [[0, 20, 20, 20, "main", 0, 0]],
      },
      ignored: {
        ignore: true,
        spawns: [[0, 0]],
        doors: [],
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

test("simple planner returns a direct same-map route with diagnostics", () => {
  const model = buildAdventureLandNavigationModel(data());
  const result = planSimplePath(
    model,
    { map: "main", x: 0, y: 0 },
    { map: "main", x: 80, y: 0 },
  );

  assert.equal(result.status, "reachable");
  assert.equal(result.diagnostics.mapHops, 0);
  assert.equal(result.legs.length, 1);
  assert.equal(result.legs[0]?.kind, "walk");
  assert.deepEqual(result.waypoints.map((waypoint) => waypoint.kind), [
    "start",
    "target",
  ]);
  assert.equal(result.diagnostics.totalWalkDistance, 80);
  assert.ok(result.diagnostics.directChecks > 0);
});

test("simple planner finds a cross-map route through an unconditional door", () => {
  const model = buildAdventureLandNavigationModel(data());
  const result = planSimplePath(
    model,
    { map: "main", x: 0, y: 0 },
    { map: "cave", x: 100, y: 0 },
  );

  assert.equal(result.status, "reachable");
  assert.equal(result.diagnostics.mapHops, 1);
  assert.equal(result.diagnostics.transitionEdgeCount, 2);
  assert.deepEqual(result.diagnostics.visitedMaps, ["main", "cave"]);
  assert.ok(result.legs.some((leg) => leg.kind === "transition"));
  const transition = result.legs.find((leg) => leg.kind === "transition");
  assert.equal(transition?.transitionId, "main:door:0");
  assert.equal(transition?.from.map, "main");
  assert.equal(transition?.to.map, "cave");
  assert.equal(result.waypoints[0]?.kind, "start");
  assert.equal(result.waypoints.at(-1)?.kind, "target");
});

test("simple planner skips conditional doors and reports no route", () => {
  const model = buildAdventureLandNavigationModel(data({ conditionalDoor: true }));
  const result = planSimplePath(
    model,
    { map: "main", x: 0, y: 0 },
    { map: "cave", x: 100, y: 0 },
  );

  assert.equal(result.status, "unreachable");
  assert.equal(result.reasonCode, "PATH_NO_ROUTE");
  assert.equal(result.diagnostics.skippedConditionalTransitions, 1);
  assert.equal(result.diagnostics.transitionEdgeCount, 1);
  assert.deepEqual(result.waypoints, []);
});

test("simple planner rejects ignored, unknown, and out-of-bounds locations", () => {
  const model = buildAdventureLandNavigationModel(data());

  assert.equal(
    planSimplePath(
      model,
      { map: "ignored", x: 0, y: 0 },
      { map: "main", x: 0, y: 0 },
    ).reasonCode,
    "PATH_MAP_IGNORED",
  );
  assert.equal(
    planSimplePath(
      model,
      { map: "missing", x: 0, y: 0 },
      { map: "main", x: 0, y: 0 },
    ).reasonCode,
    "PATH_MAP_UNKNOWN",
  );
  assert.equal(
    planSimplePath(
      model,
      { map: "main", x: 500, y: 0 },
      { map: "main", x: 0, y: 0 },
    ).reasonCode,
    "PATH_LOCATION_OUT_OF_BOUNDS",
  );
});

test("planner service retains route diagnostics without mutating the map model", () => {
  const logger = new Logger({ component: "path-planner-test" });
  const raw = data();
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => raw,
  });
  const planner = new SimplePathPlannerService({ logger, mapModel });

  assert.equal(planner.state().status, "ready");
  const result = planner.plan(
    { map: "main", x: 0, y: 0 },
    { map: "cave", x: 100, y: 0 },
  );
  assert.equal(result.status, "reachable");
  assert.equal(planner.state().plannedRoutes, 1);
  assert.equal(planner.state().reachableRoutes, 1);
  assert.equal(planner.state().lastPlan?.diagnostics.mapHops, 1);
  assert.equal(mapModel.model()?.transitionCount, 2);
  assert.match(logger.exportText(), /Simple navigation route planned/);
});
