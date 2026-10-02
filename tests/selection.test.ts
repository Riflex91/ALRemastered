import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandSelectionService } from "../src/account/selection-service.ts";
import {
  AdventureLandSelectionError,
  AdventureLandSelectionSource,
} from "../src/account/selection-source.ts";

test("selection source authenticates with the in-memory account session and parses summaries", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const source = new AdventureLandSelectionSource(
    async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        success: true,
        infs: [{
          type: "servers_and_characters",
          characters: [{
            id: "CH_123",
            name: "RangerOne",
            type: "ranger",
            level: 42,
            online: 0,
            map: "main",
            home: "EU1",
          }],
          servers: [{
            key: "SR_EUI",
            name: "I",
            region: "EU",
            players: 123,
            address: "ignored.example",
            path: "/ignored",
          }],
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    "https://example.test/api/servers_and_characters",
  );

  const snapshot = await source.load({
    userId: "US_user123",
    auth: "session-secret",
    language: "de",
  });

  assert.equal(requestUrl, "https://example.test/api/servers_and_characters");
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("cookie"), "auth=US_user123-session-secret");
  assert.deepEqual(snapshot.characters, [{
    id: "CH_123",
    name: "RangerOne",
    type: "ranger",
    level: 42,
    online: false,
    serverKey: undefined,
    map: "main",
    home: "EU1",
  }]);
  assert.deepEqual(snapshot.servers, [{
    key: "SR_EUI",
    name: "I",
    region: "EU",
    players: 123,
  }]);
  assert.doesNotMatch(JSON.stringify(snapshot), /session-secret|ignored\.example/);
});

test("selection source returns safe authentication failures", async () => {
  const source = new AdventureLandSelectionSource(async () =>
    new Response(JSON.stringify({
      failed: true,
      reason: "not_logged_in",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

  await assert.rejects(
    () => source.load({ userId: "US_user123", auth: "private-auth" }),
    (error: unknown) => {
      assert.ok(error instanceof AdventureLandSelectionError);
      assert.equal(error.code, "not_logged_in");
      assert.match(error.message, /session is no longer valid/);
      assert.doesNotMatch(error.message, /private-auth|US_user123/);
      return true;
    },
  );
});

test("selection service loads characters and servers and only stores a server choice", async () => {
  const logger = new Logger({ component: "selection-test" });
  let session = { userId: "US_user123", auth: "private-auth" };
  const service = new AdventureLandSelectionService({
    logger,
    session: () => session,
    source: {
      load: async () => ({
        characters: [{
          id: "CH_1",
          name: "MageOne",
          type: "mage",
          level: 33,
          online: true,
          serverKey: "SR_EUI",
        }],
        servers: [
          { key: "SR_EUI", name: "I", region: "EU", players: 91 },
          { key: "SR_USI", name: "I", region: "US", players: 72 },
        ],
      }),
    },
    now: () => new Date("2026-10-02T21:00:00.000Z"),
  });

  const ready = await service.refresh();
  assert.equal(ready.status, "ready");
  assert.equal(ready.characters[0]?.name, "MageOne");
  assert.equal(ready.servers.length, 2);
  assert.equal(ready.selectedServerKey, undefined);

  const selected = service.selectServer("SR_USI");
  assert.equal(selected.selectedServerKey, "SR_USI");
  assert.match(selected.message, /No character has been started/);
  assert.match(logger.exportText(), /"characterStarted":false/);
  assert.doesNotMatch(logger.exportText(), /private-auth/);

  assert.throws(() => service.selectServer("SR_UNKNOWN"), /not available/);

  session = undefined as unknown as typeof session;
  const disconnected = await service.refresh();
  assert.equal(disconnected.status, "disconnected");
  assert.equal(disconnected.characters.length, 0);
  assert.equal(disconnected.servers.length, 0);
});
