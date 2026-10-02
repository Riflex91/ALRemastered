import type { Logger } from "../logging/logger.ts";
import {
  type AdventureLandGameDataCache,
  type AdventureLandGameDataCacheLoadStatus,
} from "./data-cache.ts";
import {
  OPTIONAL_GAME_DATA_FAMILIES,
  REQUIRED_GAME_DATA_FAMILIES,
  type AdventureLandGameData,
  type AdventureLandGameDataSource,
} from "./data-source.ts";

export type AdventureLandGameDataStatus = "idle" | "loading" | "loaded" | "error";
export type AdventureLandGameDataOrigin = "live" | "cache";
export type AdventureLandGameDataCacheStatus =
  | "disabled"
  | "not-checked"
  | AdventureLandGameDataCacheLoadStatus
  | "stored"
  | "error";

export interface AdventureLandGameDataFamilyState {
  readonly name: string;
  readonly required: boolean;
  readonly loaded: boolean;
  readonly count: number;
}

export interface AdventureLandGameDataState {
  readonly status: AdventureLandGameDataStatus;
  readonly version?: number;
  readonly loadedAt?: string;
  readonly sourceUrl?: string;
  readonly bytes?: number;
  readonly origin?: AdventureLandGameDataOrigin;
  readonly cacheStatus: AdventureLandGameDataCacheStatus;
  readonly cachedAt?: string;
  readonly cacheMessage?: string;
  readonly familyCount: number;
  readonly loadedFamilyCount: number;
  readonly families: readonly AdventureLandGameDataFamilyState[];
  readonly message?: string;
}

export interface AdventureLandGameDataServiceOptions {
  readonly logger: Logger;
  readonly source: Pick<AdventureLandGameDataSource, "fetchData">;
  readonly cache?: AdventureLandGameDataCache;
  readonly expectedVersion?: () => number | undefined;
  readonly now?: () => Date;
  readonly reloadIntervalMs?: number;
}

export class AdventureLandGameDataService {
  readonly #logger: Logger;
  readonly #source: Pick<AdventureLandGameDataSource, "fetchData">;
  readonly #cache?: AdventureLandGameDataCache;
  readonly #expectedVersion?: () => number | undefined;
  readonly #now: () => Date;
  readonly #reloadIntervalMs: number;
  #state: AdventureLandGameDataState;
  #data?: AdventureLandGameData;
  #loading?: Promise<AdventureLandGameDataState>;
  #timer?: NodeJS.Timeout;
  #cacheChecked = false;

