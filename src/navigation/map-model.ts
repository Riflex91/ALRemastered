import type { AdventureLandGameData } from "../game/data-source.ts";
import type { Logger } from "../logging/logger.ts";

export type NavigationModelStatus = "unavailable" | "ready";
export type MapBoundsSource = "geometry" | "derived";
export type CollisionLine = readonly [number, number, number];

export interface MapPoint {
  readonly x: number;
  readonly y: number;
  readonly direction?: number;
}

export interface MapBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly source: MapBoundsSource;
}

export interface MapCollisionGeometry {
  readonly xLines: readonly CollisionLine[];
  readonly yLines: readonly CollisionLine[];
  readonly lineCount: number;
}

export interface MapTransition {
  readonly id: string;
  readonly index: number;
  readonly source: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
    spawnIndex?: number;
  }>;
  readonly target: Readonly<{
    map: string;
    spawnIndex: number;
    x?: number;
    y?: number;
    direction?: number;
  }>;
  readonly metadata: readonly (string | number | boolean | null)[];
  readonly valid: boolean;
  readonly problems: readonly string[];
}

export interface AdventureLandNavigationMap {
  readonly key: string;
  readonly name?: string;
  readonly ignored: boolean;
  readonly instance: boolean;
  readonly outside: boolean;
  readonly safe: boolean;
  readonly spawnPoints: readonly MapPoint[];
  readonly bounds?: MapBounds;
  readonly collision: MapCollisionGeometry;
  readonly transitions: readonly MapTransition[];
}

export interface AdventureLandNavigationModel {
  readonly version: number;
  readonly mapCount: number;
  readonly geometryMapCount: number;
  readonly mapsWithBounds: number;
  readonly collisionLineCount: number;
  readonly transitionCount: number;
  readonly invalidTransitionCount: number;
  readonly missingGeometryMapKeys: readonly string[];
  readonly maps: Readonly<Record<string, AdventureLandNavigationMap>>;
}

export interface AdventureLandMapModelState {
  readonly status: NavigationModelStatus;
  readonly version?: number;
  readonly mapCount: number;
  readonly geometryMapCount: number;
  readonly mapsWithBounds: number;
  readonly collisionLineCount: number;
  readonly transitionCount: number;
  readonly invalidTransitionCount: number;
  readonly missingGeometryMapKeys: readonly string[];
  readonly message: string;
}

export interface AdventureLandMapModelServiceOptions {
  readonly logger: Logger;
  readonly gameData: () => AdventureLandGameData | undefined;
}

export class AdventureLandMapModelService {
  readonly #logger: Logger;
  readonly #gameData: () => AdventureLandGameData | undefined;
  #cachedData?: AdventureLandGameData;
  #cachedModel?: AdventureLandNavigationModel;

  constructor(options: AdventureLandMapModelServiceOptions) {
    this.#logger = options.logger;
    this.#gameData = options.gameData;
  }

  state(): AdventureLandMapModelState {
    const model = this.model();
    if (!model) {
      return Object.freeze({
        status: "unavailable",
        mapCount: 0,
        geometryMapCount: 0,
        mapsWithBounds: 0,
        collisionLineCount: 0,
        transitionCount: 0,
        invalidTransitionCount: 0,
        missingGeometryMapKeys: Object.freeze([]),
        message: "Map/geometry model is waiting for Adventure Land game data.",
      });
    }
    return Object.freeze({
      status: "ready",
      version: model.version,
      mapCount: model.mapCount,
      geometryMapCount: model.geometryMapCount,
      mapsWithBounds: model.mapsWithBounds,
      collisionLineCount: model.collisionLineCount,
      transitionCount: model.transitionCount,
      invalidTransitionCount: model.invalidTransitionCount,
      missingGeometryMapKeys: model.missingGeometryMapKeys,
      message: model.invalidTransitionCount > 0
        ? `Map/geometry model is ready with ${model.invalidTransitionCount} invalid transition reference(s).`
        : "Map/geometry model is ready.",
    });
  }

  model(): AdventureLandNavigationModel | undefined {
    const data = this.#gameData();
    if (!data) return undefined;
    if (this.#cachedData === data && this.#cachedModel) return this.#cachedModel;
    const model = buildAdventureLandNavigationModel(data);
    this.#cachedData = data;
    this.#cachedModel = model;
    this.#logger.info("Adventure Land map/geometry model built.", {
      version: model.version,
      mapCount: model.mapCount,
      geometryMapCount: model.geometryMapCount,
      mapsWithBounds: model.mapsWithBounds,
      collisionLineCount: model.collisionLineCount,
      transitionCount: model.transitionCount,
      invalidTransitionCount: model.invalidTransitionCount,
      missingGeometryMaps: model.missingGeometryMapKeys.length,
    });
    return model;
  }

  map(key: string): AdventureLandNavigationMap | undefined {
    return this.model()?.maps[key];
  }
}

