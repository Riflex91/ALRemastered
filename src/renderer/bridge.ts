import type { ActionGatewayState } from "../action/gateway.ts";
import type { AdventureLandCharacterConnectionState } from "../character/service.ts";
import type { MultiCharacterSessionManagerState } from "../character/session-manager.ts";
import type { HealthSnapshot } from "../core/app.ts";
import type { ComponentHealth, DiagnosticError } from "../diagnostics/service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { ScriptRuntimeState } from "../script/runtime.ts";

export interface RendererBridgeDiagnosticsState {
  readonly sanitized: true;
  readonly components: readonly ComponentHealth[];
  readonly recentErrors: readonly DiagnosticError[];
}

export interface RendererBridgeSnapshot {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly eventSequence: number;
  readonly core: HealthSnapshot;
  readonly character?: AdventureLandCharacterConnectionState;
  readonly sessions?: MultiCharacterSessionManagerState;
  readonly script?: ScriptRuntimeState;
  readonly actionGateway?: ActionGatewayState;
  readonly diagnostics?: RendererBridgeDiagnosticsState;
}

export type RendererBridgeEventType = "state" | "log";

export interface RendererBridgeEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly emittedAt: string;
  readonly type: RendererBridgeEventType;
  readonly snapshot?: RendererBridgeSnapshot;
  readonly log?: LogRecord;
}

export interface RendererBridgeState {
  readonly status: "stopped" | "running";
  readonly eventSequence: number;
  readonly subscribers: number;
  readonly stateIntervalMs: number;
  readonly lastStateEventAt?: string;
  readonly lastLogEventAt?: string;
}

export interface RendererBridgeOptions {
  readonly logger: Pick<Logger, "subscribe">;
  readonly core: () => HealthSnapshot;
  readonly character?: () => AdventureLandCharacterConnectionState;
  readonly sessions?: () => MultiCharacterSessionManagerState;
  readonly script?: () => ScriptRuntimeState;
  readonly actionGateway?: () => ActionGatewayState;
  readonly diagnostics?: () => RendererBridgeDiagnosticsState;
  readonly clock?: () => Date;
  readonly stateIntervalMs?: number;
}

type RendererBridgeListener = (event: RendererBridgeEvent) => void;

export class RendererBridge {
  readonly #logger: RendererBridgeOptions["logger"];
  readonly #core: RendererBridgeOptions["core"];
  readonly #character?: RendererBridgeOptions["character"];
  readonly #sessions?: RendererBridgeOptions["sessions"];
  readonly #script?: RendererBridgeOptions["script"];
  readonly #actionGateway?: RendererBridgeOptions["actionGateway"];
  readonly #diagnostics?: RendererBridgeOptions["diagnostics"];
  readonly #clock: () => Date;
  readonly #stateIntervalMs: number;
  readonly #listeners = new Set<RendererBridgeListener>();
  #loggerUnsubscribe?: () => void;
  #timer?: NodeJS.Timeout;
  #eventSequence = 0;
  #lastComparableState?: string;
  #lastStateEventAt?: string;
  #lastLogEventAt?: string;

  constructor(options: RendererBridgeOptions) {
    this.#logger = options.logger;
    this.#core = options.core;
    this.#character = options.character;
    this.#sessions = options.sessions;
    this.#script = options.script;
    this.#actionGateway = options.actionGateway;
    this.#diagnostics = options.diagnostics;
    this.#clock = options.clock ?? (() => new Date());
    this.#stateIntervalMs = Math.max(100, Math.floor(options.stateIntervalMs ?? 250));
  }

  start(): RendererBridgeState {
    if (this.#timer) return this.state();

    this.#loggerUnsubscribe = this.#logger.subscribe((record) => {
      this.#publish({
        type: "log",
        log: structuredClone(record),
      });
      this.#lastLogEventAt = this.#clock().toISOString();
    });

    this.#publishState(true);
    this.#timer = setInterval(() => this.#publishState(false), this.#stateIntervalMs);
    this.#timer.unref();
    return this.state();
  }

  stop(): RendererBridgeState {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#loggerUnsubscribe?.();
    this.#loggerUnsubscribe = undefined;
    return this.state();
  }

  state(): RendererBridgeState {
    return Object.freeze({
      status: this.#timer ? "running" : "stopped",
      eventSequence: this.#eventSequence,
      subscribers: this.#listeners.size,
      stateIntervalMs: this.#stateIntervalMs,
      lastStateEventAt: this.#lastStateEventAt,
      lastLogEventAt: this.#lastLogEventAt,
    });
  }

  snapshot(): RendererBridgeSnapshot {
    return this.#createSnapshot();
  }

  subscribe(listener: RendererBridgeListener, replayCurrent = true): () => void {
    this.#listeners.add(listener);
    if (replayCurrent) {
      listener(Object.freeze({
        schemaVersion: 1,
        sequence: this.#eventSequence,
        emittedAt: this.#clock().toISOString(),
        type: "state",
        snapshot: this.#createSnapshot(),
      }));
    }
    return () => this.#listeners.delete(listener);
  }

  publishStateForTest(): void {
    this.#publishState(true);
  }

  #publishState(force: boolean): void {
    const snapshot = this.#createSnapshot();
    const comparable = JSON.stringify({
      core: snapshot.core,
      character: snapshot.character,
      sessions: snapshot.sessions,
      script: snapshot.script,
      actionGateway: snapshot.actionGateway,
      diagnostics: snapshot.diagnostics,
    });
    if (!force && comparable === this.#lastComparableState) return;
    this.#lastComparableState = comparable;
    this.#publish({ type: "state", snapshot });
    this.#lastStateEventAt = this.#clock().toISOString();
  }

  #createSnapshot(): RendererBridgeSnapshot {
    const diagnostics = this.#diagnostics?.();
    return Object.freeze({
      schemaVersion: 1,
      generatedAt: this.#clock().toISOString(),
      eventSequence: this.#eventSequence,
      core: structuredClone(this.#core()),
      character: this.#safeState(this.#character),
      sessions: this.#safeState(this.#sessions),
      script: this.#safeState(this.#script),
      actionGateway: this.#safeState(this.#actionGateway),
      diagnostics: diagnostics
        ? Object.freeze({
            sanitized: true as const,
            components: structuredClone(diagnostics.components),
            recentErrors: structuredClone(diagnostics.recentErrors),
          })
        : undefined,
    });
  }

  #safeState<T>(provider?: () => T): T | undefined {
    if (!provider) return undefined;
    try {
      return structuredClone(provider());
    } catch {
      return undefined;
    }
  }

  #publish(input: {
    readonly type: RendererBridgeEventType;
    readonly snapshot?: RendererBridgeSnapshot;
    readonly log?: LogRecord;
  }): void {
    this.#eventSequence += 1;
    const event = Object.freeze({
      schemaVersion: 1 as const,
      sequence: this.#eventSequence,
      emittedAt: this.#clock().toISOString(),
      type: input.type,
      snapshot: input.snapshot
        ? Object.freeze({
            ...structuredClone(input.snapshot),
            eventSequence: this.#eventSequence,
          })
        : undefined,
      log: input.log ? structuredClone(input.log) : undefined,
    });
    for (const listener of this.#listeners) listener(event);
  }
}
