import type { Logger } from "../logging/logger.ts";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { AdventureLandAccountSession } from "../account/source.ts";
import {
  AdventureLandCharacterTransportError,
  type AdventureLandCharacterConnection,
  type AdventureLandCharacterLiveState,
  type AdventureLandDirectMovementInput,
  type AdventureLandDirectMovementReceipt,
  type AdventureLandAttackInput,
  type AdventureLandAttackReceipt,
  type AdventureLandSkillInput,
  type AdventureLandSkillReceipt,
  type AdventureLandLootInput,
  type AdventureLandLootReceipt,
  type AdventureLandLootChestState,
  type AdventureLandConsumableInput,
  type AdventureLandConsumableReceipt,
  type AdventureLandRespawnInput,
  type AdventureLandRespawnReceipt,
  type AdventureLandCharacterTransport,
  type AdventureLandConnectedCharacter,
} from "./transport.ts";
import type {
  AdventureLandPartyState,
  AdventureLandVisibleEntity,
} from "./world-state.ts";
import type { AdventureLandGameEvent } from "./game-events.ts";

export type AdventureLandCharacterConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export interface AdventureLandCharacterConnectionState {
  readonly status: AdventureLandCharacterConnectionStatus;
  readonly character?: AdventureLandConnectedCharacter;
  readonly entities?: readonly AdventureLandVisibleEntity[];
  readonly party?: AdventureLandPartyState;
  readonly lootChests?: readonly AdventureLandLootChestState[];
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly serverRegion?: string;
  readonly serverName?: string;
  readonly connectedAt?: string;
  readonly pingMs?: number;
  readonly lastLiveUpdateAt?: string;
  readonly message: string;
  readonly errorCode?: string;
}

export interface AdventureLandCharacterServiceOptions {
  readonly logger: Logger;
  readonly transport: Pick<AdventureLandCharacterTransport, "connect">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly session: () => AdventureLandAccountSession | undefined;
  readonly now?: () => Date;
}

export class AdventureLandCharacterService {
  readonly #logger: Logger;
  readonly #transport: Pick<AdventureLandCharacterTransport, "connect">;
  readonly #selection: Pick<AdventureLandSelectionService, "state">;
  readonly #session: () => AdventureLandAccountSession | undefined;
  readonly #now: () => Date;
  #state: AdventureLandCharacterConnectionState = disconnectedState();
  #connection?: AdventureLandCharacterConnection;
  #connecting?: Promise<AdventureLandCharacterConnectionState>;
  #connectAbort?: AbortController;
  readonly #gameEventListeners = new Set<(event: AdventureLandGameEvent) => void>();

  constructor(options: AdventureLandCharacterServiceOptions) {
    this.#logger = options.logger;
    this.#transport = options.transport;
    this.#selection = options.selection;
    this.#session = options.session;
    this.#now = options.now ?? (() => new Date());
  }

