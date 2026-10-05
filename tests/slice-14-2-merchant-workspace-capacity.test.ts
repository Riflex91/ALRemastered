import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import {
  buildMerchantInventorySnapshot,
  MerchantInventoryPreviewService,
} from "../src/merchant/inventory-preview.ts";
import {
  buildMerchantWorkspaceCapacitySnapshot,
  MerchantWorkspaceCapacityService,
  merchantWorkspaceCapacityDescriptor,
} from "../src/merchant/workspace-capacity.ts";
import { Logger } from "../src/logging/logger.ts";

function connectedMerchant(freeSlots = 6) {
  const capacity = 12;
  const used = Math.max(0, capacity - freeSlots);
  return {
    status: "connected" as const,
    characterId: "CH_MERCHANT",
    character: {
      id: "CH_MERCHANT",
      name: "Merchant",
      type: "merchant",
      level: 90,
      dead: false,
      gold: 987654,
      inventory: Array.from({ length: capacity }, (_, slot) =>
        slot < used ? { name: `item${slot}`, q: 1 } : null
      ),
    },
  };
}

function preview(freeSlots = 6) {
  const state = connectedMerchant(freeSlots);
  return buildMerchantInventorySnapshot(
    state.character,
    "2026-10-05T00:00:00.000Z",
  );
}

test("Slice 14.2 reserves workspace and pickup capacity without mutating inventory", () => {
  const snapshot = buildMerchantWorkspaceCapacitySnapshot(preview(6), {
    workspaceSlots: 3,
    pickupReserveSlots: 1,
    observedAt: "2026-10-05T00:00:01.000Z",
  });
  assert.equal(snapshot.status, "ready");
  assert.deepEqual(
    [snapshot.inventory.capacity, snapshot.inventory.used, snapshot.inventory.free],
    [12, 6, 6],
  );
  assert.equal(snapshot.capacity.workspaceSlots, 3);
  assert.equal(snapshot.capacity.pickupReserveSlots, 1);
  assert.equal(snapshot.capacity.totalReservedSlots, 4);
  assert.equal(snapshot.capacity.generalFreeSlots, 2);
  assert.equal(snapshot.capacity.deficit, 0);
  assert.equal(snapshot.capacity.pressure, "ready");
  assert.equal(snapshot.capacity.multiStepWorkflowAllowed, true);
  assert.equal(snapshot.capacity.mutationAuthority, false);
});

test("Slice 14.2 blocks multi-step planning when the safety reserve cannot be satisfied", () => {
  const constrained = buildMerchantWorkspaceCapacitySnapshot(preview(2));
  assert.equal(constrained.capacity.pressure, "constrained");
  assert.equal(constrained.capacity.generalFreeSlots, 0);
  assert.equal(constrained.capacity.deficit, 2);
  assert.equal(constrained.capacity.multiStepWorkflowAllowed, false);

  const blocked = buildMerchantWorkspaceCapacitySnapshot(preview(0));
  assert.equal(blocked.capacity.pressure, "blocked");
  assert.equal(blocked.capacity.deficit, 4);
  assert.equal(blocked.capacity.multiStepWorkflowAllowed, false);
});

test("Slice 14.2 fails closed when Slice 14.1 inventory preview is unavailable", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: {
      state: () => ({ status: "disconnected", characterId: "CH_MERCHANT" }),
    } as any,
  });
  const service = new MerchantWorkspaceCapacityService({ inventory });
  const snapshot = service.state();
  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.capacity.pressure, "blocked");
  assert.equal(snapshot.capacity.multiStepWorkflowAllowed, false);
  assert.equal(snapshot.capacity.mutationAuthority, false);
});

