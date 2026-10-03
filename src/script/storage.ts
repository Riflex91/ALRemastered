import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../logging/logger.ts";

export type ScriptStorageJson =
  | null
  | boolean
  | number
  | string
  | readonly ScriptStorageJson[]
  | Readonly<Record<string, ScriptStorageJson>>;

export interface ScriptStorageEntry {
  readonly key: string;
  readonly value: ScriptStorageJson;
}

export interface ScriptStorageSnapshot {
  readonly namespace: string;
  readonly entries: readonly ScriptStorageEntry[];
}

interface StoredScriptNamespace {
  readonly schemaVersion: 1;
  readonly namespace: string;
  readonly scriptName: string;
  readonly entries: readonly ScriptStorageEntry[];
  readonly updatedAt: string;
}

const MAX_ENTRIES = 256;
const MAX_KEY_BYTES = 256;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_NAMESPACE_BYTES = 256 * 1024;
const MAX_DEPTH = 24;

export class ScriptStorageStore {
  readonly #rootDir: string;
  readonly #logger?: Logger;
  readonly #now: () => Date;

  constructor(rootDir: string, logger?: Logger, now: () => Date = () => new Date()) {
    this.#rootDir = rootDir;
    this.#logger = logger;
    this.#now = now;
  }

  snapshot(scriptName: string): ScriptStorageSnapshot {
    const name = validateScriptName(scriptName);
    const namespace = namespaceFor(name);
    const stored = this.#read(name, namespace);
    return Object.freeze({
      namespace,
      entries: Object.freeze(stored.map((entry) => Object.freeze({
        key: entry.key,
        value: structuredClone(entry.value),
      }))),
    });
  }

  set(scriptName: string, key: string, value: unknown): ScriptStorageSnapshot {
    const name = validateScriptName(scriptName);
    const namespace = namespaceFor(name);
    const safeKey = validateKey(key);
    const safeValue = normalizeJsonValue(value);
    const serializedValue = JSON.stringify(safeValue);
    if (Buffer.byteLength(serializedValue, "utf8") > MAX_VALUE_BYTES) {
      throw new ScriptStorageError(
        "SCRIPT_STORAGE_VALUE_TOO_LARGE",
        "Script storage values are limited to 64 KiB each.",
      );
    }

    const values = new Map(this.#read(name, namespace).map((entry) => [entry.key, entry.value]));
    values.set(safeKey, safeValue);
    if (values.size > MAX_ENTRIES) {
      throw new ScriptStorageError(
        "SCRIPT_STORAGE_ENTRY_LIMIT",
        `Script storage is limited to ${MAX_ENTRIES} keys per script.`,
      );
    }
    this.#write(name, namespace, values);
    return this.snapshot(name);
  }

  delete(scriptName: string, key: string): ScriptStorageSnapshot {
    const name = validateScriptName(scriptName);
    const namespace = namespaceFor(name);
    const safeKey = validateKey(key);
    const values = new Map(this.#read(name, namespace).map((entry) => [entry.key, entry.value]));
    values.delete(safeKey);
    if (values.size === 0) {
      rmSync(this.#path(namespace), { force: true });
    } else {
      this.#write(name, namespace, values);
    }
    return this.snapshot(name);
  }

  deleteNamespace(scriptName: string): void {
    const name = validateScriptName(scriptName);
    rmSync(this.#path(namespaceFor(name)), { force: true });
  }

  #read(scriptName: string, namespace: string): ScriptStorageEntry[] {
    const path = this.#path(namespace);
    if (!existsSync(path)) return [];
    try {
      const raw = readFileSync(path, "utf8");
      if (Buffer.byteLength(raw, "utf8") > MAX_NAMESPACE_BYTES) {
        throw new Error("Stored namespace exceeds its size limit.");
      }
      const parsed = JSON.parse(raw) as Partial<StoredScriptNamespace>;
      if (
        parsed.schemaVersion !== 1 ||
        parsed.namespace !== namespace ||
        parsed.scriptName !== scriptName ||
        !Array.isArray(parsed.entries) ||
        parsed.entries.length > MAX_ENTRIES
      ) {
        throw new Error("Stored namespace metadata is invalid.");
      }
      const seen = new Set<string>();
      const entries: ScriptStorageEntry[] = [];
      for (const rawEntry of parsed.entries) {
        if (!rawEntry || typeof rawEntry !== "object") {
          throw new Error("Stored namespace entry is invalid.");
        }
        const record = rawEntry as Record<string, unknown>;
        const key = validateKey(record.key);
        if (seen.has(key)) throw new Error("Stored namespace contains duplicate keys.");
        seen.add(key);
        entries.push({
          key,
          value: normalizeJsonValue(record.value),
        });
      }
      return entries;
    } catch (error) {
      this.#logger?.warn("Script storage namespace could not be read and was ignored.", {
        scriptName,
        namespace,
        reason: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  #write(
    scriptName: string,
    namespace: string,
    values: ReadonlyMap<string, ScriptStorageJson>,
  ): void {
    const entries = [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, value }));
    const record: StoredScriptNamespace = {
      schemaVersion: 1,
      namespace,
      scriptName,
      entries,
      updatedAt: this.#now().toISOString(),
    };
    const content = JSON.stringify(record, null, 2) + "\n";
    if (Buffer.byteLength(content, "utf8") > MAX_NAMESPACE_BYTES) {
      throw new ScriptStorageError(
        "SCRIPT_STORAGE_NAMESPACE_TOO_LARGE",
        "Script storage is limited to 256 KiB per script.",
      );
    }

    mkdirSync(this.#rootDir, { recursive: true });
    const path = this.#path(namespace);
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, content, "utf8");
    rmSync(path, { force: true });
    renameSync(temporary, path);
  }

  #path(namespace: string): string {
    return join(this.#rootDir, `${namespace}.json`);
  }
}

export class ScriptStorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScriptStorageError";
    this.code = code;
  }
}

