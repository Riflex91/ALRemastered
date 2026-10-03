import {
  ActionGatewayExecutionError,
  type ActionGateway,
  type ActionGatewayResult,
  type ActionOrigin,
} from "./gateway.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";
import type { Logger } from "../logging/logger.ts";

export type ConsumableKind = "hp" | "mp";

export interface DashboardLootRequest {
  readonly chestId: string;
}

export interface DashboardConsumableRequest {
  readonly inventoryIndex: number;
  readonly itemName: string;
  readonly kind: ConsumableKind;
}

export interface DashboardLootChestOption {
  readonly id: string;
  readonly map?: string;
  readonly x?: number;
  readonly y?: number;
  readonly itemCount?: number;
  readonly distance?: number;
}

export interface DashboardConsumableOption {
  readonly inventoryIndex: number;
  readonly itemName: string;
  readonly displayName: string;
  readonly kind: ConsumableKind;
  readonly quantity: number;
  readonly restoreAmount: number;
  readonly cooldownMs?: number;
}

export interface DashboardLootConsumableOptionsState {
  readonly status: "ready" | "unavailable";
  readonly message: string;
  readonly characterId?: string;
  readonly lootChests: readonly DashboardLootChestOption[];
  readonly consumables: readonly DashboardConsumableOption[];
}

export interface LootActionResult {
  readonly chestId: string;
  readonly map?: string;
  readonly distance?: number;
  readonly itemCount?: number;
  readonly serverAccepted: true;
}

export interface ConsumableActionResult {
  readonly inventoryIndex: number;
  readonly itemName: string;
  readonly displayName: string;
  readonly kind: ConsumableKind;
  readonly quantityBefore: number;
  readonly restoreAmount: number;
  readonly serverAccepted: true;
  readonly cooldownMs?: number;
}

export interface AdventureLandLootConsumableServiceOptions {
  readonly gateway: ActionGateway;
  readonly logger: Logger;
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "sendLoot" | "sendConsumable" | "skillCooldownRemainingMs"
  >;
  readonly gameData: () => AdventureLandGameData | undefined;
}

const LOOT_RATE_INTERVAL_MS = 500;
const CONSUMABLE_RATE_INTERVAL_MS = 500;

export class AdventureLandLootConsumableService {
  readonly #gateway: ActionGateway;
  readonly #logger: Logger;
  readonly #character: Pick<
    AdventureLandCharacterService,
    "state" | "sendLoot" | "sendConsumable" | "skillCooldownRemainingMs"
  >;
  readonly #gameData: () => AdventureLandGameData | undefined;

  constructor(options: AdventureLandLootConsumableServiceOptions) {
    this.#gateway = options.gateway;
    this.#logger = options.logger;
    this.#character = options.character;
    this.#gameData = options.gameData;
  }

  dashboardOptions(): DashboardLootConsumableOptionsState {
    const state = this.#character.state();
    const data = this.#gameData();
    if (state.status !== "connected" || !state.character) {
      return Object.freeze({
        status: "unavailable",
        message: "Connect a headless character to load loot and consumable tests.",
        characterId: state.characterId,
        lootChests: Object.freeze([]),
        consumables: Object.freeze([]),
      });
    }
    if (!data) {
      return Object.freeze({
        status: "unavailable",
        message: "Adventure Land game data is required to validate consumables.",
        characterId: state.characterId,
        lootChests: Object.freeze([]),
        consumables: Object.freeze([]),
      });
    }

    const character = state.character;
    const lootChests = (state.lootChests ?? [])
      .filter((chest) => !chest.map || !character.map || chest.map === character.map)
      .map((chest) => Object.freeze({
        id: chest.id,
        map: chest.map,
        x: chest.x,
        y: chest.y,
        itemCount: chest.items,
        distance: distanceBetween(
          character.x,
          character.y,
          chest.x,
          chest.y,
        ),
      }))
      .sort((left, right) =>
        (left.distance ?? Number.POSITIVE_INFINITY) -
          (right.distance ?? Number.POSITIVE_INFINITY) ||
        left.id.localeCompare(right.id)
      );

    const consumables: DashboardConsumableOption[] = [];
    for (const [inventoryIndex, item] of (character.inventory ?? []).entries()) {
      if (!item || typeof item.name !== "string" || !item.name) continue;
      const raw = data.items[item.name];
      if (!isRecord(raw)) continue;
      const hp = positiveGive(raw, "hp");
      const mp = positiveGive(raw, "mp");
      if ((hp === undefined) === (mp === undefined)) continue;

      const kind: ConsumableKind = hp !== undefined ? "hp" : "mp";
      const restoreAmount = hp ?? mp!;
      const quantity = positiveNumber(item.q) ?? 1;
      consumables.push(Object.freeze({
        inventoryIndex,
        itemName: item.name,
        displayName: typeof raw.name === "string" && raw.name
          ? raw.name
          : item.name,
        kind,
        quantity,
        restoreAmount,
        cooldownMs: potionCooldownMs(data, kind),
      }));
    }

    return Object.freeze({
      status: "ready",
      message:
        "Visible loot chests and inventory-backed HP/MP consumables are available for manual testing.",
      characterId: state.characterId,
      lootChests: Object.freeze(lootChests),
      consumables: Object.freeze(consumables),
    });
  }

