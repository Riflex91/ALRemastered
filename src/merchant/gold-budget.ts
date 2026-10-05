import type {
  MerchantInventoryPreviewService,
  MerchantInventoryPreviewState,
} from "./inventory-preview.ts";

export type MerchantGoldBudgetPressure = "ready" | "constrained" | "blocked";

export interface MerchantGoldPlanningReservation {
  readonly reservationId: string;
  readonly workflowId: string;
  readonly amount: number;
  readonly purpose: string;
}

export interface MerchantGoldBudgetState {
  readonly schemaVersion: 1;
  readonly status: "ready" | "unavailable";
  readonly message: string;
  readonly observedAt: string;
  readonly descriptor: ReturnType<typeof merchantGoldBudgetDescriptor>;
  readonly sourceInventoryObservedAt?: string;
  readonly budget: {
    readonly observedGold: number;
    readonly safetyReserveGold: number;
    readonly safetyReserveDeficit: number;
    readonly spendableBeforeReservations: number;
    readonly plannedReservedGold: number;
    readonly availableAfterReservations: number;
    readonly reservationDeficit: number;
    readonly reservationCount: number;
    readonly pressure: MerchantGoldBudgetPressure;
    readonly reservationPlanningOnly: true;
    readonly mutationAuthority: false;
    readonly reservations: readonly MerchantGoldPlanningReservation[];
  };
}

export interface MerchantGoldBudgetServiceOptions {
  readonly inventory: Pick<MerchantInventoryPreviewService, "state">;
  readonly safetyReserveGold?: number;
  readonly clock?: () => Date;
}

export class MerchantGoldBudgetService {
  readonly #inventory: Pick<MerchantInventoryPreviewService, "state">;
  readonly #safetyReserveGold: number;
  readonly #clock: () => Date;

