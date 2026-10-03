import { randomUUID } from "node:crypto";
import type {
  AdventureLandMovementService,
  MovementDirection,
} from "../action/movement.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger } from "../logging/logger.ts";
import { canTraverseDirect } from "../navigation/collision.ts";
import type { AdventureLandMapModelService } from "../navigation/map-model.ts";
import type { MovementDebugService } from "../navigation/movement-debug.ts";
import type { SimplePathPlannerService } from "../navigation/path-planner.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice64LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice64LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice64LiveTestResult {
  readonly testId: string;
  readonly slice: "6.4";
  readonly outcome: Slice64LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice64LiveTestStep[];
  readonly error?: Readonly<{
    readonly code: string;
    readonly step: string;
    readonly message: string;
  }>;
}

export interface Slice64LiveTestState {
  readonly status: "idle" | "running" | Slice64LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice64LiveTestResult;
}

export interface Slice64LiveTestServiceOptions {
  readonly logger: Logger;
  readonly runtime: Pick<ScriptRuntimeService, "state">;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly mapModel: Pick<AdventureLandMapModelService, "model">;
  readonly planner: Pick<SimplePathPlannerService, "plan">;
  readonly movement: Pick<AdventureLandMovementService, "runDashboardTest">;
  readonly movementDebug: Pick<MovementDebugService, "state">;
  readonly clock?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

const MOVEMENT_STEP = 32;
const RATE_LIMIT_SETTLE_MS = 450;
const FINAL_POSITION_TIMEOUT_MS = 2_500;
const FINAL_POSITION_POLL_MS = 75;

export class Slice64LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: Slice64LiveTestServiceOptions["runtime"];
  readonly #character: Slice64LiveTestServiceOptions["character"];
  readonly #mapModel: Slice64LiveTestServiceOptions["mapModel"];
  readonly #planner: Slice64LiveTestServiceOptions["planner"];
  readonly #movement: Slice64LiveTestServiceOptions["movement"];
  readonly #movementDebug: Slice64LiveTestServiceOptions["movementDebug"];
  readonly #clock: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice64LiveTestResult>;
  #state: Slice64LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 6.4 movement-trail and planned-route test is ready.",
  });

  constructor(options: Slice64LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#character = options.character;
    this.#mapModel = options.mapModel;
    this.#planner = options.planner;
    this.#movement = options.movement;
    this.#movementDebug = options.movementDebug;
    this.#clock = options.clock ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live64-${randomUUID()}`);
  }

  state(): Slice64LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice64LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice64LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice64LiveTestStep[] = [];
    this.#state = Object.freeze({
      status: "running",
      message:
        "Slice 6.4 is planning one short route and recording a bounded server-confirmed movement round-trip.",
    });
    this.#logger.info("Slice 6.4 movement debug live test started.", {
      testId,
      bounded: true,
      gameplayMutation: true,
      rawSocketAccess: false,
      userScriptInterrupted: false,
    });

    try {
      const runtimeBefore = this.#runtime.state();
      if (runtimeBefore.status === "running" || runtimeBefore.status === "paused") {
        throw new Slice64Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A user script is running or paused. Slice 6.4 did not interrupt it.",
          "preflight",
          true,
        );
      }

      const before = this.#character.state();
      const character = before.character;
      if (
        before.status !== "connected" ||
        !character ||
        !character.map ||
        !Number.isFinite(character.x) ||
        !Number.isFinite(character.y)
      ) {
        throw new Slice64Failure(
          "LIVE_TEST_CHARACTER_NOT_CONNECTED",
          "Connect one headless Character with a known map and position before running Slice 6.4.",
          "preflight",
          true,
        );
      }
      if (character.dead) {
        throw new Slice64Failure(
          "LIVE_TEST_CHARACTER_DEAD",
          "The connected Character is dead; movement telemetry was not exercised.",
          "preflight",
          true,
        );
      }

      const model = this.#mapModel.model();
      const map = model?.maps[character.map];
      if (!model || !map || map.ignored) {
        throw new Slice64Failure(
          "LIVE_TEST_NAVIGATION_MODEL_UNAVAILABLE",
          "The current Character map is not available in the verified navigation model.",
          "preflight",
          true,
        );
      }

      const probe = safeDirection(
        character.map,
        character.x as number,
        character.y as number,
        map,
      );
      if (!probe) {
        throw new Slice64Failure(
          "LIVE_TEST_NO_SAFE_MOVEMENT_PROBE",
          "No bounded 32-unit direct movement round-trip is collision-safe from the current position.",
          "preflight",
          true,
        );
      }

      const debugBefore = this.#movementDebug.state();
      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message:
          "A connected live Character, ready navigation model, idle user script, and safe bounded movement round-trip are available.",
        evidence: Object.freeze({
          characterId: before.characterId,
          characterName: before.characterName,
          serverKey: before.serverKey,
          map: character.map,
          x: character.x,
          y: character.y,
          direction: probe.direction,
          targetX: probe.x,
          targetY: probe.y,
          movementCountBefore: debugBefore.movementCount,
          plannedRouteCountBefore: debugBefore.plannedRouteCount,
          trailPointCountBefore: debugBefore.trailPointCount,
          userScriptStatus: runtimeBefore.status,
        }),
      }));

      const route = this.#planner.plan(
        { map: character.map, x: character.x as number, y: character.y as number },
        { map: character.map, x: probe.x, y: probe.y },
      );
      if (
        route.status !== "reachable" ||
        route.diagnostics.mapHops !== 0 ||
        route.legs.length !== 1 ||
        route.legs[0]?.kind !== "walk"
      ) {
        throw new Slice64Failure(
          "LIVE_TEST_ROUTE_NOT_DIRECT",
          "The bounded probe did not produce the expected single-leg same-map planned route.",
          "planned-route",
        );
      }
      const debugAfterPlan = this.#movementDebug.state();
      if (
        debugAfterPlan.plannedRouteCount !== debugBefore.plannedRouteCount + 1 ||
        debugAfterPlan.plannedRoute?.to.map !== character.map ||
        debugAfterPlan.plannedRoute?.to.x !== probe.x ||
        debugAfterPlan.plannedRoute?.to.y !== probe.y
      ) {
        throw new Slice64Failure(
          "LIVE_TEST_PLANNED_ROUTE_TELEMETRY_MISMATCH",
          "The movement debug service did not expose the route just produced by the path planner.",
          "planned-route",
        );
      }
      steps.push(Object.freeze({
        name: "planned-route",
        outcome: "passed",
        message:
          "The existing path planner produced one collision-safe same-map leg and the dashboard telemetry retained it.",
        evidence: Object.freeze({
          status: route.status,
          legCount: route.legs.length,
          mapHops: route.diagnostics.mapHops,
          totalWalkDistance: route.diagnostics.totalWalkDistance,
          target: route.to,
          plannedRouteCount: debugAfterPlan.plannedRouteCount,
        }),
      }));

      const outward = await this.#movement.runDashboardTest({
        mode: "move",
        direction: probe.direction,
      });
      if (outward.outcome !== "success" || !outward.result) {
        throw new Slice64Failure(
          outward.error?.code ?? "LIVE_TEST_OUTBOUND_MOVE_FAILED",
          outward.error?.message ??
            "The bounded outbound movement did not complete successfully.",
          "movement-trail",
        );
      }

      const afterOutward = this.#movementDebug.state();
      if (
        afterOutward.movementCount !== debugBefore.movementCount + 1 ||
        !hasConfirmedPoint(
          afterOutward,
          outward.requestId,
          character.map,
          outward.result.confirmedX,
          outward.result.confirmedY,
        )
      ) {
        throw new Slice64Failure(
          "LIVE_TEST_OUTBOUND_TRAIL_MISSING",
          "The server-confirmed outbound movement was not present in the movement trail.",
          "movement-trail",
        );
      }

      await this.#delay(RATE_LIMIT_SETTLE_MS);
      const returned = await this.#movement.runDashboardTest({
        mode: "move",
        direction: oppositeDirection(probe.direction),
      });
      if (returned.outcome !== "success" || !returned.result) {
        throw new Slice64Failure(
          returned.error?.code ?? "LIVE_TEST_RETURN_MOVE_FAILED",
          returned.error?.message ??
            "The bounded return movement did not complete successfully.",
          "movement-trail",
        );
      }

      const finalState = await this.#waitForOriginalPosition(
        character.map,
        character.x as number,
        character.y as number,
      );
      if (!finalState) {
        throw new Slice64Failure(
          "LIVE_TEST_FINAL_POSITION_NOT_CONFIRMED",
          "The Character did not return to the original server-observed position within the bounded verification window.",
          "final-state",
        );
      }

      const debugAfter = this.#movementDebug.state();
      if (
        debugAfter.movementCount !== debugBefore.movementCount + 2 ||
        !hasConfirmedPoint(
          debugAfter,
          returned.requestId,
          character.map,
          returned.result.confirmedX,
          returned.result.confirmedY,
        )
      ) {
        throw new Slice64Failure(
          "LIVE_TEST_RETURN_TRAIL_MISSING",
          "The server-confirmed return movement was not present in the movement trail.",
          "movement-trail",
        );
      }

      steps.push(Object.freeze({
        name: "movement-trail",
        outcome: "passed",
        message:
          "Two bounded dashboard-origin movements completed through the central Action Gateway and both server-confirmed positions are present in the actual movement trail.",
        evidence: Object.freeze({
          outwardRequestId: outward.requestId,
          outwardConfirmedX: outward.result.confirmedX,
          outwardConfirmedY: outward.result.confirmedY,
          returnRequestId: returned.requestId,
          returnConfirmedX: returned.result.confirmedX,
          returnConfirmedY: returned.result.confirmedY,
          movementCountDelta: debugAfter.movementCount - debugBefore.movementCount,
          trailPointCountBefore: debugBefore.trailPointCount,
          trailPointCountAfter: debugAfter.trailPointCount,
        }),
      }));

      const runtimeAfter = this.#runtime.state();
      if (
        runtimeAfter.status !== runtimeBefore.status ||
        runtimeAfter.runId !== runtimeBefore.runId
      ) {
        throw new Slice64Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_CHANGED",
          "The user script runtime changed during a test that must not control it.",
          "final-state",
        );
      }
      steps.push(Object.freeze({
        name: "final-state",
        outcome: "passed",
        message:
          "The Character returned to its original position, the user script runtime was untouched, and no raw socket path was used.",
        evidence: Object.freeze({
          map: character.map,
          originalX: character.x,
          originalY: character.y,
          finalX: finalState.character?.x,
          finalY: finalState.character?.y,
          userScriptStatusBefore: runtimeBefore.status,
          userScriptStatusAfter: runtimeAfter.status,
          userScriptInterrupted: false,
          actionGatewayRequired: true,
          gameplayMutation: true,
          rawSocketAccess: false,
        }),
      }));

      const result: Slice64LiveTestResult = Object.freeze({
        testId,
        slice: "6.4",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterId: before.characterId,
        characterName: before.characterName,
        serverKey: before.serverKey,
        message:
          "Slice 6.4 passed: the dashboard retained a real server-confirmed movement trail and the route produced by the existing path planner.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 6.4 movement debug live test passed.", {
        testId,
        outwardRequestId: outward.requestId,
        returnRequestId: returned.requestId,
        gameplayMutation: true,
        rawSocketAccess: false,
        userScriptInterrupted: false,
      });
      return structuredClone(result);
    } catch (error) {
      const failure = error instanceof Slice64Failure
        ? error
        : new Slice64Failure(
          "LIVE_TEST_SLICE_6_4_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice64LiveTestOutcome = failure.blocked
        ? "blocked"
        : "failed";
      const current = this.#character.state();
      const result: Slice64LiveTestResult = Object.freeze({
        testId,
        slice: "6.4",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterId: current.characterId,
        characterName: current.characterName,
        serverKey: current.serverKey,
        message: failure.message,
        steps: Object.freeze(steps),
        error: Object.freeze({
          code: failure.code,
          step: failure.step,
          message: failure.message,
        }),
      });
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      this.#logger.warn("Slice 6.4 movement debug live test did not pass.", {
        testId,
        outcome,
        errorCode: failure.code,
        step: failure.step,
        message: failure.message,
      });
      return structuredClone(result);
    }
  }

  async #waitForOriginalPosition(
    map: string,
    x: number,
    y: number,
  ): Promise<ReturnType<AdventureLandCharacterService["state"]> | undefined> {
    const started = Date.now();
    while (Date.now() - started <= FINAL_POSITION_TIMEOUT_MS) {
      const state = this.#character.state();
      if (
        state.status === "connected" &&
        state.character?.map === map &&
        state.character.x === x &&
        state.character.y === y
      ) {
        return state as ReturnType<AdventureLandCharacterService["state"]>;
      }
      await this.#delay(FINAL_POSITION_POLL_MS);
    }
    return undefined;
  }
}

