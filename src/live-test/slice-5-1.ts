import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { CoreRuntime } from "../core/app.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice51LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice51LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice51LiveTestResult {
  readonly testId: string;
  readonly slice: "5.1";
  readonly outcome: Slice51LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice51LiveTestStep[];
  readonly error?: {
    readonly code: string;
    readonly step: string;
    readonly message: string;
  };
}

export interface Slice51LiveTestState {
  readonly status: "idle" | "running" | Slice51LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice51LiveTestResult;
}

export interface Slice51LiveTestServiceOptions {
  readonly logger: Logger;
  readonly core: Pick<CoreRuntime, "health">;
  readonly character: Pick<AdventureLandCharacterService, "state" | "requestStateRefresh">;
  readonly script: Pick<ScriptRuntimeService, "state" | "load" | "start" | "stop">;
  readonly clock?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

const HEARTBEAT_WAIT_MS = 4_000;
const POLL_MS = 50;

export class Slice51LiveTestService {
  readonly #logger: Logger;
  readonly #core: Pick<CoreRuntime, "health">;
  readonly #character: Pick<AdventureLandCharacterService, "state" | "requestStateRefresh">;
  readonly #script: Pick<ScriptRuntimeService, "state" | "load" | "start" | "stop">;
  readonly #clock: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice51LiveTestResult>;
  #state: Slice51LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 5.1 heartbeat test is ready.",
  });

  constructor(options: Slice51LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#core = options.core;
    this.#character = options.character;
    this.#script = options.script;
    this.#clock = options.clock ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live51-${randomUUID()}`);
  }

  state(): Slice51LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice51LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice51LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice51LiveTestStep[] = [];
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 5.1 is verifying Core, Character, and Script heartbeats.",
    });
    this.#logger.info("Slice 5.1 heartbeat test started.", {
      testId,
      mutation: false,
      components: ["core", "character", "script"],
    });

    try {
      const characterBefore = this.#character.state();
      if (characterBefore.status !== "connected") {
        throw new Slice51Failure(
          "LIVE_TEST_CHARACTER_NOT_CONNECTED",
          "Connect one headless character before running the heartbeat test.",
          "character-heartbeat",
          true,
        );
      }
      const scriptBefore = this.#script.state();
      if (scriptBefore.status === "running" || scriptBefore.status === "paused") {
        throw new Slice51Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "Stop the currently active script before running the heartbeat test.",
          "script-heartbeat",
          true,
        );
      }

      const coreBefore = this.#core.health();
      const coreAfter = await this.#waitFor(
        () => this.#core.health(),
        (value) => value.status === "running" &&
          value.heartbeatSequence > coreBefore.heartbeatSequence &&
          Boolean(value.lastHeartbeatAt),
      );
      if (!coreAfter) {
        throw new Slice51Failure(
          "LIVE_TEST_CORE_HEARTBEAT_TIMEOUT",
          "Core heartbeat did not advance within the bounded observation window.",
          "core-heartbeat",
        );
      }
      steps.push(Object.freeze({
        name: "core-heartbeat",
        outcome: "passed",
        message: "Core heartbeat advanced while the client remained running.",
        evidence: Object.freeze({
          beforeSequence: coreBefore.heartbeatSequence,
          afterSequence: coreAfter.heartbeatSequence,
          lastHeartbeatAt: coreAfter.lastHeartbeatAt,
        }),
      }));

      const characterSequence = characterBefore.heartbeatSequence ?? 0;
      this.#character.requestStateRefresh();
      const characterAfter = await this.#waitFor(
        () => this.#character.state(),
        (value) => value.status === "connected" &&
          (value.heartbeatSequence ?? 0) > characterSequence &&
          Boolean(value.lastHeartbeatAt),
      );
      if (!characterAfter) {
        throw new Slice51Failure(
          "LIVE_TEST_CHARACTER_HEARTBEAT_TIMEOUT",
          "Character heartbeat did not advance after the read-only live-state refresh.",
          "character-heartbeat",
        );
      }
      steps.push(Object.freeze({
        name: "character-heartbeat",
        outcome: "passed",
        message: "Character heartbeat advanced from real headless transport activity.",
        evidence: Object.freeze({
          beforeSequence: characterSequence,
          afterSequence: characterAfter.heartbeatSequence ?? 0,
          lastHeartbeatAt: characterAfter.lastHeartbeatAt,
          pingMs: characterAfter.pingMs,
        }),
      }));

      await this.#script.load({
        name: "slice-5-1-heartbeat-probe",
        source: 'console.info("slice51:heartbeat-probe");',
      });
      const started = await this.#script.start();
      if (started.status !== "running") {
        throw new Slice51Failure(
          "LIVE_TEST_SCRIPT_START_FAILED",
          started.message,
          "script-heartbeat",
        );
      }
      const scriptSequence = started.heartbeatSequence;
      const scriptAfter = await this.#waitFor(
        () => this.#script.state(),
        (value) => value.status === "running" &&
          value.heartbeatSequence >= scriptSequence + 2 &&
          Boolean(value.lastHeartbeatAt),
      );
      if (!scriptAfter) {
        throw new Slice51Failure(
          "LIVE_TEST_SCRIPT_HEARTBEAT_TIMEOUT",
          "Isolated script-worker heartbeat did not advance within the bounded observation window.",
          "script-heartbeat",
        );
      }
      steps.push(Object.freeze({
        name: "script-heartbeat",
        outcome: "passed",
        message: "The isolated worker emitted repeated host-observed heartbeats independent of script timers.",
        evidence: Object.freeze({
          runId: scriptAfter.runId,
          beforeSequence: scriptSequence,
          afterSequence: scriptAfter.heartbeatSequence,
          lastHeartbeatAt: scriptAfter.lastHeartbeatAt,
          activeTimers: scriptAfter.activeTimers,
        }),
      }));

      const stopped = await this.#script.stop();
      if (
        stopped.status !== "stopped" ||
        stopped.activeTimers !== 0 ||
        stopped.activeEventListeners !== 0
      ) {
        throw new Slice51Failure(
          "LIVE_TEST_HEARTBEAT_CLEANUP_FAILED",
          "Heartbeat probe did not finish with a clean stopped script runtime.",
          "final-cleanup",
        );
      }
      steps.push(Object.freeze({
        name: "final-cleanup",
        outcome: "passed",
        message: "Heartbeat probe stopped without timers, event listeners, reconnects, or gameplay mutations.",
        evidence: Object.freeze({
          status: stopped.status,
          activeTimers: stopped.activeTimers,
          activeEventListeners: stopped.activeEventListeners,
          finalHeartbeatSequence: stopped.heartbeatSequence,
        }),
      }));

      const result: Slice51LiveTestResult = Object.freeze({
        testId,
        slice: "5.1",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterName: characterAfter.characterName,
        serverKey: characterAfter.serverKey,
        message: "Slice 5.1 passed: Core, Character, and Script heartbeats advanced and cleanup remained passive.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 5.1 heartbeat test passed.", {
        testId,
        coreHeartbeatSequence: coreAfter.heartbeatSequence,
        characterHeartbeatSequence: characterAfter.heartbeatSequence,
        scriptHeartbeatSequence: scriptAfter.heartbeatSequence,
        gameplayMutation: false,
        recoveryAction: false,
      });
      return result;
    } catch (error) {
      await this.#script.stop().catch(() => undefined);
      const failure = error instanceof Slice51Failure
        ? error
        : new Slice51Failure(
          "UNEXPECTED_SLICE_5_1_FAILURE",
          error instanceof Error ? error.message : String(error),
          "unexpected",
        );
      const outcome: Slice51LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const character = this.#character.state();
      const result: Slice51LiveTestResult = Object.freeze({
        testId,
        slice: "5.1",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterName: character.characterName,
        serverKey: character.serverKey,
        message: failure.message,
        steps: Object.freeze(steps),
        error: Object.freeze({
          code: failure.code,
          step: failure.step,
          message: failure.message,
        }),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      if (failure.blocked) {
        this.#logger.warn("Slice 5.1 heartbeat test blocked.", {
          testId,
          code: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 5.1 heartbeat test failed.", failure, {
          testId,
          code: failure.code,
          step: failure.step,
        });
      }
      return result;
    }
  }

  async #waitFor<T>(
    read: () => T,
    predicate: (value: T) => boolean,
  ): Promise<T | undefined> {
    const deadline = Date.now() + HEARTBEAT_WAIT_MS;
    while (Date.now() <= deadline) {
      const value = read();
      if (predicate(value)) return value;
      await this.#delay(POLL_MS);
    }
    const final = read();
    return predicate(final) ? final : undefined;
  }
}

class Slice51Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice51Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}
