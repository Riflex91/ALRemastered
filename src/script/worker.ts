import { parentPort, workerData } from "node:worker_threads";
import { createContext, Script } from "node:vm";
import {
  isAdventureLandGameEventName,
  type AdventureLandGameEvent,
  type AdventureLandGameEventName,
} from "../character/game-events.ts";

if (!parentPort) throw new Error("Script worker requires a parent port.");

interface ApiState {
  readonly character?: Readonly<Record<string, unknown>>;
  readonly Entities?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly attackCooldownMs?: number;
  readonly lootChests?: readonly Readonly<Record<string, unknown>>[];
}

interface ApiBootstrap {
  readonly G?: Readonly<Record<string, unknown>>;
  readonly state?: ApiState;
}

interface WorkerInput {
  readonly source: string;
  readonly scriptName: string;
  readonly runId: string;
  readonly apiBootstrap?: ApiBootstrap;
}

interface ApiResultMessage {
  readonly type?: string;
  readonly callId?: number;
  readonly ok?: boolean;
  readonly result?: unknown;
  readonly error?: {
    readonly name?: string;
    readonly message?: string;
    readonly code?: string;
    readonly retryAfterMs?: number;
    readonly requestId?: string;
  };
  readonly state?: ApiState;
  readonly event?: AdventureLandGameEvent;
}

type ScriptLogLevel = "debug" | "info" | "warn" | "error";

const input = workerData as WorkerInput;
const timers = new Map<number, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
const pendingApiCalls = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
const pendingStorageCalls = new Map<\n  number,\n  { resolve: (value: unknown) => void; reject: (error: Error) => void }\n>();\nconst eventListeners = new Map<
  AdventureLandGameEventName,
  Set<(payload: Readonly<Record<string, unknown>>) => void>
>();
const character: Record<string, unknown> = {};
const Entities: Record<string, Record<string, unknown>> = {};
const G = input.apiBootstrap?.G ?? {};
let attackCooldownMs = 0;
let nextTimerId = 1;
let nextApiCallId = 1;
let terminal = false;
let paused = false;

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

function postEventListenerState(): void {
  const eventNames = [...eventListeners.entries()]
    .filter(([, listeners]) => listeners.size > 0)
    .map(([name]) => name)
    .sort();
  const activeEventListeners = [...eventListeners.values()]
    .reduce((count, listeners) => count + listeners.size, 0);
  parentPort!.postMessage({ type: "event_listener_state", activeEventListeners, eventNames });
}

function clearAllEventListeners(): void {
  eventListeners.clear();
  postEventListenerState();
}

function reportCrash(error: unknown): void {
  if (terminal) return;
  terminal = true;
  clearAllTimers();
  clearAllEventListeners();
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

function replaceRecord(
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>,
): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) target[key] = value;
}

function applyApiState(state: ApiState | undefined): void {
  replaceRecord(character, state?.character ?? {});
  const nextEntities = state?.Entities ?? {};
  for (const id of Object.keys(Entities)) {
    if (!(id in nextEntities)) delete Entities[id];
  }
  for (const [id, value] of Object.entries(nextEntities)) {
    const current = Entities[id];
    if (current) replaceRecord(current, value);
    else Entities[id] = { ...value };
  }
  attackCooldownMs = Math.max(0, Number(state?.attackCooldownMs) || 0);
}

