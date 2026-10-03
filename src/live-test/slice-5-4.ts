import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { WatchdogService } from "../recovery/watchdog.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice54LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice54LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice54LiveTestResult {
  readonly testId: string;
  readonly slice: "5.4";
  readonly outcome: Slice54LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice54LiveTestStep[];
  readonly error?: {
    readonly code: string;
    readonly step: string;
    readonly message: string;
  };
}

export interface Slice54LiveTestState {
  readonly status: "idle" | "running" | Slice54LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice54LiveTestResult;
}

export interface Slice54LiveTestServiceOptions {
  readonly logger: Logger;
  readonly watchdog: Pick<
    WatchdogService,
    "state" | "checkNow" | "resetBudget"
  >;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly script: Pick<
    ScriptRuntimeService,
    "state" | "load" | "start" | "stop" | "setHeartbeatSuppressedForTest"
  >;
  readonly clock?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

const TEST_WAIT_MS = 12_000;
const POLL_MS = 50;
const LOOP_GUARD_CONFIRM_MS = 1_200;
const SCRIPT_NAME = "slice-5-4-watchdog-probe";

export class Slice54LiveTestService {
  readonly #logger: Logger;
  readonly #watchdog: Slice54LiveTestServiceOptions["watchdog"];
  readonly #character: Slice54LiveTestServiceOptions["character"];
  readonly #script: Slice54LiveTestServiceOptions["script"];
  readonly #clock: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice54LiveTestResult>;
  #state: Slice54LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 5.4 watchdog/restart-guard test is ready.",
  });

  constructor(options: Slice54LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#watchdog = options.watchdog;
    this.#character = options.character;
    this.#script = options.script;
    this.#clock = options.clock ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live54-${randomUUID()}`);
  }

  state(): Slice54LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice54LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice54LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice54LiveTestStep[] = [];
    const logStartId = this.#logger.records().at(-1)?.id ?? 0;
    let testScriptLoaded = false;
    let heartbeatSuppressed = false;
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 5.4 is verifying stall detection, controlled restart, restart budget, and loop protection.",
    });
    this.#logger.info("Slice 5.4 watchdog/restart-guard test started.", {
      testId,
      gameplayMutation: false,
      rawSocketAccess: false,
      stallInjection: "host-observed-script-heartbeat-suppression",
    });

    try {
      const character = this.#character.state();
      if (character.status !== "connected") {
        throw new Slice54Failure(
          "LIVE_TEST_CHARACTER_NOT_CONNECTED",
          "Connect one headless character before running the watchdog/restart-guard test.",
          "preflight",
          true,
        );
      }
      const watchdogBefore = this.#watchdog.state();
      if (watchdogBefore.status !== "running") {
        throw new Slice54Failure(
          "LIVE_TEST_WATCHDOG_NOT_RUNNING",
          "The production watchdog must be running before the Slice 5.4 test starts.",
          "preflight",
          true,
        );
      }
      const runtimeBefore = this.#script.state();
      if (runtimeBefore.status === "running" || runtimeBefore.status === "paused") {
        throw new Slice54Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "Stop the active script before running the bounded Slice 5.4 watchdog probe.",
          "preflight",
          true,
        );
      }

      this.#watchdog.resetBudget("script");
      const baselineRestartCount = this.#watchdog.state().components.script.restartCount;
      await this.#script.load({
        name: SCRIPT_NAME,
        source: 'console.info("slice54:watchdog-probe-running");',
      });
      testScriptLoaded = true;
      const started = await this.#script.start();
      if (started.status !== "running" || !started.runId) {
        throw new Slice54Failure(
          "LIVE_TEST_WATCHDOG_PROBE_NOT_RUNNING",
          "The isolated watchdog probe did not reach running state.",
          "healthy-heartbeat",
        );
      }
      const initialRunId = started.runId;
      const healthy = await this.#waitFor(
        () => this.#script.state(),
        (value) =>
          value.status === "running" &&
          value.runId === initialRunId &&
          value.heartbeatSequence >= started.heartbeatSequence + 2 &&
          Boolean(value.lastHeartbeatAt),
      );
      if (!healthy) {
        throw new Slice54Failure(
          "LIVE_TEST_HEALTHY_HEARTBEAT_MISSING",
          "The watchdog probe did not establish repeated healthy worker heartbeats before stall injection.",
          "healthy-heartbeat",
        );
      }
      steps.push(Object.freeze({
        name: "healthy-heartbeat",
        outcome: "passed",
        message: "The isolated worker established repeated healthy heartbeats before the watchdog stall injection.",
        evidence: Object.freeze({
          runId: initialRunId,
          heartbeatSequence: healthy.heartbeatSequence,
          lastHeartbeatAt: healthy.lastHeartbeatAt,
          watchdogRestartCount: baselineRestartCount,
        }),
      }));

      this.#script.setHeartbeatSuppressedForTest(true);
      heartbeatSuppressed = true;
      const firstRestart = await this.#waitFor(
        () => ({
          watchdog: this.#watchdog.state(),
          script: this.#script.state(),
        }),
        (value) =>
          value.watchdog.components.script.restartCount > baselineRestartCount &&
          Boolean(value.watchdog.components.script.lastRestartAt) &&
          value.script.status === "running" &&
          value.script.runId !== initialRunId,
      );
      if (!firstRestart) {
        throw new Slice54Failure(
          "LIVE_TEST_STALL_RESTART_NOT_OBSERVED",
          "The production watchdog did not detect the suppressed Script heartbeat and complete a controlled restart.",
          "controlled-restart",
        );
      }
      const firstRestartRecord = this.#findLogAfter(
        logStartId,
        "Watchdog controlled restart completed.",
        "script",
      );
      steps.push(Object.freeze({
        name: "controlled-restart",
        outcome: "passed",
        message: "The production watchdog detected the Script stall and restarted the isolated worker in place.",
        evidence: Object.freeze({
          runIdBefore: initialRunId,
          runIdAfter: firstRestart.script.runId,
          restartCount: firstRestart.watchdog.components.script.restartCount,
          budgetUsed: firstRestart.watchdog.components.script.budgetUsed,
          lastRestartAt: firstRestart.watchdog.components.script.lastRestartAt,
          restartLogRecordId: firstRestartRecord?.id,
        }),
      }));

      const budgetExhausted = await this.#waitFor(
        () => this.#watchdog.state(),
        (value) =>
          value.components.script.blocked &&
          value.components.script.restartCount >= baselineRestartCount + 2 &&
          value.components.script.budgetUsed >= value.components.script.budgetLimit,
      );
      if (!budgetExhausted) {
        throw new Slice54Failure(
          "LIVE_TEST_RESTART_BUDGET_NOT_EXHAUSTED",
          "Repeated Script stalls did not reach the configured restart budget and blocked state.",
          "restart-budget",
        );
      }
      const budgetRecord = this.#findLogAfter(
        logStartId,
        "Watchdog restart budget exhausted.",
        "script",
      );
      steps.push(Object.freeze({
        name: "restart-budget",
        outcome: "passed",
        message: "Repeated stalls consumed the bounded Script restart budget and entered an explicit blocked state.",
        evidence: Object.freeze({
          restartCount: budgetExhausted.components.script.restartCount,
          budgetUsed: budgetExhausted.components.script.budgetUsed,
          budgetLimit: budgetExhausted.components.script.budgetLimit,
          blocked: budgetExhausted.components.script.blocked,
          budgetLogRecordId: budgetRecord?.id,
        }),
      }));

      const countAtBlock = budgetExhausted.components.script.restartCount;
      const restartLogsAtBlock = this.#countLogsAfter(
        logStartId,
        "Watchdog controlled restart started.",
        "script",
      );
      await this.#delay(LOOP_GUARD_CONFIRM_MS);
      await this.#watchdog.checkNow();
      const guarded = this.#watchdog.state();
      const restartLogsAfterGuard = this.#countLogsAfter(
        logStartId,
        "Watchdog controlled restart started.",
        "script",
      );
      if (
        !guarded.components.script.blocked ||
        guarded.components.script.restartCount !== countAtBlock ||
        restartLogsAfterGuard !== restartLogsAtBlock
      ) {
        throw new Slice54Failure(
          "LIVE_TEST_RESTART_LOOP_GUARD_FAILED",
          "The watchdog attempted another Script restart after the restart budget was exhausted.",
          "no-restart-loop",
        );
      }
      steps.push(Object.freeze({
        name: "no-restart-loop",
        outcome: "passed",
        message: "The exhausted restart budget prevented any further restart loop during the confirmation window.",
        evidence: Object.freeze({
          restartCountBeforeGuard: countAtBlock,
          restartCountAfterGuard: guarded.components.script.restartCount,
          restartLogsBeforeGuard: restartLogsAtBlock,
          restartLogsAfterGuard,
          blocked: guarded.components.script.blocked,
          confirmationWindowMs: LOOP_GUARD_CONFIRM_MS,
        }),
      }));

      this.#script.setHeartbeatSuppressedForTest(false);
      heartbeatSuppressed = false;
      const stopped = await this.#script.stop();
      testScriptLoaded = false;
      this.#watchdog.resetBudget("script");
      const finalWatchdog = this.#watchdog.state();
      if (
        stopped.status !== "stopped" ||
        stopped.activeTimers !== 0 ||
        stopped.activeEventListeners !== 0 ||
        finalWatchdog.components.script.blocked
      ) {
        throw new Slice54Failure(
          "LIVE_TEST_WATCHDOG_CLEANUP_FAILED",
          "The watchdog probe did not finish with clean worker resources and a reset Script restart budget.",
          "final-cleanup",
        );
      }
      steps.push(Object.freeze({
        name: "final-cleanup",
        outcome: "passed",
        message: "Heartbeat observation was restored, the probe worker stopped cleanly, and the Script restart budget was reset.",
        evidence: Object.freeze({
          scriptStatus: stopped.status,
          activeTimers: stopped.activeTimers,
          activeEventListeners: stopped.activeEventListeners,
          watchdogStatus: finalWatchdog.status,
          scriptBlocked: finalWatchdog.components.script.blocked,
          scriptBudgetUsed: finalWatchdog.components.script.budgetUsed,
          totalScriptRestartCount: finalWatchdog.components.script.restartCount,
        }),
      }));

      const result: Slice54LiveTestResult = Object.freeze({
        testId,
        slice: "5.4",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterName: character.characterName,
        serverKey: character.serverKey,
        message: "Slice 5.4 passed: stall detection, controlled restart, bounded restart budget, and restart-loop protection were verified.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 5.4 watchdog/restart-guard test passed.", {
        testId,
        scriptRestarts: finalWatchdog.components.script.restartCount - baselineRestartCount,
        budgetLimit: finalWatchdog.maxRestartsPerWindow,
        restartLoopPrevented: true,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
      return result;
    } catch (error) {
      if (heartbeatSuppressed) {
        try {
          this.#script.setHeartbeatSuppressedForTest(false);
        } catch {}
      }
      if (testScriptLoaded) {
        try {
          await this.#script.stop();
        } catch {}
      }
      try {
        this.#watchdog.resetBudget("script");
      } catch {}
      const failure = error instanceof Slice54Failure
        ? error
        : new Slice54Failure(
          "UNEXPECTED_SLICE_5_4_FAILURE",
          error instanceof Error ? error.message : String(error),
          "unexpected",
        );
      const outcome: Slice54LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const character = this.#character.state();
      const result: Slice54LiveTestResult = Object.freeze({
        testId,
        slice: "5.4",
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
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      if (failure.blocked) {
        this.#logger.warn("Slice 5.4 watchdog/restart-guard test blocked.", {
          testId,
          code: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 5.4 watchdog/restart-guard test failed.", failure, {
          testId,
          code: failure.code,
          step: failure.step,
        });
      }
      return result;
    }
  }

  #findLogAfter(
    afterId: number,
    message: string,
    component: string,
  ): LogRecord | undefined {
    return this.#logger.records().find((record) =>
      record.id > afterId &&
      record.message === message &&
      recordContext(record)?.component === component
    );
  }

  #countLogsAfter(
    afterId: number,
    message: string,
    component: string,
  ): number {
    return this.#logger.records().filter((record) =>
      record.id > afterId &&
      record.message === message &&
      recordContext(record)?.component === component
    ).length;
  }

  async #waitFor<T>(
    read: () => T,
    predicate: (value: T) => boolean,
  ): Promise<T | undefined> {
    const deadline = Date.now() + TEST_WAIT_MS;
    while (Date.now() <= deadline) {
      const value = read();
      if (predicate(value)) return value;
      await this.#delay(POLL_MS);
    }
    const final = read();
    return predicate(final) ? final : undefined;
  }
}

class Slice54Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice54Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function recordContext(record: LogRecord): Record<string, unknown> | undefined {
  return record.context && typeof record.context === "object" && !Array.isArray(record.context)
    ? record.context as Record<string, unknown>
    : undefined;
}
