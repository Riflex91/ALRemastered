import {
  ActionGatewayExecutionError,
  type ActionGateway,
  type ActionGatewayResult,
  type ActionOrigin,
} from "./gateway.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import { AdventureLandCharacterTransportError } from "../character/transport.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";

export type MovementMode = "move" | "xmove";
export type MovementDirection = "left" | "right" | "up" | "down";

export interface DashboardMovementRequest {
  readonly mode: MovementMode;
  readonly direction: MovementDirection;
}

export interface ScriptMovementRequest {
  readonly mode: MovementMode;
  readonly x: number;
  readonly y: number;
}

export interface MovementActionResult {
  readonly mode: MovementMode;
  readonly direction?: MovementDirection;
  readonly map: string;
  readonly fromX: number;
  readonly fromY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly transport: "move";
  readonly path: "direct";
  readonly confirmedX: number;
  readonly confirmedY: number;
  readonly serverConfirmed: true;
}

export interface AdventureLandMovementServiceOptions {
  readonly gateway: ActionGateway;
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "sendDirectMovement"
  >;
  readonly gameData: () => AdventureLandGameData | undefined;
  readonly stepDistance?: number;
}

const DEFAULT_STEP_DISTANCE = 32;
const MOVEMENT_RATE_INTERVAL_MS = 400;

export class AdventureLandMovementService {
  readonly #gateway: ActionGateway;
  readonly #character: Pick<
    AdventureLandCharacterService,
    "state" | "sendDirectMovement"
  >;
  readonly #gameData: () => AdventureLandGameData | undefined;
  readonly #stepDistance: number;

  constructor(options: AdventureLandMovementServiceOptions) {
    this.#gateway = options.gateway;
    this.#character = options.character;
    this.#gameData = options.gameData;
    this.#stepDistance = positiveStep(options.stepDistance);
  }

  runDashboardTest(
    request: DashboardMovementRequest,
  ): Promise<ActionGatewayResult<MovementActionResult>> {
    return this.run(request, "dashboard");
  }