  state(): AdventureLandCharacterConnectionState {
    return structuredClone(this.#state);
  }

  start(characterId: string): Promise<AdventureLandCharacterConnectionState> {
    if (this.#connection || this.#connecting) {
      throw new Error("A character connection is already active or being started.");
    }

    const id = characterId.trim();
    if (!id) throw new Error("Character selection is required.");

    const session = this.#session();
    if (!session) throw new Error("Connect an Adventure Land account first.");

    const selection = this.#selection.state();
    if (selection.status !== "ready") {
      throw new Error("Characters and servers must be loaded before starting a character.");
    }
    if (!selection.selectedServerKey) {
      throw new Error("Select an Adventure Land server before starting a character.");
    }

    const character = selection.characters.find((candidate) => candidate.id === id);
    if (!character) throw new Error("The selected Adventure Land character is not available.");
    const server = selection.servers.find(
      (candidate) => candidate.key === selection.selectedServerKey,
    );
    if (!server) throw new Error("The selected Adventure Land server is not available.");

    const controller = new AbortController();
    this.#connectAbort = controller;
    this.#setState({
      status: "connecting",
      characterId: character.id,
      characterName: character.name,
      serverKey: server.key,
      serverRegion: server.region,
      serverName: server.name,
      message: "Connecting " + character.name + " headlessly to " +
        server.region + " " + server.name + "…",
    });
    this.#logger.info("Adventure Land headless character connection started.", {
      characterId: character.id,
      characterName: character.name,
      serverKey: server.key,
      region: server.region,
      name: server.name,
      automation: false,
    });

    this.#connecting = this.#transport.connect({
      session,
      character,
      server,
    }, controller.signal).then((connection) => {
      this.#connection = connection;
      this.#connectAbort = undefined;
      connection.onGameEvent?.((event) => {
        if (this.#connection !== connection) return;
        for (const listener of this.#gameEventListeners) listener(structuredClone(event));
      });
      connection.onState((liveState) => {
        if (this.#connection !== connection) return;
        const previous = this.#state.character;
        const previousEntities = this.#state.entities;
        const previousParty = this.#state.party;
        const previousLootChests = this.#state.lootChests;
        this.#setState({
          ...this.#state,
          status: "connected",
          character: liveState.character,
          entities: liveState.entities,
          party: liveState.party,
          lootChests: liveState.lootChests,
          characterId: liveState.character.id,
          characterName: liveState.character.name,
          pingMs: liveState.pingMs,
          lastLiveUpdateAt: liveState.updatedAt,
          message: liveState.character.name +
            " is connected headlessly. Live state is updating; no automation is running.",
        });
        if (
          previous &&
          (
            previous.level !== liveState.character.level ||
            previous.map !== liveState.character.map ||
            previous.target !== liveState.character.target ||
            previous.dead !== liveState.character.dead ||
            previous.gold !== liveState.character.gold ||
            inventorySignature(previous.inventory) !==
              inventorySignature(liveState.character.inventory) ||
            equipmentSignature(previous.equipment) !==
              equipmentSignature(liveState.character.equipment) ||
            conditionSignature(previous.conditions) !==
              conditionSignature(liveState.character.conditions) ||
            entitySignature(previousEntities) !== entitySignature(liveState.entities) ||
            partySignature(previousParty) !== partySignature(liveState.party) ||
            lootChestSignature(previousLootChests) !==
              lootChestSignature(liveState.lootChests)
          )
        ) {
          this.#logger.info("Adventure Land character live state changed.", liveStateContext(liveState));
        }
      });

      connection.onUnexpectedClose((reason) => {
        if (this.#connection !== connection) return;
        this.#connection = undefined;
        this.#setState({
          status: "error",
          character: connection.character,
          characterId: connection.character.id,
          characterName: connection.character.name,
          serverKey: server.key,
          serverRegion: server.region,
          serverName: server.name,
          message: reason
            ? "Adventure Land closed the character connection (" + reason + ")."
            : "Adventure Land character connection closed unexpectedly.",
          errorCode: "socket_closed",
        });
        this.#logger.warn("Adventure Land headless character connection closed unexpectedly.", {
          characterId: connection.character.id,
          characterName: connection.character.name,
          serverKey: server.key,
          reason,
          automation: false,
        });
      });

      const connectedAt = this.#now().toISOString();
      const initialLiveState = connection.snapshot();
      this.#setState({
        status: "connected",
        character: initialLiveState.character,
        entities: initialLiveState.entities,
        party: initialLiveState.party,
        lootChests: initialLiveState.lootChests,
        characterId: initialLiveState.character.id,
        characterName: initialLiveState.character.name,
        serverKey: server.key,
        serverRegion: server.region,
        serverName: server.name,
        connectedAt,
        pingMs: initialLiveState.pingMs,
        lastLiveUpdateAt: initialLiveState.updatedAt,
        message: initialLiveState.character.name +
          " is connected headlessly. Live state is updating; no automation is running.",
      });
      this.#logger.info("Adventure Land character connected headlessly.", {
        characterId: initialLiveState.character.id,
        characterName: initialLiveState.character.name,
        characterType: initialLiveState.character.type,
        serverKey: server.key,
        region: server.region,
        name: server.name,
        connectedAt,
        automation: false,
        ...liveStateContext(initialLiveState),
      });
      return this.state();
    }).catch((error) => {
      this.#connectAbort = undefined;
      const transportError = error instanceof AdventureLandCharacterTransportError
        ? error
        : new AdventureLandCharacterTransportError(
            "Adventure Land headless character connection failed.",
            "unknown_error",
          );

      if (transportError.code === "aborted" && this.#state.status === "disconnecting") {
        return this.state();
      }

      this.#setState({
        status: "error",
        characterId: character.id,
        characterName: character.name,
        serverKey: server.key,
        serverRegion: server.region,
        serverName: server.name,
        message: transportError.message,
        errorCode: transportError.code,
      });
      this.#logger.error(
        "Adventure Land headless character connection failed.",
        transportError,
        {
          characterId: character.id,
          characterName: character.name,
          serverKey: server.key,
          automation: false,
        },
      );
      return this.state();
    }).finally(() => {
      this.#connecting = undefined;
    });

    return this.#connecting;
  }

  sendSkill(input: AdventureLandSkillInput): Promise<AdventureLandSkillReceipt> {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Connect a headless character before using a skill.",
        "skill_not_connected",
      ));
    }
    return connection.sendSkill(input);
  }

  skillCooldownRemainingMs(name: string): number {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") return 0;
    return connection.skillCooldownRemainingMs(name);
  }

  sendLoot(input: AdventureLandLootInput): Promise<AdventureLandLootReceipt> {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Connect a headless character before looting.",
        "loot_not_connected",
      ));
    }
    return connection.sendLoot(input);
  }

  sendConsumable(
    input: AdventureLandConsumableInput,
  ): Promise<AdventureLandConsumableReceipt> {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Connect a headless character before using a consumable.",
        "consumable_not_connected",
      ));
    }
    return connection.sendConsumable(input);
  }

  sendRespawn(
    input: AdventureLandRespawnInput = {},
  ): Promise<AdventureLandRespawnReceipt> {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Connect a headless character before respawning.",
        "respawn_not_connected",
      ));
    }
    return connection.sendRespawn(input);
  }

  sendAttack(input: AdventureLandAttackInput): Promise<AdventureLandAttackReceipt> {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Connect a headless character before attacking.",
        "attack_not_connected",
      ));
    }
    return connection.sendAttack(input);
  }

  attackCooldownRemainingMs(): number {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") return 0;
    return connection.attackCooldownRemainingMs();
  }

  onGameEvent(listener: (event: AdventureLandGameEvent) => void): () => void {
    this.#gameEventListeners.add(listener);
    return () => this.#gameEventListeners.delete(listener);
  }

  requestStateRefresh(): void {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      throw new AdventureLandCharacterTransportError(
        "Connect a headless character before requesting a fresh live-state event.",
        "state_refresh_not_connected",
      );
    }
    connection.requestStateRefresh();
  }

  sendDirectMovement(
    input: AdventureLandDirectMovementInput,
  ): Promise<AdventureLandDirectMovementReceipt> {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Connect a headless character before sending movement.",
        "movement_not_connected",
      ));
    }

    const characterName = connection.character.name;
    const fromX = connection.character.x;
    const fromY = connection.character.y;
    if (
      typeof fromX !== "number" ||
      !Number.isFinite(fromX) ||
      typeof fromY !== "number" ||
      !Number.isFinite(fromY)
    ) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land movement state is incomplete.",
        "movement_state_unavailable",
      ));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let receipt: AdventureLandDirectMovementReceipt | undefined;
      let unsubscribe = () => {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refreshTimers: ReturnType<typeof setTimeout>[] = [];

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        for (const refreshTimer of refreshTimers) clearTimeout(refreshTimer);
        unsubscribe();
        input.signal?.removeEventListener("abort", onAbort);
      };
      const fail = (error: AdventureLandCharacterTransportError) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const finish = (x: number, y: number) => {
        if (settled || !receipt) return;
        settled = true;
        cleanup();
        resolve(Object.freeze({
          ...receipt,
          confirmedX: x,
          confirmedY: y,
        }));
      };
      const onAbort = () => fail(new AdventureLandCharacterTransportError(
        "Adventure Land movement was cancelled before server confirmation.",
        "movement_aborted",
      ));

      unsubscribe = connection.onState((state) => {
        const point = confirmedMovementPoint(
          state,
          characterName,
          fromX,
          fromY,
          input.x,
          input.y,
        );
        if (point) finish(point.x, point.y);
      });
      input.signal?.addEventListener("abort", onAbort, { once: true });
      if (input.signal?.aborted) {
        onAbort();
        return;
      }

      timer = setTimeout(() => {
        fail(new AdventureLandCharacterTransportError(
          "Adventure Land did not confirm the requested movement.",
          "movement_not_confirmed",
        ));
      }, 1_300);

      const refresh = () => {
        if (settled) return;
        try {
          connection.requestStateRefresh();
        } catch (error) {
          fail(error instanceof AdventureLandCharacterTransportError
            ? error
            : new AdventureLandCharacterTransportError(
              error instanceof Error ? error.message : String(error),
              "movement_state_refresh_failed",
            ));
        }
      };

      try {
        receipt = connection.sendMove(input);
        refresh();
        for (const delayMs of [250, 650, 1_000]) {
          refreshTimers.push(setTimeout(refresh, delayMs));
        }
      } catch (error) {
        fail(error instanceof AdventureLandCharacterTransportError
          ? error
          : new AdventureLandCharacterTransportError(
            error instanceof Error ? error.message : String(error),
            "movement_transport_failed",
          ));
      }
    });
  }

  async stop(reason = "user"): Promise<AdventureLandCharacterConnectionState> {
    const hadConnection = Boolean(this.#connection || this.#connecting);
    const characterId = this.#state.characterId;
    const characterName = this.#state.characterName;
    const serverKey = this.#state.serverKey;

    if (!hadConnection) {
      this.#setState(disconnectedState());
      return this.state();
    }

    this.#setState({
      ...this.#state,
      status: "disconnecting",
      message: "Disconnecting the headless Adventure Land character…",
      errorCode: undefined,
    });

    if (this.#connectAbort) {
      this.#connectAbort.abort();
      try {
        await this.#connecting;
      } catch {}
    }

    const connection = this.#connection;
    const finalLiveState = connection?.snapshot();
    this.#connection = undefined;
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        this.#logger.warn("Adventure Land character transport did not close cleanly.", {
          characterId,
          characterName,
          serverKey,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.#setState(disconnectedState());
    this.#logger.info("Adventure Land headless character disconnected.", {
      characterId,
      characterName,
      serverKey,
      reason,
      controlled: true,
      automation: false,
      ...(finalLiveState ? liveStateContext(finalLiveState) : {}),
    });
    return this.state();
  }

  #setState(state: AdventureLandCharacterConnectionState): void {
    this.#state = Object.freeze({
      ...state,
      character: state.character ? Object.freeze(structuredClone(state.character)) : undefined,
      entities: state.entities ? Object.freeze(structuredClone(state.entities)) : undefined,
      party: state.party ? Object.freeze(structuredClone(state.party)) : undefined,
      lootChests: state.lootChests
        ? Object.freeze(structuredClone(state.lootChests))
        : undefined,
    });
  }
}

