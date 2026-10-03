import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes local Character messaging state and Slice 7.2 one-click test", async () => {
  const html = readFileSync(
    new URL("../dashboard/index.html", import.meta.url),
    "utf8",
  );
  const script = readFileSync(
    new URL("../dashboard/app.js", import.meta.url),
    "utf8",
  );

  for (const id of [
    "character-messaging-status",
    "character-messaging-requests",
    "character-messaging-deliveries",
    "character-messaging-unavailable",
    "start-slice-7-2-live-test",
    "slice-7-2-live-test-status",
    "copy-slice-7-2-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Local Character messaging/);
  assert.match(html, /send_cm\(\)/);
  assert.match(html, /character\.on\("cm"\)/);
  assert.match(script, /\/api\/character-messaging/);
  assert.match(script, /\/api\/live-test\/slice-7-2\/start/);
  assert.match(script, /renderCharacterMessaging/);
  assert.match(script, /renderSlice72LiveTest/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice72-test" });
  const messaging = {
    state: () => ({
      status: "ready",
      requestCount: 3,
      localDeliveryCount: 2,
      unavailableRecipientCount: 1,
      listenerCount: 0,
      localOnly: true,
      rawSocketAccess: false,
      message: "Local Character messaging ready.",
    }),
  };
  const liveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 7.2 local Character messaging test is ready.",
    }),
    run: async () => ({
      testId: "live72-dashboard",
      slice: "7.2",
      outcome: "passed",
      startedAt: "2026-10-04T01:30:00.000Z",
      completedAt: "2026-10-04T01:30:01.000Z",
      primaryCharacterId: "CH_PRIMARY",
      primaryCharacterName: "Primary",
      managedCharacterId: "CH_SECONDARY",
      managedCharacterName: "Secondary",
      serverKey: "SR_EUII",
      message: "Slice 7.2 passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    localCharacterMessagingService: messaging as any,
    slice72LiveTestService: liveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const currentMessaging = await fetch(`${url}/api/character-messaging`);
    assert.equal(currentMessaging.status, 200);
    const messagingPayload = await currentMessaging.json();
    assert.equal(messagingPayload.requestCount, 3);
    assert.equal(messagingPayload.localDeliveryCount, 2);
    assert.equal(messagingPayload.localOnly, true);
    assert.equal(messagingPayload.rawSocketAccess, false);

    const currentTest = await fetch(`${url}/api/live-test/slice-7-2`);
    assert.equal(currentTest.status, 200);
    assert.equal((await currentTest.json()).status, "idle");

    const live = await fetch(`${url}/api/live-test/slice-7-2/start`, {
      method: "POST",
    });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "7.2");
    assert.match(
      payload.reportText,
      /ALRemastered Slice 7\.2 one-click local Character messaging test/,
    );
    assert.match(payload.reportText, /"localOnly": true/);
    assert.match(payload.reportText, /"rawSocketAccess": false/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
