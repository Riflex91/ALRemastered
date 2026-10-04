import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeState } from "../script/runtime.ts";
import {
  createScriptPackage,
  validateScriptPackage,
  type ScriptPackageDocument,
} from "./format.ts";
import {
  ScriptPackageImporter,
  type ScriptPackageRemoteSource,
} from "./importer.ts";
import {
  isDangerousScriptPackagePermission,
  type ScriptPackagePermission,
} from "./permissions.ts";

const LIBRARY_SCHEMA_VERSION = 1;
const MAX_CONFIGURATION_BYTES = 128 * 1024;

export interface ScriptLibraryMyScript {
  readonly name: string;
  readonly status: ScriptRuntimeState["status"];
  readonly active: boolean;
  readonly source: "runtime";
}

export interface ScriptLibraryVersion {
  readonly packageId: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly packageKind: "script" | "dashboard";
  readonly manifestHash: string;
  readonly importedAt?: string;
  readonly permissions: readonly ScriptPackagePermission[];
  readonly dangerousPermissions: readonly ScriptPackagePermission[];
  readonly approvedDangerous: readonly string[];
  readonly configSchema: Readonly<Record<string, unknown>>;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly active: boolean;
  readonly executionAttempted: false;
  readonly remoteSource?: ScriptPackageRemoteSource;
}

export interface ScriptLibraryPackage {
  readonly packageId: string;
  readonly name: string;
  readonly activeVersion?: string;
  readonly versions: readonly ScriptLibraryVersion[];
}

export interface ScriptLibrarySnapshot {
  readonly status: "ready";
  readonly myScripts: readonly ScriptLibraryMyScript[];
  readonly imported: readonly ScriptLibraryPackage[];
  readonly executionSupported: false;
  readonly activationExecutesPackage: false;
  readonly updatesSupported: false;
  readonly rollbackSupported: false;
}

interface StoredLibraryState {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly version: string;
  readonly active: boolean;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
}

interface LocatedPackage {
  readonly document: ScriptPackageDocument;
  readonly packageDir: string;
  readonly packagePath: string;
  readonly statePath: string;
  readonly receiptPath: string;
  readonly packageKind: "script" | "dashboard";
  readonly configSchema: Readonly<Record<string, unknown>>;
}

export class ScriptPackageLibraryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScriptPackageLibraryError";
    this.code = code;
  }
}

export class ScriptPackageLibrary {
  readonly #rootDir: string;
  readonly #logger?: Logger;
  readonly #now: () => Date;
  readonly #runtimeState?: () => ScriptRuntimeState;

  constructor(options: {
    readonly rootDir: string;
    readonly logger?: Logger;
    readonly now?: () => Date;
    readonly runtimeState?: () => ScriptRuntimeState;
  }) {
    this.#rootDir = options.rootDir;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
    this.#runtimeState = options.runtimeState;
  }

  descriptor() {
    return Object.freeze({
      status: "ready",
      sections: Object.freeze(["my-scripts", "imported"]),
      versionsVisible: true,
      activeStateSupported: true,
      configurationSupported: true,
      oneActiveVersionPerPackage: true,
      dashboardPackagesVisible: true,
      dashboardActivationSupported: false,
      activationExecutesPackage: false,
      executionSupported: false,
      updatesSupported: false,
      rollbackSupported: false,
    });
  }

