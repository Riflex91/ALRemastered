import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { MerchantInventoryPreviewService } from "../src/merchant/inventory-preview.ts";
import {
  MerchantDemandInboxService,
  merchantDemandInboxDescriptor,
  type MerchantPlanningDemand,
} from "../src/merchant/demand-inbox.ts";
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
      gold: 15_000,
      inventory: [
        { name: "blade", level: 2, q: 1 },
        null,
        { name: "hpot1", q: 99 },
      ],
    },
  };
}

function demand(
  demandId: string,
  createdAtMs: number,
  deadlineAtMs: number,
  priorityRank = 100,
): MerchantPlanningDemand {
  return {
    schemaVersion: 1,
    demandId,
    kind: "NPC_SELL",
    characterId: "CH_MERCHANT",
    accountId: null,
    createdAtMs,
    deadlineAtMs,
    priorityClass: "NORMAL_WORK",
    priorityRank,
    resourceIds: [
      "character:merchant:inventory",
      "character:merchant:gold",
    ],
    payloadFingerprint: `payload-${demandId}`,
    knowledgeSnapshot: {
      gitCommit: "a".repeat(40),
      sourceSha256: ["b".repeat(64)],
    },
  };
}

test("Slice 14.4 live inbox starts empty and grants no external submission or execution authority", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant() } as any,
  });
  const inbox = new MerchantDemandInboxService({ inventory });
  const state = inbox.state();

  assert.equal(state.status, "ready");
  assert.equal(state.inbox.maxEntries, 512);
  assert.equal(state.inbox.entryCount, 0);
  assert.equal(state.inbox.openCount, 0);
  assert.equal(state.inbox.expiredOpenCount, 0);
  assert.equal(state.inbox.oldestOpenDemandId, null);
  assert.equal(state.inbox.externalSubmissionEnabled, false);
  assert.equal(state.inbox.workflowExecutionAuthority, false);
  assert.equal(state.inbox.gameplayMutationAuthority, false);
  assert.deepEqual(state.inbox.entries, []);
});

test("Slice 14.4 internal planning inbox deduplicates IDs and sorts OPEN demands deterministically", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant() } as any,
  });
  const inbox = new MerchantDemandInboxService({
    inventory,
    clock: () => new Date("1970-01-01T00:00:10.000Z"),
  });
  inbox.submitPlanningDemand(demand("D-NEW", 2_000, 20_000, 1));
  inbox.submitPlanningDemand(demand("D-OLD", 1_000, 20_000, 999_999));

  assert.throws(
    () => inbox.submitPlanningDemand(demand("D-OLD", 3_000, 20_000)),
    /MERCHANT_DEMAND_DUPLICATE/,
  );

  const state = inbox.state();
  assert.equal(state.inbox.entryCount, 2);
  assert.equal(state.inbox.openCount, 2);
  assert.equal(state.inbox.expiredOpenCount, 0);
  assert.equal(state.inbox.oldestOpenDemandId, "D-OLD");
  assert.deepEqual(
    state.inbox.entries.map((entry) => entry.demand.demandId),
    ["D-OLD", "D-NEW"],
  );
  assert.deepEqual(
    state.inbox.entries[0]?.demand.resourceIds,
    ["character:merchant:gold", "character:merchant:inventory"],
  );
});

test("Slice 14.4 rejects invalid deadline, duplicate resources, and character mismatch fail-closed", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant() } as any,
  });
  const inbox = new MerchantDemandInboxService({ inventory });

  assert.throws(
    () => inbox.submitPlanningDemand(demand("D-BAD-TIME", 10, 9)),
    /MERCHANT_DEMAND_TIME_INVALID/,
  );
  assert.throws(
    () => inbox.submitPlanningDemand({
      ...demand("D-BAD-RESOURCE", 10, 100),
      resourceIds: ["same", "same"],
    }),
    /MERCHANT_DEMAND_RESOURCE_DUPLICATE/,
  );
  assert.throws(
    () => inbox.submitPlanningDemand({
      ...demand("D-WRONG-CHAR", 10, 100),
      characterId: "CH_OTHER",
    }),
    /MERCHANT_DEMAND_CHARACTER_MISMATCH/,
  );
  assert.equal(inbox.state().inbox.entryCount, 0);
});

test("Slice 14.4 fails closed when live Merchant observation is unavailable", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: {
      state: () => ({ status: "disconnected", characterId: "CH_MERCHANT" }),
    } as any,
  });
  const inbox = new MerchantDemandInboxService({ inventory });
  const state = inbox.state();

  assert.equal(state.status, "unavailable");
  assert.equal(state.inbox.entryCount, 0);
  assert.equal(state.inbox.externalSubmissionEnabled, false);
  assert.equal(state.inbox.workflowExecutionAuthority, false);
  assert.equal(state.inbox.gameplayMutationAuthority, false);
  assert.throws(
    () => inbox.submitPlanningDemand(demand("D-1", 0, 100)),
    /MERCHANT_DEMAND_INBOX_UNAVAILABLE/,
  );
});

