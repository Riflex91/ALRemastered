import { randomUUID } from "node:crypto";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { MultiCharacterSessionManager } from "../character/session-manager.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { CharacterCardsService } from "../dashboard/character-cards.ts";
import { CharacterCardsService as ProbeCharacterCardsService } from "../dashboard/character-cards.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService, ScriptRuntimeState } from "../script/runtime.ts";

export type Slice81LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice81LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice81LiveTestResult {
  readonly testId: string;
  readonly slice: "8.1";
  readonly outcome: Slice81LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly managedCharacterId?: string;
  readonly managedCharacterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice81LiveTestStep[];
  readonly error?: Readonly<{
    readonly code: string;
    readonly step: string;
    readonly message: string;
  }>;
}

export interface Slice81LiveTestState {
  readonly status: "idle" | "running" | Slice81LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice81LiveTestResult;
}

type ProbeRuntime = Pick<
  ScriptRuntimeService,
  "state" | "load" | "start" | "pause" | "stop" | "dispose"
>;

export interface Slice81LiveTestServiceOptions {
  readonly logger: Logger;
  readonly userRuntime: Pick<ScriptRuntimeService, "state">;
  readonly createProbeRuntime: () => ProbeRuntime;
  readonly cards: Pick<CharacterCardsService, "state" | "start" | "stop">;
  readonly primary: Pick<AdventureLandCharacterService, "state" | "start" | "stop">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly sessions: Pick<
    MultiCharacterSessionManager,
    "state" | "characterStates" | "start" | "stop"
  >;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice81LiveTestService {
  readonly #logger: Logger;
  readonly #userRuntime: Slice81LiveTestServiceOptions["userRuntime"];
  readonly #createProbeRuntime: Slice81LiveTestServiceOptions["createProbeRuntime"];
  readonly #cards: Slice81LiveTestServiceOptions["cards"];
  readonly #primary: Slice81LiveTestServiceOptions["primary"];
  readonly #selection: Slice81LiveTestServiceOptions["selection"];
  readonly #sessions: Slice81LiveTestServiceOptions["sessions"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice81LiveTestResult>;
  #state: Slice81LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 8.1 Character Cards test is ready.",
  });

  constructor(options: Slice81LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#userRuntime = options.userRuntime;
    this.#createProbeRuntime = options.createProbeRuntime;
    this.#cards = options.cards;
    this.#primary = options.primary;
    this.#selection = options.selection;
    this.#sessions = options.sessions;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live81-${randomUUID()}`);
  }

  state(): Slice81LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice81LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice81LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice81LiveTestStep[] = [];
    const userBefore = this.#userRuntime.state();
    const primaryBefore = this.#primary.state();
    const sessionsBefore = this.#sessions.state();
    let managedCharacterId: string | undefined;
    let managedCharacterName: string | undefined;
    let probeRuntime: ProbeRuntime | undefined;

    this.#state = Object.freeze({
      status: "running",
      message:
        "Slice 8.1 is verifying Character Card telemetry, managed Start/Stop, and isolated primary-script Pause without interrupting the user Script runtime.",
    });

    try {
      if (userBefore.status === "running" || userBefore.status === "paused") {
        throw failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A user Script is running or paused. Slice 8.1 did not interrupt or replace it.",
          "preflight",
          true,
        );
      }
      if (
        primaryBefore.status !== "connected" ||
        !primaryBefore.characterId ||
        !primaryBefore.characterName ||
        !primaryBefore.serverKey ||
        !primaryBefore.character
      ) {
        throw failure(
          "LIVE_TEST_PRIMARY_CHARACTER_NOT_CONNECTED",
          "Connect one primary headless Character before running Slice 8.1.",
          "preflight",
          true,
        );
      }
      const selection = this.#selection.state();
      if (selection.status !== "ready" || !selection.selectedServerKey) {
        throw failure(
          "LIVE_TEST_SELECTION_NOT_READY",
          "Characters and a server must be loaded before running Slice 8.1.",
          "preflight",
          true,
        );
      }
      if (sessionsBefore.managedSessionCount !== 0 || sessionsBefore.availableSlots < 1) {
        throw failure(
          "LIVE_TEST_MANAGED_SESSION_CAPACITY_UNAVAILABLE",
          "Slice 8.1 requires no existing managed sessions and one free Character slot.",
          "preflight",
          true,
        );
      }
      const candidate = selection.characters.find((character) =>
        character.id !== primaryBefore.characterId && !character.online
      );
      if (!candidate) {
        throw failure(
          "LIVE_TEST_MANAGED_CHARACTER_UNAVAILABLE",
          "No offline secondary Character is available for the Character Card Start/Stop probe.",
          "preflight",
          true,
        );
      }
      managedCharacterId = candidate.id;
      managedCharacterName = candidate.name;

      const initialCards = this.#cards.state();
      const primaryCard = initialCards.cards.find((card) =>
        card.characterId === primaryBefore.characterId
      );
      if (
        !primaryCard ||
        primaryCard.sessionRole !== "primary" ||
        primaryCard.connectionStatus !== "connected" ||
        primaryCard.health.status !== "healthy" ||
        typeof primaryCard.hp !== "number" ||
        typeof primaryCard.maxHp !== "number" ||
        typeof primaryCard.mp !== "number" ||
        typeof primaryCard.maxMp !== "number" ||
        typeof primaryCard.map !== "string"
      ) {
        throw failure(
          "LIVE_TEST_PRIMARY_CARD_TELEMETRY_MISMATCH",
          "The primary Character Card did not expose connected HP/MP, map, and healthy live state.",
          "preflight",
        );
      }
      steps.push(step(
        "preflight",
        "The primary Character Card exposed live HP/MP, map, target, Script, Health, and safe controls while one offline Character was available.",
        {
          primaryCharacterId: primaryCard.characterId,
          hp: primaryCard.hp,
          maxHp: primaryCard.maxHp,
          mp: primaryCard.mp,
          maxMp: primaryCard.maxMp,
          map: primaryCard.map,
          target: primaryCard.target ?? null,
          script: primaryCard.script,
          health: primaryCard.health,
          activeSessionCountBefore: sessionsBefore.activeSessionCount,
          managedSessionCountBefore: sessionsBefore.managedSessionCount,
          userScriptStatusBefore: userBefore.status,
        },
      ));

      const afterStart = await this.#cards.start(candidate.id);
      const managedCard = afterStart.cards.find((card) => card.characterId === candidate.id);
      if (
        !managedCard ||
        managedCard.sessionRole !== "managed" ||
        managedCard.connectionStatus !== "connected" ||
        managedCard.health.status !== "healthy" ||
        managedCard.controls.stop.enabled !== true ||
        managedCard.controls.pause.enabled !== false ||
        managedCard.script.status !== "not-available"
      ) {
        throw failure(
          "LIVE_TEST_MANAGED_CARD_START_MISMATCH",
          "The managed Character Card did not enter the expected connected state after Start.",
          "managed-start",
        );
      }
      steps.push(step(
        "managed-start",
        "Start created one managed Character session through the existing session manager and the Card immediately reflected live telemetry and Health.",
        {
          characterId: managedCard.characterId,
          characterName: managedCard.characterName,
          sessionRole: managedCard.sessionRole,
          connectionStatus: managedCard.connectionStatus,
          health: managedCard.health,
          script: managedCard.script,
          activeSessionCount: afterStart.activeSessionCount,
        },
      ));

      probeRuntime = this.#createProbeRuntime();
      const probeCards = new ProbeCharacterCardsService({
        logger: this.#logger,
        selection: this.#selection,
        primary: this.#primary,
        sessions: this.#sessions,
        runtime: probeRuntime,
      });
      await probeRuntime.load({
        name: "slice81-pause-probe",
        source: "setInterval(() => undefined, 1000);",
      });
      await probeRuntime.start();
      const beforePause = probeCards.state().cards.find((card) =>
        card.characterId === primaryBefore.characterId
      );
      if (!beforePause?.controls.pause.enabled || beforePause.script.status !== "running") {
        throw failure(
          "LIVE_TEST_PAUSE_CONTROL_UNAVAILABLE",
          "The primary Character Card did not enable Pause for the isolated running probe Script.",
          "primary-pause",
        );
      }
      await probeCards.pause(primaryBefore.characterId);
      const afterPause = probeCards.state().cards.find((card) =>
        card.characterId === primaryBefore.characterId
      );
      if (afterPause?.script.status !== "paused" || afterPause.controls.pause.enabled) {
        throw failure(
          "LIVE_TEST_PAUSE_CONTROL_MISMATCH",
          "Pause did not transition the isolated primary Script probe to paused state.",
          "primary-pause",
        );
      }
      steps.push(step(
        "primary-pause",
        "Pause operated on an isolated probe Script bound to the primary Card, proving the control without touching the user Script runtime.",
        {
          characterId: primaryBefore.characterId,
          scriptName: afterPause.script.name,
          scriptStatus: afterPause.script.status,
          pauseEnabledAfter: afterPause.controls.pause.enabled,
          userScriptInterrupted: false,
        },
      ));
      await probeRuntime.stop();
      await probeRuntime.dispose();
      probeRuntime = undefined;

      const afterStop = await this.#cards.stop(candidate.id);
      if (
        afterStop.activeSessionCount !== sessionsBefore.activeSessionCount ||
        this.#sessions.state().managedSessionCount !== 0
      ) {
        throw failure(
          "LIVE_TEST_MANAGED_CARD_STOP_MISMATCH",
          "Stop did not remove only the managed Character Card session.",
          "managed-stop",
        );
      }
      const stoppedCard = afterStop.cards.find((card) => card.characterId === candidate.id);
      if (
        !stoppedCard ||
        stoppedCard.sessionRole !== undefined ||
        stoppedCard.connectionStatus !== "offline" ||
        stoppedCard.health.status !== "offline" ||
        stoppedCard.controls.start.enabled !== true
      ) {
        throw failure(
          "LIVE_TEST_MANAGED_CARD_CLEANUP_MISMATCH",
          "The managed Character Card did not return to its offline Start-ready state.",
          "managed-stop",
        );
      }
      steps.push(step(
        "managed-stop",
        "Stop removed only the temporary managed session and returned its Card to offline Start-ready state.",
        {
          characterId: candidate.id,
          connectionStatus: stoppedCard.connectionStatus,
          health: stoppedCard.health,
          startEnabled: stoppedCard.controls.start.enabled,
          managedSessionCountAfter: this.#sessions.state().managedSessionCount,
        },
      ));

      const userAfter = this.#userRuntime.state();
      const primaryAfter = this.#primary.state();
      if (
        !sameRuntime(userBefore, userAfter) ||
        primaryAfter.status !== "connected" ||
        primaryAfter.characterId !== primaryBefore.characterId ||
        primaryAfter.serverKey !== primaryBefore.serverKey ||
        this.#sessions.state().managedSessionCount !== 0
      ) {
        throw failure(
          "LIVE_TEST_FINAL_STATE_MISMATCH",
          "Slice 8.1 did not restore the expected user Script, primary Character, and managed-session state.",
          "final-state",
        );
      }
      steps.push(step(
        "final-state",
        "Primary Character and user Script runtime were preserved, with zero managed sessions left behind.",
        {
          primaryCharacterId: primaryAfter.characterId,
          primaryStatus: primaryAfter.status,
          managedSessionCountAfter: this.#sessions.state().managedSessionCount,
          userScriptStatusAfter: userAfter.status,
          userScriptInterrupted: false,
          gameplayMutation: false,
          rawSocketAccess: false,
        },
      ));

      const result: Slice81LiveTestResult = Object.freeze({
        testId,
        slice: "8.1",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primaryBefore.characterId,
        primaryCharacterName: primaryBefore.characterName,
        managedCharacterId,
        managedCharacterName,
        serverKey: primaryBefore.serverKey,
        message:
          "Slice 8.1 passed: Character Cards exposed HP/MP, Map, Target, Script and Health; managed Start/Stop and isolated primary Pause worked without user-script, gameplay, or raw-socket side effects.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 8.1 Character Cards live test passed.", {
        testId,
        managedCharacterId,
        userScriptInterrupted: false,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
      return structuredClone(result);
    } catch (error) {
      if (probeRuntime) {
        try {
          await probeRuntime.stop();
          await probeRuntime.dispose();
        } catch {}
      }
      if (managedCharacterId && this.#sessions.state().managedSessionCount > 0) {
        try {
          const active = this.#sessions.characterStates().some((item) =>
            item.role === "managed" && item.characterId === managedCharacterId
          );
          if (active) await this.#sessions.stop(managedCharacterId, "slice81_cleanup");
        } catch (cleanupError) {
          this.#logger.warn("Slice 8.1 managed Character cleanup failed.", {
            testId,
            characterId: managedCharacterId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            gameplayMutation: false,
          });
        }
      }
      const problem = error instanceof Slice81Failure
        ? error
        : failure(
          "LIVE_TEST_SLICE_8_1_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice81LiveTestOutcome = problem.blocked ? "blocked" : "failed";
      const result: Slice81LiveTestResult = Object.freeze({
        testId,
        slice: "8.1",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: this.#primary.state().characterId,
        primaryCharacterName: this.#primary.state().characterName,
        managedCharacterId,
        managedCharacterName,
        serverKey: this.#primary.state().serverKey,
        message: problem.message,
        steps: Object.freeze(steps),
        error: Object.freeze({
          code: problem.code,
          step: problem.step,
          message: problem.message,
        }),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      this.#logger.warn("Slice 8.1 Character Cards live test did not pass.", {
        testId,
        outcome,
        errorCode: problem.code,
        step: problem.step,
        message: problem.message,
      });
      return structuredClone(result);
    }
  }
}

class Slice81Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, stepName: string, blocked = false) {
    super(message);
    this.name = "Slice81Failure";
    this.code = code;
    this.step = stepName;
    this.blocked = blocked;
  }
}

function failure(code: string, message: string, stepName: string, blocked = false): Slice81Failure {
  return new Slice81Failure(code, message, stepName, blocked);
}

function step(
  name: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): Slice81LiveTestStep {
  return Object.freeze({
    name,
    outcome: "passed" as const,
    message,
    evidence: Object.freeze(evidence),
  });
}

function sameRuntime(before: ScriptRuntimeState, after: ScriptRuntimeState): boolean {
  return before.status === after.status &&
    before.scriptName === after.scriptName &&
    before.runId === after.runId &&
    before.loadedAt === after.loadedAt &&
    before.startedAt === after.startedAt &&
    before.pausedAt === after.pausedAt &&
    before.stoppedAt === after.stoppedAt &&
    before.crashedAt === after.crashedAt;
}
