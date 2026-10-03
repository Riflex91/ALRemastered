import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LocalCharacterMessagingError,
  LocalCharacterMessagingService,
} from "../src/character/messaging.ts";
import { Logger } from "../src/logging/logger.ts";

function sessionState() {
  return {
    status: "ready" as const,
    sessionLimit: 4,
    activeSessionCount: 2,
    managedSessionCount: 1,
    availableSlots: 2,
    sessions: [
      {
        role: "primary" as const,
        characterId: "CH_PRIMARY",
        characterName: "Primary",
        serverKey: "SR_EUII",
        status: "connected" as const,
        message: "Connected.",
      },
      {
        role: "managed" as const,
        characterId: "CH_SECONDARY",
        characterName: "Secondary",
        serverKey: "SR_EUII",
        status: "connected" as const,
        message: "Connected.",
      },
      {
        role: "managed" as const,
        characterId: "CH_CONNECTING",
        characterName: "Connecting",
        serverKey: "SR_EUII",
        status: "connecting" as const,
        message: "Connecting.",
      },
    ],
    sharedStaticData: { mode: "shared" as const, gameDataVersion: 17397 },
    message: "Ready.",
  };
}

test("local Character messaging delivers JSON-cloned send_cm payloads only to active local recipients", async () => {
  const logger = new Logger({ component: "character-messaging-test" });
  let nowMs = 1_900_000_000_000;
  const service = new LocalCharacterMessagingService({
    logger,
    sessions: { state: () => sessionState() as any },
    now: () => new Date(nowMs++),
  });

  const received: any[] = [];
  service.onMessage(() => {
    throw new Error("Synthetic listener failure.");
  });
  service.onMessage((message) => received.push(message));

  const payload = { task: "move", x: 10, nested: { safe: true } };
  const result = await service.send(
    "Primary",
    ["Secondary", "Missing", "Secondary"],
    payload,
  );
  payload.nested.safe = false;

  assert.deepEqual(result, {
    receivers: ["Secondary"],
    locals: ["Secondary"],
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].senderName, "Primary");
  assert.equal(received[0].receiverName, "Secondary");
  assert.deepEqual(received[0].message, {
    task: "move",
    x: 10,
    nested: { safe: true },
  });

  const state = service.state();
  assert.equal(state.requestCount, 1);
  assert.equal(state.localDeliveryCount, 1);
  assert.equal(state.unavailableRecipientCount, 1);
  assert.equal(state.listenerCount, 2);
  assert.equal(state.localOnly, true);
  assert.equal(state.rawSocketAccess, false);
  assert.equal(state.lastDelivery?.senderName, "Primary");
  assert.equal(state.lastDelivery?.receiverName, "Secondary");
  assert.match(logger.exportText(), /listener failed independently/);
});

test("local Character messaging rejects inactive senders and non-JSON payloads without delivery", async () => {
  const logger = new Logger({ component: "character-messaging-validation-test" });
  const service = new LocalCharacterMessagingService({
    logger,
    sessions: { state: () => sessionState() as any },
  });

  await assert.rejects(
    () => service.send("Offline", "Secondary", { ok: true }),
    (error: unknown) =>
      error instanceof LocalCharacterMessagingError &&
      error.code === "CM_SENDER_NOT_ACTIVE",
  );

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await assert.rejects(
    () => service.send("Primary", "Secondary", circular),
    (error: unknown) =>
      error instanceof LocalCharacterMessagingError &&
      error.code === "CM_PAYLOAD_INVALID",
  );

  await assert.rejects(
    () => service.send("Primary", [], { ok: true }),
    (error: unknown) =>
      error instanceof LocalCharacterMessagingError &&
      error.code === "CM_TARGET_REQUIRED",
  );

  assert.equal(service.state().requestCount, 0);
  assert.equal(service.state().localDeliveryCount, 0);
});

test("local Character messaging supports a bidirectional local exchange without server routing", async () => {
  const logger = new Logger({ component: "character-messaging-roundtrip-test" });
  const service = new LocalCharacterMessagingService({
    logger,
    sessions: { state: () => sessionState() as any },
  });

  const transcript: Array<[string, string, unknown]> = [];
  const unsubscribe = service.onMessage((message) => {
    transcript.push([
      message.senderName,
      message.receiverName,
      message.message,
    ]);
  });

  try {
    const first = await service.send("Primary", "Secondary", {
      kind: "probe",
      token: "roundtrip",
    });
    const second = await service.send("Secondary", "Primary", {
      kind: "reply",
      token: "roundtrip",
    });

    assert.deepEqual(first.locals, ["Secondary"]);
    assert.deepEqual(second.locals, ["Primary"]);
    assert.deepEqual(transcript, [
      ["Primary", "Secondary", { kind: "probe", token: "roundtrip" }],
      ["Secondary", "Primary", { kind: "reply", token: "roundtrip" }],
    ]);
    assert.equal(service.state().requestCount, 2);
    assert.equal(service.state().localDeliveryCount, 2);
  } finally {
    unsubscribe();
  }
  assert.equal(service.state().listenerCount, 0);
});
