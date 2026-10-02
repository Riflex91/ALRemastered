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

  socket.message('42["start",{"id":"RangerOne","name":"RangerOne","ctype":"ranger","level":45,"xp":12345,"max_xp":50000,"map":"main","x":12,"y":34,"hp":4000,"max_hp":4000,"mp":900,"max_mp":1000,"angle":0,"target":null,"rip":false}]');
  const connection = await connecting;
  assert.equal(connection.character.id, "CH_1");
  assert.equal(connection.character.name, "RangerOne");
  assert.equal(connection.character.type, "ranger");
  assert.equal(connection.character.map, "main");
  assert.equal(connection.character.x, 12);
  assert.equal(connection.character.xp, 12345);
  assert.equal(connection.character.maxXp, 50000);
  assert.equal(connection.character.direction, 2);
  assert.equal(connection.character.directionLabel, "Right");
  assert.equal(connection.character.dead, false);

  let liveState = connection.snapshot();
  connection.onState((next) => {
    liveState = next;
  });
  socket.message('42["player",{"hp":3500,"mp":850,"xp":12500,"x":20,"y":40,"angle":180,"target":"goo-1","rip":false}]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(liveState.character.hp, 3500);
  assert.equal(liveState.character.mp, 850);
  assert.equal(liveState.character.xp, 12500);
  assert.equal(liveState.character.x, 20);
  assert.equal(liveState.character.y, 40);
  assert.equal(liveState.character.directionLabel, "Left");
  assert.equal(liveState.character.target, "goo-1");

  socket.message('42["new_map",{"name":"cave","x":101,"y":202,"direction":3}]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(liveState.character.map, "cave");
  assert.equal(liveState.character.x, 101);
  assert.equal(liveState.character.y, 202);
  assert.equal(liveState.character.directionLabel, "Up");

  const pingPacket = socket.sent.find((packet) => packet.startsWith('42["ping_trig"'));
  assert.ok(pingPacket);
  const pingEvent = JSON.parse(pingPacket.slice(2));
  socket.message("42" + JSON.stringify(["ping_ack", { id: pingEvent[1].id }]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof liveState.pingMs, "number");
  assert.ok((liveState.pingMs ?? -1) >= 0);

  socket.message('42["player",{"rip":true,"target":null}]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(liveState.character.dead, true);
  assert.equal(liveState.character.target, undefined);

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
  let liveListener: ((state: any) => void) | undefined;
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
      hp: 4000,
      maxHp: 4000,
      mp: 900,
      maxMp: 1000,
      xp: 12345,
      maxXp: 50000,
      direction: 2,
      directionLabel: "Right",
      dead: false,
    },
    pingMs: undefined,
    snapshot() {
      return {
        character: this.character,
        pingMs: this.pingMs,
        updatedAt: "2026-10-02T20:05:00.000Z",
      };
    },
    onState(listener) {
      liveListener = listener;
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
  assert.match(connected.message, /no automation is running/i);
  assert.equal(connected.character?.hp, 4000);
  assert.throws(() => service.start("CH_1"), /already active/);

  liveListener?.({
    character: {
      ...connection.character,
      hp: 3200,
      mp: 750,
      xp: 13000,
      x: 30,
      y: 50,
      target: "goo-1",
      dead: false,
    },
    pingMs: 42,
    updatedAt: "2026-10-02T20:05:01.000Z",
  });
  const live = service.state();
  assert.equal(live.character?.hp, 3200);
  assert.equal(live.character?.target, "goo-1");
  assert.equal(live.pingMs, 42);
  assert.equal(live.lastLiveUpdateAt, "2026-10-02T20:05:01.000Z");

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
