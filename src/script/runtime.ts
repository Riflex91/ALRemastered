import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { Logger, LogLevel } from "../logging/logger.ts";
import type {
  ScriptAdventureApiBridge,
  ScriptAdventureApiMethod,
} from "./adventure-api.ts";
import type { AdventureLandGameEvent } from "../character/game-events.ts";
import type { ScriptStorageStore } from "./storage.ts";

export type ScriptRuntimeStatus =
  | "unloaded"
  | "loaded"
  | "running"
  | "paused"
  | "stopped"
  | "crashed";

export interface ScriptRuntimeState {
  readonly status: ScriptRuntimeStatus;
  readonly scriptName?: string;
  readonly loadedAt?: string;
  readonly startedAt?: string;
  readonly pausedAt?: string;
  readonly stoppedAt?: string;
  readonly crashedAt?: string;
  readonly runId?: string;
  readonly activeTimers: number;
  readonly activeEventListeners: number;
  readonly logRecords: number;
  readonly heartbeatSequence: number;
  readonly lastHeartbeatAt?: string;
  readonly message: string;
  readonly error?: {
    readonly name: string;
    readonly message: string;
  };
}

export interface ScriptLoadRequest {
  readonly name: string;
  readonly source: string;
}

export interface ScriptRuntimeOptions {
  readonly logger: Logger;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
  readonly startupTimeoutMs?: number;
  readonly pauseTimeoutMs?: number;
  readonly api?: ScriptAdventureApiBridge;
  readonly apiStateIntervalMs?: number;
  readonly storage?: ScriptStorageStore;
}

interface WorkerMessage {
  readonly type?: string;
  readonly level?: "debug" | "info" | "warn" | "error";
  readonly message?: string;
  readonly activeTimers?: number;
  readonly runId?: string;
  readonly callId?: number;
  readonly method?: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly activeEventListeners?: number;
  readonly eventNames?: readonly string[];
  readonly heartbeatSequence?: number;
  readonly storageOperation?: string;
  readonly key?: string;
  readonly value?: unknown;
  readonly error?: {
    readonly name?: string;
    readonly message?: string;
    readonly stack?: string;
    readonly code?: string;
    readonly retryAfterMs?: number;
    readonly requestId?: string;
  };
}

const MAX_SCRIPT_BYTES = 256 * 1024;
const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/;