function entityDistance(entity: Readonly<Record<string, unknown>>): number {
  const cx = finiteNumber(character.x);
  const cy = finiteNumber(character.y);
  const x = finiteNumber(entity.x);
  const y = finiteNumber(entity.y);
  if (cx === undefined || cy === undefined || x === undefined || y === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.hypot(x - cx, y - cy);
}

function getNearestMonster(options: unknown = {}): Record<string, unknown> | null {
  const filter = isRecord(options) ? options : {};
  const requestedTypes = Array.isArray(filter.type)
    ? filter.type.filter((value): value is string => typeof value === "string")
    : typeof filter.type === "string"
      ? [filter.type]
      : [];
  const candidates = Object.values(Entities)
    .filter((entity) => entity.type === "monster")
    .filter((entity) => entity.rip !== true && finiteNumber(entity.hp) !== 0)
    .filter((entity) =>
      requestedTypes.length === 0 ||
      requestedTypes.includes(String(entity.mtype ?? entity.name ?? ""))
    )
    .filter((entity) =>
      filter.target === undefined || entity.target === filter.target
    )
    .filter((entity) => filter.no_target !== true || !entity.target)
    .filter((entity) => {
      const x = finiteNumber(entity.x);
      const y = finiteNumber(entity.y);
      if (x === undefined || y === undefined) return false;
      if (finiteNumber(filter.min_x) !== undefined && x < Number(filter.min_x)) return false;
      if (finiteNumber(filter.max_x) !== undefined && x > Number(filter.max_x)) return false;
      if (finiteNumber(filter.min_y) !== undefined && y < Number(filter.min_y)) return false;
      if (finiteNumber(filter.max_y) !== undefined && y > Number(filter.max_y)) return false;
      return true;
    })
    .sort((left, right) =>
      entityDistance(left) - entityDistance(right) ||
      String(left.id ?? "").localeCompare(String(right.id ?? ""))
    );
  return candidates[0] ?? null;
}

function isInRange(target: unknown, skill?: unknown): boolean {
  if (!isRecord(target)) return false;
  const distance = entityDistance(target);
  if (!Number.isFinite(distance)) return false;
  let range = finiteNumber(character.range);
  if (typeof skill === "string" && isRecord((G as Record<string, unknown>).skills)) {
    const rawSkill = ((G as Record<string, unknown>).skills as Record<string, unknown>)[skill];
    if (isRecord(rawSkill)) range = finiteNumber(rawSkill.range) ?? range;
  }
  return range !== undefined && range > 0 && distance <= range;
}

function canAttack(target: unknown): boolean {
  if (!isRecord(target)) return false;
  if (character.rip === true) return false;
  if (target.type !== "monster" || target.rip === true) return false;
  const hp = finiteNumber(target.hp);
  if (hp !== undefined && hp <= 0) return false;
  if (!isInRange(target)) return false;
  return attackCooldownMs <= 0;
}

function resolveTargetId(target: unknown): string | undefined {
  if (typeof target === "string" && target.trim()) return target.trim();
  if (typeof target === "number" && Number.isFinite(target)) return String(target);
  if (isRecord(target)) {
    if (typeof target.id === "string" && target.id.trim()) return target.id.trim();
    if (typeof target.id === "number" && Number.isFinite(target.id)) return String(target.id);
  }
  return undefined;
}

function scriptOn(eventName: unknown, handler: unknown): void {
  if (!isAdventureLandGameEventName(eventName)) {
    throw new TypeError("on() requires a supported Adventure Land event name.");
  }
  if (typeof handler !== "function") throw new TypeError("on() handler must be a function.");
  const listeners = eventListeners.get(eventName) ?? new Set();
  listeners.add(handler as (payload: Readonly<Record<string, unknown>>) => void);
  eventListeners.set(eventName, listeners);
  postEventListenerState();
}

function scriptOff(eventName: unknown, handler?: unknown): void {
  if (!isAdventureLandGameEventName(eventName)) {
    throw new TypeError("off() requires a supported Adventure Land event name.");
  }
  if (handler !== undefined && typeof handler !== "function") {
    throw new TypeError("off() handler must be a function when provided.");
  }
  const listeners = eventListeners.get(eventName);
  if (!listeners) return;
  if (handler === undefined) listeners.clear();
  else listeners.delete(handler as (payload: Readonly<Record<string, unknown>>) => void);
  if (!listeners.size) eventListeners.delete(eventName);
  postEventListenerState();
}

function dispatchGameEvent(event: AdventureLandGameEvent | undefined): void {
  if (terminal || paused || !event || !isAdventureLandGameEventName(event.name)) return;
  const listeners = eventListeners.get(event.name);
  if (!listeners?.size) return;
  for (const handler of [...listeners]) {
    if (terminal || paused) return;
    try {
      handler(event.payload);
    } catch (error) {
      reportCrash(error);
      return;
    }
  }
}

function apiCall(method: string, payload: Readonly<Record<string, unknown>>): Promise<unknown> {
  if (terminal) return Promise.reject(scriptApiError("SCRIPT_STOPPED", "Script runtime is stopped."));
  if (paused) return Promise.reject(scriptApiError("SCRIPT_PAUSED", "Script runtime is paused."));
  const callId = nextApiCallId++;
  return new Promise((resolve, reject) => {
    pendingApiCalls.set(callId, { resolve, reject });
    parentPort!.postMessage({
      type: "api_call",
      callId,
      method,
      input: payload,
    });
  });
}

function storageKey(value: unknown): string {
  if (typeof value !== "string" || !value.length || /[\u0000-\u001f\u007f]/.test(value)) {
    throw scriptApiError("SCRIPT_STORAGE_KEY_INVALID", "Storage keys must be non-empty strings without control characters.");
  }
  if (Buffer.byteLength(value, "utf8") > 256) {
    throw scriptApiError("SCRIPT_STORAGE_KEY_INVALID", "Storage keys are limited to 256 bytes.");
  }
  return value;
}

function cloneStorageValue(value: unknown): unknown {
  if (value === undefined) {
    throw scriptApiError("SCRIPT_STORAGE_VALUE_INVALID", "Storage values must be JSON-compatible.");
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = undefined;
  }
  if (serialized === undefined) {
    throw scriptApiError("SCRIPT_STORAGE_VALUE_INVALID", "Storage values must be JSON-compatible.");
  }
  return JSON.parse(serialized);
}

function storageCall(
  operation: "set" | "delete",
  key: string,
  value?: unknown,
): Promise<unknown> {
  if (terminal) return Promise.reject(scriptApiError("SCRIPT_STOPPED", "Script runtime is stopped."));
  if (paused) return Promise.reject(scriptApiError("SCRIPT_PAUSED", "Script runtime is paused."));
  const callId = nextStorageCallId++;
  return new Promise((resolve, reject) => {
    pendingStorageCalls.set(callId, { resolve, reject });
    parentPort!.postMessage({
      type: "storage_call",
      callId,
      storageOperation: operation,
      key,
      value,
    });
  });
}

function scriptGet(key: unknown, fallback?: unknown): unknown {
  const safeKey = storageKey(key);
  if (!storageValues.has(safeKey)) return fallback;
  return cloneStorageValue(storageValues.get(safeKey));
}

function scriptSet(key: unknown, value: unknown): Promise<unknown> {
  const safeKey = storageKey(key);
  const safeValue = cloneStorageValue(value);
  const hadPrevious = storageValues.has(safeKey);
  const previous = storageValues.get(safeKey);
  storageValues.set(safeKey, safeValue);
  return storageCall("set", safeKey, safeValue).catch((error) => {
    if (hadPrevious) storageValues.set(safeKey, previous);
    else storageValues.delete(safeKey);
    throw error;
  });
}

function scriptDel(key: unknown): Promise<unknown> {
  const safeKey = storageKey(key);
  const hadPrevious = storageValues.has(safeKey);
  const previous = storageValues.get(safeKey);
  storageValues.delete(safeKey);
  return storageCall("delete", safeKey).catch((error) => {
    if (hadPrevious) storageValues.set(safeKey, previous);
    throw error;
  });
}

function scriptMove(x: unknown, y: unknown): Promise<unknown> {
  const targetX = finiteNumber(x);
  const targetY = finiteNumber(y);
  if (targetX === undefined || targetY === undefined) {
    return Promise.reject(scriptApiError(
      "SCRIPT_MOVE_TARGET_INVALID",
      "move() requires finite x and y coordinates.",
    ));
  }
  return apiCall("move", { x: targetX, y: targetY });
}

function scriptXMove(x: unknown, y: unknown): Promise<unknown> {
  const targetX = finiteNumber(x);
  const targetY = finiteNumber(y);
  if (targetX === undefined || targetY === undefined) {
    return Promise.reject(scriptApiError(
      "SCRIPT_MOVE_TARGET_INVALID",
      "xmove() requires finite x and y coordinates.",
    ));
  }
  return apiCall("xmove", { x: targetX, y: targetY });
}

function scriptAttack(target: unknown): Promise<unknown> {
  const targetId = resolveTargetId(target);
  if (!targetId) {
    return Promise.reject(scriptApiError(
      "SCRIPT_ATTACK_TARGET_REQUIRED",
      "attack() requires a monster entity or ID.",
    ));
  }
  return apiCall("attack", { targetId });
}

function scriptLoot(chest?: unknown): Promise<unknown> {
  const chestId = resolveTargetId(chest);
  return apiCall("loot", chestId ? { chestId } : {});
}

function scriptApiError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code?: string };
  error.name = "ScriptApiError";
  error.code = code;
  return error;
}