  constructor(options: MerchantGoldBudgetServiceOptions) {
    this.#inventory = options.inventory;
    this.#safetyReserveGold = nonNegativeSafeInteger(
      options.safetyReserveGold,
      1_000,
    );
    this.#clock = options.clock ?? (() => new Date());
  }

  state(): MerchantGoldBudgetState {
    return buildMerchantGoldBudgetSnapshot(this.#inventory.state(), {
      safetyReserveGold: this.#safetyReserveGold,
      observedAt: this.#clock().toISOString(),
    });
  }

  runSelfTest() {
    const ready = buildMerchantGoldBudgetSnapshot(inventoryFixture(10_000), {
      safetyReserveGold: 1_000,
      reservations: Object.freeze([
        reservation("R1", "W1", 2_000, "npc-buy"),
        reservation("R2", "W2", 3_000, "production"),
      ]),
      observedAt: "2026-10-05T00:00:00.000Z",
    });
    const constrained = buildMerchantGoldBudgetSnapshot(inventoryFixture(6_000), {
      safetyReserveGold: 1_000,
      reservations: Object.freeze([
        reservation("R3", "W3", 5_000, "fully-allocated"),
      ]),
      observedAt: "2026-10-05T00:00:01.000Z",
    });
    const overbooked = buildMerchantGoldBudgetSnapshot(inventoryFixture(6_000), {
      safetyReserveGold: 1_000,
      reservations: Object.freeze([
        reservation("R4", "W4", 5_001, "overbook-attempt"),
      ]),
      observedAt: "2026-10-05T00:00:02.000Z",
    });
    const reserveBlocked = buildMerchantGoldBudgetSnapshot(inventoryFixture(500), {
      safetyReserveGold: 1_000,
      observedAt: "2026-10-05T00:00:03.000Z",
    });
    const checks = Object.freeze({
      readyBudget:
        ready.budget.pressure === "ready" &&
        ready.budget.observedGold === 10_000 &&
        ready.budget.safetyReserveGold === 1_000 &&
        ready.budget.spendableBeforeReservations === 9_000 &&
        ready.budget.plannedReservedGold === 5_000 &&
        ready.budget.availableAfterReservations === 4_000 &&
        ready.budget.reservationDeficit === 0,
      constrainedBudget:
        constrained.budget.pressure === "constrained" &&
        constrained.budget.availableAfterReservations === 0 &&
        constrained.budget.reservationDeficit === 0,
      parallelOverbookingBlocked:
        overbooked.budget.pressure === "blocked" &&
        overbooked.budget.availableAfterReservations === 0 &&
        overbooked.budget.reservationDeficit === 1,
      safetyReservePreserved:
        reserveBlocked.budget.pressure === "blocked" &&
        reserveBlocked.budget.safetyReserveDeficit === 500 &&
        reserveBlocked.budget.spendableBeforeReservations === 0,
      reservationAccounting:
        ready.budget.plannedReservedGold ===
          ready.budget.reservations.reduce((sum, row) => sum + row.amount, 0),
      planningOnly:
        ready.budget.reservationPlanningOnly === true &&
        ready.budget.mutationAuthority === false &&
        ready.descriptor.reservationPlanningOnly === true &&
        ready.descriptor.mutationAuthority === false,
      readOnlyContract:
        ready.descriptor.actionGatewayUsed === false &&
        ready.descriptor.rawSocketAccess === false &&
        ready.descriptor.bankMutation === false &&
        ready.descriptor.tradeMutation === false &&
        ready.descriptor.transferMutation === false &&
        ready.descriptor.buySellMutation === false &&
        ready.descriptor.goldTransferMutation === false,
      noGameplayMutation: true,
      userScriptUntouched: true,
    });
    return Object.freeze({
      status: Object.values(checks).every(Boolean) ? "ready" as const : "failed" as const,
      descriptor: merchantGoldBudgetDescriptor(),
      checks,
      ready: budgetSummary(ready),
      constrained: budgetSummary(constrained),
      overbooked: budgetSummary(overbooked),
      reserveBlocked: budgetSummary(reserveBlocked),
      gameplayMutation: false,
      actionGatewayRequests: 0,
      rawSocketAccess: false,
      userScriptTouched: false,
    });
  }
}

