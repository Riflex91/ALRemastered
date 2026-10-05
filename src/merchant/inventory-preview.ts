import { createHash } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type {
  AdventureLandConnectedCharacter,
  AdventureLandItemState,
} from "../character/transport.ts";

export type MerchantDisposition = "hold";

export interface MerchantInventoryLedgerItem {
  readonly slot: number;
  readonly physicalId: string;
  readonly fingerprint: string;
  readonly name: string;
  readonly level?: number;
  readonly quantity: number;
  readonly locked: boolean;
  readonly variant?: string;
}

export interface MerchantInventoryDispositionPreview {
  readonly slot: number;
  readonly physicalId: string;
  readonly disposition: MerchantDisposition;
  readonly reason: string;
}

export interface MerchantInventoryPreviewState {
  readonly schemaVersion: 1;
  readonly status: "ready" | "unavailable";
  readonly message: string;
  readonly observedAt: string;
  readonly descriptor: ReturnType<typeof merchantInventoryPreviewDescriptor>;
  readonly character?: {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly level: number;
    readonly dead: boolean;
    readonly gold?: number;
  };
  readonly inventory: {
    readonly capacity: number;
    readonly used: number;
    readonly free: number;
    readonly items: readonly MerchantInventoryLedgerItem[];
  };
  readonly disposition: {
    readonly default: MerchantDisposition;
    readonly mutationAuthority: false;
    readonly items: readonly MerchantInventoryDispositionPreview[];
  };
}

export interface MerchantInventoryPreviewServiceOptions {
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly clock?: () => Date;
}

export class MerchantInventoryPreviewService {
  readonly #character: Pick<AdventureLandCharacterService, "state">;
  readonly #clock: () => Date;

  constructor(options: MerchantInventoryPreviewServiceOptions) {
    this.#character = options.character;
    this.#clock = options.clock ?? (() => new Date());
  }

