import type { Logger } from "../logging/logger.ts";
import type { AdventureLandVersionSource } from "./version-source.ts";
import type { AdventureLandVersionStore, StoredAdventureLandVersion } from "./version-store.ts";

export type AdventureLandVersionStatus =
  | "idle"
  | "checking"
  | "current"
  | "changed"
  | "error";

export interface AdventureLandVersionState {
  readonly status: AdventureLandVersionStatus;
  readonly currentVersion?: number;
  readonly previousVersion?: number;
  readonly storedVersion?: number;
  readonly lastDeploy?: string;
  readonly checkedAt?: string;
  readonly sourceUrl?: string;
  readonly message?: string;
}

export interface AdventureLandVersionServiceOptions {
  readonly logger: Logger;
  readonly source: Pick<AdventureLandVersionSource, "fetchVersion">;
  readonly store: AdventureLandVersionStore;
  readonly now?: () => Date;
  readonly checkIntervalMs?: number;
}

export class AdventureLandVersionService {
  readonly #logger: Logger;
  readonly #source: Pick<AdventureLandVersionSource, "fetchVersion">;
  readonly #store: AdventureLandVersionStore;
  readonly #now: () => Date;
  readonly #checkIntervalMs: number;
  #state: AdventureLandVersionState;
  #checking?: Promise<AdventureLandVersionState>;
  #timer?: NodeJS.Timeout;

  constructor(options: AdventureLandVersionServiceOptions) {
    this.#logger = options.logger;
    this.#source = options.source;
    this.#store = options.store;
    this.#now = options.now ?? (() => new Date());
    this.#checkIntervalMs = options.checkIntervalMs ?? 6 * 60 * 60 * 1000;

    const stored = this.#store.load();
    this.#state = Object.freeze({
      status: "idle",
      storedVersion: stored?.version,
      currentVersion: stored?.version,
      lastDeploy: stored?.lastDeploy,
      message: stored
        ? "Waiting to verify the stored Adventure Land version online."
        : "Adventure Land version has not been checked yet.",
    });
  }

  state(): AdventureLandVersionState {
    return structuredClone(this.#state);
  }

  start(): void {
    if (this.#timer) return;
    void this.checkNow(false);
    this.#timer = setInterval(() => void this.checkNow(false), this.#checkIntervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  checkNow(manual = true): Promise<AdventureLandVersionState> {
    if (this.#checking) return this.#checking;
    this.#checking = this.#performCheck(manual).finally(() => {
      this.#checking = undefined;
    });
    return this.#checking;
  }

  async #performCheck(manual: boolean): Promise<AdventureLandVersionState> {
    const storedBefore = this.#store.load();

    this.#setState({
      ...this.#state,
      status: "checking",
      message: manual
        ? "Checking the Adventure Land game version…"
        : "Verifying the Adventure Land game version…",
    });

    if (manual) {
      this.#logger.info("Manual Adventure Land version check started.");
    }

    try {
      const remote = await this.#source.fetchVersion();
      const checkedAt = this.#now().toISOString();
      const changed = storedBefore !== undefined && storedBefore.version !== remote.version;

      const record: StoredAdventureLandVersion = Object.freeze({
        schemaVersion: 1,
        version: remote.version,
        lastDeploy: remote.lastDeploy,
        observedAt: checkedAt,
      });
      this.#store.save(record);

      if (changed) {
        this.#setState({
          status: "changed",
          currentVersion: remote.version,
          previousVersion: storedBefore.version,
          storedVersion: remote.version,
          lastDeploy: remote.lastDeploy,
          checkedAt,
          sourceUrl: remote.sourceUrl,
          message: "Adventure Land changed from version " + storedBefore.version + " to " + remote.version + ".",
        });
        this.#logger.warn("Adventure Land game version changed.", {
          previousVersion: storedBefore.version,
          currentVersion: remote.version,
          lastDeploy: remote.lastDeploy,
          sourceUrl: remote.sourceUrl,
        });
      } else {
        this.#setState({
          status: "current",
          currentVersion: remote.version,
          storedVersion: remote.version,
          lastDeploy: remote.lastDeploy,
          checkedAt,
          sourceUrl: remote.sourceUrl,
          message: storedBefore
            ? "Stored Adventure Land version matches the current online version."
            : "Adventure Land version detected and stored locally.",
        });
        this.#logger.info("Adventure Land game version verified.", {
          version: remote.version,
          lastDeploy: remote.lastDeploy,
          sourceUrl: remote.sourceUrl,
          firstObservation: storedBefore === undefined,
        });
      }

      return this.state();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#setState({
        ...this.#state,
        status: "error",
        storedVersion: storedBefore?.version,
        currentVersion: storedBefore?.version,
        lastDeploy: storedBefore?.lastDeploy,
        checkedAt: this.#now().toISOString(),
        message,
      });
      this.#logger.error("Adventure Land version check failed.", error, {
        storedVersion: storedBefore?.version,
      });
      return this.state();
    }
  }

  #setState(state: AdventureLandVersionState): void {
    this.#state = Object.freeze(state);
  }
}
