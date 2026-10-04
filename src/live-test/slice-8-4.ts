import { randomUUID } from "node:crypto";
import type { ActionGateway } from "../action/gateway.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { ExplainabilityService, ExplainabilityState } from "../dashboard/explainability.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice84LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice84LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice84LiveTestResult {
  readonly testId: string;
  readonly slice: "8.4";
  readonly outcome: Slice84LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice84LiveTestStep[];
  readonly error?: Readonly<{ readonly code: string; readonly step: string; readonly message: string }>;
}

export interface Slice84LiveTestState {
  readonly status: "idle" | "running" | Slice84LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice84LiveTestResult;
}

export interface Slice84LiveTestServiceOptions {
  readonly logger: Logger;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly runtime: Pick<ScriptRuntimeService, "state">;
  readonly gateway: Pick<ActionGateway, "state">;
  readonly explainability: Pick<ExplainabilityService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice84LiveTestService {
  readonly #logger: Logger;
  readonly #character: Slice84LiveTestServiceOptions["character"];
  readonly #runtime: Slice84LiveTestServiceOptions["runtime"];
  readonly #gateway: Slice84LiveTestServiceOptions["gateway"];
  readonly #explainability: Slice84LiveTestServiceOptions["explainability"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice84LiveTestResult>;
  #state: Slice84LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 8.4 explainability test is ready.",
  });

  constructor(options: Slice84LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#character = options.character;
    this.#runtime = options.runtime;
    this.#gateway = options.gateway;
    this.#explainability = options.explainability;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live84-${randomUUID()}`);
  }

  state(): Slice84LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice84LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice84LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice84LiveTestStep[] = [];
    const characterBefore = this.#character.state();
    const runtimeBefore = this.#runtime.state();
    const gatewayBefore = this.#gateway.state();

    this.#state = Object.freeze({
      status: "running",
      message: "Slice 8.4 is validating read-only explainability without dispatching actions.",
    });

    try {
      if (
        characterBefore.status !== "connected" ||
        !characterBefore.characterId ||
        !characterBefore.characterName ||
        !characterBefore.serverKey
      ) {
        throw failure(
          "LIVE_TEST_PRIMARY_NOT_CONNECTED",
          "Connect one primary Character before running Slice 8.4.",
          "preflight",
          true,
        );
      }

      const first = this.#explainability.state();
      validateShape(first);
      steps.push(step(
        "explainability",
        "All required Why-is-the-bot-doing-this fields are available.",
        {
          strategy: first.strategy,
          currentTarget: first.currentTarget,
          selectionReason: first.selectionReason,
          rejectedTargetCount: first.rejectedTargets.length,
          range: first.range,
          cooldowns: first.cooldowns,
          movementTarget: first.movementTarget,
          nextAction: first.nextAction,
          blockerCount: first.blockers.length,
        },
      ));

      const second = this.#explainability.state();
      validateShape(second);
      const runtimeAfter = this.#runtime.state();
      const gatewayAfter = this.#gateway.state();
      const characterAfter = this.#character.state();

      if (
        runtimeAfter.status !== runtimeBefore.status ||
        runtimeAfter.runId !== runtimeBefore.runId ||
        runtimeAfter.scriptName !== runtimeBefore.scriptName
      ) {
        throw failure(
          "LIVE_TEST_RUNTIME_CHANGED",
          "Read-only explainability changed the user Script runtime.",
          "isolation",
        );
      }
      if (gatewayAfter.totalRequests !== gatewayBefore.totalRequests) {
        throw failure(
          "LIVE_TEST_ACTION_DISPATCHED",
          "Read-only explainability dispatched an Action Gateway request.",
          "isolation",
        );
      }
      if (
        characterAfter.status !== "connected" ||
        characterAfter.characterId !== characterBefore.characterId ||
        characterAfter.serverKey !== characterBefore.serverKey
      ) {
        throw failure(
          "LIVE_TEST_CHARACTER_CHANGED",
          "Read-only explainability changed the primary Character session.",
          "isolation",
        );
      }
      steps.push(step(
        "isolation",
        "Repeated explainability reads preserved Character, Script runtime, and Action Gateway request count.",
        {
          primaryStatus: characterAfter.status,
          userScriptStatusBefore: runtimeBefore.status,
          userScriptStatusAfter: runtimeAfter.status,
          gatewayRequestsBefore: gatewayBefore.totalRequests,
          gatewayRequestsAfter: gatewayAfter.totalRequests,
          readOnly: second.readOnly,
          gameplayMutation: second.gameplayMutation,
          rawSocketAccess: second.rawSocketAccess,
        },
      ));

      const result: Slice84LiveTestResult = Object.freeze({
        testId,
        slice: "8.4",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: characterBefore.characterId,
        primaryCharacterName: characterBefore.characterName,
        serverKey: characterBefore.serverKey,
        message:
          "Slice 8.4 passed: goal, selection/rejection reasons, range, cooldowns, movement context, next action, strategy, and blockers are visible through a read-only model with no action dispatch.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 8.4 explainability live test passed.", {
        testId,
        readOnly: true,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
      return structuredClone(result);
    } catch (error) {
      const problem = error instanceof Slice84Failure
        ? error
        : failure(
          "LIVE_TEST_SLICE_8_4_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice84LiveTestOutcome = problem.blocked ? "blocked" : "failed";
      const result: Slice84LiveTestResult = Object.freeze({
        testId,
        slice: "8.4",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: this.#character.state().characterId,
        primaryCharacterName: this.#character.state().characterName,
        serverKey: this.#character.state().serverKey,
        message: problem.message,
        steps: Object.freeze(steps),
        error: Object.freeze({ code: problem.code, step: problem.step, message: problem.message }),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      this.#logger.warn("Slice 8.4 explainability live test did not pass.", {
        testId,
        outcome,
        errorCode: problem.code,
        step: problem.step,
      });
      return structuredClone(result);
    }
  }
}

function validateShape(state: ExplainabilityState): void {
  if (
    !state.strategy?.name ||
    typeof state.selectionReason !== "string" ||
    !Array.isArray(state.rejectedTargets) ||
    typeof state.range?.message !== "string" ||
    typeof state.cooldowns?.attackMs !== "number" ||
    typeof state.cooldowns?.hpMs !== "number" ||
    typeof state.cooldowns?.mpMs !== "number" ||
    typeof state.movementTarget?.message !== "string" ||
    !state.nextAction?.label ||
    typeof state.nextAction.reason !== "string" ||
    !Array.isArray(state.blockers) ||
    state.readOnly !== true ||
    state.gameplayMutation !== false ||
    state.rawSocketAccess !== false
  ) {
    throw failure(
      "LIVE_TEST_EXPLAINABILITY_SHAPE_MISMATCH",
      "Explainability state did not expose every required Slice 8.4 field and safety flag.",
      "explainability",
    );
  }
}

class Slice84Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, stepName: string, blocked = false) {
    super(message);
    this.name = "Slice84Failure";
    this.code = code;
    this.step = stepName;
    this.blocked = blocked;
  }
}

function failure(code: string, message: string, stepName: string, blocked = false): Slice84Failure {
  return new Slice84Failure(code, message, stepName, blocked);
}

function step(
  name: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): Slice84LiveTestStep {
  return Object.freeze({ name, outcome: "passed" as const, message, evidence: Object.freeze(evidence) });
}
