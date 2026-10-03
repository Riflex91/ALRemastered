import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { Logger, LogLevel } from "../logging/logger.ts";

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
  readonly logRecords: number;
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
}

interface WorkerMessage {
  readonly type?: string;
  readonly level?: "debug" | "info" | "warn" | "error";
  readonly message?: string;
  readonly activeTimers?: number;
  readonly runId?: string;
  readonly error?: {
    readonly name?: string;
    readonly message?: string;
    readonly stack?: string;
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
  #source?: string;
  #worker?: Worker;
  #expectedExit = false;
  #state: ScriptRuntimeState = {
    status: "unloaded",
    activeTimers: 0,
    logRecords: 0,
    message: "No script loaded.",
  };

  constructor(options: ScriptRuntimeOptions) {
    this.#logger = options.logger;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `script-${randomUUID()}`);
    this.#startupTimeoutMs = options.startupTimeoutMs ?? 1_500;
    this.#pauseTimeoutMs = options.pauseTimeoutMs ?? 750;
  }

  state(): ScriptRuntimeState {
    return structuredClone(this.#state);
  }

  async load(request: ScriptLoadRequest): Promise<ScriptRuntimeState> {
    const name = request.name.trim();
    if (!SCRIPT_NAME_PATTERN.test(name)) {
      throw new Error("Script name must be 1-80 safe display characters.");
    }
    if (!request.source.trim()) throw new Error("Script source is required.");
    if (Buffer.byteLength(request.source, "utf8") > MAX_SCRIPT_BYTES) {
      throw new Error("Script source exceeds the 256 KiB Slice 4.1 limit.");
    }

    await this.#terminateWorker();
    this.#source = request.source;
    this.#state = {
      status: "loaded",
      scriptName: name,
      loadedAt: this.#clock().toISOString(),
      activeTimers: 0,
      logRecords: 0,
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
    const worker = new Worker(workerUrl, {
      workerData: {
        source: this.#source,
        scriptName,
        runId,
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
      message: "Script worker is starting.",
    };

    worker.on("message", (message: WorkerMessage) => this.#handleWorkerMessage(worker, message));
    worker.on("error", (error) => this.#markCrashed(worker, error));
    worker.on("exit", (code) => {
      if (worker !== this.#worker) return;
      this.#worker = undefined;
      if (!this.#expectedExit && this.#state.status !== "crashed") {
        this.#markCrashed(undefined, new Error(`Script worker exited unexpectedly with code ${code}.`));
      }
    });

    this.#logger.info("Script worker start requested.", {
      scriptName,
      runId,
    }, { component: this.#component(scriptName) });

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
        logRecords: 0,
        message: "No script loaded.",
      };
      return this.state();
    }
    this.#state = {
      ...this.#state,
      status: "stopped",
      stoppedAt: this.#clock().toISOString(),
      activeTimers: 0,
      message: "Script stopped. Timers and worker resources were released.",
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
        message: "Script paused. All registered timers were cleared.",
      };
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

  #markCrashed(worker: Worker | undefined, error: Error): void {
    if (worker && worker !== this.#worker) return;
    const scriptName = this.#state.scriptName;
    this.#state = {
      ...this.#state,
      status: "crashed",
      crashedAt: this.#clock().toISOString(),
      activeTimers: 0,
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
