import type { Logger } from "../logging/logger.ts";
import type { AdventureLandAccountSession } from "./source.ts";
import {
  AdventureLandSelectionError,
  type AdventureLandCharacterSummary,
  type AdventureLandSelectionSnapshot,
  type AdventureLandSelectionSource,
  type AdventureLandServerSummary,
} from "./selection-source.ts";

export type AdventureLandSelectionStatus =
  | "disconnected"
  | "loading"
  | "ready"
  | "error";

export interface AdventureLandSelectionState {
  readonly status: AdventureLandSelectionStatus;
  readonly characters: readonly AdventureLandCharacterSummary[];
  readonly servers: readonly AdventureLandServerSummary[];
  readonly selectedServerKey?: string;
  readonly loadedAt?: string;
  readonly message: string;
  readonly errorCode?: string;
}

export interface AdventureLandSelectionServiceOptions {
  readonly logger: Logger;
  readonly source: Pick<AdventureLandSelectionSource, "load">;
  readonly session: () => AdventureLandAccountSession | undefined;
  readonly now?: () => Date;
}

export class AdventureLandSelectionService {
  readonly #logger: Logger;
  readonly #source: Pick<AdventureLandSelectionSource, "load">;
  readonly #session: () => AdventureLandAccountSession | undefined;
  readonly #now: () => Date;
  #state: AdventureLandSelectionState;
  #loading?: Promise<AdventureLandSelectionState>;

  constructor(options: AdventureLandSelectionServiceOptions) {
    this.#logger = options.logger;
    this.#source = options.source;
    this.#session = options.session;
    this.#now = options.now ?? (() => new Date());
    this.#state = disconnectedState();
  }

  state(): AdventureLandSelectionState {
    return structuredClone(this.#state);
  }

  refresh(): Promise<AdventureLandSelectionState> {
    if (this.#loading) return this.#loading;
    this.#loading = this.#performRefresh().finally(() => {
      this.#loading = undefined;
    });
    return this.#loading;
  }

  clear(): AdventureLandSelectionState {
    this.#setState(disconnectedState());
    return this.state();
  }

  selectServer(serverKey: string): AdventureLandSelectionState {
    const key = serverKey.trim();
    if (this.#state.status !== "ready") {
      throw new Error("Characters and servers must be loaded before selecting a server.");
    }

    const server = this.#state.servers.find((candidate) => candidate.key === key);
    if (!server) throw new Error("The selected Adventure Land server is not available.");

    this.#setState({
      ...this.#state,
      selectedServerKey: server.key,
      message: `Selected ${server.region} ${server.name}. No character has been started.`,
    });
    this.#logger.info("Adventure Land server selected.", {
      serverKey: server.key,
      region: server.region,
      name: server.name,
      characterStarted: false,
    });
    return this.state();
  }

  async #performRefresh(): Promise<AdventureLandSelectionState> {
    const session = this.#session();
    if (!session) {
      this.#setState(disconnectedState());
      return this.state();
    }

    const previousSelected = this.#state.selectedServerKey;
    this.#setState({
      ...this.#state,
      status: "loading",
      message: "Loading Adventure Land characters and servers…",
      errorCode: undefined,
    });

    try {
      const snapshot: AdventureLandSelectionSnapshot = await this.#source.load(session);
      const selectedServerKey = snapshot.servers.some(
        (server) => server.key === previousSelected,
      )
        ? previousSelected
        : undefined;
      const loadedAt = this.#now().toISOString();
      this.#setState({
        status: "ready",
        characters: snapshot.characters,
        servers: snapshot.servers,
        selectedServerKey,
        loadedAt,
        message: `Loaded ${snapshot.characters.length} characters and ${snapshot.servers.length} servers.`,
      });
      this.#logger.info("Adventure Land characters and servers loaded.", {
        characters: snapshot.characters.length,
        servers: snapshot.servers.length,
        loadedAt,
      });
      return this.state();
    } catch (error) {
      const selectionError = error instanceof AdventureLandSelectionError
        ? error
        : new AdventureLandSelectionError(
            "Adventure Land characters and servers could not be loaded.",
            "unknown_error",
          );
      this.#setState({
        status: "error",
        characters: [],
        servers: [],
        message: selectionError.message,
        errorCode: selectionError.code,
      });
      this.#logger.error(
        "Adventure Land characters and servers load failed.",
        selectionError,
        { errorCode: selectionError.code },
      );
      return this.state();
    }
  }

  #setState(state: AdventureLandSelectionState): void {
    this.#state = Object.freeze({
      ...state,
      characters: Object.freeze([...state.characters]),
      servers: Object.freeze([...state.servers]),
    });
  }
}

function disconnectedState(): AdventureLandSelectionState {
  return {
    status: "disconnected",
    characters: [],
    servers: [],
    message: "Connect an Adventure Land account to load characters and servers.",
  };
}
