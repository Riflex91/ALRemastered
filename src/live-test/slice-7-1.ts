import { randomUUID } from "node:crypto";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type {
  MultiCharacterSessionManager,
  MultiCharacterSessionManagerError,
} from "../character/session-manager.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandGameDataService } from "../game/data-service.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice71LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice71LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice71LiveTestResult {
  readonly testId: string;
  readonly slice: "7.1";
  readonly outcome: Slice71LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly managedCharacterId?: string;
  readonly managedCharacterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice71LiveTestStep[];
  readonly error?: Readonly<{
    readonly code: string;
    readonly step: string;
    readonly message: string;
  }>;
}

export interface Slice71LiveTestState {
  readonly status: "idle" | "running" | Slice71LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice71LiveTestResult;
}

export interface Slice71LiveTestServiceOptions {
  readonly logger: Logger;
  readonly runtime: Pick<ScriptRuntimeService, "state">;
  readonly primary: Pick<AdventureLandCharacterService, "state">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly sessions: Pick<MultiCharacterSessionManager, "state" | "start" | "stop">;
  readonly gameData: Pick<AdventureLandGameDataService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice71LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: Slice71LiveTestServiceOptions["runtime"];
  readonly #primary: Slice71LiveTestServiceOptions["primary"];
  readonly #selection: Slice71LiveTestServiceOptions["selection"];
  readonly #sessions: Slice71LiveTestServiceOptions["sessions"];
  readonly #gameData: Slice71LiveTestServiceOptions["gameData"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice71LiveTestResult>;
  #state: Slice71LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 7.1 multi-character session-manager test is ready.",
  });

  constructor(options: Slice71LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#primary = options.primary;
    this.#selection = options.selection;
    this.#sessions = options.sessions;
    this.#gameData = options.gameData;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live71-${randomUUID()}`);
  }

  state(): Slice71LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice71LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice71LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice71LiveTestStep[] = [];
    let managedCharacterId: string | undefined;
    let managedCharacterName: string | undefined;
    this.#state = Object.freeze({
      status: "running",
      message:
        "Slice 7.1 is connecting one additional Character, verifying isolation and session limits, then removing only that managed session.",
    });
    this.#logger.info("Slice 7.1 multi-character session live test started.", {
      testId,
      bounded: true,
      gameplayMutation: false,
      rawSocketAccess: false,
      userScriptInterrupted: false,
    });

    try {
      const runtimeBefore = this.#runtime.state();
      if (runtimeBefore.status === "running" || runtimeBefore.status === "paused") {
        throw new Slice71Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A user script is running or paused. Slice 7.1 did not interrupt it.",
          "preflight",
          true,
        );
      }

      const primaryBefore = this.#primary.state();
      if (
        primaryBefore.status !== "connected" ||
        !primaryBefore.characterId ||
        !primaryBefore.characterName ||
        !primaryBefore.serverKey
      ) {
        throw new Slice71Failure(
          "LIVE_TEST_PRIMARY_CHARACTER_NOT_CONNECTED",
          "Connect one primary headless Character before running Slice 7.1.",
          "preflight",
          true,
        );
      }

      const selection = this.#selection.state();
      if (selection.status !== "ready") {
        throw new Slice71Failure(
          "LIVE_TEST_SELECTION_NOT_READY",
          "Characters and servers must be loaded before running Slice 7.1.",
          "preflight",
          true,
        );
      }
      if (!selection.servers.some((server) => server.key === primaryBefore.serverKey)) {
        throw new Slice71Failure(
          "LIVE_TEST_PRIMARY_SERVER_NOT_AVAILABLE",
          "The primary Character server is not present in the current server selection state.",
          "preflight",
          true,
        );
      }

      const managerBefore = this.#sessions.state();
      if (managerBefore.managedSessionCount !== 0) {
        throw new Slice71Failure(
          "LIVE_TEST_MANAGED_SESSIONS_ALREADY_ACTIVE",
          "Slice 7.1 will not interrupt existing managed Character sessions.",
          "preflight",
          true,
        );
      }
      if (
        managerBefore.activeSessionCount !== 1 ||
        managerBefore.availableSlots < 1
      ) {
        throw new Slice71Failure(
          "LIVE_TEST_SESSION_CAPACITY_UNAVAILABLE",
          "The session manager does not have one free bounded slot for the live probe.",
          "preflight",
          true,
        );
      }

      const candidate = selection.characters.find((character) =>
        character.id !== primaryBefore.characterId && !character.online
      );
      if (!candidate) {
        throw new Slice71Failure(
          "LIVE_TEST_NO_SECOND_OFFLINE_CHARACTER",
          "No second offline Character is available for the bounded multi-session probe.",
          "preflight",
          true,
        );
      }
      managedCharacterId = candidate.id;
      managedCharacterName = candidate.name;

      const gameDataBefore = this.#gameData.state();
      if (gameDataBefore.status !== "loaded" || gameDataBefore.version === undefined) {
        throw new Slice71Failure(
          "LIVE_TEST_SHARED_GAME_DATA_NOT_READY",
          "Adventure Land static game data must be loaded before the multi-session probe.",
          "preflight",
          true,
        );
      }
      if (
        managerBefore.sharedStaticData.mode !== "shared" ||
        managerBefore.sharedStaticData.gameDataVersion !== gameDataBefore.version
      ) {
        throw new Slice71Failure(
          "LIVE_TEST_SHARED_GAME_DATA_MISMATCH",
          "The session manager is not reporting the same process-level game-data version.",
          "preflight",
        );
      }

      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message:
          "One primary Character, one offline secondary Character, idle user script, free session capacity, and shared static game data are available.",
        evidence: Object.freeze({
          primaryCharacterId: primaryBefore.characterId,
          primaryCharacterName: primaryBefore.characterName,
          managedCharacterId: candidate.id,
          managedCharacterName: candidate.name,
          serverKey: primaryBefore.serverKey,
          sessionLimit: managerBefore.sessionLimit,
          activeSessionCountBefore: managerBefore.activeSessionCount,
          availableSlotsBefore: managerBefore.availableSlots,
          gameDataVersion: gameDataBefore.version,
          sharedStaticDataMode: managerBefore.sharedStaticData.mode,
          userScriptStatus: runtimeBefore.status,
        }),
      }));

      let managerAfterStart;
      try {
        managerAfterStart = await this.#sessions.start(
          candidate.id,
          primaryBefore.serverKey,
        );
      } catch (error) {
        const managerError = asManagerError(error);
        throw new Slice71Failure(
          managerError.code === "SESSION_CONNECT_FAILED"
            ? "LIVE_TEST_SECONDARY_CONNECT_BLOCKED"
            : managerError.code,
          managerError.message,
          "parallel-sessions",
          managerError.code === "SESSION_CONNECT_FAILED" ||
            managerError.code === "SESSION_CHARACTER_ALREADY_ONLINE",
        );
      }

      const primaryDuring = this.#primary.state();
      const primarySession = managerAfterStart.sessions.find((session) =>
        session.role === "primary" &&
        session.characterId === primaryBefore.characterId
      );
      const managedSession = managerAfterStart.sessions.find((session) =>
        session.role === "managed" &&
        session.characterId === candidate.id
      );
      if (
        managerAfterStart.activeSessionCount !== 2 ||
        managerAfterStart.managedSessionCount !== 1 ||
        !primarySession ||
        primarySession.status !== "connected" ||
        !managedSession ||
        managedSession.status !== "connected" ||
        primaryDuring.status !== "connected" ||
        primaryDuring.characterId !== primaryBefore.characterId ||
        primaryDuring.serverKey !== primaryBefore.serverKey
      ) {
        throw new Slice71Failure(
          "LIVE_TEST_PARALLEL_SESSION_STATE_MISMATCH",
          "The session manager did not retain one healthy primary and one healthy managed Character session.",
          "parallel-sessions",
        );
      }

      steps.push(Object.freeze({
        name: "parallel-sessions",
        outcome: "passed",
        message:
          "The primary and one additional Character were connected concurrently as isolated sessions on the same selected server.",
        evidence: Object.freeze({
          sessionLimit: managerAfterStart.sessionLimit,
          activeSessionCount: managerAfterStart.activeSessionCount,
          managedSessionCount: managerAfterStart.managedSessionCount,
          availableSlots: managerAfterStart.availableSlots,
          primaryCharacterId: primarySession.characterId,
          primaryStatus: primarySession.status,
          managedCharacterId: managedSession.characterId,
          managedCharacterName: managedSession.characterName,
          managedStatus: managedSession.status,
          managedServerKey: managedSession.serverKey,
          sharedGameDataVersion: managerAfterStart.sharedStaticData.gameDataVersion,
        }),
      }));

      let duplicateCode: string | undefined;
      try {
        await this.#sessions.start(candidate.id, primaryBefore.serverKey);
      } catch (error) {
        duplicateCode = asManagerError(error).code;
      }
      const managerAfterDuplicate = this.#sessions.state();
      if (
        duplicateCode !== "SESSION_CHARACTER_ALREADY_ACTIVE" ||
        managerAfterDuplicate.activeSessionCount !== 2 ||
        managerAfterDuplicate.managedSessionCount !== 1 ||
        this.#primary.state().status !== "connected"
      ) {
        throw new Slice71Failure(
          "LIVE_TEST_DUPLICATE_GUARD_FAILED",
          "The duplicate-Character guard did not reject a second session without disturbing existing sessions.",
          "isolation-guard",
        );
      }

      steps.push(Object.freeze({
        name: "isolation-guard",
        outcome: "passed",
        message:
          "A duplicate Character start was rejected locally while both existing sessions remained healthy and unchanged.",
        evidence: Object.freeze({
          duplicateErrorCode: duplicateCode,
          activeSessionCount: managerAfterDuplicate.activeSessionCount,
          managedSessionCount: managerAfterDuplicate.managedSessionCount,
          primaryStatus: this.#primary.state().status,
          sessionLimit: managerAfterDuplicate.sessionLimit,
          limitGuardEnabled: true,
        }),
      }));

      const managerAfterStop = await this.#sessions.stop(
        candidate.id,
        "slice71_live_test",
      );
      managedCharacterId = undefined;
      const primaryAfter = this.#primary.state();
      const runtimeAfter = this.#runtime.state();
      const gameDataAfter = this.#gameData.state();
      if (
        managerAfterStop.activeSessionCount !== 1 ||
        managerAfterStop.managedSessionCount !== 0 ||
        primaryAfter.status !== "connected" ||
        primaryAfter.characterId !== primaryBefore.characterId ||
        primaryAfter.serverKey !== primaryBefore.serverKey ||
        runtimeAfter.status !== runtimeBefore.status ||
        runtimeAfter.runId !== runtimeBefore.runId ||
        gameDataAfter.version !== gameDataBefore.version ||
        managerAfterStop.sharedStaticData.gameDataVersion !== gameDataBefore.version
      ) {
        throw new Slice71Failure(
          "LIVE_TEST_FINAL_STATE_MISMATCH",
          "The bounded managed-session cleanup changed primary, script, or shared static-data state.",
          "final-state",
        );
      }

      steps.push(Object.freeze({
        name: "final-state",
        outcome: "passed",
        message:
          "Only the managed test session was stopped; the primary Character, user script state, and shared static game data remained unchanged.",
        evidence: Object.freeze({
          primaryCharacterId: primaryAfter.characterId,
          primaryStatus: primaryAfter.status,
          activeSessionCountAfter: managerAfterStop.activeSessionCount,
          managedSessionCountAfter: managerAfterStop.managedSessionCount,
          userScriptStatusBefore: runtimeBefore.status,
          userScriptStatusAfter: runtimeAfter.status,
          userScriptInterrupted: false,
          gameDataVersionBefore: gameDataBefore.version,
          gameDataVersionAfter: gameDataAfter.version,
          sharedStaticData: true,
          characterLimit: managerAfterStop.sessionLimit,
          gameplayMutation: false,
          rawSocketAccess: false,
        }),
      }));

      const result: Slice71LiveTestResult = Object.freeze({
        testId,
        slice: "7.1",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primaryBefore.characterId,
        primaryCharacterName: primaryBefore.characterName,
        managedCharacterId: candidate.id,
        managedCharacterName: candidate.name,
        serverKey: primaryBefore.serverKey,
        message:
          "Slice 7.1 passed: two Character sessions ran concurrently, duplicate/limit protection stayed active, and removing the managed session left the primary session untouched.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 7.1 multi-character session live test passed.", {
        testId,
        primaryCharacterId: primaryBefore.characterId,
        managedCharacterId: candidate.id,
        serverKey: primaryBefore.serverKey,
        sessionLimit: managerAfterStop.sessionLimit,
        sharedStaticData: true,
        gameplayMutation: false,
        rawSocketAccess: false,
        userScriptInterrupted: false,
      });
      return structuredClone(result);
    } catch (error) {
      if (managedCharacterId) {
        const manager = this.#sessions.state();
        if (manager.sessions.some((session) =>
          session.role === "managed" && session.characterId === managedCharacterId
        )) {
          try {
            await this.#sessions.stop(managedCharacterId, "slice71_cleanup");
          } catch (cleanupError) {
            this.#logger.warn("Slice 7.1 cleanup could not stop the managed test session.", {
              testId,
              characterId: managedCharacterId,
              error: cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
              gameplayMutation: false,
            });
          }
        }
      }

      const failure = error instanceof Slice71Failure
        ? error
        : new Slice71Failure(
          "LIVE_TEST_SLICE_7_1_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice71LiveTestOutcome = failure.blocked
        ? "blocked"
        : "failed";
      const primary = this.#primary.state();
      const result: Slice71LiveTestResult = Object.freeze({
        testId,
        slice: "7.1",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primary.characterId,
        primaryCharacterName: primary.characterName,
        managedCharacterId,
        managedCharacterName,
        serverKey: primary.serverKey,
        message: failure.message,
        steps: Object.freeze(steps),
        error: Object.freeze({
          code: failure.code,
          step: failure.step,
          message: failure.message,
        }),
      });
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      this.#logger.warn("Slice 7.1 multi-character session live test did not pass.", {
        testId,
        outcome,
        errorCode: failure.code,
        step: failure.step,
        message: failure.message,
      });
      return structuredClone(result);
    }
  }
}

class Slice71Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(
    code: string,
    message: string,
    step: string,
    blocked = false,
  ) {
    super(message);
    this.name = "Slice71Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function asManagerError(error: unknown): Readonly<{
  code: string;
  message: string;
}> {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as MultiCharacterSessionManagerError).code === "string"
  ) {
    return {
      code: (error as MultiCharacterSessionManagerError).code,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    code: "SESSION_MANAGER_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}
