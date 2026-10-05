import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import {
  buildMerchantInventorySnapshot,
  MerchantInventoryPreviewService,
  merchantInventoryPreviewDescriptor,
} from "../src/merchant/inventory-preview.ts";
import {
  DANGEROUS_SCRIPT_PACKAGE_PERMISSIONS,
  scriptPackagePermissionDescriptor,
} from "../src/packages/permissions.ts";
import { Logger } from "../src/logging/logger.ts";

function connectedMerchant() {
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
      inventory: [
        { name: "blade", level: 2, q: 1 },
        { name: "blade", level: 2, q: 1 },
        null,
        { name: "hpot1", q: 99 },
      ],
    },
  };
}

test("Slice 14.1 creates slot-bound physical identities and defaults every item to HOLD", () => {
  const snapshot = buildMerchantInventorySnapshot(
    connectedMerchant().character,
    "2026-10-05T00:00:00.000Z",
  );
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.character?.type, "merchant");
  assert.deepEqual(
    [snapshot.inventory.capacity, snapshot.inventory.used, snapshot.inventory.free],
    [4, 3, 1],
  );
  assert.deepEqual(snapshot.inventory.items.map((item) => item.slot), [0, 1, 3]);
  assert.equal(snapshot.inventory.items[0]?.fingerprint, snapshot.inventory.items[1]?.fingerprint);
  assert.notEqual(snapshot.inventory.items[0]?.physicalId, snapshot.inventory.items[1]?.physicalId);
  assert.equal(new Set(snapshot.inventory.items.map((item) => item.physicalId)).size, 3);
  assert.equal(snapshot.disposition.default, "hold");
  assert.equal(snapshot.disposition.mutationAuthority, false);
  assert.equal(snapshot.disposition.items.every((entry) => entry.disposition === "hold"), true);
});

test("Slice 14.1 fingerprint changes when the observed physical item changes", () => {
  const before = buildMerchantInventorySnapshot({
    ...connectedMerchant().character,
    inventory: [{ name: "hpot1", q: 10 }],
  });
  const after = buildMerchantInventorySnapshot({
    ...connectedMerchant().character,
    inventory: [{ name: "hpot1", q: 9 }],
  });
  assert.notEqual(before.inventory.items[0]?.fingerprint, after.inventory.items[0]?.fingerprint);
  assert.notEqual(before.inventory.items[0]?.physicalId, after.inventory.items[0]?.physicalId);
});

test("Slice 14.1 fails closed when no live inventory is available", () => {
  const service = new MerchantInventoryPreviewService({
    character: {
      state: () => ({ status: "disconnected", characterId: "CH_MERCHANT" }),
    } as any,
    clock: () => new Date("2026-10-05T00:00:00.000Z"),
  });
  const snapshot = service.state();
  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.inventory.used, 0);
  assert.equal(snapshot.disposition.mutationAuthority, false);
  assert.equal(snapshot.descriptor.actionGatewayUsed, false);
  assert.equal(snapshot.descriptor.rawSocketAccess, false);
});

test("Slice 14.1 fails closed for a connected non-Merchant Character", () => {
  const service = new MerchantInventoryPreviewService({
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_WARRIOR",
        character: {
          id: "CH_WARRIOR",
          name: "Warrior",
          type: "warrior",
          level: 90,
          dead: false,
          inventory: [{ name: "blade", level: 2 }],
        },
      }),
    } as any,
  });
  const snapshot = service.state();
  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.inventory.used, 0);
  assert.equal(snapshot.disposition.mutationAuthority, false);
});

test("Slice 14.1 self-test proves the preview-only safety contract", () => {
  const service = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant() } as any,
  });
  const selfTest = service.runSelfTest();
  assert.equal(selfTest.status, "ready");
  for (const [key, value] of Object.entries(selfTest.checks)) {
    assert.equal(value, true, `expected Slice 14.1 self-test check ${key} to pass`);
  }
  assert.equal(selfTest.gameplayMutation, false);
  assert.equal(selfTest.actionGatewayRequests, 0);
  assert.equal(selfTest.rawSocketAccess, false);
  assert.equal(selfTest.userScriptTouched, false);
});

test("Slice 14.1 keeps merchant package authority dangerous and default-denied", () => {
  const permissions = scriptPackagePermissionDescriptor();
  assert.equal(DANGEROUS_SCRIPT_PACKAGE_PERMISSIONS.includes("merchant"), true);
  assert.equal(permissions.dangerousPermissions.includes("merchant"), true);
  assert.equal(permissions.dangerousDefaultAllowed, false);
  assert.equal(permissions.dangerousRequireExplicitApproval, true);
  const descriptor = merchantInventoryPreviewDescriptor();
  assert.equal(descriptor.packagePermission, "merchant");
  assert.equal(descriptor.packagePermissionRequiredForPreview, false);
  assert.equal(descriptor.mutationAuthority, false);
});

test("Slice 14.1 Dashboard API is GET-only and exposes live preview plus isolated self-test", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const service = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant() } as any,
  });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-14-1-test" }),
    runtime,
    merchantInventoryPreviewService: service,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const previewResponse = await fetch(`${url}/api/merchant/inventory-preview`);
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.status, "ready");
    assert.equal(preview.character.type, "merchant");
    assert.equal(preview.inventory.used, 3);
    assert.equal(preview.disposition.mutationAuthority, false);
    const selfTestResponse = await fetch(`${url}/api/merchant/inventory-preview/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");
    const mutationAttempt = await fetch(`${url}/api/merchant/inventory-preview`, { method: "POST" });
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 14.1 is current verification and UI exposes Merchant Inventory Preview", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const merchant = readFileSync(new URL("../src/merchant/inventory-preview.js", import.meta.url), "utf8");
  assert.match(html, /data-current-verification-slice="14\.3"/);
  assert.match(html, /<h2>Merchant Inventory &amp; Disposition Preview<\/h2>/);
  assert.match(html, /id="merchant-inventory-preview-refresh"/);
  assert.match(html, /Slice 14\.1 one-click Merchant Inventory Preview test/);
  assert.match(html, /id="start-slice-14-1-live-test"/);
  assert.match(app, /\/api\/merchant\/inventory-preview/);
  assert.match(app, /\/api\/packages\/permissions/);
  assert.match(app, /default-hold-disposition/);
  assert.match(app, /merchant-permission-default-denied/);
  assert.match(app, /Action Gateway requests/);
  assert.match(server, /GET" && path === "\/api\/merchant\/inventory-preview"/);
  assert.match(server, /GET" && path === "\/api\/merchant\/inventory-preview\/self-test"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/merchant\/inventory-preview/);
  assert.match(merchant, /defaultDisposition: "hold"/);
  assert.match(merchant, /mutationAuthority: false/);
  assert.match(merchant, /actionGatewayUsed: false/);
  assert.match(merchant, /rawSocketAccess: false/);
});
