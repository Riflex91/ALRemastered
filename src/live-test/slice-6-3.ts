import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { SmartMoveService } from "../navigation/smart-move.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice63LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice63LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice63LiveTestResult {
  readonly testId: string;
  readonly slice: "6.3";
  readonly outcome: Slice63LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice63LiveTestStep[];
  readonly error?: Readonly<{
    readonly code: string;
    readonly step: string;
    readonly message: string;
  }>;
}

export interface Slice63LiveTestState {
  readonly status: "idle" | "running" | Slice63LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice63LiveTestResult;
}

export interface Slice63LiveTestServiceOptions {
  readonly logger: Logger;
  readonly runtime: Pick<ScriptRuntimeService, "state" | "load" | "start" | "stop">;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly smartMove: Pick<SmartMoveService, "state">;
  readonly clock?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

const SCRIPT_NAME = "slice-6-3-smart-move-live-test";
const SCRIPT_TIMEOUT_MS = 5_000;
const UNSUPPORTED_TARGET = "__alr_slice63_unsupported_target__";

export class Slice63LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: Slice63LiveTestServiceOptions["runtime"];
  readonly #character: Slice63LiveTestServiceOptions["character"];
  readonly #smartMove: Slice63LiveTestServiceOptions["smartMove"];
  readonly #clock: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice63LiveTestResult>;
  #state: Slice63LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 6.3 smart_move() compatibility test is ready.",
  });

  constructor(options: Slice63LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#character = options.character;
    this.#smartMove = options.smartMove;
    this.#clock = options.clock ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live63-${randomUUID()}`);
  }

  state(): Slice63LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice63LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice63LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice63LiveTestStep[] = [];
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 6.3 is exercising smart_move() inside the isolated script worker.",
    });
    this.#logger.info("Slice 6.3 smart_move() compatibility test started.", {
      testId,
      gameplayMutation: false,
      rawSocketAccess: false,
      movementExecution: false,
    });

    try {
      if (this.#runtime.state().status === "running") {
        throw new Slice63Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A script is already running. Slice 6.3 did not interrupt it.",
          "preflight",
          true,
        );
      }

      const before = this.#character.state();
      const character = before.character;
      if (
        before.status !== "connected" ||
        !character ||
        !character.map ||
        typeof character.x !== "number" ||
        !Number.isFinite(character.x) ||
        typeof character.y !== "number" ||
        !Number.isFinite(character.y)
      ) {
        throw new Slice63Failure(
          "LIVE_TEST_CHARACTER_NOT_CONNECTED",
          "Connect one headless Character before running the Slice 6.3 smart_move() compatibility test.",
          "preflight",
          true,
        );
      }
      if (character.dead) {
        throw new Slice63Failure(
          "LIVE_TEST_CHARACTER_DEAD",
          "The connected Character is dead; smart_move() compatibility was not exercised.",
          "preflight",
          true,
        );
      }

      const smartBefore = this.#smartMove.state();
      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message: "A connected live Character and ready smart-move service are available.",
        evidence: Object.freeze({
          characterId: before.characterId,
          characterName: before.characterName,
          serverKey: before.serverKey,
          map: character.map,
          x: character.x,
          y: character.y,
          smartMoveStatus: smartBefore.status,
          requestsBefore: smartBefore.totalRequests,
          completedBefore: smartBefore.completedRequests,
        }),
      }));

      if (smartBefore.status !== "ready") {
        throw new Slice63Failure(
          "LIVE_TEST_SMART_MOVE_UNAVAILABLE",
          "The smart-move compatibility service is not ready.",
          "preflight",
          true,
        );
      }

      const logStartId = this.#logger.records().at(-1)?.id ?? 0;
      await this.#runtime.load({
        name: SCRIPT_NAME,
        source: smartMoveProbeScript(),
      });
      const started = await this.#runtime.start();
      if (started.status !== "running") {
        throw new Slice63Failure(
          "LIVE_TEST_SCRIPT_START_FAILED",
          started.error?.message ?? started.message,
          "script-start",
        );
      }

      const terminal = await this.#waitFor(() => {
        const records = this.#scriptRecordsAfter(logStartId);
        if (records.some((record) => record.message === "slice63:passed")) {
          return "passed" as const;
        }
        if (this.#runtime.state().status === "crashed") {
          return "crashed" as const;
        }
        return undefined;
      }, SCRIPT_TIMEOUT_MS);

      const runtimeBeforeStop = this.#runtime.state();
      await this.#runtime.stop();
      if (terminal !== "passed") {
        throw new Slice63Failure(
          terminal === "crashed"
            ? "LIVE_TEST_SCRIPT_CRASHED"
            : "LIVE_TEST_SCRIPT_TIMEOUT",
          runtimeBeforeStop.error?.message ??
            "The Slice 6.3 smart_move() probe did not reach its completion marker.",
          "script-run",
        );
      }

      const scriptRecords = this.#scriptRecordsAfter(logStartId);
      const alreadyThere = scriptRecords.find((record) =>
        record.message.startsWith("slice63:already-there:")
      );
      const errorMarker = scriptRecords.find((record) =>
        record.message.startsWith("slice63:error:")
      );
      if (!alreadyThere) {
        throw new Slice63Failure(
          "LIVE_TEST_SMART_MOVE_SUCCESS_MARKER_MISSING",
          "The isolated script did not confirm the already-at-target smart_move() call.",
          "script-api",
        );
      }
      if (errorMarker?.message !== "slice63:error:SMART_MOVE_TARGET_UNSUPPORTED") {
        throw new Slice63Failure(
          "LIVE_TEST_SMART_MOVE_ERROR_CODE_MISMATCH",
          "The isolated script did not receive the expected stable unsupported-target error code.",
          "error-reason",
        );
      }

      const actionRecords = this.#logger.records()
        .filter((record) => record.id > logStartId)
        .filter((record) =>
          record.message === "Action gateway request started." ||
          record.message === "Action gateway request completed."
        );
      if (actionRecords.length !== 0) {
        throw new Slice63Failure(
          "LIVE_TEST_UNEXPECTED_GAMEPLAY_ACTION",
          "The passive smart_move() compatibility probe unexpectedly executed a gameplay action.",
          "safety",
        );
      }

      const smartAfter = this.#smartMove.state();
      if (
        smartAfter.totalRequests !== smartBefore.totalRequests + 2 ||
        smartAfter.completedRequests !== smartBefore.completedRequests + 1 ||
        smartAfter.lastError?.code !== "SMART_MOVE_TARGET_UNSUPPORTED"
      ) {
        throw new Slice63Failure(
          "LIVE_TEST_SMART_MOVE_STATE_MISMATCH",
          "Smart-move service counters or final error evidence did not match the two probe calls.",
          "service-state",
        );
      }

      steps.push(Object.freeze({
        name: "script-api",
        outcome: "passed",
        message: "The isolated worker exposed smart_move() and accepted an Adventure Land-style coordinate destination.",
        evidence: Object.freeze({
          successMarker: alreadyThere.message,
          expectedStatus: "already_there",
          requestDelta: smartAfter.totalRequests - smartBefore.totalRequests,
          completionDelta:
            smartAfter.completedRequests - smartBefore.completedRequests,
        }),
      }));
      steps.push(Object.freeze({
        name: "error-reason",
        outcome: "passed",
        message: "An unsupported smart_move() selector returned a stable explicit error code to the script.",
        evidence: Object.freeze({
          unsupportedTarget: UNSUPPORTED_TARGET,
          errorCode: "SMART_MOVE_TARGET_UNSUPPORTED",
          errorMarker: errorMarker.message,
        }),
      }));

      const after = this.#character.state();
      const finalCharacter = after.character;
      if (
        after.status !== "connected" ||
        !finalCharacter ||
        finalCharacter.map !== character.map ||
        finalCharacter.x !== character.x ||
        finalCharacter.y !== character.y
      ) {
        throw new Slice63Failure(
          "LIVE_TEST_CHARACTER_STATE_CHANGED",
          "The passive smart_move() compatibility probe changed the Character position or connection state.",
          "final-state",
        );
      }

      steps.push(Object.freeze({
        name: "final-state",
        outcome: "passed",
        message: "The compatibility probe completed without movement execution or gameplay mutation.",
        evidence: Object.freeze({
          characterStatus: after.status,
          map: finalCharacter.map,
          x: finalCharacter.x,
          y: finalCharacter.y,
          movementExecution: false,
          gameplayMutation: false,
          rawSocketAccess: false,
          actionGatewayRecords: actionRecords.length,
          runtimeStatus: this.#runtime.state().status,
        }),
      }));

      const result: Slice63LiveTestResult = Object.freeze({
        testId,
        slice: "6.3",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterId: after.characterId,
        characterName: after.characterName,
        serverKey: after.serverKey,
        message:
          "Slice 6.3 passed: smart_move() is available inside the isolated script, accepts coordinate destinations, and returns stable explicit error reasons without hidden gameplay mutation.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 6.3 smart_move() compatibility test passed.", {
        testId,
        characterId: result.characterId,
        errorCodeVerified: "SMART_MOVE_TARGET_UNSUPPORTED",
        requestDelta: 2,
        completionDelta: 1,
        movementExecution: false,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
      return result;
    } catch (error) {
      await this.#runtime.stop().catch(() => undefined);
      const failure = error instanceof Slice63Failure
        ? error
        : new Slice63Failure(
          "LIVE_TEST_UNEXPECTED_ERROR",
          error instanceof Error ? error.message : String(error),
          "live-test",
        );
      const finalState = this.#character.state();
      const outcome: Slice63LiveTestOutcome = failure.blocked
        ? "blocked"
        : "failed";
      const result: Slice63LiveTestResult = Object.freeze({
        testId,
        slice: "6.3",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterId: finalState.characterId,
        characterName: finalState.characterName,
        serverKey: finalState.serverKey,
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
      if (failure.blocked) {
        this.#logger.warn("Slice 6.3 smart_move() compatibility test blocked.", {
          testId,
          code: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error(
          "Slice 6.3 smart_move() compatibility test failed.",
          failure,
          { testId, code: failure.code, step: failure.step },
        );
      }
      return result;
    }
  }

  #scriptRecordsAfter(id: number): readonly LogRecord[] {
    return this.#logger.records().filter((record) =>
      record.id > id && record.component === `script:${SCRIPT_NAME}`
    );
  }

  async #waitFor<T>(
    read: () => T | undefined,
    timeoutMs: number,
  ): Promise<T | undefined> {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const value = read();
      if (value !== undefined) return value;
      await this.#delay(50);
    }
    return undefined;
  }
}

class Slice63Failure extends Error {
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
    this.name = "Slice63Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function smartMoveProbeScript(): string {
  return [
    "(async () => {",
    "  if (typeof smart_move !== 'function') throw new Error('smart_move global missing');",
    "  const x = Number(character.x);",
    "  const y = Number(character.y);",
    "  if (!character.map || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('character position missing');",
    "  const result = await smart_move({x, y});",
    "  if (!result || result.status !== 'already_there') throw new Error('already-at-target smart_move result invalid');",
    "  console.info('slice63:already-there:' + result.status);",
    "  let caught = false;",
    "  try {",
    `    await smart_move(${JSON.stringify(UNSUPPORTED_TARGET)});`,
    "  } catch (error) {",
    "    caught = true;",
    "    if (!error || error.code !== 'SMART_MOVE_TARGET_UNSUPPORTED') throw error;",
    "    console.info('slice63:error:' + error.code);",
    "  }",
    "  if (!caught) throw new Error('unsupported smart_move target unexpectedly succeeded');",
    "  console.info('slice63:passed');",
    "})()",
  ].join("\n");
}
