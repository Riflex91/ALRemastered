import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { Logger } from "../logging/logger.ts";
import type {
  AdventureLandCharacterConnectionState,
  AdventureLandCharacterService,
} from "./service.ts";

export const ADVENTURE_LAND_MAX_CONCURRENT_CHARACTERS = 4;

export type MultiCharacterSessionRole = "primary" | "managed";

export interface MultiCharacterSessionSnapshot {
  readonly role: MultiCharacterSessionRole;
  readonly characterId: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly serverRegion?: string;
  readonly serverName?: string;
  readonly status: AdventureLandCharacterConnectionState["status"];
  readonly connectedAt?: string;
  readonly heartbeatSequence?: number;
  readonly lastHeartbeatAt?: string;
  readonly errorCode?: string;
  readonly message: string;
}

export interface MultiCharacterSessionManagerErrorState {
  readonly code: string;
  readonly message: string;
  readonly characterId?: string;
  readonly serverKey?: string;
  readonly causeCode?: string;
  readonly at: string;
}

export interface MultiCharacterSessionManagerState {
  readonly status: "ready" | "degraded";
  readonly sessionLimit: number;
  readonly activeSessionCount: number;
  readonly managedSessionCount: number;
  readonly availableSlots: number;
  readonly sessions: readonly MultiCharacterSessionSnapshot[];
  readonly sharedStaticData: Readonly<{
    readonly mode: "shared";
    readonly gameDataVersion?: number;
  }>;
  readonly lastError?: MultiCharacterSessionManagerErrorState;
  readonly message: string;
}

type CharacterSessionService = Pick<
  AdventureLandCharacterService,
  "state" | "start" | "stop"
>;

export interface MultiCharacterSessionManagerOptions {
  readonly logger: Logger;
  readonly primary: Pick<AdventureLandCharacterService, "state">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly createSession: (serverKey: string) => CharacterSessionService;
  readonly maxSessions?: number;
  readonly sharedGameDataVersion?: () => number | undefined;
  readonly now?: () => Date;
}

export class MultiCharacterSessionManagerError extends Error {
  readonly code: string;
  readonly causeCode?: string;

  constructor(message: string, code: string, causeCode?: string) {
    super(message);
    this.name = "MultiCharacterSessionManagerError";
    this.code = code;
    this.causeCode = causeCode;
  }
}

interface ManagedSessionRecord {
  readonly characterId: string;
  readonly serverKey: string;
  readonly service: CharacterSessionService;
}

export class MultiCharacterSessionManager {
  readonly #logger: Logger;
  readonly #primary: MultiCharacterSessionManagerOptions["primary"];
  readonly #selection: MultiCharacterSessionManagerOptions["selection"];
  readonly #createSession: MultiCharacterSessionManagerOptions["createSession"];
  readonly #sessionLimit: number;
  readonly #sharedGameDataVersion?: () => number | undefined;
  readonly #now: () => Date;
  readonly #managed = new Map<string, ManagedSessionRecord>();
  #lastError?: MultiCharacterSessionManagerErrorState;

