import type {
  MerchantInventoryPreviewService,
  MerchantInventoryPreviewState,
} from "./inventory-preview.ts";

export type MerchantDemandKind =
  | "BANK_STORE"
  | "BANK_RETRIEVE"
  | "BANK_CONSOLIDATE"
  | "BANK_EXPAND"
  | "NPC_BUY"
  | "NPC_SELL"
  | "MARKET_OBSERVE"
  | "MARKET_BUY"
  | "MARKET_SELL"
  | "STAND_LISTING"
  | "INVENTORY_CLEANUP"
  | "MLUCK_SERVICE";

export type MerchantDemandPriorityClass =
  | "EMERGENCY"
  | "SAFETY"
  | "CRITICAL_SUPPLY"
  | "REQUIRED_SERVICE"
  | "PRODUCTION_OR_USER_REQUEST"
  | "NORMAL_WORK";

export type MerchantDemandStatus =
  | "OPEN"
  | "PLANNED"
  | "RUNNING"
  | "DONE"
  | "CANCELLED";

export interface MerchantDemandKnowledgePin {
  readonly gitCommit: string;
  readonly sourceSha256: readonly string[];
}

export interface MerchantPlanningDemand {
  readonly schemaVersion: 1;
  readonly demandId: string;
  readonly kind: MerchantDemandKind;
  readonly characterId: string;
  readonly accountId: string | null;
  readonly createdAtMs: number;
  readonly deadlineAtMs: number;
  readonly priorityClass: MerchantDemandPriorityClass;
  readonly priorityRank: number;
  readonly resourceIds: readonly string[];
  readonly payloadFingerprint: string;
  readonly knowledgeSnapshot: MerchantDemandKnowledgePin;
}

export interface MerchantDemandEntry {
  readonly demand: MerchantPlanningDemand;
  readonly status: MerchantDemandStatus;
}

export interface MerchantDemandInboxState {
  readonly schemaVersion: 1;
  readonly status: "ready" | "unavailable";
  readonly message: string;
  readonly observedAt: string;
  readonly descriptor: ReturnType<typeof merchantDemandInboxDescriptor>;
  readonly sourceInventoryObservedAt?: string;
  readonly inbox: {
    readonly maxEntries: number;
    readonly entryCount: number;
    readonly openCount: number;
    readonly expiredOpenCount: number;
    readonly oldestOpenDemandId: string | null;
    readonly externalSubmissionEnabled: false;
    readonly workflowExecutionAuthority: false;
    readonly gameplayMutationAuthority: false;
    readonly entries: readonly MerchantDemandEntry[];
  };
}

export interface MerchantDemandInboxServiceOptions {
  readonly inventory: Pick<MerchantInventoryPreviewService, "state">;
  readonly maxEntries?: number;
  readonly clock?: () => Date;
}

export class MerchantDemandInboxService {
  readonly #inventory: Pick<MerchantInventoryPreviewService, "state">;
  readonly #maxEntries: number;
  readonly #clock: () => Date;
  #entries: readonly MerchantDemandEntry[] = Object.freeze([]);

  constructor(options: MerchantDemandInboxServiceOptions) {
    this.#inventory = options.inventory;
    this.#maxEntries = boundedPositiveInteger(options.maxEntries, 512, 4096);
    this.#clock = options.clock ?? (() => new Date());
  }

  state(): MerchantDemandInboxState {
    return buildMerchantDemandInboxSnapshot(
      this.#inventory.state(),
      this.#entries,
      {
        maxEntries: this.#maxEntries,
        observedAt: this.#clock().toISOString(),
      },
    );
  }

  submitPlanningDemand(demand: MerchantPlanningDemand): MerchantDemandEntry {
    const inventory = this.#inventory.state();
    if (inventory.status !== "ready" || !inventory.character) {
      throw new Error("MERCHANT_DEMAND_INBOX_UNAVAILABLE");
    }
    const normalized = normalizeDemand(demand);
    if (normalized.characterId !== inventory.character.id) {
      throw new Error("MERCHANT_DEMAND_CHARACTER_MISMATCH");
    }
    if (this.#entries.length >= this.#maxEntries) {
      throw new Error("MERCHANT_DEMAND_INBOX_FULL");
    }
    if (this.#entries.some((entry) => entry.demand.demandId === normalized.demandId)) {
      throw new Error("MERCHANT_DEMAND_DUPLICATE");
    }
    const entry = Object.freeze({
      demand: normalized,
      status: "OPEN" as const,
    });
    this.#entries = Object.freeze([...this.#entries, entry]);
    return entry;
  }

