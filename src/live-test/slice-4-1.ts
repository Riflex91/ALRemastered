import { randomUUID } from "node:crypto";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice41LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice41LiveTestStep {
  readonly name: string;
  readonly outcome: "passed" | "failed";
  readonly evidence?: unknown;
}

export interface Slice41LiveTestResult {
  readonly testId: string;
  readonly outcome: Slice41LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly message: string;
  readonly errorCode?: string;
  readonly steps: readonly Slice41LiveTestStep[];
}

export interface Slice41LiveTestState {
  readonly status: "idle" | "running" | Slice41LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice41LiveTestResult;
}

export class Slice41LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: ScriptRuntimeService;
  #state: Slice41LiveTestState = {
    status: "idle",
    message: "Slice 4.1 one-click live test is ready.",
  };

  constructor(options: { logger: Logger; runtime: ScriptRuntimeService }) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
  }

  state(): Slice41LiveTestState {
    return structuredClone(this.#state);
  }

  async run(): Promise<Slice41LiveTestResult> {
    if (this.#state.status === "running") {
      return this.#finish(
        `live41-${randomUUID()}`,
        new Date().toISOString(),
        "blocked",
        "LIVE_TEST_ALREADY_RUNNING",
        [],
        "Slice 4.1 one-click live test is already running.",
      );
    }
    if (this.#runtime.state().status === "running") {
      return this.#finish(
        `live41-${randomUUID()}`,
        new Date().toISOString(),
        "blocked",
        "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
        [],
        "A script is already running. The one-click test did not interrupt it.",
      );
    }

    const testId = `live41-${randomUUID()}`;
    const startedAt = new Date().toISOString();
    const steps: Slice41LiveTestStep[] = [];
    this.#state = {
      status: "running",
      message: "Slice 4.1 one-click live test is running.",
    };
    this.#logger.info("Slice 4.1 one-click live test started.", { testId });

    try {
      const timerScriptName = "slice-4-1-live-timers";
      await this.#runtime.load({
        name: timerScriptName,
        source: [
          'console.info("slice41:boot");',
          'let ticks = 0;',
          'setInterval(() => { ticks += 1; console.info("slice41:tick:" + ticks); }, 40);',
        ].join("\n"),
      });
      const started = await this.#runtime.start();
      if (started.status !== "running") {
        throw new Error(`Timer script did not start: ${started.error?.message ?? started.message}`);
      }
      const timerLogsReady = await this.#waitFor(() =>
        this.#logger.records().filter((record) =>
          record.component === `script:${timerScriptName}` &&
          record.message.startsWith("slice41:tick:")
        ).length >= 2
      , 1_200);
      if (!timerLogsReady) throw new Error("Timer script produced no repeated timer evidence.");
      const beforePause = this.#scriptLogCount(timerScriptName);
      steps.push({
        name: "load-start-and-script-logging",
        outcome: "passed",
        evidence: {
          status: started.status,
          component: `script:${timerScriptName}`,
          logRecords: beforePause,
          activeTimers: this.#runtime.state().activeTimers,
        },
      });

      const paused = await this.#runtime.pause();
      if (paused.status !== "paused" || paused.activeTimers !== 0) {
        throw new Error("Pause did not clear the script timer lifecycle.");
      }
      const pausedCount = this.#scriptLogCount(timerScriptName);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const afterPause = this.#scriptLogCount(timerScriptName);
      if (afterPause !== pausedCount) {
        throw new Error("Script timer logs continued after pause.");
      }
      steps.push({
        name: "pause-clears-timers",
        outcome: "passed",
        evidence: {
          status: paused.status,
          activeTimers: paused.activeTimers,
          logRecordsBeforeWait: pausedCount,
          logRecordsAfterWait: afterPause,
        },
      });

      const restarted = await this.#runtime.start();
      if (restarted.status !== "running") throw new Error("Paused script could not start a fresh isolated run.");
      const restartBaseline = this.#scriptLogCount(timerScriptName);
      const restartedLogs = await this.#waitFor(
        () => this.#scriptLogCount(timerScriptName) > restartBaseline,
        1_000,
      );
      if (!restartedLogs) throw new Error("Restarted script produced no log evidence.");
      const stopped = await this.#runtime.stop();
      if (stopped.status !== "stopped" || stopped.activeTimers !== 0) {
        throw new Error("Stop did not release script timers and worker resources.");
      }
      steps.push({
        name: "restart-and-stop",
        outcome: "passed",
        evidence: {
          restartedStatus: restarted.status,
          stoppedStatus: stopped.status,
          activeTimers: stopped.activeTimers,
        },
      });

      const crashScriptName = "slice-4-1-live-crash";
      await this.#runtime.load({
        name: crashScriptName,
        source: 'throw new Error("slice41-intentional-crash");',
      });
      const crashed = await this.#runtime.start();
      if (crashed.status !== "crashed" || !crashed.error?.message.includes("slice41-intentional-crash")) {
        throw new Error("Intentional script crash was not isolated and reported.");
      }
      steps.push({
        name: "crash-isolation",
        outcome: "passed",
        evidence: {
          status: crashed.status,
          errorName: crashed.error?.name,
          errorMessage: crashed.error?.message,
          coreIsolated: true,
        },
      });

      const recoveryName = "slice-4-1-live-recovery";
      await this.#runtime.load({
        name: recoveryName,
        source: 'console.info("slice41:recovered");',
      });
      const recovered = await this.#runtime.start();
      const recoveryLogged = await this.#waitFor(
        () => this.#logger.records().some((record) =>
          record.component === `script:${recoveryName}` &&
          record.message === "slice41:recovered"
        ),
        800,
      );
      if (recovered.status !== "running" || !recoveryLogged) {
        throw new Error("Script runtime did not recover after the isolated crash.");
      }
      const final = await this.#runtime.stop();
      steps.push({
        name: "post-crash-recovery",
        outcome: "passed",
        evidence: {
          recoveredStatus: recovered.status,
          finalStatus: final.status,
          recoveryLogMarked: recoveryLogged,
        },
      });

      const result = this.#finish(
        testId,
        startedAt,
        "passed",
        undefined,
        steps,
        "Slice 4.1 one-click live test passed.",
      );
      this.#logger.info("Slice 4.1 one-click live test passed.", {
        testId,
        steps: steps.map((step) => step.name),
      });
      return result;
    } catch (error) {
      await this.#runtime.stop().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      const result = this.#finish(
        testId,
        startedAt,
        "failed",
        "LIVE_TEST_SCRIPT_RUNTIME_FAILED",
        steps,
        message,
      );
      this.#logger.error("Slice 4.1 one-click live test failed.", error, { testId });
      return result;
    }
  }

  #scriptLogCount(scriptName: string): number {
    return this.#logger.records().filter((record) => record.component === `script:${scriptName}`).length;
  }

  async #waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return check();
  }

  #finish(
    testId: string,
    startedAt: string,
    outcome: Slice41LiveTestOutcome,
    errorCode: string | undefined,
    steps: readonly Slice41LiveTestStep[],
    message: string,
  ): Slice41LiveTestResult {
    const result: Slice41LiveTestResult = {
      testId,
      outcome,
      startedAt,
      completedAt: new Date().toISOString(),
      message,
      errorCode,
      steps,
    };
    this.#state = {
      status: outcome,
      message,
      lastResult: result,
    };
    return result;
  }
}