  run(
    request: DashboardMovementRequest,
    origin: ActionOrigin,
  ): Promise<ActionGatewayResult<MovementActionResult>> {
    return this.#runRequest({
      mode: request.mode,
      direction: request.direction,
    }, origin);
  }

  runScript(
    request: ScriptMovementRequest,
  ): Promise<ActionGatewayResult<MovementActionResult>> {
    return this.#runRequest({
      mode: request.mode,
      targetX: request.x,
      targetY: request.y,
    }, "script");
  }

  #runRequest(
    request: {
      readonly mode: MovementMode;
      readonly direction?: MovementDirection;
      readonly targetX?: number;
      readonly targetY?: number;
    },
    origin: ActionOrigin,
  ): Promise<ActionGatewayResult<MovementActionResult>> {
    const action = request.mode === "xmove"
      ? "character.xmove"
      : "character.move";
    const characterId = this.#character.state().characterId;
    const input = request.direction
      ? { mode: request.mode, direction: request.direction }
      : { mode: request.mode, x: request.targetX, y: request.targetY };

    return this.#gateway.run({
      action,
      origin,
      characterId,
      input,
      timeoutMs: origin === "script" ? 3_000 : 1_500,
      minIntervalMs: MOVEMENT_RATE_INTERVAL_MS,
      rateLimitKey: [
        origin,
        characterId ?? "-",
        "character.movement",
      ].join(":"),
      execute: async ({ signal }) => {
        if (signal.aborted) {
          throw new ActionGatewayExecutionError(
            "Movement was cancelled before it started.",
            "MOVE_ABORTED",
          );
        }

        const state = this.#character.state();
        if (state.status !== "connected" || !state.character) {
          throw new ActionGatewayExecutionError(
            "Connect a headless character before movement.",
            "CHARACTER_NOT_CONNECTED",
          );
        }

        const map = state.character.map;
        const fromX = state.character.x;
        const fromY = state.character.y;
        if (
          !map ||
          typeof fromX !== "number" ||
          !Number.isFinite(fromX) ||
          typeof fromY !== "number" ||
          !Number.isFinite(fromY)
        ) {
          throw new ActionGatewayExecutionError(
            "Current character map and position are required before movement.",
            "MOVE_STATE_UNAVAILABLE",
          );
        }

        if (state.character.dead) {
          throw new ActionGatewayExecutionError(
            "A dead character cannot move.",
            "MOVE_CHARACTER_DEAD",
          );
        }

        const target = request.direction
          ? movementTarget(fromX, fromY, request.direction, this.#stepDistance)
          : {
              x: request.targetX,
              y: request.targetY,
            };
        if (
          typeof target.x !== "number" ||
          !Number.isFinite(target.x) ||
          typeof target.y !== "number" ||
          !Number.isFinite(target.y) ||
          (target.x === fromX && target.y === fromY)
        ) {
          throw new ActionGatewayExecutionError(
            "Movement requires a finite destination different from the current position.",
            "MOVE_TARGET_INVALID",
          );
        }

        const geometry = movementGeometry(this.#gameData(), map);
        if (!geometry) {
          throw new ActionGatewayExecutionError(
            "Adventure Land geometry is not loaded for the current map.",
            "MOVE_GEOMETRY_UNAVAILABLE",
          );
        }

        if (!canMoveDirect(
          geometry,
          fromX,
          fromY,
          target.x,
          target.y,
        )) {
          const xmove = request.mode === "xmove";
          throw new ActionGatewayExecutionError(
            xmove
              ? "XMove would require pathfinding from this position. Slice 4.2 exposes the direct path only."
              : "The requested direct movement is blocked by Adventure Land map geometry.",
            xmove ? "XMOVE_PATH_REQUIRED" : "MOVE_BLOCKED",
          );
        }

        let receipt;
        try {
          receipt = await this.#character.sendDirectMovement({
            x: target.x,
            y: target.y,
            signal,
          });
        } catch (error) {
          if (error instanceof AdventureLandCharacterTransportError) {
            throw new ActionGatewayExecutionError(
              error.message,
              movementErrorCode(error.code),
            );
          }
          throw error;
        }
        if (
          typeof receipt.confirmedX !== "number" ||
          typeof receipt.confirmedY !== "number"
        ) {
          throw new ActionGatewayExecutionError(
            "Adventure Land movement completed without a confirmed position.",
            "MOVE_NOT_CONFIRMED",
          );
        }
        return {
          mode: request.mode,
          direction: request.direction,
          map,
          fromX: receipt.fromX,
          fromY: receipt.fromY,
          targetX: receipt.targetX,
          targetY: receipt.targetY,
          transport: "move",
          path: "direct",
          confirmedX: receipt.confirmedX,
          confirmedY: receipt.confirmedY,
          serverConfirmed: true,
        };
      },
    });
  }
}

export interface AdventureLandMovementGeometry {
  readonly xLines: readonly MovementLine[];
  readonly yLines: readonly MovementLine[];
}

export type MovementLine = readonly [number, number, number];

export function canMoveDirect(
  geometry: AdventureLandMovementGeometry,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): boolean {
  if (![fromX, fromY, targetX, targetY].every(Number.isFinite)) return false;
  if (fromX === targetX && fromY === targetY) return false;

  // Adventure Land checks the four corners of a character rectangle. Using
  // the maximum normal character footprint is deliberately conservative.
  const base = { h: 12, v: 9.9, vn: 2 };
  const corners = [
    [-base.h, base.vn],
    [base.h, base.vn],
    [-base.h, -base.v],
    [base.h, -base.v],
  ] as const;

  for (const [dx, dy] of corners) {
    if (!pointPathClear(
      geometry,
      fromX + dx,
      fromY + dy,
      targetX + dx,
      targetY + dy,
    )) {
      return false;
    }
  }

  // Reject destinations whose final footprint straddles an orphan/fence line.
  return pointPathClear(
    geometry,
    targetX - base.h,
    targetY + base.vn,
    targetX + base.h,
    targetY + base.vn,
  ) &&
    pointPathClear(
      geometry,
      targetX - base.h,
      targetY - base.v,
      targetX + base.h,
      targetY - base.v,
    ) &&
    pointPathClear(
      geometry,
      targetX - base.h,
      targetY - base.v,
      targetX - base.h,
      targetY + base.vn,
    ) &&
    pointPathClear(
      geometry,
      targetX + base.h,
      targetY - base.v,
      targetX + base.h,
      targetY + base.vn,
    );
}