  snapshot(): ScriptLibrarySnapshot {
    const importedById = new Map<string, ScriptLibraryVersion[]>();

    if (existsSync(this.#rootDir)) {
      for (const directory of readdirSync(this.#rootDir, { withFileTypes: true })) {
        if (!directory.isDirectory() || !/^[a-f0-9]{64}$/u.test(directory.name)) continue;
        const packageDir = join(this.#rootDir, directory.name);
        for (const file of readdirSync(packageDir, { withFileTypes: true })) {
          if (!file.isFile() || !file.name.endsWith(".alrpkg")) continue;
          const packagePath = join(packageDir, file.name);
          try {
            const entry = this.#readVersion(packagePath);
            const versions = importedById.get(entry.packageId) ?? [];
            versions.push(entry);
            importedById.set(entry.packageId, versions);
          } catch (error) {
            this.#logger?.warn("Imported package could not be indexed by Script Library.", {
              file: file.name,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    const imported = [...importedById.entries()]
      .map(([packageId, versions]) => {
        const ordered = [...versions].sort((left, right) =>
          right.version.localeCompare(left.version, undefined, { numeric: true }),
        );
        return Object.freeze({
          packageId,
          name: ordered[0]?.name ?? packageId,
          activeVersion: ordered.find((version) => version.active)?.version,
          versions: Object.freeze(ordered),
        });
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const runtime = this.#runtimeState?.();
    const myScripts = runtime?.scriptName
      ? Object.freeze([
        Object.freeze({
          name: runtime.scriptName,
          status: runtime.status,
          active: runtime.status === "running",
          source: "runtime" as const,
        }),
      ])
      : Object.freeze([]);

    return Object.freeze({
      status: "ready",
      myScripts,
      imported: Object.freeze(imported),
      executionSupported: false,
      activationExecutesPackage: false,
      updatesSupported: false,
      rollbackSupported: false,
    });
  }

  setActive(input: {
    readonly packageId: string;
    readonly version: string;
    readonly active: boolean;
  }): ScriptLibrarySnapshot {
    const target = this.#locate(input.packageId, input.version);
    if (target.packageKind !== "script") {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_ACTIVATION_UNSUPPORTED",
        "Dashboard packages are applied through Dashboard layout import, not Script Library activation.",
      );
    }
    const packageDir = target.packageDir;

    if (input.active) {
      for (const file of readdirSync(packageDir, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".alrpkg")) continue;
        const packagePath = join(packageDir, file.name);
        let located: LocatedPackage;
        try {
          located = this.#locateFromPath(packagePath);
        } catch {
          continue;
        }
        if (located.document.manifest.id !== input.packageId) continue;
        const current = this.#readState(located);
        this.#writeState(located, {
          ...current,
          active: located.document.manifest.version === input.version,
        });
      }
    } else {
      const current = this.#readState(target);
      this.#writeState(target, { ...current, active: false });
    }

    this.#logger?.info("Script Library active state changed without package execution.", {
      packageId: input.packageId,
      version: input.version,
      active: input.active,
      executionAttempted: false,
    });
    return this.snapshot();
  }

  setConfiguration(input: {
    readonly packageId: string;
    readonly version: string;
    readonly configuration: unknown;
  }): ScriptLibrarySnapshot {
    const located = this.#locate(input.packageId, input.version);
    if (located.packageKind !== "script") {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_CONFIGURATION_UNSUPPORTED",
        "Dashboard packages do not expose Script Library configuration.",
      );
    }
    const configuration = validateConfiguration(input.configuration, located.configSchema);
    const current = this.#readState(located);
    this.#writeState(located, { ...current, configuration });
    this.#logger?.info("Script Library package configuration updated.", {
      packageId: input.packageId,
      version: input.version,
      active: current.active,
      configurationKeys: Object.keys(configuration).length,
      executionAttempted: false,
    });
    return this.snapshot();
  }