function apiResultError(message: ApiResultMessage): Error {
  const error = new Error(message.error?.message ?? "Script API call failed.") as Error & {
    code?: string;
    retryAfterMs?: number;
    requestId?: string;
  };
  error.name = message.error?.name ?? "ScriptApiError";
  error.code = message.error?.code;
  error.retryAfterMs = message.error?.retryAfterMs;
  error.requestId = message.error?.requestId;
  return error;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

applyApiState(input.apiBootstrap?.state);

parentPort.on("message", (raw: unknown) => {
  const message = (isRecord(raw) ? raw : {}) as ApiResultMessage;
  const type = message.type;
  if (type === "api_state") {
    applyApiState(message.state);
    return;
  }
  if (type === "api_event") {
    dispatchGameEvent(message.event);
    return;
  }
  if (type === "storage_result" && typeof message.callId === "number") {\n    const pending = pendingStorageCalls.get(message.callId);\n    if (!pending) return;\n    pendingStorageCalls.delete(message.callId);\n    if (message.ok) pending.resolve(message.result);\n    else pending.reject(apiResultError(message));\n    return;\n  }\n  if (type === "api_result" && typeof message.callId === "number") {
    const pending = pendingApiCalls.get(message.callId);
    if (!pending) return;
    pendingApiCalls.delete(message.callId);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(apiResultError(message));
    return;
  }
  if (type === "pause") {
    paused = true;
    clearAllTimers();
    clearAllEventListeners();
    parentPort!.postMessage({ type: "paused" });
    return;
  }
  if (type === "stop") {
    terminal = true;
    paused = false;
    clearAllTimers();
    clearAllEventListeners();
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
  character,
  G,
  Entities,
  get_nearest_monster: getNearestMonster,
  is_in_range: isInRange,
  can_attack: canAttack,
  move: scriptMove,
  xmove: scriptXMove,
  attack: scriptAttack,
  loot: scriptLoot,
  on: scriptOn,
  off: scriptOff,
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
