import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { AdventureLandMovementService } from "../src/action/movement.ts";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Slice64LiveTestService } from "../src/live-test/slice-6-4.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandMapModelService } from "../src/navigation/map-model.ts";
import { MovementDebugService } from "../src/navigation/movement-debug.ts";
import { SimplePathPlannerService } from "../src/navigation/path-planner.ts";

function gameData(): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: {
      main: {
        name: "Mainland",
        spawns: [[0, 0, 3]],
      },
    },
    geometry: {
      main: {
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

test("Slice 6.4 verifies planned-route and server-confirmed movement-trail telemetry", async () => {
  const logger = new Logger({ component: "slice-6-4-live-test" });
  let nowMs = 1_000;
  let clockMs = 1_900_000_000_000;
  const debug = new MovementDebugService({
    clock: () => new Date(clockMs++),
  });
  const data = gameData();
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => data,
  });
  const planner = new SimplePathPlannerService({
    logger,
    mapModel,
    onPlan: (plan) => debug.recordPlan(plan),
  });

  const characterState: any = {
    status: "connected",
    characterId: "CH_64",
    characterName: "TrailTester",
    serverKey: "SR_EUII",
    serverRegion: "EU",
    serverName: "II",
    message: "Connected.",
    character: {
      id: "CH_64",
      name: "TrailTester",
      type: "merchant",
      level: 1,
      map: "main",
      x: 100,
      y: 100,
      hp: 100,
      maxHp: 100,
      mp: 100,
      maxMp: 100,
      dead: false,
      range: 40,
      gold: 0,
      inventory: [],
      equipment: {},
      conditions: {},
    },
    entities: [],
    party: { inParty: false, members: [], details: {} },
    lootChests: [],
  };
  const character = {
    state: () => structuredClone(characterState),
    async sendDirectMovement({ x, y }: { x: number; y: number }) {
      const fromX = characterState.character.x;
      const fromY = characterState.character.y;
      characterState.character.x = x;
      characterState.character.y = y;
      return {
        fromX,
        fromY,
        targetX: x,
        targetY: y,
        confirmedX: x,
        confirmedY: y,
      };
    },
  };
  let request = 0;
  const gateway = new ActionGateway({
    logger,
    nowMs: () => nowMs,
    idFactory: () => `act-live64-${++request}`,
  });
  const movement = new AdventureLandMovementService({
    gateway,
    character: character as any,
    gameData: () => data,
    onConfirmedMovement: (event) => debug.recordMovement(event),
  });
  const runtimeState = {
    status: "stopped",
    activeTimers: 0,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 0,
    message: "Stopped.",
  } as const;
  const live = new Slice64LiveTestService({
    logger,
    runtime: { state: () => structuredClone(runtimeState) as any },
    character: character as any,
    mapModel,
    planner,
    movement,
    movementDebug: debug,
    clock: () => new Date(clockMs++),
    delay: async (milliseconds) => {
      nowMs += milliseconds;
    },
    idFactory: () => "live64-test",
  });

  const result = await live.run();

  assert.equal(result.outcome, "passed");
  assert.deepEqual(
    result.steps.map((step) => step.name),
    ["preflight", "planned-route", "movement-trail", "final-state"],
  );
  assert.equal(characterState.character.x, 100);
  assert.equal(characterState.character.y, 100);

  const state = debug.state();
  assert.equal(state.plannedRouteCount, 1);
  assert.equal(state.movementCount, 2);
  assert.equal(state.plannedRoute?.status, "reachable");
  assert.equal(state.plannedRoute?.to.x, 132);
  assert.equal(state.plannedRoute?.to.y, 100);
  assert.equal(state.trail.at(-1)?.kind, "confirmed");
  assert.equal(state.trail.at(-1)?.x, 100);
  assert.equal(state.trail.at(-1)?.y, 100);
  assert.equal(
    logger.records().some((record) =>
      record.message === "Slice 6.4 movement debug live test passed."
    ),
    true,
  );
});

test("Slice 6.4 blocks without interrupting a running user script", async () => {
  const logger = new Logger({ component: "slice-6-4-live-test-busy" });
  let movementCalls = 0;
  const live = new Slice64LiveTestService({
    logger,
    runtime: {
      state: () => ({
        status: "running",
        scriptName: "user-script",
        runId: "script-user",
        activeTimers: 1,
        activeEventListeners: 0,
        logRecords: 1,
        heartbeatSequence: 1,
        message: "Running.",
      }),
    } as any,
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_64",
        characterName: "TrailTester",
        serverKey: "SR_EUII",
        character: {
          map: "main",
          x: 100,
          y: 100,
          dead: false,
        },
      }),
    } as any,
    mapModel: { model: () => undefined },
    planner: { plan: () => {
      throw new Error("planner must not run");
    } },
    movement: {
      runDashboardTest: async () => {
        movementCalls += 1;
        throw new Error("movement must not run");
      },
    },
    movementDebug: {
      state: () => ({
        status: "ready",
        trailLimit: 120,
        trailPointCount: 0,
        movementCount: 0,
        plannedRouteCount: 0,
        trail: [],
        message: "ready",
      }),
    },
    idFactory: () => "live64-busy",
  });

  const result = await live.run();

  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(movementCalls, 0);
});
