import { randomUUID } from "node:crypto";
import type { Logger } from "../logging/logger.ts";

export type ActionOrigin = "dashboard" | "script" | "system";

export type ActionOutcome =
  | "success"
  | "error"
  | "timeout"
  | "rate_limited";

export interface ActionExecutionContext<TInput> {
  readonly requestId: string;
  readonly action: string;
  readonly origin: ActionOrigin;
  readonly characterId?: string;
  readonly input: TInput;
  readonly signal: AbortSignal;
}

export interface ActionGatewayRequest<TInput, TResult> {
  readonly action: string;
  readonly origin: ActionOrigin;
  readonly characterId?: string;
  readonly input: TInput;
  readonly timeoutMs?: number;
  readonly minIntervalMs?: number;
  readonly rateLimitKey?: string;
  readonly execute: (
    context: ActionExecutionContext<TInput>,
  ) => TResult | Promise<TResult>;
}

export interface ActionGatewayFailure {
  readonly code: string;
  readonly message: string;
}

export interface ActionGatewayResult<TResult = unknown> {
  readonly requestId: string;
  readonly action: string;
  readonly origin: ActionOrigin;
  readonly characterId?: string;
  readonly outcome: ActionOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly result?: TResult;
  readonly error?: ActionGatewayFailure;
  readonly retryAfterMs?: number;
}

export interface ActionGatewayState {
  readonly status: "ready";
  readonly active: number;
  readonly totalRequests: number;
  readonly lastResult?: ActionGatewayResult;
}

export interface ActionGatewayOptions {
  readonly logger: Logger;
  readonly defaultTimeoutMs?: number;
  readonly maxTimeoutMs?: number;
  readonly clock?: () => Date;
  readonly nowMs?: () => number;
  readonly idFactory?: () => string;
}

export class ActionGatewayExecutionError extends Error {
  readonly code: string;

  constructor(message: string, code = "ACTION_FAILED") {
    super(message);
    this.name = "ActionGatewayExecutionError";
    this.code = code;
  }
}

export class ActionGateway {
  readonly #logger: Logger;
  readonly #defaultTimeoutMs: number;
  readonly #maxTimeoutMs: number;
  readonly #clock: () => Date;
  readonly #nowMs: () => number;
  readonly #idFactory: () => string;
  readonly #lastAcceptedAt = new Map<string, number>();
  #active = 0;
  #totalRequests = 0;
  #lastResult?: ActionGatewayResult;

