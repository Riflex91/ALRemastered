import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  parsePortableDashboardProfile,
  portableDashboardRoleIds,
  resolvePortableDashboardProfile,
} from "../../dashboard/layout-transfer.js";
import type { Logger } from "../logging/logger.ts";
import { DashboardLayoutStore } from "../dashboard/layout-store.ts";
import {
  ScriptPackageFormatError,
  createScriptPackage,
  sha256Text,
  type ScriptPackageDocument,
  validateScriptPackage,
} from "./format.ts";
import {
  ScriptPackageImporter,
  type ScriptPackageImportDashboard,
} from "./importer.ts";

export class DashboardPackageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DashboardPackageError";
    this.code = code;
  }
}

export class DashboardPackageService {
  readonly #rootDir: string;
  readonly #importer: ScriptPackageImporter;
  readonly #layoutStore: DashboardLayoutStore;
  readonly #logger?: Logger;
  readonly #now: () => Date;

  constructor(options: {
    readonly rootDir: string;
    readonly importer: ScriptPackageImporter;
    readonly layoutStore: DashboardLayoutStore;
    readonly logger?: Logger;
    readonly now?: () => Date;
  }) {
    this.#rootDir = options.rootDir;
    this.#importer = options.importer;
    this.#layoutStore = options.layoutStore;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
  }

  descriptor() {
    return Object.freeze({
      status: "ready",
      packageKind: "dashboard",
      packageExtension: ".alrpkg",
      portableProfileKind: "ALRemasteredDashboardProfile",
      exportSupported: true,
      importedPreviewSupported: true,
      roleMappingRequired: true,
      packageExecutionSupported: false,
      combinedScriptDashboardPackagesSupported: false,
    });
  }

  createPackage(input: {
    readonly packageId: string;
    readonly name: string;
    readonly version: string;
    readonly author: string;
    readonly portableProfile: unknown;
  }) {
    const portable = parsePortableDashboardProfile(input.portableProfile);
    const roleIds = portableDashboardRoleIds(portable);
    const packageDocument = createScriptPackage({
      manifest: {
        kind: "dashboard",
        id: input.packageId,
        name: input.name,
        version: input.version,
        author: { name: input.author },
        compatibility: {
          alremastered: { minVersion: "0.1.0-alpha.80" },
          adventureLand: { channel: "live" },
        },
        permissions: [],
        dashboard: { path: "dashboard/profile.json" },
        readme: { path: "README.md" },
      },
      files: {
        "dashboard/profile.json": JSON.stringify(portable, null, 2),
        "README.md":
          `# ${input.name}\n\nDashboard-only ALRemastered package. Import it and map every Character role before applying the layout.\n`,
      },
    });

    return Object.freeze({
      status: "ready",
      packageKind: "dashboard",
      packageId: packageDocument.manifest.id,
      name: packageDocument.manifest.name,
      version: packageDocument.manifest.version,
      roleIds: Object.freeze([...roleIds]),
      packageDocument,
      executionAttempted: false,
    });
  }

  inspectImported(packageId: string, version: string) {
    const document = this.#readImportedDocument(packageId, version);
    const preview = this.#importer.preview(document);
    if (preview.packageKind !== "dashboard" || !preview.dashboard) {
      throw new DashboardPackageError(
        "DASHBOARD_PACKAGE_KIND_REQUIRED",
        "The selected imported package is not a Dashboard package.",
      );
    }
    return Object.freeze({
      status: "ready",
      packageId: preview.packageId,
      name: preview.name,
      version: preview.version,
      packageKind: preview.packageKind,
      dashboard: preview.dashboard,
      executionAttempted: false,
    });
  }