export function buildAdventureLandNavigationModel(
  data: AdventureLandGameData,
): AdventureLandNavigationModel {
  const mapKeys = Object.keys(data.maps).sort();
  const maps: Record<string, AdventureLandNavigationMap> = {};

  for (const key of mapKeys) {
    const rawMap = asRecord(data.maps[key]) ?? {};
    const rawGeometry = asRecord(data.geometry[key]);
    const spawnPoints = parseSpawnPoints(rawMap.spawns);
    const collision = parseCollisionGeometry(rawGeometry);
    const bounds = parseBounds(rawGeometry) ??
      deriveBounds(collision, spawnPoints, parseRawDoorRectangles(rawMap.doors));

    maps[key] = Object.freeze({
      key,
      name: typeof rawMap.name === "string" && rawMap.name.trim()
        ? rawMap.name
        : undefined,
      ignored: rawMap.ignore === true,
      instance: rawMap.instance === true,
      outside: rawMap.outside === true,
      safe: rawMap.safe === true,
      spawnPoints,
      bounds,
      collision,
      transitions: Object.freeze([]),
    });
  }

  for (const key of mapKeys) {
    const rawMap = asRecord(data.maps[key]) ?? {};
    const current = maps[key]!;
    maps[key] = Object.freeze({
      ...current,
      transitions: parseTransitions(key, rawMap.doors, maps),
    });
  }

  const mapValues = Object.values(maps);
  const missingGeometryMapKeys = Object.freeze(
    mapKeys.filter((key) => !asRecord(data.geometry[key])),
  );
  return Object.freeze({
    version: data.version,
    mapCount: mapValues.length,
    geometryMapCount: mapValues.length - missingGeometryMapKeys.length,
    mapsWithBounds: mapValues.filter((map) => map.bounds).length,
    collisionLineCount: mapValues.reduce(
      (total, map) => total + map.collision.lineCount,
      0,
    ),
    transitionCount: mapValues.reduce(
      (total, map) => total + map.transitions.length,
      0,
    ),
    invalidTransitionCount: mapValues.reduce(
      (total, map) =>
        total + map.transitions.filter((transition) => !transition.valid).length,
      0,
    ),
    missingGeometryMapKeys,
    maps: Object.freeze(maps),
  });
}

export function mapCollisionGeometry(
  data: AdventureLandGameData | undefined,
  map: string,
): MapCollisionGeometry | undefined {
  if (!data) return undefined;
  const rawGeometry = asRecord(data.geometry[map]);
  if (!rawGeometry) return undefined;
  return parseCollisionGeometry(rawGeometry);
}

export function parseCollisionLines(value: unknown): readonly CollisionLine[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const lines: CollisionLine[] = [];
  for (const line of value) {
    if (
      !Array.isArray(line) ||
      line.length < 3 ||
      !line.slice(0, 3).every(isFiniteNumber)
    ) {
      continue;
    }
    const fixed = line[0] as number;
    const a = line[1] as number;
    const b = line[2] as number;
    if (a === b) continue;
    lines.push(Object.freeze([fixed, Math.min(a, b), Math.max(a, b)]));
  }
  return Object.freeze(lines);
}

function parseCollisionGeometry(
  rawGeometry: Readonly<Record<string, unknown>> | undefined,
): MapCollisionGeometry {
  const xLines = parseCollisionLines(rawGeometry?.x_lines);
  const yLines = parseCollisionLines(rawGeometry?.y_lines);
  return Object.freeze({
    xLines,
    yLines,
    lineCount: xLines.length + yLines.length,
  });
}

function parseSpawnPoints(value: unknown): readonly MapPoint[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const points: MapPoint[] = [];
  for (const spawn of value) {
    if (
      !Array.isArray(spawn) ||
      spawn.length < 2 ||
      !isFiniteNumber(spawn[0]) ||
      !isFiniteNumber(spawn[1])
    ) {
      continue;
    }
    const direction = isFiniteNumber(spawn[2]) ? spawn[2] : undefined;
    points.push(Object.freeze({
      x: spawn[0],
      y: spawn[1],
      direction,
    }));
  }
  return Object.freeze(points);
}