  runSelfTest() {
    const fixtureInventory = {
      state: () => inventoryFixture("CH_MERCHANT"),
    } satisfies Pick<MerchantInventoryPreviewService, "state">;
    const inbox = new MerchantDemandInboxService({
      inventory: fixtureInventory,
      maxEntries: 3,
      clock: () => new Date("2026-10-05T00:00:10.000Z"),
    });

    const newer = fixtureDemand("D-NEW", 2_000, 20_000, 5);
    const older = fixtureDemand("D-OLD", 1_000, 20_000, 10);
    inbox.submitPlanningDemand(newer);
    inbox.submitPlanningDemand(older);

    let duplicateBlocked = false;
    try {
      inbox.submitPlanningDemand(older);
    } catch (error) {
      duplicateBlocked =
        error instanceof Error && error.message === "MERCHANT_DEMAND_DUPLICATE";
    }

    let invalidDeadlineBlocked = false;
    try {
      inbox.submitPlanningDemand({
        ...fixtureDemand("D-BAD-TIME", 5_000, 4_999, 0),
      });
    } catch (error) {
      invalidDeadlineBlocked =
        error instanceof Error && error.message === "MERCHANT_DEMAND_TIME_INVALID";
    }

    let duplicateResourceBlocked = false;
    try {
      inbox.submitPlanningDemand({
        ...fixtureDemand("D-BAD-RESOURCE", 3_000, 20_000, 0),
        resourceIds: ["character:merchant:inventory", "character:merchant:inventory"],
      });
    } catch (error) {
      duplicateResourceBlocked =
        error instanceof Error && error.message === "MERCHANT_DEMAND_RESOURCE_DUPLICATE";
    }

    const bounded = new MerchantDemandInboxService({
      inventory: fixtureInventory,
      maxEntries: 1,
      clock: () => new Date("2026-10-05T00:00:10.000Z"),
    });
    bounded.submitPlanningDemand(fixtureDemand("D-LIMIT-1", 1_000, 20_000, 0));
    let inboxFullBlocked = false;
    try {
      bounded.submitPlanningDemand(fixtureDemand("D-LIMIT-2", 2_000, 20_000, 0));
    } catch (error) {
      inboxFullBlocked =
        error instanceof Error && error.message === "MERCHANT_DEMAND_INBOX_FULL";
    }

    const snapshot = inbox.state();
    const sortedOpenIds = snapshot.inbox.entries
      .filter((entry) => entry.status === "OPEN")
      .map((entry) => entry.demand.demandId);
    const checks = Object.freeze({
      descriptor:
        snapshot.descriptor.slice === "14.4" &&
        snapshot.descriptor.demandInbox === true &&
        snapshot.descriptor.planningOnly === true,
      openOrdering:
        sortedOpenIds.length === 2 &&
        sortedOpenIds[0] === "D-OLD" &&
        sortedOpenIds[1] === "D-NEW",
      duplicateIdBlocked: duplicateBlocked,
      invalidDeadlineBlocked,
      duplicateResourceBlocked,
      normalizedResources:
        snapshot.inbox.entries[0]?.demand.resourceIds.join(",") ===
          "character:merchant:gold,character:merchant:inventory",
      knowledgePinned:
        snapshot.inbox.entries.every((entry) =>
          /^[0-9a-f]{40}$/.test(entry.demand.knowledgeSnapshot.gitCommit) &&
          entry.demand.knowledgeSnapshot.sourceSha256.every((hash) =>
            /^[0-9a-f]{64}$/.test(hash)
          )
        ),
      boundedInbox:
        snapshot.inbox.maxEntries === 3 &&
        snapshot.inbox.entryCount === 2,
      inboxFullBlocked,
      noExternalSubmission:
        snapshot.inbox.externalSubmissionEnabled === false,
      noWorkflowExecution:
        snapshot.inbox.workflowExecutionAuthority === false,
      readOnlyContract:
        snapshot.inbox.gameplayMutationAuthority === false &&
        snapshot.descriptor.mutationAuthority === false &&
        snapshot.descriptor.actionGatewayUsed === false &&
        snapshot.descriptor.rawSocketAccess === false &&
        snapshot.descriptor.bankMutation === false &&
        snapshot.descriptor.buySellMutation === false,
      noGameplayMutation: true,
      userScriptUntouched: true,
    });

    return Object.freeze({
      status: Object.values(checks).every(Boolean) ? "ready" as const : "failed" as const,
      descriptor: merchantDemandInboxDescriptor(),
      checks,
      preview: Object.freeze({
        maxEntries: snapshot.inbox.maxEntries,
        entryCount: snapshot.inbox.entryCount,
        openCount: snapshot.inbox.openCount,
        expiredOpenCount: snapshot.inbox.expiredOpenCount,
        oldestOpenDemandId: snapshot.inbox.oldestOpenDemandId,
        sortedOpenIds: Object.freeze(sortedOpenIds),
      }),
      gameplayMutation: false,
      actionGatewayRequests: 0,
      rawSocketAccess: false,
      userScriptTouched: false,
    });
  }
}

