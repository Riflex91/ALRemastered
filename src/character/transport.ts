import type { AdventureLandAccountSession } from "../account/source.ts";
import type {
  AdventureLandCharacterSummary,
  AdventureLandServerSummary,
} from "../account/selection-source.ts";
import {
  createAdventureLandGameEvent,
  type AdventureLandGameEvent,
  type AdventureLandGameEventName,
} from "./game-events.ts";
import {
  applyEntityPacket,
  applyPartyPacket,
  clearVisibleEntities,
  emptyWorldState,
  removeVisibleEntity,
  worldStateFromStart,
  type AdventureLandPartyState,
  type AdventureLandVisibleEntity,
  type AdventureLandWorldState,
} from "./world-state.ts";

export interface AdventureLandCharacterTransportInput {
  readonly session: AdventureLandAccountSession;
  readonly character: AdventureLandCharacterSummary;
  readonly server: AdventureLandServerSummary;
}

export type AdventureLandItemState = Readonly<Record<string, unknown>>;
export type AdventureLandEquipmentState = Readonly<
  Record<string, AdventureLandItemState | null>
>;
export type AdventureLandConditionState = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

export interface AdventureLandConnectedCharacter {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly level: number;
  readonly xp?: number;
  readonly maxXp?: number;
  readonly map?: string;
  readonly x?: number;
  readonly y?: number;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly mp?: number;
  readonly maxMp?: number;
  readonly angle?: number;
  readonly direction?: number;
  readonly directionLabel?: string;
  readonly target?: string;
  readonly dead: boolean;
  readonly inventory?: readonly (AdventureLandItemState | null)[];
  readonly equipment?: AdventureLandEquipmentState;
  readonly gold?: number;
  readonly conditions?: AdventureLandConditionState;
  readonly movementSequence?: number;
  readonly range?: number;
}

export interface AdventureLandDirectMovementInput {
  readonly x: number;
  readonly y: number;
  readonly signal?: AbortSignal;
}

export interface AdventureLandDirectMovementReceipt {
  readonly fromX: number;
  readonly fromY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly confirmedX?: number;
  readonly confirmedY?: number;
}

export interface AdventureLandAttackInput {
  readonly targetId: string;
  readonly signal?: AbortSignal;
}

export interface AdventureLandAttackReceipt {
  readonly targetId: string;
  readonly success: boolean;
  readonly reason?: string;
  readonly cooldownMs?: number;
}

export interface AdventureLandSkillInput {
  readonly name: string;
  readonly targetId?: string;
  readonly cooldownKey?: string;
  readonly signal?: AbortSignal;
}

export interface AdventureLandSkillReceipt {
  readonly name: string;
  readonly targetId?: string;
  readonly success: boolean;
  readonly reason?: string;
  readonly cooldownMs?: number;
}

export interface AdventureLandLootChestState {
  readonly id: string;
  readonly map?: string;
  readonly x?: number;
  readonly y?: number;
  readonly items?: number;
  readonly chest?: string;
}

export interface AdventureLandLootInput {
  readonly chestId: string;
  readonly signal?: AbortSignal;
}

export interface AdventureLandLootReceipt {
  readonly chestId: string;
  readonly success: boolean;
  readonly reason?: string;
  readonly opener?: string;
}

export type AdventureLandConsumableKind = "hp" | "mp";

export interface AdventureLandConsumableInput {
  readonly inventoryIndex: number;
  readonly itemName: string;
  readonly kind: AdventureLandConsumableKind;
  readonly signal?: AbortSignal;
}

export interface AdventureLandConsumableReceipt {
  readonly inventoryIndex: number;
  readonly itemName: string;
  readonly kind: AdventureLandConsumableKind;
  readonly success: boolean;
  readonly reason?: string;
  readonly cooldownMs?: number;
}

export interface AdventureLandRespawnInput {
  readonly signal?: AbortSignal;
}

export interface AdventureLandRespawnReceipt {
  readonly success: boolean;
  readonly reason?: string;
  readonly retryAfterMs?: number;
}

export interface AdventureLandCharacterLiveState {
  readonly character: AdventureLandConnectedCharacter;
  readonly entities: readonly AdventureLandVisibleEntity[];
  readonly party: AdventureLandPartyState;
  readonly lootChests: readonly AdventureLandLootChestState[];
  readonly pingMs?: number;
  readonly updatedAt: string;
}

export interface AdventureLandCharacterConnection {
  readonly character: AdventureLandConnectedCharacter;
  readonly pingMs?: number;
  snapshot(): AdventureLandCharacterLiveState;
  onState(listener: (state: AdventureLandCharacterLiveState) => void): () => void;
  onGameEvent(listener: (event: AdventureLandGameEvent) => void): () => void;
  onUnexpectedClose(listener: (reason?: string) => void): void;
  requestStateRefresh(): void;
  sendMove(input: AdventureLandDirectMovementInput): AdventureLandDirectMovementReceipt;
  sendAttack(input: AdventureLandAttackInput): Promise<AdventureLandAttackReceipt>;
  attackCooldownRemainingMs(): number;
  sendSkill(input: AdventureLandSkillInput): Promise<AdventureLandSkillReceipt>;
  skillCooldownRemainingMs(name: string): number;
  sendLoot(input: AdventureLandLootInput): Promise<AdventureLandLootReceipt>;
  sendConsumable(
    input: AdventureLandConsumableInput,
  ): Promise<AdventureLandConsumableReceipt>;
  sendRespawn(input?: AdventureLandRespawnInput): Promise<AdventureLandRespawnReceipt>;
  close(): Promise<void>;
}

