import { createHash } from "node:crypto";
import { isScriptPackagePermission } from "./permissions.ts";

export const SCRIPT_PACKAGE_FORMAT = "alremastered-script-package";
export const SCRIPT_PACKAGE_SCHEMA_VERSION = 1;
export const SCRIPT_PACKAGE_FILE_EXTENSION = ".alrpkg";
export const SCRIPT_PACKAGE_HASH_ALGORITHM = "sha256";

const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PERMISSION_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 64;

export interface ScriptPackageAuthor {
  readonly name: string;
  readonly url?: string;
}

export interface ScriptPackageCompatibility {
  readonly alremastered: {
    readonly minVersion: string;
    readonly maxVersion?: string;
  };
  readonly adventureLand: {
    readonly channel: "live";
    readonly dataVersion?: number;
  };
}

export interface ScriptPackageScript {
  readonly path: string;
  readonly entry: boolean;
}

export type ScriptPackageKind = "script" | "dashboard";

export interface ScriptPackageManifest {
  readonly kind?: ScriptPackageKind;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: ScriptPackageAuthor;
  readonly compatibility: ScriptPackageCompatibility;
  readonly permissions: readonly string[];
  readonly scripts?: readonly ScriptPackageScript[];
  readonly configSchema?: {
    readonly path: string;
  };
  readonly dashboard?: {
    readonly path: string;
  };
  readonly readme: {
    readonly path: string;
  };
}