test("Slice 14.2 self-test proves ready, constrained, blocked, and read-only contracts", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant(6) } as any,
  });
  const service = new MerchantWorkspaceCapacityService({ inventory });
  const selfTest = service.runSelfTest();
  assert.equal(selfTest.status, "ready");
  for (const [key, value] of Object.entries(selfTest.checks)) {
    assert.equal(value, true, `expected Slice 14.2 self-test check ${key} to pass`);
  }
  assert.equal(selfTest.gameplayMutation, false);
  assert.equal(selfTest.actionGatewayRequests, 0);
  assert.equal(selfTest.rawSocketAccess, false);
  assert.equal(selfTest.userScriptTouched, false);
});

test("Slice 14.2 descriptor keeps every gameplay mutation path disabled", () => {
  const descriptor = merchantWorkspaceCapacityDescriptor();
  assert.equal(descriptor.slice, "14.2");
  assert.equal(descriptor.sourceSlice, "14.1");
  assert.equal(descriptor.capacityPreflight, true);
  assert.equal(descriptor.reservationPlanningOnly, true);
  assert.equal(descriptor.workspaceSlotsDefault, 3);
  assert.equal(descriptor.pickupReserveSlotsDefault, 1);
  assert.equal(descriptor.mutationAuthority, false);
  assert.equal(descriptor.bankMutation, false);
  assert.equal(descriptor.tradeMutation, false);
  assert.equal(descriptor.transferMutation, false);
  assert.equal(descriptor.buySellMutation, false);
  assert.equal(descriptor.actionGatewayUsed, false);
  assert.equal(descriptor.rawSocketAccess, false);
});

test("Slice 14.2 Dashboard API is GET-only and exposes live preflight plus isolated self-test", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant(6) } as any,
  });
  const capacity = new MerchantWorkspaceCapacityService({ inventory });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-14-2-test" }),
    runtime,
    merchantInventoryPreviewService: inventory,
    merchantWorkspaceCapacityService: capacity,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const previewResponse = await fetch(`${url}/api/merchant/workspace-capacity`);
    assert.equal(previewResponse.status, 200);
    const previewState = await previewResponse.json();
    assert.equal(previewState.status, "ready");
    assert.equal(previewState.inventory.free, 6);
    assert.equal(previewState.capacity.totalReservedSlots, 4);
    assert.equal(previewState.capacity.generalFreeSlots, 2);
    assert.equal(previewState.capacity.multiStepWorkflowAllowed, true);
    assert.equal(previewState.capacity.mutationAuthority, false);

    const selfTestResponse = await fetch(`${url}/api/merchant/workspace-capacity/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");

    const mutationAttempt = await fetch(`${url}/api/merchant/workspace-capacity`, {
      method: "POST",
    });
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 14.2 is current verification and UI exposes Merchant Workspace & Capacity Preview", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const merchant = readFileSync(new URL("../src/merchant/workspace-capacity.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.2"/);
  assert.match(html, /<h2>Merchant Workspace &amp; Capacity Preview<\/h2>/);
  assert.match(html, /id="merchant-workspace-capacity-refresh"/);
  assert.match(html, /Slice 14\.2 one-click Merchant Workspace &amp; Capacity test/);
  assert.match(html, /id="start-slice-14-2-live-test"/);
  assert.match(app, /\/api\/merchant\/workspace-capacity/);
  assert.match(app, /workspace-capacity-descriptor/);
  assert.match(app, /capacity-reserve-accounting/);
  assert.match(app, /Action Gateway requests/);
  assert.match(server, /GET" && path === "\/api\/merchant\/workspace-capacity"/);
  assert.match(server, /GET" && path === "\/api\/merchant\/workspace-capacity\/self-test"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/merchant\/workspace-capacity/);
  assert.match(merchant, /workspaceSlotsDefault: 3/);
  assert.match(merchant, /pickupReserveSlotsDefault: 1/);
  assert.match(merchant, /reservationPlanningOnly: true/);
  assert.match(merchant, /mutationAuthority: false/);
  assert.match(merchant, /actionGatewayUsed: false/);
  assert.match(merchant, /rawSocketAccess: false/);
});
