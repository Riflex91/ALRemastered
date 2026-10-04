import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdventureLandCharacterConnectionState } from "../src/character/service.ts";
import { RendererHandoffService } from "../src/renderer/handoff.ts";

function connectedState(): AdventureLandCharacterConnectionState {
  return {
    status: "connected",
    characterId: "CH_1",
    characterName: "Merchant",
    serverKey: "SR_EUII",
    connectedAt: "2026-10-04T13:00:00.000Z",
    reconnectCount: 0,
    message: "Connected.",
  };
}

test("renderer handoff attaches and detaches Browser renderers without changing socket ownership", () => {
  let character = connectedState();
  let now = 0;
  const handoff = new RendererHandoffService({
    character: () => character,
    clock: () => new Date(1_800_000_000_000 + now++),
  });

  assert.deepEqual(handoff.state(), {
    schemaVersion: 1,
    mode: "headless",
    attachedRenderers: 0,
    socketOwnership: "headless-core",
    socketStrategy: "preserve",
    reconnectFallback: "soft-handoff",
    handoffCount: 0,
    lastAttachedAt: undefined,
    lastDetachedAt: undefined,
    lastSocketContinuity: undefined,
    message: "Headless mode active; no Browser renderer is attached.",
  });

  const attached = handoff.attach("browser-1");
  assert.equal(attached.mode, "browser");
  assert.equal(attached.attachedRenderers, 1);
  assert.equal(attached.handoffCount, 1);
  assert.equal(attached.socketOwnership, "headless-core");

  const duplicate = handoff.attach("browser-1");
  assert.equal(duplicate.attachedRenderers, 1);
  assert.equal(duplicate.handoffCount, 1);

  const detached = handoff.detach("browser-1");
  assert.equal(detached.mode, "headless");
  assert.equal(detached.attachedRenderers, 0);
  assert.equal(detached.lastSocketContinuity, true);

  handoff.attach("browser-2");
  character = {
    ...character,
    reconnectCount: 1,
    lastReconnectAt: "2026-10-04T13:01:00.000Z",
  };
  const changed = handoff.detach("browser-2");
  assert.equal(changed.lastSocketContinuity, false);
  assert.equal(changed.reconnectFallback, "soft-handoff");
});

test("renderer handoff supports multiple Browser renderers independently", () => {
  const character = connectedState();
  const handoff = new RendererHandoffService({ character: () => character });

  handoff.attach("browser-a");
  handoff.attach("browser-b");
  assert.equal(handoff.state().attachedRenderers, 2);
  assert.equal(handoff.state().mode, "browser");

  handoff.detach("browser-a");
  assert.equal(handoff.state().attachedRenderers, 1);
  assert.equal(handoff.state().mode, "browser");

  handoff.detach("browser-b");
  assert.equal(handoff.state().attachedRenderers, 0);
  assert.equal(handoff.state().mode, "headless");
  assert.equal(handoff.state().lastSocketContinuity, true);
});

test("renderer handoff preserves an intentionally disconnected Character baseline", () => {
  const character: AdventureLandCharacterConnectionState = {
    status: "disconnected",
    reconnectCount: 0,
    message: "No Character is connected.",
  };
  const handoff = new RendererHandoffService({ character: () => character });

  const attached = handoff.attach("browser-disconnected");
  assert.equal(attached.mode, "browser");
  assert.equal(attached.socketOwnership, "headless-core");
  assert.equal(attached.socketStrategy, "preserve");

  const detached = handoff.detach("browser-disconnected");
  assert.equal(detached.mode, "headless");
  assert.equal(detached.lastSocketContinuity, true);
  assert.equal(detached.reconnectFallback, "soft-handoff");
});

