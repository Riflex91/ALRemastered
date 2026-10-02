import type { AdventureLandAccountSession } from "../account/source.ts";
import type {
  AdventureLandCharacterSummary,
  AdventureLandServerSummary,
} from "../account/selection-source.ts";
import {
  applyEntityPacket,
  applyPartyPacket,
  clearVisibleEntities,
  emptyWorldState,
  removeVisibleEntity,
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
}

export interface AdventureLandCharacterLiveState {
  readonly character: AdventureLandConnectedCharacter;
  readonly entities: readonly AdventureLandVisibleEntity[];
  readonly party: AdventureLandPartyState;
  readonly pingMs?: number;
  readonly updatedAt: string;
}

export interface AdventureLandCharacterConnection {
  readonly character: AdventureLandConnectedCharacter;
  readonly pingMs?: number;
  snapshot(): AdventureLandCharacterLiveState;
  onState(listener: (state: AdventureLandCharacterLiveState) => void): void;
  onUnexpectedClose(listener: (reason?: string) => void): void;
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
                liveConnection.applyDisappear(data);
                continue;
              }
              if (name === "party_update" && isRecord(data)) {
                liveConnection.applyPartyUpdate(data);
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
  readonly #pingSent = new Map<string, number>();
  readonly #pingTimer: ReturnType<typeof setInterval>;
  #character: AdventureLandConnectedCharacter;
  #world: AdventureLandWorldState = emptyWorldState();
  #pingMs?: number;
  #updatedAt: string;
  #intentional = false;
  #closed = false;
  #pingSequence = 0;

  constructor(
    socket: WebSocket,
    character: AdventureLandConnectedCharacter,
    disconnectReason: () => string | undefined,
  ) {
    this.#socket = socket;
    this.#character = character;
    this.#updatedAt = new Date().toISOString();
    this.#disconnectReason = disconnectReason;

    socket.addEventListener("close", () => {
      this.#closed = true;
      clearInterval(this.#pingTimer);
      this.#pingSent.clear();
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
      pingMs: this.#pingMs,
      updatedAt: this.#updatedAt,
    });
  }

  onState(listener: (state: AdventureLandCharacterLiveState) => void): void {
    this.#stateListeners.add(listener);
  }

  onUnexpectedClose(listener: (reason?: string) => void): void {
    this.#listeners.add(listener);
  }

  applyPlayer(data: Record<string, unknown>): void {
    this.#character = mergeConnectedCharacter(this.#character, data);
    this.#touch();
  }

  applyNewMap(data: Record<string, unknown>): void {
    const patch: Record<string, unknown> = {
      map: typeof data.name === "string" ? data.name : this.#character.map,
      x: data.x,
      y: data.y,
      direction: data.direction,
    };
    this.#character = mergeConnectedCharacter(this.#character, patch);
    this.#world = clearVisibleEntities(this.#world);
    this.#touch();
  }

  applyEntities(data: Record<string, unknown>): void {
    this.#world = applyEntityPacket(this.#world, data);
    this.#touch();
  }

  applyDisappear(data: Record<string, unknown>): void {
    const next = removeVisibleEntity(this.#world, data.id);
    if (next === this.#world) return;
    this.#world = next;
    this.#touch();
  }

  applyPartyUpdate(data: Record<string, unknown>): void {
    this.#world = applyPartyPacket(this.#world, data);
    this.#touch();
  }

  applyPingAck(data: Record<string, unknown>): void {
    if (typeof data.id !== "string") return;
    const sentAt = this.#pingSent.get(data.id);
    if (sentAt === undefined) return;
    this.#pingSent.delete(data.id);
    this.#pingMs = Math.max(0, Date.now() - sentAt);
    this.#touch();
  }

  async close(): Promise<void> {
    if (this.#closed || this.#socket.readyState === 3) return;
    this.#intentional = true;
    clearInterval(this.#pingTimer);
    this.#pingSent.clear();

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
