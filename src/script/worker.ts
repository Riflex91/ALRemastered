import { parentPort, workerData } from "node:worker_threads";
import { createContext, Script } from "node:vm";

if (!parentPort) throw new Error("Script worker requires a parent port.");

interface WorkerInput {
  readonly source: string;
  readonly scriptName: string;
  readonly runId: string;
}

type ScriptLogLevel = "debug" | "info" | "warn" | "error";

const input = workerData as WorkerInput;
const timers = new Map<number, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
let nextTimerId = 1;
let terminal = false;

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "Error", message: String(error) };
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "undefined") return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function postTimerCount(): void {
  parentPort!.postMessage({ type: "timer_count", activeTimers: timers.size });
}

function clearTimer(id: unknown): void {
  if (typeof id !== "number") return;
  const handle = timers.get(id);
  if (!handle) return;
  clearTimeout(handle as ReturnType<typeof setTimeout>);
  clearInterval(handle as ReturnType<typeof setInterval>);
  timers.delete(id);
  postTimerCount();
}

function clearAllTimers(): void {
  for (const handle of timers.values()) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
    clearInterval(handle as ReturnType<typeof setInterval>);
  }
  timers.clear();
  postTimerCount();
}

function reportCrash(error: unknown): void {
  if (terminal) return;
  terminal = true;
  clearAllTimers();
  parentPort!.postMessage({
    type: "crash",
    error: normalizeError(error),
  });
}

function emitLog(level: ScriptLogLevel, values: unknown[]): void {
  parentPort!.postMessage({
    type: "log",
    level,
    message: values.map(formatLogValue).join(" "),
  });
}

function safeDelay(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(24 * 60 * 60 * 1000, numeric));
}

function sandboxSetTimeout(callback: unknown, delay?: unknown, ...args: unknown[]): number {
  if (typeof callback !== "function") throw new TypeError("setTimeout callback must be a function.");
  const id = nextTimerId++;
  const handle = setTimeout(() => {
    timers.delete(id);
    postTimerCount();
    if (terminal) return;
    try {
      callback(...args);
    } catch (error) {
      reportCrash(error);
    }
  }, safeDelay(delay));
  timers.set(id, handle);
  postTimerCount();
  return id;
}

function sandboxSetInterval(callback: unknown, delay?: unknown, ...args: unknown[]): number {
  if (typeof callback !== "function") throw new TypeError("setInterval callback must be a function.");
  const id = nextTimerId++;
  const handle = setInterval(() => {
    if (terminal) return;
    try {
      callback(...args);
    } catch (error) {
      reportCrash(error);
    }
  }, Math.max(1, safeDelay(delay)));
  timers.set(id, handle);
  postTimerCount();
  return id;
}

parentPort.on("message", (message: unknown) => {
  const type = (message as { type?: unknown } | null)?.type;
  if (type === "pause") {
    clearAllTimers();
    parentPort!.postMessage({ type: "paused" });
    return;
  }
  if (type === "stop") {
    terminal = true;
    clearAllTimers();
    parentPort!.postMessage({ type: "stopped" });
    parentPort!.close();
  }
});

process.on("unhandledRejection", (reason) => reportCrash(reason));

const sandbox: Record<string, unknown> = {
  console: Object.freeze({
    debug: (...values: unknown[]) => emitLog("debug", values),
    log: (...values: unknown[]) => emitLog("info", values),
    info: (...values: unknown[]) => emitLog("info", values),
    warn: (...values: unknown[]) => emitLog("warn", values),
    error: (...values: unknown[]) => emitLog("error", values),
  }),
  setTimeout: sandboxSetTimeout,
  clearTimeout: clearTimer,
  setInterval: sandboxSetInterval,
  clearInterval: clearTimer,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

try {
  const context = createContext(sandbox, {
    name: `ALRemastered script: ${input.scriptName}`,
    codeGeneration: { strings: false, wasm: false },
  });
  const compiled = new Script(`"use strict";\n${input.source}`, {
    filename: `${input.scriptName}.js`,
  });
  compiled.runInContext(context, {
    timeout: 750,
    displayErrors: true,
  });
  if (!terminal) {
    parentPort.postMessage({
      type: "started",
      runId: input.runId,
      activeTimers: timers.size,
    });
  }
} catch (error) {
  reportCrash(error);
}
