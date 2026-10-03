import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice43LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice43LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly detail: string;
}

export interface Slice43LiveTestResult {
  readonly testId: string;
  readonly slice: "4.3";
  readonly outcome: Slice43LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly observedEvent: "entities";
  readonly message: string;
  readonly steps: readonly Slice43LiveTestStep[];
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface Slice43LiveTestState {
  readonly status: "idle" | "running" | Slice43LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice43LiveTestResult;
}

export interface Slice43LiveTestServiceOptions {
  readonly logger: Logger;
  readonly runtime: ScriptRuntimeService;
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "requestStateRefresh"
  >;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

const SCRIPT_NAME = "slice-4-3-live-events";
const EVENT_MARKER = "slice43:event:entities";
const OFF_MARKER = "slice43:off:entities";
const READY_MARKER = "slice43:listener-ready";
const PERSISTENT_PREFIX = "slice43:persistent-event:";
const CRASH_MESSAGE = "Slice 4.3 handler crash probe";

export class Slice43LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: ScriptRuntimeService;
  readonly #character: Pick<
    AdventureLandCharacterService,
    "state" | "requestStateRefresh"
  >;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice43LiveTestResult>;
  #state: Slice43LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 4.3 one-click live test is ready.",
  });

  constructor(options: Slice43LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#character = options.character;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live43-${randomUUID()}`);
  }

  state(): Slice43LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice43LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice43LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice43LiveTestStep[] = [];
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 4.3 one-click live test is running.",
    });
    this.#logger.info("Slice 4.3 one-click live test started.", {
      testId,
      observedEvent: "entities",
      readOnlyRefresh: true,
    });

    const initialCharacter = this.#character.state();
    try {
      if (this.#runtime.state().status === "running") {
        throw new Slice43LiveTestFailure(
          "SCRIPT_RUNTIME_BUSY",
          "A script is already running. The Slice 4.3 live test did not interrupt it.",
          true,
        );
      }
      if (initialCharacter.status !== "connected" || !initialCharacter.character) {
        throw new Slice43LiveTestFailure(
          "CHARACTER_NOT_CONNECTED",
          "Connect a headless Adventure Land character before starting the Slice 4.3 live test.",
          true,
        );
      }

      await this.#verifySubscribeAndOff(steps);
      await this.#verifyPauseRestartCleanup(steps);
      await this.#verifyCrashIsolation(steps);

      const finalState = await this.#runtime.stop();
      if (finalState.status !== "stopped" || finalState.activeEventListeners !== 0) {
        throw new Slice43LiveTestFailure(
          "FINAL_RUNTIME_CLEANUP_FAILED",
          "The Slice 4.3 runtime did not finish stopped with zero event listeners.",
        );
      }
      steps.push(Object.freeze({
        name: "final-runtime-cleanup",
        outcome: "passed",
        detail: "The isolated runtime finished stopped with zero active event listeners.",
      }));

      const completedAt = this.#clock().toISOString();
      const result: Slice43LiveTestResult = Object.freeze({
        testId,
        slice: "4.3",
        outcome: "passed",
        startedAt,
        completedAt,
        characterId: initialCharacter.characterId,
        characterName: initialCharacter.characterName,
        serverKey: initialCharacter.serverKey,
        observedEvent: "entities",
        message:
          "Slice 4.3 passed: a real headless entities event reached an isolated script as a safe snapshot, off()/pause/stop/restart cleanup was enforced, and a handler crash remained isolated from the connected core.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 4.3 one-click live test passed.", {
        testId,
        stepCount: steps.length,
        observedEvent: "entities",
        finalRuntimeStatus: finalState.status,
        activeEventListeners: finalState.activeEventListeners,
      });
      return result;
    } catch (error) {
      const failure = normalizeFailure(error);
      await this.#runtime.stop().catch(() => undefined);
      const outcome: Slice43LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const result: Slice43LiveTestResult = Object.freeze({
        testId,
        slice: "4.3",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterId: initialCharacter.characterId,
        characterName: initialCharacter.characterName,
        serverKey: initialCharacter.serverKey,
        observedEvent: "entities",
        message: failure.message,
        steps: Object.freeze(steps),
        error: Object.freeze({ code: failure.code, message: failure.message }),
      });
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      if (failure.blocked) {
        this.#logger.warn("Slice 4.3 one-click live test blocked.", {
          testId,
          code: failure.code,
          message: failure.message,
        });
      } else {
        this.#logger.error("Slice 4.3 one-click live test failed.", failure, {
          testId,
          code: failure.code,
        });
      }
      return result;
    }
  }

  async #verifySubscribeAndOff(steps: Slice43LiveTestStep[]): Promise<void> {
    await this.#runtime.load({
      name: SCRIPT_NAME,
      source: [
        "function handler(payload) {",
        "  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Slice 4.3 event payload is not a record snapshot.');",
        "  if (typeof payload.send === 'function' || typeof payload.close === 'function') throw new Error('Slice 4.3 leaked a transport object.');",
        "  if (payload.auth !== undefined && payload.auth !== '[REDACTED]') throw new Error('Slice 4.3 event payload leaked auth data.');",
        `  console.info('${EVENT_MARKER}');`,
        "  off('entities', handler);",
        `  console.info('${OFF_MARKER}');`,
        "}",
        "on('entities', handler);",
        `console.info('${READY_MARKER}');`,
      ].join("\n"),
    });
    const running = await this.#runtime.start();
    if (running.status !== "running") {
      throw new Slice43LiveTestFailure(
        "EVENT_SCRIPT_START_FAILED",
        "The Slice 4.3 event listener script did not start.",
      );
    }
    if (!await waitFor(() => this.#runtime.state().activeEventListeners === 1, 1_000)) {
      throw new Slice43LiveTestFailure(
        "LISTENER_REGISTRATION_FAILED",
        "The isolated script did not register its entities listener.",
      );
    }
    const observed = await this.#requestFreshEventsUntil(
      () => this.#hasScriptLog(EVENT_MARKER),
    );
    if (!observed) {
      throw new Slice43LiveTestFailure(
        "LIVE_EVENT_UNAVAILABLE",
        "No fresh real entities event arrived during the bounded read-only live-state refresh window.",
        true,
      );
    }
    if (
      !await waitFor(
        () => this.#hasScriptLog(OFF_MARKER) &&
          this.#runtime.state().activeEventListeners === 0,
        1_000,
      )
    ) {
      throw new Slice43LiveTestFailure(
        "OFF_CLEANUP_FAILED",
        "off() did not remove the registered entities listener.",
      );
    }
    steps.push(Object.freeze({
      name: "subscribe-real-event-and-off",
      outcome: "passed",
      detail:
        "A fresh server entities event reached the worker as a safe snapshot and off() reduced active listeners to zero.",
    }));

    const callbackCount = this.#scriptLogCount(EVENT_MARKER);
    this.#character.requestStateRefresh();
    await delay(250);
    this.#character.requestStateRefresh();
    await delay(250);
    if (this.#scriptLogCount(EVENT_MARKER) !== callbackCount) {
      throw new Slice43LiveTestFailure(
        "OFF_CALLBACK_LEAK",
        "The removed listener received another callback after off().",
      );
    }
    await this.#runtime.stop();
    this.#character.requestStateRefresh();
    await delay(200);
    if (this.#scriptLogCount(EVENT_MARKER) !== callbackCount) {
      throw new Slice43LiveTestFailure(
        "STOP_CALLBACK_LEAK",
        "The stopped worker received another event callback.",
      );
    }
    steps.push(Object.freeze({
      name: "off-and-stop-suppress-callbacks",
      outcome: "passed",
      detail: "Fresh read-only refreshes produced no callback after off() or script stop.",
    }));
  }

  async #verifyPauseRestartCleanup(steps: Slice43LiveTestStep[]): Promise<void> {
    await this.#runtime.load({
      name: SCRIPT_NAME,
      source: [
        "let seen = 0;",
        "on('entities', () => { seen += 1; console.info('slice43:persistent-event:' + seen); });",
        `console.info('${READY_MARKER}');`,
      ].join("\n"),
    });
    const firstRun = await this.#runtime.start();
    const firstRunId = firstRun.runId;
    if (firstRun.status !== "running" || !firstRunId) {
      throw new Slice43LiveTestFailure(
        "PERSISTENT_SCRIPT_START_FAILED",
        "The cleanup probe script did not start.",
      );
    }
    if (!await waitFor(() => this.#runtime.state().activeEventListeners === 1, 1_000)) {
      throw new Slice43LiveTestFailure(
        "PERSISTENT_LISTENER_REGISTRATION_FAILED",
        "The cleanup probe listener did not register.",
      );
    }
    if (!await this.#requestFreshEventsUntil(() => this.#persistentLogCount() >= 1)) {
      throw new Slice43LiveTestFailure(
        "PERSISTENT_EVENT_UNAVAILABLE",
        "The cleanup probe received no fresh entities event.",
        true,
      );
    }
    const countBeforePause = this.#persistentLogCount();
    const paused = await this.#runtime.pause();
    if (paused.status !== "paused" || paused.activeEventListeners !== 0) {
      throw new Slice43LiveTestFailure(
        "PAUSE_LISTENER_CLEANUP_FAILED",
        "Pause did not clear all script event listeners.",
      );
    }
    this.#character.requestStateRefresh();
    await delay(250);
    if (this.#persistentLogCount() !== countBeforePause) {
      throw new Slice43LiveTestFailure(
        "PAUSED_CALLBACK_LEAK",
        "A paused worker received another event callback.",
      );
    }

    const restarted = await this.#runtime.start();
    if (restarted.status !== "running" || !restarted.runId || restarted.runId === firstRunId) {
      throw new Slice43LiveTestFailure(
        "RESTART_RUN_ID_FAILED",
        "Restart did not create a fresh isolated worker run.",
      );
    }
    if (!await waitFor(() => this.#runtime.state().activeEventListeners === 1, 1_000)) {
      throw new Slice43LiveTestFailure(
        "RESTART_LISTENER_REGISTRATION_FAILED",
        "The restarted worker did not register a fresh event listener.",
      );
    }
    if (!await this.#requestFreshEventsUntil(() => this.#persistentLogCount() > countBeforePause)) {
      throw new Slice43LiveTestFailure(
        "RESTART_EVENT_UNAVAILABLE",
        "The restarted worker received no fresh entities event.",
        true,
      );
    }
    await this.#runtime.stop();
    steps.push(Object.freeze({
      name: "pause-and-restart-cleanup",
      outcome: "passed",
      detail:
        "Pause removed listeners, the paused worker stayed silent, and restart created a fresh run with a fresh listener.",
    }));
  }

  async #verifyCrashIsolation(steps: Slice43LiveTestStep[]): Promise<void> {
    await this.#runtime.load({
      name: SCRIPT_NAME,
      source: [
        `on('entities', () => { throw new Error('${CRASH_MESSAGE}'); });`,
        `console.info('${READY_MARKER}');`,
      ].join("\n"),
    });
    const running = await this.#runtime.start();
    if (running.status !== "running") {
      throw new Slice43LiveTestFailure(
        "CRASH_PROBE_START_FAILED",
        "The handler crash probe script did not start.",
      );
    }
    if (!await waitFor(() => this.#runtime.state().activeEventListeners === 1, 1_000)) {
      throw new Slice43LiveTestFailure(
        "CRASH_LISTENER_REGISTRATION_FAILED",
        "The crash probe listener did not register.",
      );
    }
    if (!await this.#requestFreshEventsUntil(() => this.#runtime.state().status === "crashed")) {
      throw new Slice43LiveTestFailure(
        "CRASH_PROBE_EVENT_UNAVAILABLE",
        "The handler crash probe received no fresh entities event.",
        true,
      );
    }
    const crashed = this.#runtime.state();
    if (
      crashed.status !== "crashed" ||
      crashed.activeEventListeners !== 0 ||
      !crashed.error?.message.includes(CRASH_MESSAGE)
    ) {
      throw new Slice43LiveTestFailure(
        "HANDLER_CRASH_NOT_ISOLATED",
        "The script handler crash was not isolated and cleaned up as expected.",
      );
    }
    if (this.#character.state().status !== "connected") {
      throw new Slice43LiveTestFailure(
        "HANDLER_CRASH_AFFECTED_CORE",
        "The script handler crash affected the headless character connection.",
      );
    }
    this.#character.requestStateRefresh();
    await delay(200);
    if (this.#runtime.state().status !== "crashed") {
      throw new Slice43LiveTestFailure(
        "CRASHED_WORKER_RECEIVED_EVENT",
        "The crashed worker resumed after a later game event.",
      );
    }
    steps.push(Object.freeze({
      name: "handler-crash-isolation",
      outcome: "passed",
      detail:
        "A throwing event handler crashed only its isolated worker, cleared listeners, and left the headless character connected.",
    }));
  }

  async #requestFreshEventsUntil(check: () => boolean): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      this.#character.requestStateRefresh();
      if (await waitFor(check, 450)) return true;
    }
    return check();
  }

  #hasScriptLog(message: string): boolean {
    return this.#logger.records().some((record) =>
      record.component === `script:${SCRIPT_NAME}` && record.message === message
    );
  }

  #scriptLogCount(message: string): number {
    return this.#logger.records().filter((record) =>
      record.component === `script:${SCRIPT_NAME}` && record.message === message
    ).length;
  }

  #persistentLogCount(): number {
    return this.#logger.records().filter((record: LogRecord) =>
      record.component === `script:${SCRIPT_NAME}` &&
      record.message.startsWith(PERSISTENT_PREFIX)
    ).length;
  }
}

class Slice43LiveTestFailure extends Error {
  readonly code: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, blocked = false) {
    super(message);
    this.name = "Slice43LiveTestFailure";
    this.code = code;
    this.blocked = blocked;
  }
}

function normalizeFailure(error: unknown): Slice43LiveTestFailure {
  if (error instanceof Slice43LiveTestFailure) return error;
  return new Slice43LiveTestFailure(
    "UNEXPECTED_SLICE_4_3_FAILURE",
    error instanceof Error ? error.message : String(error),
  );
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) return true;
    await delay(20);
  }
  return check();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
