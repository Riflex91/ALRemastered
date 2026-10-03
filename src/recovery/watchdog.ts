import type { AdventureLandCharacterService } from "../character/service.ts";
import type { CoreRuntime } from "../core/app.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type WatchdogComponent = "core" | "character" | "script";
export type WatchdogStatus = "idle" | "running" | "stopped";

export interface WatchdogComponentState {
  readonly monitored: boolean;
  readonly stale: boolean;
  readonly blocked: boolean;
  readonly heartbeatAgeMs?: number;
  readonly lastHeartbeatAt?: string;
  readonly restartCount: number;
  readonly budgetUsed: number;
  readonly budgetLimit: number;
  readonly lastStaleAt?: string;
  readonly lastRestartAt?: string;
  readonly lastRestartReason?: string;
}

export interface WatchdogState {
  readonly status: WatchdogStatus;
  readonly checkIntervalMs: number;
  readonly restartWindowMs: number;
  readonly maxRestartsPerWindow: number;
  readonly checks: number;
  readonly lastCheckAt?: string;
  readonly inFlightComponent?: WatchdogComponent;
  readonly components: Readonly<Record<WatchdogComponent, WatchdogComponentState>>;
  readonly message: string;
}

export interface WatchdogServiceOptions {
  readonly logger: Logger;
  readonly core: Pick<CoreRuntime, "health" | "start" | "stop">;
  readonly character: Pick<AdventureLandCharacterService, "state" | "start" | "stop">;
  readonly script: Pick<ScriptRuntimeService, "state" | "start" | "stop">;
  readonly now?: () => Date;
  readonly checkIntervalMs?: number;
  readonly staleAfterMs?: Partial<Record<WatchdogComponent, number>>;
  readonly maxRestartsPerWindow?: number;
  readonly restartWindowMs?: number;
}

const COMPONENTS: readonly WatchdogComponent[] = ["core", "character", "script"];

export class WatchdogService {
  readonly #logger: Logger;
  readonly #core: WatchdogServiceOptions["core"];
  readonly #character: WatchdogServiceOptions["character"];
  readonly #script: WatchdogServiceOptions["script"];
  readonly #now: () => Date;
  readonly #checkIntervalMs: number;
  readonly #staleAfterMs: Readonly<Record<WatchdogComponent, number>>;
  readonly #maxRestartsPerWindow: number;
  readonly #restartWindowMs: number;
  readonly #restartHistory = new Map<WatchdogComponent, number[]>();
  readonly #restartCount = new Map<WatchdogComponent, number>();
  readonly #lastStaleAt = new Map<WatchdogComponent, string>();
  readonly #lastRestartAt = new Map<WatchdogComponent, string>();
  readonly #lastRestartReason = new Map<WatchdogComponent, string>();
  readonly #blocked = new Set<WatchdogComponent>();
  #timer?: ReturnType<typeof setInterval>;
  #checking?: Promise<WatchdogState>;
  #status: WatchdogStatus = "idle";
  #checks = 0;
  #lastCheckAt?: string;
  #inFlightComponent?: WatchdogComponent;

