import assert from "node:assert/strict";
import { test } from "node:test";
import { MovementDebugService } from "../src/navigation/movement-debug.ts";

test("movement debug keeps a bounded server-confirmed trail and last planned route", () => {
  let tick = 0;
  const service = new MovementDebugService({
    trailLimit: 3,
    clock: () => new Date(1_800_000_000_000 + tick++ * 1_000),
  });

  const route = {
    status: "reachable",
    message: "Reachable route found on the current map.",
    from: { map: "main", x: 0, y: 0 },
    to: { map: "main", x: 30, y: 0 },
    waypoints: [
      { id: "__start__", kind: "start", map: "main", x: 0, y: 0 },
      { id: "__target__", kind: "target", map: "main", x: 30, y: 0 },
    ],
    legs: [
      {
        kind: "walk",
        from: { id: "__start__", kind: "start", map: "main", x: 0, y: 0 },
        to: { id: "__target__", kind: "target", map: "main", x: 30, y: 0 },
        distance: 30,
      },
    ],
    diagnostics: {
      candidateNodeCount: 2,
      walkEdgeCount: 2,
      transitionEdgeCount: 0,
      directChecks: 1,
      expandedNodes: 1,
      mapHops: 0,
      totalWalkDistance: 30,
      totalCost: 30,
      skippedIgnoredMaps: 0,
      skippedInvalidTransitions: 0,
      skippedConditionalTransitions: 0,
      visitedMaps: ["main"],
    },
  } as const;

  service.recordPlan(route);
  service.recordMovement({
    requestId: "move-1",
    origin: "script",
    result: {
      mode: "move",
      map: "main",
      fromX: 0,
      fromY: 0,
      targetX: 10,
      targetY: 0,
      transport: "move",
      path: "direct",
      confirmedX: 10,
      confirmedY: 0,
      serverConfirmed: true,
    },
  });
  service.recordMovement({
    requestId: "move-2",
    origin: "dashboard",
    result: {
      mode: "move",
      direction: "right",
      map: "main",
      fromX: 10,
      fromY: 0,
      targetX: 20,
      targetY: 0,
      transport: "move",
      path: "direct",
      confirmedX: 20,
      confirmedY: 0,
      serverConfirmed: true,
    },
  });
  service.recordMovement({
    requestId: "move-3",
    origin: "script",
    result: {
      mode: "move",
      map: "main",
      fromX: 20,
      fromY: 0,
      targetX: 30,
      targetY: 0,
      transport: "move",
      path: "direct",
      confirmedX: 30,
      confirmedY: 0,
      serverConfirmed: true,
    },
  });

  const state = service.state();
  assert.equal(state.status, "ready");
  assert.equal(state.trailLimit, 3);
  assert.equal(state.movementCount, 3);
  assert.equal(state.plannedRouteCount, 1);
  assert.equal(state.trailPointCount, 3);
  assert.deepEqual(
    state.trail.map((point) => [point.x, point.y]),
    [[10, 0], [20, 0], [30, 0]],
  );
  assert.equal(state.trail[2]?.kind, "confirmed");
  assert.equal(state.trail[2]?.requestId, "move-3");
  assert.equal(state.plannedRoute?.status, "reachable");
  assert.equal(state.plannedRoute?.to.x, 30);

  service.clearTrail();
  const cleared = service.state();
  assert.equal(cleared.trailPointCount, 0);
  assert.equal(cleared.movementCount, 3);
  assert.equal(cleared.plannedRouteCount, 1);
});
