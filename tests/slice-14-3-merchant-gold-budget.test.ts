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
  buildMerchantGoldBudgetSnapshot,
  MerchantGoldBudgetService,
  merchantGoldBudgetDescriptor,
} from "../src/merchant/gold-budget.ts";
import { Logger } from "../src/logging/logger.ts";

function connectedMerchant(gold = 15_000) {
  return {
    status: "connected" as const,
    characterId: "CH_MERCHANT",
    character: {
      id: "CH_MERCHANT",
      name: "Merchant",
      type: "merchant",
      level: 90,
      dead: false,
      gold,
      inventory: [
        { name: "blade", level: 2, q: 1 },
        null,
        { name: "hpot1", q: 99 },
      ],
    },
  };
}

function preview(gold = 15_000) {
  return buildMerchantInventorySnapshot(
    connectedMerchant(gold).character,
    "2026-10-05T00:00:00.000Z",
  );
}

test("Slice 14.3 protects a safety reserve and accounts planning reservations read-only", () => {
  const snapshot = buildMerchantGoldBudgetSnapshot(preview(10_000), {
    safetyReserveGold: 1_000,
    reservations: [
      { reservationId: "R1", workflowId: "W1", amount: 2_000, purpose: "npc-buy" },
      { reservationId: "R2", workflowId: "W2", amount: 3_000, purpose: "production" },
    ],
    observedAt: "2026-10-05T00:00:01.000Z",
  });
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.budget.observedGold, 10_000);
  assert.equal(snapshot.budget.safetyReserveGold, 1_000);
  assert.equal(snapshot.budget.safetyReserveDeficit, 0);
  assert.equal(snapshot.budget.spendableBeforeReservations, 9_000);
  assert.equal(snapshot.budget.plannedReservedGold, 5_000);
  assert.equal(snapshot.budget.availableAfterReservations, 4_000);
  assert.equal(snapshot.budget.reservationDeficit, 0);
  assert.equal(snapshot.budget.reservationCount, 2);
  assert.equal(snapshot.budget.pressure, "ready");
  assert.equal(snapshot.budget.reservationPlanningOnly, true);
  assert.equal(snapshot.budget.mutationAuthority, false);
});

test("Slice 14.3 allows exact allocation but blocks parallel overbooking", () => {
  const constrained = buildMerchantGoldBudgetSnapshot(preview(6_000), {
    safetyReserveGold: 1_000,
    reservations: [
      { reservationId: "R1", workflowId: "W1", amount: 5_000, purpose: "exact-allocation" },
    ],
  });
  assert.equal(constrained.budget.pressure, "constrained");
  assert.equal(constrained.budget.availableAfterReservations, 0);
  assert.equal(constrained.budget.reservationDeficit, 0);

  const blocked = buildMerchantGoldBudgetSnapshot(preview(6_000), {
    safetyReserveGold: 1_000,
    reservations: [
      { reservationId: "R1", workflowId: "W1", amount: 5_001, purpose: "overbook-attempt" },
    ],
  });
  assert.equal(blocked.budget.pressure, "blocked");
  assert.equal(blocked.budget.availableAfterReservations, 0);
  assert.equal(blocked.budget.reservationDeficit, 1);
});

test("Slice 14.3 fails closed if the configured safety reserve exceeds live gold", () => {
  const snapshot = buildMerchantGoldBudgetSnapshot(preview(500), {
    safetyReserveGold: 1_000,
  });
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.budget.pressure, "blocked");
  assert.equal(snapshot.budget.safetyReserveDeficit, 500);
  assert.equal(snapshot.budget.spendableBeforeReservations, 0);
  assert.equal(snapshot.budget.availableAfterReservations, 0);
  assert.equal(snapshot.budget.mutationAuthority, false);
});

test("Slice 14.3 fails closed when live Merchant gold is unavailable", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_MERCHANT",
        character: {
          id: "CH_MERCHANT",
          name: "Merchant",
          type: "merchant",
          level: 90,
          dead: false,
          inventory: [],
        },
      }),
    } as any,
  });
  const service = new MerchantGoldBudgetService({ inventory });
  const snapshot = service.state();
  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.budget.pressure, "blocked");
  assert.equal(snapshot.budget.availableAfterReservations, 0);
  assert.equal(snapshot.budget.mutationAuthority, false);
});