  constructor(options: MultiCharacterSessionManagerOptions) {
    this.#logger = options.logger;
    this.#primary = options.primary;
    this.#selection = options.selection;
    this.#createSession = options.createSession;
    this.#sessionLimit = Math.min(
      ADVENTURE_LAND_MAX_CONCURRENT_CHARACTERS,
      Math.max(1, Math.floor(options.maxSessions ?? ADVENTURE_LAND_MAX_CONCURRENT_CHARACTERS)),
    );
    this.#sharedGameDataVersion = options.sharedGameDataVersion;
    this.#now = options.now ?? (() => new Date());
  }

  state(): MultiCharacterSessionManagerState {
    const sessions = this.#sessionSnapshots();
    const activeSessionCount = sessions.filter((session) =>
      isActiveStatus(session.status)
    ).length;
    const primary = this.#primary.state();
    const degraded = primary.status === "error" ||
      sessions.some((session) => session.status === "error");

    return structuredClone(Object.freeze({
      status: degraded ? "degraded" as const : "ready" as const,
      sessionLimit: this.#sessionLimit,
      activeSessionCount,
      managedSessionCount: this.#managed.size,
      availableSlots: Math.max(0, this.#sessionLimit - activeSessionCount),
      sessions: Object.freeze(sessions),
      sharedStaticData: Object.freeze({
        mode: "shared" as const,
        gameDataVersion: this.#sharedGameDataVersion?.(),
      }),
      lastError: this.#lastError,
      message: activeSessionCount >= this.#sessionLimit
        ? `Character session limit reached (${activeSessionCount}/${this.#sessionLimit}).`
        : `Multi-character session manager ready. ${activeSessionCount}/${this.#sessionLimit} active sessions.`,
    }));
  }

  async start(
    characterId: string,
    serverKey?: string,
  ): Promise<MultiCharacterSessionManagerState> {
    const id = characterId.trim();
    if (!id) {
      throw new MultiCharacterSessionManagerError(
        "Character selection is required.",
        "SESSION_CHARACTER_REQUIRED",
      );
    }

    const selection = this.#selection.state();
    if (selection.status !== "ready") {
      throw new MultiCharacterSessionManagerError(
        "Characters and servers must be loaded before starting another session.",
        "SESSION_SELECTION_NOT_READY",
      );
    }

    const character = selection.characters.find((candidate) => candidate.id === id);
    if (!character) {
      throw new MultiCharacterSessionManagerError(
        "The selected Adventure Land character is not available.",
        "SESSION_CHARACTER_NOT_AVAILABLE",
      );
    }

    const primary = this.#primary.state();
    if (primary.characterId === id && isActiveStatus(primary.status)) {
      throw new MultiCharacterSessionManagerError(
        "That Character is already active as the primary session.",
        "SESSION_CHARACTER_ALREADY_ACTIVE",
      );
    }
    if (this.#managed.has(id)) {
      throw new MultiCharacterSessionManagerError(
        "That Character already has a managed session.",
        "SESSION_CHARACTER_ALREADY_ACTIVE",
      );
    }
    if (character.online) {
      throw new MultiCharacterSessionManagerError(
        "Adventure Land reports that Character as already online.",
        "SESSION_CHARACTER_ALREADY_ONLINE",
      );
    }

    const key = serverKey?.trim() || selection.selectedServerKey?.trim();
    if (!key) {
      throw new MultiCharacterSessionManagerError(
        "Select an Adventure Land server before starting another Character.",
        "SESSION_SERVER_REQUIRED",
      );
    }
    if (!selection.servers.some((candidate) => candidate.key === key)) {
      throw new MultiCharacterSessionManagerError(
        "The selected Adventure Land server is not available.",
        "SESSION_SERVER_NOT_AVAILABLE",
      );
    }

    if (this.#activeSessionCount() >= this.#sessionLimit) {
      throw new MultiCharacterSessionManagerError(
        `Adventure Land Character session limit reached (${this.#sessionLimit}).`,
        "SESSION_LIMIT_REACHED",
      );
    }

    const service = this.#createSession(key);
    const record: ManagedSessionRecord = Object.freeze({
      characterId: id,
      serverKey: key,
      service,
    });
    this.#managed.set(id, record);
    this.#logger.info("Managed Adventure Land Character session start requested.", {
      characterId: id,
      characterName: character.name,
      serverKey: key,
      activeSessionCount: this.#activeSessionCount(),
      sessionLimit: this.#sessionLimit,
      gameplayMutation: false,
    });

    try {
      const result = await service.start(id);
      if (result.status !== "connected") {
        const error = new MultiCharacterSessionManagerError(
          result.message || "Adventure Land Character session could not be connected.",
          "SESSION_CONNECT_FAILED",
          result.errorCode,
        );
        this.#rememberError(error, id, key);
        this.#logger.warn("Managed Adventure Land Character session failed independently.", {
          characterId: id,
          characterName: character.name,
          serverKey: key,
          errorCode: error.code,
          causeCode: error.causeCode,
          primaryStatus: this.#primary.state().status,
          gameplayMutation: false,
        });
        throw error;
      }

      this.#logger.info("Managed Adventure Land Character session connected.", {
        characterId: result.characterId,
        characterName: result.characterName,
        serverKey: result.serverKey,
        activeSessionCount: this.#activeSessionCount(),
        sessionLimit: this.#sessionLimit,
        sharedStaticData: true,
        gameplayMutation: false,
      });
      return this.state();
    } catch (error) {
      this.#managed.delete(id);
      if (error instanceof MultiCharacterSessionManagerError) throw error;
      const causeCode = error &&
          typeof error === "object" &&
          "code" in error &&
          typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
      const managerError = new MultiCharacterSessionManagerError(
        error instanceof Error
          ? error.message
          : "Adventure Land Character session could not be connected.",
        "SESSION_CONNECT_FAILED",
        causeCode,
      );
      this.#rememberError(managerError, id, key);
      this.#logger.warn("Managed Adventure Land Character session failed independently.", {
        characterId: id,
        characterName: character.name,
        serverKey: key,
        errorCode: managerError.code,
        causeCode: managerError.causeCode,
        primaryStatus: this.#primary.state().status,
        gameplayMutation: false,
      });
      throw managerError;
    }
  }

  async stop(
    characterId: string,
    reason = "dashboard",
  ): Promise<MultiCharacterSessionManagerState> {
    const id = characterId.trim();
    const record = this.#managed.get(id);
    if (!record) {
      const primary = this.#primary.state();
      if (primary.characterId === id && isActiveStatus(primary.status)) {
        throw new MultiCharacterSessionManagerError(
          "The primary Character session is controlled by the existing primary Character API.",
          "SESSION_PRIMARY_NOT_MANAGED",
        );
      }
      throw new MultiCharacterSessionManagerError(
        "No managed Character session exists for that Character.",
        "SESSION_NOT_FOUND",
      );
    }

    try {
      await record.service.stop(reason);
      this.#logger.info("Managed Adventure Land Character session stopped.", {
        characterId: id,
        serverKey: record.serverKey,
        reason,
        gameplayMutation: false,
      });
    } catch (error) {
      const managerError = new MultiCharacterSessionManagerError(
        error instanceof Error ? error.message : String(error),
        "SESSION_STOP_FAILED",
      );
      this.#rememberError(managerError, id, record.serverKey);
      this.#logger.warn("Managed Adventure Land Character session stop failed independently.", {
        characterId: id,
        serverKey: record.serverKey,
        reason,
        error: managerError.message,
        gameplayMutation: false,
      });
      throw managerError;
    } finally {
      this.#managed.delete(id);
    }
    return this.state();
  }

  async stopAll(reason = "shutdown"): Promise<MultiCharacterSessionManagerState> {
    const records = [...this.#managed.values()];
    for (const record of records) {
      try {
        await record.service.stop(reason);
      } catch (error) {
        const managerError = new MultiCharacterSessionManagerError(
          error instanceof Error ? error.message : String(error),
          "SESSION_STOP_FAILED",
        );
        this.#rememberError(managerError, record.characterId, record.serverKey);
        this.#logger.warn("Managed Adventure Land Character session stop failed during cleanup.", {
          characterId: record.characterId,
          serverKey: record.serverKey,
          reason,
          error: managerError.message,
          gameplayMutation: false,
        });
      } finally {
        this.#managed.delete(record.characterId);
      }
    }
    return this.state();
  }

  #activeSessionCount(): number {
    return this.#sessionSnapshots().filter((session) =>
      isActiveStatus(session.status)
    ).length;
  }

  #sessionSnapshots(): MultiCharacterSessionSnapshot[] {
    const snapshots: MultiCharacterSessionSnapshot[] = [];
    const primary = this.#primary.state();
    if (primary.characterId) {
      snapshots.push(snapshotFromState("primary", primary));
    }
    for (const record of this.#managed.values()) {
      const state = record.service.state();
      snapshots.push(snapshotFromState("managed", {
        ...state,
        characterId: state.characterId ?? record.characterId,
        serverKey: state.serverKey ?? record.serverKey,
      }));
    }
    return snapshots.sort((left, right) => {
      if (left.role !== right.role) return left.role === "primary" ? -1 : 1;
      return left.characterId.localeCompare(right.characterId);
    });
  }

  #rememberError(
    error: MultiCharacterSessionManagerError,
    characterId?: string,
    serverKey?: string,
  ): void {
    this.#lastError = Object.freeze({
      code: error.code,
      message: error.message,
      characterId,
      serverKey,
      causeCode: error.causeCode,
      at: this.#now().toISOString(),
    });
  }
}

function snapshotFromState(
  role: MultiCharacterSessionRole,
  state: AdventureLandCharacterConnectionState,
): MultiCharacterSessionSnapshot {
  return Object.freeze({
    role,
    characterId: state.characterId ?? "",
    characterName: state.characterName,
    serverKey: state.serverKey,
    serverRegion: state.serverRegion,
    serverName: state.serverName,
    status: state.status,
    connectedAt: state.connectedAt,
    heartbeatSequence: state.heartbeatSequence,
    lastHeartbeatAt: state.lastHeartbeatAt,
    errorCode: state.errorCode,
    message: state.message,
  });
}

function isActiveStatus(
  status: AdventureLandCharacterConnectionState["status"],
): boolean {
  return status === "connecting" ||
    status === "connected" ||
    status === "reconnecting" ||
    status === "disconnecting";
}