function liveStateContext(state: AdventureLandCharacterLiveState): Record<string, unknown> {
  return {
    level: state.character.level,
    xp: state.character.xp,
    maxXp: state.character.maxXp,
    hp: state.character.hp,
    maxHp: state.character.maxHp,
    mp: state.character.mp,
    maxMp: state.character.maxMp,
    map: state.character.map,
    x: state.character.x,
    y: state.character.y,
    movementSequence: state.character.movementSequence,
    angle: state.character.angle,
    direction: state.character.direction,
    directionLabel: state.character.directionLabel,
    target: state.character.target,
    dead: state.character.dead,
    gold: state.character.gold,
    inventorySlots: state.character.inventory?.length,
    inventoryUsed: state.character.inventory?.filter(Boolean).length,
    equipmentUsed: state.character.equipment
      ? Object.values(state.character.equipment).filter(Boolean).length
      : undefined,
    conditions: state.character.conditions
      ? Object.keys(state.character.conditions).sort()
      : undefined,
    visibleEntities: state.entities.length,
    visiblePlayers: state.entities.filter((entity) => entity.kind === "player").length,
    visibleMonsters: state.entities.filter((entity) => entity.kind === "monster").length,
    visibleMonsterTypes: [...new Set(
      state.entities
        .filter((entity) => entity.kind === "monster")
        .map((entity) => entity.type),
    )].sort(),
    visibleLootChests: state.lootChests.length,
    visibleLootChestIds: state.lootChests.map((chest) => chest.id).sort(),
    partyMembers: [...state.party.members],
    partyLeader: state.party.leader,
    pingMs: state.pingMs,
    liveUpdatedAt: state.updatedAt,
  };
}

