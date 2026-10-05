import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Logger } from "../logging/logger.ts";
import {
  createScriptPackage,
  sha256Text,
  type ScriptPackageDocument,
} from "./format.ts";
import {
  ScriptPackageImporter,
  type ScriptPackageRemoteSource,
} from "./importer.ts";
import {
  ScriptPackageLibrary,
  ScriptPackageLibraryError,
  type ScriptLibraryPackage,
  type ScriptLibrarySnapshot,
  type ScriptLibraryVersion,
} from "./library.ts";
import {
  isDangerousScriptPackagePermission,
  isScriptPackagePermission,
  type ScriptPackagePermission,
} from "./permissions.ts";

const UPDATE_STATE_SCHEMA_VERSION = 1;

interface StoredUpdateState {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly currentVersion: string;
  readonly previousVersion: string;
  readonly updatedAt: string;
}

export interface ScriptPackageUpdatePreview {
  readonly status: "ready";
  readonly packageId: string;
  readonly name: string;
  readonly currentVersion: string;
  readonly availableVersion: string;
  readonly updateAvailable: boolean;
  readonly source: ScriptPackageRemoteSource;
  readonly previewToken: string;
  readonly changelog: string;
  readonly permissions: readonly ScriptPackagePermission[];
  readonly dangerousPermissions: readonly ScriptPackagePermission[];
  readonly newPermissions: readonly ScriptPackagePermission[];
  readonly newDangerousPermissions: readonly ScriptPackagePermission[];
  readonly requiresNewPermissionConfirmation: boolean;
  readonly executionSupported: false;
  readonly updateExecutesPackage: false;
}

export interface ScriptPackageUpdateResult {
  readonly status: "updated";
  readonly packageId: string;
  readonly previousVersion: string;
  readonly currentVersion: string;
  readonly activeVersion: string;
  readonly configurationMigrated: boolean;
  readonly approvedNewPermissions: readonly ScriptPackagePermission[];
  readonly executionAttempted: false;
  readonly gameplayMutation: false;
}

export interface ScriptPackageRollbackResult {
  readonly status: "rolled-back";
  readonly packageId: string;
  readonly restoredVersion: string;
  readonly replacedVersion: string;
  readonly activeVersion: string;
  readonly executionAttempted: false;
  readonly gameplayMutation: false;
}

export class ScriptPackageUpdateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScriptPackageUpdateError";
    this.code = code;
  }
}

export class ScriptPackageUpdateService {
  readonly #rootDir: string;
  readonly #importer: ScriptPackageImporter;
  readonly #library: ScriptPackageLibrary;
  readonly #logger?: Logger;
  readonly #now: () => Date;

  constructor(options: {
    readonly rootDir: string;
    readonly importer: ScriptPackageImporter;
    readonly library: ScriptPackageLibrary;
    readonly logger?: Logger;
    readonly now?: () => Date;
  }) {
    this.#rootDir = options.rootDir;
    this.#importer = options.importer;
    this.#library = options.library;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
  }

  descriptor() {
    return Object.freeze({
      status: "ready",
      availableVersionSupported: true,
      changelogSupported: true,
      updateSupported: true,
      rollbackSupported: true,
      dashboardPackageUpdatesSupported: false,
      combinedPackageUpdatesSupported: true,
      newPermissionsRequireConfirmation: true,
      dangerousPermissionsStillRequireConfirmation: true,
      sourceKinds: Object.freeze(["link", "github"]),
      localFileUpdateSourceSupported: false,
      changelogSource: "README Changelog section",
      activationExecutesPackage: false,
      updateExecutesPackage: false,
      rollbackExecutesPackage: false,
      executionSupported: false,
    });
  }