test("Slice 14.4 isolated self-test proves inbox contract without gameplay mutation", () => {
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant() } as any,
  });
  const inbox = new MerchantDemandInboxService({ inventory });
  const selfTest = inbox.runSelfTest();

  assert.equal(selfTest.status, "ready");
  for (const [key, value] of Object.entries(selfTest.checks)) {
    assert.equal(value, true, `expected Slice 14.4 self-test check ${key} to pass`);
  }
  assert.equal(selfTest.gameplayMutation, false);
  assert.equal(selfTest.actionGatewayRequests, 0);
  assert.equal(selfTest.rawSocketAccess, false);
  assert.equal(selfTest.userScriptTouched, false);
});

test("Slice 14.4 descriptor exposes planning-only Demand Inbox and disables economic execution", () => {
  const descriptor = merchantDemandInboxDescriptor();
  assert.equal(descriptor.slice, "14.4");
  assert.equal(descriptor.sourceSlice, "14.1");
  assert.equal(descriptor.demandInbox, true);
  assert.equal(descriptor.maxEntriesDefault, 512);
  assert.equal(descriptor.duplicateDemandIdsBlocked, true);
  assert.equal(descriptor.deadlineValidation, true);
  assert.equal(descriptor.deterministicOpenOrdering, "createdAtMs,demandId");
  assert.equal(descriptor.knowledgeSnapshotRequired, true);
  assert.equal(descriptor.planningOnly, true);
  assert.equal(descriptor.externalSubmissionEnabled, false);
  assert.equal(descriptor.workflowExecutionAuthority, false);
  assert.equal(descriptor.mutationAuthority, false);
  assert.equal(descriptor.bankMutation, false);
  assert.equal(descriptor.tradeMutation, false);
  assert.equal(descriptor.transferMutation, false);
  assert.equal(descriptor.goldTransferMutation, false);
  assert.equal(descriptor.buySellMutation, false);
  assert.equal(descriptor.actionGatewayUsed, false);
  assert.equal(descriptor.rawSocketAccess, false);
});

test("Slice 14.4 Dashboard API is GET-only and exposes live inbox plus isolated self-test", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const inventory = new MerchantInventoryPreviewService({
    character: { state: () => connectedMerchant() } as any,
  });
  const inbox = new MerchantDemandInboxService({ inventory });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-14-4-test" }),
    runtime,
    merchantInventoryPreviewService: inventory,
    merchantDemandInboxService: inbox,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const previewResponse = await fetch(`${url}/api/merchant/demand-inbox`);
    assert.equal(previewResponse.status, 200);
    const previewState = await previewResponse.json();
    assert.equal(previewState.status, "ready");
    assert.equal(previewState.inbox.entryCount, 0);
    assert.equal(previewState.inbox.openCount, 0);
    assert.equal(previewState.inbox.externalSubmissionEnabled, false);
    assert.equal(previewState.inbox.workflowExecutionAuthority, false);
    assert.equal(previewState.inbox.gameplayMutationAuthority, false);

    const selfTestResponse = await fetch(`${url}/api/merchant/demand-inbox/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");

    const mutationAttempt = await fetch(`${url}/api/merchant/demand-inbox`, {
      method: "POST",
    });
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 14.4 is current verification and UI exposes Merchant Demand Inbox Preview", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const merchant = readFileSync(new URL("../src/merchant/demand-inbox.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.4"/);
  assert.match(html, /<h2>Merchant Demand Inbox Preview<\/h2>/);
  assert.match(html, /id="merchant-demand-inbox-refresh"/);
  assert.match(html, /Slice 14\.4 one-click Merchant Demand Inbox test/);
  assert.match(html, /id="start-slice-14-4-live-test"/);
  assert.match(app, /\/api\/merchant\/demand-inbox/);
  assert.match(app, /demand-inbox-descriptor/);
  assert.match(app, /live-inbox-empty-safe/);
  assert.match(app, /duplicate-demand-id-blocked/);
  assert.match(app, /Action Gateway requests/);
  assert.match(server, /GET" && path === "\/api\/merchant\/demand-inbox"/);
  assert.match(server, /GET" && path === "\/api\/merchant\/demand-inbox\/self-test"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/merchant\/demand-inbox/);
  assert.match(merchant, /maxEntriesDefault: 512/);
  assert.match(merchant, /duplicateDemandIdsBlocked: true/);
  assert.match(merchant, /externalSubmissionEnabled: false/);
  assert.match(merchant, /workflowExecutionAuthority: false/);
  assert.match(merchant, /mutationAuthority: false/);
  assert.match(merchant, /actionGatewayUsed: false/);
  assert.match(merchant, /rawSocketAccess: false/);
});
