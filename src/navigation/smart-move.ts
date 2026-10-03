import type { AdventureLandMovementService } from "../action/movement.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger } from "../logging/logger.ts";
import type { AdventureLandMapModelService } from "./map-model.ts";
import type {
  PathLocation,
  PathPlanResult,
  SimplePathPlannerService,
} from "./path-planner.ts";

export type SmartMoveTarget =
  | string
  | Readonly<{
    readonly map?: string;
    readonly x?: number;
    readonly y?: number;
  }>;

export interface SmartMoveResult {
  readonly status: "already_there" | "completed";
  readonly target: PathLocation;
  readonly route: PathPlanResult;
  readonly movement?: Readonly<{
    readonly requestId: string;
    readonly confirmedX: number;
    readonly confirmedY: number;
  }>;
}

export interface SmartMoveState {
  readonly status: "ready" | "unavailable";
  readonly totalRequests: number;
  readonly completedRequests: number;
  readonly lastResult?: SmartMoveResult;
  readonly lastError?: Readonly<{
    readonly code: string;
    readonly message: string;
  }>;
  readonly message: string;
}

export interface SmartMoveServiceOptions {
  readonly logger: Logger;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly mapModel: Pick<AdventureLandMapModelService, "model">;
  readonly planner: Pick<SimplePathPlannerService, "plan">;
  readonly movement: Pick<AdventureLandMovementService, "runScript">;
}

export class SmartMoveService {
  readonly #logger: Logger;
  readonly #character: SmartMoveServiceOptions["character"];
  readonly #mapModel: SmartMoveServiceOptions["mapModel"];
  readonly #planner: SmartMoveServiceOptions["planner"];
  readonly #movement: SmartMoveServiceOptions["movement"];
  #totalRequests = 0;
  #completedRequests = 0;
  #lastResult?: SmartMoveResult;
  #lastError?: { readonly code: string; readonly message: string };

  constructor(options: SmartMoveServiceOptions) {
    this.#logger = options.logger;
    this.#character = options.character;
    this.#mapModel = options.mapModel;
    this.#planner = options.planner;
    this.#movement = options.movement;
  }

  state(): SmartMoveState {
    return Object.freeze({
      status: this.#mapModel.model() ? "ready" : "unavailable",
      totalRequests: this.#totalRequests,
      completedRequests: this.#completedRequests,
      lastResult: this.#lastResult ? structuredClone(this.#lastResult) : undefined,
      lastError: this.#lastError ? Object.freeze({ ...this.#lastError }) : undefined,
      message: this.#mapModel.model()
        ? "Smart-move compatibility service is ready."
        : "Smart-move compatibility service is waiting for the navigation model.",
    });
  }

  async run(targetInput: unknown): Promise<SmartMoveResult> {
    this.#totalRequests += 1;
    try {
      const state = this.#character.state();
      const character = state.character;
      if (
        state.status !== "connected" ||
        !character ||
        !character.map ||
        !Number.isFinite(character.x) ||
        !Number.isFinite(character.y)
      ) {
        throw new SmartMoveError(
          "SMART_MOVE_CHARACTER_NOT_CONNECTED",
          "smart_move() requires a connected Character with a known map and position.",
        );
      }
      if (character.dead) {
        throw new SmartMoveError(
          "SMART_MOVE_CHARACTER_DEAD",
          "smart_move() cannot run while the Character is dead.",
        );
      }

      const from: PathLocation = Object.freeze({
        map: character.map,
        x: character.x as number,
        y: character.y as number,
      });
      const target = this.#resolveTarget(targetInput, from);
      const route = this.#planner.plan(from, target);

      if (route.status === "invalid") {
        throw new SmartMoveError(
          smartMovePlannerCode(route.reasonCode),
          route.message,
        );
      }
      if (route.status === "unreachable") {
        throw new SmartMoveError(
          "SMART_MOVE_ROUTE_UNREACHABLE",
          route.message,
        );
      }

      if (route.legs.length === 0) {
        const result: SmartMoveResult = Object.freeze({
          status: "already_there",
          target,
          route,
        });
        this.#recordSuccess(result);
        return structuredClone(result);
      }

      if (route.diagnostics.mapHops > 0) {
        throw new SmartMoveError(
          "SMART_MOVE_TRANSITION_EXECUTION_UNAVAILABLE",
          "smart_move() planned a cross-map route, but automatic door/transition execution is not enabled in Slice 6.3.",
        );
      }

      if (
        route.legs.length !== 1 ||
        route.legs[0]?.kind !== "walk" ||
        route.legs[0].to.map !== from.map ||
        route.legs[0].to.x !== target.x ||
        route.legs[0].to.y !== target.y
      ) {
        throw new SmartMoveError(
          "SMART_MOVE_MULTI_LEG_EXECUTION_UNAVAILABLE",
          "smart_move() planned a multi-leg same-map route. Slice 6.3 executes only one collision-safe direct leg.",
        );
      }

      const movement = await this.#movement.runScript({
        mode: "move",
        x: target.x,
        y: target.y,
      });
      if (movement.outcome !== "success" || !movement.result) {
        throw smartMoveMovementError(movement);
      }

