import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionGateway,
  ActionGatewayExecutionError,
} from "../src/action/gateway.ts";
import { Logger } from "../src/logging/logger.ts";

test("action gateway assigns request id and returns a structured success result", async () => {
  let now = 1_000;
  const logger = new Logger({ component: "action-gateway-test" });
  const gateway = new ActionGateway({
    logger,
    idFactory: () => "act-success-1",
    clock: () => new Date("2026-10-03T00:00:00.000Z"),
    nowMs: () => now,
  });

  const result = await gateway.run({
    action: "gateway.probe",
    origin: "dashboard",
    characterId: "CH_1",
    input: { marker: "local-only" },
    execute: ({ requestId, action, origin, characterId, input, signal }) => {
      now = 1_025;
      assert.equal(requestId, "act-success-1");
      assert.equal(action, "gateway.probe");
      assert.equal(origin, "dashboard");
      assert.equal(characterId, "CH_1");
      assert.equal(input.marker, "local-only");
      assert.equal(signal.aborted, false);
      return { ok: true };
    },
  });

  assert.equal(result.requestId, "act-success-1");
  assert.equal(result.outcome, "success");
  assert.equal(result.durationMs, 25);
  assert.deepEqual(result.result, { ok: true });
  assert.equal(result.error, undefined);
  assert.equal(gateway.state().active, 0);
  assert.equal(gateway.state().totalRequests, 1);
  assert.equal(gateway.state().lastResult?.requestId, "act-success-1");

  const exported = logger.exportText();
  assert.match(exported, /Action gateway request started/);
  assert.match(exported, /Action gateway request completed/);
  assert.match(exported, /"requestId":"act-success-1"/);
  assert.match(exported, /"origin":"dashboard"/);
});

test("action gateway rate guard rejects repeated action keys with retry information", async () => {
  let now = 5_000;
  let id = 0;
  let executions = 0;
  const logger = new Logger({ component: "action-rate-test" });
  const gateway = new ActionGateway({
    logger,
    idFactory: () => `act-rate-${++id}`,
    nowMs: () => now,
  });

  const execute = () => {
    executions += 1;
    return { ok: true };
  };

  const first = await gateway.run({
    action: "move",
    origin: "dashboard",
    characterId: "CH_1",
    input: {},
    minIntervalMs: 1_000,
    execute,
  });
  assert.equal(first.outcome, "success");

  now = 5_250;
  const second = await gateway.run({
    action: "move",
    origin: "dashboard",
    characterId: "CH_1",
    input: {},
    minIntervalMs: 1_000,
    execute,
  });
  assert.equal(second.outcome, "rate_limited");
  assert.equal(second.error?.code, "ACTION_RATE_LIMITED");
  assert.equal(second.retryAfterMs, 750);
  assert.equal(executions, 1);
  assert.equal(gateway.state().totalRequests, 2);
  assert.match(logger.exportText(), /Action gateway request rate-limited/);
});

test("action gateway aborts and reports a timeout without throwing to the caller", async () => {
  const logger = new Logger({ component: "action-timeout-test" });
  const gateway = new ActionGateway({
    logger,
    idFactory: () => "act-timeout-1",
    defaultTimeoutMs: 20,
  });

  let aborted = false;
  const result = await gateway.run({
    action: "slow-action",
    origin: "script",
    input: {},
    timeoutMs: 20,
    execute: ({ signal }) =>
      new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve();
        }, { once: true });
      }),
  });

  assert.equal(result.outcome, "timeout");
  assert.equal(result.error?.code, "ACTION_TIMEOUT");
  assert.equal(aborted, true);
  assert.equal(gateway.state().active, 0);
  assert.match(logger.exportText(), /Action gateway request timed out/);
});

test("action gateway normalizes execution failures and correlates sanitized logs", async () => {
  const logger = new Logger({ component: "action-error-test" });
  const gateway = new ActionGateway({
    logger,
    idFactory: () => "act-error-1",
  });

  const result = await gateway.run({
    action: "future.attack",
    origin: "system",
    characterId: "CH_2",
    input: { password: "must-not-be-logged" },
    execute: () => {
      throw new ActionGatewayExecutionError(
        "Rejected action password=private-value",
        "TARGET_INVALID",
      );
    },
  });

  assert.equal(result.outcome, "error");
  assert.equal(result.error?.code, "TARGET_INVALID");
  assert.match(result.error?.message ?? "", /Rejected action/);

  const exported = logger.exportText();
  assert.match(exported, /"requestId":"act-error-1"/);
  assert.match(exported, /"characterId":"CH_2"/);
  assert.match(exported, /"errorCode":"TARGET_INVALID"/);
  assert.doesNotMatch(exported, /must-not-be-logged|private-value/);
});

test("rate limits are isolated by origin, character and action by default", async () => {
  let now = 10_000;
  let id = 0;
  const gateway = new ActionGateway({
    logger: new Logger({ component: "action-rate-key-test" }),
    idFactory: () => `act-key-${++id}`,
    nowMs: () => now,
  });

  const common = {
    input: {},
    minIntervalMs: 5_000,
    execute: () => "ok",
  };

  assert.equal((await gateway.run({
    ...common,
    action: "move",
    origin: "dashboard",
    characterId: "CH_1",
  })).outcome, "success");

  assert.equal((await gateway.run({
    ...common,
    action: "move",
    origin: "script",
    characterId: "CH_1",
  })).outcome, "success");

  assert.equal((await gateway.run({
    ...common,
    action: "move",
    origin: "dashboard",
    characterId: "CH_2",
  })).outcome, "success");

  assert.equal((await gateway.run({
    ...common,
    action: "attack",
    origin: "dashboard",
    characterId: "CH_1",
  })).outcome, "success");

  now = 10_100;
  assert.equal((await gateway.run({
    ...common,
    action: "move",
    origin: "dashboard",
    characterId: "CH_1",
  })).outcome, "rate_limited");
});