  constructor(options: AdventureLandGameDataServiceOptions) {
    this.#logger = options.logger;
    this.#source = options.source;
    this.#cache = options.cache;
    this.#expectedVersion = options.expectedVersion;
    this.#now = options.now ?? (() => new Date());
    this.#reloadIntervalMs = options.reloadIntervalMs ?? 6 * 60 * 60 * 1000;
    this.#state = Object.freeze({
      status: "idle",
      cacheStatus: this.#cache ? "not-checked" : "disabled",
      familyCount: allFamilies().length,
      loadedFamilyCount: 0,
      families: emptyFamilyStates(),
      message: "Adventure Land game data has not been loaded yet.",
    });
  }

  state(): AdventureLandGameDataState {
    return structuredClone(this.#state);
  }

  data(): AdventureLandGameData | undefined {
    return this.#data;
  }

  start(): void {
    if (this.#timer) return;
    void this.loadNow(false);
    this.#timer = setInterval(() => void this.loadNow(false), this.#reloadIntervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  loadNow(manual = true): Promise<AdventureLandGameDataState> {
    if (this.#loading) return this.#loading;
    this.#loading = this.#performLoad(manual).finally(() => {
      this.#loading = undefined;
    });
    return this.#loading;
  }

  async #performLoad(manual: boolean): Promise<AdventureLandGameDataState> {
    this.#restoreCacheOnce();
    const previous = this.#state;
    this.#setState({
      ...previous,
      status: "loading",
      message: manual
        ? "Reloading Adventure Land game data…"
        : "Loading Adventure Land game data…",
    });

    if (manual) this.#logger.info("Manual Adventure Land game data reload started.");

    try {
      const snapshot = await this.#source.fetchData();
      const families = familyStates(snapshot.data);
      const loadedAt = this.#now().toISOString();
      let cacheStatus = previous.cacheStatus;
      let cachedAt = previous.cachedAt;
      let cacheMessage = previous.cacheMessage;

      if (this.#cache) {
        try {
          const record = this.#cache.save(snapshot, loadedAt);
          cacheStatus = "stored";
          cachedAt = record.cachedAt;
          cacheMessage = "Latest live game data is stored in the local cache.";
          this.#logger.info("Adventure Land game data cache updated.", {
            version: record.version,
            cachedAt: record.cachedAt,
          });
        } catch (error) {
          cacheStatus = "error";
          cacheMessage = "Adventure Land game data loaded, but the local cache could not be updated.";
          this.#logger.error("Adventure Land game data cache update failed.", error, {
            version: snapshot.data.version,
          });
        }
      }

      this.#data = snapshot.data;
      this.#setState({
        status: "loaded",
        version: snapshot.data.version,
        loadedAt,
        sourceUrl: snapshot.sourceUrl,
        bytes: snapshot.bytes,
        origin: "live",
        cacheStatus,
        cachedAt,
        cacheMessage,
        familyCount: families.length,
        loadedFamilyCount: families.filter((family) => family.loaded).length,
        families,
        message: cacheStatus === "error"
          ? "Adventure Land game data is loaded, but the local cache could not be updated."
          : "Adventure Land game data is loaded and available.",
      });

      this.#logger.info("Adventure Land game data loaded.", {
        version: snapshot.data.version,
        sourceUrl: snapshot.sourceUrl,
        bytes: snapshot.bytes,
        origin: "live",
        cacheStatus,
        families: Object.fromEntries(families.map((family) => [family.name, family.count])),
      });
      return this.state();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#setState({
        ...previous,
        status: "error",
        message: this.#data
          ? message + " The previously loaded game data snapshot remains available."
          : message,
      });
      this.#logger.error("Adventure Land game data load failed.", error, {
        previousVersion: previous.version,
        retainedPreviousData: this.#data !== undefined,
        retainedOrigin: previous.origin,
        cacheStatus: previous.cacheStatus,
      });
      return this.state();
    }
  }

  #restoreCacheOnce(): void {
    if (this.#cacheChecked || !this.#cache) return;
    this.#cacheChecked = true;

    let expectedVersion: number | undefined;
    try {
      expectedVersion = this.#expectedVersion?.();
      const result = this.#cache.load(expectedVersion);

      if (result.invalidEntries > 0) {
        this.#logger.warn("Invalid Adventure Land game data cache entries were ignored.", {
          invalidEntries: result.invalidEntries,
        });
      }
      if (result.staleEntries > 0) {
        this.#logger.info("Stale Adventure Land game data cache entries were ignored.", {
          staleEntries: result.staleEntries,
          expectedVersion,
        });
      }

      if (result.status !== "loaded" || !result.record) {
        this.#setState({
          ...this.#state,
          cacheStatus: result.status,
          cacheMessage: result.message,
        });
        return;
      }

      const record = result.record;
      const families = familyStates(record.data);
      this.#data = record.data;
      this.#setState({
        status: "loaded",
        version: record.version,
        loadedAt: this.#now().toISOString(),
        sourceUrl: record.sourceUrl,
        bytes: record.bytes,
        origin: "cache",
        cacheStatus: "loaded",
        cachedAt: record.cachedAt,
        cacheMessage: result.message,
        familyCount: families.length,
        loadedFamilyCount: families.filter((family) => family.loaded).length,
        families,
        message: "Adventure Land game data was restored from the local cache.",
      });
      this.#logger.info("Adventure Land game data restored from cache.", {
        version: record.version,
        cachedAt: record.cachedAt,
        invalidEntries: result.invalidEntries,
        staleEntries: result.staleEntries,
      });
    } catch (error) {
      this.#setState({
        ...this.#state,
        cacheStatus: "error",
        cacheMessage: "Local game data cache could not be read.",
      });
      this.#logger.error("Adventure Land game data cache read failed.", error, {
        expectedVersion,
      });
    }
  }

  #setState(state: AdventureLandGameDataState): void {
    this.#state = Object.freeze(state);
  }
}

function familyStates(data: AdventureLandGameData): readonly AdventureLandGameDataFamilyState[] {
  return allFamilies().map((name) => {
    const value = data[name];
    const loaded = isRecord(value);
    return Object.freeze({
      name,
      required: REQUIRED_GAME_DATA_FAMILIES.includes(name as (typeof REQUIRED_GAME_DATA_FAMILIES)[number]),
      loaded,
      count: loaded ? Object.keys(value).length : 0,
    });
  });
}

function emptyFamilyStates(): readonly AdventureLandGameDataFamilyState[] {
  return allFamilies().map((name) => Object.freeze({
    name,
    required: REQUIRED_GAME_DATA_FAMILIES.includes(name as (typeof REQUIRED_GAME_DATA_FAMILIES)[number]),
    loaded: false,
    count: 0,
  }));
}

function allFamilies(): readonly string[] {
  return [...REQUIRED_GAME_DATA_FAMILIES, ...OPTIONAL_GAME_DATA_FAMILIES];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