export class ScriptRuntimeService {
  readonly #logger: Logger;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  readonly #startupTimeoutMs: number;
  readonly #pauseTimeoutMs: number;
  readonly #api?: ScriptAdventureApiBridge;
  readonly #apiStateIntervalMs: number;
  readonly #storage?: ScriptStorageStore;
  #source?: string;
  #worker?: Worker;
  #apiStateTimer?: NodeJS.Timeout;
  #apiEventUnsubscribe?: () => void;
  readonly #activeEventNames = new Set<string>();
  #expectedExit = false;
  #suppressHeartbeatForTest = false;
  #state: ScriptRuntimeState = {
    status: "unloaded",
    activeTimers: 0,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 0,
    message: "No script loaded.",
  };

  constructor(options: ScriptRuntimeOptions) {
    this.#logger = options.logger;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `script-${randomUUID()}`);
    this.#startupTimeoutMs = options.startupTimeoutMs ?? 3_000;
    this.#pauseTimeoutMs = options.pauseTimeoutMs ?? 750;
    this.#api = options.api;
    this.#apiStateIntervalMs = Math.max(50, options.apiStateIntervalMs ?? 100);
    this.#storage = options.storage;
  }

  state(): ScriptRuntimeState {
    return structuredClone(this.#state);
  }

  setHeartbeatSuppressedForTest(suppressed: boolean): ScriptRuntimeState {
    this.#suppressHeartbeatForTest = suppressed;
    this.#logger.warn("Script heartbeat observation test hook changed.", {
      suppressed,
      testOnly: true,
      scriptName: this.#state.scriptName,
      runId: this.#state.runId,
    }, { component: this.#component(this.#state.scriptName) });
    return this.state();
  }

  async load(request: ScriptLoadRequest): Promise<ScriptRuntimeState> {
    const name = request.name.trim();
    if (!SCRIPT_NAME_PATTERN.test(name)) {
      throw new Error("Script name must be 1-80 safe display characters.");
    }
    if (!request.source.trim()) throw new Error("Script source is required.");
    if (Buffer.byteLength(request.source, "utf8") > MAX_SCRIPT_BYTES) {
      throw new Error("Script source exceeds the 256 KiB runtime limit.");
    }

    await this.#terminateWorker();
    this.#source = request.source;
    this.#state = {
      status: "loaded",
      scriptName: name,
      loadedAt: this.#clock().toISOString(),
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 0,
      lastHeartbeatAt: undefined,
      message: "Script loaded and ready to start.",
    };
    this.#logger.info("Script loaded.", {
      scriptName: name,
      sourceBytes: Buffer.byteLength(request.source, "utf8"),
      sourceLogged: false,
    }, { component: this.#component(name) });
    return this.state();
  }

  async start(): Promise<ScriptRuntimeState> {
    if (!this.#source || !this.#state.scriptName) {
      throw new Error("Load a script before starting it.");
    }
    if (this.#state.status === "running") return this.state();

    await this.#terminateWorker();
    const runId = this.#idFactory();
    const scriptName = this.#state.scriptName;
    const workerUrl = new URL(
      import.meta.url.endsWith(".js") ? "./worker.js" : "./worker.ts",
      import.meta.url,
    );
    const apiBootstrap = this.#api?.bootstrap();
    const storageBootstrap = this.#storage?.snapshot(scriptName);
    const worker = new Worker(workerUrl, {
      workerData: {
        source: this.#source,
        scriptName,
        runId,
        apiBootstrap,
        storageEntries: storageBootstrap?.entries ?? [],
      },
    });
    this.#worker = worker;
    this.#expectedExit = false;
    this.#state = {
      ...this.#state,
      status: "loaded",
      runId,
      startedAt: undefined,
      pausedAt: undefined,
      stoppedAt: undefined,
      crashedAt: undefined,
      error: undefined,
      activeTimers: 0,
      activeEventListeners: 0,
      heartbeatSequence: 0,
      lastHeartbeatAt: undefined,
      message: "Script worker is starting.",
    };

    worker.on("message", (message: WorkerMessage) => this.#handleWorkerMessage(worker, message));
    worker.on("error", (error) => this.#markCrashed(worker, error));
    worker.on("exit", (code) => {
      if (worker !== this.#worker) return;
      this.#worker = undefined;
      this.#stopApiStatePump();
      this.#stopApiEventBridge();
      if (!this.#expectedExit && this.#state.status !== "crashed") {
        this.#markCrashed(undefined, new Error(`Script worker exited unexpectedly with code ${code}.`));
      }
    });

    this.#logger.info("Script worker start requested.", {
      scriptName,
      runId,
      adventureApi: Boolean(this.#api),
      scriptStorage: Boolean(this.#storage),
      storedValues: storageBootstrap?.entries.length ?? 0,
    }, { component: this.#component(scriptName) });
    this.#startApiStatePump(worker);
    this.#startApiEventBridge(worker);

    const terminal = await this.#waitForStatus(
      ["running", "crashed"],
      this.#startupTimeoutMs,
    );
    if (!terminal) {
      const error = new Error("Script did not finish startup within the isolation timeout.");
      this.#markCrashed(worker, error);
      await this.#terminateWorker();
    }
    return this.state();
  }

  async pause(): Promise<ScriptRuntimeState> {
    if (this.#state.status !== "running" || !this.#worker) return this.state();
    const worker = this.#worker;
    worker.postMessage({ type: "pause" });
    const paused = await this.#waitForStatus(["paused", "crashed"], this.#pauseTimeoutMs);
    if (!paused && worker === this.#worker) {
      this.#logger.warn("Script pause required forced worker termination.", {
        scriptName: this.#state.scriptName,
        runId: this.#state.runId,
      }, { component: this.#component(this.#state.scriptName) });
      await this.#terminateWorker();
      this.#state = {
        ...this.#state,
        status: "paused",
        pausedAt: this.#clock().toISOString(),
        activeTimers: 0,
        activeEventListeners: 0,
        message: "Script paused by terminating an unresponsive isolated worker.",
      };
    }
    return this.state();
  }

  async stop(): Promise<ScriptRuntimeState> {
    await this.#terminateWorker();
    if (!this.#source) {
      this.#state = {
        status: "unloaded",
        activeTimers: 0,
        activeEventListeners: 0,
        logRecords: 0,
        heartbeatSequence: 0,
        message: "No script loaded.",
      };
      return this.state();
    }
    this.#state = {
      ...this.#state,
      status: "stopped",
      stoppedAt: this.#clock().toISOString(),
      activeTimers: 0,
      activeEventListeners: 0,
      message: "Script stopped. Timers, event listeners, and worker resources were released.",
    };
    this.#logger.info("Script stopped.", {
      scriptName: this.#state.scriptName,
      runId: this.#state.runId,
      activeTimers: 0,
    }, { component: this.#component(this.#state.scriptName) });
    return this.state();
  }

  async dispose(): Promise<void> {
    await this.#terminateWorker();
  }

  #component(scriptName?: string): string {
    return `script:${scriptName ?? "unknown"}`;
  }

  #handleWorkerMessage(worker: Worker, message: WorkerMessage): void {
    if (worker !== this.#worker) return;
    if (message.type === "api_call") {
      void this.#handleApiCall(worker, message);
      return;
    }
    if (message.type === "storage_call") {
      void this.#handleStorageCall(worker, message);
      return;
    }
    if (message.type === "heartbeat") {
      if (this.#suppressHeartbeatForTest) return;
      const sequence = Math.max(0, Math.floor(Number(message.heartbeatSequence) || 0));
      if (sequence > this.#state.heartbeatSequence) {
        this.#state = {
          ...this.#state,
          heartbeatSequence: sequence,
          lastHeartbeatAt: this.#clock().toISOString(),
        };
      }
      return;
    }
    if (message.type === "event_listener_state") {
      const names = Array.isArray(message.eventNames)
        ? message.eventNames.filter((name): name is string => typeof name === "string")
        : [];
      this.#activeEventNames.clear();
      for (const name of names) this.#activeEventNames.add(name);
      this.#state = {
        ...this.#state,
        activeEventListeners: Math.max(0, Number(message.activeEventListeners) || 0),
      };
      return;
    }
    if (message.type === "timer_count") {
      this.#state = {
        ...this.#state,
        activeTimers: Math.max(0, Number(message.activeTimers) || 0),
      };
      return;
    }
    if (message.type === "log") {
      const level: LogLevel =
        message.level === "debug" ? "DEBUG"
        : message.level === "warn" ? "WARN"
        : message.level === "error" ? "ERROR"
        : "INFO";
      this.#logger.log(
        level,
        message.message ?? "",
        {
          scriptName: this.#state.scriptName,
          runId: this.#state.runId,
          scriptLog: true,
        },
        undefined,
        { component: this.#component(this.#state.scriptName) },
      );
      this.#state = {
        ...this.#state,
        logRecords: this.#state.logRecords + 1,
      };
      return;
    }
    if (message.type === "started") {
      this.#state = {
        ...this.#state,
        status: "running",
        startedAt: this.#clock().toISOString(),
        activeTimers: Math.max(0, Number(message.activeTimers) || 0),
        message: "Script is running in an isolated worker.",
      };
      return;
    }
    if (message.type === "paused") {
      this.#state = {
        ...this.#state,
        status: "paused",
        pausedAt: this.#clock().toISOString(),
        activeTimers: 0,
        activeEventListeners: 0,
        message: "Script paused. All registered timers and event listeners were cleared.",
      };
      this.#stopApiEventBridge();
      this.#logger.info("Script paused.", {
        scriptName: this.#state.scriptName,
        runId: this.#state.runId,
        activeTimers: 0,
      }, { component: this.#component(this.#state.scriptName) });
      return;
    }
    if (message.type === "crash") {
      const error = new Error(message.error?.message ?? "Script worker crashed.");
      error.name = message.error?.name ?? "Error";
      this.#markCrashed(worker, error);
    }
  }

  async #handleApiCall(worker: Worker, message: WorkerMessage): Promise<void> {
    if (worker !== this.#worker || typeof message.callId !== "number") return;
    const method = message.method;
    const supported: readonly ScriptAdventureApiMethod[] = [
      "move",
      "xmove",
      "smart_move",
      "attack",
      "loot",
      "consume",
      "respawn",
    ];
    if (!this.#api || !supported.includes(method as ScriptAdventureApiMethod)) {
      worker.postMessage({
        type: "api_result",
        callId: message.callId,
        ok: false,
        error: {
          name: "ScriptAdventureApiError",
          code: "SCRIPT_API_UNAVAILABLE",
          message: this.#api
            ? "Unsupported Adventure Land script API method."
            : "Adventure Land script API is unavailable.",
        },
      });
      return;
    }

    try {
      const result = await this.#api.call(
        method as ScriptAdventureApiMethod,
        message.input ?? {},
      );
      if (worker !== this.#worker) return;
      worker.postMessage({
        type: "api_result",
        callId: message.callId,
        ok: true,
        result,
      });
    } catch (error) {
      if (worker !== this.#worker) return;
      const details = error as {
        readonly name?: unknown;
        readonly message?: unknown;
        readonly code?: unknown;
        readonly retryAfterMs?: unknown;
        readonly requestId?: unknown;
      };
      worker.postMessage({
        type: "api_result",
        callId: message.callId,
        ok: false,
        error: {
          name: typeof details.name === "string" ? details.name : "ScriptAdventureApiError",
          message: typeof details.message === "string"
            ? details.message
            : "Adventure Land script API call failed.",
          code: typeof details.code === "string" ? details.code : "SCRIPT_ACTION_FAILED",
          retryAfterMs: typeof details.retryAfterMs === "number"
            ? details.retryAfterMs
            : undefined,
          requestId: typeof details.requestId === "string"
            ? details.requestId
            : undefined,
        },
      });
    }
  }

  async #handleStorageCall(worker: Worker, message: WorkerMessage): Promise<void> {
    if (worker !== this.#worker || typeof message.callId !== "number") return;
    const scriptName = this.#state.scriptName;
    const operation = message.storageOperation;
    if (!this.#storage || !scriptName || (operation !== "set" && operation !== "delete")) {
      worker.postMessage({
        type: "storage_result",
        callId: message.callId,
        ok: false,
        error: {
          name: "ScriptStorageError",
          code: "SCRIPT_STORAGE_UNAVAILABLE",
          message: "Script storage is unavailable.",
        },
      });
      return;
    }

    try {
      const snapshot = operation === "set"
        ? this.#storage.set(scriptName, message.key ?? "", message.value)
        : this.#storage.delete(scriptName, message.key ?? "");
      if (worker !== this.#worker) return;
      worker.postMessage({
        type: "storage_result",
        callId: message.callId,
        ok: true,
        result: { entryCount: snapshot.entries.length },
      });
      this.#logger.debug("Script storage updated.", {
        scriptName,
        runId: this.#state.runId,
        operation,
        key: message.key,
        entryCount: snapshot.entries.length,
        valueLogged: false,
      }, { component: this.#component(scriptName) });
    } catch (error) {
      if (worker !== this.#worker) return;
      const details = error as { readonly name?: unknown; readonly message?: unknown; readonly code?: unknown };
      worker.postMessage({
        type: "storage_result",
        callId: message.callId,
        ok: false,
        error: {
          name: typeof details.name === "string" ? details.name : "ScriptStorageError",
          message: typeof details.message === "string" ? details.message : "Script storage operation failed.",
          code: typeof details.code === "string" ? details.code : "SCRIPT_STORAGE_FAILED",
        },
      });
    }
  }

  #startApiStatePump(worker: Worker): void {
    this.#stopApiStatePump();
    if (!this.#api) return;
    const push = () => {
      if (worker !== this.#worker || !this.#api) return;
      try {
        worker.postMessage({
          type: "api_state",
          state: this.#api.state(),
        });
      } catch {
        // Worker lifecycle handling reports termination separately.
      }
    };
    push();
    this.#apiStateTimer = setInterval(push, this.#apiStateIntervalMs);
    this.#apiStateTimer.unref();
  }

  #stopApiStatePump(): void {
    if (this.#apiStateTimer) clearInterval(this.#apiStateTimer);
    this.#apiStateTimer = undefined;
  }

  #startApiEventBridge(worker: Worker): void {
    this.#stopApiEventBridge();
    if (!this.#api?.onEvent) return;
    this.#apiEventUnsubscribe = this.#api.onEvent((event: AdventureLandGameEvent) => {
      if (
        worker !== this.#worker ||
        this.#state.status !== "running" ||
        !this.#activeEventNames.has(event.name)
      ) return;
      try {
        worker.postMessage({ type: "api_event", event });
        this.#logger.debug("Script game event dispatched.", {
          scriptName: this.#state.scriptName,
          runId: this.#state.runId,
          eventName: event.name,
        }, { component: this.#component(this.#state.scriptName) });
      } catch {
        // Worker lifecycle handling reports termination separately.
      }
    });
  }

  #stopApiEventBridge(): void {
    this.#apiEventUnsubscribe?.();
    this.#apiEventUnsubscribe = undefined;
    this.#activeEventNames.clear();
  }

  #markCrashed(worker: Worker | undefined, error: Error): void {
    if (worker && worker !== this.#worker) return;
    this.#stopApiStatePump();
    this.#stopApiEventBridge();
    const scriptName = this.#state.scriptName;
    this.#state = {
      ...this.#state,
      status: "crashed",
      crashedAt: this.#clock().toISOString(),
      activeTimers: 0,
      activeEventListeners: 0,
      message: "Script crashed inside its isolated worker. The ALRemastered core remains running.",
      error: {
        name: error.name,
        message: error.message,
      },
    };
    this.#logger.error("Script runtime crashed.", error, {
      scriptName,
      runId: this.#state.runId,
      coreIsolated: true,
    }, { component: this.#component(scriptName) });
    if (this.#worker) {
      this.#expectedExit = true;
      const active = this.#worker;
      this.#worker = undefined;
      void active.terminate();
    }
  }

  async #terminateWorker(): Promise<void> {
    this.#stopApiStatePump();
    this.#stopApiEventBridge();
    const worker = this.#worker;
    if (!worker) return;
    this.#expectedExit = true;
    this.#worker = undefined;
    try {
      worker.postMessage({ type: "stop" });
    } catch {
      // The worker may already be gone.
    }
    await worker.terminate();
  }

  async #waitForStatus(
    statuses: readonly ScriptRuntimeStatus[],
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (statuses.includes(this.#state.status)) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return statuses.includes(this.#state.status);
  }
}