  runSelfTest() {
    const verificationRoot = join(this.#rootDir, ".slice-12-5-verification");
    rmSync(verificationRoot, { recursive: true, force: true });

    const now = () => new Date("2026-10-04T00:00:00.000Z");
    const importer = new ScriptPackageImporter(verificationRoot, undefined, now);
    const packageV1 = libraryFixture("1.0.0", "goo");
    const packageV2 = libraryFixture("1.1.0", "bee");

    const previewV1 = importer.preview(packageV1);
    importer.importPackage({
      packageDocument: packageV1,
      previewToken: previewV1.previewToken,
    });
    const previewV2 = importer.preview(packageV2);
    importer.importPackage({
      packageDocument: packageV2,
      previewToken: previewV2.previewToken,
    });

    const fakeRuntime = (): ScriptRuntimeState => ({
      status: "running",
      scriptName: "User Script",
      loadedAt: "2026-10-04T00:00:00.000Z",
      startedAt: "2026-10-04T00:00:00.000Z",
      runId: "slice-12-5-user-script",
      activeTimers: 1,
      activeEventListeners: 0,
      logRecords: 0,
      heartbeatSequence: 1,
      lastHeartbeatAt: "2026-10-04T00:00:00.000Z",
      message: "User Script continues running.",
    });
    const verifier = new ScriptPackageLibrary({
      rootDir: verificationRoot,
      now,
      runtimeState: fakeRuntime,
    });

    const initial = verifier.snapshot();
    verifier.setConfiguration({
      packageId: packageV1.manifest.id,
      version: "1.0.0",
      configuration: { monster: "crab", range: 175 },
    });
    verifier.setActive({
      packageId: packageV1.manifest.id,
      version: "1.0.0",
      active: true,
    });
    verifier.setActive({
      packageId: packageV1.manifest.id,
      version: "1.1.0",
      active: true,
    });

    const persisted = new ScriptPackageLibrary({
      rootDir: verificationRoot,
      now,
      runtimeState: fakeRuntime,
    }).snapshot();
    const imported = persisted.imported.find((entry) => entry.packageId === packageV1.manifest.id);
    const version1 = imported?.versions.find((entry) => entry.version === "1.0.0");
    const version2 = imported?.versions.find((entry) => entry.version === "1.1.0");

    const checks = Object.freeze({
      myScriptsVisible:
        persisted.myScripts.length === 1 &&
        persisted.myScripts[0]?.name === "User Script" &&
        persisted.myScripts[0]?.status === "running",
      importedVisible: initial.imported.length === 1,
      versionsVisible:
        imported?.versions.length === 2 &&
        Boolean(version1) &&
        Boolean(version2),
      inactiveByDefault:
        initial.imported[0]?.versions.every((version) => version.active === false) === true,
      configurationVisible:
        version1?.configSchema.type === "object" &&
        version1.configuration.monster === "crab" &&
        version1.configuration.range === 175,
      configurationPersisted:
        version1?.configuration.monster === "crab" &&
        version1.configuration.range === 175,
      oneActiveVersion:
        imported?.activeVersion === "1.1.0" &&
        version1?.active === false &&
        version2?.active === true,
      activationNoExecution:
        persisted.activationExecutesPackage === false &&
        persisted.executionSupported === false &&
        version1?.executionAttempted === false &&
        version2?.executionAttempted === false,
      laterSliceBoundaries:
        persisted.updatesSupported === false &&
        persisted.rollbackSupported === false,
      cleanup: false,
    });

    rmSync(verificationRoot, { recursive: true, force: true });
    const cleanup = !existsSync(verificationRoot);
    const finalChecks = Object.freeze({ ...checks, cleanup });
    const ready = Object.values(finalChecks).every((value) => value === true);

    return Object.freeze({
      status: ready ? "ready" : "failed",
      descriptor: this.descriptor(),
      initial,
      persisted,
      checks: finalChecks,
    });
  }

  #readVersion(packagePath: string): ScriptLibraryVersion {
    const located = this.#locateFromPath(packagePath);
    const inspection = validateScriptPackage(located.document);
    const state = this.#readState(located);
    const receipt = readReceipt(located.receiptPath);
    const permissions =
      located.document.manifest.permissions as readonly ScriptPackagePermission[];

    return Object.freeze({
      packageId: inspection.packageId,
      name: inspection.name,
      version: inspection.version,
      author: inspection.author,
      description: descriptionFromReadme(
        located.document.files[located.document.manifest.readme.path] ?? "",
      ),
      packageKind: inspection.packageKind,
      manifestHash: inspection.manifestHash,
      importedAt: typeof receipt.importedAt === "string" ? receipt.importedAt : undefined,
      permissions: Object.freeze([...permissions]),
      dangerousPermissions: Object.freeze(
        permissions.filter(isDangerousScriptPackagePermission),
      ),
      approvedDangerous: Object.freeze(
        Array.isArray(receipt.approvedDangerous)
          ? receipt.approvedDangerous.filter((value): value is string => typeof value === "string")
          : [],
      ),
      configSchema: located.configSchema,
      configuration: state.configuration,
      active: state.active,
      executionAttempted: false,
      ...(isRemoteSource(receipt.remoteSource)
        ? { remoteSource: Object.freeze(structuredClone(receipt.remoteSource)) }
        : {}),
    });
  }