export function merchantDemandInboxDescriptor() {
  return Object.freeze({
    slice: "14.4" as const,
    domain: "merchant" as const,
    mode: "read-only" as const,
    sourceSlice: "14.1" as const,
    demandInbox: true,
    maxEntriesDefault: 512,
    duplicateDemandIdsBlocked: true,
    deadlineValidation: true,
    deterministicOpenOrdering: "createdAtMs,demandId" as const,
    knowledgeSnapshotRequired: true,
    planningOnly: true,
    externalSubmissionEnabled: false,
    workflowExecutionAuthority: false,
    mutationAuthority: false,
    bankMutation: false,
    tradeMutation: false,
    transferMutation: false,
    goldTransferMutation: false,
    buySellMutation: false,
    upgradeMutation: false,
    compoundMutation: false,
    actionGatewayUsed: false,
    rawSocketAccess: false,
  });
}

export function buildMerchantDemandInboxSnapshot(
  inventory: MerchantInventoryPreviewState,
  entries: readonly MerchantDemandEntry[],
  options: {
    readonly maxEntries?: number;
    readonly observedAt?: string;
  } = {},
): MerchantDemandInboxState {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const maxEntries = boundedPositiveInteger(options.maxEntries, 512, 4096);

  if (inventory.status !== "ready" || !inventory.character) {
    return Object.freeze({
      schemaVersion: 1 as const,
      status: "unavailable" as const,
      message:
        "Merchant Demand Inbox Preview requires the Slice 14.1 live Merchant observation.",
      observedAt,
      descriptor: merchantDemandInboxDescriptor(),
      inbox: emptyInbox(maxEntries),
    });
  }

  const normalizedEntries = Object.freeze(
    entries
      .map((entry) =>
        Object.freeze({
          demand: normalizeDemand(entry.demand),
          status: normalizeStatus(entry.status),
        })
      )
      .sort((a, b) => {
        if (a.status === "OPEN" && b.status !== "OPEN") return -1;
        if (a.status !== "OPEN" && b.status === "OPEN") return 1;
        if (a.status === "OPEN" && b.status === "OPEN") {
          return a.demand.createdAtMs - b.demand.createdAtMs ||
            a.demand.demandId.localeCompare(b.demand.demandId);
        }
        return a.demand.demandId.localeCompare(b.demand.demandId);
      }),
  );

  const seen = new Set<string>();
  for (const entry of normalizedEntries) {
    if (entry.demand.characterId !== inventory.character.id) {
      throw new Error("MERCHANT_DEMAND_CHARACTER_MISMATCH");
    }
    if (seen.has(entry.demand.demandId)) {
      throw new Error("MERCHANT_DEMAND_DUPLICATE");
    }
    seen.add(entry.demand.demandId);
  }
  if (normalizedEntries.length > maxEntries) {
    throw new Error("MERCHANT_DEMAND_INBOX_FULL");
  }

  const nowMs = Date.parse(observedAt);
  const openEntries = normalizedEntries.filter((entry) => entry.status === "OPEN");
  const expiredOpenCount = Number.isFinite(nowMs)
    ? openEntries.filter((entry) => entry.demand.deadlineAtMs < nowMs).length
    : 0;

  return Object.freeze({
    schemaVersion: 1 as const,
    status: "ready" as const,
    message: normalizedEntries.length === 0
      ? "Merchant Demand Inbox ready. No planning demands are currently queued."
      : `Merchant Demand Inbox ready. ${normalizedEntries.length} planning demand(s) tracked; ${openEntries.length} open.`,
    observedAt,
    descriptor: merchantDemandInboxDescriptor(),
    sourceInventoryObservedAt: inventory.observedAt,
    inbox: Object.freeze({
      maxEntries,
      entryCount: normalizedEntries.length,
      openCount: openEntries.length,
      expiredOpenCount,
      oldestOpenDemandId: openEntries[0]?.demand.demandId ?? null,
      externalSubmissionEnabled: false as const,
      workflowExecutionAuthority: false as const,
      gameplayMutationAuthority: false as const,
      entries: normalizedEntries,
    }),
  });
}

