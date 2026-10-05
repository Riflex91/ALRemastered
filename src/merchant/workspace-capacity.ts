import type {
  MerchantInventoryPreviewService,
  MerchantInventoryPreviewState,
} from "./inventory-preview.ts";

export type MerchantCapacityPressure = "ready" | "constrained" | "blocked";

export interface MerchantWorkspaceCapacityState {
  readonly schemaVersion: 1;
  readonly status: "ready" | "unavailable";
  readonly message: string;
  readonly observedAt: string;
  readonly descriptor: ReturnType<typeof merchantWorkspaceCapacityDescriptor>;
  readonly sourceInventoryObservedAt?: string;
  readonly inventory: {
    readonly capacity: number;
    readonly used: number;
    readonly free: number;
  };
  readonly capacity: {
    readonly workspaceSlots: number;
    readonly pickupReserveSlots: number;
    readonly totalReservedSlots: number;
    readonly generalFreeSlots: number;
    readonly deficit: number;
    readonly pressure: MerchantCapacityPressure;
    readonly multiStepWorkflowAllowed: boolean;
    readonly mutationAuthority: false;
  };
}

export interface MerchantWorkspaceCapacityServiceOptions {
  readonly inventory: Pick<MerchantInventoryPreviewService, "state">;
  readonly workspaceSlots?: number;
  readonly pickupReserveSlots?: number;
  readonly clock?: () => Date;
}

export class MerchantWorkspaceCapacityService {
  readonly #inventory: Pick<MerchantInventoryPreviewService, "state">;
  readonly #workspaceSlots: number;
  readonly #pickupReserveSlots: number;
  readonly #clock: () => Date;

  constructor(options: MerchantWorkspaceCapacityServiceOptions) {
    this.#inventory = options.inventory;
    this.#workspaceSlots = boundedPositiveInteger(options.workspaceSlots, 3, 16);
    this.#pickupReserveSlots = boundedPositiveInteger(options.pickupReserveSlots, 1, 8);
    this.#clock = options.clock ?? (() => new Date());
  }

  state(): MerchantWorkspaceCapacityState {
    return buildMerchantWorkspaceCapacitySnapshot(
      this.#inventory.state(),
      {
        workspaceSlots: this.#workspaceSlots,
        pickupReserveSlots: this.#pickupReserveSlots,
        observedAt: this.#clock().toISOString(),
      },
    );
  }

  runSelfTest() {
    const ready = buildMerchantWorkspaceCapacitySnapshot(
      inventoryFixture(12, 6),
      { workspaceSlots: 3, pickupReserveSlots: 1, observedAt: "2026-10-05T00:00:00.000Z" },
    );
    const constrained = buildMerchantWorkspaceCapacitySnapshot(
      inventoryFixture(12, 10),
      { workspaceSlots: 3, pickupReserveSlots: 1, observedAt: "2026-10-05T00:00:01.000Z" },
    );
    const blocked = buildMerchantWorkspaceCapacitySnapshot(
      inventoryFixture(12, 12),
      { workspaceSlots: 3, pickupReserveSlots: 1, observedAt: "2026-10-05T00:00:02.000Z" },
    );
    const checks = Object.freeze({
      readyCapacity:
        ready.capacity.pressure === "ready" &&
        ready.capacity.totalReservedSlots === 4 &&
        ready.capacity.generalFreeSlots === 2 &&
        ready.capacity.deficit === 0 &&
        ready.capacity.multiStepWorkflowAllowed,
      constrainedCapacity:
        constrained.capacity.pressure === "constrained" &&
        constrained.capacity.generalFreeSlots === 0 &&
        constrained.capacity.deficit === 2 &&
        !constrained.capacity.multiStepWorkflowAllowed,
      blockedCapacity:
        blocked.capacity.pressure === "blocked" &&
        blocked.inventory.free === 0 &&
        blocked.capacity.deficit === 4 &&
        !blocked.capacity.multiStepWorkflowAllowed,
      reservationAccounting:
        ready.capacity.totalReservedSlots ===
          ready.capacity.workspaceSlots + ready.capacity.pickupReserveSlots,
      sourceInventoryPreserved:
        ready.inventory.capacity === 12 &&
        ready.inventory.used === 6 &&
        ready.inventory.free === 6,
      planningOnly:
        ready.capacity.mutationAuthority === false &&
        ready.descriptor.reservationPlanningOnly === true &&
        ready.descriptor.mutationAuthority === false,
      readOnlyContract:
        ready.descriptor.actionGatewayUsed === false &&
        ready.descriptor.rawSocketAccess === false &&
        ready.descriptor.bankMutation === false &&
        ready.descriptor.tradeMutation === false &&
        ready.descriptor.transferMutation === false &&
        ready.descriptor.buySellMutation === false,
      noGameplayMutation: true,
      userScriptUntouched: true,
    });
    return Object.freeze({
      status: Object.values(checks).every(Boolean) ? "ready" as const : "failed" as const,
      descriptor: merchantWorkspaceCapacityDescriptor(),
      checks,
      ready: Object.freeze({
        free: ready.inventory.free,
        generalFreeSlots: ready.capacity.generalFreeSlots,
        totalReservedSlots: ready.capacity.totalReservedSlots,
        pressure: ready.capacity.pressure,
      }),
      constrained: Object.freeze({
        free: constrained.inventory.free,
        deficit: constrained.capacity.deficit,
        pressure: constrained.capacity.pressure,
      }),
      blocked: Object.freeze({
        free: blocked.inventory.free,
        deficit: blocked.capacity.deficit,
        pressure: blocked.capacity.pressure,
      }),
      gameplayMutation: false,
      actionGatewayRequests: 0,
      rawSocketAccess: false,
      userScriptTouched: false,
    });
  }
}

