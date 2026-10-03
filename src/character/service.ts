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
  type AdventureLandCharacterTransport,
  type AdventureLandConnectedCharacter,
} from "./transport.ts";
import type {
  AdventureLandPartyState,
  AdventureLandVisibleEntity,
} from "./world-state.ts";

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
      connection.onState((liveState) => {
        if (this.#connection !== connection) return;
        const previous = this.#state.character;
        const previousEntities = this.#state.entities;
        const previousParty = this.#state.party;
        this.#setState({
          ...this.#state,
          status: "connected",
          character: liveState.character,
          entities: liveState.entities,
          party: liveState.party,
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
            partySignature(previousParty) !== partySignature(liveState.party)
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

  sendDirectMovement(
    input: AdventureLandDirectMovementInput,
  ): AdventureLandDirectMovementReceipt {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "connected") {
      throw new AdventureLandCharacterTransportError(
        "Connect a headless character before sending movement.",
        "movement_not_connected",
      );
    }
    return connection.sendMove(input);
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

function disconnectedState(): AdventureLandCharacterConnectionState {
  return {
    status: "disconnected",
    message: "No headless Adventure Land character is connected.",
  };
}
