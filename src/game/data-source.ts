export type AdventureLandGameDataRecord = Readonly<Record<string, unknown>>;

export interface AdventureLandGameData extends AdventureLandGameDataRecord {
  readonly version: number;
  readonly items: AdventureLandGameDataRecord;
  readonly monsters: AdventureLandGameDataRecord;
  readonly maps: AdventureLandGameDataRecord;
  readonly geometry: AdventureLandGameDataRecord;
  readonly skills: AdventureLandGameDataRecord;
  readonly classes: AdventureLandGameDataRecord;
  readonly npcs: AdventureLandGameDataRecord;
  readonly drops: AdventureLandGameDataRecord;
  readonly craft: AdventureLandGameDataRecord;
  readonly conditions: AdventureLandGameDataRecord;
}

export interface AdventureLandGameDataSnapshot {
  readonly data: AdventureLandGameData;
  readonly sourceUrl: string;
  readonly bytes: number;
}

export const ADVENTURE_LAND_GAME_DATA_URL = "https://adventure.land/data.js";
const MAX_GAME_DATA_BYTES = 64 * 1024 * 1024;

export class AdventureLandGameDataSource {
  readonly #fetch: typeof fetch;
  readonly #sourceUrl: string;

  constructor(fetchImpl: typeof fetch = fetch, sourceUrl = ADVENTURE_LAND_GAME_DATA_URL) {
    this.#fetch = fetchImpl;
    this.#sourceUrl = sourceUrl;
  }

  async fetchData(): Promise<AdventureLandGameDataSnapshot> {
    const response = await this.#fetch(this.#sourceUrl, {
      headers: {
        Accept: "application/javascript, text/javascript, text/plain",
        "User-Agent": "ALRemastered",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error("Adventure Land game data request failed with HTTP " + response.status + ".");
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_GAME_DATA_BYTES) {
      throw new Error("Adventure Land game data exceeded the maximum accepted size.");
    }

    const source = await response.text();
    const bytes = Buffer.byteLength(source, "utf8");
    if (bytes > MAX_GAME_DATA_BYTES) {
      throw new Error("Adventure Land game data exceeded the maximum accepted size.");
    }

    return Object.freeze({
      data: parseAdventureLandGameData(source),
      sourceUrl: this.#sourceUrl,
      bytes,
    });
  }
}

export const REQUIRED_GAME_DATA_FAMILIES = Object.freeze([
  "items",
  "monsters",
  "maps",
  "geometry",
  "skills",
  "classes",
  "npcs",
  "drops",
  "craft",
  "conditions",
] as const);

export const OPTIONAL_GAME_DATA_FAMILIES = Object.freeze([
  "dismantle",
  "upgrades",
  "compounds",
  "events",
] as const);

export function parseAdventureLandGameData(source: string): AdventureLandGameData {
  const text = source.replace(/^\uFEFF/, "").trim();
  const prefix = /^var\s+G\s*=\s*/.exec(text);
  if (!prefix) {
    throw new Error("Adventure Land game data did not start with a valid G assignment.");
  }
  if (!text.endsWith(";")) {
    throw new Error("Adventure Land game data did not end with a valid G assignment.");
  }

  const json = text.slice(prefix[0].length, -1).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Adventure Land game data contained invalid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Adventure Land game data did not contain an object.");
  }

  const version = parsed.version;
  if (!Number.isSafeInteger(version) || Number(version) <= 0) {
    throw new Error("Adventure Land game data contained an invalid version.");
  }

  for (const family of REQUIRED_GAME_DATA_FAMILIES) {
    if (!isRecord(parsed[family])) {
      throw new Error("Adventure Land game data is missing required family G." + family + ".");
    }
  }

  return parsed as AdventureLandGameData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
