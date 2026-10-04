import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

function cardsState() {
  return {
    status: "ready",
    selectedServerKey: "SR_EUII",
    activeSessionCount: 1,
    sessionLimit: 4,
    cards: [{
      characterId: "CH_PRIMARY",
      characterName: "Primary",
      characterType: "merchant",
      level: 50,
      accountOnline: false,
      sessionRole: "primary",
      connectionStatus: "connected",
      serverKey: "SR_EUII",
      hp: 900,
      maxHp: 1000,
      mp: 450,
      maxMp: 500,
      map: "main",
      target: "goo-1",
      dead: false,
      health: { status: "healthy", message: "Connected." },
      script: { scope: "primary", status: "running", name: "farmer", message: "Running." },
      controls: {
        start: { enabled: false, reason: "Already active." },
        pause: { enabled: true, reason: "Pause." },
        stop: { enabled: true, reason: "Stop." },
      },
    }],
    message: "Character Cards ready.",
  };
}

test("dashboard exposes beginner Character Cards controls and Slice 8.1 one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "character-cards-grid",
    "character-cards-status",
    "start-slice-8-1-live-test",
    "slice-8-1-live-test-status",
    "copy-slice-8-1-live-test-result",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Phase 8 beginner dashboard/);
  assert.match(html, /Character Cards/);
  assert.match(script, /\/api\/character-cards/);
  assert.match(script, /\/api\/live-test\/slice-8-1\/start/);
  assert.match(script, /data-character-action/);
  assert.match(script, /HP/);
  assert.match(script, /Target/);
  assert.match(script, /Health/);

  const calls: string[] = [];
  const cards = {
    state: () => cardsState(),
    start: async (id: string) => {
      calls.push(`start:${id}`);
      return cardsState();
    },
    pause: async (id: string) => {
      calls.push(`pause:${id}`);
      return cardsState();
    },
    stop: async (id: string) => {
      calls.push(`stop:${id}`);
      return cardsState();
    },
  };
  const liveTest = {
    state: () => ({ status: "idle", message: "Slice 8.1 Character Cards test is ready." }),
    run: async () => ({
      testId: "live81-dashboard",
      slice: "8.1",
      outcome: "passed",
      startedAt: "2026-10-04T08:00:00.000Z",
      completedAt: "2026-10-04T08:00:01.000Z",
      message: "Slice 8.1 passed.",
      steps: [],
    }),
  };

  const runtime = new CoreRuntime();
  runtime.start();
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "dashboard-slice81-test" }),
    runtime,
    characterCardsService: cards as any,
    slice81LiveTestService: liveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/character-cards`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).cards[0].health.status, "healthy");

    for (const action of ["start", "pause", "stop"]) {
      const response = await fetch(`${url}/api/character-cards/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: "CH_PRIMARY" }),
      });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(calls, [
      "start:CH_PRIMARY",
      "pause:CH_PRIMARY",
      "stop:CH_PRIMARY",
    ]);

    const live = await fetch(`${url}/api/live-test/slice-8-1/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.match(payload.reportText, /ALRemastered Slice 8\.1 one-click Character Cards test/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