function entitySignature(
  entities: readonly AdventureLandVisibleEntity[] | undefined,
): string {
  if (!entities) return "";
  return JSON.stringify(
    entities.map((entity) => [entity.id, entity.kind, entity.type]).sort(),
  );
}

function partySignature(party: AdventureLandPartyState | undefined): string {
  return party
    ? JSON.stringify([party.leader ?? "", [...party.members]])
    : "";
}

function lootChestSignature(
  lootChests: readonly AdventureLandLootChestState[] | undefined,
): string {
  if (!lootChests) return "";
  return JSON.stringify(
    lootChests
      .map((chest) => [
        chest.id,
        chest.map ?? "",
        chest.x ?? null,
        chest.y ?? null,
        chest.items ?? null,
      ])
      .sort(),
  );
}

function inventorySignature(
  inventory: AdventureLandConnectedCharacter["inventory"],
): string {
  if (!inventory) return "";
  return JSON.stringify(inventory.map((item) => itemSummary(item)));
}

function equipmentSignature(
  equipment: AdventureLandConnectedCharacter["equipment"],
): string {
  if (!equipment) return "";
  return JSON.stringify(
    Object.entries(equipment)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slot, item]) => [slot, itemSummary(item)]),
  );
}

function conditionSignature(
  conditions: AdventureLandConnectedCharacter["conditions"],
): string {
  return conditions ? JSON.stringify(Object.keys(conditions).sort()) : "";
}

