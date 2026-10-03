import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Slice63LiveTestService } from "../src/live-test/slice-6-3.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandMapModelService } from "../src/navigation/map-model.ts";
import { SimplePathPlannerService } from "../src/navigation/path-planner.ts";
import { SmartMoveService } from "../src/navigation/smart-move.ts";
import { AdventureLandScriptApiBridge } from "../src/script/adventure-api.ts";
import { ScriptRuntimeService } from "../src/script/runtime.ts";

function data(): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: {
      main: {
        spawns: [[0, 0]],
        doors: [],
      },
    },
    geometry: {
      main: {
        min_x: -100,
        min_y: -100,
        max_x: 200,
        max_y: 200,
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

test("Slice 6.3 proves smart_move worker compatibility and stable error reasons without movement", async () => {
  const logger = new Logger({ component: "slice-6-3-live-test" });
  const raw = data();
  const characterState = {
    status: "connected" as const,
    characterId: "CH_SMART",
    characterName: "SmartRanger",
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
    heartbeatSequence: 12,
    message: "Connected.",
    character: {
      id: "CH_SMART",
      name: "SmartRanger",
      type: "ranger",
      level: 60,
      map: "main",
      x: 10,
      y: 20,
      dead: false,
    },
    entities: [],
    lootChests: [],
  };
  const character = {
    state: () => characterState,
    attackCooldownRemainingMs: () => 0,
  };
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => raw,
  });
  const planner = new SimplePathPlannerService({ logger, mapModel });
  let movementCalls = 0;
  const movement = {
    runScript: async () => {
      movementCalls += 1;
      throw new Error("passive Slice 6.3 probe must not move");
    },
  };
  const smartMove = new SmartMoveService({
    logger,
    character: character as any,
    mapModel,
    planner,
    movement: movement as any,
  });
  const bridge = new AdventureLandScriptApiBridge({
    character: character as any,
    movement: movement as any,
    smartMove,
    attack: {
      run: async () => {
        throw new Error("must not attack");
      },
    } as any,
    gameData: () => raw,
  });
  const runtime = new ScriptRuntimeService({
    logger,
    api: bridge,
    apiStateIntervalMs: 50,
  });
  const service = new Slice63LiveTestService({
    logger,
    runtime,
    character: character as any,
    smartMove,
    idFactory: () => "live63-test",
  });

  try {
    const result = await service.run();
    assert.equal(result.outcome, "passed");
    assert.equal(result.testId, "live63-test");
    assert.deepEqual(result.steps.map((step) => step.name), [
      "preflight",
      "script-api",
      "error-reason",
      "final-state",
    ]);
    assert.equal(result.steps[1]?.evidence.expectedStatus, "already_there");
    assert.equal(result.steps[1]?.evidence.requestDelta, 2);
    assert.equal(result.steps[1]?.evidence.completionDelta, 1);
    assert.equal(
      result.steps[2]?.evidence.errorCode,
      "SMART_MOVE_TARGET_UNSUPPORTED",
    );
    assert.equal(result.steps[3]?.evidence.movementExecution, false);
    assert.equal(result.steps[3]?.evidence.gameplayMutation, false);
    assert.equal(result.steps[3]?.evidence.rawSocketAccess, false);
    assert.equal(result.steps[3]?.evidence.actionGatewayRecords, 0);
    assert.equal(movementCalls, 0);
    assert.equal(smartMove.state().totalRequests, 2);
    assert.equal(smartMove.state().completedRequests, 1);
    assert.equal(
      smartMove.state().lastError?.code,
      "SMART_MOVE_TARGET_UNSUPPORTED",
    );
    assert.match(
      logger.exportText(),
      /Slice 6\.3 smart_move\(\) compatibility test passed/,
    );
  } finally {
    await runtime.dispose();
  }
});

test("Slice 6.3 blocks before replacing a running script or when no Character is connected", async () => {
  const logger = new Logger({ component: "slice-6-3-blocked-test" });
  let loadCalls = 0;
  const runtime = {
    state: () => ({
      status: "running" as const,
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 1,
      message: "Running.",
    }),
    load: async () => {
      loadCalls += 1;
      throw new Error("must not load");
    },
    start: async () => {
      throw new Error("must not start");
    },
    stop: async () => runtime.state(),
  };
  const service = new Slice63LiveTestService({
    logger,
    runtime: runtime as any,
    character: {
      state: () => ({
        status: "connected" as const,
        characterId: "CH_1",
        characterName: "Ranger",
        serverKey: "SR_EUII",
        message: "Connected.",
        character: {
          id: "CH_1",
          name: "Ranger",
          type: "ranger",
          level: 1,
          map: "main",
          x: 0,
          y: 0,
          dead: false,
        },
      }),
    } as any,
    smartMove: {
      state: () => ({
        status: "ready" as const,
        totalRequests: 0,
        completedRequests: 0,
        message: "ready",
      }),
    } as any,
    idFactory: () => "live63-blocked",
  });

  const result = await service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(loadCalls, 0);
});
