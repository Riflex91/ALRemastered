import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  parsePortableDashboardProfile,
  portableDashboardRoleIds,
} from "../../dashboard/layout-transfer.js";
import { DashboardLayoutStore } from "../dashboard/layout-store.ts";
import type { Logger } from "../logging/logger.ts";
import { DashboardPackageService } from "./dashboard.ts";
import {
  createScriptPackage,
  type ScriptPackageDocument,
  validateScriptPackage,
} from "./format.ts";
import {
  ScriptPackageImportError,
  ScriptPackageImporter,
} from "./importer.ts";
import { ScriptPackageLibrary } from "./library.ts";
import type { ScriptPackagePermission } from "./permissions.ts";

export interface CombinedPackScriptInput {
  readonly path: string;
  readonly entry: boolean;
  readonly source: string;
}

export interface CombinedPackAssetInput {
  readonly path: string;
  readonly content: string;
  readonly mediaType?: string;
}

export class CombinedPackageService {
  readonly #rootDir: string;
  readonly #importer: ScriptPackageImporter;
  readonly #library: ScriptPackageLibrary;
  readonly #dashboardPackages: DashboardPackageService;
  readonly #logger?: Logger;

  constructor(options: {
    readonly rootDir: string;
    readonly importer: ScriptPackageImporter;
    readonly library: ScriptPackageLibrary;
    readonly dashboardPackages: DashboardPackageService;
    readonly logger?: Logger;
  }) {
    this.#rootDir = options.rootDir;
    this.#importer = options.importer;
    this.#library = options.library;
    this.#dashboardPackages = options.dashboardPackages;
    this.#logger = options.logger;
  }

  descriptor() {
    return Object.freeze({
      status: "ready",
      packageKind: "combined",
      packageExtension: ".alrpkg",
      multipleScriptsSupported: true,
      dashboardLayoutSupported: true,
      portableRolesSupported: true,
      configSchemaSupported: true,
      assetsSupported: true,
      permissionsSupported: true,
      explicitDangerousPermissionConfirmation: true,
      importedPackagesInactive: true,
      dashboardRoleMappingRequired: true,
      dashboardApplyActivatesScripts: false,
      packageExecutionSupported: false,
    });
  }

  createPackage(input: {
    readonly packageId: string;
    readonly name: string;
    readonly version: string;
    readonly author: string;
    readonly scripts: readonly CombinedPackScriptInput[];
    readonly configSchema: unknown;
    readonly portableProfile: unknown;
    readonly assets?: readonly CombinedPackAssetInput[];
    readonly permissions?: readonly string[];
    readonly readme?: string;
  }) {
    const portable = parsePortableDashboardProfile(input.portableProfile);
    const roleIds = portableDashboardRoleIds(portable);
    const files: Record<string, string> = {
      "config.schema.json": JSON.stringify(input.configSchema, null, 2),
      "dashboard/profile.json": JSON.stringify(portable, null, 2),
      "README.md": input.readme?.trim()
        ? `${input.readme.trim()}\n`
        : `# ${input.name}\n\nCombined ALRemastered community pack with Scripts, Dashboard layout, roles, Config Schema, assets, and declared Permissions.\n`,
    };

    for (const script of input.scripts) files[script.path] = script.source;
    for (const asset of input.assets ?? []) files[asset.path] = asset.content;

    const packageDocument = createScriptPackage({
      manifest: {
        kind: "combined",
        id: input.packageId,
        name: input.name,
        version: input.version,
        author: { name: input.author },
        compatibility: {
          alremastered: { minVersion: "0.1.0-alpha.81" },
          adventureLand: { channel: "live" },
        },
        permissions: input.permissions ?? [],
        scripts: input.scripts.map((script) => ({
          path: script.path,
          entry: script.entry,
        })),
        configSchema: { path: "config.schema.json" },
        dashboard: { path: "dashboard/profile.json" },
        assets: (input.assets ?? []).map((asset) => ({
          path: asset.path,
          ...(asset.mediaType ? { mediaType: asset.mediaType } : {}),
        })),
        readme: { path: "README.md" },
      },
      files,
    });

    const inspection = validateScriptPackage(packageDocument);
    return Object.freeze({
      status: "ready",
      packageKind: "combined" as const,
      packageId: packageDocument.manifest.id,
      name: packageDocument.manifest.name,
      version: packageDocument.manifest.version,
      scriptCount: inspection.scriptCount,
      assetCount: inspection.assetCount,
      permissions: inspection.permissions,
      roleIds: Object.freeze([...roleIds]),
      packageDocument,
      executionAttempted: false,
      gameplayMutation: false,
    });
  }

