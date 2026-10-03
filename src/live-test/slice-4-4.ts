import { randomUUID } from "node:crypto";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";
import type { ScriptStorageJson, ScriptStorageStore } from "../script/storage.ts";

export type Slice44LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice44LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly detail: string;
}

export interface Slice44LiveTestResult {
  readonly testId: string;
  readonly slice: "4.4";
  readonly outcome: Slice44LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly message: string;
  readonly steps: readonly Slice44LiveTestStep[];
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface Slice44LiveTestState {
  readonly status: "idle" | "running" | Slice44LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice44LiveTestResult;
}

export interface Slice44LiveTestServiceOptions {
  readonly logger: Logger;
  readonly runtime: ScriptRuntimeService;
  readonly storage: ScriptStorageStore;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

const PRIMARY_SCRIPT = "slice-4-4-storage-primary";
const SECONDARY_SCRIPT = "slice-4-4-storage-secondary";
const STORAGE_KEY = "slice44-state";
const PRIMARY_VALUE = Object.freeze({
  counter: 7,
  label: "persistent",
  nested: Object.freeze({ ready: true }),
});
const WRITE_MARKER = "slice44:write-ok";
const RESTART_MARKER = "slice44:restart-ok";
const ISOLATION_MARKER = "slice44:isolation-ok";
const PRIMARY_ISOLATION_MARKER = "slice44:primary-still-isolated";
const DELETE_MARKER = "slice44:delete-ok";

export class Slice44LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: ScriptRuntimeService;
  readonly #storage: ScriptStorageStore;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice44LiveTestResult>;
  #state: Slice44LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 4.4 one-click storage test is ready.",
  });

  constructor(options: Slice44LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#storage = options.storage;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live44-${randomUUID()}`);
  }

  state(): Slice44LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice44LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice44LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice44LiveTestStep[] = [];
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 4.4 one-click storage test is running.",
    });
    this.#logger.info("Slice 4.4 one-click storage test started.", {
      testId,
      gameplayMutation: false,
      namespaces: 2,
    });

    try {
      if (this.#runtime.state().status === "running") {
        throw new Slice44LiveTestFailure(
          "SCRIPT_RUNTIME_BUSY",
          "A script is already running. The Slice 4.4 storage test did not interrupt it.",
          true,
        );
      }

      this.#storage.deleteNamespace(PRIMARY_SCRIPT);
      this.#storage.deleteNamespace(SECONDARY_SCRIPT);

      await this.#verifyWriteAndImmediateRead(steps);
      await this.#verifyRestartPersistence(steps);
      await this.#verifyNamespaceIsolation(steps);
      await this.#verifyDeleteAndCleanup(steps);

      const final = await this.#runtime.stop();
      if (
        final.status !== "stopped" ||
        final.activeTimers !== 0 ||
        final.activeEventListeners !== 0
      ) {
        throw new Slice44LiveTestFailure(
          "FINAL_RUNTIME_CLEANUP_FAILED",
          "The Slice 4.4 runtime did not finish stopped and resource-clean.",
        );
      }
      steps.push(Object.freeze({
        name: "final-runtime-cleanup",
        outcome: "passed",
        detail: "The isolated runtime finished stopped with zero timers and event listeners.",
      }));

      const result: Slice44LiveTestResult = Object.freeze({
        testId,
        slice: "4.4",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        message:
          "Slice 4.4 passed: script get()/set()/del() state persisted across isolated worker restart, namespaces stayed isolated, and test storage was cleaned up.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 4.4 one-click storage test passed.", {
        testId,
        stepCount: steps.length,
        finalRuntimeStatus: final.status,
        primaryEntries: this.#storage.snapshot(PRIMARY_SCRIPT).entries.length,
        secondaryEntries: this.#storage.snapshot(SECONDARY_SCRIPT).entries.length,
      });
      return result;
    } catch (error) {
      const failure = normalizeFailure(error);
      await this.#runtime.stop().catch(() => undefined);
      this.#storage.deleteNamespace(PRIMARY_SCRIPT);
      this.#storage.deleteNamespace(SECONDARY_SCRIPT);
      const outcome: Slice44LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const result: Slice44LiveTestResult = Object.freeze({
        testId,
        slice: "4.4",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
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
        this.#logger.warn("Slice 4.4 one-click storage test blocked.", {
          testId,
          code: failure.code,
          message: failure.message,
        });
      } else {
        this.#logger.error("Slice 4.4 one-click storage test failed.", failure, {
          testId,
          code: failure.code,
        });
      }
      return result;
    }
  }

  async #verifyWriteAndImmediateRead(steps: Slice44LiveTestStep[]): Promise<void> {
    await this.#runtime.load({
      name: PRIMARY_SCRIPT,
      source: [
        "(async () => {",
        `  await set('${STORAGE_KEY}', {counter:7,label:'persistent',nested:{ready:true}});`,
        `  const value = get('${STORAGE_KEY}');`,
        "  if (!value || value.counter !== 7 || value.label !== 'persistent' || value.nested?.ready !== true) throw new Error('Slice 4.4 immediate read mismatch.');",
        `  console.info('${WRITE_MARKER}');`,
        "})()",
      ].join("\n"),
    });
    await this.#startAndWaitForLog(WRITE_MARKER, "WRITE_FAILED");
    await this.#runtime.stop();

    if (!storageValueMatches(this.#storedValue(PRIMARY_SCRIPT), PRIMARY_VALUE)) {
      throw new Slice44LiveTestFailure(
        "HOST_PERSISTENCE_FAILED",
        "The host-side script storage did not persist the written JSON state.",
      );
    }
    steps.push(Object.freeze({
      name: "write-and-immediate-read",
      outcome: "passed",
      detail: "set() persisted JSON state and get() returned the same snapshot immediately.",
    }));
  }

  async #verifyRestartPersistence(steps: Slice44LiveTestStep[]): Promise<void> {
    await this.#runtime.load({
      name: PRIMARY_SCRIPT,
      source: [
        `const value = get('${STORAGE_KEY}');`,
        "if (!value || value.counter !== 7 || value.label !== 'persistent' || value.nested?.ready !== true) throw new Error('Slice 4.4 persisted value missing after restart.');",
        `console.info('${RESTART_MARKER}');`,
      ].join("\n"),
    });
    await this.#startAndWaitForLog(RESTART_MARKER, "RESTART_PERSISTENCE_FAILED");
    await this.#runtime.stop();
    steps.push(Object.freeze({
      name: "persist-across-worker-restart",
      outcome: "passed",
      detail: "A fresh isolated worker restored the primary script namespace from local disk.",
    }));
  }

  async #verifyNamespaceIsolation(steps: Slice44LiveTestStep[]): Promise<void> {
    await this.#runtime.load({
      name: SECONDARY_SCRIPT,
      source: [
        "(async () => {",
        `  if (get('${STORAGE_KEY}', 'missing') !== 'missing') throw new Error('Slice 4.4 namespace leaked into secondary script.');`,
        `  await set('${STORAGE_KEY}', {owner:'secondary'});`,
        `  if (get('${STORAGE_KEY}').owner !== 'secondary') throw new Error('Slice 4.4 secondary write failed.');`,
        `  console.info('${ISOLATION_MARKER}');`,
        "})()",
      ].join("\n"),
    });
    await this.#startAndWaitForLog(ISOLATION_MARKER, "SECONDARY_NAMESPACE_FAILED");
    await this.#runtime.stop();

    if (!storageValueMatches(this.#storedValue(PRIMARY_SCRIPT), PRIMARY_VALUE)) {
      throw new Slice44LiveTestFailure(
        "PRIMARY_NAMESPACE_CHANGED",
        "The secondary script changed the primary script namespace.",
      );
    }
    if (!storageValueMatches(this.#storedValue(SECONDARY_SCRIPT), { owner: "secondary" })) {
      throw new Slice44LiveTestFailure(
        "SECONDARY_NAMESPACE_NOT_PERSISTED",
        "The secondary script namespace was not stored independently.",
      );
    }

    await this.#runtime.load({
      name: PRIMARY_SCRIPT,
      source: [
        `const value = get('${STORAGE_KEY}');`,
        "if (!value || value.counter !== 7 || value.owner !== undefined) throw new Error('Slice 4.4 primary namespace was contaminated.');",
        `console.info('${PRIMARY_ISOLATION_MARKER}');`,
      ].join("\n"),
    });
    await this.#startAndWaitForLog(PRIMARY_ISOLATION_MARKER, "PRIMARY_NAMESPACE_RELOAD_FAILED");
    await this.#runtime.stop();

    steps.push(Object.freeze({
      name: "safe-namespace-isolation",
      outcome: "passed",
      detail: "Two script names used separate hashed namespaces and could not read or overwrite each other's state.",
    }));
  }

  async #verifyDeleteAndCleanup(steps: Slice44LiveTestStep[]): Promise<void> {
    await this.#runtime.load({
      name: PRIMARY_SCRIPT,
      source: [
        "(async () => {",
        `  await del('${STORAGE_KEY}');`,
        `  if (get('${STORAGE_KEY}', 'missing') !== 'missing') throw new Error('Slice 4.4 delete failed.');`,
        `  console.info('${DELETE_MARKER}');`,
        "})()",
      ].join("\n"),
    });
    await this.#startAndWaitForLog(DELETE_MARKER, "DELETE_FAILED");
    await this.#runtime.stop();

    if (this.#storage.snapshot(PRIMARY_SCRIPT).entries.length !== 0) {
      throw new Slice44LiveTestFailure(
        "PRIMARY_CLEANUP_FAILED",
        "del() did not remove the primary test namespace value.",
      );
    }
    this.#storage.deleteNamespace(SECONDARY_SCRIPT);
    if (this.#storage.snapshot(SECONDARY_SCRIPT).entries.length !== 0) {
      throw new Slice44LiveTestFailure(
        "SECONDARY_CLEANUP_FAILED",
        "The secondary test namespace could not be cleaned up.",
      );
    }
    steps.push(Object.freeze({
      name: "delete-and-test-cleanup",
      outcome: "passed",
      detail: "del() removed persisted state and both bounded test namespaces finished empty.",
    }));
  }

  async #startAndWaitForLog(marker: string, code: string): Promise<void> {
    const running = await this.#runtime.start();
    if (running.status !== "running") {
      throw new Slice44LiveTestFailure(code, `Storage probe did not start: ${running.message}`);
    }
    if (!await waitFor(() => this.#hasScriptLog(marker), 1_500)) {
      throw new Slice44LiveTestFailure(code, `Storage probe did not emit ${marker}.`);
    }
  }

  #storedValue(scriptName: string): ScriptStorageJson | undefined {
    return this.#storage.snapshot(scriptName).entries.find((entry) =>
      entry.key === STORAGE_KEY
    )?.value;
  }

  #hasScriptLog(message: string): boolean {
    return this.#logger.records().some((record) =>
      record.message === message &&
      (record.component === `script:${PRIMARY_SCRIPT}` ||
        record.component === `script:${SECONDARY_SCRIPT}`)
    );
  }
}

class Slice44LiveTestFailure extends Error {
  readonly code: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, blocked = false) {
    super(message);
    this.name = "Slice44LiveTestFailure";
    this.code = code;
    this.blocked = blocked;
  }
}

function normalizeFailure(error: unknown): Slice44LiveTestFailure {
  if (error instanceof Slice44LiveTestFailure) return error;
  return new Slice44LiveTestFailure(
    "UNEXPECTED_SLICE_4_4_FAILURE",
    error instanceof Error ? error.message : String(error),
  );
}

function storageValueMatches(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}