      const result: SmartMoveResult = Object.freeze({
        status: "completed",
        target,
        route,
        movement: Object.freeze({
          requestId: movement.requestId,
          confirmedX: movement.result.confirmedX,
          confirmedY: movement.result.confirmedY,
        }),
      });
      this.#recordSuccess(result);
      return structuredClone(result);
    } catch (error) {
      const normalized = error instanceof SmartMoveError
        ? error
        : new SmartMoveError(
          "SMART_MOVE_FAILED",
          error instanceof Error ? error.message : String(error),
        );
      this.#lastError = Object.freeze({
        code: normalized.code,
        message: normalized.message,
      });
      this.#logger.warn("Smart-move request rejected.", {
        code: normalized.code,
        message: normalized.message,
      });
      throw normalized;
    }
  }

  #resolveTarget(targetInput: unknown, from: PathLocation): PathLocation {
    const model = this.#mapModel.model();
    if (!model) {
      throw new SmartMoveError(
        "SMART_MOVE_MODEL_UNAVAILABLE",
        "smart_move() cannot resolve a target before the navigation model is ready.",
      );
    }

    if (typeof targetInput === "string") {
      const mapKey = targetInput.trim();
      if (!mapKey) {
        throw new SmartMoveError(
          "SMART_MOVE_TARGET_INVALID",
          "smart_move() requires a non-empty destination.",
        );
      }
      const map = model.maps[mapKey];
      if (!map) {
        throw new SmartMoveError(
          "SMART_MOVE_TARGET_UNSUPPORTED",
          "String smart_move() targets currently support navigation map keys only.",
        );
      }
      if (map.ignored) {
        throw new SmartMoveError(
          "SMART_MOVE_TARGET_IGNORED",
          `smart_move() cannot route to ignored map ${mapKey}.`,
        );
      }
      const spawn = map.spawnPoints[0];
      if (!spawn) {
        throw new SmartMoveError(
          "SMART_MOVE_TARGET_UNRESOLVED",
          `smart_move() could not resolve a default spawn for map ${mapKey}.`,
        );
      }
      return Object.freeze({ map: mapKey, x: spawn.x, y: spawn.y });
    }

    if (
      typeof targetInput !== "object" ||
      targetInput === null ||
      Array.isArray(targetInput)
    ) {
      throw new SmartMoveError(
        "SMART_MOVE_TARGET_INVALID",
        "smart_move() requires a map name or a destination object.",
      );
    }

    const target = targetInput as Record<string, unknown>;
    const map = typeof target.map === "string" && target.map.trim()
      ? target.map.trim()
      : from.map;
    const x = finiteNumber(target.x);
    const y = finiteNumber(target.y);

    if (x === undefined || y === undefined) {
      if (x !== undefined || y !== undefined) {
        throw new SmartMoveError(
          "SMART_MOVE_TARGET_INVALID",
          "smart_move() coordinate destinations require both finite x and y.",
        );
      }
      const mapEntry = model.maps[map];
      if (!mapEntry) {
        throw new SmartMoveError(
          "SMART_MOVE_TARGET_UNKNOWN_MAP",
          `smart_move() target map ${map} is not present in the navigation model.`,
        );
      }
      const spawn = mapEntry.spawnPoints[0];
      if (!spawn) {
        throw new SmartMoveError(
          "SMART_MOVE_TARGET_UNRESOLVED",
          `smart_move() could not resolve a default spawn for map ${map}.`,
        );
      }
      return Object.freeze({ map, x: spawn.x, y: spawn.y });
    }

    return Object.freeze({ map, x, y });
  }

  #recordSuccess(result: SmartMoveResult): void {
    this.#completedRequests += 1;
    this.#lastResult = result;
    this.#lastError = undefined;
    this.#logger.info("Smart-move request completed.", {
      status: result.status,
      targetMap: result.target.map,
      targetX: result.target.x,
      targetY: result.target.y,
      mapHops: result.route.diagnostics.mapHops,
      legCount: result.route.legs.length,
      movementRequestId: result.movement?.requestId,
    });
  }
}

export class SmartMoveError extends Error {
  readonly code: string;
  readonly retryAfterMs?: number;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    retryAfterMs?: number,
    requestId?: string,
  ) {
    super(message);
    this.name = "SmartMoveError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.requestId = requestId;
  }
}

function smartMovePlannerCode(reasonCode: string | undefined): string {
  switch (reasonCode) {
    case "PATH_MAP_UNKNOWN":
      return "SMART_MOVE_TARGET_UNKNOWN_MAP";
    case "PATH_MAP_IGNORED":
      return "SMART_MOVE_TARGET_IGNORED";
    case "PATH_LOCATION_OUT_OF_BOUNDS":
      return "SMART_MOVE_TARGET_OUT_OF_BOUNDS";
    case "PATH_LOCATION_INVALID":
      return "SMART_MOVE_TARGET_INVALID";
    case "PATH_MODEL_UNAVAILABLE":
      return "SMART_MOVE_MODEL_UNAVAILABLE";
    default:
      return "SMART_MOVE_ROUTE_INVALID";
  }
}

function smartMoveMovementError(
  result: Awaited<ReturnType<AdventureLandMovementService["runScript"]>>,
): SmartMoveError {
  const sourceCode = result.error?.code;
  let code = "SMART_MOVE_EXECUTION_FAILED";
  if (sourceCode === "CHARACTER_NOT_CONNECTED") {
    code = "SMART_MOVE_CHARACTER_NOT_CONNECTED";
  } else if (sourceCode === "MOVE_CHARACTER_DEAD") {
    code = "SMART_MOVE_CHARACTER_DEAD";
  } else if (sourceCode === "MOVE_BLOCKED") {
    code = "SMART_MOVE_ROUTE_STALE_OR_BLOCKED";
  } else if (sourceCode === "MOVE_NOT_CONFIRMED") {
    code = "SMART_MOVE_NOT_CONFIRMED";
  } else if (sourceCode === "ACTION_RATE_LIMITED") {
    code = "SMART_MOVE_RATE_LIMITED";
  } else if (sourceCode === "ACTION_TIMEOUT") {
    code = "SMART_MOVE_TIMEOUT";
  }
  return new SmartMoveError(
    code,
    result.error?.message ?? "smart_move() movement execution failed.",
    result.retryAfterMs,
    result.requestId,
  );
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
