import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandMapModelService } from "../src/navigation/map-model.ts";
import { SimplePathPlannerService } from "../src/navigation/path-planner.ts";
import { SmartMoveError, SmartMoveService } from "../src/navigation/smart-move.ts";

function data(): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: {
      main: {
        spawns: [[0, 0]],
        doors: [[50, 0, 20, 30, "cave", 0, 0]],
      },
      cave: {
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

function connected(x = 0, y = 0) {
  return {
    state: () => ({
      status: "connected" as const,
      characterId: "CH_SMART",
      characterName: "SmartRanger",
      message: "Connected.",
      character: {
        id: "CH_SMART",
        name: "SmartRanger",
        type: "ranger",
        level: 60,
        map: "main",
        x,
        y,
        dead: false,
      },
    }),
  };
}

function services(x = 0, y = 0) {
  const logger = new Logger({ component: "smart-move-test" });
  const raw = data();
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => raw,
  });
  const planner = new SimplePathPlannerService({ logger, mapModel });
  const moves: Array<{ mode: string; x: number; y: number }> = [];
  const movement = {
    runScript: async (request: { mode: "move" | "xmove"; x: number; y: number }) => {
      moves.push(request);
      return {
        requestId: "act-smart-direct",
        action: "character.move",
        origin: "script" as const,
        characterId: "CH_SMART",
        outcome: "success" as const,
        startedAt: "2026-10-03T22:00:00.000Z",
        completedAt: "2026-10-03T22:00:00.010Z",
        durationMs: 10,
        result: {
          mode: "move" as const,
          map: "main",
          fromX: x,
          fromY: y,
          targetX: request.x,
          targetY: request.y,
          transport: "move" as const,
          path: "direct" as const,
          confirmedX: request.x,
          confirmedY: request.y,
          serverConfirmed: true as const,
        },
      };
    },
  };
  const smartMove = new SmartMoveService({
    logger,
    character: connected(x, y) as any,
    mapModel,
    planner,
    movement: movement as any,
  });
  return { logger, mapModel, planner, movement, smartMove, moves };
}

test("smart_move reports already_there without executing movement", async () => {
  const { smartMove, moves } = services(10, 20);
  const result = await smartMove.run({ x: 10, y: 20 });

  assert.equal(result.status, "already_there");
  assert.equal(result.target.map, "main");
  assert.equal(result.route.status, "reachable");
  assert.equal(result.route.legs.length, 0);
  assert.deepEqual(moves, []);
  assert.equal(smartMove.state().completedRequests, 1);
});

test("smart_move executes one collision-safe same-map leg through movement service", async () => {
  const { smartMove, moves } = services(0, 0);
  const result = await smartMove.run({ map: "main", x: 40, y: 0 });

  assert.equal(result.status, "completed");
  assert.equal(result.route.status, "reachable");
  assert.equal(result.route.diagnostics.mapHops, 0);
  assert.equal(result.route.legs.length, 1);
  assert.equal(result.movement?.requestId, "act-smart-direct");
  assert.deepEqual(moves, [{ mode: "move", x: 40, y: 0 }]);
});

test("smart_move map-name target is planned but cross-map execution is explicitly unavailable", async () => {
  const { smartMove, moves } = services(0, 0);
  await assert.rejects(
    () => smartMove.run("cave"),
    (error: unknown) => {
      assert.ok(error instanceof SmartMoveError);
      assert.equal(error.code, "SMART_MOVE_TRANSITION_EXECUTION_UNAVAILABLE");
      return true;
    },
  );
  assert.deepEqual(moves, []);
});

test("smart_move returns stable errors for unsupported selectors and disconnected state", async () => {
  const { smartMove } = services();
  await assert.rejects(
    () => smartMove.run("definitely_not_a_map"),
    (error: unknown) => {
      assert.ok(error instanceof SmartMoveError);
      assert.equal(error.code, "SMART_MOVE_TARGET_UNSUPPORTED");
      return true;
    },
  );

  const logger = new Logger({ component: "smart-move-disconnected-test" });
  const raw = data();
  const mapModel = new AdventureLandMapModelService({ logger, gameData: () => raw });
  const planner = new SimplePathPlannerService({ logger, mapModel });
  const disconnected = new SmartMoveService({
    logger,
    character: {
      state: () => ({
        status: "disconnected" as const,
        message: "Disconnected.",
      }),
    } as any,
    mapModel,
    planner,
    movement: { runScript: async () => { throw new Error("must not move"); } } as any,
  });

  await assert.rejects(
    () => disconnected.run({ x: 0, y: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof SmartMoveError);
      assert.equal(error.code, "SMART_MOVE_CHARACTER_NOT_CONNECTED");
      return true;
    },
  );
});
