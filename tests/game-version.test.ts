import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AdventureLandVersionService } from "../src/game/version-service.ts";
import { AdventureLandVersionSource } from "../src/game/version-source.ts";
import { AdventureLandVersionStore } from "../src/game/version-store.ts";
import { Logger } from "../src/logging/logger.ts";

function liveSnapshot(version = 17397) {
  return {
    data: {
      version,
      items: {},
      monsters: {},
      maps: {},
      geometry: {},
      skills: {},
      classes: {},
      npcs: {},
      drops: {},
      craft: {},
      conditions: {},
    },
    sourceUrl: "https://adventure.land/data.js",
    bytes: 2_804_303,
  };
}

test("Adventure Land version source derives the version from the live production data snapshot", async () => {
  const source = new AdventureLandVersionSource({
    fetchData: async () => liveSnapshot(17397),
  });

  const parsed = await source.fetchVersion();
  assert.equal(parsed.version, 17397);
  assert.equal(parsed.lastDeploy, undefined);
  assert.equal(parsed.sourceUrl, "https://adventure.land/data.js");
});

test("first online version check stores a local baseline", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-version-"));
  try {
    const path = join(root, "version.json");
    const store = new AdventureLandVersionStore(path);
    const logger = new Logger({ component: "game-version-test" });
    const source = {
      fetchVersion: async () => ({
        version: 17397,
        sourceUrl: "https://adventure.land/data.js",
      }),
    };
    const service = new AdventureLandVersionService({
      logger,
      source,
      store,
      now: () => new Date("2026-10-02T16:30:00.000Z"),
    });

    const state = await service.checkNow();
    assert.equal(state.status, "current");
    assert.equal(state.currentVersion, 17397);
    assert.equal(state.previousVersion, undefined);
    assert.equal(state.lastDeploy, undefined);
    assert.equal(store.load()?.version, 17397);
    assert.match(readFileSync(path, "utf8"), /"version": 17397/);
    assert.match(logger.exportText(), /Adventure Land game version verified/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("version mismatch is detected, logged and the live production version becomes the stored baseline", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-version-"));
  try {
    const store = new AdventureLandVersionStore(join(root, "version.json"));
    store.save({
      schemaVersion: 1,
      version: 15555,
      lastDeploy: "[10/09/26]",
      observedAt: "2026-10-01T12:00:00.000Z",
    });

    const logger = new Logger({ component: "game-version-test" });
    const service = new AdventureLandVersionService({
      logger,
      store,
      source: {
        fetchVersion: async () => ({
          version: 17397,
          sourceUrl: "https://adventure.land/data.js",
        }),
      },
      now: () => new Date("2026-10-02T16:31:00.000Z"),
    });

    const state = await service.checkNow();
    assert.equal(state.status, "changed");
    assert.equal(state.previousVersion, 15555);
    assert.equal(state.currentVersion, 17397);
    assert.equal(state.lastDeploy, undefined);
    assert.equal(store.load()?.version, 17397);
    assert.equal(store.load()?.lastDeploy, undefined);
    assert.match(state.message ?? "", /15555 to 17397/);
    assert.match(logger.exportText(), /Adventure Land game version changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed online check keeps the previously stored version available", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-version-"));
  try {
    const store = new AdventureLandVersionStore(join(root, "version.json"));
    store.save({
      schemaVersion: 1,
      version: 17397,
      observedAt: "2026-10-02T12:00:00.000Z",
    });

    const logger = new Logger({ component: "game-version-test" });
    const service = new AdventureLandVersionService({
      logger,
      store,
      source: {
        fetchVersion: async () => {
          throw new Error("network unavailable");
        },
      },
    });

    const state = await service.checkNow();
    assert.equal(state.status, "error");
    assert.equal(state.currentVersion, 17397);
    assert.equal(state.storedVersion, 17397);
    assert.equal(store.load()?.version, 17397);
    assert.match(logger.exportText(), /Adventure Land version check failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
