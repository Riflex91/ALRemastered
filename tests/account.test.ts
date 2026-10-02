import assert from "node:assert/strict";
import { test } from "node:test";
import { AdventureLandAccountService } from "../src/account/service.ts";
import {
  AdventureLandAccountSource,
  AdventureLandAccountError,
} from "../src/account/source.ts";
import { Logger } from "../src/logging/logger.ts";

test("account source logs in through Adventure Land without signing up", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const source = new AdventureLandAccountSource(
    async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        success: true,
        user: "user-123",
        auth: "session-secret",
        language: "en",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    "https://example.test/api/signup_or_login",
  );

  const session = await source.login({
    email: "player@example.test",
    password: "password-secret",
  });

  assert.equal(requestUrl, "https://example.test/api/signup_or_login");
  assert.equal(requestInit?.method, "POST");
  const payload = JSON.parse(String(requestInit?.body));
  assert.deepEqual(payload, {
    email: "player@example.test",
    password: "password-secret",
    only_login: true,
    mobile: true,
  });
  assert.equal(session.userId, "user-123");
  assert.equal(session.auth, "session-secret");
  assert.equal(session.language, "en");
});

test("account source exposes explicit safe login failures", async () => {
  const source = new AdventureLandAccountSource(async () =>
    new Response(JSON.stringify({
      failed: true,
      reason: "wrong_password",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

  await assert.rejects(
    () => source.login({
      email: "player@example.test",
      password: "wrong-secret",
    }),
    (error: unknown) => {
      assert.ok(error instanceof AdventureLandAccountError);
      assert.equal(error.code, "wrong_password");
      assert.match(error.message, /rejected the email or password/);
      assert.doesNotMatch(error.message, /wrong-secret|player@example\.test/);
      return true;
    },
  );
});

test("account service keeps the auth session in memory but never exposes it in public state", async () => {
  const logger = new Logger({ component: "account-test" });
  const service = new AdventureLandAccountService({
    logger,
    source: {
      login: async () => ({
        userId: "user-123",
        auth: "super-secret-auth",
        language: "en",
      }),
    },
    now: () => new Date("2026-10-02T20:00:00.000Z"),
  });

  const state = await service.login({
    email: "player@example.test",
    password: "super-secret-password",
  });

  assert.equal(state.status, "connected");
  assert.equal(state.userId, "user-123");
  assert.equal(state.connectedAt, "2026-10-02T20:00:00.000Z");
  assert.equal("auth" in state, false);
  assert.equal("password" in state, false);
  assert.equal(service.session()?.auth, "super-secret-auth");

  const exported = logger.exportText();
  assert.doesNotMatch(exported, /super-secret-auth|super-secret-password|player@example\.test/);

  const disconnected = service.disconnect();
  assert.equal(disconnected.status, "disconnected");
  assert.equal(service.session(), undefined);
});
