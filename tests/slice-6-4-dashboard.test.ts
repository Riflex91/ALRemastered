import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes Slice 6.4 movement trail and planned route debug state", async () => {
  const html = readFileSync(
    new URL("../dashboard/index.html", import.meta.url),
    "utf8",
  );
  const script = readFileSync(
    new URL("../dashboard/app.js", import.meta.url),
    "utf8",
  );

  for (const id of [
    "start-slice-6-4-live-test",
    "slice-6-4-live-test-status",
    "copy-slice-6-4-live-test-result",
    "movement-debug-status",
    "movement-debug-trail-count",
    "movement-debug-movement-count",
    "movement-debug-plan-count",
    "movement-debug-trail",
    "movement-debug-route",
    "movement-debug-note",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /movement trail and planned route/i);
  assert.match(html, /server-confirmed movement through the central Action Gateway/i);
  assert.match(script, /\/api\/navigation\/movement-debug/);
  assert.match(script, /\/api\/live-test\/slice-6-4\/start/);
  assert.match(script, /No confirmed movement recorded yet/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice64-test" });
  const fakeMovementDebug = {
    state: () => ({
      status: "ready",
      trailLimit: 120,
      trailPointCount: 2,
      movementCount: 1,
      plannedRouteCount: 1,
      trail: [
        {
          sequence: 1,
          recordedAt: "2026-10-03T22:30:00.000Z",
          map: "main",
          x: 0,
          y: 0,
          kind: "start",
          requestId: "move-1",
          origin: "script",
        },
        {
          sequence: 2,
          recordedAt: "2026-10-03T22:30:00.000Z",
          map: "main",
          x: 32,
          y: 0,
          kind: "confirmed",
          requestId: "move-1",
          origin: "script",
        },
      ],
      plannedRoute: {
        status: "reachable",
        message: "Reachable route found on the current map.",
        from: { map: "main", x: 0, y: 0 },
        to: { map: "main", x: 32, y: 0 },
        waypoints: [],
        legs: [],
        diagnostics: {
          candidateNodeCount: 2,
          walkEdgeCount: 2,
          transitionEdgeCount: 0,
          directChecks: 1,
          expandedNodes: 1,
          mapHops: 0,
          totalWalkDistance: 32,
          totalCost: 32,
          skippedIgnoredMaps: 0,
          skippedInvalidTransitions: 0,
          skippedConditionalTransitions: 0,
          visitedMaps: ["main"],
        },
      },
      lastMovementAt: "2026-10-03T22:30:00.000Z",
      lastPlannedAt: "2026-10-03T22:29:59.000Z",
      message: "Movement debug telemetry is ready.",
    }),
  };

  const fakeLiveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 6.4 movement-trail and planned-route test is ready.",
    }),
    run: async () => ({
      testId: "live64-dashboard",
      slice: "6.4",
      outcome: "passed",
      startedAt: "2026-10-04T00:30:00.000Z",
      completedAt: "2026-10-04T00:30:01.000Z",
      characterId: "CH_64",
      characterName: "TrailTester",
      serverKey: "SR_EUII",
      message: "Slice 6.4 passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    movementDebugService: fakeMovementDebug as any,
    slice64LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const response = await fetch(`${url}/api/navigation/movement-debug`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, "ready");
    assert.equal(payload.trailPointCount, 2);
    assert.equal(payload.movementCount, 1);
    assert.equal(payload.plannedRouteCount, 1);
    assert.equal(payload.trail[1].kind, "confirmed");
    assert.equal(payload.plannedRoute.status, "reachable");

    const current = await fetch(`${url}/api/live-test/slice-6-4`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");

    const live = await fetch(`${url}/api/live-test/slice-6-4/start`, {
      method: "POST",
    });
    assert.equal(live.status, 200);
    const livePayload = await live.json();
    assert.equal(livePayload.result.outcome, "passed");
    assert.equal(livePayload.result.slice, "6.4");
    assert.equal(livePayload.movementDebug, undefined);
    assert.match(
      livePayload.reportText,
      /ALRemastered Slice 6\.4 one-click movement trail and planned-route test/,
    );
    assert.equal(livePayload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
