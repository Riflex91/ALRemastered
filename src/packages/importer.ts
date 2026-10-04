import { lookup } from "node:dns/promises";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
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
const MAX_REMOTE_REDIRECTS = 3;
const REMOTE_FETCH_TIMEOUT_MS = 10_000;

type RemoteFetch = typeof fetch;
type HostLookup = (
  hostname: string,
  options: { readonly all: true; readonly verbatim: true },
) => Promise<readonly { readonly address: string; readonly family: number }[]>;

export interface ScriptPackageRemoteSource {
  readonly kind: "link" | "github";
  readonly inputUrl: string;
  readonly resolvedUrl: string;
  readonly repository?: string;
  readonly ref?: string;
  readonly path?: string;
}

export interface ScriptPackageRemoteImportPreview extends ScriptPackageImportPreview {
  readonly remoteSource: ScriptPackageRemoteSource;
}

export interface ScriptPackageRemoteImportReceipt extends ScriptPackageImportReceipt {
  readonly remoteSource: ScriptPackageRemoteSource;
}


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
  readonly #fetcher: RemoteFetch;
  readonly #lookupHost: HostLookup;

  constructor(
    rootDir: string,
    logger?: Logger,
    now: () => Date = () => new Date(),
    remote?: {
      readonly fetcher?: RemoteFetch;
      readonly lookupHost?: HostLookup;
    },
  ) {
    this.#rootDir = rootDir;
    this.#logger = logger;
    this.#now = now;
    this.#fetcher = remote?.fetcher ?? fetch;
    this.#lookupHost = remote?.lookupHost ??
      ((hostname, options) => lookup(hostname, options));
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
      linkImportSupported: true,
      githubImportSupported: true,
      remotePreviewRefetchOnConfirm: true,
      remoteHttpsOnly: true,
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

  async previewRemote(source: string): Promise<ScriptPackageRemoteImportPreview> {
    const loaded = await this.#loadRemotePackage(source);
    const preview = this.preview(loaded.document);
    return Object.freeze({
      ...preview,
      remoteSource: loaded.remoteSource,
    });
  }

  async importRemote(input: {
    readonly source: string;
    readonly previewToken: string;
    readonly approvedDangerous?: readonly string[];
  }): Promise<ScriptPackageRemoteImportReceipt> {
    const loaded = await this.#loadRemotePackage(input.source);
    const receipt = this.importPackage({
      packageDocument: loaded.document,
      previewToken: input.previewToken,
      approvedDangerous: input.approvedDangerous,
    });
    this.#logger?.info("Remote script package imported inactive.", {
      sourceKind: loaded.remoteSource.kind,
      sourceHost: new URL(loaded.remoteSource.resolvedUrl).hostname,
      packageId: receipt.packageId,
      version: receipt.version,
      inactive: true,
      executionAttempted: false,
      gameplayMutation: false,
    });
    return Object.freeze({
      ...receipt,
      remoteSource: loaded.remoteSource,
    });
  }

  async runRemoteSelfTest() {
    const verificationRoot = join(this.#rootDir, ".slice-12-4-verification");
    rmSync(verificationRoot, { recursive: true, force: true });

    const packageDocument = createScriptPackage({
      manifest: {
        id: "org.alremastered.slice124-fixture",
        name: "Slice 12.4 Remote Import Fixture",
        version: "1.0.0",
        author: { name: "ALRemastered Verification" },
        compatibility: {
          alremastered: { minVersion: "0.1.0-alpha.77" },
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
        "scripts/main.js": "log('Slice 12.4 remote fixture remains inactive.');\n",
        "scripts/helper.js": "export const remoteFixture = true;\n",
        "config.schema.json": JSON.stringify({
          type: "object",
          properties: { monster: { type: "string", default: "goo" } },
          additionalProperties: false,
        }),
        "README.md": "# Slice 12.4 Remote Import Fixture\n\nRemote preview description for link and GitHub import verification.\n",
      },
    });

    const linkUrl = "https://packages.example.com/slice-12-4-fixture.alrpkg";
    const githubUrl =
      "https://github.com/Riflex91/ALRemastered/blob/main/verification/slice-12-4-fixture.alrpkg";
    let servedDocument: unknown = packageDocument;
    let requestCount = 0;
    const fakeFetch: RemoteFetch = async (input) => {
      requestCount += 1;
      const url = String(input);
      if (
        url !== linkUrl &&
        url !==
          "https://raw.githubusercontent.com/Riflex91/ALRemastered/main/verification/slice-12-4-fixture.alrpkg"
      ) {
        return new Response("not found", { status: 404 });
      }
      return new Response(JSON.stringify(servedDocument), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const publicLookup: HostLookup = async () =>
      Object.freeze([{ address: "93.184.216.34", family: 4 }]);

    const verifier = new ScriptPackageImporter(
      verificationRoot,
      undefined,
      () => new Date("2026-10-04T00:00:00.000Z"),
      { fetcher: fakeFetch, lookupHost: publicLookup },
    );

    const linkPreview = await verifier.previewRemote(linkUrl);
    const githubPreview = await verifier.previewRemote(githubUrl);

    let unapprovedRejected = false;
    let unapprovedErrorCode: string | null = null;
    try {
      await verifier.importRemote({
        source: linkUrl,
        previewToken: linkPreview.previewToken,
      });
    } catch (error) {
      if (error instanceof ScriptPackageImportError) {
        unapprovedRejected =
          error.code === "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED";
        unapprovedErrorCode = error.code;
      }
    }

    const receipt = await verifier.importRemote({
      source: linkUrl,
      previewToken: linkPreview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });

    const packagePath = join(
      verificationRoot,
      sha256Text(linkPreview.packageId),
      receipt.importedFileName,
    );
    const receiptPath = join(
      verificationRoot,
      sha256Text(linkPreview.packageId),
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

    const changedDocument = createScriptPackage({
      manifest: {
        ...packageDocument.manifest,
        scripts: packageDocument.manifest.scripts.map((script) => ({ ...script })),
        permissions: [...packageDocument.manifest.permissions],
        author: { ...packageDocument.manifest.author },
        compatibility: structuredClone(packageDocument.manifest.compatibility),
        configSchema: { ...packageDocument.manifest.configSchema },
        readme: { ...packageDocument.manifest.readme },
      },
      files: {
        ...packageDocument.files,
        "scripts/main.js": "log('Changed after remote preview and must not import.');\n",
      },
    });
    let staleRejected = false;
    let staleErrorCode: string | null = null;
    servedDocument = changedDocument;
    try {
      await verifier.importRemote({
        source: linkUrl,
        previewToken: linkPreview.previewToken,
        approvedDangerous: ["inventory.destroy"],
      });
    } catch (error) {
      if (error instanceof ScriptPackageImportError) {
        staleRejected = error.code === "PACKAGE_IMPORT_PREVIEW_STALE";
        staleErrorCode = error.code;
      }
    }
    servedDocument = packageDocument;

    let insecureSourceRejected = false;
    let insecureSourceErrorCode: string | null = null;
    try {
      await verifier.previewRemote("http://packages.example.com/fixture.alrpkg");
    } catch (error) {
      if (error instanceof ScriptPackageImportError) {
        insecureSourceRejected = error.code === "PACKAGE_IMPORT_REMOTE_SOURCE_UNSAFE";
        insecureSourceErrorCode = error.code;
      }
    }

    let privateSourceRejected = false;
    let privateSourceErrorCode: string | null = null;
    try {
      await verifier.previewRemote("https://127.0.0.1/fixture.alrpkg");
    } catch (error) {
      if (error instanceof ScriptPackageImportError) {
        privateSourceRejected = error.code === "PACKAGE_IMPORT_REMOTE_SOURCE_UNSAFE";
        privateSourceErrorCode = error.code;
      }
    }

    const checks = Object.freeze({
      linkPreviewReady:
        linkPreview.status === "ready" &&
        linkPreview.remoteSource.kind === "link" &&
        linkPreview.remoteSource.resolvedUrl === linkUrl,
      githubPreviewReady:
        githubPreview.status === "ready" &&
        githubPreview.remoteSource.kind === "github" &&
        githubPreview.remoteSource.repository === "Riflex91/ALRemastered" &&
        githubPreview.remoteSource.ref === "main" &&
        githubPreview.remoteSource.path === "verification/slice-12-4-fixture.alrpkg" &&
        githubPreview.remoteSource.resolvedUrl.startsWith(
          "https://raw.githubusercontent.com/Riflex91/ALRemastered/main/",
        ),
      descriptionVisible: linkPreview.description.includes("Remote preview description"),
      permissionsVisible:
        linkPreview.permissions.includes("movement") &&
        linkPreview.permissions.includes("inventory.destroy"),
      configurationVisible: linkPreview.configSchema.type === "object",
      codeVisible: linkPreview.code.length === 2,
      dangerousConfirmationRequired: linkPreview.requiresDangerousConfirmation,
      unapprovedRejected,
      unapprovedErrorCode,
      importPersisted: persistedValid,
      approvedPermissionPersisted:
        persistedReceipt?.approvedDangerous?.includes("inventory.destroy") === true,
      importedInactive:
        receipt.inactive === true && persistedReceipt?.inactive === true,
      executionAttempted: false,
      sourceRefetchedOnConfirm: requestCount >= 5,
      staleRejected,
      staleErrorCode,
      insecureSourceRejected,
      insecureSourceErrorCode,
      privateSourceRejected,
      privateSourceErrorCode,
      cleanup: false,
    });

    rmSync(verificationRoot, { recursive: true, force: true });
    const cleanup = !existsSync(verificationRoot);
    const finalChecks = Object.freeze({ ...checks, cleanup });
    const ready = Object.entries(finalChecks)
      .filter(([key]) => !key.endsWith("ErrorCode"))
      .every(([, value]) => value === true);

    return Object.freeze({
      status: ready ? "ready" : "failed",
      descriptor: this.descriptor(),
      linkPreview,
      githubPreview,
      receipt,
      checks: finalChecks,
    });
  }

  async #loadRemotePackage(source: string): Promise<{
    readonly document: unknown;
    readonly remoteSource: ScriptPackageRemoteSource;
  }> {
    const normalized = normalizeRemoteSource(source);
    let currentUrl = new URL(normalized.fetchUrl);
    let redirectCount = 0;

    while (true) {
      await this.#assertSafeRemoteUrl(currentUrl);
      const response = await this.#fetcher(currentUrl.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "application/json, application/octet-stream;q=0.9",
          "User-Agent": "ALRemastered package importer",
        },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount >= MAX_REMOTE_REDIRECTS) {
          throw new ScriptPackageImportError(
            "PACKAGE_IMPORT_REMOTE_REDIRECT_INVALID",
            "Remote package redirect was missing, invalid, or exceeded the redirect limit.",
          );
        }
        currentUrl = new URL(location, currentUrl);
        redirectCount += 1;
        continue;
      }

      if (!response.ok) {
        throw new ScriptPackageImportError(
          "PACKAGE_IMPORT_REMOTE_FETCH_FAILED",
          `Remote package request failed with HTTP ${response.status}.`,
        );
      }

      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > MAX_PACKAGE_DOCUMENT_BYTES) {
        throw new ScriptPackageImportError(
          "PACKAGE_IMPORT_TOO_LARGE",
          "Remote package exceeds the 3 MiB import limit.",
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_PACKAGE_DOCUMENT_BYTES) {
        throw new ScriptPackageImportError(
          "PACKAGE_IMPORT_TOO_LARGE",
          "Remote package exceeds the 3 MiB import limit.",
        );
      }

      let document: unknown;
      try {
        document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        throw new ScriptPackageImportError(
          "PACKAGE_IMPORT_REMOTE_DOCUMENT_INVALID",
          "Remote package must contain valid UTF-8 JSON.",
        );
      }

      return Object.freeze({
        document,
        remoteSource: Object.freeze({
          kind: normalized.kind,
          inputUrl: normalized.inputUrl,
          resolvedUrl: currentUrl.href,
          ...(normalized.repository ? { repository: normalized.repository } : {}),
          ...(normalized.ref ? { ref: normalized.ref } : {}),
          ...(normalized.path ? { path: normalized.path } : {}),
        }),
      });
    }
  }

  async #assertSafeRemoteUrl(url: URL): Promise<void> {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !url.pathname.toLowerCase().endsWith(".alrpkg")
    ) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_REMOTE_SOURCE_UNSAFE",
        "Remote package sources must be HTTPS .alrpkg URLs without credentials or custom ports.",
      );
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_REMOTE_SOURCE_UNSAFE",
        "Local and private package source addresses are not allowed.",
      );
    }

    const literalFamily = isIP(hostname);
    if (literalFamily !== 0) {
      if (!isPublicAddress(hostname)) {
        throw new ScriptPackageImportError(
          "PACKAGE_IMPORT_REMOTE_SOURCE_UNSAFE",
          "Local and private package source addresses are not allowed.",
        );
      }
      return;
    }

    let addresses: readonly { readonly address: string; readonly family: number }[];
    try {
      addresses = await this.#lookupHost(hostname, { all: true, verbatim: true });
    } catch {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_REMOTE_HOST_UNRESOLVED",
        "Remote package host could not be resolved.",
      );
    }
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_REMOTE_SOURCE_UNSAFE",
        "Remote package host resolved to a local or private address.",
      );
    }
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