class Slice64Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(
    code: string,
    message: string,
    step: string,
    blocked = false,
  ) {
    super(message);
    this.name = "Slice64Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function safeDirection(
  mapKey: string,
  x: number,
  y: number,
  map: NonNullable<ReturnType<AdventureLandMapModelService["map"]>>,
): Readonly<{
  direction: MovementDirection;
  x: number;
  y: number;
}> | undefined {
  const candidates: readonly Readonly<{
    direction: MovementDirection;
    dx: number;
    dy: number;
  }>[] = [
    { direction: "right", dx: 1, dy: 0 },
    { direction: "left", dx: -1, dy: 0 },
    { direction: "down", dx: 0, dy: 1 },
    { direction: "up", dx: 0, dy: -1 },
  ];
  for (const candidate of candidates) {
    const targetX = x + candidate.dx * MOVEMENT_STEP;
    const targetY = y + candidate.dy * MOVEMENT_STEP;
    if (
      map.bounds &&
      (
        targetX < map.bounds.minX ||
        targetX > map.bounds.maxX ||
        targetY < map.bounds.minY ||
        targetY > map.bounds.maxY
      )
    ) {
      continue;
    }
    if (
      canTraverseDirect(map.collision, x, y, targetX, targetY) &&
      canTraverseDirect(map.collision, targetX, targetY, x, y)
    ) {
      return Object.freeze({
        direction: candidate.direction,
        x: targetX,
        y: targetY,
      });
    }
  }
  void mapKey;
  return undefined;
}

function oppositeDirection(direction: MovementDirection): MovementDirection {
  switch (direction) {
    case "left": return "right";
    case "right": return "left";
    case "up": return "down";
    case "down": return "up";
  }
}

function hasConfirmedPoint(
  state: ReturnType<MovementDebugService["state"]>,
  requestId: string,
  map: string,
  x: number,
  y: number,
): boolean {
  return state.trail.some((point) =>
    point.kind === "confirmed" &&
    point.requestId === requestId &&
    point.map === map &&
    point.x === x &&
    point.y === y
  );
}
