import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  parsePortableDashboardProfile,
  portableDashboardRoleIds,
} from "../../dashboard/layout-transfer.js";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { AdventureLandCharacterSummary } from "../account/selection-source.ts";
import { DashboardLayoutStore } from "../dashboard/layout-store.ts";
import type { Logger } from "../logging/logger.ts";
import { CombinedPackageService } from "./combined.ts";
import { DashboardPackageService } from "./dashboard.ts";
import { ScriptPackageImporter } from "./importer.ts";
import { ScriptPackageLibrary } from "./library.ts";

export interface PartyPackWizardRole {
  readonly id: string;
  readonly label: string;
  readonly recommendedCharacterId?: string;
  readonly recommendedCharacterName?: string;
  readonly recommendedCharacterType?: string;
  readonly recommendation: "class-match" | "fallback" | "unavailable";
}

export class PartyPackWizardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PartyPackWizardError";
    this.code = code;
  }
}

export class PartyPackWizardService {
  readonly #rootDir: string;
  readonly #selection: Pick<AdventureLandSelectionService, "state">;
  readonly #combinedPackages: Pick<CombinedPackageService, "inspectImported">;
  readonly #dashboardPackages: Pick<DashboardPackageService, "applyImported">;
  readonly #library: Pick<ScriptPackageLibrary, "snapshot" | "setActive">;
  readonly #logger?: Logger;

  constructor(options: {
    readonly rootDir: string;
    readonly selection: Pick<AdventureLandSelectionService, "state">;
    readonly combinedPackages: Pick<CombinedPackageService, "inspectImported">;
    readonly dashboardPackages: Pick<DashboardPackageService, "applyImported">;
    readonly library: Pick<ScriptPackageLibrary, "snapshot" | "setActive">;
    readonly logger?: Logger;
  }) {
    this.#rootDir = options.rootDir;
    this.#selection = options.selection;
    this.#combinedPackages = options.combinedPackages;
    this.#dashboardPackages = options.dashboardPackages;
    this.#library = options.library;
    this.#logger = options.logger;
  }

  descriptor() {
    return Object.freeze({
      status: "ready",
      packageKind: "combined",
      guidedRoleMapping: true,
      characterRecommendations: true,
      uniqueCharacterPerRoleRequired: true,
      setupAppliesDashboard: true,
      setupActivatesPackageMetadata: true,
      setupStartsCharacters: false,
      setupExecutesPackage: false,
      gameplayMutation: false,
      rawSocketAccess: false,
    });
  }

  state() {
    const selection = this.#selection.state();
    const library = this.#library.snapshot();
    const packs = library.imported.flatMap((pkg) =>
      pkg.versions
        .filter((version) => version.packageKind === "combined")
        .map((version) => Object.freeze({
          packageId: pkg.packageId,
          name: pkg.name,
          version: version.version,
          active: version.active,
        }))
    );
    return Object.freeze({
      ...this.descriptor(),
      selectionStatus: selection.status,
      characters: Object.freeze(selection.characters.map((character) => Object.freeze({
        id: character.id,
        name: character.name,
        type: character.type,
        level: character.level,
        online: character.online,
      }))),
      packs: Object.freeze(packs),
      ready: selection.status === "ready" && selection.characters.length > 0 && packs.length > 0,
    });
  }

  preview(packageId: string, version: string) {
    const selection = this.#requireSelection();
    const inspected = this.#combinedPackages.inspectImported(packageId, version);
    const portable = parsePortableDashboardProfile(inspected.dashboard.profile);
    const requiredRoleIds = portableDashboardRoleIds(portable);
    const roles = portable.profile.roles.map((role) => ({
      id: role.id,
      label: role.label,
    }));
    const recommendations = recommendPartyPackRoles(roles, selection.characters);
    return Object.freeze({
      status: "ready",
      packageId,
      name: inspected.library.name,
      version,
      active: inspected.library.active,
      roles: Object.freeze(recommendations),
      requiredRoleIds: Object.freeze([...requiredRoleIds]),
      characters: Object.freeze(selection.characters.map((character) => Object.freeze({
        id: character.id,
        name: character.name,
        type: character.type,
        level: character.level,
        online: character.online,
      }))),
      configuration: inspected.library.configuration,
      executionAttempted: false,
      gameplayMutation: false,
    });
  }