function parseBounds(
  rawGeometry: Readonly<Record<string, unknown>> | undefined,
): MapBounds | undefined {
  if (!rawGeometry) return undefined;
  const minX = rawGeometry.min_x;
  const minY = rawGeometry.min_y;
  const maxX = rawGeometry.max_x;
  const maxY = rawGeometry.max_y;
  if (
    !isFiniteNumber(minX) ||
    !isFiniteNumber(minY) ||
    !isFiniteNumber(maxX) ||
    !isFiniteNumber(maxY) ||
    minX > maxX ||
    minY > maxY
  ) {
    return undefined;
  }
  return Object.freeze({
    minX,
    minY,
    maxX,
    maxY,
    source: "geometry",
  });
}

function parseRawDoorRectangles(
  value: unknown,
): readonly Readonly<{ x: number; y: number; width: number; height: number }>[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const rectangles: Array<Readonly<{ x: number; y: number; width: number; height: number }>> = [];
  for (const door of value) {
    if (
      !Array.isArray(door) ||
      door.length < 4 ||
      !door.slice(0, 4).every(isFiniteNumber)
    ) {
      continue;
    }
    rectangles.push(Object.freeze({
      x: door[0] as number,
      y: door[1] as number,
      width: Math.abs(door[2] as number),
      height: Math.abs(door[3] as number),
    }));
  }
  return Object.freeze(rectangles);
}

function deriveBounds(
  collision: MapCollisionGeometry,
  spawnPoints: readonly MapPoint[],
  doors: readonly Readonly<{ x: number; y: number; width: number; height: number }>[],
): MapBounds | undefined {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const [x, minY, maxY] of collision.xLines) {
    xs.push(x);
    ys.push(minY, maxY);
  }
  for (const [y, minX, maxX] of collision.yLines) {
    ys.push(y);
    xs.push(minX, maxX);
  }
  for (const spawn of spawnPoints) {
    xs.push(spawn.x);
    ys.push(spawn.y);
  }
  for (const door of doors) {
    xs.push(door.x - door.width / 2, door.x + door.width / 2);
    ys.push(door.y - door.height / 2, door.y + door.height / 2);
  }

  if (xs.length === 0 || ys.length === 0) return undefined;
  return Object.freeze({
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    source: "derived",
  });
}

function parseTransitions(
  mapKey: string,
  value: unknown,
  maps: Readonly<Record<string, AdventureLandNavigationMap>>,
): readonly MapTransition[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const transitions: MapTransition[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const door = value[index];
    if (!Array.isArray(door) || door.length < 6) continue;
    if (
      !isFiniteNumber(door[0]) ||
      !isFiniteNumber(door[1]) ||
      !isFiniteNumber(door[2]) ||
      !isFiniteNumber(door[3]) ||
      typeof door[4] !== "string" ||
      !Number.isInteger(door[5]) ||
      Number(door[5]) < 0
    ) {
      continue;
    }

    const targetMapKey = door[4] as string;
    const targetSpawnIndex = Number(door[5]);
    const sourceSpawnIndex =
      Number.isInteger(door[6]) && Number(door[6]) >= 0
        ? Number(door[6])
        : undefined;
    const targetMap = maps[targetMapKey];
    const targetSpawn = targetMap?.spawnPoints[targetSpawnIndex];
    const problems: string[] = [];
    if (!targetMap) problems.push(`Target map ${targetMapKey} is missing.`);
    else if (!targetSpawn) {
      problems.push(
        `Target spawn ${targetSpawnIndex} is missing on map ${targetMapKey}.`,
      );
    }
    if (
      sourceSpawnIndex !== undefined &&
      !maps[mapKey]?.spawnPoints[sourceSpawnIndex]
    ) {
      problems.push(
        `Source spawn ${sourceSpawnIndex} is missing on map ${mapKey}.`,
      );
    }

    const metadata = Object.freeze(
      door.slice(7)
        .filter(isPrimitiveMetadata)
        .map((entry) => entry as string | number | boolean | null),
    );
    transitions.push(Object.freeze({
      id: `${mapKey}:door:${index}`,
      index,
      source: Object.freeze({
        x: door[0] as number,
        y: door[1] as number,
        width: Math.abs(door[2] as number),
        height: Math.abs(door[3] as number),
        spawnIndex: sourceSpawnIndex,
      }),
      target: Object.freeze({
        map: targetMapKey,
        spawnIndex: targetSpawnIndex,
        x: targetSpawn?.x,
        y: targetSpawn?.y,
        direction: targetSpawn?.direction,
      }),
      metadata,
      valid: problems.length === 0,
      problems: Object.freeze(problems),
    }));
  }
  return Object.freeze(transitions);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPrimitiveMetadata(
  value: unknown,
): value is string | number | boolean | null {
  return value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
}