  constructor(options: WatchdogServiceOptions) {
    this.#logger = options.logger;
    this.#core = options.core;
    this.#character = options.character;
    this.#script = options.script;
    this.#now = options.now ?? (() => new Date());
    this.#checkIntervalMs = Math.max(100, options.checkIntervalMs ?? 500);
    this.#staleAfterMs = Object.freeze({
      core: Math.max(500, options.staleAfterMs?.core ?? 5_000),
      character: Math.max(500, options.staleAfterMs?.character ?? 5_000),
      script: Math.max(500, options.staleAfterMs?.script ?? 1_500),
    });
    this.#maxRestartsPerWindow = Math.max(
      1,
      Math.floor(options.maxRestartsPerWindow ?? 2),
    );
    this.#restartWindowMs = Math.max(
      this.#checkIntervalMs,
      options.restartWindowMs ?? 30_000,
    );
    for (const component of COMPONENTS) {
      this.#restartHistory.set(component, []);
      this.#restartCount.set(component, 0);
    }
  }

  start(): WatchdogState {
    if (this.#status === "running") return this.state();
    this.#status = "running";
    this.#logger.info("Watchdog started.", {
      checkIntervalMs: this.#checkIntervalMs,
      staleAfterMs: this.#staleAfterMs,
      maxRestartsPerWindow: this.#maxRestartsPerWindow,
      restartWindowMs: this.#restartWindowMs,
    });
    this.#timer = setInterval(() => {
      void this.checkNow();
    }, this.#checkIntervalMs);
    this.#timer.unref();
    return this.state();
  }

  stop(): WatchdogState {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#status = "stopped";
    this.#logger.info("Watchdog stopped.", {
      checks: this.#checks,
      restartCounts: Object.fromEntries(
        COMPONENTS.map((component) => [component, this.#restartCount.get(component) ?? 0]),
      ),
    });
    return this.state();
  }

  state(): WatchdogState {
    const nowMs = this.#now().getTime();
    return Object.freeze({
      status: this.#status,
      checkIntervalMs: this.#checkIntervalMs,
      restartWindowMs: this.#restartWindowMs,
      maxRestartsPerWindow: this.#maxRestartsPerWindow,
      checks: this.#checks,
      lastCheckAt: this.#lastCheckAt,
      inFlightComponent: this.#inFlightComponent,
      components: Object.freeze({
        core: this.#componentState("core", nowMs),
        character: this.#componentState("character", nowMs),
        script: this.#componentState("script", nowMs),
      }),
      message: this.#message(),
    });
  }

  checkNow(): Promise<WatchdogState> {
    if (this.#checking) return this.#checking;
    this.#checking = this.#checkInternal().finally(() => {
      this.#checking = undefined;
    });
    return this.#checking;
  }

  resetBudget(component: WatchdogComponent): WatchdogState {
    this.#restartHistory.set(component, []);
    const wasBlocked = this.#blocked.delete(component);
    if (wasBlocked) {
      this.#logger.info("Watchdog restart budget reset.", {
        component,
        manual: true,
      });
    }
    return this.state();
  }

  async #checkInternal(): Promise<WatchdogState> {
    if (this.#status !== "running") return this.state();
    const now = this.#now();
    const nowMs = now.getTime();
    this.#checks += 1;
    this.#lastCheckAt = now.toISOString();

    for (const component of COMPONENTS) {
      this.#pruneBudget(component, nowMs);
      if (this.#blocked.has(component) && this.#budgetUsed(component) < this.#maxRestartsPerWindow) {
        this.#blocked.delete(component);
        this.#logger.info("Watchdog restart budget became available again.", {
          component,
          restartWindowMs: this.#restartWindowMs,
        });
      }

      const observation = this.#observe(component, nowMs);
      if (!observation.monitored || !observation.stale) continue;
      const staleAt = now.toISOString();
      this.#lastStaleAt.set(component, staleAt);
      const reason = observation.lastHeartbeatAt
        ? `${component} heartbeat is stale by ${observation.heartbeatAgeMs} ms.`
        : `${component} heartbeat is missing while the component is active.`;
      this.#lastRestartReason.set(component, reason);

      if (this.#blocked.has(component)) continue;
      if (this.#budgetUsed(component) >= this.#maxRestartsPerWindow) {
        this.#blocked.add(component);
        this.#logger.error("Watchdog restart budget exhausted.", new Error(reason), {
          component,
          budgetUsed: this.#budgetUsed(component),
          budgetLimit: this.#maxRestartsPerWindow,
          restartWindowMs: this.#restartWindowMs,
          noRestartLoop: true,
        });
        continue;
      }

      this.#logger.warn("Watchdog detected a stale component heartbeat.", {
        component,
        heartbeatAgeMs: observation.heartbeatAgeMs,
        lastHeartbeatAt: observation.lastHeartbeatAt,
        staleAfterMs: this.#staleAfterMs[component],
        budgetUsed: this.#budgetUsed(component),
        budgetLimit: this.#maxRestartsPerWindow,
      });
      await this.#restart(component, reason, nowMs);
    }

    return this.state();
  }

  async #restart(
    component: WatchdogComponent,
    reason: string,
    nowMs: number,
  ): Promise<void> {
    const history = this.#restartHistory.get(component) ?? [];
    history.push(nowMs);
    this.#restartHistory.set(component, history);
    this.#restartCount.set(component, (this.#restartCount.get(component) ?? 0) + 1);
    this.#inFlightComponent = component;
    const restartNumber = this.#restartCount.get(component) ?? 0;
    this.#logger.warn("Watchdog controlled restart started.", {
      component,
      restartNumber,
      budgetUsed: history.length,
      budgetLimit: this.#maxRestartsPerWindow,
      reason,
    });

    try {
      if (component === "core") {
        this.#core.stop();
        this.#core.start();
        if (this.#core.health().status !== "running") {
          throw new Error("Core did not return to running state.");
        }
      } else if (component === "character") {
        const before = this.#character.state();
        const characterId = before.characterId;
        if (!characterId) throw new Error("Connected Character ID is unavailable.");
        await this.#character.stop("watchdog-stale-heartbeat");
        const restarted = await this.#character.start(characterId);
        if (restarted.status !== "connected") {
          throw new Error(`Character restart ended in ${restarted.status} state.`);
        }
      } else {
        await this.#script.stop();
        const restarted = await this.#script.start();
        if (restarted.status !== "running") {
          throw new Error(`Script restart ended in ${restarted.status} state.`);
        }
      }
      const restartedAt = this.#now().toISOString();
      this.#lastRestartAt.set(component, restartedAt);
      this.#logger.info("Watchdog controlled restart completed.", {
        component,
        restartNumber,
        restartedAt,
        budgetUsed: this.#budgetUsed(component),
        budgetLimit: this.#maxRestartsPerWindow,
      });
    } catch (error) {
      this.#logger.error("Watchdog controlled restart failed.", error, {
        component,
        restartNumber,
        budgetUsed: this.#budgetUsed(component),
        budgetLimit: this.#maxRestartsPerWindow,
      });
    } finally {
      this.#inFlightComponent = undefined;
    }
  }

  #observe(
    component: WatchdogComponent,
    nowMs: number,
  ): {
    readonly monitored: boolean;
    readonly stale: boolean;
    readonly heartbeatAgeMs?: number;
    readonly lastHeartbeatAt?: string;
  } {
    let monitored = false;
    let lastHeartbeatAt: string | undefined;
    if (component === "core") {
      const health = this.#core.health();
      monitored = health.status === "running";
      lastHeartbeatAt = health.lastHeartbeatAt;
    } else if (component === "character") {
      const state = this.#character.state();
      monitored = state.status === "connected";
      lastHeartbeatAt = state.lastHeartbeatAt;
    } else {
      const state = this.#script.state();
      monitored = state.status === "running";
      lastHeartbeatAt = state.lastHeartbeatAt;
    }
    if (!monitored) return { monitored: false, stale: false, lastHeartbeatAt };
    const parsed = lastHeartbeatAt ? Date.parse(lastHeartbeatAt) : Number.NaN;
    const heartbeatAgeMs = Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : undefined;
    return {
      monitored,
      stale: heartbeatAgeMs === undefined || heartbeatAgeMs > this.#staleAfterMs[component],
      heartbeatAgeMs,
      lastHeartbeatAt,
    };
  }

  #componentState(component: WatchdogComponent, nowMs: number): WatchdogComponentState {
    this.#pruneBudget(component, nowMs);
    const observation = this.#observe(component, nowMs);
    return Object.freeze({
      monitored: observation.monitored,
      stale: observation.stale,
      blocked: this.#blocked.has(component),
      heartbeatAgeMs: observation.heartbeatAgeMs,
      lastHeartbeatAt: observation.lastHeartbeatAt,
      restartCount: this.#restartCount.get(component) ?? 0,
      budgetUsed: this.#budgetUsed(component),
      budgetLimit: this.#maxRestartsPerWindow,
      lastStaleAt: this.#lastStaleAt.get(component),
      lastRestartAt: this.#lastRestartAt.get(component),
      lastRestartReason: this.#lastRestartReason.get(component),
    });
  }

  #pruneBudget(component: WatchdogComponent, nowMs: number): void {
    const history = this.#restartHistory.get(component) ?? [];
    const cutoff = nowMs - this.#restartWindowMs;
    this.#restartHistory.set(component, history.filter((timestamp) => timestamp > cutoff));
  }

  #budgetUsed(component: WatchdogComponent): number {
    return this.#restartHistory.get(component)?.length ?? 0;
  }

  #message(): string {
    if (this.#status !== "running") return "Watchdog is not monitoring components.";
    const blocked = COMPONENTS.filter((component) => this.#blocked.has(component));
    if (blocked.length > 0) {
      return `Watchdog is running; restart budget exhausted for ${blocked.join(", ")}.`;
    }
    return "Watchdog is monitoring active Core, Character, and Script heartbeats.";
  }
}