  runDashboardLoot(
    request: DashboardLootRequest,
  ): Promise<ActionGatewayResult<LootActionResult>> {
    return this.runLoot(request, "dashboard");
  }

  runLoot(
    request: DashboardLootRequest,
    origin: ActionOrigin,
  ): Promise<ActionGatewayResult<LootActionResult>> {
    const chestId = request.chestId.trim();
    const characterId = this.#character.state().characterId;

    return this.#gateway.run({
      action: "character.loot",
      origin,
      characterId,
      input: { chestId },
      timeoutMs: 4_000,
      minIntervalMs: LOOT_RATE_INTERVAL_MS,
      rateLimitKey: [origin, characterId ?? "-", "character.loot"].join(":"),
      execute: async ({ signal, requestId, characterId: executionCharacterId }) => {
        if (!chestId || chestId.length > 160) {
          throw new ActionGatewayExecutionError(
            "Select a visible loot chest before running the loot test.",
            "LOOT_CHEST_REQUIRED",
          );
        }

        const state = this.#character.state();
        if (state.status !== "connected" || !state.character) {
          throw new ActionGatewayExecutionError(
            "Connect a headless character before testing loot.",
            "CHARACTER_NOT_CONNECTED",
          );
        }
        if (state.character.dead) {
          throw new ActionGatewayExecutionError(
            "A dead character cannot run the loot test.",
            "LOOT_CHARACTER_DEAD",
          );
        }

        const chest = state.lootChests?.find((entry) => entry.id === chestId);
        if (!chest) {
          throw new ActionGatewayExecutionError(
            "The selected loot chest is no longer visible.",
            "LOOT_CHEST_NOT_VISIBLE",
          );
        }
        if (
          chest.map &&
          state.character.map &&
          chest.map !== state.character.map
        ) {
          throw new ActionGatewayExecutionError(
            "The selected loot chest is not on the character's current map.",
            "LOOT_CHEST_WRONG_MAP",
          );
        }

        const receipt = await this.#character.sendLoot({ chestId, signal });
        if (!receipt.success) {
          this.#logger.warn(
            "Loot server response rejected.",
            {
              action: "character.loot",
              origin,
              chestId,
              reason: receipt.reason,
              opener: receipt.opener,
            },
            { requestId, characterId: executionCharacterId },
          );
          throw serverLootFailure(receipt.reason);
        }

        const result = {
          chestId,
          map: chest.map,
          distance: distanceBetween(
            state.character.x,
            state.character.y,
            chest.x,
            chest.y,
          ),
          itemCount: chest.items,
          serverAccepted: true as const,
        };
        this.#logger.info(
          "Loot server response confirmed.",
          {
            action: "character.loot",
            origin,
            ...result,
          },
          { requestId, characterId: executionCharacterId },
        );
        return result;
      },
    });
  }

  runDashboardConsumable(
    request: DashboardConsumableRequest,
  ): Promise<ActionGatewayResult<ConsumableActionResult>> {
    return this.runConsumable(request, "dashboard");
  }

  runConsumable(
    request: DashboardConsumableRequest,
    origin: ActionOrigin,
  ): Promise<ActionGatewayResult<ConsumableActionResult>> {
    const itemName = request.itemName.trim();
    const inventoryIndex = request.inventoryIndex;
    const kind = request.kind;
    const characterId = this.#character.state().characterId;

    return this.#gateway.run({
      action: "character.consume",
      origin,
      characterId,
      input: { inventoryIndex, itemName, kind },
      timeoutMs: 4_000,
      minIntervalMs: CONSUMABLE_RATE_INTERVAL_MS,
      rateLimitKey: [origin, characterId ?? "-", "character.consume"].join(":"),
      execute: async ({ signal, requestId, characterId: executionCharacterId }) => {
        if (
          !Number.isInteger(inventoryIndex) ||
          inventoryIndex < 0 ||
          !itemName ||
          itemName.length > 120 ||
          (kind !== "hp" && kind !== "mp")
        ) {
          throw new ActionGatewayExecutionError(
            "Select one inventory-backed HP/MP consumable before running the test.",
            "CONSUMABLE_REQUIRED",
          );
        }

        const state = this.#character.state();
        const data = this.#gameData();
        if (state.status !== "connected" || !state.character) {
          throw new ActionGatewayExecutionError(
            "Connect a headless character before testing a consumable.",
            "CHARACTER_NOT_CONNECTED",
          );
        }
        if (!data) {
          throw new ActionGatewayExecutionError(
            "Adventure Land game data is required to validate consumables.",
            "CONSUMABLE_GAME_DATA_UNAVAILABLE",
          );
        }
        if (state.character.dead) {
          throw new ActionGatewayExecutionError(
            "A dead character cannot run the consumable test.",
            "CONSUMABLE_CHARACTER_DEAD",
          );
        }

        const item = state.character.inventory?.[inventoryIndex];
        if (!item || typeof item.name !== "string" || item.name !== itemName) {
          throw new ActionGatewayExecutionError(
            "The selected inventory item changed before it could be used.",
            "CONSUMABLE_ITEM_CHANGED",
          );
        }
        const raw = data.items[itemName];
        if (!isRecord(raw)) {
          throw new ActionGatewayExecutionError(
            "The selected inventory item is not present in current Adventure Land game data.",
            "CONSUMABLE_ITEM_UNKNOWN",
          );
        }
        const restoreAmount = positiveGive(raw, kind);
        const otherKind: ConsumableKind = kind === "hp" ? "mp" : "hp";
        if (
          restoreAmount === undefined ||
          positiveGive(raw, otherKind) !== undefined
        ) {
          throw new ActionGatewayExecutionError(
            "The selected item is not a bounded single-resource HP/MP consumable.",
            "CONSUMABLE_NOT_ALLOWED",
          );
        }

        const current = kind === "hp" ? state.character.hp : state.character.mp;
        const maximum = kind === "hp"
          ? state.character.maxHp
          : state.character.maxMp;
        if (
          typeof current !== "number" ||
          !Number.isFinite(current) ||
          typeof maximum !== "number" ||
          !Number.isFinite(maximum) ||
          maximum <= 0
        ) {
          throw new ActionGatewayExecutionError(
            "Current and maximum resource values are required before using a consumable.",
            "CONSUMABLE_RESOURCE_STATE_UNAVAILABLE",
          );
        }
        if (current >= maximum) {
          throw new ActionGatewayExecutionError(
            kind.toUpperCase() + " is already full.",
            "CONSUMABLE_RESOURCE_FULL",
          );
        }

        const cooldownKey = kind === "hp" ? "use_hp" : "use_mp";
        const localCooldownMs = this.#character.skillCooldownRemainingMs(
          cooldownKey,
        );
        if (localCooldownMs > 0) {
          throw new ActionGatewayExecutionError(
            "Potion cooldown is still active.",
            "CONSUMABLE_COOLDOWN",
            localCooldownMs,
          );
        }

        const quantityBefore = positiveNumber(item.q) ?? 1;
        const receipt = await this.#character.sendConsumable({
          inventoryIndex,
          itemName,
          kind,
          signal,
        });
        if (!receipt.success) {
          this.#logger.warn(
            "Consumable server response rejected.",
            {
              action: "character.consume",
              origin,
              inventoryIndex,
              itemName,
              kind,
              reason: receipt.reason,
              cooldownMs: receipt.cooldownMs,
            },
            { requestId, characterId: executionCharacterId },
          );
          throw serverConsumableFailure(receipt.reason, receipt.cooldownMs);
        }

        const result = {
          inventoryIndex,
          itemName,
          displayName: typeof raw.name === "string" && raw.name
            ? raw.name
            : itemName,
          kind,
          quantityBefore,
          restoreAmount,
          serverAccepted: true as const,
          cooldownMs: receipt.cooldownMs,
        };
        this.#logger.info(
          "Consumable server response confirmed.",
          {
            action: "character.consume",
            origin,
            ...result,
          },
          { requestId, characterId: executionCharacterId },
        );
        return result;
      },
    });
  }
}

