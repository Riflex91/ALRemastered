import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Slice61LiveTestService } from "../src/live-test/slice-6-1.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandMapModelService } from "../src/navigation/map-model.ts";

function liveData(): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: {
      main: {
        name: "Mainland",
        spawns: [[0, 0, 3], [500, 25]],
        doors: [[500, 50, 40, 30, "cave", 0, 1]],
        outside: true,
      },
      cave: {
        name: "Cave",
        spawns: [[100, 200, 1]],
        doors: [[100, 230, 30, 20, "main", 0, 0]],
      },
    },
    geometry: {
      main: {
        min_x: -800,
        min_y: -600,
        max_x: 1200,
        max_y: 900,
        x_lines: [[250, -200, 200]],
        y_lines: [[300, -400, 600]],
      },
      cave: {
        min_x: -300,
        min_y: -300,
        max_x: 700,
        max_y: 700,
        x_lines: [[0, -250, 250]],
        y_lines: [[0, -250, 250]],
      },
    },
    skills: {},
    classes: {},
    npcs: {},
    drops: {},
    craft: {},
    conditions: {},
  };
}

test("Slice 6.1 verifies live map bounds transitions and collision geometry passively", async () => {
  const logger = new Logger({ component: "slice-6-1-live-test" });
  const data = liveData();
  const gameData = {
    state: () => ({
      status: "loaded" as const,
      version: data.version,
      cacheStatus: "stored" as const,
      familyCount: 10,
      loadedFamilyCount: 10,
      families: [],
    }),
    data: () => data,
    loadNow: async () => gameData.state(),
  };
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => data,
  });
  let characterReads = 0;
  const character = {
    state: () => {
      characterReads += 1;
      return {
        status: "connected" as const,
        characterId: "CH_MAP",
        characterName: "MapRanger",
        serverKey: "SR_EUII",
        serverRegion: "EU",
        serverName: "II",
        heartbeatSequence: 77 + characterReads,
        pingMs: 14,
        message: "Connected.",
        character: {
          id: "CH_MAP",
          name: "MapRanger",
          type: "ranger",
          level: 60,
          map: "main",
          x: 10,
          y: 20,
          dead: false,
          movementSequence: 0,
        },
      };
    },
  };

  const service = new Slice61LiveTestService({
    logger,
    gameData: gameData as any,
    mapModel,
    character: character as any,
    idFactory: () => "live61-test",
    clock: (() => {
      let now = Date.parse("2026-10-03T21:00:00.000Z");
      return () => new Date(now += 10);
    })(),
  });

  const result = await service.run();
  assert.equal(result.outcome, "passed");
  assert.equal(result.testId, "live61-test");
  assert.deepEqual(result.steps.map((step) => step.name), [
    "map-model",
    "map-bounds",
    "collision-geometry",
    "transitions",
    "final-state",
  ]);
  assert.equal(result.steps[0]?.evidence.mapCount, 2);
  assert.equal(result.steps[1]?.evidence.map, "main");
  assert.equal(result.steps[1]?.evidence.representsCurrentCharacterMap, true);
  assert.equal(result.steps[2]?.evidence.lineCount, 2);
  const transition = result.steps[3]?.evidence.sampleTransition as any;
  assert.equal(transition.target.map, "cave");
  assert.equal(transition.target.spawnIndex, 0);
  assert.equal(transition.target.x, 100);
  assert.equal(transition.target.y, 200);
  assert.equal(result.steps[4]?.evidence.gameplayMutation, false);
  assert.equal(result.steps[4]?.evidence.rawSocketAccess, false);
  assert.equal(result.steps[4]?.evidence.pathfinding, false);
  assert.match(logger.exportText(), /Slice 6\.1 map\/geometry-model test passed/);
  assert.match(logger.exportText(), /"gameplayMutation":false/);
});

test("Slice 6.1 blocks before reading map data when no Character is connected", async () => {
  const logger = new Logger({ component: "slice-6-1-blocked-test" });
  let dataReads = 0;
  const gameData = {
    state: () => ({ status: "idle" as const }),
    data: () => {
      dataReads += 1;
      return undefined;
    },
    loadNow: async () => {
      throw new Error("must not load");
    },
  };
  const mapModel = new AdventureLandMapModelService({
    logger,
    gameData: () => undefined,
  });
  const service = new Slice61LiveTestService({
    logger,
    gameData: gameData as any,
    mapModel,
    character: {
      state: () => ({
        status: "disconnected" as const,
        message: "Disconnected.",
      }),
    } as any,
    idFactory: () => "live61-blocked",
  });

  const result = await service.run();
  assert.equal(result.outcome, "blocked");
  assert.equal(result.error?.code, "LIVE_TEST_CHARACTER_NOT_CONNECTED");
  assert.equal(dataReads, 0);
});
