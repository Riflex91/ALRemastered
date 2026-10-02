import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_GAME_DATA_FAMILIES,
  type AdventureLandGameData,
  type AdventureLandGameDataSnapshot,
} from "./data-source.ts";

export type AdventureLandGameDataCacheLoadStatus =
  | "missing"
  | "loaded"
  | "invalid"
  | "stale";

export interface AdventureLandGameDataCacheRecord {
  readonly schemaVersion: 1;
  readonly version: number;
  readonly cachedAt: string;
  readonly sourceUrl: string;
  readonly bytes: number;
  readonly data: AdventureLandGameData;
}

export interface AdventureLandGameDataCacheLoadResult {
  readonly status: AdventureLandGameDataCacheLoadStatus;
  readonly record?: AdventureLandGameDataCacheRecord;
  readonly invalidEntries: number;
  readonly staleEntries: number;
  readonly message: string;
}

export class AdventureLandGameDataCache {
  readonly #directory: string;

  constructor(directory: string) {
    this.#directory = directory;
  }

  load(expectedVersion?: number): AdventureLandGameDataCacheLoadResult {
    if (!existsSync(this.#directory)) {
      return cacheResult("missing", 0, 0, "No local game data cache is available yet.");
    }

    let names: string[];
    try {
      names = readdirSync(this.#directory)
        .filter((name) => name.startsWith("snapshot-") && name.endsWith(".json"));
    } catch {
      return cacheResult("invalid", 1, 0, "Local game data cache is unreadable.");
    }

    if (names.length === 0) {
      return cacheResult("missing", 0, 0, "No local game data cache is available yet.");
    }

    const records: AdventureLandGameDataCacheRecord[] = [];
    let invalidEntries = 0;
    let staleEntries = 0;

    for (const name of names) {
      try {
        const record = parseCacheRecord(readFileSync(join(this.#directory, name), "utf8"));
        if (expectedVersion !== undefined && record.version !== expectedVersion) {
          staleEntries += 1;
          continue;
        }
        records.push(record);
      } catch {
        invalidEntries += 1;
      }
    }

    records.sort((a, b) => Date.parse(b.cachedAt) - Date.parse(a.cachedAt));
    const record = records[0];
    if (record) {
      return Object.freeze({
        status: "loaded",
        record,
        invalidEntries,
        staleEntries,
        message: "Local game data cache loaded.",
      });
    }

    if (staleEntries > 0) {
      return cacheResult(
        "stale",
        invalidEntries,
        staleEntries,
        "Cached game data does not match the last known Adventure Land version.",
      );
    }

    if (invalidEntries > 0) {
      return cacheResult(
        "invalid",
        invalidEntries,
        staleEntries,
        "Local game data cache is corrupted or unreadable.",
      );
    }

    return cacheResult("missing", 0, 0, "No local game data cache is available yet.");
  }

  save(
    snapshot: AdventureLandGameDataSnapshot,
    cachedAt: string,
  ): AdventureLandGameDataCacheRecord {
    const record: AdventureLandGameDataCacheRecord = Object.freeze({
      schemaVersion: 1,
      version: snapshot.data.version,
      cachedAt,
      sourceUrl: snapshot.sourceUrl,
      bytes: snapshot.bytes,
      data: snapshot.data,
    });

    parseCacheRecord(JSON.stringify(record));
    mkdirSync(this.#directory, { recursive: true });

    const parsedTime = Date.parse(cachedAt);
    const timestamp = Number.isFinite(parsedTime) ? parsedTime : Date.now();
    const finalName =
      "snapshot-" + snapshot.data.version + "-" + timestamp + "-" + randomUUID() + ".json";
    const finalPath = join(this.#directory, finalName);
    const temporaryPath = finalPath + ".tmp";

    writeFileSync(temporaryPath, JSON.stringify(record) + "\n", {
      encoding: "utf8",
      flag: "wx",
    });

    try {
      renameSync(temporaryPath, finalPath);
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }

    for (const name of readdirSync(this.#directory)) {
      if (
        name !== finalName &&
        name.startsWith("snapshot-") &&
        (name.endsWith(".json") || name.endsWith(".tmp"))
      ) {
        try {
          rmSync(join(this.#directory, name), { force: true });
        } catch {
          // A complete new snapshot already exists, so cleanup is best-effort only.
        }
      }
    }

    return record;
  }
}

function parseCacheRecord(source: string): AdventureLandGameDataCacheRecord {
  const parsed = JSON.parse(source) as Partial<AdventureLandGameDataCacheRecord>;

  if (
    parsed.schemaVersion !== 1 ||
    !Number.isSafeInteger(parsed.version) ||
    (parsed.version ?? 0) <= 0 ||
    typeof parsed.cachedAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.cachedAt)) ||
    typeof parsed.sourceUrl !== "string" ||
    parsed.sourceUrl.length === 0 ||
    !Number.isSafeInteger(parsed.bytes) ||
    (parsed.bytes ?? -1) < 0
  ) {
    throw new Error("Invalid Adventure Land game data cache metadata.");
  }

  const data = validateCachedGameData(parsed.data);
  if (data.version !== parsed.version) {
    throw new Error("Adventure Land game data cache version does not match its payload.");
  }

  return Object.freeze({
    schemaVersion: 1,
    version: parsed.version!,
    cachedAt: parsed.cachedAt,
    sourceUrl: parsed.sourceUrl,
    bytes: parsed.bytes!,
    data,
  });
}

function validateCachedGameData(value: unknown): AdventureLandGameData {
  if (!isRecord(value)) {
    throw new Error("Adventure Land game data cache does not contain a data object.");
  }

  if (!Number.isSafeInteger(value.version) || Number(value.version) <= 0) {
    throw new Error("Adventure Land game data cache contains an invalid version.");
  }

  for (const family of REQUIRED_GAME_DATA_FAMILIES) {
    if (!isRecord(value[family])) {
      throw new Error("Adventure Land game data cache is missing required family G." + family + ".");
    }
  }

  return value as AdventureLandGameData;
}

function cacheResult(
  status: AdventureLandGameDataCacheLoadStatus,
  invalidEntries: number,
  staleEntries: number,
  message: string,
): AdventureLandGameDataCacheLoadResult {
  return Object.freeze({
    status,
    invalidEntries,
    staleEntries,
    message,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
