import type { AdventureLandAccountSession } from "../account/source.ts";
import type {
  AdventureLandCharacterSummary,
  AdventureLandServerSummary,
} from "../account/selection-source.ts";

export interface AdventureLandCharacterTransportInput {
  readonly session: AdventureLandAccountSession;
  readonly character: AdventureLandCharacterSummary;
  readonly server: AdventureLandServerSummary;
}

export interface AdventureLandConnectedCharacter {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly level: number;
  readonly map?: string;
  readonly x?: number;
  readonly y?: number;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly mp?: number;
  readonly maxMp?: number;
}

export interface AdventureLandCharacterConnection {
  readonly character: AdventureLandConnectedCharacter;
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
              const character = parseConnectedCharacter(data, input.character);
              finish(new LiveAdventureLandCharacterConnection(
                socket,
                character,
                () => disconnectReason,
              ));
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
  readonly character: AdventureLandConnectedCharacter;
  readonly #socket: WebSocket;
  readonly #disconnectReason: () => string | undefined;
  readonly #listeners = new Set<(reason?: string) => void>();
  #intentional = false;
  #closed = false;

  constructor(
    socket: WebSocket,
    character: AdventureLandConnectedCharacter,
    disconnectReason: () => string | undefined,
  ) {
    this.#socket = socket;
    this.character = character;
    this.#disconnectReason = disconnectReason;

    socket.addEventListener("close", () => {
      this.#closed = true;
      if (this.#intentional) return;
      const reason = this.#disconnectReason();
      for (const listener of this.#listeners) listener(reason);
    });
  }

  onUnexpectedClose(listener: (reason?: string) => void): void {
    this.#listeners.add(listener);
  }

  async close(): Promise<void> {
    if (this.#closed || this.#socket.readyState === 3) return;
    this.#intentional = true;

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
  return Object.freeze({
    id: typeof data.id === "string" ? data.id : fallback.id,
    name: typeof data.name === "string" ? data.name : fallback.name,
    type:
      typeof data.ctype === "string"
        ? data.ctype
        : typeof data.type === "string"
          ? data.type
          : fallback.type,
    level: finiteNumber(data.level) ?? fallback.level,
    map: typeof data.map === "string" ? data.map : fallback.map,
    x: finiteNumber(data.x),
    y: finiteNumber(data.y),
    hp: finiteNumber(data.hp),
    maxHp: finiteNumber(data.max_hp),
    mp: finiteNumber(data.mp),
    maxMp: finiteNumber(data.max_mp),
  });
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
