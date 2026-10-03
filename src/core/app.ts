import { platform } from "node:os";
import { getAppVersion } from "../version.ts";

export type CoreStatus = "idle" | "running" | "stopping" | "stopped";

export interface HealthSnapshot {
  readonly application: "ALRemastered";
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly status: CoreStatus;
  readonly startedAt: string;
  readonly heartbeatSequence: number;
  readonly lastHeartbeatAt?: string;
}

export interface CoreRuntimeOptions {
  readonly clock?: () => Date;
  readonly heartbeatIntervalMs?: number;
}

export class CoreRuntime {
  readonly #clock: () => Date;
  readonly #startedAt: Date;
  readonly #heartbeatIntervalMs: number;
  #heartbeatTimer?: NodeJS.Timeout;
  #heartbeatSequence = 0;
  #lastHeartbeatAt?: string;
  #status: CoreStatus = "idle";

  constructor(options: CoreRuntimeOptions = {}) {
    this.#clock = options.clock ?? (() => new Date());
    this.#startedAt = this.#clock();
    this.#heartbeatIntervalMs = Math.max(25, options.heartbeatIntervalMs ?? 1_000);
  }

  start(): void {
    if (this.#status !== "idle" && this.#status !== "stopped") return;
    this.#status = "running";
    this.#beat();
    this.#heartbeatTimer = setInterval(() => this.#beat(), this.#heartbeatIntervalMs);
    this.#heartbeatTimer.unref();
  }

  stop(): void {
    if (this.#status !== "running") return;
    this.#status = "stopping";
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = undefined;
    this.#status = "stopped";
  }

  get status(): CoreStatus {
    return this.#status;
  }

  health(): HealthSnapshot {
    return Object.freeze({
      application: "ALRemastered",
      version: getAppVersion(),
      platform: platform(),
      status: this.#status,
      startedAt: this.#startedAt.toISOString(),
      heartbeatSequence: this.#heartbeatSequence,
      lastHeartbeatAt: this.#lastHeartbeatAt,
    });
  }

  #beat(): void {
    if (this.#status !== "running") return;
    this.#heartbeatSequence += 1;
    this.#lastHeartbeatAt = this.#clock().toISOString();
  }
}
