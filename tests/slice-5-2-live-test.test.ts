import assert from "node:assert/strict";
import { test } from "node:test";
import { Slice52LiveTestService } from "../src/live-test/slice-5-2.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 5.2 verifies disconnect, backoff, reconnect, ordered logs, and fresh state", async () => {
  const logger = new Logger({ component: "slice-5-2-test" });
  let heartbeatSequence = 10;
  let reconnectCount = 0;
  let state:any = {
    status: "connected",
    characterId: "CH_1",
    characterName: "RangerOne",
    serverKey: "SR_EUII",
    heartbeatSequence,
    reconnectCount,
    message: "connected",
  };
  const character = {
    state: () => structuredClone(state),
    interruptForReconnectTest: () => {
      const disconnectedAt = new Date().toISOString();
      state = {
        ...state,
        status: "reconnecting",
        reconnectAttempt: 1,
        reconnectDelayMs: 500,
        reconnectScheduledAt: new Date(Date.now() + 500).toISOString(),
        lastDisconnectAt: disconnectedAt,
        errorCode: "socket_closed",
      };
      logger.warn("Adventure Land headless character connection closed unexpectedly.", {
        characterId: "CH_1", reason: "slice52_live_test",
      });
      logger.info("Adventure Land character reconnect scheduled.", {
        characterId: "CH_1", attempt: 1, reconnectDelayMs: 500,
      });
      setTimeout(() => {
        logger.info("Adventure Land character reconnect attempt started.", {
          characterId: "CH_1", attempt: 1,
        });
        reconnectCount += 1;
        heartbeatSequence += 1;
        state = {
          ...state,
          status: "connected",
          reconnectCount,
          heartbeatSequence,
          lastReconnectAt: new Date().toISOString(),
          reconnectAttempt: undefined,
          reconnectDelayMs: undefined,
        };
        logger.info("Adventure Land headless character reconnected.", {
          characterId: "CH_1", reconnectCount,
        });
      }, 20);
    },
    requestStateRefresh: () => {
      heartbeatSequence += 1;
      state = {
        ...state,
        heartbeatSequence,
        lastHeartbeatAt: new Date().toISOString(),
        pingMs: 11,
      };
    },
  };
  const service = new Slice52LiveTestService({
    logger,
    character: character as any,
    script: { state: () => ({ status: "stopped" }) } as any,
    idFactory: () => "live52-test",
  });
  const result = await service.run();
  assert.equal(result.outcome, "passed");
  assert.deepEqual(result.steps.map((step) => step.name), [
    "preflight",
    "disconnect-detected",
    "backoff-scheduled",
    "log-sequence",
    "reconnect-restored",
  ]);
  assert.equal(state.status, "connected");
  assert.equal(state.reconnectCount, 1);
  assert.equal(state.pingMs, 11);
  assert.match(logger.exportText(), /"gameplayMutation":false/);
});

test("Slice 5.2 blocks when script automation is active", async () => {
  const logger = new Logger({ component: "slice-5-2-blocked-test" });
  let interrupted = false;
  const service = new Slice52LiveTestService({
    logger,
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_1",
        characterName: "RangerOne",
        serverKey: "SR_EUII",
        message: "connected",
      }),
      interruptForReconnectTest: () => { interrupted = true; },
      requestStateRefresh: () => undefined,
    } as any,
    script: { state: () => ({ status: "running" }) } as any,
    idFactory: () => "live52-blocked",
  });
  const result = await service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_SCRIPT_RUNTIME_BUSY");
  assert.equal(interrupted, false);
});
