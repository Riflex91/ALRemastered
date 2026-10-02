import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AdventureLandVersionService } from "../src/game/version-service.ts";
import { parseAdventureLandVersionSource } from "../src/game/version-source.ts";
import { AdventureLandVersionStore } from "../src/game/version-store.ts";
import { Logger } from "../src/logging/logger.ts";

test("Adventure Land version source parses Version and LastDeploy", () => {
  const parsed = parseAdventureLandVersionSource(
    'Version = 15555;\nLastDeploy = "[10/09/26]";\n',
    "https://example.test/version.js",
  );

  assert.equal(parsed.version, 15555);
  assert.equal(parsed.lastDeploy, "[10/09/26]");
  assert.equal(parsed.sourceUrl, "https://example.test/version.js");
});

test("Adventure Land version source rejects missing or invalid version values", () => {
  assert.throws(() => parseAdventureLandVersionSource("LastDeploy = \"today\";"), /valid Version value/);
  assert.throws(() => parseAdventureLandVersionSource("Version = 0;"), /invalid version number/);
});

test("first online version check stores a local baseline", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-version-"));
  try {
    const path = join(root, "version.json");
    const store = new AdventureLandVersionStore(path);
    const logger = new Logger({ component: "game-version-test" });
    const source = {
      fetchVersion: async () => ({
        version: 15555,
        lastDeploy: "[10/09/26]",
        sourceUrl: "https://example.test/version.js",
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
    assert.equal(state.currentVersion, 15555);
    assert.equal(state.previousVersion, undefined);
    assert.equal(state.lastDeploy, "[10/09/26]");
    assert.equal(store.load()?.version, 15555);
    assert.match(readFileSync(path, "utf8"), /"version": 15555/);
    assert.match(logger.exportText(), /Adventure Land game version verified/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("version mismatch is detected, logged and the new version becomes the stored baseline", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-game-version-"));
  try {
    const store = new AdventureLandVersionStore(join(root, "version.json"));
    store.save({
      schemaVersion: 1,
      version: 15554,
      lastDeploy: "[09/09/26]",
      observedAt: "2026-10-01T12:00:00.000Z",
    });

    const logger = new Logger({ component: "game-version-test" });
    const service = new AdventureLandVersionService({
      logger,
      store,
      source: {
        fetchVersion: async () => ({
          version: 15555,
          lastDeploy: "[10/09/26]",
          sourceUrl: "https://example.test/version.js",
        }),
      },
      now: () => new Date("2026-10-02T16:31:00.000Z"),
    });

    const state = await service.checkNow();
    assert.equal(state.status, "changed");
    assert.equal(state.previousVersion, 15554);
    assert.equal(state.currentVersion, 15555);
    assert.equal(store.load()?.version, 15555);
    assert.match(state.message ?? "", /15554 to 15555/);
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
      version: 15555,
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
    assert.equal(state.currentVersion, 15555);
    assert.equal(state.storedVersion, 15555);
    assert.equal(store.load()?.version, 15555);
    assert.match(logger.exportText(), /Adventure Land version check failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