test("Slice 14.3 self-test proves reservation accounting and read-only safety", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant(15_000) } as any,
  });
  const service = new MerchantGoldBudgetService({ inventory });
  const selfTest = service.runSelfTest();
  assert.equal(selfTest.status, "ready");
  for (const [key, value] of Object.entries(selfTest.checks)) {
    assert.equal(value, true, `expected Slice 14.3 self-test check ${key} to pass`);
  }
  assert.equal(selfTest.gameplayMutation, false);
  assert.equal(selfTest.actionGatewayRequests, 0);
  assert.equal(selfTest.rawSocketAccess, false);
  assert.equal(selfTest.userScriptTouched, false);
});

test("Slice 14.3 descriptor keeps all economic gameplay mutations disabled", () => {
  const descriptor = merchantGoldBudgetDescriptor();
  assert.equal(descriptor.slice, "14.3");
  assert.equal(descriptor.sourceSlice, "14.1");
  assert.equal(descriptor.goldBudgetLedger, true);
  assert.equal(descriptor.safetyReserveGoldDefault, 1_000);
  assert.equal(descriptor.exclusivePlanningReservations, true);
  assert.equal(descriptor.parallelOverbookingBlocked, true);
  assert.equal(descriptor.reservationPlanningOnly, true);
  assert.equal(descriptor.mutationAuthority, false);
  assert.equal(descriptor.bankMutation, false);
  assert.equal(descriptor.tradeMutation, false);
  assert.equal(descriptor.transferMutation, false);
  assert.equal(descriptor.goldTransferMutation, false);
  assert.equal(descriptor.buySellMutation, false);
  assert.equal(descriptor.actionGatewayUsed, false);
  assert.equal(descriptor.rawSocketAccess, false);
});

test("Slice 14.3 Dashboard API is GET-only and exposes live budget plus isolated self-test", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant(15_000) } as any,
  });
  const budget = new MerchantGoldBudgetService({ inventory });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-14-3-test" }),
    runtime,
    merchantInventoryPreviewService: inventory,
    merchantGoldBudgetService: budget,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const previewResponse = await fetch(`${url}/api/merchant/gold-budget`);
    assert.equal(previewResponse.status, 200);
    const previewState = await previewResponse.json();
    assert.equal(previewState.status, "ready");
    assert.equal(previewState.budget.observedGold, 15_000);
    assert.equal(previewState.budget.safetyReserveGold, 1_000);
    assert.equal(previewState.budget.plannedReservedGold, 0);
    assert.equal(previewState.budget.availableAfterReservations, 14_000);
    assert.equal(previewState.budget.pressure, "ready");
    assert.equal(previewState.budget.mutationAuthority, false);

    const selfTestResponse = await fetch(`${url}/api/merchant/gold-budget/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");

    const mutationAttempt = await fetch(`${url}/api/merchant/gold-budget`, {
      method: "POST",
    });
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 14.3 is current verification and UI exposes Merchant Gold & Budget Preview", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const merchant = readFileSync(new URL("../src/merchant/gold-budget.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.4"/);
  assert.match(html, /<h2>Merchant Gold &amp; Budget Preview<\/h2>/);
  assert.match(html, /id="merchant-gold-budget-refresh"/);
  assert.match(html, /Slice 14\.3 one-click Merchant Gold &amp; Budget test/);
  assert.match(html, /id="start-slice-14-3-live-test"/);
  assert.match(app, /\/api\/merchant\/gold-budget/);
  assert.match(app, /gold-budget-descriptor/);
  assert.match(app, /safety-reserve-accounting/);
  assert.match(app, /parallel-overbooking-blocked/);
  assert.match(app, /Action Gateway requests/);
  assert.match(server, /GET" && path === "\/api\/merchant\/gold-budget"/);
  assert.match(server, /GET" && path === "\/api\/merchant\/gold-budget\/self-test"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/merchant\/gold-budget/);
  assert.match(merchant, /safetyReserveGoldDefault: 1_000/);
  assert.match(merchant, /parallelOverbookingBlocked: true/);
  assert.match(merchant, /reservationPlanningOnly: true/);
  assert.match(merchant, /mutationAuthority: false/);
  assert.match(merchant, /actionGatewayUsed: false/);
  assert.match(merchant, /rawSocketAccess: false/);
});
