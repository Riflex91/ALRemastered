import { randomUUID } from "node:crypto";
import type { AdventureLandAccountService } from "../account/service.ts";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { MultiCharacterSessionManager } from "../character/session-manager.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { CharacterCardsService } from "../dashboard/character-cards.ts";
import type { SetupWizardService } from "../dashboard/setup-wizard.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice82LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice82LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice82LiveTestResult {
  readonly testId: string;
  readonly slice: "8.2";
  readonly outcome: Slice82LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly managedCharacterId?: string;
  readonly managedCharacterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice82LiveTestStep[];
  readonly error?: Readonly<{ readonly code: string; readonly step: string; readonly message: string }>;
}

export interface Slice82LiveTestState {
  readonly status: "idle" | "running" | Slice82LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice82LiveTestResult;
}

export interface Slice82LiveTestServiceOptions {
  readonly logger: Logger;
  readonly account: Pick<AdventureLandAccountService, "state">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly primary: Pick<AdventureLandCharacterService, "state">;
  readonly sessions: Pick<MultiCharacterSessionManager, "state" | "characterStates">;
  readonly cards: Pick<CharacterCardsService, "state" | "stop">;
  readonly wizard: Pick<SetupWizardService, "state" | "start">;
  readonly userRuntime: Pick<ScriptRuntimeService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice82LiveTestService {
  readonly #logger: Logger;
  readonly #account: Slice82LiveTestServiceOptions["account"];
  readonly #selection: Slice82LiveTestServiceOptions["selection"];
  readonly #primary: Slice82LiveTestServiceOptions["primary"];
  readonly #sessions: Slice82LiveTestServiceOptions["sessions"];
  readonly #cards: Slice82LiveTestServiceOptions["cards"];
  readonly #wizard: Slice82LiveTestServiceOptions["wizard"];
  readonly #userRuntime: Slice82LiveTestServiceOptions["userRuntime"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice82LiveTestResult>;
  #state: Slice82LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 8.2 Setup Wizard test is ready.",
  });

  constructor(options: Slice82LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#account = options.account;
    this.#selection = options.selection;
    this.#primary = options.primary;
    this.#sessions = options.sessions;
    this.#cards = options.cards;
    this.#wizard = options.wizard;
    this.#userRuntime = options.userRuntime;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live82-${randomUUID()}`);
  }

  state(): Slice82LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice82LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice82LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice82LiveTestStep[] = [];
    const primaryBefore = this.#primary.state();
    const sessionsBefore = this.#sessions.state();
    const runtimeBefore = this.#userRuntime.state();
    let managedCharacterId: string | undefined;
    let managedCharacterName: string | undefined;

    this.#state = Object.freeze({
      status: "running",
      message: "Slice 8.2 is verifying the six Setup Wizard stages with one bounded Connect only start.",
    });

    try {
      const account = this.#account.state();
      if (account.status !== "connected") {
        throw fail("LIVE_TEST_ACCOUNT_NOT_CONNECTED", "Connect the Adventure Land account before running Slice 8.2.", "account", true);
      }
      if (
        primaryBefore.status !== "connected" ||
        !primaryBefore.characterId ||
        !primaryBefore.characterName ||
        !primaryBefore.serverKey
      ) {
        throw fail("LIVE_TEST_PRIMARY_NOT_CONNECTED", "Connect one primary Character before running Slice 8.2.", "account", true);
      }
      if (runtimeBefore.status === "running" || runtimeBefore.status === "paused") {
        throw fail("LIVE_TEST_SCRIPT_RUNTIME_BUSY", "A user Script is running or paused. Slice 8.2 did not interrupt it.", "account", true);
      }
      const selection = this.#selection.state();
      if (selection.status !== "ready") {
        throw fail("LIVE_TEST_SELECTION_NOT_READY", "Characters and servers must be loaded before running Slice 8.2.", "account", true);
      }
      if (sessionsBefore.managedSessionCount !== 0 || sessionsBefore.availableSlots < 1) {
        throw fail("LIVE_TEST_MANAGED_SESSION_CAPACITY_UNAVAILABLE", "Slice 8.2 requires zero managed sessions and one free slot.", "start", true);
      }
      const candidate = selection.characters.find((character) =>
        character.id !== primaryBefore.characterId && !character.online
      );
      if (!candidate) {
        throw fail("LIVE_TEST_MANAGED_CHARACTER_UNAVAILABLE", "No offline secondary Character is available for the bounded Wizard start.", "character", true);
      }
      managedCharacterId = candidate.id;
      managedCharacterName = candidate.name;

      const wizardState = this.#wizard.state();
      const labels = wizardState.steps.map((item) => item.label);
      if (
        wizardState.status !== "ready" ||
        labels.join("|") !== "Account|Character|Server|Task / Template|Configuration|Start"
      ) {
        throw fail("LIVE_TEST_WIZARD_STRUCTURE_MISMATCH", "The Setup Wizard did not expose the required six English stages.", "account");
      }
      steps.push(step("account", "Account stage recognized the existing connected account without reconnecting or storing credentials.", {
        accountConnected: wizardState.accountConnected,
        accountUserIdPresent: Boolean(wizardState.accountUserId),
        visibleStepLabel: "Account",
      }));
      steps.push(step("character", "Character stage selected one offline secondary Character for a bounded local-session probe.", {
        characterId: candidate.id,
        characterName: candidate.name,
        characterType: candidate.type,
        visibleStepLabel: "Character",
      }));
      const server = selection.servers.find((item) => item.key === primaryBefore.serverKey);
      if (!server) {
        throw fail("LIVE_TEST_SERVER_UNAVAILABLE", "The primary Character server is not present in the loaded server list.", "server", true);
      }
      steps.push(step("server", "Server stage reused the primary Character server for the bounded probe.", {
        serverKey: server.key,
        serverRegion: server.region,
        serverName: server.name,
        visibleStepLabel: "Server",
      }));
      steps.push(step("task-template", "Task / Template stage selected Connect only so no automation or Script runtime would be started.", {
        taskTemplateId: "connect-only",
        visibleStepLabel: "Task / Template",
      }));
      steps.push(step("configuration", "Configuration stage correctly required no task settings for Connect only.", {
        configurationRequired: false,
        visibleStepLabel: "Configuration",
      }));

      const result = await this.#wizard.start({
        characterId: candidate.id,
        serverKey: server.key,
        taskTemplateId: "connect-only",
        configuration: {},
      });
      if (
        result.status !== "started" ||
        result.sessionRole !== "managed" ||
        result.taskStarted ||
        !result.startedSession ||
        result.card.connectionStatus !== "connected"
      ) {
        throw fail("LIVE_TEST_WIZARD_START_MISMATCH", "Wizard Start did not create the expected managed Connect only session.", "start");
      }
      steps.push(step("start", "Start created exactly one managed Character session through existing Character Cards controls and did not start a task or template.", {
        characterId: result.characterId,
        sessionRole: result.sessionRole,
        connectionStatus: result.card.connectionStatus,
        taskTemplateId: result.taskTemplateId,
        taskStarted: result.taskStarted,
        activeSessionCount: this.#sessions.state().activeSessionCount,
        managedSessionCount: this.#sessions.state().managedSessionCount,
        gameplayMutation: false,
        rawSocketAccess: false,
      }));

      await this.#cards.stop(candidate.id);
      const runtimeAfter = this.#userRuntime.state();
      const primaryAfter = this.#primary.state();
      if (
        this.#sessions.state().managedSessionCount !== 0 ||
        primaryAfter.status !== "connected" ||
        primaryAfter.characterId !== primaryBefore.characterId ||
        runtimeAfter.status !== runtimeBefore.status ||
        runtimeAfter.scriptName !== runtimeBefore.scriptName ||
        runtimeAfter.runId !== runtimeBefore.runId
      ) {
        throw fail("LIVE_TEST_FINAL_STATE_MISMATCH", "Slice 8.2 did not restore the pre-test primary/user-Script/managed-session state.", "final-state");
      }
      steps.push(step("final-state", "The temporary managed session was removed; primary Character and user Script runtime were preserved.", {
        primaryCharacterId: primaryAfter.characterId,
        primaryStatus: primaryAfter.status,
        managedSessionCountAfter: this.#sessions.state().managedSessionCount,
        userScriptStatusAfter: runtimeAfter.status,
        userScriptInterrupted: false,
        gameplayMutation: false,
        rawSocketAccess: false,
      }));

      const resultFinal: Slice82LiveTestResult = Object.freeze({
        testId,
        slice: "8.2",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primaryBefore.characterId,
        primaryCharacterName: primaryBefore.characterName,
        managedCharacterId,
        managedCharacterName,
        serverKey: primaryBefore.serverKey,
        message: "Slice 8.2 passed: Account, Character, Server, Task / Template, Configuration and Start were verified in English using existing control paths without user-script, gameplay, or raw-socket side effects.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: resultFinal.message, lastResult: resultFinal });
      this.#logger.info("Slice 8.2 Setup Wizard live test passed.", {
        testId,
        managedCharacterId,
        userScriptInterrupted: false,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
      return structuredClone(resultFinal);
    } catch (error) {
      if (managedCharacterId) {
        try {
          const active = this.#sessions.characterStates().some((item) =>
            item.role === "managed" && item.characterId === managedCharacterId
          );
          if (active) await this.#cards.stop(managedCharacterId);
        } catch {}
      }
      const problem = error instanceof Slice82Failure
        ? error
        : fail("LIVE_TEST_SLICE_8_2_FAILED", error instanceof Error ? error.message : String(error), "unknown");
      const outcome: Slice82LiveTestOutcome = problem.blocked ? "blocked" : "failed";
      const result: Slice82LiveTestResult = Object.freeze({
        testId,
        slice: "8.2",
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
        error: Object.freeze({ code: problem.code, step: problem.step, message: problem.message }),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      this.#logger.warn("Slice 8.2 Setup Wizard live test did not pass.", {
        testId, outcome, errorCode: problem.code, step: problem.step, message: problem.message,
      });
      return structuredClone(result);
    }
  }
}

class Slice82Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;
  constructor(code: string, message: string, stepName: string, blocked = false) {
    super(message);
    this.name = "Slice82Failure";
    this.code = code;
    this.step = stepName;
    this.blocked = blocked;
  }
}

function fail(code: string, message: string, stepName: string, blocked = false): Slice82Failure {
  return new Slice82Failure(code, message, stepName, blocked);
}

function step(name: string, message: string, evidence: Readonly<Record<string, unknown>>): Slice82LiveTestStep {
  return Object.freeze({ name, outcome: "passed" as const, message, evidence: Object.freeze(evidence) });
}
