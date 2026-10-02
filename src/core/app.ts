import { platform } from "node:os";
import { getAppVersion } from "../version.ts";

export type CoreStatus = "idle" | "running" | "stopping" | "stopped";

export interface HealthSnapshot {
  readonly application: "ALRemastered";
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly status: CoreStatus;
  readonly startedAt: string;
}

export class CoreRuntime {
  readonly #startedAt = new Date();
  #status: CoreStatus = "idle";

  start(): void {
    if (this.#status !== "idle" && this.#status !== "stopped") return;
    this.#status = "running";
  }

  stop(): void {
    if (this.#status !== "running") return;
    this.#status = "stopping";
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
    });
  }
}