  async check(packageId: string): Promise<ScriptPackageUpdatePreview> {
    const current = this.#currentPackage(packageId);
    const base = current.version;
    if (base.packageKind === "dashboard") {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_KIND_UNSUPPORTED",
        "Dashboard-only package updates are not supported by the Script update path. Import the desired Dashboard package version explicitly.",
      );
    }
    const sourceVersion = current.package.versions.find((entry) => entry.remoteSource);
    const source = base.remoteSource ?? sourceVersion?.remoteSource;
    if (!source) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_SOURCE_UNAVAILABLE",
        "This package version has no persisted remote source. Import it from an HTTPS link or supported GitHub source before checking for updates.",
      );
    }

    const preview = await this.#importer.previewRemote(source.inputUrl);
    if (preview.packageId !== packageId) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_ID_MISMATCH",
        "The update source returned a different package ID.",
      );
    }

    const permissions = normalizePermissions(preview.permissions);
    const newPermissions = permissions.filter(
      (permission) => !base.permissions.includes(permission),
    );
    const dangerousPermissions = permissions.filter(isDangerousScriptPackagePermission);
    const newDangerousPermissions = newPermissions.filter(isDangerousScriptPackagePermission);

    return Object.freeze({
      status: "ready",
      packageId,
      name: preview.name,
      currentVersion: base.version,
      availableVersion: preview.version,
      updateAvailable: compareSemanticVersions(preview.version, base.version) > 0,
      source: Object.freeze(structuredClone(preview.remoteSource)),
      previewToken: preview.previewToken,
      changelog: extractChangelog(preview.readme),
      permissions: Object.freeze([...permissions]),
      dangerousPermissions: Object.freeze([...dangerousPermissions]),
      newPermissions: Object.freeze([...newPermissions]),
      newDangerousPermissions: Object.freeze([...newDangerousPermissions]),
      requiresNewPermissionConfirmation: newPermissions.length > 0,
      executionSupported: false,
      updateExecutesPackage: false,
    });
  }

  async applyUpdate(input: {
    readonly packageId: string;
    readonly previewToken: string;
    readonly approvedNewPermissions?: readonly string[];
  }): Promise<ScriptPackageUpdateResult> {
    const checked = await this.check(input.packageId);
    if (checked.previewToken !== input.previewToken) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_PREVIEW_STALE",
        "The package changed after the update preview. Check for updates again before installing.",
      );
    }
    if (!checked.updateAvailable) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_NOT_AVAILABLE",
        "The update source does not provide a newer package version.",
      );
    }

    const approvedNewPermissions = normalizeApprovalList(input.approvedNewPermissions ?? []);
    for (const permission of approvedNewPermissions) {
      if (!checked.newPermissions.includes(permission)) {
        throw new ScriptPackageUpdateError(
          "PACKAGE_UPDATE_PERMISSION_APPROVAL_INVALID",
          `Permission is not newly requested by this update: ${permission}.`,
        );
      }
    }
    const missing = checked.newPermissions.filter(
      (permission) => !approvedNewPermissions.includes(permission),
    );
    if (missing.length > 0) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_PERMISSION_CONFIRMATION_REQUIRED",
        `Every new permission must be explicitly confirmed before update: ${missing.join(", ")}.`,
      );
    }

    const before = this.#currentPackage(input.packageId);
    const carriedDangerous = checked.dangerousPermissions.filter(
      (permission) =>
        before.version.approvedDangerous.includes(permission) ||
        approvedNewPermissions.includes(permission),
    );

    const receipt = await this.#importer.importRemote({
      source: checked.source.inputUrl,
      previewToken: checked.previewToken,
      approvedDangerous: carriedDangerous,
    });

    if (receipt.packageId !== input.packageId || receipt.version !== checked.availableVersion) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_RESULT_MISMATCH",
        "Imported update metadata does not match the confirmed update preview.",
      );
    }

    let configurationMigrated = false;
    try {
      this.#library.setConfiguration({
        packageId: input.packageId,
        version: receipt.version,
        configuration: before.version.configuration,
      });
      configurationMigrated = true;
    } catch (error) {
      if (!(error instanceof ScriptPackageLibraryError)) throw error;
      this.#logger?.warn("Package update kept the new version's default configuration.", {
        packageId: input.packageId,
        previousVersion: before.version.version,
        currentVersion: receipt.version,
        reason: error.message,
      });
    }

    const snapshot = this.#library.setActive({
      packageId: input.packageId,
      version: receipt.version,
      active: true,
    });
    const activeVersion = requireActiveVersion(snapshot, input.packageId);

    this.#writeUpdateState({
      schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
      packageId: input.packageId,
      currentVersion: receipt.version,
      previousVersion: before.version.version,
      updatedAt: this.#now().toISOString(),
    });

    this.#logger?.info("Script package update installed as active library metadata.", {
      packageId: input.packageId,
      previousVersion: before.version.version,
      currentVersion: receipt.version,
      newPermissionsConfirmed: approvedNewPermissions.length,
      configurationMigrated,
      executionAttempted: false,
      gameplayMutation: false,
    });

    return Object.freeze({
      status: "updated",
      packageId: input.packageId,
      previousVersion: before.version.version,
      currentVersion: receipt.version,
      activeVersion,
      configurationMigrated,
      approvedNewPermissions: Object.freeze([...approvedNewPermissions]),
      executionAttempted: false,
      gameplayMutation: false,
    });
  }

  rollback(packageId: string): ScriptPackageRollbackResult {
    const state = this.#readUpdateState(packageId);
    const snapshot = this.#library.snapshot();
    const entry = snapshot.imported.find((candidate) => candidate.packageId === packageId);
    if (!entry) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_ROLLBACK_PACKAGE_NOT_FOUND",
        "The package is not present in the Script Library.",
      );
    }
    if (entry.activeVersion !== state.currentVersion) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_ROLLBACK_STATE_STALE",
        "The active package version changed after the last update. Rollback state must be refreshed by a new update.",
      );
    }
    if (!entry.versions.some((version) => version.version === state.previousVersion)) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_ROLLBACK_VERSION_NOT_FOUND",
        "The previous package version is no longer available locally.",
      );
    }

    const updated = this.#library.setActive({
      packageId,
      version: state.previousVersion,
      active: true,
    });
    const activeVersion = requireActiveVersion(updated, packageId);

    this.#writeUpdateState({
      schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
      packageId,
      currentVersion: state.previousVersion,
      previousVersion: state.currentVersion,
      updatedAt: this.#now().toISOString(),
    });

    this.#logger?.info("Script package previous version restored.", {
      packageId,
      restoredVersion: state.previousVersion,
      replacedVersion: state.currentVersion,
      executionAttempted: false,
      gameplayMutation: false,
    });

    return Object.freeze({
      status: "rolled-back",
      packageId,
      restoredVersion: state.previousVersion,
      replacedVersion: state.currentVersion,
      activeVersion,
      executionAttempted: false,
      gameplayMutation: false,
    });
  }

  async runSelfTest() {
    const verificationRoot = join(this.#rootDir, ".slice-12-6-verification");
    rmSync(verificationRoot, { recursive: true, force: true });

    const sourceUrl = "https://packages.example.com/slice-12-6-fixture.alrpkg";
    const packageV1 = updateFixture({
      version: "1.0.0",
      permissions: ["movement"],
      changelog: "- Initial version.",
    });
    const packageV2 = updateFixture({
      version: "1.1.0",
      permissions: ["movement", "inventory.read", "inventory.destroy"],
      changelog: "- Added inventory inspection.\n- Added explicitly confirmed destroy capability.",
    });
    let servedDocument: unknown = packageV1;
    let requestCount = 0;
    const fakeFetch: typeof fetch = async (input) => {
      requestCount += 1;
      if (String(input) !== sourceUrl) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(servedDocument), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const publicLookup = async () =>
      Object.freeze([{ address: "93.184.216.34", family: 4 }]);

    const importer = new ScriptPackageImporter(
      verificationRoot,
      undefined,
      () => new Date("2026-10-04T00:00:00.000Z"),
      { fetcher: fakeFetch, lookupHost: publicLookup },
    );
    const initialPreview = await importer.previewRemote(sourceUrl);
    await importer.importRemote({
      source: sourceUrl,
      previewToken: initialPreview.previewToken,
    });

    const library = new ScriptPackageLibrary({
      rootDir: verificationRoot,
      now: () => new Date("2026-10-04T00:00:00.000Z"),
    });
    library.setConfiguration({
      packageId: packageV1.manifest.id,
      version: packageV1.manifest.version,
      configuration: { monster: "crab", range: 175 },
    });
    library.setActive({
      packageId: packageV1.manifest.id,
      version: packageV1.manifest.version,
      active: true,
    });

    const verifier = new ScriptPackageUpdateService({
      rootDir: verificationRoot,
      importer,
      library,
      now: () => new Date("2026-10-04T00:00:00.000Z"),
    });

    servedDocument = packageV2;
    const preview = await verifier.check(packageV1.manifest.id);

    let unapprovedRejected = false;
    let unapprovedErrorCode: string | null = null;
    try {
      await verifier.applyUpdate({
        packageId: packageV1.manifest.id,
        previewToken: preview.previewToken,
        approvedNewPermissions: [],
      });
    } catch (error) {
      if (error instanceof ScriptPackageUpdateError) {
        unapprovedRejected =
          error.code === "PACKAGE_UPDATE_PERMISSION_CONFIRMATION_REQUIRED";
        unapprovedErrorCode = error.code;
      }
    }

    const update = await verifier.applyUpdate({
      packageId: packageV1.manifest.id,
      previewToken: preview.previewToken,
      approvedNewPermissions: ["inventory.read", "inventory.destroy"],
    });
    const afterUpdate = library.snapshot();
    const updatedPackage = afterUpdate.imported.find(
      (entry) => entry.packageId === packageV1.manifest.id,
    );
    const version2 = updatedPackage?.versions.find((entry) => entry.version === "1.1.0");

    const rollback = verifier.rollback(packageV1.manifest.id);
    const afterRollback = library.snapshot();

    const stalePreview = await verifier.check(packageV1.manifest.id);
    servedDocument = createScriptPackage({
      manifest: {
        ...packageV2.manifest,
        permissions: [...packageV2.manifest.permissions],
        scripts: packageV2.manifest.scripts.map((script) => ({ ...script })),
        author: { ...packageV2.manifest.author },
        compatibility: structuredClone(packageV2.manifest.compatibility),
        configSchema: { ...packageV2.manifest.configSchema },
        readme: { ...packageV2.manifest.readme },
      },
      files: {
        ...packageV2.files,
        "README.md":
          "# Slice 12.6 Update Fixture\n\n## Changelog\n\n- Source changed after preview.\n",
      },
    });
    let staleRejected = false;
    let staleErrorCode: string | null = null;
    try {
      await verifier.applyUpdate({
        packageId: packageV1.manifest.id,
        previewToken: stalePreview.previewToken,
        approvedNewPermissions: ["inventory.read", "inventory.destroy"],
      });
    } catch (error) {
      if (error instanceof ScriptPackageUpdateError) {
        staleRejected = error.code === "PACKAGE_UPDATE_PREVIEW_STALE";
        staleErrorCode = error.code;
      }
    }

    const checks = Object.freeze({
      remoteSourcePersisted:
        library.snapshot().imported[0]?.versions.some(
          (version) => version.remoteSource?.inputUrl === sourceUrl,
        ) === true,
      availableVersionVisible:
        preview.currentVersion === "1.0.0" &&
        preview.availableVersion === "1.1.0" &&
        preview.updateAvailable === true,
      changelogVisible:
        preview.changelog.includes("Added inventory inspection") &&
        preview.changelog.includes("destroy capability"),
      newPermissionsDetected:
        preview.newPermissions.includes("inventory.read") &&
        preview.newPermissions.includes("inventory.destroy") &&
        preview.newDangerousPermissions.includes("inventory.destroy"),
      allNewPermissionsRequireConfirmation:
        preview.requiresNewPermissionConfirmation &&
        unapprovedRejected &&
        unapprovedErrorCode === "PACKAGE_UPDATE_PERMISSION_CONFIRMATION_REQUIRED",
      updateInstalled:
        update.status === "updated" &&
        update.previousVersion === "1.0.0" &&
        update.currentVersion === "1.1.0" &&
        update.activeVersion === "1.1.0",
      dangerousApprovalPersisted:
        version2?.approvedDangerous.includes("inventory.destroy") === true,
      configurationMigrated:
        update.configurationMigrated &&
        version2?.configuration.monster === "crab" &&
        version2.configuration.range === 175,
      rollbackRestored:
        rollback.status === "rolled-back" &&
        rollback.restoredVersion === "1.0.0" &&
        afterRollback.imported[0]?.activeVersion === "1.0.0",
      staleUpdateRejected:
        staleRejected &&
        staleErrorCode === "PACKAGE_UPDATE_PREVIEW_STALE",
      noExecution:
        update.executionAttempted === false &&
        rollback.executionAttempted === false &&
        afterRollback.executionSupported === false,
      sourceRefetched: requestCount >= 7,
      cleanup: false,
    });

    rmSync(verificationRoot, { recursive: true, force: true });
    const cleanup = !existsSync(verificationRoot);
    const finalChecks = Object.freeze({ ...checks, cleanup });
    const ready = Object.values(finalChecks).every((value) => value === true);

    return Object.freeze({
      status: ready ? "ready" : "failed",
      descriptor: this.descriptor(),
      preview,
      update,
      rollback,
      checks: finalChecks,
    });
  }

  #currentPackage(packageId: string): {
    readonly package: ScriptLibraryPackage;
    readonly version: ScriptLibraryVersion;
  } {
    const snapshot = this.#library.snapshot();
    const entry = snapshot.imported.find((candidate) => candidate.packageId === packageId);
    if (!entry) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_PACKAGE_NOT_FOUND",
        "The package is not present in the Script Library.",
      );
    }
    const version = (
      entry.activeVersion
        ? entry.versions.find((candidate) => candidate.version === entry.activeVersion)
        : entry.versions[0]
    );
    if (!version) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_VERSION_NOT_FOUND",
        "The package has no imported version available for update comparison.",
      );
    }
    return { package: entry, version };
  }

  #updateStatePath(packageId: string): string {
    return join(this.#rootDir, sha256Text(packageId), "update-state.json");
  }

  #writeUpdateState(state: StoredUpdateState): void {
    const path = this.#updateStatePath(state.packageId);
    mkdirSync(join(this.#rootDir, sha256Text(state.packageId)), { recursive: true });
    atomicWrite(path, JSON.stringify(state, null, 2) + "\n");
  }

  #readUpdateState(packageId: string): StoredUpdateState {
    const path = this.#updateStatePath(packageId);
    if (!existsSync(path)) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_ROLLBACK_UNAVAILABLE",
        "No previous package version has been recorded by the update flow.",
      );
    }
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (
        !isRecord(parsed) ||
        parsed.schemaVersion !== UPDATE_STATE_SCHEMA_VERSION ||
        parsed.packageId !== packageId ||
        typeof parsed.currentVersion !== "string" ||
        typeof parsed.previousVersion !== "string" ||
        typeof parsed.updatedAt !== "string"
      ) {
        throw new Error("Stored update state is invalid.");
      }
      return Object.freeze({
        schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
        packageId,
        currentVersion: parsed.currentVersion,
        previousVersion: parsed.previousVersion,
        updatedAt: parsed.updatedAt,
      });
    } catch (error) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_ROLLBACK_STATE_INVALID",
        error instanceof Error ? error.message : "Stored update state is invalid.",
      );
    }
  }
}