  state(): MerchantInventoryPreviewState {
    const observedAt = this.#clock().toISOString();
    const state = this.#character.state();
    if (
      state.status !== "connected" ||
      !state.character ||
      state.character.type !== "merchant" ||
      !Array.isArray(state.character.inventory)
    ) {
      return Object.freeze({
        schemaVersion: 1 as const,
        status: "unavailable" as const,
        message: "Connect a Merchant Character and wait for its live inventory before using Merchant preview.",
        observedAt,
        descriptor: merchantInventoryPreviewDescriptor(),
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
    return buildMerchantInventorySnapshot(state.character, observedAt);
  }

  runSelfTest() {
    const duplicate = Object.freeze({ name: "blade", level: 3, q: 1, p: "shiny" });
    const character: AdventureLandConnectedCharacter = Object.freeze({
      id: "CH_MERCHANT",
      name: "Merchant",
      type: "merchant",
      level: 80,
      dead: false,
      gold: 123456,
      inventory: Object.freeze([
        duplicate,
        Object.freeze({ ...duplicate }),
        null,
        Object.freeze({ name: "hpot1", q: 42 }),
      ]),
    });
    const snapshot = buildMerchantInventorySnapshot(
      character,
      "2026-10-05T00:00:00.000Z",
    );
    const quantityChanged = buildMerchantInventorySnapshot(
      Object.freeze({
        ...character,
        inventory: Object.freeze([
          Object.freeze({ ...duplicate, q: 2 }),
          Object.freeze({ ...duplicate }),
          null,
          Object.freeze({ name: "hpot1", q: 42 }),
        ]),
      }),
      "2026-10-05T00:00:01.000Z",
    );
    const checks = Object.freeze({
      merchantConnected: snapshot.character?.type === "merchant",
      inventoryObserved:
        snapshot.inventory.capacity === 4 &&
        snapshot.inventory.used === 3 &&
        snapshot.inventory.free === 1,
      emptySlotsExcluded:
        snapshot.inventory.items.length === 3 &&
        snapshot.inventory.items.every((item) => item.slot !== 2),
      duplicatePhysicalIsolation:
        snapshot.inventory.items[0]?.fingerprint ===
          snapshot.inventory.items[1]?.fingerprint &&
        snapshot.inventory.items[0]?.physicalId !==
          snapshot.inventory.items[1]?.physicalId,
      mutationChangesFingerprint:
        snapshot.inventory.items[0]?.fingerprint !==
          quantityChanged.inventory.items[0]?.fingerprint,
      stablePhysicalIdentity:
        snapshot.inventory.items.every((item) =>
          item.physicalId.startsWith(`${character.id}:${item.slot}:`) &&
          /^[a-f0-9]{64}$/.test(item.fingerprint)
        ),
      defaultHoldDisposition:
        snapshot.disposition.items.length === snapshot.inventory.used &&
        snapshot.disposition.items.every((entry) => entry.disposition === "hold"),
      readOnlyContract:
        snapshot.disposition.mutationAuthority === false &&
        snapshot.descriptor.mutationAuthority === false &&
        snapshot.descriptor.actionGatewayUsed === false &&
        snapshot.descriptor.rawSocketAccess === false,
      noGameplayMutation: true,
      userScriptUntouched: true,
    });
    const ready = Object.values(checks).every(Boolean);
    return Object.freeze({
      status: ready ? "ready" as const : "failed" as const,
      descriptor: merchantInventoryPreviewDescriptor(),
      checks,
      snapshot: Object.freeze({
        characterType: snapshot.character?.type,
        capacity: snapshot.inventory.capacity,
        used: snapshot.inventory.used,
        free: snapshot.inventory.free,
        physicalIdentityCount: new Set(
          snapshot.inventory.items.map((item) => item.physicalId),
        ).size,
        allHold: snapshot.disposition.items.every((entry) =>
          entry.disposition === "hold"
        ),
      }),
      gameplayMutation: false,
      actionGatewayRequests: 0,
      rawSocketAccess: false,
      userScriptTouched: false,
    });
  }
}

export function merchantInventoryPreviewDescriptor() {
  return Object.freeze({
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
  });
}

export function buildMerchantInventorySnapshot(
  character: AdventureLandConnectedCharacter,
  observedAt = new Date().toISOString(),
): MerchantInventoryPreviewState {
  const inventory = character.inventory ?? [];
  const items = Object.freeze(
    inventory.flatMap((item, slot) =>
      item ? [ledgerItem(character.id, slot, item)] : []
    ),
  );
  const capacity = inventory.length;
  const used = items.length;
  const free = Math.max(0, capacity - used);
  const dispositions = Object.freeze(items.map((item) =>
    Object.freeze({
      slot: item.slot,
      physicalId: item.physicalId,
      disposition: "hold" as const,
      reason:
        "Slice 14.1 is preview-only. No Merchant mutation policy or execution authority is enabled.",
    })
  ));
  return Object.freeze({
    schemaVersion: 1 as const,
    status: "ready" as const,
    message:
      `Merchant inventory preview ready. ${used}/${capacity} slots observed; all items default to HOLD.`,
    observedAt,
    descriptor: merchantInventoryPreviewDescriptor(),
    character: Object.freeze({
      id: character.id,
      name: character.name,
      type: character.type,
      level: character.level,
      dead: character.dead,
      gold: character.gold,
    }),
    inventory: Object.freeze({ capacity, used, free, items }),
    disposition: Object.freeze({
      default: "hold" as const,
      mutationAuthority: false as const,
      items: dispositions,
    }),
  });
}

function ledgerItem(
  characterId: string,
  slot: number,
  item: AdventureLandItemState,
): MerchantInventoryLedgerItem {
  const fingerprint = itemFingerprint(item);
  const name = typeof item.name === "string" && item.name.trim()
    ? item.name.trim()
    : "(unknown)";
  const level = nonNegativeInteger(item.level);
  const quantity = positiveInteger(item.q) ?? 1;
  const variant = typeof item.p === "string" && item.p.trim()
    ? item.p.trim()
    : undefined;
  return Object.freeze({
    slot,
    physicalId: `${characterId}:${slot}:${fingerprint.slice(0, 16)}`,
    fingerprint,
    name,
    level,
    quantity,
    locked: item.l === true || item.locked === true,
    variant,
  });
}

function itemFingerprint(item: AdventureLandItemState): string {
  return createHash("sha256").update(stableJson(item)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
