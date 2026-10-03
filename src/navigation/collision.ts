import type { MapCollisionGeometry } from "./map-model.ts";

export interface NavigationPoint {
  readonly x: number;
  readonly y: number;
}

export function canTraverseDirect(
  geometry: Pick<MapCollisionGeometry, "xLines" | "yLines">,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): boolean {
  if (![fromX, fromY, targetX, targetY].every(Number.isFinite)) return false;
  if (fromX === targetX && fromY === targetY) return false;

  // Match Adventure Land's normal-character footprint conservatively.
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

export function euclideanDistance(
  a: NavigationPoint,
  b: NavigationPoint,
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointPathClear(
  geometry: Pick<MapCollisionGeometry, "xLines" | "yLines">,
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
