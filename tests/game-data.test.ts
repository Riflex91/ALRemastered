import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AdventureLandGameDataCache } from "../src/game/data-cache.ts";
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


test("game data cache atomically stores and restores versioned snapshots", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-data-cache-"));
  try {
    const cache = new AdventureLandGameDataCache(root);
    const firstData = sampleData(17397);
    cache.save({
      data: firstData,
      sourceUrl: "https://adventure.land/data.js",
      bytes: 2_804_303,
    }, "2026-10-02T17:00:00.000Z");

    const first = cache.load(17397);
    assert.equal(first.status, "loaded");
    assert.equal(first.record?.version, 17397);
    assert.equal(readdirSync(root).filter((name) => name.endsWith(".json")).length, 1);
    assert.equal(readdirSync(root).some((name) => name.endsWith(".tmp")), false);

    const secondData = sampleData(17398);
    cache.save({
      data: secondData,
      sourceUrl: "https://adventure.land/data.js",
      bytes: 2_804_400,
    }, "2026-10-02T18:00:00.000Z");

    assert.equal(cache.load(17398).status, "loaded");
    assert.equal(cache.load(17397).status, "stale");
    assert.equal(readdirSync(root).filter((name) => name.endsWith(".json")).length, 1);
    assert.equal(readdirSync(root).some((name) => name.endsWith(".tmp")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("offline load restores a valid cache and retains it when live refresh fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-data-cache-"));
  try {
    const cache = new AdventureLandGameDataCache(root);
    cache.save({
      data: sampleData(17397),
      sourceUrl: "https://adventure.land/data.js",
      bytes: 2_804_303,
    }, "2026-10-02T17:00:00.000Z");

    const logger = new Logger({ component: "game-data-cache-test" });
    const service = new AdventureLandGameDataService({
      logger,
      cache,
      expectedVersion: () => 17397,
      source: {
        fetchData: async () => {
          throw new Error("network unavailable");
        },
      },
      now: () => new Date("2026-10-02T19:00:00.000Z"),
    });

    const state = await service.loadNow(false);
    assert.equal(state.status, "error");
    assert.equal(state.version, 17397);
    assert.equal(state.origin, "cache");
    assert.equal(state.cacheStatus, "loaded");
    assert.equal(state.cachedAt, "2026-10-02T17:00:00.000Z");
    assert.equal(service.data()?.version, 17397);
    assert.match(state.message ?? "", /previously loaded game data snapshot remains available/);
    assert.match(logger.exportText(), /Adventure Land game data restored from cache/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corrupted cache is ignored and replaced by a valid live snapshot", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-data-cache-"));
  try {
    writeFileSync(join(root, "snapshot-corrupt.json"), "{broken", "utf8");
    const cache = new AdventureLandGameDataCache(root);
    const logger = new Logger({ component: "game-data-cache-test" });
    const data = sampleData(17397);
    const service = new AdventureLandGameDataService({
      logger,
      cache,
      expectedVersion: () => 17397,
      source: {
        fetchData: async () => ({
          data,
          sourceUrl: "https://adventure.land/data.js",
          bytes: 2_804_303,
        }),
      },
      now: () => new Date("2026-10-02T19:05:00.000Z"),
    });

    const state = await service.loadNow(false);
    assert.equal(state.status, "loaded");
    assert.equal(state.origin, "live");
    assert.equal(state.cacheStatus, "stored");
    assert.equal(cache.load(17397).status, "loaded");
    assert.equal(readdirSync(root).filter((name) => name.endsWith(".json")).length, 1);
    assert.match(logger.exportText(), /Invalid Adventure Land game data cache entries were ignored/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("known version changes invalidate stale cache data before it can be used", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-data-cache-"));
  try {
    const cache = new AdventureLandGameDataCache(root);
    cache.save({
      data: sampleData(17396),
      sourceUrl: "https://adventure.land/data.js",
      bytes: 2_800_000,
    }, "2026-10-02T16:00:00.000Z");

    const logger = new Logger({ component: "game-data-cache-test" });
    const service = new AdventureLandGameDataService({
      logger,
      cache,
      expectedVersion: () => 17397,
      source: {
        fetchData: async () => ({
          data: sampleData(17397),
          sourceUrl: "https://adventure.land/data.js",
          bytes: 2_804_303,
        }),
      },
      now: () => new Date("2026-10-02T19:10:00.000Z"),
    });

    const state = await service.loadNow(false);
    assert.equal(state.status, "loaded");
    assert.equal(state.version, 17397);
    assert.equal(state.origin, "live");
    assert.equal(state.cacheStatus, "stored");
    assert.equal(cache.load(17397).status, "loaded");
    assert.equal(cache.load(17396).status, "stale");
    assert.match(logger.exportText(), /Stale Adventure Land game data cache entries were ignored/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