function pointPathClear(
  geometry: AdventureLandMovementGeometry,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const epsilon = 0.00001;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  for (const [lineX, lineMinY, lineMaxY] of geometry.xLines) {
    if (lineX < minX - epsilon || lineX > maxX + epsilon) continue;
    if (
      nearlyEqual(lineX, x1, epsilon) &&
      between(y1, lineMinY, lineMaxY, epsilon)
    ) {
      return false;
    }
    if (nearlyEqual(x0, x1, epsilon)) {
      if (
        nearlyEqual(lineX, x0, epsilon) &&
        rangesOverlap(y0, y1, lineMinY, lineMaxY, epsilon)
      ) {
        return false;
      }
      continue;
    }
    const crossingY = y0 + (y1 - y0) * (lineX - x0) / (x1 - x0);
    if (between(crossingY, lineMinY, lineMaxY, epsilon)) return false;
  }

  for (const [lineY, lineMinX, lineMaxX] of geometry.yLines) {
    if (lineY < minY - epsilon || lineY > maxY + epsilon) continue;
    if (
      nearlyEqual(lineY, y1, epsilon) &&
      between(x1, lineMinX, lineMaxX, epsilon)
    ) {
      return false;
    }
    if (nearlyEqual(y0, y1, epsilon)) {
      if (
        nearlyEqual(lineY, y0, epsilon) &&
        rangesOverlap(x0, x1, lineMinX, lineMaxX, epsilon)
      ) {
        return false;
      }
      continue;
    }
    const crossingX = x0 + (x1 - x0) * (lineY - y0) / (y1 - y0);
    if (between(crossingX, lineMinX, lineMaxX, epsilon)) return false;
  }

  return true;
}

export function movementGeometry(
  data: AdventureLandGameData | undefined,
  map: string,
): AdventureLandMovementGeometry | undefined {
  if (!data) return undefined;
  const raw = data.geometry[map];
  if (!isRecord(raw)) return undefined;
  return {
    xLines: parseLines(raw.x_lines),
    yLines: parseLines(raw.y_lines),
  };
}

function parseLines(value: unknown): readonly MovementLine[] {
  if (!Array.isArray(value)) return [];
  const lines: MovementLine[] = [];
  for (const line of value) {
    if (
      Array.isArray(line) &&
      line.length >= 3 &&
      line.slice(0, 3).every((entry) =>
        typeof entry === "number" && Number.isFinite(entry)
      )
    ) {
      const a = line[0] as number;
      const b = line[1] as number;
      const c = line[2] as number;
      lines.push([a, Math.min(b, c), Math.max(b, c)]);
    }
  }
  return lines;
}

function movementTarget(
  x: number,
  y: number,
  direction: MovementDirection,
  step: number,
): { readonly x: number; readonly y: number } {
  switch (direction) {
    case "left": return { x: x - step, y };
    case "right": return { x: x + step, y };
    case "up": return { x, y: y - step };
    case "down": return { x, y: y + step };
  }
}

function movementErrorCode(code: string): string {
  if (code === "movement_not_confirmed") return "MOVE_NOT_CONFIRMED";
  if (code === "movement_aborted") return "MOVE_ABORTED";
  if (
    code === "movement_not_connected" ||
    code === "movement_transport_unavailable"
  ) return "MOVE_TRANSPORT_UNAVAILABLE";
  if (code === "movement_state_unavailable") return "MOVE_STATE_UNAVAILABLE";
  if (code === "movement_target_invalid") return "MOVE_TARGET_INVALID";
  return "MOVE_TRANSPORT_ERROR";
}

function positiveStep(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.min(64, Math.max(8, Math.floor(value)))
    : DEFAULT_STEP_DISTANCE;
}

function between(
  value: number,
  min: number,
  max: number,
  epsilon: number,
): boolean {
  return value >= Math.min(min, max) - epsilon &&
    value <= Math.max(min, max) + epsilon;
}

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  epsilon: number,
): boolean {
  return Math.max(Math.min(a0, a1), Math.min(b0, b1)) <=
    Math.min(Math.max(a0, a1), Math.max(b0, b1)) + epsilon;
}

function nearlyEqual(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