export function merchantGoldBudgetDescriptor() {
  return Object.freeze({
    slice: "14.3" as const,
    domain: "merchant" as const,
    mode: "read-only" as const,
    sourceSlice: "14.1" as const,
    goldBudgetLedger: true,
    safetyReserveGoldDefault: 1_000,
    exclusivePlanningReservations: true,
    parallelOverbookingBlocked: true,
    reservationPlanningOnly: true,
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

export function buildMerchantGoldBudgetSnapshot(
  preview: MerchantInventoryPreviewState,
  options: {
    readonly safetyReserveGold?: number;
    readonly reservations?: readonly MerchantGoldPlanningReservation[];
    readonly observedAt?: string;
  } = {},
): MerchantGoldBudgetState {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const safetyReserveGold = nonNegativeSafeInteger(options.safetyReserveGold, 1_000);
  const reservations = Object.freeze(
    (options.reservations ?? []).map(normalizeReservation),
  );

  const rawGold = preview.character?.gold;
  if (
    preview.status !== "ready" ||
    !Number.isSafeInteger(rawGold) ||
    Number(rawGold) < 0
  ) {
    return unavailableBudget(observedAt, safetyReserveGold);
  }

  const observedGold = Number(rawGold);
  const safetyReserveDeficit = Math.max(0, safetyReserveGold - observedGold);
  const spendableBeforeReservations = Math.max(
    0,
    observedGold - safetyReserveGold,
  );
  const plannedReservedGold = reservations.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const reservationDeficit = Math.max(
    0,
    plannedReservedGold - spendableBeforeReservations,
  );
  const availableAfterReservations = Math.max(
    0,
    spendableBeforeReservations - plannedReservedGold,
  );
  const pressure: MerchantGoldBudgetPressure =
    safetyReserveDeficit > 0 || reservationDeficit > 0
      ? "blocked"
      : availableAfterReservations === 0
      ? "constrained"
      : "ready";

  return Object.freeze({
    schemaVersion: 1 as const,
    status: "ready" as const,
    message: pressure === "ready"
      ? `Merchant Gold Budget ready. ${observedGold} gold observed; ${safetyReserveGold} protected; ${availableAfterReservations} available after planning reservations.`
      : pressure === "constrained"
      ? `Merchant Gold Budget constrained. The safety reserve is preserved, but no unreserved spendable gold remains.`
      : `Merchant Gold Budget blocked. The requested planning budget would violate the protected safety reserve or overbook spendable gold.`,
    observedAt,
    descriptor: merchantGoldBudgetDescriptor(),
    sourceInventoryObservedAt: preview.observedAt,
    budget: Object.freeze({
      observedGold,
      safetyReserveGold,
      safetyReserveDeficit,
      spendableBeforeReservations,
      plannedReservedGold,
      availableAfterReservations,
      reservationDeficit,
      reservationCount: reservations.length,
      pressure,
      reservationPlanningOnly: true as const,
      mutationAuthority: false as const,
      reservations,
    }),
  });
}

function unavailableBudget(
  observedAt: string,
  safetyReserveGold: number,
): MerchantGoldBudgetState {
  return Object.freeze({
    schemaVersion: 1 as const,
    status: "unavailable" as const,
    message:
      "Merchant Gold & Budget Preview requires a live Slice 14.1 Merchant observation with a valid gold balance.",
    observedAt,
    descriptor: merchantGoldBudgetDescriptor(),
    budget: Object.freeze({
      observedGold: 0,
      safetyReserveGold,
      safetyReserveDeficit: safetyReserveGold,
      spendableBeforeReservations: 0,
      plannedReservedGold: 0,
      availableAfterReservations: 0,
      reservationDeficit: 0,
      reservationCount: 0,
      pressure: "blocked" as const,
      reservationPlanningOnly: true as const,
      mutationAuthority: false as const,
      reservations: Object.freeze([]),
    }),
  });
}

function normalizeReservation(
  value: MerchantGoldPlanningReservation,
): MerchantGoldPlanningReservation {
  if (
    !value ||
    typeof value.reservationId !== "string" ||
    !value.reservationId.trim() ||
    typeof value.workflowId !== "string" ||
    !value.workflowId.trim() ||
    typeof value.purpose !== "string" ||
    !value.purpose.trim() ||
    !Number.isSafeInteger(value.amount) ||
    value.amount <= 0
  ) {
    throw new Error("Merchant Gold planning reservation is invalid.");
  }
  return Object.freeze({
    reservationId: value.reservationId.trim(),
    workflowId: value.workflowId.trim(),
    amount: value.amount,
    purpose: value.purpose.trim(),
  });
}

function reservation(
  reservationId: string,
  workflowId: string,
  amount: number,
  purpose: string,
): MerchantGoldPlanningReservation {
  return Object.freeze({ reservationId, workflowId, amount, purpose });
}

function budgetSummary(state: MerchantGoldBudgetState) {
  return Object.freeze({
    observedGold: state.budget.observedGold,
    safetyReserveGold: state.budget.safetyReserveGold,
    plannedReservedGold: state.budget.plannedReservedGold,
    availableAfterReservations: state.budget.availableAfterReservations,
    safetyReserveDeficit: state.budget.safetyReserveDeficit,
    reservationDeficit: state.budget.reservationDeficit,
    pressure: state.budget.pressure,
  });
}

function inventoryFixture(gold: number): MerchantInventoryPreviewState {
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
      id: "CH_MERCHANT",
      name: "Merchant",
      type: "merchant",
      level: 80,
      dead: false,
      gold,
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

function nonNegativeSafeInteger(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
    ? value
    : fallback;
}