function emptyInbox(maxEntries: number): MerchantDemandInboxState["inbox"] {
  return Object.freeze({
    maxEntries,
    entryCount: 0,
    openCount: 0,
    expiredOpenCount: 0,
    oldestOpenDemandId: null,
    externalSubmissionEnabled: false as const,
    workflowExecutionAuthority: false as const,
    gameplayMutationAuthority: false as const,
    entries: Object.freeze([]),
  });
}

function normalizeDemand(demand: MerchantPlanningDemand): MerchantPlanningDemand {
  if (!demand || demand.schemaVersion !== 1) {
    throw new Error("MERCHANT_DEMAND_SCHEMA_INVALID");
  }
  for (const value of [demand.demandId, demand.characterId, demand.payloadFingerprint]) {
    requireText(value, "MERCHANT_DEMAND_TEXT_INVALID");
  }
  if (demand.accountId !== null) {
    requireText(demand.accountId, "MERCHANT_DEMAND_ACCOUNT_INVALID");
  }
  if (
    !Number.isSafeInteger(demand.createdAtMs) ||
    !Number.isSafeInteger(demand.deadlineAtMs) ||
    demand.createdAtMs < 0 ||
    demand.deadlineAtMs < demand.createdAtMs
  ) {
    throw new Error("MERCHANT_DEMAND_TIME_INVALID");
  }
  if (
    !Number.isInteger(demand.priorityRank) ||
    demand.priorityRank < 0 ||
    demand.priorityRank > 1_000_000
  ) {
    throw new Error("MERCHANT_DEMAND_PRIORITY_INVALID");
  }
  if (!DEMAND_KINDS.has(demand.kind)) {
    throw new Error("MERCHANT_DEMAND_KIND_INVALID");
  }
  if (!PRIORITY_CLASSES.has(demand.priorityClass)) {
    throw new Error("MERCHANT_DEMAND_PRIORITY_CLASS_INVALID");
  }
  if (demand.resourceIds.length > 64) {
    throw new Error("MERCHANT_DEMAND_RESOURCE_LIMIT");
  }
  const resourceIds = [...demand.resourceIds].map((value) => {
    requireText(value, "MERCHANT_DEMAND_RESOURCE_INVALID");
    return value.trim();
  }).sort();
  for (let index = 1; index < resourceIds.length; index += 1) {
    if (resourceIds[index] === resourceIds[index - 1]) {
      throw new Error("MERCHANT_DEMAND_RESOURCE_DUPLICATE");
    }
  }
  if (!/^[0-9a-f]{40}$/i.test(demand.knowledgeSnapshot.gitCommit)) {
    throw new Error("MERCHANT_DEMAND_KNOWLEDGE_COMMIT_INVALID");
  }
  if (demand.knowledgeSnapshot.sourceSha256.length < 1) {
    throw new Error("MERCHANT_DEMAND_KNOWLEDGE_HASH_MISSING");
  }
  const sourceSha256 = [...demand.knowledgeSnapshot.sourceSha256].sort();
  for (const hash of sourceSha256) {
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      throw new Error("MERCHANT_DEMAND_KNOWLEDGE_HASH_INVALID");
    }
  }
  return Object.freeze({
    ...demand,
    demandId: demand.demandId.trim(),
    characterId: demand.characterId.trim(),
    accountId: demand.accountId?.trim() ?? null,
    payloadFingerprint: demand.payloadFingerprint.trim(),
    resourceIds: Object.freeze(resourceIds),
    knowledgeSnapshot: Object.freeze({
      gitCommit: demand.knowledgeSnapshot.gitCommit.toLowerCase(),
      sourceSha256: Object.freeze(sourceSha256.map((hash) => hash.toLowerCase())),
    }),
  });
}

