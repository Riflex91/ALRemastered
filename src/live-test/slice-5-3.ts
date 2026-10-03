import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice53LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice53LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice53LiveTestResult {
  readonly testId: string;
  readonly slice: "5.3";
  readonly outcome: Slice53LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice53LiveTestStep[];
  readonly error?: {
    readonly code: string;
    readonly step: string;
    readonly message: string;
  };
}

export interface Slice53LiveTestState {
  readonly status: "idle" | "running" | Slice53LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice53LiveTestResult;
}

export interface Slice53LiveTestServiceOptions {
  readonly logger: Logger;
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "requestStateRefresh"
  >;
  readonly script: Pick<
    ScriptRuntimeService,
    "state" | "load" | "start" | "stop"
  >;
  readonly clock?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

const RECOVERY_WAIT_MS = 30_000;
const POLL_MS = 50;
const SCRIPT_NAME = "slice-5-3-live-recovery";

export class Slice53LiveTestService {
  readonly #logger: Logger;
  readonly #character: Slice53LiveTestServiceOptions["character"];
  readonly #script: Slice53LiveTestServiceOptions["script"];
  readonly #clock: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice53LiveTestResult>;
  #state: Slice53LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 5.3 death/respawn recovery test is ready.",
  });

  constructor(options: Slice53LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#character = options.character;
    this.#script = options.script;
    this.#clock = options.clock ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live53-${randomUUID()}`);
  }

  state(): Slice53LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice53LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice53LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice53LiveTestStep[] = [];
    const logStartId = this.#logger.records().at(-1)?.id ?? 0;
    let ownsTestScript = false;
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 5.3 is verifying the real server death state, respawn, and same-worker script continuation.",
    });
    this.#logger.info("Slice 5.3 death/respawn recovery test started.", {
      testId,
      recoveryAction: "character-respawn",
      deathInjection: false,
      rawSocketAccess: false,
    });

    try {
      const before = this.#character.state();
      if (before.status !== "connected" || !before.characterId || !before.character) {
        throw new Slice53Failure(
          "LIVE_TEST_CHARACTER_NOT_CONNECTED",
          "Connect one headless character before running the death/respawn recovery test.",
          "preflight",
          true,
        );
      }
      const runtimeBefore = this.#script.state();
      if (runtimeBefore.status === "running" || runtimeBefore.status === "paused") {
        throw new Slice53Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "Stop the active script before running the bounded Slice 5.3 recovery script.",
          "preflight",
          true,
        );
      }
      if (!before.character.dead) {
        throw new Slice53Failure(
          "LIVE_TEST_REAL_DEATH_REQUIRED",
          "Slice 5.3 requires a real Adventure Land server death state. The harness will not fabricate death or send an unverified raw socket command.",
          "preflight",
          true,
        );
      }
      const deathRecord = this.#latestDeathRecord(before.characterId);
      if (!deathRecord || !before.lastDeathAt || (before.deathCount ?? 0) < 1) {
        throw new Slice53Failure(
          "LIVE_TEST_DEATH_EVIDENCE_INCOMPLETE",
          "The character is dead, but the required structured server-observed death evidence is incomplete.",
          "death-state",
        );
      }

      const baselineRespawnCount = before.respawnCount ?? 0;
      steps.push(Object.freeze({
        name: "death-state",
        outcome: "passed",
        message: "A real server-observed Character death state is present with structured lifecycle evidence.",
        evidence: Object.freeze({
          characterId: before.characterId,
          characterName: before.characterName,
          serverKey: before.serverKey,
          dead: before.character.dead,
          deathCount: before.deathCount,
          lastDeathAt: before.lastDeathAt,
          heartbeatSequence: before.heartbeatSequence,
          logRecord: Object.freeze({
            id: deathRecord.id,
            message: deathRecord.message,
          }),
        }),
      }));

      await this.#script.load({
        name: SCRIPT_NAME,
        source: recoveryScriptSource(),
      });
      ownsTestScript = true;
      const started = await this.#script.start();
      if (started.status !== "running" || !started.runId) {
        throw new Slice53Failure(
          "LIVE_TEST_RECOVERY_SCRIPT_NOT_RUNNING",
          "The isolated recovery script did not reach running state.",
          "script-death-observation",
        );
      }
      const runId = started.runId;
      const deathObserved = await this.#waitForRecord(
        logStartId,
        "slice53:death-observed",
        SCRIPT_NAME,
      );
      if (!deathObserved) {
        throw new Slice53Failure(
          "LIVE_TEST_SCRIPT_DID_NOT_OBSERVE_DEATH",
          "The isolated script did not observe character.rip while the real Character was dead.",
          "script-death-observation",
        );
      }
      steps.push(Object.freeze({
        name: "script-death-observation",
        outcome: "passed",
        message: "The isolated script observed character.rip without direct transport access.",
        evidence: Object.freeze({
          runId,
          scriptName: SCRIPT_NAME,
          logRecordId: deathObserved.id,
          activeTimers: this.#script.state().activeTimers,
        }),
      }));

      const gatewayRecord = await this.#waitFor(
        () => this.#successfulRespawnRecord(logStartId),
        (record) => Boolean(record),
      );
      if (!gatewayRecord) {
        const failedMarker = this.#findRecordAfter(
          logStartId,
          "slice53:respawn-failed",
          SCRIPT_NAME,
          true,
        );
        throw new Slice53Failure(
          "LIVE_TEST_RESPAWN_NOT_SERVER_CONFIRMED",
          failedMarker
            ? "The script respawn attempt failed before a server-confirmed Action Gateway completion."
            : "The script respawn was not server-confirmed within the bounded recovery window.",
          "respawn-confirmed",
        );
      }
      const gatewayContext = recordContext(gatewayRecord);
      steps.push(Object.freeze({
        name: "respawn-confirmed",
        outcome: "passed",
        message: "Respawn completed through the script bridge and central Action Gateway with server confirmation.",
        evidence: Object.freeze({
          requestId: gatewayRecord.requestId,
          action: gatewayContext?.action,
          origin: gatewayContext?.origin,
          outcome: gatewayContext?.outcome,
          retryAfterMs: gatewayContext?.retryAfterMs,
        }),
      }));

      try {
        this.#character.requestStateRefresh();
      } catch {}

      const restored = await this.#waitFor(
        () => this.#character.state(),
        (value) =>
          value.status === "connected" &&
          value.character?.dead === false &&
          (value.respawnCount ?? 0) > baselineRespawnCount &&
          Boolean(value.lastRespawnAt),
      );
      if (!restored) {
        throw new Slice53Failure(
          "LIVE_TEST_RESPAWN_STATE_NOT_RESTORED",
          "Adventure Land accepted respawn, but fresh Character state did not transition back to alive.",
          "script-continuation",
        );
      }

      const continued = await this.#waitForRecord(
        logStartId,
        "slice53:continued-after-respawn",
        SCRIPT_NAME,
      );
      const runtimeAfter = this.#script.state();
      if (
        !continued ||
        runtimeAfter.status !== "running" ||
        runtimeAfter.runId !== runId
      ) {
        throw new Slice53Failure(
          "LIVE_TEST_SCRIPT_DID_NOT_CONTINUE",
          "Character respawned, but the same isolated script worker did not continue in a controlled state.",
          "script-continuation",
        );
      }
      steps.push(Object.freeze({
        name: "script-continuation",
        outcome: "passed",
        message: "The same isolated script run continued after the Character returned alive.",
        evidence: Object.freeze({
          runIdBeforeRespawn: runId,
          runIdAfterRespawn: runtimeAfter.runId,
          respawnCount: restored.respawnCount,
          lastRespawnAt: restored.lastRespawnAt,
          heartbeatSequence: restored.heartbeatSequence,
          continuationLogRecordId: continued.id,
        }),
      }));

      const stopped = await this.#script.stop();
      ownsTestScript = false;
      if (
        stopped.status !== "stopped" ||
        stopped.activeTimers !== 0 ||
        stopped.activeEventListeners !== 0
      ) {
        throw new Slice53Failure(
          "LIVE_TEST_RECOVERY_SCRIPT_CLEANUP_FAILED",
          "The recovery script did not release its worker resources cleanly.",
          "final-cleanup",
        );
      }
      steps.push(Object.freeze({
        name: "final-cleanup",
        outcome: "passed",
        message: "The bounded recovery worker stopped and released timers/listeners cleanly.",
        evidence: Object.freeze({
          status: stopped.status,
          activeTimers: stopped.activeTimers,
          activeEventListeners: stopped.activeEventListeners,
          runId: stopped.runId,
        }),
      }));

      const result: Slice53LiveTestResult = Object.freeze({
        testId,
        slice: "5.3",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterName: restored.characterName,
        serverKey: restored.serverKey,
        message: "Slice 5.3 passed: real death state, server-confirmed respawn, and controlled same-worker script continuation were verified.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 5.3 death/respawn recovery test passed.", {
        testId,
        deathCount: restored.deathCount,
        respawnCount: restored.respawnCount,
        lastDeathAt: restored.lastDeathAt,
        lastRespawnAt: restored.lastRespawnAt,
        scriptRunId: runId,
        gameplayMutation: "character.respawn",
        rawSocketAccess: false,
      });
      return result;
    } catch (error) {
      if (ownsTestScript) {
        try {
          await this.#script.stop();
        } catch {}
      }
      const failure = error instanceof Slice53Failure
        ? error
        : new Slice53Failure(
          "UNEXPECTED_SLICE_5_3_FAILURE",
          error instanceof Error ? error.message : String(error),
          "unexpected",
        );
      const outcome: Slice53LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const character = this.#character.state();
      const result: Slice53LiveTestResult = Object.freeze({
        testId,
        slice: "5.3",
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
        this.#logger.warn("Slice 5.3 death/respawn recovery test blocked.", {
          testId,
          code: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 5.3 death/respawn recovery test failed.", failure, {
          testId,
          code: failure.code,
          step: failure.step,
        });
      }
      return result;
    }
  }

  #latestDeathRecord(characterId: string): LogRecord | undefined {
    return this.#logger.records().findLast((record) =>
      (
        record.message === "Adventure Land headless character died." ||
        record.message === "Adventure Land headless character death state observed."
      ) &&
      recordContext(record)?.characterId === characterId
    );
  }

  #successfulRespawnRecord(afterId: number): LogRecord | undefined {
    return this.#logger.records().find((record) => {
      if (record.id <= afterId || record.message !== "Action gateway request completed.") {
        return false;
      }
      const context = recordContext(record);
      return context?.action === "character.respawn" &&
        context?.origin === "script" &&
        context?.outcome === "success";
    });
  }

  #findRecordAfter(
    afterId: number,
    message: string,
    component: string,
    prefix = false,
  ): LogRecord | undefined {
    const expectedComponent = `script:${component}`;
    return this.#logger.records().find((record) =>
      record.id > afterId &&
      record.component === expectedComponent &&
      (prefix ? record.message.startsWith(message) : record.message === message)
    );
  }

  #waitForRecord(
    afterId: number,
    message: string,
    component: string,
  ): Promise<LogRecord | undefined> {
    return this.#waitFor(
      () => this.#findRecordAfter(afterId, message, component),
      (record) => Boolean(record),
    );
  }

  async #waitFor<T>(
    read: () => T,
    predicate: (value: T) => boolean,
  ): Promise<T | undefined> {
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

class Slice53Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice53Failure";
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

function recoveryScriptSource(): string {
  return [
    "console.info('slice53:worker-started');",
    "let respawnInFlight = false;",
    "let respawnConfirmed = false;",
    "let continuationLogged = false;",
    "let attempts = 0;",
    "let nextAttemptAt = 0;",
    "setInterval(async () => {",
    "  if (continuationLogged || respawnInFlight) return;",
    "  if (character.rip === true) {",
    "    if (respawnConfirmed || Date.now() < nextAttemptAt) return;",
    "    attempts += 1;",
    "    if (attempts === 1) console.info('slice53:death-observed');",
    "    respawnInFlight = true;",
    "    try {",
    "      await respawn();",
    "      respawnConfirmed = true;",
    "      console.info('slice53:respawn-server-confirmed');",
    "    } catch (error) {",
    "      const code = error && error.code ? String(error.code) : 'UNKNOWN';",
    "      const retryAfterMs = error && Number.isFinite(error.retryAfterMs) ? Number(error.retryAfterMs) : 1000;",
    "      if ((code === 'RESPAWN_SERVER_REJECTED' || code === 'ACTION_RATE_LIMITED') && attempts < 6) {",
    "        nextAttemptAt = Date.now() + Math.max(250, Math.min(5000, retryAfterMs));",
    "        console.warn('slice53:respawn-deferred');",
    "      } else {",
    "        console.error('slice53:respawn-failed:' + code);",
    "      }",
    "    } finally {",
    "      respawnInFlight = false;",
    "    }",
    "    return;",
    "  }",
    "  if (respawnConfirmed) {",
    "    continuationLogged = true;",
    "    console.info('slice53:continued-after-respawn');",
    "  }",
    "}, 50);",
  ].join("\n");
}