function itemSummary(item: Readonly<Record<string, unknown>> | null): unknown {
  if (!item) return null;
  return [
    typeof item.name === "string" ? item.name : "",
    typeof item.level === "number" ? item.level : 0,
    typeof item.q === "number" ? item.q : 1,
  ];
}

function confirmedMovementPoint(
  state: AdventureLandCharacterLiveState,
  characterName: string,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): { readonly x: number; readonly y: number } | undefined {
  const candidates: Array<{ readonly x?: number; readonly y?: number }> = [
    state.character,
    ...state.entities.filter((entity) =>
      entity.kind === "player" &&
      (entity.id === characterName || entity.name === characterName)
    ),
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate.x !== "number" ||
      !Number.isFinite(candidate.x) ||
      typeof candidate.y !== "number" ||
      !Number.isFinite(candidate.y)
    ) continue;
    if (movementProgressedToward(
      fromX,
      fromY,
      targetX,
      targetY,
      candidate.x,
      candidate.y,
    )) {
      return { x: candidate.x, y: candidate.y };
    }
  }
  return undefined;
}

function movementProgressedToward(
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  currentX: number,
  currentY: number,
): boolean {
  const epsilon = 0.25;
  const moved = Math.hypot(currentX - fromX, currentY - fromY);
  if (moved <= epsilon) return false;

  const initialDistance = Math.hypot(targetX - fromX, targetY - fromY);
  const currentDistance = Math.hypot(targetX - currentX, targetY - currentY);
  return currentDistance + epsilon < initialDistance;
}

function disconnectedState(): AdventureLandCharacterConnectionState {
  return {
    status: "disconnected",
    message: "No headless Adventure Land character is connected.",
  };
}
