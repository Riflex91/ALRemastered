import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice52LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice52LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice52LiveTestResult {
  readonly testId: string;
  readonly slice: "5.2";
  readonly outcome: Slice52LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice52LiveTestStep[];
  readonly error?: {
    readonly code: string;
    readonly step: string;
    readonly message: string;
  };
}

export interface Slice52LiveTestState {
  readonly status: "idle" | "running" | Slice52LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice52LiveTestResult;
}

export interface Slice52LiveTestServiceOptions {
  readonly logger: Logger;
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "interruptForReconnectTest" | "requestStateRefresh"
  >;
  readonly script: Pick<ScriptRuntimeService, "state">;
  readonly clock?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

const RECOVERY_WAIT_MS = 20_000;
const POLL_MS = 50;

export class Slice52LiveTestService {
  readonly #logger: Logger;
  readonly #character: Slice52LiveTestServiceOptions["character"];
  readonly #script: Pick<ScriptRuntimeService, "state">;
  readonly #clock: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice52LiveTestResult>;
  #state: Slice52LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 5.2 disconnect/reconnect test is ready.",
  });

  constructor(options: Slice52LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#character = options.character;
    this.#script = options.script;
    this.#clock = options.clock ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live52-${randomUUID()}`);
  }

  state(): Slice52LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice52LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice52LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice52LiveTestStep[] = [];
    const logStartId = this.#logger.records().at(-1)?.id ?? 0;
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 5.2 is interrupting the character transport and verifying bounded reconnect.",
    });
    this.#logger.info("Slice 5.2 disconnect/reconnect test started.", {
      testId,
      gameplayMutation: false,
      recoveryAction: "character-reconnect",
    });

    try {
      const before = this.#character.state();
      if (before.status !== "connected" || !before.characterId) {
        throw new Slice52Failure(
          "LIVE_TEST_CHARACTER_NOT_CONNECTED",
          "Connect one headless character before running the reconnect test.",
          "preflight",
          true,
        );
      }
      const script = this.#script.state();
      if (script.status === "running" || script.status === "paused") {
        throw new Slice52Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "Stop the active script before intentionally interrupting the character transport.",
          "preflight",
          true,
        );
      }
      const baselineReconnectCount = before.reconnectCount ?? 0;
      const baselineHeartbeat = before.heartbeatSequence ?? 0;
      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message: "A connected character is available and no script automation is active.",
        evidence: Object.freeze({
          characterId: before.characterId,
          characterName: before.characterName,
          serverKey: before.serverKey,
          reconnectCount: baselineReconnectCount,
          heartbeatSequence: baselineHeartbeat,
        }),
      }));

      this.#character.interruptForReconnectTest();

      const recovering = await this.#waitFor(
        () => this.#character.state(),
        (value) =>
          value.status === "reconnecting" &&
          (value.reconnectAttempt ?? 0) >= 1 &&
          (value.reconnectDelayMs ?? 0) > 0 &&
          Boolean(value.lastDisconnectAt),
      );
      if (!recovering) {
        throw new Slice52Failure(
          "LIVE_TEST_DISCONNECT_NOT_DETECTED",
          "The service did not expose the intentional transport loss and scheduled reconnect state.",
          "disconnect-detected",
        );
      }
      steps.push(Object.freeze({
        name: "disconnect-detected",
        outcome: "passed",
        message: "The unexpected socket close was detected and exposed as reconnecting.",
        evidence: Object.freeze({
          errorCode: recovering.errorCode,
          lastDisconnectAt: recovering.lastDisconnectAt,
          reconnectAttempt: recovering.reconnectAttempt,
        }),
      }));
      steps.push(Object.freeze({
        name: "backoff-scheduled",
        outcome: "passed",
        message: "A bounded reconnect attempt was scheduled with deterministic backoff.",
        evidence: Object.freeze({
          reconnectAttempt: recovering.reconnectAttempt,
          reconnectDelayMs: recovering.reconnectDelayMs,
          reconnectScheduledAt: recovering.reconnectScheduledAt,
        }),
      }));

      const restored = await this.#waitFor(
        () => this.#character.state(),
        (value) =>
          value.status === "connected" &&
          (value.reconnectCount ?? 0) > baselineReconnectCount &&
          Boolean(value.lastReconnectAt),
      );
      if (!restored) {
        throw new Slice52Failure(
          "LIVE_TEST_RECONNECT_TIMEOUT",
          "The character did not reconnect within the bounded recovery window.",
          "reconnect-restored",
        );
      }

      const records = this.#logger.records().filter((record) => record.id > logStartId);
      const sequence = this.#requiredSequence(records);
      if (!sequence) {
        throw new Slice52Failure(
          "LIVE_TEST_RECONNECT_LOG_SEQUENCE_INCOMPLETE",
          "Reconnect completed, but the required disconnect/backoff/attempt/reconnected log sequence was incomplete.",
          "log-sequence",
        );
      }
      steps.push(Object.freeze({
        name: "log-sequence",
        outcome: "passed",
        message: "Disconnect, backoff, reconnect attempt, and restored connection were logged in order.",
        evidence: Object.freeze({
          records: Object.freeze(sequence.map((record) => Object.freeze({
            id: record.id,
            message: record.message,
          }))),
        }),
      }));

      const reconnectedHeartbeat = restored.heartbeatSequence ?? 0;
      this.#character.requestStateRefresh();
      const refreshed = await this.#waitFor(
        () => this.#character.state(),
        (value) =>
          value.status === "connected" &&
          (value.heartbeatSequence ?? 0) > reconnectedHeartbeat &&
          Boolean(value.lastHeartbeatAt),
      );
      if (!refreshed) {
        throw new Slice52Failure(
          "LIVE_TEST_RECONNECTED_TRANSPORT_NOT_LIVE",
          "Reconnect succeeded but a fresh read-only live-state update did not arrive.",
          "reconnect-restored",
        );
      }
      steps.push(Object.freeze({
        name: "reconnect-restored",
        outcome: "passed",
        message: "The reconnected transport delivered a fresh live-state heartbeat without gameplay mutation.",
        evidence: Object.freeze({
          reconnectCount: refreshed.reconnectCount,
          lastReconnectAt: refreshed.lastReconnectAt,
          heartbeatBeforeRefresh: reconnectedHeartbeat,
          heartbeatAfterRefresh: refreshed.heartbeatSequence,
          pingMs: refreshed.pingMs,
        }),
      }));

      const result: Slice52LiveTestResult = Object.freeze({
        testId,
        slice: "5.2",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterName: refreshed.characterName,
        serverKey: refreshed.serverKey,
        message: "Slice 5.2 passed: disconnect detection, bounded backoff, reconnect, ordered logs, and post-reconnect live state were verified.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 5.2 disconnect/reconnect test passed.", {
        testId,
        reconnectCount: refreshed.reconnectCount,
        gameplayMutation: false,
        logSequenceConfirmed: true,
      });
      return result;
    } catch (error) {
      const failure = error instanceof Slice52Failure
        ? error
        : new Slice52Failure(
          "UNEXPECTED_SLICE_5_2_FAILURE",
          error instanceof Error ? error.message : String(error),
          "unexpected",
        );
      const outcome: Slice52LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const character = this.#character.state();
      const result: Slice52LiveTestResult = Object.freeze({
        testId,
        slice: "5.2",
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
        this.#logger.warn("Slice 5.2 disconnect/reconnect test blocked.", {
          testId,
          code: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 5.2 disconnect/reconnect test failed.", failure, {
          testId,
          code: failure.code,
          step: failure.step,
        });
      }
      return result;
    }
  }

  #requiredSequence(records: readonly LogRecord[]): readonly LogRecord[] | undefined {
    const messages = [
      "Adventure Land headless character connection closed unexpectedly.",
      "Adventure Land character reconnect scheduled.",
      "Adventure Land character reconnect attempt started.",
      "Adventure Land headless character reconnected.",
    ];
    const selected: LogRecord[] = [];
    let afterId = 0;
    for (const message of messages) {
      const record = records.find((candidate) => candidate.id > afterId && candidate.message === message);
      if (!record) return undefined;
      selected.push(record);
      afterId = record.id;
    }
    return Object.freeze(selected);
  }

  async #waitFor<T>(read: () => T, predicate: (value: T) => boolean): Promise<T | undefined> {
    const deadline = Date.now() + RECOVERY_WAIT_MS;
    while (Date.now() <= deadline) {
      const value = read();
      if (predicate(value)) return value;
      await this.#delay(POLL_MS);
    }
    const final = read();
    return predicate(final) ? final : undefined;
  }
}

class Slice52Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice52Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}