function namespaceFor(scriptName: string): string {
  return createHash("sha256").update(scriptName, "utf8").digest("hex");
}

function validateScriptName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ScriptStorageError("SCRIPT_STORAGE_NAMESPACE_INVALID", "Script storage requires a script name.");
  }
  const name = value.trim();
  if (!name || Buffer.byteLength(name, "utf8") > 256) {
    throw new ScriptStorageError("SCRIPT_STORAGE_NAMESPACE_INVALID", "Script storage script name is invalid.");
  }
  return name;
}

function validateKey(value: unknown): string {
  if (typeof value !== "string" || !value.length) {
    throw new ScriptStorageError("SCRIPT_STORAGE_KEY_INVALID", "Script storage keys must be non-empty strings.");
  }
  if (
    Buffer.byteLength(value, "utf8") > MAX_KEY_BYTES ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ScriptStorageError(
      "SCRIPT_STORAGE_KEY_INVALID",
      "Script storage keys must be at most 256 bytes and contain no control characters.",
    );
  }
  return value;
}

function normalizeJsonValue(value: unknown, depth = 0): ScriptStorageJson {
  if (depth > MAX_DEPTH) {
    throw new ScriptStorageError("SCRIPT_STORAGE_VALUE_INVALID", "Script storage value nesting is too deep.");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ScriptStorageError("SCRIPT_STORAGE_VALUE_INVALID", "Script storage numbers must be finite.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => normalizeJsonValue(entry, depth + 1)));
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, ScriptStorageJson> = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      output[key] = normalizeJsonValue(entry, depth + 1);
    }
    return Object.freeze(output);
  }
  throw new ScriptStorageError(
    "SCRIPT_STORAGE_VALUE_INVALID",
    "Script storage values must be JSON-compatible.",
  );
}
