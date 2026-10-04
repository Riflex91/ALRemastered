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
  canonicalPackageJson,
  createScriptPackage,
  sha256Text,
  type ScriptPackageDocument,
  validateScriptPackage,
} from "./format.ts";
import {
  authorizeScriptPackagePermission,
  createScriptPackagePermissionGrant,
  isDangerousScriptPackagePermission,
  type ScriptPackagePermission,
} from "./permissions.ts";

const MAX_DESCRIPTION_LENGTH = 600;
const MAX_PACKAGE_DOCUMENT_BYTES = 3 * 1024 * 1024;

export interface ScriptPackageImportCodeFile {
  readonly path: string;
  readonly entry: boolean;
  readonly source: string;
}

export interface ScriptPackageImportPreview {
  readonly status: "ready";
  readonly previewToken: string;
  readonly packageId: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly readme: string;
  readonly compatibility: unknown;
  readonly permissions: readonly ScriptPackagePermission[];
  readonly safePermissions: readonly ScriptPackagePermission[];
  readonly dangerousPermissions: readonly ScriptPackagePermission[];
  readonly configSchema: Readonly<Record<string, unknown>>;
  readonly code: readonly ScriptPackageImportCodeFile[];
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly manifestHash: string;
  readonly requiresDangerousConfirmation: boolean;
  readonly importSupported: true;
  readonly executionSupported: false;
}

export interface ScriptPackageImportReceipt {
  readonly status: "imported";
  readonly packageId: string;
  readonly name: string;
  readonly version: string;
  readonly previewToken: string;
  readonly manifestHash: string;
  readonly approvedDangerous: readonly ScriptPackagePermission[];
  readonly importedAt: string;
  readonly importedFileName: string;
  readonly receiptFileName: string;
  readonly inactive: true;
  readonly executionAttempted: false;
  readonly gameplayMutation: false;
}

interface StoredImportReceipt {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly name: string;
  readonly version: string;
  readonly previewToken: string;
  readonly manifestHash: string;
  readonly approvedDangerous: readonly ScriptPackagePermission[];
  readonly importedAt: string;
  readonly inactive: true;
  readonly executionAttempted: false;
}

export class ScriptPackageImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScriptPackageImportError";
    this.code = code;
  }
}

export class ScriptPackageImporter {
  readonly #rootDir: string;
  readonly #logger?: Logger;
  readonly #now: () => Date;

  constructor(rootDir: string, logger?: Logger, now: () => Date = () => new Date()) {
    this.#rootDir = rootDir;
    this.#logger = logger;
    this.#now = now;
  }

  descriptor() {
    return Object.freeze({
      status: "ready",
      flow: Object.freeze(["preview", "confirm", "import"]),
      fileExtension: ".alrpkg",
      previewIncludes: Object.freeze([
        "description",
        "permissions",
        "configuration",
        "code",
      ]),
      dangerousPermissionsRequireConfirmation: true,
      importedPackagesInactive: true,
      executionSupported: false,
      linkImportSupported: false,
      githubImportSupported: false,
      libraryManagementSupported: false,
    });
  }

  preview(input: unknown): ScriptPackageImportPreview {
    const inspection = validateScriptPackage(input);
    const document = input as ScriptPackageDocument;
    const readme = document.files[document.manifest.readme.path]!;
    const configSchema = parseConfigSchema(
      document.files[document.manifest.configSchema.path]!,
    );
    const permissions = document.manifest.permissions as readonly ScriptPackagePermission[];
    const dangerousPermissions = permissions.filter(isDangerousScriptPackagePermission);
    const safePermissions = permissions.filter(
      (permission) => !isDangerousScriptPackagePermission(permission),
    );
    const code = document.manifest.scripts.map((script) => Object.freeze({
      path: script.path,
      entry: script.entry,
      source: document.files[script.path]!,
    }));
    const previewToken = sha256Text(canonicalPackageJson(document));

    return Object.freeze({
      status: "ready",
      previewToken,
      packageId: inspection.packageId,
      name: inspection.name,
      version: inspection.version,
      author: inspection.author,
      description: descriptionFromReadme(readme),
      readme,
      compatibility: structuredClone(inspection.compatibility),
      permissions: Object.freeze([...permissions]),
      safePermissions: Object.freeze([...safePermissions]),
      dangerousPermissions: Object.freeze([...dangerousPermissions]),
      configSchema,
      code: Object.freeze(code),
      fileCount: inspection.fileCount,
      totalBytes: inspection.totalBytes,
      manifestHash: inspection.manifestHash,
      requiresDangerousConfirmation: dangerousPermissions.length > 0,
      importSupported: true,
      executionSupported: false,
    });
  }

