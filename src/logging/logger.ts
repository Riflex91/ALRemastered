import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import { sanitizeRecord, sanitizeString, sanitizeValue } from "./sanitizer.ts";

export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

const levelWeight: Record<LogLevel, number> = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
};

export interface LogMeta {
  readonly characterId?: string;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly component: string;
  readonly message: string;
  readonly characterId?: string;
  readonly sessionId?: string;
  readonly requestId?: string;
  readonly context?: unknown;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

export interface LoggerOptions {
  readonly component: string;
  readonly logFile?: string;
  readonly minLevel?: LogLevel;
  readonly ringSize?: number;
  readonly maxFileBytes?: number;
  readonly maxArchives?: number;
  readonly clock?: () => Date;
}

export class Logger {
  readonly #component: string;
  readonly #logFile?: string;
  readonly #minLevel: LogLevel;
  readonly #ringSize: number;
  readonly #maxFileBytes: number;
  readonly #maxArchives: number;
  readonly #clock: () => Date;
  readonly #buffer: LogRecord[] = [];

  constructor(options: LoggerOptions) {
    this.#component = options.component;
    this.#logFile = options.logFile;
    this.#minLevel = options.minLevel ?? "TRACE";
    this.#ringSize = Math.max(1, options.ringSize ?? 2_000);
    this.#maxFileBytes = Math.max(1_024, options.maxFileBytes ?? 5 * 1024 * 1024);
    this.#maxArchives = Math.max(1, options.maxArchives ?? 3);
    this.#clock = options.clock ?? (() => new Date());

    if (this.#logFile) mkdirSync(dirname(this.#logFile), { recursive: true });
  }

  trace(message: string, context?: unknown, meta?: LogMeta): void {
    this.log("TRACE", message, context, undefined, meta);
  }

  debug(message: string, context?: unknown, meta?: LogMeta): void {
    this.log("DEBUG", message, context, undefined, meta);
  }

  info(message: string, context?: unknown, meta?: LogMeta): void {
    this.log("INFO", message, context, undefined, meta);
  }

  warn(message: string, context?: unknown, meta?: LogMeta): void {
    this.log("WARN", message, context, undefined, meta);
  }

  error(message: string, error?: unknown, context?: unknown, meta?: LogMeta): void {
    this.log("ERROR", message, context, error, meta);
  }

  fatal(message: string, error?: unknown, context?: unknown, meta?: LogMeta): void {
    this.log("FATAL", message, context, error, meta);
  }

  log(level: LogLevel, message: string, context?: unknown, error?: unknown, meta?: LogMeta): void {
    if (levelWeight[level] < levelWeight[this.#minLevel]) return;

    const record: LogRecord = sanitizeRecord({
      timestamp: this.#clock().toISOString(),
      level,
      component: this.#component,
      message: sanitizeString(message),
      characterId: meta?.characterId,
      sessionId: meta?.sessionId,
      requestId: meta?.requestId,
      context: context === undefined ? undefined : sanitizeValue(context),
      error: error === undefined ? undefined : normalizeError(error),
    });

    this.#buffer.push(record);
    if (this.#buffer.length > this.#ringSize) {
      this.#buffer.splice(0, this.#buffer.length - this.#ringSize);
    }

    if (this.#logFile) {
      const line = `${JSON.stringify(record)}\n`;
      this.#rotateIfNeeded(Buffer.byteLength(line, "utf8"));
      appendFileSync(this.#logFile, line, "utf8");
    }
  }

  records(): readonly LogRecord[] {
    return this.#buffer.map((record) => structuredClone(record));
  }

  exportText(): string {
    return this.#buffer.map((record) => JSON.stringify(record)).join("\n");
  }

  clearBuffer(): void {
    this.#buffer.length = 0;
  }

  #rotateIfNeeded(incomingBytes: number): void {
    if (!this.#logFile || !existsSync(this.#logFile)) return;
    const currentSize = statSync(this.#logFile).size;
    if (currentSize + incomingBytes <= this.#maxFileBytes) return;

    const oldest = `${this.#logFile}.${this.#maxArchives}`;
    if (existsSync(oldest)) rmSync(oldest, { force: true });

    for (let index = this.#maxArchives - 1; index >= 1; index -= 1) {
      const source = `${this.#logFile}.${index}`;
      const destination = `${this.#logFile}.${index + 1}`;
      if (existsSync(source)) renameSync(source, destination);
    }

    renameSync(this.#logFile, `${this.#logFile}.1`);
  }
}

function normalizeError(error: unknown): LogRecord["error"] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeString(error.message),
      stack: error.stack ? sanitizeString(error.stack) : undefined,
    };
  }

  return {
    name: "Error",
    message: sanitizeString(typeof error === "string" ? error : JSON.stringify(sanitizeValue(error))),
  };
}
