import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes read-only Party Coordinator state and Slice 7.3 one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "party-coordinator-status",
    "party-coordinator-members",
    "party-coordinator-target",
    "party-coordinator-roles",
    "party-coordinator-list",
    "start-slice-7-3-live-test",
    "slice-7-3-live-test-status",
    "copy-slice-7-3-live-test-result",
  ]) assert.match(html, new RegExp(\`id=["']\${id}["']\`));
  assert.match(html, /technical coordination state/i);
  assert.match(script, /\/api\/party-coordinator/);
  assert.match(script, /\/api\/live-test\/slice-7-3\/start/);
  assert.match(script, /renderPartyCoordinator/);
  assert.match(script, /renderSlice73LiveTest/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice73-test" });
  const coordinator = {
    state: () => ({
      status: "ready",
      memberCount: 2,
      assignedRoleCount: 2,
      target: { id: "target-1", setAt: "2026-10-04T01:00:00.000Z" },
      members: [],
      roles: {
        tank: { role: "tank", status: "ready", assignedCount: 1, readyCount: 1, notReadyCount: 0, memberIds: ["CH_PRIMARY"] },
        healer: { role: "healer", status: "ready", assignedCount: 1, readyCount: 1, notReadyCount: 0, memberIds: ["CH_SECONDARY"] },
        dps: { role: "dps", status: "unassigned", assignedCount: 0, readyCount: 0, notReadyCount: 0, memberIds: [] },
      },
      coordinationTransport: "shared-process-state",
      localMessagingRequired: false,
      gameplayMutation: false,
      rawSocketAccess: false,
      partyTemplatesActive: false,
      message: "Party coordinator ready.",
    }),
  };
  const liveTest = {
    state: () => ({ status: "idle", message: "Slice 7.3 Party Coordinator test is ready." }),
    run: async () => ({
      testId: "live73-dashboard",
      slice: "7.3",
      outcome: "passed",
      startedAt: "2026-10-04T01:00:00.000Z",
      completedAt: "2026-10-04T01:00:01.000Z",
      message: "Slice 7.3 passed.",
      steps: [],
    }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    partyCoordinatorService: coordinator as any,
    slice73LiveTestService: liveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(\`\${url}/api/party-coordinator\`);
    assert.equal(current.status, 200);
    const state = await current.json();
    assert.equal(state.memberCount, 2);
    assert.equal(state.target.id, "target-1");
    assert.equal(state.gameplayMutation, false);
    assert.equal(state.partyTemplatesActive, false);

    const status = await fetch(\`\${url}/api/live-test/slice-7-3\`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).status, "idle");

    const live = await fetch(\`\${url}/api/live-test/slice-7-3/start\`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.match(payload.reportText, /ALRemastered Slice 7\.3 one-click Party Coordinator test/);
    assert.match(payload.reportText, /"partyTemplatesActive": false/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
