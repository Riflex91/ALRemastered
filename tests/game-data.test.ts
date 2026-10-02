import assert from "node:assert/strict";
import { test } from "node:test";
import { AdventureLandGameDataService } from "../src/game/data-service.ts";
import {
  AdventureLandGameDataSource,
  parseAdventureLandGameData,
  type AdventureLandGameData,
} from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";

function sampleData(version = 15555): AdventureLandGameData {
  return {
    version,
    items: { hpot0: {}, mpot0: {} },
    monsters: { goo: {}, bee: {} },
    maps: { main: {}, cave: {} },
    geometry: { main: {}, cave: {} },
    skills: { attack: {}, heal: {} },
    classes: { warrior: {}, mage: {} },
    npcs: { transporter: {}, potions: {} },
    drops: { monsters: {}, maps: {} },
    craft: { blade: {}, rod: {} },
    conditions: { burn: {}, poisoned: {} },
    dismantle: { test: {} },
    upgrades: { weapon: {} },
    compounds: { ring: {} },
    events: { halloween: {} },
  };
}

function sourceText(data: AdventureLandGameData): string {
  return "var G=" + JSON.stringify(data) + ";\n";
}

test("game data parser accepts the official var G JSON envelope", () => {
  const parsed = parseAdventureLandGameData(sourceText(sampleData()));
  assert.equal(parsed.version, 15555);
  assert.equal(Object.keys(parsed.items).length, 2);
  assert.equal(Object.keys(parsed.geometry).length, 2);
  assert.equal(Object.keys(parsed.craft).length, 2);
});

test("game data parser rejects malformed or incomplete snapshots", () => {
  assert.throws(
    () => parseAdventureLandGameData("window.G={};"),
    /valid G assignment/,
  );

  assert.throws(
    () => parseAdventureLandGameData("var G={not_json:true};"),
    /invalid JSON/,
  );

  const incomplete = { ...sampleData() } as Record<string, unknown>;
  delete incomplete.geometry;
  assert.throws(
    () => parseAdventureLandGameData("var G=" + JSON.stringify(incomplete) + ";"),
    /missing required family G\.geometry/,
  );
});

test("game data source downloads and parses a bounded official-style payload", async () => {
  const payload = sourceText(sampleData());
  const source = new AdventureLandGameDataSource(
    async () => new Response(payload, {
      status: 200,
      headers: { "content-length": String(Buffer.byteLength(payload)) },
    }),
    "https://example.test/data.js",
  );

  const snapshot = await source.fetchData();
  assert.equal(snapshot.data.version, 15555);
  assert.equal(snapshot.sourceUrl, "https://example.test/data.js");
  assert.equal(snapshot.bytes, Buffer.byteLength(payload));
});

test("game data service exposes central data and family counts", async () => {
  const logger = new Logger({ component: "game-data-test" });
  const data = sampleData();
  const service = new AdventureLandGameDataService({
    logger,
    source: {
      fetchData: async () => ({
        data,
        sourceUrl: "https://example.test/data.js",
        bytes: 1234,
      }),
    },
    now: () => new Date("2026-10-02T17:00:00.000Z"),
  });

  const state = await service.loadNow();
  assert.equal(state.status, "loaded");
  assert.equal(state.version, 15555);
  assert.equal(state.loadedFamilyCount, state.familyCount);
  assert.equal(state.families.find((family) => family.name === "items")?.count, 2);
  assert.equal(state.families.find((family) => family.name === "geometry")?.count, 2);
  assert.equal(state.families.find((family) => family.name === "events")?.count, 1);
  assert.equal(service.data(), data);
  assert.match(logger.exportText(), /Adventure Land game data loaded/);
});

test("failed reload keeps the previously loaded central snapshot", async () => {
  const logger = new Logger({ component: "game-data-test" });
  const data = sampleData();
  let fail = false;
  const service = new AdventureLandGameDataService({
    logger,
    source: {
      fetchData: async () => {
        if (fail) throw new Error("network unavailable");
        return {
          data,
          sourceUrl: "https://example.test/data.js",
          bytes: 1234,
        };
      },
    },
  });

  assert.equal((await service.loadNow()).status, "loaded");
  fail = true;
  const failed = await service.loadNow();
  assert.equal(failed.status, "error");
  assert.equal(failed.version, 15555);
  assert.equal(service.data(), data);
  assert.match(logger.exportText(), /retainedPreviousData/);
});


test("shared live data source coalesces simultaneous version and game-data reads", async () => {
  const payload = sourceText(sampleData(17397));
  let requests = 0;
  let releaseResponse: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });

  const source = new AdventureLandGameDataSource(
    async () => {
      requests += 1;
      await gate;
      return new Response(payload, { status: 200 });
    },
    "https://adventure.land/data.js",
  );

  const first = source.fetchData();
  const second = source.fetchData();
  releaseResponse?.();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(requests, 1);
  assert.equal(a.data.version, 17397);
  assert.equal(b.data.version, 17397);
  assert.equal(a, b);
});