export function merchantWorkspaceCapacityDescriptor() {
  return Object.freeze({
    slice: "14.2" as const,
    domain: "merchant" as const,
    mode: "read-only" as const,
    sourceSlice: "14.1" as const,
    capacityPreflight: true,
    workspaceSlotsDefault: 3,
    pickupReserveSlotsDefault: 1,
    reservationPlanningOnly: true,
    mutationAuthority: false,
    bankMutation: false,
    tradeMutation: false,
    transferMutation: false,
    buySellMutation: false,
    upgradeMutation: false,
    compoundMutation: false,
    actionGatewayUsed: false,
    rawSocketAccess: false,
  });
}

export function buildMerchantWorkspaceCapacitySnapshot(
  preview: MerchantInventoryPreviewState,
  options: {
    readonly workspaceSlots?: number;
    readonly pickupReserveSlots?: number;
    readonly observedAt?: string;
  } = {},
): MerchantWorkspaceCapacityState {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const workspaceSlots = boundedPositiveInteger(options.workspaceSlots, 3, 16);
  const pickupReserveSlots = boundedPositiveInteger(options.pickupReserveSlots, 1, 8);
  const totalReservedSlots = workspaceSlots + pickupReserveSlots;

  if (preview.status !== "ready") {
    return Object.freeze({
      schemaVersion: 1 as const,
      status: "unavailable" as const,
      message:
        "Merchant Workspace & Capacity Preview requires the Slice 14.1 live Merchant inventory preview.",
      observedAt,
      descriptor: merchantWorkspaceCapacityDescriptor(),
      inventory: Object.freeze({ capacity: 0, used: 0, free: 0 }),
      capacity: Object.freeze({
        workspaceSlots,
        pickupReserveSlots,
        totalReservedSlots,
        generalFreeSlots: 0,
        deficit: totalReservedSlots,
        pressure: "blocked" as const,
        multiStepWorkflowAllowed: false,
        mutationAuthority: false as const,
      }),
    });
  }

  const capacity = Math.max(0, Math.floor(preview.inventory.capacity));
  const used = Math.max(0, Math.min(capacity, Math.floor(preview.inventory.used)));
  const free = Math.max(0, capacity - used);
  const deficit = Math.max(0, totalReservedSlots - free);
  const generalFreeSlots = Math.max(0, free - totalReservedSlots);
  const pressure: MerchantCapacityPressure =
    free === 0 ? "blocked" : deficit > 0 ? "constrained" : "ready";
  const multiStepWorkflowAllowed = deficit === 0;

  return Object.freeze({
    schemaVersion: 1 as const,
    status: "ready" as const,
    message: multiStepWorkflowAllowed
      ? `Merchant capacity preflight ready. ${free} free slots observed; ${totalReservedSlots} kept for workspace and pickup reserve.`
      : `Merchant capacity preflight blocked. ${free} free slots observed; ${deficit} additional free slot(s) required before a multi-step Merchant workflow may start.`,
    observedAt,
    descriptor: merchantWorkspaceCapacityDescriptor(),
    sourceInventoryObservedAt: preview.observedAt,
    inventory: Object.freeze({ capacity, used, free }),
    capacity: Object.freeze({
      workspaceSlots,
      pickupReserveSlots,
      totalReservedSlots,
      generalFreeSlots,
      deficit,
      pressure,
      multiStepWorkflowAllowed,
      mutationAuthority: false as const,
    }),
  });
}

function inventoryFixture(capacity: number, used: number): MerchantInventoryPreviewState {
  const items = Object.freeze(
    Array.from({ length: used }, (_, slot) =>
      Object.freeze({
        slot,
        physicalId: `CH_MERCHANT:${slot}:fixture`,
        fingerprint: "0".repeat(64),
        name: "fixture",
        quantity: 1,
        locked: false,
      })
    ),
  );
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
      gold: 0,
    }),
    inventory: Object.freeze({
      capacity,
      used,
      free: Math.max(0, capacity - used),
      items,
    }),
    disposition: Object.freeze({
      default: "hold" as const,
      mutationAuthority: false as const,
      items: Object.freeze(items.map((item) =>
        Object.freeze({
          slot: item.slot,
          physicalId: item.physicalId,
          disposition: "hold" as const,
          reason: "fixture",
        })
      )),
    }),
  });
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
