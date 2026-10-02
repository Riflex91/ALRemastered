import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandCharacterService } from "../src/character/service.ts";
import {
  AdventureLandCharacterTransport,
  characterSocketUrl,
  type AdventureLandCharacterConnection,
} from "../src/character/transport.ts";

class FakeWebSocket {
  readyState = 0;
  readonly sent: string[] = [];
  readonly url: string;
  readonly #listeners = new Map<string, Set<(event: any) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(String(data));
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.#emit("close", { code, reason });
  }

  open(): void {
    this.readyState = 1;
    this.#emit("open", {});
  }

  message(data: string): void {
    this.#emit("message", { data });
  }

  #emit(type: string, event: any): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

const character = {
  id: "CH_1",
  name: "RangerOne",
  type: "ranger",
  level: 45,
  online: false,
  map: "main",
};

const server = {
  key: "SR_EUII",
  name: "II",
  region: "EU",
  players: 100,
  address: "eu2.example.test",
  path: "/socket.io/",
};

test("headless transport follows welcome-loaded-auth-start without automation events", async () => {
  let socket: FakeWebSocket | undefined;
  const transport = new AdventureLandCharacterTransport((url) => {
    socket = new FakeWebSocket(url);
    return socket as unknown as WebSocket;
  }, 5_000);

  const connecting = transport.connect({
    session: { userId: "US_user", auth: "private-auth" },
    character,
    server,
  });

  assert.ok(socket);
  socket.open();
  socket.message('0{"sid":"engine"}');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(socket.sent, ["40"]);

  socket.message('40{"sid":"socket"}');
  socket.message('42["welcome",{"region":"EU","name":"II"}]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(socket.sent[1] ?? "", /^42\["loaded"/);

  socket.message('42["entities",{"type":"all","players":[],"monsters":[]}]');
  await new Promise((resolve) => setImmediate(resolve));
  const authPacket = socket.sent.find((packet) => packet.startsWith('42["auth"'));
  assert.ok(authPacket);
  assert.match(authPacket, /"user":"US_user"/);
  assert.match(authPacket, /"character":"CH_1"/);
  assert.match(authPacket, /"auth":"private-auth"/);
  assert.match(authPacket, /"no_graphics":true/);
  assert.equal(socket.sent.some((packet) => /attack|move|transport|skill|buy|bank/.test(packet)), false);

  socket.message('2server-ping');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(socket.sent.at(-1), "3server-ping");

  socket.message('42["start",{"id":"RangerOne","name":"RangerOne","ctype":"ranger","level":45,"map":"main","x":12,"y":34,"hp":4000,"max_hp":4000,"mp":900,"max_mp":1000}]');
  const connection = await connecting;
  assert.equal(connection.character.id, "CH_1");
  assert.equal(connection.character.name, "RangerOne");
  assert.equal(connection.character.type, "ranger");
  assert.equal(connection.character.map, "main");
  assert.equal(connection.character.x, 12);
  await connection.close();
  assert.equal(socket.readyState, 3);
});

test("character socket URL uses the selected official server path and websocket transport", () => {
  const url = new URL(characterSocketUrl(server));
  assert.equal(url.protocol, "wss:");
  assert.equal(url.hostname, "eu2.example.test");
  assert.equal(url.pathname, "/socket.io/");
  assert.equal(url.searchParams.get("EIO"), "4");
  assert.equal(url.searchParams.get("transport"), "websocket");
  assert.equal(url.searchParams.get("map_protocol"), "1");
  assert.equal(url.searchParams.get("no_graphics"), "1");
});

test("character service allows exactly one connection and disconnects controllably", async () => {
  const logger = new Logger({ component: "character-test" });
  let unexpectedClose: ((reason?: string) => void) | undefined;
  let closeCalls = 0;
  const connection: AdventureLandCharacterConnection = {
    character: {
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 45,
      map: "main",
      x: 12,
      y: 34,
    },
    onUnexpectedClose(listener) {
      unexpectedClose = listener;
    },
    async close() {
      closeCalls += 1;
    },
  };

  const service = new AdventureLandCharacterService({
    logger,
    session: () => ({ userId: "US_user", auth: "private-auth" }),
    selection: {
      state: () => ({
        status: "ready",
        characters: [character],
        servers: [server],
        selectedServerKey: "SR_EUII",
        loadedAt: "2026-10-02T20:00:00.000Z",
        message: "Ready.",
      }),
    },
    transport: {
      connect: async () => connection,
    },
    now: () => new Date("2026-10-02T20:05:00.000Z"),
  });

  const connected = await service.start("CH_1");
  assert.equal(connected.status, "connected");
  assert.equal(connected.characterName, "RangerOne");
  assert.equal(connected.serverKey, "SR_EUII");
  assert.match(connected.message, /No automation is running/);
  assert.throws(() => service.start("CH_1"), /already active/);

  const stopped = await service.stop("dashboard");
  assert.equal(stopped.status, "disconnected");
  assert.equal(closeCalls, 1);
  assert.match(logger.exportText(), /"automation":false/);
  assert.doesNotMatch(logger.exportText(), /private-auth/);

  await service.start("CH_1");
  unexpectedClose?.("limits");
  const failed = service.state();
  assert.equal(failed.status, "error");
  assert.match(failed.message, /limits/);
});