function serverLootFailure(reason: string | undefined): ActionGatewayExecutionError {
  if (reason === "opened_by_other" || reason === "gone") {
    return new ActionGatewayExecutionError(
      "Adventure Land reported that the selected loot chest was already gone.",
      "LOOT_CHEST_GONE",
    );
  }
  return new ActionGatewayExecutionError(
    reason
      ? "Adventure Land rejected the loot request (" + reason + ")."
      : "Adventure Land rejected the loot request.",
    "LOOT_SERVER_REJECTED",
  );
}

function serverConsumableFailure(
  reason: string | undefined,
  cooldownMs: number | undefined,
): ActionGatewayExecutionError {
  if (reason === "cooldown") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the consumable because potion cooldown is active.",
      "CONSUMABLE_COOLDOWN",
      cooldownMs,
    );
  }
  if (reason === "no_item" || reason === "invalid") {
    return new ActionGatewayExecutionError(
      "Adventure Land could not use the selected inventory item.",
      "CONSUMABLE_ITEM_UNAVAILABLE",
    );
  }
  return new ActionGatewayExecutionError(
    reason
      ? "Adventure Land rejected the consumable (" + reason + ")."
      : "Adventure Land rejected the consumable.",
    "CONSUMABLE_SERVER_REJECTED",
    cooldownMs,
  );
}