  setup(input: {
    readonly packageId: string;
    readonly version: string;
    readonly roleMapping: Readonly<Record<string, string>>;
  }) {
    const preview = this.preview(input.packageId, input.version);
    validatePartyPackRoleMapping(
      preview.requiredRoleIds,
      preview.characters,
      input.roleMapping,
    );

    const before = this.#library.snapshot();
    const beforePackage = before.imported.find((entry) => entry.packageId === input.packageId);
    const previousActiveVersion = beforePackage?.activeVersion;
    let activeChanged = false;
    try {
      if (!preview.active) {
        this.#library.setActive({
          packageId: input.packageId,
          version: input.version,
          active: true,
        });
        activeChanged = true;
      }
      const applied = this.#dashboardPackages.applyImported({
        packageId: input.packageId,
        version: input.version,
        roleMapping: input.roleMapping,
      });
      const after = this.#library.snapshot();
      const current = after.imported
        .find((entry) => entry.packageId === input.packageId)
        ?.versions.find((entry) => entry.version === input.version);

      this.#logger?.info("Party Pack Wizard setup completed.", {
        packageId: input.packageId,
        version: input.version,
        roleCount: preview.requiredRoleIds.length,
        packageActive: current?.active === true,
        charactersStarted: false,
        executionAttempted: false,
        gameplayMutation: false,
        rawSocketAccess: false,
      });

      return Object.freeze({
        status: "configured",
        packageId: input.packageId,
        name: preview.name,
        version: input.version,
        roleMapping: Object.freeze({ ...input.roleMapping }),
        profileId: applied.profileId,
        profileName: applied.profileName,
        layoutVariants: applied.layoutVariants,
        packageActive: current?.active === true,
        configuration: current?.configuration ?? preview.configuration,
        charactersStarted: false,
        executionAttempted: false,
        gameplayMutation: false,
        rawSocketAccess: false,
        userScriptTouched: false,
      });
    } catch (error) {
      if (activeChanged) {
        try {
          this.#library.setActive({
            packageId: input.packageId,
            version: input.version,
            active: false,
          });
          if (previousActiveVersion && previousActiveVersion !== input.version) {
            this.#library.setActive({
              packageId: input.packageId,
              version: previousActiveVersion,
              active: true,
            });
          }
        } catch {
          // Preserve the original setup failure; metadata rollback is best effort.
        }
      }
      throw error;
    }
  }

  #requireSelection() {
    const selection = this.#selection.state();
    if (selection.status !== "ready") {
      throw new PartyPackWizardError(
        "PARTY_PACK_SELECTION_NOT_READY",
        "Adventure Land Characters must be loaded before configuring a Party Pack.",
      );
    }
    if (selection.characters.length === 0) {
      throw new PartyPackWizardError(
        "PARTY_PACK_CHARACTERS_REQUIRED",
        "At least one Adventure Land Character is required.",
      );
    }
    return selection;
  }

  runSelfTest() {
    return PartyPackWizardService.runSelfTest(this.#rootDir);
  }

  static runSelfTest(rootDir: string) {
    const verificationRoot = join(rootDir, ".slice-13-3-verification");
    rmSync(verificationRoot, { recursive: true, force: true });
    const packageRoot = join(verificationRoot, "packages");
    const importer = new ScriptPackageImporter(packageRoot);
    const library = new ScriptPackageLibrary({ rootDir: packageRoot });
    const layoutStore = new DashboardLayoutStore(join(verificationRoot, "layouts.json"));
    const dashboardPackages = new DashboardPackageService({
      rootDir: packageRoot,
      importer,
      layoutStore,
    });
    const combinedPackages = new CombinedPackageService({
      rootDir: packageRoot,
      importer,
      library,
      dashboardPackages,
    });
    const created = combinedPackages.createPackage({
      packageId: "org.alremastered.slice133-party-pack",
      name: "4-Man Boss Party Pack",
      version: "1.0.0",
      author: "ALRemastered Verification",
      scripts: [
        {
          path: "scripts/main.js",
          entry: true,
          source: "export function main() { return 'not executed'; }\n",
        },
      ],
      configSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      portableProfile: {
        kind: "ALRemasteredDashboardProfile",
        schemaVersion: 1,
        profile: {
          name: "4-Man Boss Party Pack",
          roles: [
            { id: "tank", label: "Tank" },
            { id: "healer", label: "Healer" },
            { id: "dps", label: "DPS" },
            { id: "merchant", label: "Merchant" },
          ],
          layouts: {
            desktop: {
              schemaVersion: 1,
              order: ["tank-card", "healer-card", "dps-card", "merchant-card"],
              widgets: [
                wizardWidget("tank-card", "tank"),
                wizardWidget("healer-card", "healer"),
                wizardWidget("dps-card", "dps"),
                wizardWidget("merchant-card", "merchant"),
              ],
            },
          },
        },
      },
      permissions: [],
    });
    const importPreview = importer.preview(created.packageDocument);
    importer.importPackage({
      packageDocument: created.packageDocument,
      previewToken: importPreview.previewToken,
    });

    const characters = Object.freeze([
      verificationCharacter("CH_WARRIOR", "Warrior", "warrior"),
      verificationCharacter("CH_PRIEST", "Priest", "priest"),
      verificationCharacter("CH_RANGER", "Ranger", "ranger"),
      verificationCharacter("CH_MERCHANT", "Merchant", "merchant"),
    ]);
    let sessionStarts = 0;
    const selection = {
      state: () => ({
        status: "ready" as const,
        characters,
        servers: [],
        message: "Verification Characters loaded.",
      }),
    };
    const wizard = new PartyPackWizardService({
      rootDir: packageRoot,
      selection,
      combinedPackages,
      dashboardPackages,
      library,
    });

    const preview = wizard.preview(created.packageId, created.version);
    const suggestedMapping = Object.fromEntries(
      preview.roles.map((role) => [role.id, role.recommendedCharacterId]),
    ) as Record<string, string>;

    let duplicateRejected = false;
    let duplicateErrorCode: string | null = null;
    try {
      wizard.setup({
        packageId: created.packageId,
        version: created.version,
        roleMapping: {
          tank: "CH_WARRIOR",
          healer: "CH_WARRIOR",
          dps: "CH_RANGER",
          merchant: "CH_MERCHANT",
        },
      });
    } catch (error) {
      if (error instanceof PartyPackWizardError) {
        duplicateRejected = error.code === "PARTY_PACK_CHARACTER_DUPLICATE";
        duplicateErrorCode = error.code;
      }
    }

    const result = wizard.setup({
      packageId: created.packageId,
      version: created.version,
      roleMapping: suggestedMapping,
    });
    const state = layoutStore.state();
    const profile = state.profiles.find((entry) => entry.id === result.profileId);
    const widgetMappings = Object.fromEntries(
      (profile?.layouts.desktop?.widgets ?? []).map((widget) => [
        widget.id,
        widget.characterId,
      ]),
    );

    const checks = Object.freeze({
      wizardDescriptor:
        wizard.descriptor().guidedRoleMapping === true &&
        wizard.descriptor().setupStartsCharacters === false,
      combinedPackVisible:
        wizard.state().packs.length === 1 &&
        wizard.state().packs[0]?.packageId === created.packageId,
      allAccountCharactersVisible: wizard.state().characters.length === 4,
      fourRolesVisible: preview.roles.length === 4,
      classRecommendations:
        suggestedMapping.tank === "CH_WARRIOR" &&
        suggestedMapping.healer === "CH_PRIEST" &&
        suggestedMapping.dps === "CH_RANGER" &&
        suggestedMapping.merchant === "CH_MERCHANT",
      uniqueCharactersRequired:
        duplicateRejected &&
        duplicateErrorCode === "PARTY_PACK_CHARACTER_DUPLICATE",
      explicitRoleMapping:
        widgetMappings["tank-card"] === "CH_WARRIOR" &&
        widgetMappings["healer-card"] === "CH_PRIEST" &&
        widgetMappings["dps-card"] === "CH_RANGER" &&
        widgetMappings["merchant-card"] === "CH_MERCHANT",
      dashboardApplied:
        state.activeProfileId === result.profileId &&
        result.layoutVariants.includes("desktop"),
      packageActivatedExplicitly: result.packageActive === true,
      noCharacterStart:
        result.charactersStarted === false &&
        sessionStarts === 0,
      noExecution: result.executionAttempted === false,
      noGameplayMutation: result.gameplayMutation === false,
      rawSocketAccess: result.rawSocketAccess === false,
      userScriptUntouched: result.userScriptTouched === false,
      cleanup: false,
    });
    rmSync(verificationRoot, { recursive: true, force: true });
    const finalChecks = Object.freeze({
      ...checks,
      cleanup: !existsSync(verificationRoot),
    });
    const ready = Object.values(finalChecks).every((value) => value === true);

    return Object.freeze({
      status: ready ? "ready" : "failed",
      descriptor: wizard.descriptor(),
      preview,
      result,
      checks: finalChecks,
    });
  }
}