  applyImported(input: {
    readonly packageId: string;
    readonly version: string;
    readonly roleMapping?: Readonly<Record<string, string>>;
  }) {
    const inspected = this.inspectImported(input.packageId, input.version);
    const dashboard = inspected.dashboard as ScriptPackageImportDashboard;
    const resolved = resolvePortableDashboardProfile(
      dashboard.profile,
      input.roleMapping ?? {},
    );
    const profileId =
      `pkg-${sha256Text(
        `${input.packageId}@${input.version}@${this.#now().toISOString()}`,
      ).slice(0, 24)}`;
    let created = false;

    try {
      this.#layoutStore.createProfile(profileId, resolved.name);
      created = true;
      for (const variant of ["desktop", "small"] as const) {
        const layout = resolved.layouts[variant];
        if (!layout) continue;
        this.#layoutStore.saveLayout(profileId, variant, layout);
      }
    } catch (error) {
      if (created) {
        try {
          this.#layoutStore.deleteProfile(profileId);
        } catch {
          // Preserve the original apply failure; cleanup is best effort.
        }
      }
      throw error;
    }

    this.#logger?.info("Dashboard package applied with explicit Character role mapping.", {
      packageId: input.packageId,
      version: input.version,
      profileId,
      roleCount: dashboard.roleIds.length,
      executionAttempted: false,
      gameplayMutation: false,
    });

    return Object.freeze({
      status: "applied",
      packageId: input.packageId,
      version: input.version,
      profileId,
      profileName: resolved.name,
      roleIds: dashboard.roleIds,
      layoutVariants: Object.freeze(
        ["desktop", "small"].filter((variant) => Boolean(resolved.layouts[variant])),
      ),
      executionAttempted: false,
      gameplayMutation: false,
    });
  }

  runSelfTest() {
    const verificationRoot = join(this.#rootDir, ".slice-13-1-verification");
    rmSync(verificationRoot, { recursive: true, force: true });
    const packageRoot = join(verificationRoot, "packages");
    const layoutPath = join(verificationRoot, "dashboard-layouts.json");
    const now = () => new Date("2026-10-04T20:10:00.000Z");
    const importer = new ScriptPackageImporter(packageRoot, undefined, now);
    const layoutStore = new DashboardLayoutStore(layoutPath);
    const verifier = new DashboardPackageService({
      rootDir: packageRoot,
      importer,
      layoutStore,
      now,
    });

    const portable = {
      kind: "ALRemasteredDashboardProfile",
      schemaVersion: 1,
      profile: {
        name: "Slice 13.1 packaged layout",
        roles: [{ id: "tank", label: "Tank" }],
        layouts: {
          desktop: {
            schemaVersion: 1,
            order: ["character-card"],
            widgets: [{
              id: "character-card",
              duplicateOf: null,
              columns: 6,
              height: 192,
              removed: false,
              hiddenFields: [],
              displayMode: "standard",
              characterRole: "tank",
            }],
          },
        },
      },
    };

    const exported = verifier.createPackage({
      packageId: "org.alremastered.slice131-dashboard",
      name: "Slice 13.1 Dashboard Package",
      version: "1.0.0",
      author: "ALRemastered Verification",
      portableProfile: portable,
    });
    const inspection = validateScriptPackage(exported.packageDocument);
    const preview = importer.preview(exported.packageDocument);
    const receipt = importer.importPackage({
      packageDocument: exported.packageDocument,
      previewToken: preview.previewToken,
    });
    const imported = verifier.inspectImported(receipt.packageId, receipt.version);
    const applied = verifier.applyImported({
      packageId: receipt.packageId,
      version: receipt.version,
      roleMapping: { tank: "CURRENT_CHARACTER" },
    });
    const state = layoutStore.state();
    const appliedProfile = state.profiles.find((profile) => profile.id === applied.profileId);
    const appliedWidget = appliedProfile?.layouts.desktop?.widgets[0];

    let combinedRejected = false;
    let combinedErrorCode: string | null = null;
    try {
      createScriptPackage({
        manifest: {
          kind: "dashboard",
          id: "org.alremastered.slice131-combined",
          name: "Unsupported combined package",
          version: "1.0.0",
          author: { name: "ALRemastered Verification" },
          compatibility: {
            alremastered: { minVersion: "0.1.0-alpha.80" },
            adventureLand: { channel: "live" },
          },
          permissions: [],
          scripts: [{ path: "scripts/main.js", entry: true }],
          dashboard: { path: "dashboard/profile.json" },
          readme: { path: "README.md" },
        },
        files: {
          "scripts/main.js": "log('must not be accepted in Slice 13.1');\n",
          "dashboard/profile.json": JSON.stringify(portable),
          "README.md": "# Unsupported combined package\n",
        },
      });
    } catch (error) {
      if (error instanceof ScriptPackageFormatError) {
        combinedRejected = error.code === "PACKAGE_COMBINED_KIND_UNSUPPORTED";
        combinedErrorCode = error.code;
      }
    }

    const checks = Object.freeze({
      samePackageFormat:
        exported.packageDocument.format === "alremastered-script-package" &&
        exported.packageDocument.schemaVersion === 1,
      dashboardKind:
        inspection.packageKind === "dashboard" &&
        inspection.dashboardPath === "dashboard/profile.json",
      portableProfileValidated:
        imported.dashboard.roleIds.length === 1 &&
        imported.dashboard.roleIds[0] === "tank",
      noScriptPayload:
        inspection.scriptCount === 0 &&
        preview.code.length === 0 &&
        preview.permissions.length === 0,
      importedInactive:
        receipt.inactive === true &&
        receipt.executionAttempted === false,
      explicitRoleMapping:
        applied.roleIds.includes("tank") &&
        appliedWidget?.characterId === "CURRENT_CHARACTER",
      sourceCharacterIdsAbsent:
        JSON.stringify(exported.packageDocument).includes("CURRENT_CHARACTER") === false,
      layoutPersisted:
        state.activeProfileId === applied.profileId &&
        appliedProfile?.layouts.desktop?.widgets.length === 1,
      combinedPackDeferred: combinedRejected,
      combinedErrorCode,
      noExecution:
        exported.executionAttempted === false &&
        imported.executionAttempted === false &&
        applied.executionAttempted === false,
      noGameplayMutation: applied.gameplayMutation === false,
      cleanup: false,
    });

    rmSync(verificationRoot, { recursive: true, force: true });
    const cleanup = !existsSync(verificationRoot);
    const finalChecks = Object.freeze({ ...checks, cleanup });
    const ready = Object.entries(finalChecks)
      .filter(([key]) => key !== "combinedErrorCode")
      .every(([, value]) => value === true);

    return Object.freeze({
      status: ready ? "ready" : "failed",
      descriptor: verifier.descriptor(),
      inspection,
      preview: Object.freeze({
        packageKind: preview.packageKind,
        roleIds: preview.dashboard?.roleIds ?? [],
        codeFiles: preview.code.length,
        permissions: preview.permissions,
      }),
      applied,
      checks: finalChecks,
    });
  }

  #readImportedDocument(packageId: string, version: string): ScriptPackageDocument {
    if (!packageId.trim() || !version.trim()) {
      throw new DashboardPackageError(
        "DASHBOARD_PACKAGE_SELECTION_INVALID",
        "Package ID and version are required.",
      );
    }
    const packagePath = join(
      this.#rootDir,
      sha256Text(packageId),
      `${version}.alrpkg`,
    );
    if (!existsSync(packagePath)) {
      throw new DashboardPackageError(
        "DASHBOARD_PACKAGE_NOT_FOUND",
        "The selected imported Dashboard package was not found.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(packagePath, "utf8"));
    } catch {
      throw new DashboardPackageError(
        "DASHBOARD_PACKAGE_INVALID",
        "The imported Dashboard package could not be read.",
      );
    }
    const inspection = validateScriptPackage(parsed);
    if (
      inspection.packageId !== packageId ||
      inspection.version !== version ||
      inspection.packageKind !== "dashboard"
    ) {
      throw new DashboardPackageError(
        "DASHBOARD_PACKAGE_INVALID",
        "The stored package does not match the selected Dashboard package.",
      );
    }
    return parsed as ScriptPackageDocument;
  }
}