  constructor(options: ActionGatewayOptions) {
    this.#logger = options.logger;
    this.#defaultTimeoutMs = positiveInteger(options.defaultTimeoutMs, 5_000);
    this.#maxTimeoutMs = Math.max(
      this.#defaultTimeoutMs,
      positiveInteger(options.maxTimeoutMs, 60_000),
    );
    this.#clock = options.clock ?? (() => new Date());
    this.#nowMs = options.nowMs ?? (() => Date.now());
    this.#idFactory = options.idFactory ?? (() => `act-${randomUUID()}`);
  }

  state(): ActionGatewayState {
    return Object.freeze({
      status: "ready",
      active: this.#active,
      totalRequests: this.#totalRequests,
      lastResult: this.#lastResult
        ? Object.freeze(structuredClone(this.#lastResult))
        : undefined,
    });
  }

  async run<TInput, TResult>(
    request: ActionGatewayRequest<TInput, TResult>,
  ): Promise<ActionGatewayResult<TResult>> {
    const action = request.action.trim();
    if (!action) throw new Error("Action name is required.");

    const requestId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const startedMs = this.#nowMs();
    this.#totalRequests += 1;

    const minIntervalMs = nonNegativeInteger(request.minIntervalMs, 0);
    const rateKey = request.rateLimitKey?.trim() ||
      [request.origin, request.characterId ?? "-", action].join(":");
    const lastAcceptedAt = this.#lastAcceptedAt.get(rateKey);
    if (
      minIntervalMs > 0 &&
      lastAcceptedAt !== undefined &&
      startedMs - lastAcceptedAt < minIntervalMs
    ) {
      const retryAfterMs = Math.max(
        1,
        minIntervalMs - Math.max(0, startedMs - lastAcceptedAt),
      );
      const result = this.#finish<TResult>({
        requestId,
        action,
        origin: request.origin,
        characterId: request.characterId,
        outcome: "rate_limited",
        startedAt,
        startedMs,
        retryAfterMs,
        error: {
          code: "ACTION_RATE_LIMITED",
          message: "Action rate limit is active.",
        },
      });
      this.#logger.warn(
        "Action gateway request rate-limited.",
        actionLogContext(result),
        actionLogMeta(result),
      );
      return result;
    }

    this.#lastAcceptedAt.set(rateKey, startedMs);
    const timeoutMs = Math.min(
      this.#maxTimeoutMs,
      positiveInteger(request.timeoutMs, this.#defaultTimeoutMs),
    );
    const controller = new AbortController();
    this.#active += 1;

    this.#logger.info(
      "Action gateway request started.",
      {
        action,
        origin: request.origin,
        characterId: request.characterId,
        timeoutMs,
        minIntervalMs,
      },
      {
        requestId,
        characterId: request.characterId,
      },
    );

    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ActionTimeoutError());
          controller.abort("timeout");
        }, timeoutMs);
      });

      const value = await Promise.race([
        Promise.resolve(request.execute({
          requestId,
          action,
          origin: request.origin,
          characterId: request.characterId,
          input: request.input,
          signal: controller.signal,
        })),
        timeout,
      ]);

      const result = this.#finish<TResult>({
        requestId,
        action,
        origin: request.origin,
        characterId: request.characterId,
        outcome: "success",
        startedAt,
        startedMs,
        result: value,
      });
      this.#logger.info(
        "Action gateway request completed.",
        actionLogContext(result),
        actionLogMeta(result),
      );
      return result;
    } catch (error) {
      if (error instanceof ActionTimeoutError) {
        const result = this.#finish<TResult>({
          requestId,
          action,
          origin: request.origin,
          characterId: request.characterId,
          outcome: "timeout",
          startedAt,
          startedMs,
          error: {
            code: "ACTION_TIMEOUT",
            message: "Action did not complete before its timeout.",
          },
        });
        this.#logger.warn(
          "Action gateway request timed out.",
          actionLogContext(result),
          actionLogMeta(result),
        );
        return result;
      }

      const failure = normalizeFailure(error);
      const result = this.#finish<TResult>({
        requestId,
        action,
        origin: request.origin,
        characterId: request.characterId,
        outcome: "error",
        startedAt,
        startedMs,
        error: failure,
      });
      this.#logger.error(
        "Action gateway request failed.",
        error,
        actionLogContext(result),
        actionLogMeta(result),
      );
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      this.#active = Math.max(0, this.#active - 1);
    }
  }

  #finish<TResult>(input: {
    readonly requestId: string;
    readonly action: string;
    readonly origin: ActionOrigin;
    readonly characterId?: string;
    readonly outcome: ActionOutcome;
    readonly startedAt: string;
    readonly startedMs: number;
    readonly result?: TResult;
    readonly error?: ActionGatewayFailure;
    readonly retryAfterMs?: number;
  }): ActionGatewayResult<TResult> {
    const completedAt = this.#clock().toISOString();
    const completedMs = this.#nowMs();
    const result: ActionGatewayResult<TResult> = Object.freeze({
      requestId: input.requestId,
      action: input.action,
      origin: input.origin,
      characterId: input.characterId,
      outcome: input.outcome,
      startedAt: input.startedAt,
      completedAt,
      durationMs: Math.max(0, completedMs - input.startedMs),
      result: input.result === undefined
        ? undefined
        : structuredClone(input.result),
      error: input.error
        ? Object.freeze({ ...input.error })
        : undefined,
      retryAfterMs: input.retryAfterMs,
    });
    this.#lastResult = result;
    return result;
  }
}

class ActionTimeoutError extends Error {
  constructor() {
    super("Action timed out.");
    this.name = "ActionTimeoutError";
  }
}

function normalizeFailure(error: unknown): ActionGatewayFailure {
  if (error instanceof ActionGatewayExecutionError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      code: "ACTION_FAILED",
      message: error.message,
    };
  }
  return {
    code: "ACTION_FAILED",
    message: String(error),
  };
}

function actionLogContext(result: ActionGatewayResult): Record<string, unknown> {
  return {
    action: result.action,
    origin: result.origin,
    characterId: result.characterId,
    outcome: result.outcome,
    durationMs: result.durationMs,
    errorCode: result.error?.code,
    retryAfterMs: result.retryAfterMs,
  };
}

function actionLogMeta(result: ActionGatewayResult): {
  readonly requestId: string;
  readonly characterId?: string;
} {
  return {
    requestId: result.requestId,
    characterId: result.characterId,
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0
    ? Math.floor(value)
    : fallback;
}
