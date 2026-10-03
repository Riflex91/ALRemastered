import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  AdventureLandMapModelService,
  buildAdventureLandNavigationModel,
  mapCollisionGeometry,
} from "../src/navigation/map-model.ts";

function sampleData(): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: {
      main: {
        name: "Mainland",
        spawns: [[10, 20, 3], [100, 200]],
        doors: [
          [50, 60, 20, 30, "cave", 1, 0, "key", "cryptkey"],
        ],
        outside: true,
      },
      cave: {
        name: "Cave",
        spawns: [[-10, -20], [300, 400, 1]],
        doors: [
          [300, 420, 32, 20, "main", 0, 1],
        ],
      },
      event: {
        name: "Event",
        spawns: [[0, 0]],
        doors: [],
        instance: true,
      },
    },
    geometry: {
      main: {
        min_x: -500,
        min_y: -300,
        max_x: 900,
        max_y: 700,
        x_lines: [[20, 100, -100], [30, 5, 5], ["bad", 1, 2]],
        y_lines: [[40, 200, -200]],
      },
      cave: {
        x_lines: [[-50, -80, 80]],
        y_lines: [[90, -100, 100]],
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

test("map model normalizes maps bounds collision lines spawns and door transitions", () => {
  const data = sampleData();
  const model = buildAdventureLandNavigationModel(data);

  assert.equal(model.version, 17397);
  assert.equal(model.mapCount, 3);
  assert.equal(model.geometryMapCount, 2);
  assert.deepEqual(model.missingGeometryMapKeys, ["event"]);
  assert.equal(model.mapsWithBounds, 3);
  assert.equal(model.collisionLineCount, 4);
  assert.equal(model.transitionCount, 2);
  assert.equal(model.invalidTransitionCount, 0);
  assert.equal(model.blockingInvalidTransitionCount, 0);
  assert.equal(model.ignoredInvalidTransitionCount, 0);

  const main = model.maps.main;
  assert.equal(main?.name, "Mainland");
  assert.equal(main?.outside, true);
  assert.deepEqual(main?.spawnPoints, [
    { x: 10, y: 20, direction: 3 },
    { x: 100, y: 200, direction: undefined },
  ]);
  assert.deepEqual(main?.bounds, {
    minX: -500,
    minY: -300,
    maxX: 900,
    maxY: 700,
    source: "geometry",
  });
  assert.deepEqual(main?.collision.xLines, [[20, -100, 100]]);
  assert.deepEqual(main?.collision.yLines, [[40, -200, 200]]);

  const door = main?.transitions[0];
  assert.equal(door?.id, "main:door:0");
  assert.equal(door?.source.x, 50);
  assert.equal(door?.source.y, 60);
  assert.equal(door?.source.width, 20);
  assert.equal(door?.source.height, 30);
  assert.equal(door?.source.spawnIndex, 0);
  assert.deepEqual(door?.target, {
    map: "cave",
    spawnIndex: 1,
    x: 300,
    y: 400,
    direction: 1,
  });
  assert.deepEqual(door?.metadata, ["key", "cryptkey"]);
  assert.equal(door?.valid, true);
  assert.deepEqual(door?.problems, []);

  const cave = model.maps.cave;
  assert.equal(cave?.bounds?.source, "derived");
  assert.ok((cave?.bounds?.minX ?? 0) <= -100);
  assert.ok((cave?.bounds?.maxY ?? 0) >= 430);

  const event = model.maps.event;
  assert.equal(event?.collision.lineCount, 0);
  assert.equal(event?.bounds?.source, "derived");
});

test("map model records dangling target and source spawn references without dropping doors", () => {
  const data = sampleData();
  const broken: AdventureLandGameData = {
    ...data,
    maps: {
      ...data.maps,
      main: {
        ...(data.maps.main as Record<string, unknown>),
        doors: [
          [0, 0, 20, 20, "missing", 0, 99],
          [10, 10, 20, 20, "cave", 99, 0],
        ],
      },
    },
  };

  const model = buildAdventureLandNavigationModel(broken);
  assert.equal(model.transitionCount, 3);
  assert.equal(model.invalidTransitionCount, 2);
  assert.equal(model.blockingInvalidTransitionCount, 2);
  assert.equal(model.ignoredInvalidTransitionCount, 0);
  assert.equal(model.maps.main?.transitions.length, 2);
  assert.match(model.maps.main?.transitions[0]?.problems[0] ?? "", /Target map missing/);
  assert.match(
    model.maps.main?.transitions[0]?.problems[1] ?? "",
    /Source spawn 99 is missing/,
  );
  assert.match(
    model.maps.main?.transitions[1]?.problems[0] ?? "",
    /Target spawn 99 is missing/,
  );
});



test("ignored prototype maps retain dangling door evidence without blocking active navigation integrity", () => {
  const data = sampleData();
  const withPrototype: AdventureLandGameData = {
    ...data,
    maps: {
      ...data.maps,
      d2: {
        ignore: true,
        spawns: [[0, 0], [0, -671]],
        doors: [
          [0, 22, 40, 40, "d1", 1, 0],
          [0, -684, 20, 50, "d3", 0, 1, "protected"],
        ],
      },
    },
  };

  const model = buildAdventureLandNavigationModel(withPrototype);
  assert.equal(model.invalidTransitionCount, 2);
  assert.equal(model.blockingInvalidTransitionCount, 0);
  assert.equal(model.ignoredInvalidTransitionCount, 2);
  assert.equal(model.maps.d2?.ignored, true);
  assert.equal(model.maps.d2?.transitions.every((transition) => !transition.valid), true);

  const logger = new Logger({ component: "ignored-map-model-test" });
  const service = new AdventureLandMapModelService({
    logger,
    gameData: () => withPrototype,
  });
  const state = service.state();
  assert.equal(state.status, "ready");
  assert.equal(state.blockingInvalidTransitionCount, 0);
  assert.equal(state.ignoredInvalidTransitionCount, 2);
  assert.match(state.message, /ignored maps and are non-blocking/);
});

test("map model service exposes a cached navigation snapshot and canonical movement geometry", () => {
  const logger = new Logger({ component: "map-model-test" });
  const data = sampleData();
  let reads = 0;
  const service = new AdventureLandMapModelService({
    logger,
    gameData: () => {
      reads += 1;
      return data;
    },
  });

  const first = service.model();
  const second = service.model();
  assert.equal(first, second);
  assert.ok(reads >= 2);
  assert.equal(service.state().status, "ready");
  assert.equal(service.state().mapCount, 3);
  assert.equal(service.map("main")?.transitions[0]?.target.map, "cave");

  const geometry = mapCollisionGeometry(data, "main");
  assert.deepEqual(geometry?.xLines, [[20, -100, 100]]);
  assert.deepEqual(geometry?.yLines, [[40, -200, 200]]);
  assert.equal(geometry?.lineCount, 2);
  assert.equal(mapCollisionGeometry(data, "missing"), undefined);

  const log = logger.exportText();
  assert.equal((log.match(/map\/geometry model built/g) ?? []).length, 1);
});