function requireActiveVersion(snapshot: ScriptLibrarySnapshot, packageId: string): string {
  const activeVersion = snapshot.imported.find(
    (entry) => entry.packageId === packageId,
  )?.activeVersion;
  if (!activeVersion) {
    throw new ScriptPackageUpdateError(
      "PACKAGE_UPDATE_ACTIVATION_FAILED",
      "The updated package version was not persisted as active.",
    );
  }
  return activeVersion;
}

function normalizePermissions(values: readonly string[]): readonly ScriptPackagePermission[] {
  const permissions: ScriptPackagePermission[] = [];
  for (const value of values) {
    if (!isScriptPackagePermission(value)) {
      throw new ScriptPackageUpdateError(
        "PACKAGE_UPDATE_PERMISSION_UNKNOWN",
        `Update declares unsupported permission: ${value}.`,
      );
    }
    if (!permissions.includes(value)) permissions.push(value);
  }
  return Object.freeze(permissions);
}

function normalizeApprovalList(values: readonly string[]): readonly ScriptPackagePermission[] {
  return normalizePermissions(values);
}

function extractChangelog(readme: string): string {
  const lines = readme.split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => /^#{1,3}\s+changelog\s*$/iu.test(line.trim()));
  if (headingIndex < 0) return "No changelog section provided.";
  const headingMatch = lines[headingIndex]!.trim().match(/^(#+)/u);
  const level = headingMatch?.[1]?.length ?? 2;
  const output: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    const nextHeading = line.trim().match(/^(#+)\s+/u);
    if (nextHeading && nextHeading[1]!.length <= level) break;
    output.push(line);
  }
  return output.join("\n").trim() || "No changelog entries provided.";
}

function compareSemanticVersions(left: string, right: string): number {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = a.numbers[index]! - b.numbers[index]!;
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

function parseSemanticVersion(version: string): {
  readonly numbers: readonly [number, number, number];
  readonly prerelease: string;
} {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u);
  if (!match) {
    throw new ScriptPackageUpdateError(
      "PACKAGE_UPDATE_VERSION_INVALID",
      `Package version is not semantic: ${version}.`,
    );
  }
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? "",
  };
}

function updateFixture(input: {
  readonly version: string;
  readonly permissions: readonly ScriptPackagePermission[];
  readonly changelog: string;
}): ScriptPackageDocument {
  return createScriptPackage({
    manifest: {
      id: "org.alremastered.slice126-fixture",
      name: "Slice 12.6 Update Fixture",
      version: input.version,
      author: { name: "ALRemastered Verification" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.79" },
        adventureLand: { channel: "live" },
      },
      permissions: [...input.permissions],
      scripts: [{ path: "scripts/main.js", entry: true }],
      configSchema: { path: "config.schema.json" },
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": "log('Slice 12.6 fixture remains unexecuted.');\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: {
          monster: { type: "string", default: "goo" },
          range: { type: "number", default: 120 },
        },
        required: ["monster"],
        additionalProperties: false,
      }),
      "README.md":
        `# Slice 12.6 Update Fixture\n\n## Changelog\n\n### ${input.version}\n\n${input.changelog}\n\n## Usage\n\nVerification only.\n`,
    },
  });
}

function atomicWrite(path: string, content: string): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, "utf8");
  rmSync(path, { force: true });
  renameSync(temporary, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
