import type { AdventureLandAttackService } from "../action/attack.ts";
import type { ActionGatewayResult } from "../action/gateway.ts";
import type { AdventureLandLootConsumableService } from "../action/loot-consumable.ts";
import type { AdventureLandMovementService, MovementActionResult } from "../action/movement.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type {
  AdventureLandConnectedCharacter,
  AdventureLandLootChestState,
} from "../character/transport.ts";
import type { AdventureLandVisibleEntity } from "../character/world-state.ts";
import type { AdventureLandGameEvent } from "../character/game-events.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";

export type ScriptAdventureApiMethod = "move" | "xmove" | "attack" | "loot";

export interface ScriptAdventureApiDynamicState {
  readonly character: Readonly<Record<string, unknown>>;
  readonly Entities: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly attackCooldownMs: number;
  readonly lootChests: readonly Readonly<Record<string, unknown>>[];
}

export interface ScriptAdventureApiBootstrap {
  readonly G: Readonly<Record<string, unknown>>;
  readonly state: ScriptAdventureApiDynamicState;
}

export interface ScriptAdventureApiBridge {
  bootstrap(): ScriptAdventureApiBootstrap;
  state(): ScriptAdventureApiDynamicState;
  onEvent?(listener: (event: AdventureLandGameEvent) => void): () => void;
  call(
    method: ScriptAdventureApiMethod,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

export interface AdventureLandScriptApiBridgeOptions {
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "attackCooldownRemainingMs"
  > & Partial<Pick<AdventureLandCharacterService, "onGameEvent">>;
  readonly movement: Pick<AdventureLandMovementService, "runScript">;
  readonly attack: Pick<AdventureLandAttackService, "run">;
  readonly loot: Pick<AdventureLandLootConsumableService, "runLoot">;
  readonly gameData: () => AdventureLandGameData | undefined;
}

export class AdventureLandScriptApiBridge implements ScriptAdventureApiBridge {
  readonly #character: Pick<
    AdventureLandCharacterService,
    "state" | "attackCooldownRemainingMs"
  > & Partial<Pick<AdventureLandCharacterService, "onGameEvent">>;
  readonly #movement: Pick<AdventureLandMovementService, "runScript">;
  readonly #attack: Pick<AdventureLandAttackService, "run">;
  readonly #loot: Pick<AdventureLandLootConsumableService, "runLoot">;
  readonly #gameData: () => AdventureLandGameData | undefined;

  constructor(options: AdventureLandScriptApiBridgeOptions) {
    this.#character = options.character;
    this.#movement = options.movement;
    this.#attack = options.attack;
    this.#loot = options.loot;
    this.#gameData = options.gameData;
  }

  bootstrap(): ScriptAdventureApiBootstrap {
    return Object.freeze({
      G: structuredClone(this.#gameData() ?? {}),
      state: this.state(),
    });
  }

  onEvent(listener: (event: AdventureLandGameEvent) => void): () => void {
    return this.#character.onGameEvent?.(listener) ?? (() => undefined);
  }

  state(): ScriptAdventureApiDynamicState {
    const state = this.#character.state();
    const entities = Object.fromEntries(
      (state.entities ?? []).map((entity) => [
        entity.id,
        scriptEntity(entity),
      ]),
    );
    return Object.freeze({
      character: scriptCharacter(state.character),
      Entities: Object.freeze(entities),
      attackCooldownMs: Math.max(0, this.#character.attackCooldownRemainingMs()),
      lootChests: Object.freeze(
        (state.lootChests ?? []).map((chest) => scriptChest(chest)),
      ),
    });
  }

  async call(
    method: ScriptAdventureApiMethod,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    switch (method) {
      case "move":
      case "xmove": {
        const x = finiteNumber(input.x);
        const y = finiteNumber(input.y);
        if (x === undefined || y === undefined) {
          throw new ScriptAdventureApiCallError(
            "SCRIPT_MOVE_TARGET_INVALID",
            "move/xmove require finite x and y coordinates.",
          );
        }
        const result = await this.#movement.runScript({
          mode: method,
          x,
          y,
        });
        return unwrapGateway(result);
      }
      case "attack": {
        const targetId = stringValue(input.targetId);
        if (!targetId) {
          throw new ScriptAdventureApiCallError(
            "SCRIPT_ATTACK_TARGET_REQUIRED",
            "attack() requires a visible monster target.",
          );
        }
        return unwrapGateway(await this.#attack.run({ targetId }, "script"));
      }
      case "loot": {
        const chestId = stringValue(input.chestId) ?? this.#nearestChestId();
        if (!chestId) {
          throw new ScriptAdventureApiCallError(
            "SCRIPT_LOOT_CHEST_UNAVAILABLE",
            "loot() found no currently visible chest.",
          );
        }
        return unwrapGateway(await this.#loot.runLoot({ chestId }, "script"));
      }
    }
  }

  #nearestChestId(): string | undefined {
    const state = this.#character.state();
    const character = state.character;
    if (!character) return undefined;
    return [...(state.lootChests ?? [])]
      .filter((chest) => !chest.map || !character.map || chest.map === character.map)
      .sort((left, right) =>
        chestDistance(character, left) - chestDistance(character, right) ||
        left.id.localeCompare(right.id)
      )[0]?.id;
  }
}

export class ScriptAdventureApiCallError extends Error {
  readonly code: string;
  readonly retryAfterMs?: number;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    retryAfterMs?: number,
    requestId?: string,
  ) {
    super(message);
    this.name = "ScriptAdventureApiCallError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.requestId = requestId;
  }
}

function unwrapGateway<TResult>(
  result: ActionGatewayResult<TResult>,
): Readonly<Record<string, unknown>> {
  if (result.outcome !== "success") {
    throw new ScriptAdventureApiCallError(
      result.error?.code ?? "SCRIPT_ACTION_FAILED",
      result.error?.message ?? "Adventure Land script action failed.",
      result.retryAfterMs,
      result.requestId,
    );
  }
  const value = result.result;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.freeze({
      requestId: result.requestId,
      ...(structuredClone(value) as Record<string, unknown>),
    });
  }
  return Object.freeze({
    requestId: result.requestId,
    value: structuredClone(value),
  });
}

function scriptCharacter(
  character: AdventureLandConnectedCharacter | undefined,
): Readonly<Record<string, unknown>> {
  if (!character) return Object.freeze({});
  return Object.freeze({
    id: character.id,
    name: character.name,
    type: "character",
    ctype: character.type,
    level: character.level,
    xp: character.xp,
    max_xp: character.maxXp,
    map: character.map,
    x: character.x,
    y: character.y,
    hp: character.hp,
    max_hp: character.maxHp,
    mp: character.mp,
    max_mp: character.maxMp,
    angle: character.angle,
    direction: character.direction,
    target: character.target,
    rip: character.dead,
    items: structuredClone(character.inventory ?? []),
    slots: structuredClone(character.equipment ?? {}),
    gold: character.gold,
    s: structuredClone(character.conditions ?? {}),
    range: character.range,
  });
}

function scriptEntity(
  entity: AdventureLandVisibleEntity,
): Readonly<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    id: entity.id,
    name: entity.name,
    type: entity.kind === "monster" ? "monster" : "character",
    map: entity.map,
    x: entity.x,
    y: entity.y,
    moving: entity.moving,
    going_x: entity.goingX,
    going_y: entity.goingY,
    move_num: entity.moveNum,
    hp: entity.hp,
    max_hp: entity.maxHp,
    level: entity.level,
    target: entity.target,
    party: entity.party,
    rip: typeof entity.hp === "number" ? entity.hp <= 0 : false,
  };
  if (entity.kind === "monster") base.mtype = entity.type;
  else base.ctype = entity.type;
  return Object.freeze(base);
}

function scriptChest(
  chest: AdventureLandLootChestState,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: chest.id,
    map: chest.map,
    x: chest.x,
    y: chest.y,
    items: chest.items,
    chest: chest.chest,
  });
}

function chestDistance(
  character: AdventureLandConnectedCharacter,
  chest: AdventureLandLootChestState,
): number {
  if (
    typeof character.x !== "number" ||
    typeof character.y !== "number" ||
    typeof chest.x !== "number" ||
    typeof chest.y !== "number"
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.hypot(chest.x - character.x, chest.y - character.y);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