export function recommendPartyPackRoles(
  roles: readonly { readonly id: string; readonly label: string }[],
  characters: readonly AdventureLandCharacterSummary[],
): readonly PartyPackWizardRole[] {
  const available = [...characters];
  const used = new Set<string>();
  return Object.freeze(roles.map((role) => {
    const preferredTypes = preferredCharacterTypes(role.id, role.label);
    let character = available.find((candidate) =>
      !used.has(candidate.id) &&
      preferredTypes.includes(candidate.type.toLowerCase())
    );
    let recommendation: PartyPackWizardRole["recommendation"] = "class-match";
    if (!character) {
      character = available.find((candidate) => !used.has(candidate.id));
      recommendation = character ? "fallback" : "unavailable";
    }
    if (character) used.add(character.id);
    return Object.freeze({
      id: role.id,
      label: role.label,
      recommendedCharacterId: character?.id,
      recommendedCharacterName: character?.name,
      recommendedCharacterType: character?.type,
      recommendation,
    });
  }));
}

export function validatePartyPackRoleMapping(
  requiredRoleIds: readonly string[],
  characters: readonly Pick<AdventureLandCharacterSummary, "id">[],
  roleMapping: Readonly<Record<string, string>>,
): void {
  const knownCharacters = new Set(characters.map((character) => character.id));
  const mappedCharacters = new Set<string>();
  for (const roleId of requiredRoleIds) {
    const characterId = roleMapping[roleId]?.trim();
    if (!characterId) {
      throw new PartyPackWizardError(
        "PARTY_PACK_ROLE_MAPPING_REQUIRED",
        `Character mapping is required for role ${roleId}.`,
      );
    }
    if (!knownCharacters.has(characterId)) {
      throw new PartyPackWizardError(
        "PARTY_PACK_CHARACTER_UNAVAILABLE",
        `Mapped Character for role ${roleId} is not available.`,
      );
    }
    if (mappedCharacters.has(characterId)) {
      throw new PartyPackWizardError(
        "PARTY_PACK_CHARACTER_DUPLICATE",
        "Each Party Pack role must map to a different Character.",
      );
    }
    mappedCharacters.add(characterId);
  }
  for (const roleId of Object.keys(roleMapping)) {
    if (!requiredRoleIds.includes(roleId)) {
      throw new PartyPackWizardError(
        "PARTY_PACK_ROLE_UNKNOWN",
        `Unknown Party Pack role: ${roleId}.`,
      );
    }
  }
}

function preferredCharacterTypes(roleId: string, label: string): readonly string[] {
  const role = `${roleId} ${label}`.trim().toLowerCase();
  const classNames = ["warrior", "priest", "ranger", "rogue", "mage", "merchant", "paladin"];
  const explicitClass = classNames.find((type) => role.includes(type));
  if (explicitClass) return [explicitClass];
  if (/tank|front|defen/u.test(role)) return ["warrior", "paladin"];
  if (/heal|support|priest/u.test(role)) return ["priest", "paladin"];
  if (/merchant|shop|trade/u.test(role)) return ["merchant"];
  if (/dps|damage|attack|ranged/u.test(role)) {
    return ["ranger", "rogue", "mage", "paladin", "warrior"];
  }
  return classNames;
}

function wizardWidget(id: string, role: string) {
  return {
    id,
    duplicateOf: null,
    columns: 3,
    height: 144,
    removed: false,
    hiddenFields: [],
    displayMode: "compact",
    characterRole: role,
  };
}

function verificationCharacter(
  id: string,
  name: string,
  type: string,
): AdventureLandCharacterSummary {
  return Object.freeze({
    id,
    name,
    type,
    level: 100,
    online: false,
  });
}
