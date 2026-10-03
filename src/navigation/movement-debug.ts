import type { ActionOrigin } from "../action/gateway.ts";
import type { MovementActionResult } from "../action/movement.ts";
import type { PathPlanResult } from "./path-planner.ts";

export interface MovementTrailPoint {
  readonly sequence: number;
  readonly recordedAt: string;
  readonly map: string;
  readonly x: number;
  readonly y: number;
  readonly kind: "start" | "confirmed";
  readonly requestId: string;
  readonly origin: ActionOrigin;
}

export interface ConfirmedMovementTelemetry {
  readonly requestId: string;
  readonly origin: ActionOrigin;
  readonly result: MovementActionResult;
}

export interface MovementDebugState {
  readonly status: "ready";
  readonly trailLimit: number;
  readonly trailPointCount: number;
  readonly movementCount: number;
  readonly plannedRouteCount: number;
  readonly trail: readonly MovementTrailPoint[];
  readonly plannedRoute?: PathPlanResult;
  readonly lastMovementAt?: string;
  readonly lastPlannedAt?: string;
  readonly message: string;
}

export interface MovementDebugServiceOptions {
  readonly trailLimit?: number;
  readonly clock?: () => Date;
}

const DEFAULT_TRAIL_LIMIT = 120;

export class MovementDebugService {
  readonly #trailLimit: number;
  readonly #clock: () => Date;
  readonly #trail: MovementTrailPoint[] = [];
  #sequence = 0;
  #movementCount = 0;
  #plannedRouteCount = 0;
  #plannedRoute?: PathPlanResult;
  #lastMovementAt?: string;
  #lastPlannedAt?: string;

  constructor(options: MovementDebugServiceOptions = {}) {
    this.#trailLimit = positiveInteger(options.trailLimit, DEFAULT_TRAIL_LIMIT);
    this.#clock = options.clock ?? (() => new Date());
  }

  recordMovement(event: ConfirmedMovementTelemetry): void {
    const recordedAt = this.#clock().toISOString();
    const { result } = event;
    this.#movementCount += 1;
    this.#lastMovementAt = recordedAt;

    this.#appendPoint({
      recordedAt,
      map: result.map,
      x: result.fromX,
      y: result.fromY,
      kind: "start",
      requestId: event.requestId,
      origin: event.origin,
    });
    this.#appendPoint({
      recordedAt,
      map: result.map,
      x: result.confirmedX,
      y: result.confirmedY,
      kind: "confirmed",
      requestId: event.requestId,
      origin: event.origin,
    });
  }

  recordPlan(plan: PathPlanResult): void {
    this.#plannedRouteCount += 1;
    this.#lastPlannedAt = this.#clock().toISOString();
    this.#plannedRoute = structuredClone(plan);
  }

  clearTrail(): void {
    this.#trail.length = 0;
  }

  state(): MovementDebugState {
    return Object.freeze({
      status: "ready",
      trailLimit: this.#trailLimit,
      trailPointCount: this.#trail.length,
      movementCount: this.#movementCount,
      plannedRouteCount: this.#plannedRouteCount,
      trail: Object.freeze(structuredClone(this.#trail)),
      plannedRoute: this.#plannedRoute
        ? structuredClone(this.#plannedRoute)
        : undefined,
      lastMovementAt: this.#lastMovementAt,
      lastPlannedAt: this.#lastPlannedAt,
      message:
        "Movement debug telemetry is ready. Trail points are server-confirmed movement observations and the planned route is read-only planner output.",
    });
  }

  #appendPoint(
    point: Omit<MovementTrailPoint, "sequence">,
  ): void {
    const previous = this.#trail.at(-1);
    if (
      previous &&
      previous.map === point.map &&
      previous.x === point.x &&
      previous.y === point.y
    ) {
      return;
    }

    this.#sequence += 1;
    this.#trail.push(Object.freeze({
      sequence: this.#sequence,
      ...point,
    }));
    if (this.#trail.length > this.#trailLimit) {
      this.#trail.splice(0, this.#trail.length - this.#trailLimit);
    }
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0
    ? value as number
    : fallback;
}