export class AdventureLandCharacterTransportError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AdventureLandCharacterTransportError";
    this.code = code;
  }
}

export type AdventureLandWebSocketFactory = (url: string) => WebSocket;

export class AdventureLandCharacterTransport {
  readonly #webSocketFactory: AdventureLandWebSocketFactory;
  readonly #timeoutMs: number;

  constructor(
    webSocketFactory: AdventureLandWebSocketFactory = (url) => new WebSocket(url),
    timeoutMs = 20_000,
  ) {
    this.#webSocketFactory = webSocketFactory;
    this.#timeoutMs = timeoutMs;
  }

  connect(
    input: AdventureLandCharacterTransportInput,
    signal?: AbortSignal,
  ): Promise<AdventureLandCharacterConnection> {
    const url = characterSocketUrl(input.server);
    let socket: WebSocket;
    try {
      socket = this.#webSocketFactory(url);
    } catch {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Could not create the Adventure Land character transport.",
        "socket_create_failed",
      ));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let welcomed = false;
      let loadedSent = false;
      let authSent = false;
      let disconnectReason: string | undefined;
      let liveConnection: LiveAdventureLandCharacterConnection | undefined;

      const timeout = setTimeout(() => {
        fail(new AdventureLandCharacterTransportError(
          "Adventure Land character connection timed out.",
          "connect_timeout",
        ));
      }, this.#timeoutMs);

      const finish = (connection: AdventureLandCharacterConnection) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        resolve(connection);
      };

      const fail = (error: AdventureLandCharacterTransportError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        try {
          if (socket.readyState === 0 || socket.readyState === 1) socket.close();
        } catch {}
        reject(error);
      };

      const send = (packet: string) => {
        if (socket.readyState !== 1) {
          fail(new AdventureLandCharacterTransportError(
            "Adventure Land character transport closed before setup completed.",
            "socket_not_open",
          ));
          return false;
        }
        socket.send(packet);
        return true;
      };

      const sendEvent = (name: string, payload: unknown) =>
        send("42" + JSON.stringify([name, payload]));

      const onAbort = () => {
        fail(new AdventureLandCharacterTransportError(
          "Adventure Land character connection was cancelled.",
          "aborted",
        ));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) return onAbort();

      socket.addEventListener("message", (event) => {
        void messageText(event.data).then((text) => {
          if (!text) return;
          for (const packet of text.split("\x1e")) {
            if (!packet) continue;

            if (packet[0] === "0") {
              send("40");
              continue;
            }
            if (packet[0] === "2") {
              send("3" + packet.slice(1));
              continue;
            }
            if (packet.startsWith("44")) {
              fail(new AdventureLandCharacterTransportError(
                "Adventure Land rejected the Socket.IO connection.",
                "socketio_error",
              ));
              continue;
            }
            if (!packet.startsWith("42")) continue;

            const eventPayload = parseSocketEvent(packet);
            if (!eventPayload) continue;
            const [name, data] = eventPayload;

            if (name === "disconnect_reason" && typeof data === "string") {
              disconnectReason = data;
              continue;
            }

            if (liveConnection) {
              if (name === "player" && isRecord(data)) {
                liveConnection.applyPlayer(data);
                continue;
              }
              if (name === "new_map" && isRecord(data)) {
                liveConnection.applyNewMap(data);
                continue;
              }
              if (name === "ping_ack" && isRecord(data)) {
                liveConnection.applyPingAck(data);
                continue;
              }
              if (name === "entities" && isRecord(data)) {
                liveConnection.applyEntities(data);
                continue;
              }
              if ((name === "disappear" || name === "death") && isRecord(data)) {
                liveConnection.applyDisappear(data, name);
                continue;
              }
              if (name === "party_update" && isRecord(data)) {
                liveConnection.applyPartyUpdate(data);
                continue;
              }
              if (name === "skill_timeout" && isRecord(data)) {
                liveConnection.applySkillTimeout(data);
                continue;
              }
              if (name === "drop" && isRecord(data)) {
                liveConnection.applyDrop(data);
                continue;
              }
              if (name === "chest_opened" && isRecord(data)) {
                liveConnection.applyChestOpened(data);
                continue;
              }
              if (name === "game_response" && isRecord(data)) {
                liveConnection.applyGameResponse(data);
                continue;
              }
            }

            if (name === "welcome") {
              welcomed = true;
              if (!loadedSent) {
                loadedSent = sendEvent("loaded", {
                  success: 1,
                  width: 800,
                  height: 600,
                  scale: 2,
                });
              }
              continue;
            }

            if (
              name === "entities" &&
              welcomed &&
              loadedSent &&
              !authSent &&
              isRecord(data) &&
              data.type === "all"
            ) {
              authSent = sendEvent("auth", {
                user: input.session.userId,
                character: input.character.id,
                code_slot: input.character.id,
                auth: input.session.auth,
                width: 800,
                height: 600,
                scale: 2,
                passphrase: "",
                no_html: true,
                no_graphics: true,
              });
              continue;
            }

            if (name === "start" && isRecord(data)) {
              liveConnection = new LiveAdventureLandCharacterConnection(
                socket,
                parseConnectedCharacter(data, input.character),
                () => disconnectReason,
                worldStateFromStart(data),
              );
              finish(liveConnection);
            }
          }
        }).catch(() => {
          fail(new AdventureLandCharacterTransportError(
            "Adventure Land sent an unreadable character transport packet.",
            "invalid_packet",
          ));
        });
      });

      socket.addEventListener("error", () => {
        if (!settled) {
          fail(new AdventureLandCharacterTransportError(
            "Adventure Land character transport failed.",
            "socket_error",
          ));
        }
      });