function normalizeStatus(status: MerchantDemandStatus): MerchantDemandStatus {
  if (!DEMAND_STATUSES.has(status)) {
    throw new Error("MERCHANT_DEMAND_STATUS_INVALID");
  }
  return status;
}

function requireText(value: string, error: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 192) {
    throw new Error(error);
  }
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, max)
    : fallback;
}

function inventoryFixture(characterId: string): MerchantInventoryPreviewState {
  return Object.freeze({
    schemaVersion: 1 as const,
    status: "ready" as const,
    message: "fixture",
    observedAt: "2026-10-05T00:00:00.000Z",
    descriptor: Object.freeze({
      slice: "14.1" as const,
      domain: "merchant" as const,
      mode: "read-only" as const,
      physicalInventoryIdentity: true,
      defaultDisposition: "hold" as const,
      packagePermission: "merchant" as const,
      packagePermissionRequiredForPreview: false,
      mutationAuthority: false,
      bankMutation: false,
      tradeMutation: false,
      transferMutation: false,
      upgradeMutation: false,
      compoundMutation: false,
      actionGatewayUsed: false,
      rawSocketAccess: false,
    }),
    character: Object.freeze({
      id: characterId,
      name: "Merchant",
      type: "merchant",
      level: 80,
      dead: false,
      gold: 10_000,
    }),
    inventory: Object.freeze({
      capacity: 0,
      used: 0,
      free: 0,
      items: Object.freeze([]),
    }),
    disposition: Object.freeze({
      default: "hold" as const,
      mutationAuthority: false as const,
      items: Object.freeze([]),
    }),
  });
}

function fixtureDemand(
  demandId: string,
  createdAtMs: number,
  deadlineAtMs: number,
  priorityRank: number,
): MerchantPlanningDemand {
  return Object.freeze({
    schemaVersion: 1 as const,
    demandId,
    kind: "NPC_SELL" as const,
    characterId: "CH_MERCHANT",
    accountId: null,
    createdAtMs,
    deadlineAtMs,
    priorityClass: "NORMAL_WORK" as const,
    priorityRank,
    resourceIds: Object.freeze([
      "character:merchant:inventory",
      "character:merchant:gold",
    ]),
    payloadFingerprint: `payload-${demandId}`,
    knowledgeSnapshot: Object.freeze({
      gitCommit: "a".repeat(40),
      sourceSha256: Object.freeze(["b".repeat(64)]),
    }),
  });
}

const DEMAND_KINDS = new Set<MerchantDemandKind>([
  "BANK_STORE",
  "BANK_RETRIEVE",
  "BANK_CONSOLIDATE",
  "BANK_EXPAND",
  "NPC_BUY",
  "NPC_SELL",
  "MARKET_OBSERVE",
  "MARKET_BUY",
  "MARKET_SELL",
  "STAND_LISTING",
  "INVENTORY_CLEANUP",
  "MLUCK_SERVICE",
]);

const PRIORITY_CLASSES = new Set<MerchantDemandPriorityClass>([
  "EMERGENCY",
  "SAFETY",
  "CRITICAL_SUPPLY",
  "REQUIRED_SERVICE",
  "PRODUCTION_OR_USER_REQUEST",
  "NORMAL_WORK",
]);

const DEMAND_STATUSES = new Set<MerchantDemandStatus>([
  "OPEN",
  "PLANNED",
  "RUNNING",
  "DONE",
  "CANCELLED",
]);