  #locate(packageId: string, version: string): LocatedPackage {
    if (!packageId.trim() || !version.trim()) {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_SELECTION_INVALID",
        "Package ID and version are required.",
      );
    }
    const packageDir = join(this.#rootDir, sha256Text(packageId));
    const packagePath = join(packageDir, `${version}.alrpkg`);
    if (!existsSync(packagePath)) {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_VERSION_NOT_FOUND",
        "The selected imported package version was not found.",
      );
    }
    const located = this.#locateFromPath(packagePath);
    if (
      located.document.manifest.id !== packageId ||
      located.document.manifest.version !== version
    ) {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_VERSION_NOT_FOUND",
        "The selected imported package version does not match stored package metadata.",
      );
    }
    return located;
  }

  #locateFromPath(packagePath: string): LocatedPackage {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(packagePath, "utf8"));
    } catch {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_DOCUMENT_INVALID",
        "Imported package document could not be read.",
      );
    }
    const inspection = validateScriptPackage(parsed);
    const document = parsed as ScriptPackageDocument;
    const packageDir = join(this.#rootDir, sha256Text(document.manifest.id));
    const expectedPath = join(packageDir, `${document.manifest.version}.alrpkg`);
    if (packagePath !== expectedPath) {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_STORAGE_INVALID",
        "Imported package is stored outside its canonical package path.",
      );
    }
    let configSchema: unknown = {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
    if (inspection.packageKind === "script") {
      const schemaText = document.files[document.manifest.configSchema!.path];
      try {
        configSchema = JSON.parse(schemaText ?? "");
      } catch {
        throw new ScriptPackageLibraryError(
          "PACKAGE_LIBRARY_CONFIG_SCHEMA_INVALID",
          "Imported package Config Schema could not be read.",
        );
      }
      if (!isRecord(configSchema)) {
        throw new ScriptPackageLibraryError(
          "PACKAGE_LIBRARY_CONFIG_SCHEMA_INVALID",
          "Imported package Config Schema must be an object.",
        );
      }
    }
    return {
      document,
      packageDir,
      packagePath,
      statePath: join(packageDir, `${document.manifest.version}.library.json`),
      receiptPath: join(packageDir, `${document.manifest.version}.import.json`),
      packageKind: inspection.packageKind,
      configSchema: Object.freeze(structuredClone(configSchema)),
    };
  }

  #readState(located: LocatedPackage): StoredLibraryState {
    const fallback: StoredLibraryState = Object.freeze({
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      packageId: located.document.manifest.id,
      version: located.document.manifest.version,
      active: false,
      configuration: Object.freeze(defaultConfiguration(located.configSchema)),
      updatedAt: this.#now().toISOString(),
    });
    if (!existsSync(located.statePath)) return fallback;

    try {
      const parsed = JSON.parse(readFileSync(located.statePath, "utf8"));
      if (
        !isRecord(parsed) ||
        parsed.schemaVersion !== LIBRARY_SCHEMA_VERSION ||
        parsed.packageId !== fallback.packageId ||
        parsed.version !== fallback.version ||
        typeof parsed.active !== "boolean"
      ) {
        throw new Error("Stored library state metadata is invalid.");
      }
      const configuration = validateConfiguration(
        parsed.configuration,
        located.configSchema,
      );
      return Object.freeze({
        ...fallback,
        active: parsed.active,
        configuration,
        updatedAt: typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : fallback.updatedAt,
      });
    } catch (error) {
      this.#logger?.warn("Script Library state could not be read and defaults were used.", {
        packageId: fallback.packageId,
        version: fallback.version,
        reason: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  #writeState(
    located: LocatedPackage,
    input: Pick<StoredLibraryState, "active" | "configuration">,
  ): void {
    const configuration = validateConfiguration(
      input.configuration,
      located.configSchema,
    );
    const record: StoredLibraryState = Object.freeze({
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      packageId: located.document.manifest.id,
      version: located.document.manifest.version,
      active: input.active,
      configuration,
      updatedAt: this.#now().toISOString(),
    });
    const content = JSON.stringify(record, null, 2) + "\n";
    if (Buffer.byteLength(content, "utf8") > MAX_CONFIGURATION_BYTES) {
      throw new ScriptPackageLibraryError(
        "PACKAGE_LIBRARY_CONFIGURATION_TOO_LARGE",
        "Package Library configuration exceeds 128 KiB.",
      );
    }
    mkdirSync(located.packageDir, { recursive: true });
    atomicWrite(located.statePath, content);
  }
}