      socket.addEventListener("close", () => {
        if (!settled) {
          fail(new AdventureLandCharacterTransportError(
            disconnectReason
              ? "Adventure Land closed the character connection (" + disconnectReason + ")."
              : "Adventure Land closed the character connection before it was ready.",
            "socket_closed",
          ));
        }
      });
    });
  }
}

class LiveAdventureLandCharacterConnection implements AdventureLandCharacterConnection {
  readonly #socket: WebSocket;
  readonly #disconnectReason: () => string | undefined;
  readonly #listeners = new Set<(reason?: string) => void>();
  readonly #stateListeners = new Set<(state: AdventureLandCharacterLiveState) => void>();
  readonly #gameEventListeners = new Set<(event: AdventureLandGameEvent) => void>();
  readonly #pingSent = new Map<string, number>();
  readonly #pingTimer: ReturnType<typeof setInterval>;
  #character: AdventureLandConnectedCharacter;
  #world: AdventureLandWorldState = emptyWorldState();
  readonly #lootChests = new Map<string, AdventureLandLootChestState>();
  #pingMs?: number;
  #updatedAt: string;
  #attackCooldownUntilMs = 0;
  readonly #skillCooldownUntilMs = new Map<string, number>();
  #pendingAttack?: {
    readonly targetId: string;
    readonly resolve: (receipt: AdventureLandAttackReceipt) => void;
    readonly reject: (error: AdventureLandCharacterTransportError) => void;
    readonly signal?: AbortSignal;
    readonly onAbort?: () => void;
  };
  #pendingSkill?: {
    readonly name: string;
    readonly targetId?: string;
    readonly cooldownKey: string;
    readonly resolve: (receipt: AdventureLandSkillReceipt) => void;
    readonly reject: (error: AdventureLandCharacterTransportError) => void;
    readonly signal?: AbortSignal;
    readonly onAbort?: () => void;
  };
  #pendingLoot?: {
    readonly chestId: string;
    readonly resolve: (receipt: AdventureLandLootReceipt) => void;
    readonly reject: (error: AdventureLandCharacterTransportError) => void;
    readonly signal?: AbortSignal;
    readonly onAbort?: () => void;
  };
  #pendingConsumable?: {
    readonly inventoryIndex: number;
    readonly itemName: string;
    readonly kind: AdventureLandConsumableKind;
    readonly resolve: (receipt: AdventureLandConsumableReceipt) => void;
    readonly reject: (error: AdventureLandCharacterTransportError) => void;
    readonly signal?: AbortSignal;
    readonly onAbort?: () => void;
  };
  #pendingRespawn?: {
    readonly resolve: (receipt: AdventureLandRespawnReceipt) => void;
    readonly reject: (error: AdventureLandCharacterTransportError) => void;
    readonly signal?: AbortSignal;
    readonly onAbort?: () => void;
  };
  #intentional = false;
  #closed = false;
  #pingSequence = 0;

  constructor(
    socket: WebSocket,
    character: AdventureLandConnectedCharacter,
    disconnectReason: () => string | undefined,
    world: AdventureLandWorldState = emptyWorldState(),
  ) {
    this.#socket = socket;
    this.#character = character;
    this.#world = world;
    this.#updatedAt = new Date().toISOString();
    this.#disconnectReason = disconnectReason;

    socket.addEventListener("close", () => {
      this.#closed = true;
      clearInterval(this.#pingTimer);
      this.#pingSent.clear();
      this.#gameEventListeners.clear();
      this.#rejectPendingAttack(
        new AdventureLandCharacterTransportError(
          "Adventure Land character transport closed during attack.",
          "attack_transport_closed",
        ),
      );
      this.#rejectPendingSkill(
        new AdventureLandCharacterTransportError(
          "Adventure Land character transport closed during skill execution.",
          "skill_transport_closed",
        ),
      );
      this.#rejectPendingLoot(
        new AdventureLandCharacterTransportError(
          "Adventure Land character transport closed during loot.",
          "loot_transport_closed",
        ),
      );
      this.#rejectPendingConsumable(
        new AdventureLandCharacterTransportError(
          "Adventure Land character transport closed during consumable use.",
          "consumable_transport_closed",
        ),
      );
      this.#rejectPendingRespawn(
        new AdventureLandCharacterTransportError(
          "Adventure Land character transport closed during respawn.",
          "respawn_transport_closed",
        ),
      );
      if (this.#intentional) return;
      const reason = this.#disconnectReason();
      for (const listener of this.#listeners) listener(reason);
    });

    this.#sendPing();
    this.#pingTimer = setInterval(() => this.#sendPing(), 3_200);
  }

  get character(): AdventureLandConnectedCharacter {
    return this.#character;
  }

  get pingMs(): number | undefined {
    return this.#pingMs;
  }

  snapshot(): AdventureLandCharacterLiveState {
    return Object.freeze({
      character: Object.freeze(structuredClone(this.#character)),
      entities: Object.freeze(structuredClone(this.#world.entities)),
      party: Object.freeze(structuredClone(this.#world.party)),
      lootChests: Object.freeze(
        structuredClone(
          [...this.#lootChests.values()].sort((left, right) =>
            left.id.localeCompare(right.id)
          ),
        ),
      ),
      pingMs: this.#pingMs,
      updatedAt: this.#updatedAt,
    });
  }

  onState(listener: (state: AdventureLandCharacterLiveState) => void): () => void {
    this.#stateListeners.add(listener);
    return () => this.#stateListeners.delete(listener);
  }

  onGameEvent(listener: (event: AdventureLandGameEvent) => void): () => void {
    this.#gameEventListeners.add(listener);
    return () => this.#gameEventListeners.delete(listener);
  }

  onUnexpectedClose(listener: (reason?: string) => void): void {
    this.#listeners.add(listener);
  }

  requestStateRefresh(): void {
    if (this.#closed || this.#socket.readyState !== 1) {
      throw new AdventureLandCharacterTransportError(
        "Adventure Land character transport is not ready for a state refresh.",
        "state_refresh_transport_unavailable",
      );
    }
    this.#socket.send("42" + JSON.stringify(["send_updates"]));
  }

  applyPlayer(data: Record<string, unknown>): void {
    this.#character = mergeConnectedCharacter(this.#character, data);
    this.#touch();
    this.#emitGameEvent("player", data);
  }

  applyNewMap(data: Record<string, unknown>): void {
    const patch: Record<string, unknown> = {
      map: typeof data.name === "string" ? data.name : this.#character.map,
      x: data.x,
      y: data.y,
      direction: data.direction,
      m: data.m,
    };
    this.#character = mergeConnectedCharacter(this.#character, patch);
    this.#world = clearVisibleEntities(this.#world);
    this.#lootChests.clear();
    this.#touch();
    this.#emitGameEvent("new_map", data);
  }

  applyEntities(data: Record<string, unknown>): void {
    this.#world = applyEntityPacket(this.#world, data);
    const own = this.#world.entities.find((entity) =>
      entity.kind === "player" &&
      (entity.id === this.#character.name || entity.name === this.#character.name)
    );
    if (own) {
      const patch: Record<string, unknown> = {};
      if (own.name) patch.name = own.name;
      if (own.type && own.type !== "player") patch.ctype = own.type;
      if (own.map !== undefined) patch.map = own.map;
      if (own.moving !== true) {
        if (own.x !== undefined) patch.x = own.x;
        if (own.y !== undefined) patch.y = own.y;
      }
      if (own.hp !== undefined) patch.hp = own.hp;
      if (own.maxHp !== undefined) patch.max_hp = own.maxHp;
      if (own.level !== undefined) patch.level = own.level;
      if (own.target !== undefined) patch.target = own.target;
      if (Object.keys(patch).length) {
        this.#character = mergeConnectedCharacter(this.#character, patch);
      }
    }
    this.#touch();
    this.#emitGameEvent("entities", data);
  }

  applyDisappear(
    data: Record<string, unknown>,
    eventName: "disappear" | "death" = "disappear",
  ): void {
    const next = removeVisibleEntity(this.#world, data.id);
    if (next !== this.#world) {
      this.#world = next;
      this.#touch();
    }
    this.#emitGameEvent(eventName, data);
  }

  applyPartyUpdate(data: Record<string, unknown>): void {
    this.#world = applyPartyPacket(this.#world, data);
    this.#touch();
    this.#emitGameEvent("party_update", data);
  }

  applyPingAck(data: Record<string, unknown>): void {
    if (typeof data.id !== "string") return;
    const sentAt = this.#pingSent.get(data.id);
    if (sentAt === undefined) return;
    this.#pingSent.delete(data.id);
    this.#pingMs = Math.max(0, Date.now() - sentAt);
    this.#touch();
  }

  applySkillTimeout(data: Record<string, unknown>): void {
    if (typeof data.name !== "string") return;
    const ms = finiteNumber(data.ms);
    if (ms === undefined) return;
    const until = Date.now() + Math.max(0, ms);
    if (data.name === "attack") this.#attackCooldownUntilMs = until;
    this.#skillCooldownUntilMs.set(data.name, until);
    this.#emitGameEvent("skill_timeout", data);
  }

  applyDrop(data: Record<string, unknown>): void {
    if (typeof data.id !== "string" || !data.id) return;
    this.#lootChests.set(data.id, Object.freeze({
      id: data.id,
      map: typeof data.map === "string" ? data.map : this.#character.map,
      x: finiteNumber(data.x),
      y: finiteNumber(data.y),
      items: finiteNumber(data.items),
      chest: typeof data.chest === "string" ? data.chest : undefined,
    }));
    this.#touch();
    this.#emitGameEvent("drop", data);
  }

  applyChestOpened(data: Record<string, unknown>): void {
    const chestId = typeof data.id === "string" ? data.id : undefined;
    if (!chestId) return;
    this.#lootChests.delete(chestId);

    const pending = this.#pendingLoot;
    if (pending?.chestId === chestId) {
      this.#pendingLoot = undefined;
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      const opener = typeof data.opener === "string" ? data.opener : undefined;
      const ownOpen = opener === this.#character.name;
      pending.resolve(Object.freeze({
        chestId,
        success: ownOpen,
        reason: ownOpen
          ? undefined
          : data.gone === true
            ? "gone"
            : "opened_by_other",
        opener,
      }));
    }
    this.#touch();
    this.#emitGameEvent("chest_opened", data);
  }

  applyGameResponse(data: Record<string, unknown>): void {
    this.#emitGameEvent("game_response", data);
    if (data.place === "attack" && this.#pendingAttack) {
      const pending = this.#pendingAttack;
      this.#pendingAttack = undefined;
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      const failed = data.failed === true || data.success === false;
      const reason = typeof data.reason === "string"
        ? data.reason
        : failed && typeof data.response === "string"
          ? data.response
          : undefined;
      const responseCooldown = finiteNumber(data.ms);
      const cooldownMs = responseCooldown === undefined
        ? this.attackCooldownRemainingMs()
        : Math.max(0, responseCooldown);
      pending.resolve(Object.freeze({
        targetId: pending.targetId,
        success: !failed,
        reason,
        cooldownMs: cooldownMs > 0 ? cooldownMs : undefined,
      }));
      return;
    }

    if (data.place === "respawn" && this.#pendingRespawn) {
      const pending = this.#pendingRespawn;
      this.#pendingRespawn = undefined;
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      const failed = data.failed === true || data.success === false;
      const reason = typeof data.reason === "string"
        ? data.reason
        : failed && typeof data.response === "string"
          ? data.response
          : undefined;
      const retryAfterMs = finiteNumber(data.ms) ?? finiteNumber(data.time);
      pending.resolve(Object.freeze({
        success: !failed,
        reason,
        retryAfterMs: retryAfterMs === undefined ? undefined : Math.max(0, retryAfterMs),
      }));
      return;
    }

    if (data.place === "equip" && this.#pendingConsumable) {
      const pending = this.#pendingConsumable;
      this.#pendingConsumable = undefined;
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      const failed = data.failed === true || data.success === false;
      const reason = typeof data.reason === "string"
        ? data.reason
        : failed && typeof data.response === "string"
          ? data.response
          : undefined;
      const responseCooldown = finiteNumber(data.ms);
      const cooldownMs = responseCooldown === undefined
        ? this.skillCooldownRemainingMs(
          pending.kind === "hp" ? "use_hp" : "use_mp",
        )
        : Math.max(0, responseCooldown);
      const used = typeof data.used === "string" ? data.used : undefined;
      pending.resolve(Object.freeze({
        inventoryIndex: pending.inventoryIndex,
        itemName: pending.itemName,
        kind: pending.kind,
        success: !failed && (!used || used === pending.itemName),
        reason: !failed && used && used !== pending.itemName
          ? "unexpected_item"
          : reason,
        cooldownMs: cooldownMs > 0 ? cooldownMs : undefined,
      }));
      return;
    }

    if (
      this.#pendingSkill &&
      typeof data.place === "string" &&
      data.place === this.#pendingSkill.name
    ) {
      const pending = this.#pendingSkill;
      this.#pendingSkill = undefined;
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      const failed = data.failed === true || data.success === false;
      const reason = typeof data.reason === "string"
        ? data.reason
        : failed && typeof data.response === "string"
          ? data.response
          : undefined;
      const responseCooldown = finiteNumber(data.ms);
      const cooldownMs = responseCooldown === undefined
        ? this.skillCooldownRemainingMs(pending.cooldownKey)
        : Math.max(0, responseCooldown);
      pending.resolve(Object.freeze({
        name: pending.name,
        targetId: pending.targetId,
        success: !failed,
        reason,
        cooldownMs: cooldownMs > 0 ? cooldownMs : undefined,
      }));
    }
  }

  sendMove(
    input: AdventureLandDirectMovementInput,
  ): AdventureLandDirectMovementReceipt {
    if (input.signal?.aborted) {
      throw new AdventureLandCharacterTransportError(
        "Adventure Land movement was cancelled before it was sent.",
        "movement_aborted",
      );
    }
    if (this.#closed || this.#socket.readyState !== 1) {
      throw new AdventureLandCharacterTransportError(
        "Adventure Land character transport is not ready for movement.",
        "movement_transport_unavailable",
      );
    }

    const fromX = this.#character.x;
    const fromY = this.#character.y;
    const movementSequence = this.#character.movementSequence;
    if (
      typeof fromX !== "number" ||
      !Number.isFinite(fromX) ||
      typeof fromY !== "number" ||
      !Number.isFinite(fromY) ||
      typeof movementSequence !== "number" ||
      !Number.isFinite(movementSequence)
    ) {
      throw new AdventureLandCharacterTransportError(
        "Adventure Land movement state is incomplete.",
        "movement_state_unavailable",
      );
    }
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
      throw new AdventureLandCharacterTransportError(
        "Adventure Land movement target is invalid.",
        "movement_target_invalid",
      );
    }

    const receipt = Object.freeze({
      fromX,
      fromY,
      targetX: input.x,
      targetY: input.y,
    });
    this.#socket.send(
      "42" + JSON.stringify([
        "move",
        {
          x: receipt.fromX,
          y: receipt.fromY,
          going_x: receipt.targetX,
          going_y: receipt.targetY,
          m: movementSequence,
        },
      ]),
    );
    return receipt;
  }

  sendAttack(input: AdventureLandAttackInput): Promise<AdventureLandAttackReceipt> {
    if (input.signal?.aborted) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land attack was cancelled before it was sent.",
        "attack_aborted",
      ));
    }
    if (this.#closed || this.#socket.readyState !== 1) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land character transport is not ready for attack.",
        "attack_transport_unavailable",
      ));
    }
    if (!input.targetId.trim()) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land attack target is invalid.",
        "attack_target_invalid",
      ));
    }
    if (this.#pendingAttack) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Another Adventure Land attack is still waiting for a server response.",
        "attack_already_pending",
      ));
    }

    return new Promise<AdventureLandAttackReceipt>((resolve, reject) => {
      const onAbort = () => {
        if (!this.#pendingAttack || this.#pendingAttack.targetId !== input.targetId) return;
        this.#pendingAttack = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land attack was cancelled while waiting for the server.",
          "attack_aborted",
        ));
      };
      this.#pendingAttack = {
        targetId: input.targetId,
        resolve,
        reject,
        signal: input.signal,
        onAbort,
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.#socket.send(
          "42" + JSON.stringify(["attack", { id: input.targetId }]),
        );
      } catch {
        this.#pendingAttack = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land attack could not be sent.",
          "attack_send_failed",
        ));
      }
    });
  }

  attackCooldownRemainingMs(): number {
    return Math.max(0, Math.ceil(this.#attackCooldownUntilMs - Date.now()));
  }

  sendSkill(input: AdventureLandSkillInput): Promise<AdventureLandSkillReceipt> {
    const name = input.name.trim();
    const targetId = input.targetId?.trim() || undefined;
    const cooldownKey = input.cooldownKey?.trim() || name;
    if (input.signal?.aborted) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land skill was cancelled before it was sent.",
        "skill_aborted",
      ));
    }
    if (this.#closed || this.#socket.readyState !== 1) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land character transport is not ready for skill execution.",
        "skill_transport_unavailable",
      ));
    }
    if (!name || name.length > 80 || (targetId && targetId.length > 160)) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land skill request is invalid.",
        "skill_request_invalid",
      ));
    }
    if (this.#pendingSkill) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Another Adventure Land skill is still waiting for a server response.",
        "skill_already_pending",
      ));
    }

    return new Promise<AdventureLandSkillReceipt>((resolve, reject) => {
      const onAbort = () => {
        if (!this.#pendingSkill || this.#pendingSkill.name !== name) return;
        this.#pendingSkill = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land skill was cancelled while waiting for the server.",
          "skill_aborted",
        ));
      };
      this.#pendingSkill = {
        name,
        targetId,
        cooldownKey,
        resolve,
        reject,
        signal: input.signal,
        onAbort,
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const payload: Record<string, unknown> = { name };
        if (targetId) payload.id = targetId;
        this.#socket.send("42" + JSON.stringify(["skill", payload]));
      } catch {
        this.#pendingSkill = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land skill could not be sent.",
          "skill_send_failed",
        ));
      }
    });
  }

  skillCooldownRemainingMs(name: string): number {
    const until = this.#skillCooldownUntilMs.get(name.trim()) ?? 0;
    return Math.max(0, Math.ceil(until - Date.now()));
  }

  sendLoot(input: AdventureLandLootInput): Promise<AdventureLandLootReceipt> {
    const chestId = input.chestId.trim();
    if (input.signal?.aborted) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land loot was cancelled before it was sent.",
        "loot_aborted",
      ));
    }
    if (this.#closed || this.#socket.readyState !== 1) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land character transport is not ready for loot.",
        "loot_transport_unavailable",
      ));
    }
    if (!chestId || chestId.length > 160) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land loot chest ID is invalid.",
        "loot_chest_invalid",
      ));
    }
    if (!this.#lootChests.has(chestId)) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land loot chest is no longer visible.",
        "loot_chest_not_visible",
      ));
    }
    if (this.#pendingLoot) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Another Adventure Land loot request is still waiting for the server.",
        "loot_already_pending",
      ));
    }

    return new Promise<AdventureLandLootReceipt>((resolve, reject) => {
      const onAbort = () => {
        if (!this.#pendingLoot || this.#pendingLoot.chestId !== chestId) return;
        this.#pendingLoot = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land loot was cancelled while waiting for the server.",
          "loot_aborted",
        ));
      };
      this.#pendingLoot = {
        chestId,
        resolve,
        reject,
        signal: input.signal,
        onAbort,
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.#socket.send("42" + JSON.stringify(["open_chest", { id: chestId }]));
      } catch {
        this.#pendingLoot = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land loot request could not be sent.",
          "loot_send_failed",
        ));
      }
    });
  }

  sendConsumable(
    input: AdventureLandConsumableInput,
  ): Promise<AdventureLandConsumableReceipt> {
    if (input.signal?.aborted) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land consumable use was cancelled before it was sent.",
        "consumable_aborted",
      ));
    }
    if (this.#closed || this.#socket.readyState !== 1) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land character transport is not ready for consumable use.",
        "consumable_transport_unavailable",
      ));
    }
    if (
      !Number.isInteger(input.inventoryIndex) ||
      input.inventoryIndex < 0 ||
      !input.itemName.trim() ||
      (input.kind !== "hp" && input.kind !== "mp")
    ) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land consumable request is invalid.",
        "consumable_request_invalid",
      ));
    }
    const item = this.#character.inventory?.[input.inventoryIndex];
    if (!item || typeof item.name !== "string" || item.name !== input.itemName) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land consumable inventory slot changed.",
        "consumable_item_changed",
      ));
    }
    if (this.#pendingConsumable) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Another Adventure Land consumable is still waiting for the server.",
        "consumable_already_pending",
      ));
    }

    return new Promise<AdventureLandConsumableReceipt>((resolve, reject) => {
      const onAbort = () => {
        if (
          !this.#pendingConsumable ||
          this.#pendingConsumable.inventoryIndex !== input.inventoryIndex
        ) return;
        this.#pendingConsumable = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land consumable use was cancelled while waiting for the server.",
          "consumable_aborted",
        ));
      };
      this.#pendingConsumable = {
        inventoryIndex: input.inventoryIndex,
        itemName: input.itemName,
        kind: input.kind,
        resolve,
        reject,
        signal: input.signal,
        onAbort,
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.#socket.send(
          "42" + JSON.stringify([
            "equip",
            { num: input.inventoryIndex, consume: true },
          ]),
        );
      } catch {
        this.#pendingConsumable = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land consumable request could not be sent.",
          "consumable_send_failed",
        ));
      }
    });
  }

  sendRespawn(
    input: AdventureLandRespawnInput = {},
  ): Promise<AdventureLandRespawnReceipt> {
    if (input.signal?.aborted) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land respawn was cancelled before it was sent.",
        "respawn_aborted",
      ));
    }
    if (this.#closed || this.#socket.readyState !== 1) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land character transport is not ready for respawn.",
        "respawn_transport_unavailable",
      ));
    }
    if (!this.#character.dead) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Adventure Land respawn is only valid while the character is dead.",
        "respawn_character_alive",
      ));
    }
    if (this.#pendingRespawn) {
      return Promise.reject(new AdventureLandCharacterTransportError(
        "Another Adventure Land respawn is still waiting for the server.",
        "respawn_already_pending",
      ));
    }

    return new Promise<AdventureLandRespawnReceipt>((resolve, reject) => {
      const onAbort = () => {
        if (!this.#pendingRespawn) return;
        this.#pendingRespawn = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land respawn was cancelled while waiting for the server.",
          "respawn_aborted",
        ));
      };
      this.#pendingRespawn = {
        resolve,
        reject,
        signal: input.signal,
        onAbort,
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.#socket.send("42" + JSON.stringify(["respawn"]));
      } catch {
        this.#pendingRespawn = undefined;
        input.signal?.removeEventListener("abort", onAbort);
        reject(new AdventureLandCharacterTransportError(
          "Adventure Land respawn request could not be sent.",
          "respawn_send_failed",
        ));
      }
    });
  }

  async close(): Promise<void> {
    if (this.#closed || this.#socket.readyState === 3) return;
    this.#intentional = true;
    clearInterval(this.#pingTimer);
    this.#pingSent.clear();
    this.#rejectPendingAttack(
      new AdventureLandCharacterTransportError(
        "Adventure Land attack was cancelled because the character stopped.",
        "attack_transport_closed",
      ),
    );
    this.#rejectPendingSkill(
      new AdventureLandCharacterTransportError(
        "Adventure Land skill was cancelled because the character stopped.",
        "skill_transport_closed",
      ),
    );
    this.#rejectPendingLoot(
      new AdventureLandCharacterTransportError(
        "Adventure Land loot was cancelled because the character stopped.",
        "loot_transport_closed",
      ),
    );
    this.#rejectPendingConsumable(
      new AdventureLandCharacterTransportError(
        "Adventure Land consumable use was cancelled because the character stopped.",
        "consumable_transport_closed",
      ),
    );
    this.#rejectPendingRespawn(
      new AdventureLandCharacterTransportError(
        "Adventure Land respawn was cancelled because the character stopped.",
        "respawn_transport_closed",
      ),
    );

    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      this.#socket.addEventListener("close", done, { once: true });
      setTimeout(done, 1_500);
      try {
        this.#socket.close(1000, "client_stop");
      } catch {
        done();
      }
    });
    this.#closed = true;
  }

  #rejectPendingAttack(error: AdventureLandCharacterTransportError): void {
    const pending = this.#pendingAttack;
    if (!pending) return;
    this.#pendingAttack = undefined;
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    pending.reject(error);
  }

  #rejectPendingSkill(error: AdventureLandCharacterTransportError): void {
    const pending = this.#pendingSkill;
    if (!pending) return;
    this.#pendingSkill = undefined;
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    pending.reject(error);
  }

  #rejectPendingLoot(error: AdventureLandCharacterTransportError): void {
    const pending = this.#pendingLoot;
    if (!pending) return;
    this.#pendingLoot = undefined;
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    pending.reject(error);
  }

  #rejectPendingConsumable(error: AdventureLandCharacterTransportError): void {
    const pending = this.#pendingConsumable;
    if (!pending) return;
    this.#pendingConsumable = undefined;
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    pending.reject(error);
  }

  #rejectPendingRespawn(error: AdventureLandCharacterTransportError): void {
    const pending = this.#pendingRespawn;
    if (!pending) return;
    this.#pendingRespawn = undefined;
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    pending.reject(error);
  }

  #sendPing(): void {
    if (this.#closed || this.#socket.readyState !== 1) return;
    const id = "alr-" + Date.now().toString(36) + "-" + (this.#pingSequence++).toString(36);
    this.#pingSent.set(id, Date.now());
    if (this.#pingSent.size > 8) {
      const oldest = this.#pingSent.keys().next().value;
      if (typeof oldest === "string") this.#pingSent.delete(oldest);
    }
    this.#socket.send("42" + JSON.stringify(["ping_trig", { id }]));
  }

  #emitGameEvent(name: AdventureLandGameEventName, payload: Record<string, unknown>): void {
    if (!this.#gameEventListeners.size) return;
    const event = createAdventureLandGameEvent(name, payload);
    for (const listener of this.#gameEventListeners) listener(structuredClone(event));
  }

  #touch(): void {
    this.#updatedAt = new Date().toISOString();
    const snapshot = this.snapshot();
    for (const listener of this.#stateListeners) listener(snapshot);
  }
}

export function characterSocketUrl(server: AdventureLandServerSummary): string {
  const rawAddress = server.address.trim();
  if (!rawAddress) {
    throw new AdventureLandCharacterTransportError(
      "The selected Adventure Land server has no network address.",
      "invalid_server",
    );
  }

  const base = /^[a-z]+:\/\//i.test(rawAddress)
    ? rawAddress
    : "https://" + rawAddress;
  const url = new URL(base);
  url.protocol = url.protocol === "http:" || url.protocol === "ws:" ? "ws:" : "wss:";

  let path = server.path.trim() || "/socket.io/";
  if (!path.startsWith("/")) path = "/" + path;
  if (!path.endsWith("/")) path += "/";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  url.searchParams.set("EIO", "4");
  url.searchParams.set("transport", "websocket");
  url.searchParams.set("map_protocol", "1");
  url.searchParams.set("no_graphics", "1");
  return url.toString();
}

function parseSocketEvent(packet: string): [string, unknown] | undefined {
  const start = packet.indexOf("[", 2);
  if (start < 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(packet.slice(start));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || typeof parsed[0] !== "string") return undefined;
  return [parsed[0], parsed[1]];
}

function parseConnectedCharacter(
  data: Record<string, unknown>,
  fallback: AdventureLandCharacterSummary,
): AdventureLandConnectedCharacter {
  const angle = finiteNumber(data.angle);
  const explicitDirection = finiteNumber(data.direction);
  const direction = explicitDirection ?? (angle === undefined ? undefined : directionFromAngle(angle));
  return Object.freeze({
    id: fallback.id,
    name: typeof data.name === "string" ? data.name : fallback.name,
    type:
      typeof data.ctype === "string"
        ? data.ctype
        : typeof data.type === "string"
          ? data.type
          : fallback.type,
    level: finiteNumber(data.level) ?? fallback.level,
    xp: finiteNumber(data.xp),
    maxXp: finiteNumber(data.max_xp),
    map: typeof data.map === "string" ? data.map : fallback.map,
    x: finiteNumber(data.x),
    y: finiteNumber(data.y),
    hp: finiteNumber(data.hp),
    maxHp: finiteNumber(data.max_hp),
    mp: finiteNumber(data.mp),
    maxMp: finiteNumber(data.max_mp),
    angle,
    direction,
    directionLabel: directionLabel(direction),
    target: typeof data.target === "string" ? data.target : undefined,
    dead: Boolean(data.rip),
    inventory: parseInventory(data.items),
    equipment: parseEquipment(data.slots),
    gold: finiteNumber(data.gold),
    conditions: parseConditions(data.s),
    movementSequence: finiteNumber(data.m),
    range: finiteNumber(data.range),
  });
}

function mergeConnectedCharacter(
  current: AdventureLandConnectedCharacter,
  data: Record<string, unknown>,
): AdventureLandConnectedCharacter {
  const angle = "angle" in data ? finiteNumber(data.angle) : current.angle;
  let direction = current.direction;
  if ("direction" in data) direction = finiteNumber(data.direction);
  else if ("angle" in data && angle !== undefined) direction = directionFromAngle(angle);
  const inventory = "items" in data ? parseInventory(data.items) : undefined;
  const equipment = "slots" in data ? parseEquipment(data.slots) : undefined;
  const conditions = "s" in data ? parseConditions(data.s) : undefined;

  return Object.freeze({
    id: current.id,
    name: typeof data.name === "string" ? data.name : current.name,
    type:
      typeof data.ctype === "string"
        ? data.ctype
        : typeof data.type === "string"
          ? data.type
          : current.type,
    level: finiteNumber(data.level) ?? current.level,
    xp: "xp" in data ? finiteNumber(data.xp) : current.xp,
    maxXp: "max_xp" in data ? finiteNumber(data.max_xp) : current.maxXp,
    map: typeof data.map === "string" ? data.map : current.map,
    x: "x" in data ? finiteNumber(data.x) : current.x,
    y: "y" in data ? finiteNumber(data.y) : current.y,
    hp: "hp" in data ? finiteNumber(data.hp) : current.hp,
    maxHp: "max_hp" in data ? finiteNumber(data.max_hp) : current.maxHp,
    mp: "mp" in data ? finiteNumber(data.mp) : current.mp,
    maxMp: "max_mp" in data ? finiteNumber(data.max_mp) : current.maxMp,
    angle,
    direction,
    directionLabel: directionLabel(direction),
    target: "target" in data
      ? (typeof data.target === "string" ? data.target : undefined)
      : current.target,
    dead: "rip" in data ? Boolean(data.rip) : current.dead,
    inventory: "items" in data ? (inventory ?? current.inventory) : current.inventory,
    equipment: "slots" in data ? (equipment ?? current.equipment) : current.equipment,
    gold: "gold" in data ? (finiteNumber(data.gold) ?? current.gold) : current.gold,
    conditions: "s" in data ? (conditions ?? current.conditions) : current.conditions,
    movementSequence: "m" in data
      ? (finiteNumber(data.m) ?? current.movementSequence)
      : current.movementSequence,
    range: "range" in data
      ? (finiteNumber(data.range) ?? current.range)
      : current.range,
  });
}

function parseInventory(
  value: unknown,
): readonly (AdventureLandItemState | null)[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Object.freeze(value.map((entry) => {
    if (entry === null) return null;
    if (!isRecord(entry)) return null;
    return Object.freeze(structuredClone(entry));
  }));
}

function parseEquipment(value: unknown): AdventureLandEquipmentState | undefined {
  if (!isRecord(value)) return undefined;
  const equipment: Record<string, AdventureLandItemState | null> = {};
  for (const [slot, entry] of Object.entries(value)) {
    if (slot.startsWith("trade")) continue;
    if (entry === null) equipment[slot] = null;
    else if (isRecord(entry)) equipment[slot] = Object.freeze(structuredClone(entry));
  }
  return Object.freeze(equipment);
}

function parseConditions(value: unknown): AdventureLandConditionState | undefined {
  if (!isRecord(value)) return undefined;
  const conditions: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [name, condition] of Object.entries(value)) {
    if (isRecord(condition)) conditions[name] = Object.freeze(structuredClone(condition));
  }
  return Object.freeze(conditions);
}

function directionFromAngle(angle: number): number {
  const absolute = Math.abs(angle);
  if (absolute < 70) return 2;
  if (Math.abs(absolute - 180) < 70) return 1;
  if (Math.abs(angle + 90) < 90) return 3;
  return 0;
}

function directionLabel(direction: number | undefined): string | undefined {
  if (direction === 0) return "Down";
  if (direction === 1) return "Left";
  if (direction === 2) return "Right";
  if (direction === 3) return "Up";
  return undefined;
}

async function messageText(data: unknown): Promise<string | undefined> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) return await data.text();
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