function positiveGive(
  raw: Readonly<Record<string, unknown>>,
  kind: ConsumableKind,
): number | undefined {
  if (!Array.isArray(raw.gives)) return undefined;
  let total = 0;
  for (const entry of raw.gives) {
    if (
      !Array.isArray(entry) ||
      entry[0] !== kind ||
      typeof entry[1] !== "number" ||
      !Number.isFinite(entry[1]) ||
      entry[1] <= 0
    ) continue;
    total += entry[1];
  }
  return total > 0 ? total : undefined;
}

function potionCooldownMs(
  data: AdventureLandGameData,
  kind: ConsumableKind,
): number | undefined {
  const raw = data.skills[kind === "hp" ? "use_hp" : "use_mp"];
  if (!isRecord(raw)) return undefined;
  return positiveNumber(raw.cooldown) ?? positiveNumber(raw.reuse_cooldown);
}

function distanceBetween(
  leftX: number | undefined,
  leftY: number | undefined,
  rightX: number | undefined,
  rightY: number | undefined,
): number | undefined {
  if (
    typeof leftX !== "number" ||
    !Number.isFinite(leftX) ||
    typeof leftY !== "number" ||
    !Number.isFinite(leftY) ||
    typeof rightX !== "number" ||
    !Number.isFinite(rightX) ||
    typeof rightY !== "number" ||
    !Number.isFinite(rightY)
  ) return undefined;
  return Math.round(Math.hypot(rightX - leftX, rightY - leftY) * 10) / 10;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