function normalizeRemoteSource(source: string): {
  readonly kind: "link" | "github";
  readonly inputUrl: string;
  readonly fetchUrl: string;
  readonly repository?: string;
  readonly ref?: string;
  readonly path?: string;
} {
  let url: URL;
  try {
    url = new URL(source.trim());
  } catch {
    throw new ScriptPackageImportError(
      "PACKAGE_IMPORT_REMOTE_SOURCE_INVALID",
      "Enter a valid HTTPS package URL or supported GitHub source.",
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "github.com") {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 5 || parts[2] !== "blob") {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_GITHUB_SOURCE_UNSUPPORTED",
        "Supported GitHub sources use https://github.com/<owner>/<repo>/blob/<ref>/<path>.alrpkg.",
      );
    }
    const [owner, repository, , ref, ...pathParts] = parts;
    const path = pathParts.join("/");
    if (!owner || !repository || !ref || !path.toLowerCase().endsWith(".alrpkg")) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_GITHUB_SOURCE_UNSUPPORTED",
        "GitHub package source must identify a .alrpkg file.",
      );
    }
    const encodedPath = pathParts.map(encodeURIComponent).join("/");
    return Object.freeze({
      kind: "github",
      inputUrl: url.href,
      fetchUrl:
        `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(ref)}/${encodedPath}`,
      repository: `${owner}/${repository}`,
      ref,
      path,
    });
  }

  if (hostname === "raw.githubusercontent.com") {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 4) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_GITHUB_SOURCE_UNSUPPORTED",
        "Raw GitHub package source must identify owner, repository, ref, and .alrpkg path.",
      );
    }
    const [owner, repository, ref, ...pathParts] = parts;
    const path = pathParts.join("/");
    if (!path.toLowerCase().endsWith(".alrpkg")) {
      throw new ScriptPackageImportError(
        "PACKAGE_IMPORT_GITHUB_SOURCE_UNSUPPORTED",
        "GitHub package source must identify a .alrpkg file.",
      );
    }
    return Object.freeze({
      kind: "github",
      inputUrl: url.href,
      fetchUrl: url.href,
      repository: `${owner}/${repository}`,
      ref,
      path,
    });
  }

  return Object.freeze({
    kind: "link",
    inputUrl: url.href,
    fetchUrl: url.href,
  });
}

function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isPublicAddress(normalized.slice(7));
  }

  const family = isIP(normalized);
  if (family === 4) {
    const octets = normalized.split(".").map(Number);
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return false;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }

  if (family === 6) {
    if (normalized === "::" || normalized === "::1") return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    return true;
  }

  return false;
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
