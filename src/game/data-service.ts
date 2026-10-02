import type { Logger } from "../logging/logger.ts";
import {
  OPTIONAL_GAME_DATA_FAMILIES,
  REQUIRED_GAME_DATA_FAMILIES,
  type AdventureLandGameData,
  type AdventureLandGameDataSource,
} from "./data-source.ts";

export type AdventureLandGameDataStatus = "idle" | "loading" | "loaded" | "error";

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
  readonly familyCount: number;
  readonly loadedFamilyCount: number;
  readonly families: readonly AdventureLandGameDataFamilyState[];
  readonly message?: string;
}

export interface AdventureLandGameDataServiceOptions {
  readonly logger: Logger;
  readonly source: Pick<AdventureLandGameDataSource, "fetchData">;
  readonly now?: () => Date;
  readonly reloadIntervalMs?: number;
}

export class AdventureLandGameDataService {
  readonly #logger: Logger;
  readonly #source: Pick<AdventureLandGameDataSource, "fetchData">;
  readonly #now: () => Date;
  readonly #reloadIntervalMs: number;
  #state: AdventureLandGameDataState;
  #data?: AdventureLandGameData;
  #loading?: Promise<AdventureLandGameDataState>;
  #timer?: NodeJS.Timeout;

  constructor(options: AdventureLandGameDataServiceOptions) {
    this.#logger = options.logger;
    this.#source = options.source;
    this.#now = options.now ?? (() => new Date());
    this.#reloadIntervalMs = options.reloadIntervalMs ?? 6 * 60 * 60 * 1000;
    this.#state = Object.freeze({
      status: "idle",
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

      this.#data = snapshot.data;
      this.#setState({
        status: "loaded",
        version: snapshot.data.version,
        loadedAt,
        sourceUrl: snapshot.sourceUrl,
        bytes: snapshot.bytes,
        familyCount: families.length,
        loadedFamilyCount: families.filter((family) => family.loaded).length,
        families,
        message: "Adventure Land game data is loaded and available.",
      });

      this.#logger.info("Adventure Land game data loaded.", {
        version: snapshot.data.version,
        sourceUrl: snapshot.sourceUrl,
        bytes: snapshot.bytes,
        families: Object.fromEntries(families.map((family) => [family.name, family.count])),
      });
      return this.state();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#setState({
        ...previous,
        status: "error",
        message,
      });
      this.#logger.error("Adventure Land game data load failed.", error, {
        previousVersion: previous.version,
        retainedPreviousData: this.#data !== undefined,
      });
      return this.state();
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