function libraryFixture(version: string, defaultMonster: string): ScriptPackageDocument {
  return createScriptPackage({
    manifest: {
      id: "org.alremastered.slice125-fixture",
      name: "Slice 12.5 Script Library Fixture",
      version,
      author: { name: "ALRemastered Verification" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.78" },
        adventureLand: { channel: "live" },
      },
      permissions: ["movement"],
      scripts: [{ path: "scripts/main.js", entry: true }],
      configSchema: { path: "config.schema.json" },
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": "log('Slice 12.5 fixture remains unexecuted.');\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: {
          monster: { type: "string", default: defaultMonster },
          range: { type: "number", default: 120 },
        },
        required: ["monster"],
        additionalProperties: false,
      }),
      "README.md":
        "# Slice 12.5 Script Library Fixture\n\nLibrary fixture for versions, state, and configuration.\n",
    },
  });
}

function readReceipt(path: string): Readonly<Record<string, unknown>> {
  if (!existsSync(path)) return Object.freeze({});
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed)
      ? Object.freeze(structuredClone(parsed))
      : Object.freeze({});
  } catch {
    return Object.freeze({});
  }
}

function defaultConfiguration(
  schema: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if (!isRecord(schema.properties)) return output;
  for (const [key, propertySchema] of Object.entries(schema.properties)) {
    if (!isRecord(propertySchema) || !("default" in propertySchema)) continue;
    output[key] = structuredClone(propertySchema.default);
  }
  return output;
}

function validateConfiguration(
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new ScriptPackageLibraryError(
      "PACKAGE_LIBRARY_CONFIGURATION_INVALID",
      "Package configuration must be a JSON object.",
    );
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_CONFIGURATION_BYTES) {
    throw new ScriptPackageLibraryError(
      "PACKAGE_LIBRARY_CONFIGURATION_TOO_LARGE",
      "Package Library configuration exceeds 128 KiB.",
    );
  }
  validateSchemaValue(value, schema, "configuration");
  return Object.freeze(structuredClone(value));
}

function validateSchemaValue(
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
  path: string,
): void {
  if (Array.isArray(schema.enum)) {
    const encoded = JSON.stringify(value);
    if (!schema.enum.some((candidate) => JSON.stringify(candidate) === encoded)) {
      configError(`${path} must match one of the configured enum values.`);
    }
  }

  if (typeof schema.type === "string" && !matchesSchemaType(value, schema.type)) {
    configError(`${path} must be of type ${schema.type}.`);
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === "string")
      : [];
    for (const key of required) {
      if (!(key in value)) configError(`${path}.${key} is required.`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          configError(`${path}.${key} is not declared by the package Config Schema.`);
        }
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      const childSchema = properties[key];
      if (isRecord(childSchema)) validateSchemaValue(entry, childSchema, `${path}.${key}`);
    }
  }

  if (Array.isArray(value) && isRecord(schema.items)) {
    value.forEach((entry, index) =>
      validateSchemaValue(entry, schema.items as Readonly<Record<string, unknown>>, `${path}[${index}]`)
    );
  }
}

function matchesSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function configError(message: string): never {
  throw new ScriptPackageLibraryError(
    "PACKAGE_LIBRARY_CONFIGURATION_INVALID",
    message,
  );
}

function descriptionFromReadme(readme: string): string {
  const paragraph = readme
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join(" ")
    .slice(0, 600);
  return paragraph || "No package description provided.";
}

function atomicWrite(path: string, content: string): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, "utf8");
  rmSync(path, { force: true });
  renameSync(temporary, path);
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function isRemoteSource(value: unknown): value is ScriptPackageRemoteSource {
  if (!isRecord(value)) return false;
  if (value.kind !== "link" && value.kind !== "github") return false;
  return typeof value.inputUrl === "string" && typeof value.resolvedUrl === "string";
}
