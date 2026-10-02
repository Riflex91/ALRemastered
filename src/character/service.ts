import type { Logger } from "../logging/logger.ts";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { AdventureLandAccountSession } from "../account/source.ts";
import {
  AdventureLandCharacterTransportError,
  type AdventureLandCharacterConnection,
  type AdventureLandCharacterTransport,
  type AdventureLandConnectedCharacter,
} from "./transport.ts";

export type AdventureLandCharacterConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export interface AdventureLandCharacterConnectionState {
  readonly status: AdventureLandCharacterConnectionStatus;
  readonly character?: AdventureLandConnectedCharacter;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly serverRegion?: string;
  readonly serverName?: string;
  readonly connectedAt?: string;
  readonly message: string;
  readonly errorCode?: string;
}

export interface AdventureLandCharacterServiceOptions {
  readonly logger: Logger;
  readonly transport: Pick<AdventureLandCharacterTransport, "connect">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly session: () => AdventureLandAccountSession | undefined;
  readonly now?: () => Date;
}

export class AdventureLandCharacterService {
  readonly #logger: Logger;
  readonly #transport: Pick<AdventureLandCharacterTransport, "connect">;
  readonly #selection: Pick<AdventureLandSelectionService, "state">;
  readonly #session: () => AdventureLandAccountSession | undefined;
  readonly #now: () => Date;
  #state: AdventureLandCharacterConnectionState = disconnectedState();
  #connection?: AdventureLandCharacterConnection;
  #connecting?: Promise<AdventureLandCharacterConnectionState>;
  #connectAbort?: AbortController;

  constructor(options: AdventureLandCharacterServiceOptions) {
    this.#logger = options.logger;
    this.#transport = options.transport;
    this.#selection = options.selection;
    this.#session = options.session;
    this.#now = options.now ?? (() => new Date());
  }

  state(): AdventureLandCharacterConnectionState {
    return structuredClone(this.#state);
  }

  start(characterId: string): Promise<AdventureLandCharacterConnectionState> {
    if (this.#connection || this.#connecting) {
      throw new Error("A character connection is already active or being started.");
    }

    const id = characterId.trim();
    if (!id) throw new Error("Character selection is required.");

    const session = this.#session();
    if (!session) throw new Error("Connect an Adventure Land account first.");

    const selection = this.#selection.state();
    if (selection.status !== "ready") {
      throw new Error("Characters and servers must be loaded before starting a character.");
    }
    if (!selection.selectedServerKey) {
      throw new Error("Select an Adventure Land server before starting a character.");
    }

    const character = selection.characters.find((candidate) => candidate.id === id);
    if (!character) throw new Error("The selected Adventure Land character is not available.");
    const server = selection.servers.find(
      (candidate) => candidate.key === selection.selectedServerKey,
    );
    if (!server) throw new Error("The selected Adventure Land server is not available.");

    const controller = new AbortController();
    this.#connectAbort = controller;
    this.#setState({
      status: "connecting",
      characterId: character.id,
      characterName: character.name,
      serverKey: server.key,
      serverRegion: server.region,
      serverName: server.name,
      message: "Connecting " + character.name + " headlessly to " +
        server.region + " " + server.name + "…",
    });
    this.#logger.info("Adventure Land headless character connection started.", {
      characterId: character.id,
      characterName: character.name,
      serverKey: server.key,
      region: server.region,
      name: server.name,
      automation: false,
    });

    this.#connecting = this.#transport.connect({
      session,
      character,
      server,
    }, controller.signal).then((connection) => {
      this.#connection = connection;
      this.#connectAbort = undefined;
      connection.onUnexpectedClose((reason) => {
        if (this.#connection !== connection) return;
        this.#connection = undefined;
        this.#setState({
          status: "error",
          character: connection.character,
          characterId: connection.character.id,
          characterName: connection.character.name,
          serverKey: server.key,
          serverRegion: server.region,
          serverName: server.name,
          message: reason
            ? "Adventure Land closed the character connection (" + reason + ")."
            : "Adventure Land character connection closed unexpectedly.",
          errorCode: "socket_closed",
        });
        this.#logger.warn("Adventure Land headless character connection closed unexpectedly.", {
          characterId: connection.character.id,
          characterName: connection.character.name,
          serverKey: server.key,
          reason,
          automation: false,
        });
      });

      const connectedAt = this.#now().toISOString();
      this.#setState({
        status: "connected",
        character: connection.character,
        characterId: connection.character.id,
        characterName: connection.character.name,
        serverKey: server.key,
        serverRegion: server.region,
        serverName: server.name,
        connectedAt,
        message: connection.character.name +
          " is connected headlessly. No automation is running.",
      });
      this.#logger.info("Adventure Land character connected headlessly.", {
        characterId: connection.character.id,
        characterName: connection.character.name,
        characterType: connection.character.type,
        level: connection.character.level,
        serverKey: server.key,
        region: server.region,
        name: server.name,
        map: connection.character.map,
        x: connection.character.x,
        y: connection.character.y,
        connectedAt,
        automation: false,
      });
      return this.state();
    }).catch((error) => {
      this.#connectAbort = undefined;
      const transportError = error instanceof AdventureLandCharacterTransportError
        ? error
        : new AdventureLandCharacterTransportError(
            "Adventure Land headless character connection failed.",
            "unknown_error",
          );

      if (transportError.code === "aborted" && this.#state.status === "disconnecting") {
        return this.state();
      }

      this.#setState({
        status: "error",
        characterId: character.id,
        characterName: character.name,
        serverKey: server.key,
        serverRegion: server.region,
        serverName: server.name,
        message: transportError.message,
        errorCode: transportError.code,
      });
      this.#logger.error(
        "Adventure Land headless character connection failed.",
        transportError,
        {
          characterId: character.id,
          characterName: character.name,
          serverKey: server.key,
          automation: false,
        },
      );
      return this.state();
    }).finally(() => {
      this.#connecting = undefined;
    });

    return this.#connecting;
  }

  async stop(reason = "user"): Promise<AdventureLandCharacterConnectionState> {
    const hadConnection = Boolean(this.#connection || this.#connecting);
    const characterId = this.#state.characterId;
    const characterName = this.#state.characterName;
    const serverKey = this.#state.serverKey;

    if (!hadConnection) {
      this.#setState(disconnectedState());
      return this.state();
    }

    this.#setState({
      ...this.#state,
      status: "disconnecting",
      message: "Disconnecting the headless Adventure Land character…",
      errorCode: undefined,
    });

    if (this.#connectAbort) {
      this.#connectAbort.abort();
      try {
        await this.#connecting;
      } catch {}
    }

    const connection = this.#connection;
    this.#connection = undefined;
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        this.#logger.warn("Adventure Land character transport did not close cleanly.", {
          characterId,
          characterName,
          serverKey,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.#setState(disconnectedState());
    this.#logger.info("Adventure Land headless character disconnected.", {
      characterId,
      characterName,
      serverKey,
      reason,
      controlled: true,
      automation: false,
    });
    return this.state();
  }

  #setState(state: AdventureLandCharacterConnectionState): void {
    this.#state = Object.freeze({
      ...state,
      character: state.character ? Object.freeze({ ...state.character }) : undefined,
    });
  }
}

function disconnectedState(): AdventureLandCharacterConnectionState {
  return {
    status: "disconnected",
    message: "No headless Adventure Land character is connected.",
  };
}