  importPackage(input: {
    readonly packageDocument: unknown;
    readonly previewToken: string;
    readonly approvedDangerous?: readonly string[];
  }): ScriptPackageImportReceipt {
    const preview = this.preview(input.packageDocument);
    if (input.previewToken !== preview.previewToken) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_PREVIEW_STALE",
        "Package changed after preview. Preview the file again before importing.",
      );
    }

    const grant = createScriptPackagePermissionGrant({
      declared: preview.permissions,
      approvedDangerous: input.approvedDangerous ?? [],
    });
    for (const permission of preview.permissions) {
      const decision = authorizeScriptPackagePermission(grant, permission);
      if (!decision.allowed) {
        throw new ScriptPackageImportError(
          "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED",
          decision.message,
        );
      }
    }

    const packageKey = sha256Text(preview.packageId);
    const packageDir = join(this.#rootDir, packageKey);
    const importedFileName = `${preview.version}.alrpkg`;
    const receiptFileName = `${preview.version}.import.json`;
    const packagePath = join(packageDir, importedFileName);
    const receiptPath = join(packageDir, receiptFileName);
    const packageContent = `${JSON.stringify(input.packageDocument, null, 2)}\n`;
    if (Buffer.byteLength(packageContent, "utf8") > MAX_PACKAGE_DOCUMENT_BYTES) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_TOO_LARGE",
        "Serialized package document exceeds the 3 MiB import limit.",
      );
    }

    if (existsSync(packagePath)) {
      const existing = readFileSync(packagePath, "utf8");
      if (sha256Text(existing.trim()) !== sha256Text(packageContent.trim())) {
        throw new ScriptPackageImportError(
          "PACKAGE_IMPORT_VERSION_CONFLICT",
          "A different package with the same ID and version is already imported.",
        );
      }
    }

    const approvedDangerous = Object.freeze([...grant.approvedDangerous]);
    const importedAt = this.#now().toISOString();
    const storedReceipt: StoredImportReceipt = Object.freeze({
      schemaVersion: 1,
      packageId: preview.packageId,
      name: preview.name,
      version: preview.version,
      previewToken: preview.previewToken,
      manifestHash: preview.manifestHash,
      approvedDangerous,
      importedAt,
      inactive: true,
      executionAttempted: false,
    });

    mkdirSync(packageDir, { recursive: true });
    atomicWrite(packagePath, packageContent);
    atomicWrite(receiptPath, `${JSON.stringify(storedReceipt, null, 2)}\n`);

    this.#logger?.info("Script package imported inactive.", {
      packageId: preview.packageId,
      version: preview.version,
      dangerousPermissionsApproved: approvedDangerous.length,
      inactive: true,
      executionAttempted: false,
      gameplayMutation: false,
    });

    return Object.freeze({
      status: "imported",
      packageId: preview.packageId,
      name: preview.name,
      version: preview.version,
      previewToken: preview.previewToken,
      manifestHash: preview.manifestHash,
      approvedDangerous,
      importedAt,
      importedFileName,
      receiptFileName,
      inactive: true,
      executionAttempted: false,
      gameplayMutation: false,
    });
  }

  runSelfTest() {
    const verificationRoot = join(this.#rootDir, ".slice-12-3-verification");
    rmSync(verificationRoot, { recursive: true, force: true });
    const verifier = new ScriptPackageImporter(
      verificationRoot,
      undefined,
      () => new Date("2026-10-04T00:00:00.000Z"),
    );

    const packageDocument = createScriptPackage({
      manifest: {
        id: "org.alremastered.slice123-fixture",
        name: "Slice 12.3 Import Fixture",
        version: "1.0.0",
        author: { name: "ALRemastered Verification" },
        compatibility: {
          alremastered: { minVersion: "0.1.0-alpha.76" },
          adventureLand: { channel: "live" },
        },
        permissions: ["movement", "inventory.destroy"],
        scripts: [
          { path: "scripts/main.js", entry: true },
          { path: "scripts/helper.js", entry: false },
        ],
        configSchema: { path: "config.schema.json" },
        readme: { path: "README.md" },
      },
      files: {
        "scripts/main.js": "log('Slice 12.3 fixture remains inactive.');\n",
        "scripts/helper.js": "export const fixture = true;\n",
        "config.schema.json": JSON.stringify({
          type: "object",
          properties: { monster: { type: "string", default: "goo" } },
          additionalProperties: false,
        }),
        "README.md": "# Slice 12.3 Import Fixture\n\nPreview description for file import verification.\n",
      },
    });

    const preview = verifier.preview(packageDocument);
    let unapprovedRejected = false;
    let unapprovedErrorCode: string | null = null;
    try {
      verifier.importPackage({
        packageDocument,
        previewToken: preview.previewToken,
      });
    } catch (error) {
      if (error instanceof ScriptPackageImportError) {
        unapprovedRejected =
          error.code === "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED";
        unapprovedErrorCode = error.code;
      }
    }

    const receipt = verifier.importPackage({
      packageDocument,
      previewToken: preview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });

    const packagePath = join(
      verificationRoot,
      sha256Text(preview.packageId),
      receipt.importedFileName,
    );
    const receiptPath = join(
      verificationRoot,
      sha256Text(preview.packageId),
      receipt.receiptFileName,
    );
    const persistedPackage = existsSync(packagePath)
      ? JSON.parse(readFileSync(packagePath, "utf8"))
      : undefined;
    const persistedValid = persistedPackage
      ? validateScriptPackage(persistedPackage).valid
      : false;
    const persistedReceipt = existsSync(receiptPath)
      ? JSON.parse(readFileSync(receiptPath, "utf8")) as Partial<StoredImportReceipt>
      : undefined;

    const checks = Object.freeze({
      previewReady: preview.status === "ready",
      descriptionVisible: preview.description.includes("Preview description"),
      permissionsVisible:
        preview.permissions.includes("movement") &&
        preview.permissions.includes("inventory.destroy"),
      configurationVisible: preview.configSchema.type === "object",
      codeVisible:
        preview.code.length === 2 &&
        preview.code.some((file) => file.entry && file.path === "scripts/main.js"),
      dangerousConfirmationRequired: preview.requiresDangerousConfirmation,
      unapprovedRejected,
      unapprovedErrorCode,
      importPersisted: persistedValid,
      approvedPermissionPersisted:
        persistedReceipt?.approvedDangerous?.includes("inventory.destroy") === true,
      importedInactive:
        receipt.inactive === true && persistedReceipt?.inactive === true,
      executionAttempted: false,
      cleanup: false,
    });

    rmSync(verificationRoot, { recursive: true, force: true });
    const cleanup = !existsSync(verificationRoot);
    const finalChecks = Object.freeze({ ...checks, cleanup });
    const ready =
      finalChecks.previewReady &&
      finalChecks.descriptionVisible &&
      finalChecks.permissionsVisible &&
      finalChecks.configurationVisible &&
      finalChecks.codeVisible &&
      finalChecks.dangerousConfirmationRequired &&
      finalChecks.unapprovedRejected &&
      finalChecks.importPersisted &&
      finalChecks.approvedPermissionPersisted &&
      finalChecks.importedInactive &&
      finalChecks.executionAttempted === false &&
      finalChecks.cleanup;

    return Object.freeze({
      status: ready ? "ready" : "failed",
      descriptor: this.descriptor(),
      preview,
      receipt,
      checks: finalChecks,
    });
  }
}

function parseConfigSchema(value: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ScriptPackageImportError(
      "PACKAGE_IMPORT_CONFIG_INVALID",
      "Package Config Schema must be a JSON object.",
    );
  }
  return Object.freeze(structuredClone(parsed as Record<string, unknown>));
}

function descriptionFromReadme(readme: string): string {
  const lines = readme.split(/\r?\n/).map((line) => line.trim());
  const paragraph: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(line.replace(/^[-*]\s+/, ""));
    if (paragraph.join(" ").length >= MAX_DESCRIPTION_LENGTH) break;
  }
  const value = paragraph.join(" ").trim() || "No package description provided.";
  return value.slice(0, MAX_DESCRIPTION_LENGTH);
}

function atomicWrite(path: string, content: string): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, "utf8");
  rmSync(path, { force: true });
  renameSync(temporary, path);
}
