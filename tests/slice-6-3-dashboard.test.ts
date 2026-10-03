import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes Slice 6.3 smart_move compatibility status and one-click report", async () => {
  const html = readFileSync(
    new URL("../dashboard/index.html", import.meta.url),
    "utf8",
  );
  const script = readFileSync(
    new URL("../dashboard/app.js", import.meta.url),
    "utf8",
  );

  for (const id of [
    "start-slice-6-3-live-test",
    "slice-6-3-live-test-status",
    "copy-slice-6-3-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /smart_move\(\) compatibility/);
  assert.match(html, /stable error reasons/);
  assert.match(script, /\/api\/live-test\/slice-6-3\/start/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice63-test" });
  const fakeSmartMove = {
    state: () => ({
      status: "ready",
      totalRequests: 2,
      completedRequests: 1,
      lastError: {
        code: "SMART_MOVE_TARGET_UNSUPPORTED",
        message: "unsupported",
      },
      message: "Smart-move compatibility service is ready.",
    }),
  };
  const fakeLiveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 6.3 smart_move() compatibility test is ready.",
    }),
    run: async () => ({
      testId: "live63-dashboard",
      slice: "6.3",
      outcome: "passed",
      startedAt: "2026-10-03T22:40:00.000Z",
      completedAt: "2026-10-03T22:40:00.100Z",
      message: "Slice 6.3 passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    smartMoveService: fakeSmartMove as any,
    slice63LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const smart = await fetch(`${url}/api/navigation/smart-move`);
    assert.equal(smart.status, 200);
    const smartState = await smart.json();
    assert.equal(smartState.status, "ready");
    assert.equal(
      smartState.lastError.code,
      "SMART_MOVE_TARGET_UNSUPPORTED",
    );

    const current = await fetch(`${url}/api/live-test/slice-6-3`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");

    const live = await fetch(
      `${url}/api/live-test/slice-6-3/start`,
      { method: "POST" },
    );
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "6.3");
    const report = JSON.parse(payload.reportText);
    assert.equal(
      report.smartMove.lastError.code,
      "SMART_MOVE_TARGET_UNSUPPORTED",
    );
    assert.match(
      payload.reportText,
      /ALRemastered Slice 6\.3 one-click smart_move compatibility test/,
    );
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
