import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes multi-character session state and Slice 7.1 one-click test", async () => {
  const html = readFileSync(
    new URL("../dashboard/index.html", import.meta.url),
    "utf8",
  );
  const script = readFileSync(
    new URL("../dashboard/app.js", import.meta.url),
    "utf8",
  );

  for (const id of [
    "character-sessions-status",
    "character-sessions-active",
    "character-sessions-limit",
    "character-sessions-game-data",
    "character-sessions-list",
    "start-slice-7-1-live-test",
    "slice-7-1-live-test-status",
    "copy-slice-7-1-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Multi-character sessions/);
  assert.match(html, /concurrent Character limit/);
  assert.match(script, /\/api\/character-sessions/);
  assert.match(script, /\/api\/live-test\/slice-7-1\/start/);
  assert.match(script, /renderCharacterSessions/);
  assert.match(script, /renderSlice71LiveTest/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice71-test" });
  let managed = false;
  const managerState = () => ({
    status: "ready",
    sessionLimit: 4,
    activeSessionCount: managed ? 2 : 1,
    managedSessionCount: managed ? 1 : 0,
    availableSlots: managed ? 2 : 3,
    sessions: managed
      ? [
        {
          role: "primary",
          characterId: "CH_PRIMARY",
          characterName: "Primary",
          serverKey: "SR_EUII",
          status: "connected",
          message: "Connected.",
        },
        {
          role: "managed",
          characterId: "CH_SECONDARY",
          characterName: "Secondary",
          serverKey: "SR_EUII",
          status: "connected",
          message: "Connected.",
        },
      ]
      : [{
        role: "primary",
        characterId: "CH_PRIMARY",
        characterName: "Primary",
        serverKey: "SR_EUII",
        status: "connected",
        message: "Connected.",
      }],
    sharedStaticData: { mode: "shared", gameDataVersion: 17397 },
    message: "Multi-character session manager ready.",
  });
  const manager = {
    state: () => managerState(),
    start: async (characterId: string) => {
      assert.equal(characterId, "CH_SECONDARY");
      managed = true;
      return managerState();
    },
    stop: async (characterId: string) => {
      assert.equal(characterId, "CH_SECONDARY");
      managed = false;
      return managerState();
    },
    stopAll: async () => {
      managed = false;
      return managerState();
    },
  };
  const liveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 7.1 multi-character session-manager test is ready.",
    }),
    run: async () => ({
      testId: "live71-dashboard",
      slice: "7.1",
      outcome: "passed",
      startedAt: "2026-10-04T01:00:00.000Z",
      completedAt: "2026-10-04T01:00:01.000Z",
      primaryCharacterId: "CH_PRIMARY",
      primaryCharacterName: "Primary",
      managedCharacterId: "CH_SECONDARY",
      managedCharacterName: "Secondary",
      serverKey: "SR_EUII",
      message: "Slice 7.1 passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    multiCharacterSessionManager: manager as any,
    slice71LiveTestService: liveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const initial = await fetch(`${url}/api/character-sessions`);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).activeSessionCount, 1);

    const started = await fetch(`${url}/api/character-sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: "CH_SECONDARY",
        serverKey: "SR_EUII",
      }),
    });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).activeSessionCount, 2);

    const stopped = await fetch(`${url}/api/character-sessions/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: "CH_SECONDARY" }),
    });
    assert.equal(stopped.status, 200);
    assert.equal((await stopped.json()).activeSessionCount, 1);

    const current = await fetch(`${url}/api/live-test/slice-7-1`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");

    const live = await fetch(`${url}/api/live-test/slice-7-1/start`, {
      method: "POST",
    });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "7.1");
    assert.match(
      payload.reportText,
      /ALRemastered Slice 7\.1 one-click multi-character session-manager test/,
    );
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