export interface ScriptPackageHashes {
  readonly algorithm: typeof SCRIPT_PACKAGE_HASH_ALGORITHM;
  readonly manifest: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface ScriptPackageDocument {
  readonly format: typeof SCRIPT_PACKAGE_FORMAT;
  readonly schemaVersion: typeof SCRIPT_PACKAGE_SCHEMA_VERSION;
  readonly manifest: ScriptPackageManifest;
  readonly files: Readonly<Record<string, string>>;
  readonly hashes: ScriptPackageHashes;
}

export interface ScriptPackageInspection {
  readonly valid: true;
  readonly format: typeof SCRIPT_PACKAGE_FORMAT;
  readonly schemaVersion: typeof SCRIPT_PACKAGE_SCHEMA_VERSION;
  readonly packageId: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly compatibility: ScriptPackageCompatibility;
  readonly permissions: readonly string[];
  readonly packageKind: ScriptPackageKind;
  readonly scriptCount: number;
  readonly entryScript?: string;
  readonly configSchemaPath?: string;
  readonly dashboardPath?: string;
  readonly readmePath: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly hashAlgorithm: typeof SCRIPT_PACKAGE_HASH_ALGORITHM;
  readonly manifestHash: string;
  readonly permissionEnforcement: false;
  readonly importAttempted: false;
  readonly executionAttempted: false;
}

export class ScriptPackageFormatError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScriptPackageFormatError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new ScriptPackageFormatError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.length > 160) {
    fail("PACKAGE_PATH_INVALID", `${label} must be a non-empty relative path up to 160 characters.`);
  }
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("//") ||
    value.split("/").some((part) => part === "." || part === ".." || !part)
  ) {
    fail("PACKAGE_PATH_INVALID", `${label} must be a safe normalized relative path.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) {
    fail("PACKAGE_PATH_INVALID", `${label} contains unsupported path characters.`);
  }
  return value;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    fail("PACKAGE_FIELD_INVALID", `${label} must be a non-empty string up to ${maxLength} characters.`);
  }
  return value.trim();
}

function semanticVersion(value: unknown, label: string): string {
  const version = requiredString(value, label, 80);
  if (!VERSION_PATTERN.test(version)) {
    fail("PACKAGE_VERSION_INVALID", `${label} must be a semantic version.`);
  }
  return version;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function canonicalPackageJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateManifest(input: unknown): ScriptPackageManifest {
  if (!isRecord(input)) fail("PACKAGE_MANIFEST_INVALID", "Package manifest must be an object.");

  const explicitKind = input.kind === undefined ? undefined : requiredString(input.kind, "manifest.kind", 20);
  const packageKind: ScriptPackageKind = explicitKind === undefined
    ? "script"
    : explicitKind === "script" || explicitKind === "dashboard"
      ? explicitKind
      : fail("PACKAGE_KIND_INVALID", "manifest.kind must be script or dashboard.");

  const id = requiredString(input.id, "manifest.id", 80);
  if (!PACKAGE_ID_PATTERN.test(id)) {
    fail("PACKAGE_ID_INVALID", "manifest.id must be a lowercase stable package identifier.");
  }

  const name = requiredString(input.name, "manifest.name", 120);
  const version = semanticVersion(input.version, "manifest.version");

  if (!isRecord(input.author)) fail("PACKAGE_AUTHOR_INVALID", "manifest.author must be an object.");
  const authorName = requiredString(input.author.name, "manifest.author.name", 120);
  let authorUrl: string | undefined;
  if (input.author.url !== undefined) {
    authorUrl = requiredString(input.author.url, "manifest.author.url", 300);
    let url: URL;
    try {
      url = new URL(authorUrl);
    } catch {
      fail("PACKAGE_AUTHOR_INVALID", "manifest.author.url must be an absolute http(s) URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      fail("PACKAGE_AUTHOR_INVALID", "manifest.author.url must use http or https.");
    }
  }

  if (!isRecord(input.compatibility)) {
    fail("PACKAGE_COMPATIBILITY_INVALID", "manifest.compatibility must be an object.");
  }
  if (!isRecord(input.compatibility.alremastered)) {
    fail("PACKAGE_COMPATIBILITY_INVALID", "manifest.compatibility.alremastered must be an object.");
  }
  const minVersion = semanticVersion(
    input.compatibility.alremastered.minVersion,
    "manifest.compatibility.alremastered.minVersion",
  );
  const maxVersion = input.compatibility.alremastered.maxVersion === undefined
    ? undefined
    : semanticVersion(
      input.compatibility.alremastered.maxVersion,
      "manifest.compatibility.alremastered.maxVersion",
    );

  if (!isRecord(input.compatibility.adventureLand)) {
    fail("PACKAGE_COMPATIBILITY_INVALID", "manifest.compatibility.adventureLand must be an object.");
  }
  if (input.compatibility.adventureLand.channel !== "live") {
    fail("PACKAGE_COMPATIBILITY_INVALID", "Adventure Land compatibility channel must be live.");
  }
  const dataVersionValue = input.compatibility.adventureLand.dataVersion;
  const dataVersion = dataVersionValue === undefined
    ? undefined
    : Number(dataVersionValue);
  if (
    dataVersion !== undefined &&
    (!Number.isInteger(dataVersion) || dataVersion <= 0)
  ) {
    fail("PACKAGE_COMPATIBILITY_INVALID", "Adventure Land dataVersion must be a positive integer.");
  }

  if (!Array.isArray(input.permissions)) {
    fail("PACKAGE_PERMISSIONS_INVALID", "manifest.permissions must be an array.");
  }
  const permissions = input.permissions.map((value, index) => {
    const permission = requiredString(value, `manifest.permissions[${index}]`, 80);
    if (!PERMISSION_PATTERN.test(permission)) {
      fail("PACKAGE_PERMISSIONS_INVALID", `Invalid permission declaration: ${permission}.`);
    }
    if (!isScriptPackagePermission(permission)) {
      fail("PACKAGE_PERMISSIONS_INVALID", `Unsupported permission declaration: ${permission}.`);
    }
    return permission;
  });
  if (new Set(permissions).size !== permissions.length) {
    fail("PACKAGE_PERMISSIONS_INVALID", "Permission declarations must be unique.");
  }

  if (!isRecord(input.readme)) {
    fail("PACKAGE_README_INVALID", "manifest.readme must be an object.");
  }
  const readmePath = safePath(input.readme.path, "manifest.readme.path");
  if (!/\.md$/i.test(readmePath)) {
    fail("PACKAGE_README_INVALID", "README must reference a Markdown file.");
  }

  const common = {
    ...(explicitKind === undefined ? {} : { kind: packageKind }),
    id,
    name,
    version,
    author: Object.freeze({ name: authorName, ...(authorUrl ? { url: authorUrl } : {}) }),
    compatibility: Object.freeze({
      alremastered: Object.freeze({
        minVersion,
        ...(maxVersion ? { maxVersion } : {}),
      }),
      adventureLand: Object.freeze({
        channel: "live" as const,
        ...(dataVersion ? { dataVersion } : {}),
      }),
    }),
    permissions: Object.freeze(permissions.slice()),
    readme: Object.freeze({ path: readmePath }),
  };

  if (packageKind === "dashboard") {
    if (permissions.length !== 0) {
      fail("PACKAGE_DASHBOARD_PERMISSIONS_INVALID", "Dashboard-only packages must not request script permissions.");
    }
    if (input.scripts !== undefined || input.configSchema !== undefined) {
      fail(
        "PACKAGE_COMBINED_KIND_UNSUPPORTED",
        "Combined Script + Dashboard packages are reserved for Slice 13.2.",
      );
    }
    if (!isRecord(input.dashboard)) {
      fail("PACKAGE_DASHBOARD_INVALID", "manifest.dashboard must be an object.");
    }
    const dashboardPath = safePath(input.dashboard.path, "manifest.dashboard.path");
    if (!dashboardPath.endsWith(".json")) {
      fail("PACKAGE_DASHBOARD_INVALID", "Dashboard profile must reference a JSON file.");
    }
    return Object.freeze({
      ...common,
      kind: "dashboard" as const,
      dashboard: Object.freeze({ path: dashboardPath }),
    });
  }

  if (input.dashboard !== undefined) {
    fail(
      "PACKAGE_COMBINED_KIND_UNSUPPORTED",
      "Combined Script + Dashboard packages are reserved for Slice 13.2.",
    );
  }
  if (!Array.isArray(input.scripts) || input.scripts.length === 0) {
    fail("PACKAGE_SCRIPTS_INVALID", "manifest.scripts must contain at least one script.");
  }
  const scriptPaths = new Set<string>();
  let entryCount = 0;
  const scripts = input.scripts.map((value, index) => {
    if (!isRecord(value)) {
      fail("PACKAGE_SCRIPTS_INVALID", `manifest.scripts[${index}] must be an object.`);
    }
    const path = safePath(value.path, `manifest.scripts[${index}].path`);
    if (!path.endsWith(".js") && !path.endsWith(".mjs")) {
      fail("PACKAGE_SCRIPTS_INVALID", "Package scripts must use .js or .mjs files.");
    }
    if (scriptPaths.has(path)) fail("PACKAGE_SCRIPTS_INVALID", "Script paths must be unique.");
    scriptPaths.add(path);
    if (typeof value.entry !== "boolean") {
      fail("PACKAGE_SCRIPTS_INVALID", "Each script entry flag must be boolean.");
    }
    if (value.entry) entryCount += 1;
    return Object.freeze({ path, entry: value.entry });
  });
  if (entryCount !== 1) {
    fail("PACKAGE_SCRIPTS_INVALID", "Exactly one package script must be marked as the entry script.");
  }

  if (!isRecord(input.configSchema)) {
    fail("PACKAGE_CONFIG_SCHEMA_INVALID", "manifest.configSchema must be an object.");
  }
  const configSchemaPath = safePath(input.configSchema.path, "manifest.configSchema.path");
  if (!configSchemaPath.endsWith(".json")) {
    fail("PACKAGE_CONFIG_SCHEMA_INVALID", "Config Schema must reference a JSON file.");
  }

  return Object.freeze({
    ...common,
    scripts: Object.freeze(scripts),
    configSchema: Object.freeze({ path: configSchemaPath }),
  });
}

function validateFiles(input: unknown): Readonly<Record<string, string>> {
  if (!isRecord(input)) fail("PACKAGE_FILES_INVALID", "Package files must be an object.");
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > MAX_FILES) {
    fail("PACKAGE_FILES_INVALID", `Package files must contain 1-${MAX_FILES} files.`);
  }

  let totalBytes = 0;
  const files: Record<string, string> = {};
  for (const [rawPath, rawContent] of entries) {
    const path = safePath(rawPath, "package file path");
    if (typeof rawContent !== "string") {
      fail("PACKAGE_FILES_INVALID", `Package file ${path} must contain UTF-8 text.`);
    }
    const bytes = Buffer.byteLength(rawContent, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      fail("PACKAGE_FILE_TOO_LARGE", `Package file ${path} exceeds 512 KiB.`);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_PACKAGE_BYTES) {
      fail("PACKAGE_TOO_LARGE", "Package text payload exceeds 2 MiB.");
    }
    files[path] = rawContent;
  }
  return Object.freeze(files);
}

function validateReferencedFiles(
  manifest: ScriptPackageManifest,
  files: Readonly<Record<string, string>>,
): void {
  const packageKind: ScriptPackageKind = manifest.kind === "dashboard" ? "dashboard" : "script";
  const requiredPaths = packageKind === "dashboard"
    ? [manifest.dashboard!.path, manifest.readme.path]
    : [
      ...manifest.scripts!.map((script) => script.path),
      manifest.configSchema!.path,
      manifest.readme.path,
    ];
  for (const path of requiredPaths) {
    if (!(path in files)) {
      fail("PACKAGE_FILE_MISSING", `Referenced package file is missing: ${path}.`);
    }
  }

  if (packageKind === "dashboard") {
    let dashboard: unknown;
    try {
      dashboard = JSON.parse(files[manifest.dashboard!.path]!);
    } catch {
      fail("PACKAGE_DASHBOARD_INVALID", "Dashboard profile file must contain valid JSON.");
    }
    if (!isRecord(dashboard)) {
      fail("PACKAGE_DASHBOARD_INVALID", "Dashboard profile JSON must be an object.");
    }
  } else {
    const configText = files[manifest.configSchema!.path]!;
    let config: unknown;
    try {
      config = JSON.parse(configText);
    } catch {
      fail("PACKAGE_CONFIG_SCHEMA_INVALID", "Config Schema file must contain valid JSON.");
    }
    if (!isRecord(config)) {
      fail("PACKAGE_CONFIG_SCHEMA_INVALID", "Config Schema JSON must be an object.");
    }

    for (const script of manifest.scripts!) {
      if (!files[script.path]!.trim()) {
        fail("PACKAGE_SCRIPTS_INVALID", `Script file must not be empty: ${script.path}.`);
      }
    }
  }

  if (!files[manifest.readme.path]!.trim()) {
    fail("PACKAGE_README_INVALID", "README file must not be empty.");
  }
}

function createHashes(
  manifest: ScriptPackageManifest,
  files: Readonly<Record<string, string>>,
): ScriptPackageHashes {
  return Object.freeze({
    algorithm: SCRIPT_PACKAGE_HASH_ALGORITHM,
    manifest: sha256Text(canonicalPackageJson(manifest)),
    files: Object.freeze(Object.fromEntries(
      Object.keys(files)
        .sort()
        .map((path) => [path, sha256Text(files[path]!)]),
    )),
  });
}

function validateHashes(
  input: unknown,
  manifest: ScriptPackageManifest,
  files: Readonly<Record<string, string>>,
): ScriptPackageHashes {
  if (!isRecord(input)) fail("PACKAGE_HASHES_INVALID", "Package hashes must be an object.");
  if (input.algorithm !== SCRIPT_PACKAGE_HASH_ALGORITHM) {
    fail("PACKAGE_HASHES_INVALID", "Only sha256 package hashes are supported.");
  }
  const expected = createHashes(manifest, files);
  if (input.manifest !== expected.manifest) {
    fail("PACKAGE_HASH_MISMATCH", "Package manifest SHA-256 does not match.");
  }
  if (!isRecord(input.files)) {
    fail("PACKAGE_HASHES_INVALID", "Package file hashes must be an object.");
  }

  const expectedPaths = Object.keys(expected.files).sort();
  const actualPaths = Object.keys(input.files).sort();
  if (
    expectedPaths.length !== actualPaths.length ||
    expectedPaths.some((path, index) => path !== actualPaths[index])
  ) {
    fail("PACKAGE_HASHES_INVALID", "Package file hash set must match the packaged files exactly.");
  }
  for (const path of expectedPaths) {
    if (input.files[path] !== expected.files[path]) {
      fail("PACKAGE_HASH_MISMATCH", `Package file SHA-256 does not match: ${path}.`);
    }
  }
  return expected;
}

export function createScriptPackage(input: {
  readonly manifest: ScriptPackageManifest;
  readonly files: Readonly<Record<string, string>>;
}): ScriptPackageDocument {
  const manifest = validateManifest(input.manifest);
  const files = validateFiles(input.files);
  validateReferencedFiles(manifest, files);
  return Object.freeze({
    format: SCRIPT_PACKAGE_FORMAT,
    schemaVersion: SCRIPT_PACKAGE_SCHEMA_VERSION,
    manifest,
    files,
    hashes: createHashes(manifest, files),
  });
}

export function validateScriptPackage(input: unknown): ScriptPackageInspection {
  if (!isRecord(input)) fail("PACKAGE_INVALID", "Script package must be an object.");
  if (input.format !== SCRIPT_PACKAGE_FORMAT) {
    fail("PACKAGE_FORMAT_UNSUPPORTED", `Package format must be ${SCRIPT_PACKAGE_FORMAT}.`);
  }
  if (input.schemaVersion !== SCRIPT_PACKAGE_SCHEMA_VERSION) {
    fail("PACKAGE_SCHEMA_UNSUPPORTED", `Package schemaVersion must be ${SCRIPT_PACKAGE_SCHEMA_VERSION}.`);
  }

  const manifest = validateManifest(input.manifest);
  const files = validateFiles(input.files);
  validateReferencedFiles(manifest, files);
  const hashes = validateHashes(input.hashes, manifest, files);
  const packageKind: ScriptPackageKind = manifest.kind === "dashboard" ? "dashboard" : "script";
  const entryScript = packageKind === "script"
    ? manifest.scripts!.find((script) => script.entry)
    : undefined;
  const totalBytes = Object.values(files)
    .reduce((total, value) => total + Buffer.byteLength(value, "utf8"), 0);

  return Object.freeze({
    valid: true,
    format: SCRIPT_PACKAGE_FORMAT,
    schemaVersion: SCRIPT_PACKAGE_SCHEMA_VERSION,
    packageId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author.name,
    compatibility: manifest.compatibility,
    permissions: manifest.permissions,
    packageKind,
    scriptCount: manifest.scripts?.length ?? 0,
    ...(entryScript ? { entryScript: entryScript.path } : {}),
    ...(manifest.configSchema ? { configSchemaPath: manifest.configSchema.path } : {}),
    ...(manifest.dashboard ? { dashboardPath: manifest.dashboard.path } : {}),
    readmePath: manifest.readme.path,
    fileCount: Object.keys(files).length,
    totalBytes,
    hashAlgorithm: hashes.algorithm,
    manifestHash: hashes.manifest,
    permissionEnforcement: false,
    importAttempted: false,
    executionAttempted: false,
  });
}

export function scriptPackageFormatDescriptor() {
  return Object.freeze({
    status: "ready",
    format: SCRIPT_PACKAGE_FORMAT,
    fileExtension: SCRIPT_PACKAGE_FILE_EXTENSION,
    schemaVersion: SCRIPT_PACKAGE_SCHEMA_VERSION,
    hashAlgorithm: SCRIPT_PACKAGE_HASH_ALGORITHM,
    requiredManifestFields: Object.freeze([
      "id",
      "name",
      "version",
      "author",
      "compatibility",
      "permissions",
      "scripts",
      "configSchema",
      "readme",
    ]),
    dashboardManifestFields: Object.freeze([
      "kind",
      "id",
      "name",
      "version",
      "author",
      "compatibility",
      "permissions",
      "dashboard",
      "readme",
    ]),
    packageSections: Object.freeze(["manifest", "files", "hashes"]),
    supportedPackageKinds: Object.freeze(["script", "dashboard"]),
    dashboardOnlyPackagesSupported: true,
    combinedScriptDashboardPackagesSupported: false,
    permissionDeclarationsOnly: true,
    permissionEnforcement: false,
    importSupported: false,
    executionSupported: false,
  });
}

export function runScriptPackageFormatSelfTest() {
  const sample = createScriptPackage({
    manifest: {
      id: "org.alremastered.slice121-fixture",
      name: "Slice 12.1 Verification Fixture",
      version: "1.0.0",
      author: {
        name: "ALRemastered Verification",
        url: "https://github.com/Riflex91/ALRemastered",
      },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.74" },
        adventureLand: { channel: "live" },
      },
      permissions: ["movement", "combat"],
      scripts: [
        { path: "scripts/main.js", entry: true },
        { path: "scripts/helpers.js", entry: false },
      ],
      configSchema: { path: "config.schema.json" },
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": "log('Slice 12.1 package fixture loaded as text only.');\n",
      "scripts/helpers.js": "function helper() { return true; }\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: {
          monster: { type: "string" },
        },
        additionalProperties: false,
      }),
      "README.md": "# Slice 12.1 Verification Fixture\n\nThis package is never executed by the format test.\n",
    },
  });

  const inspection = validateScriptPackage(sample);
  const tampered = structuredClone(sample);
  tampered.files["scripts/main.js"] += "// tampered\n";
  let tamperRejected = false;
  let tamperErrorCode: string | null = null;
  try {
    validateScriptPackage(tampered);
  } catch (error) {
    if (error instanceof ScriptPackageFormatError) {
      tamperRejected = error.code === "PACKAGE_HASH_MISMATCH";
      tamperErrorCode = error.code;
    }
  }

  return Object.freeze({
    status: inspection.valid && tamperRejected ? "ready" : "failed",
    descriptor: scriptPackageFormatDescriptor(),
    inspection,
    checks: Object.freeze({
      manifest: true,
      scripts: inspection.scriptCount === 2,
      configSchema: inspection.configSchemaPath === "config.schema.json",
      readme: inspection.readmePath === "README.md",
      version: inspection.version === "1.0.0",
      author: inspection.author === "ALRemastered Verification",
      compatibility: inspection.compatibility.alremastered.minVersion === "0.1.0-alpha.74",
      permissionsDeclared: inspection.permissions.length === 2,
      sha256: inspection.hashAlgorithm === "sha256",
      tamperRejected,
      tamperErrorCode,
      permissionEnforcement: false,
      importAttempted: false,
      executionAttempted: false,
    }),
  });
}
