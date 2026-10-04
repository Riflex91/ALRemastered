import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

function templateState(currentRole = "tank") {
  return {
    status: currentRole === "tank" ? "ready" : "degraded",
    memberCount: 1,
    recommendedCount: 1,
    matchedCount: currentRole === "tank" ? 1 : 0,
    assignments: [{
      characterId: "CH_WARRIOR",
      characterName: "Warrior",
      characterType: "warrior",
      sessionRole: "primary",
      connectionStatus: "connected",
      recommendedTemplateId: "warrior-tank",
      recommendedRole: "tank",
      currentRole,
      status: currentRole === "tank" ? "matched" : "override",
      matchesRecommendation: currentRole === "tank",
    }],
    templates: [
      { id: "warrior-tank", label: "Warrior Tank", role: "tank", appliesTo: "warrior" },
      { id: "priest-healer", label: "Priest Healer", role: "healer", appliesTo: "priest" },
      { id: "dps", label: "DPS", role: "dps", appliesTo: "all other Character classes" },
    ],
    templateLayerActive: true,
    coordinationTransport: "party-coordinator",
    localMessagingRequired: false,
    gameplayMutation: false,
    rawSocketAccess: false,
    message: "Party Templates ready.",
  };
}

test("dashboard exposes Party Templates assignment controls and Slice 7.4 one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "party-templates-status",
    "party-templates-matched",
    "party-template-member",
    "party-template-role",
    "assign-party-template-role",
    "clear-party-template-role",
    "apply-recommended-party-roles",
    "party-templates-list",
    "start-slice-7-4-live-test",
    "slice-7-4-live-test-status",
    "copy-slice-7-4-live-test-result",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Warrior Tank/);
  assert.match(html, /Priest Healer/);
  assert.match(html, /DPS/);
  assert.match(script, /\/api\/party-templates/);
  assert.match(script, /\/api\/live-test\/slice-7-4\/start/);
  assert.match(script, /renderPartyTemplates/);
  assert.match(script, /renderSlice74LiveTest/);

  let currentRole = "tank";
  const templates = {
    state: () => templateState(currentRole),
    assignRole: (_characterId: string, role: string) => {
      currentRole = role;
      return templateState(currentRole);
    },
    clearRole: () => {
      currentRole = "";
      return templateState(currentRole);
    },
    applyRecommendedRoles: () => {
      currentRole = "tank";
      return templateState(currentRole);
    },
  };
  const liveTest = {
    state: () => ({ status: "idle", message: "Slice 7.4 Party Templates test is ready." }),
    run: async () => ({
      testId: "live74-dashboard",
      slice: "7.4",
      outcome: "passed",
      startedAt: "2026-10-04T02:00:00.000Z",
      completedAt: "2026-10-04T02:00:01.000Z",
      managedCharacters: [],
      message: "Slice 7.4 passed.",
      steps: [],
    }),
  };

  const runtime = new CoreRuntime();
  runtime.start();
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "dashboard-slice74-test" }),
    runtime,
    partyTemplateService: templates as any,
    slice74LiveTestService: liveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/party-templates`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).matchedCount, 1);

    const assign = await fetch(`${url}/api/party-templates/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: "CH_WARRIOR", role: "dps" }),
    });
    assert.equal(assign.status, 200);
    assert.equal((await assign.json()).assignments[0].currentRole, "dps");

    const apply = await fetch(`${url}/api/party-templates/apply-recommended`, { method: "POST" });
    assert.equal(apply.status, 200);
    assert.equal((await apply.json()).assignments[0].currentRole, "tank");

    const clear = await fetch(`${url}/api/party-templates/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: "CH_WARRIOR" }),
    });
    assert.equal(clear.status, 200);

    const live = await fetch(`${url}/api/live-test/slice-7-4/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.match(payload.reportText, /ALRemastered Slice 7\.4 one-click Party Templates test/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