  inspectImported(packageId: string, version: string) {
    const snapshot = this.#library.snapshot();
    const pkg = snapshot.imported.find((entry) => entry.packageId === packageId);
    const selected = pkg?.versions.find((entry) => entry.version === version);
    if (!selected || selected.packageKind !== "combined") {
      throw new Error("The selected imported package is not a combined Script + Dashboard pack.");
    }
    const dashboard = this.#dashboardPackages.inspectImported(packageId, version);
    return Object.freeze({
      status: "ready",
      packageId,
      version,
      library: selected,
      dashboard: dashboard.dashboard,
      executionAttempted: false,
    });
  }

  runSelfTest() {
    const verificationRoot = join(this.#rootDir, ".slice-13-2-verification");
    rmSync(verificationRoot, { recursive: true, force: true });
    const packageRoot = join(verificationRoot, "packages");
    const now = () => new Date("2026-10-05T15:10:00.000Z");
    const importer = new ScriptPackageImporter(packageRoot, undefined, now);
    const library = new ScriptPackageLibrary({ rootDir: packageRoot, now });
    const layoutStore = new DashboardLayoutStore(join(verificationRoot, "layouts.json"));
    const dashboardPackages = new DashboardPackageService({
      rootDir: packageRoot,
      importer,
      layoutStore,
      now,
    });
    const verifier = new CombinedPackageService({
      rootDir: packageRoot,
      importer,
      library,
      dashboardPackages,
    });

    const created = verifier.createPackage({
      packageId: "org.alremastered.slice132-combined",
      name: "Slice 13.2 Combined Pack",
      version: "1.0.0",
      author: "ALRemastered Verification",
      scripts: [
        {
          path: "scripts/main.js",
          entry: true,
          source: "export function main() { return 'not executed'; }\n",
        },
        {
          path: "scripts/helpers.js",
          entry: false,
          source: "export const helper = 'shared';\n",
        },
      ],
      configSchema: {
        type: "object",
        properties: {
          monster: { type: "string", default: "goo" },
        },
        required: ["monster"],
        additionalProperties: false,
      },
      portableProfile: {
        kind: "ALRemasteredDashboardProfile",
        schemaVersion: 1,
        profile: {
          name: "Slice 13.2 combined layout",
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
      },
      assets: [{
        path: "assets/strategy.txt",
        mediaType: "text/plain",
        content: "Keep the tank in front.\n",
      }],
      permissions: ["movement", "inventory.destroy"],
      readme: "# Slice 13.2 Combined Pack\n\n## Changelog\n\n### 1.0.0\n\n- Combined fixture.\n",
    });

    const inspection = validateScriptPackage(created.packageDocument);
    const preview = importer.preview(created.packageDocument);
    let dangerousPermissionRejected = false;
    let dangerousPermissionErrorCode: string | null = null;
    try {
      importer.importPackage({
        packageDocument: created.packageDocument,
        previewToken: preview.previewToken,
      });
    } catch (error) {
      if (error instanceof ScriptPackageImportError) {
        dangerousPermissionRejected =
          error.code === "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED";
        dangerousPermissionErrorCode = error.code;
      }
    }

    const receipt = importer.importPackage({
      packageDocument: created.packageDocument,
      previewToken: preview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });
    const importedBeforeApply = library.snapshot();
    const versionBeforeApply = importedBeforeApply.imported[0]?.versions[0];

    const applied = dashboardPackages.applyImported({
      packageId: receipt.packageId,
      version: receipt.version,
      roleMapping: { tank: "CURRENT_CHARACTER" },
    });
    const importedAfterApply = library.snapshot();
    const versionAfterApply = importedAfterApply.imported[0]?.versions[0];

    library.setConfiguration({
      packageId: receipt.packageId,
      version: receipt.version,
      configuration: { monster: "crab" },
    });
    library.setActive({
      packageId: receipt.packageId,
      version: receipt.version,
      active: true,
    });
    const activated = library.snapshot();
    const activeVersion = activated.imported[0]?.versions[0];

    const layoutState = layoutStore.state();
    const appliedProfile = layoutState.profiles.find((profile) => profile.id === applied.profileId);
    const appliedWidget = appliedProfile?.layouts.desktop?.widgets[0];

    const checks = Object.freeze({
      combinedKind:
        inspection.packageKind === "combined" &&
        preview.packageKind === "combined",
      multipleScripts:
        inspection.scriptCount === 2 &&
        preview.code.length === 2 &&
        preview.code.filter((script) => script.entry).length === 1,
      dashboardAndRoles:
        preview.dashboard?.roleIds.length === 1 &&
        preview.dashboard.roleIds[0] === "tank",
      configSchema:
        preview.configSchema.type === "object" &&
        typeof preview.configSchema.properties === "object",
      assets:
        inspection.assetCount === 1 &&
        inspection.assetPaths[0] === "assets/strategy.txt" &&
        preview.assets.length === 1 &&
        preview.assets[0]?.mediaType === "text/plain" &&
        preview.assets[0]?.bytes > 0,
      permissions:
        preview.permissions.includes("movement") &&
        preview.permissions.includes("inventory.destroy"),
      dangerousPermissionConfirmation:
        dangerousPermissionRejected &&
        dangerousPermissionErrorCode === "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED",
      importedInactive:
        receipt.inactive === true &&
        versionBeforeApply?.active === false,
      dashboardApplyIndependent:
        applied.scriptActivationChanged === false &&
        versionAfterApply?.active === false,
      explicitRoleMapping:
        appliedWidget?.characterId === "CURRENT_CHARACTER",
      sourceCharacterIdsAbsent:
        JSON.stringify(created.packageDocument).includes("CURRENT_CHARACTER") === false,
      layoutPersisted:
        layoutState.activeProfileId === applied.profileId &&
        appliedProfile?.layouts.desktop?.widgets.length === 1,
      configurationPersisted:
        activeVersion?.configuration.monster === "crab",
      scriptActivationExplicit:
        activeVersion?.active === true,
      noExecution:
        created.executionAttempted === false &&
        receipt.executionAttempted === false &&
        applied.executionAttempted === false &&
        activeVersion?.executionAttempted === false,
      noGameplayMutation:
        created.gameplayMutation === false &&
        receipt.gameplayMutation === false &&
        applied.gameplayMutation === false,
      cleanup: false,
    });

    rmSync(verificationRoot, { recursive: true, force: true });
    const cleanup = !existsSync(verificationRoot);
    const finalChecks = Object.freeze({ ...checks, cleanup });
    const ready = Object.values(finalChecks).every((value) => value === true);

    this.#logger?.info("Slice 13.2 combined package self-test completed.", {
      status: ready ? "ready" : "failed",
      executionAttempted: false,
      gameplayMutation: false,
    });

    return Object.freeze({
      status: ready ? "ready" : "failed",
      descriptor: verifier.descriptor(),
      inspection,
      preview: Object.freeze({
        packageKind: preview.packageKind,
        scripts: preview.code.map((script) => ({ path: script.path, entry: script.entry })),
        roleIds: preview.dashboard?.roleIds ?? [],
        assetPaths: preview.assets.map((asset) => asset.path),
        permissions: preview.permissions,
      }),
      applied,
      activated: activeVersion,
      checks: finalChecks,
    });
  }
}
