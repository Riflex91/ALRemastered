import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AdventureLandAccountService } from "../account/service.ts";
import type {
  ActionGateway,
  ActionGatewayResult,
  ActionOrigin,
} from "../action/gateway.ts";
import type {
  AdventureLandMovementService,
  MovementDirection,
  MovementMode,
} from "../action/movement.ts";
import type { AdventureLandAttackService } from "../action/attack.ts";
import type { AdventureLandSkillService } from "../action/skill.ts";
import type { AdventureLandLootConsumableService } from "../action/loot-consumable.ts";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { MultiCharacterSessionManager } from "../character/session-manager.ts";
import type { LocalCharacterMessagingService } from "../character/messaging.ts";
import type { PartyCoordinatorService } from "../party/coordinator.ts";
import type { PartyTemplateService } from "../party/templates.ts";
import {
  runScriptPackageFormatSelfTest,
  scriptPackageFormatDescriptor,
} from "../packages/format.ts";
import {
  runScriptPackagePermissionSelfTest,
  scriptPackagePermissionDescriptor,
} from "../packages/permissions.ts";
import type { ScriptPackageImporter } from "../packages/importer.ts";
import type { ScriptPackageLibrary } from "../packages/library.ts";
import type { ScriptPackageUpdateService } from "../packages/updater.ts";
import type { CharacterCardsService } from "./character-cards.ts";
import type { SetupWizardService, SetupWizardStartInput } from "./setup-wizard.ts";
import type { TemplateConfigurationService } from "./template-config.ts";
import type { ExplainabilityService } from "./explainability.ts";
import type {
  DashboardLayoutStore,
  DashboardLayoutVariant,
  DashboardPersistentLayout,
} from "./layout-store.ts";
import type { CoreRuntime, HealthSnapshot } from "../core/app.ts";
import {
  parseControlMode,
  type ControlModeService,
} from "../control/modes.ts";
import type { DiagnosticsService } from "../diagnostics/service.ts";
import type { AdventureLandGameDataService } from "../game/data-service.ts";
import type { AdventureLandVersionService } from "../game/version-service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { RendererBridge } from "../renderer/bridge.ts";
import type { RendererHandoffService } from "../renderer/handoff.ts";
import type { AlhdAssetProvider } from "../hd/asset-provider.ts";
import type { Slice35LiveTestService } from "../live-test/slice-3-5.ts";
import type { Slice41LiveTestService } from "../live-test/slice-4-1.ts";
import type { Slice42LiveTestService } from "../live-test/slice-4-2.ts";
import type { Slice43LiveTestService } from "../live-test/slice-4-3.ts";
import type { Slice44LiveTestService } from "../live-test/slice-4-4.ts";
import type { Slice45LiveTestService } from "../live-test/slice-4-5.ts";
import type { Slice51LiveTestService } from "../live-test/slice-5-1.ts";
import type { Slice52LiveTestService } from "../live-test/slice-5-2.ts";
import type { Slice53LiveTestService } from "../live-test/slice-5-3.ts";
import type { Slice54LiveTestService } from "../live-test/slice-5-4.ts";
import type { Slice61LiveTestService } from "../live-test/slice-6-1.ts";
import type { Slice62LiveTestService } from "../live-test/slice-6-2.ts";
import type { Slice63LiveTestService } from "../live-test/slice-6-3.ts";
import type { Slice64LiveTestService } from "../live-test/slice-6-4.ts";
import type { Slice71LiveTestService } from "../live-test/slice-7-1.ts";
import type { Slice72LiveTestService } from "../live-test/slice-7-2.ts";
import type { Slice73LiveTestService } from "../live-test/slice-7-3.ts";
import type { Slice74LiveTestService } from "../live-test/slice-7-4.ts";
import type { Slice81LiveTestService } from "../live-test/slice-8-1.ts";
import type { Slice82LiveTestService } from "../live-test/slice-8-2.ts";
import type { Slice83LiveTestService } from "../live-test/slice-8-3.ts";
import type { Slice84LiveTestService } from "../live-test/slice-8-4.ts";
import type { AdventureLandMapModelService } from "../navigation/map-model.ts";
import type { MovementDebugService } from "../navigation/movement-debug.ts";
import type { SimplePathPlannerService } from "../navigation/path-planner.ts";
import type { SmartMoveService } from "../navigation/smart-move.ts";
import type { WatchdogComponent, WatchdogService } from "../recovery/watchdog.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";
import type { SimpleFarmerConfig, SimpleFarmerTemplateService } from "../script/simple-farmer.ts";
import type { UpdateService } from "../update/service.ts";

export interface DashboardServerOptions {
  readonly logger: Logger;
  readonly runtime: CoreRuntime;
  readonly host?: string;
  readonly port?: number;
  readonly accountService?: AdventureLandAccountService;
  readonly selectionService?: AdventureLandSelectionService;
  readonly characterService?: AdventureLandCharacterService;
  readonly multiCharacterSessionManager?: MultiCharacterSessionManager;
  readonly localCharacterMessagingService?: LocalCharacterMessagingService;
  readonly partyCoordinatorService?: PartyCoordinatorService;
  readonly partyTemplateService?: PartyTemplateService;
  readonly characterCardsService?: CharacterCardsService;
  readonly setupWizardService?: SetupWizardService;
  readonly templateConfigurationService?: TemplateConfigurationService;
  readonly explainabilityService?: ExplainabilityService;
  readonly dashboardLayoutStore?: DashboardLayoutStore;
  readonly scriptPackageImporter?: ScriptPackageImporter;
  readonly scriptPackageLibrary?: ScriptPackageLibrary;
  readonly scriptPackageUpdateService?: ScriptPackageUpdateService;
  readonly rendererBridge?: RendererBridge;
  readonly rendererHandoffService?: RendererHandoffService;
  readonly alhdAssetProvider?: AlhdAssetProvider;
  readonly controlModeService?: ControlModeService;
  readonly actionGateway?: ActionGateway;
  readonly movementService?: AdventureLandMovementService;
  readonly attackService?: AdventureLandAttackService;
  readonly skillService?: AdventureLandSkillService;
  readonly lootConsumableService?: AdventureLandLootConsumableService;
  readonly slice35LiveTestService?: Slice35LiveTestService;
  readonly scriptRuntime?: ScriptRuntimeService;
  readonly slice41LiveTestService?: Slice41LiveTestService;
  readonly slice42LiveTestService?: Slice42LiveTestService;
  readonly slice43LiveTestService?: Slice43LiveTestService;
  readonly slice44LiveTestService?: Slice44LiveTestService;
  readonly slice45LiveTestService?: Slice45LiveTestService;
  readonly slice51LiveTestService?: Slice51LiveTestService;
  readonly slice52LiveTestService?: Slice52LiveTestService;
  readonly slice53LiveTestService?: Slice53LiveTestService;
  readonly slice54LiveTestService?: Slice54LiveTestService;
  readonly slice61LiveTestService?: Slice61LiveTestService;
  readonly slice62LiveTestService?: Slice62LiveTestService;
  readonly slice63LiveTestService?: Slice63LiveTestService;
  readonly slice64LiveTestService?: Slice64LiveTestService;
  readonly slice71LiveTestService?: Slice71LiveTestService;
  readonly slice72LiveTestService?: Slice72LiveTestService;
  readonly slice73LiveTestService?: Slice73LiveTestService;
  readonly slice74LiveTestService?: Slice74LiveTestService;
  readonly slice81LiveTestService?: Slice81LiveTestService;
  readonly slice82LiveTestService?: Slice82LiveTestService;
  readonly slice83LiveTestService?: Slice83LiveTestService;
  readonly slice84LiveTestService?: Slice84LiveTestService;
  readonly mapModelService?: AdventureLandMapModelService;
  readonly movementDebugService?: MovementDebugService;
  readonly pathPlannerService?: SimplePathPlannerService;
  readonly smartMoveService?: SmartMoveService;
  readonly watchdogService?: WatchdogService;
  readonly simpleFarmerService?: SimpleFarmerTemplateService;
  readonly updateService?: UpdateService;
  readonly diagnostics?: DiagnosticsService;
  readonly gameVersionService?: AdventureLandVersionService;
  readonly gameDataService?: AdventureLandGameDataService;
}

export class DashboardServer {
  readonly #logger: Logger;
  readonly #runtime: CoreRuntime;
  readonly #host: string;
  readonly #port: number;
  readonly #accountService?: AdventureLandAccountService;
  readonly #selectionService?: AdventureLandSelectionService;
  readonly #characterService?: AdventureLandCharacterService;
  readonly #multiCharacterSessionManager?: MultiCharacterSessionManager;
  readonly #localCharacterMessagingService?: LocalCharacterMessagingService;
  readonly #partyCoordinatorService?: PartyCoordinatorService;
  readonly #partyTemplateService?: PartyTemplateService;
  readonly #characterCardsService?: CharacterCardsService;
  readonly #setupWizardService?: SetupWizardService;
  readonly #templateConfigurationService?: TemplateConfigurationService;
  readonly #explainabilityService?: ExplainabilityService;
  readonly #dashboardLayoutStore?: DashboardLayoutStore;
  readonly #scriptPackageImporter?: ScriptPackageImporter;
  readonly #scriptPackageLibrary?: ScriptPackageLibrary;
  readonly #scriptPackageUpdateService?: ScriptPackageUpdateService;
  readonly #rendererBridge?: RendererBridge;
  readonly #rendererHandoffService?: RendererHandoffService;
  readonly #alhdAssetProvider?: AlhdAssetProvider;
  readonly #controlModeService?: ControlModeService;
  readonly #actionGateway?: ActionGateway;
  readonly #movementService?: AdventureLandMovementService;
  readonly #attackService?: AdventureLandAttackService;
  readonly #skillService?: AdventureLandSkillService;
  readonly #lootConsumableService?: AdventureLandLootConsumableService;
  readonly #slice35LiveTestService?: Slice35LiveTestService;
  readonly #scriptRuntime?: ScriptRuntimeService;
  readonly #slice41LiveTestService?: Slice41LiveTestService;
  readonly #slice42LiveTestService?: Slice42LiveTestService;
  readonly #slice43LiveTestService?: Slice43LiveTestService;
  readonly #slice44LiveTestService?: Slice44LiveTestService;
  readonly #slice45LiveTestService?: Slice45LiveTestService;
  readonly #slice51LiveTestService?: Slice51LiveTestService;
  readonly #slice52LiveTestService?: Slice52LiveTestService;
  readonly #slice53LiveTestService?: Slice53LiveTestService;
  readonly #slice54LiveTestService?: Slice54LiveTestService;
  readonly #slice61LiveTestService?: Slice61LiveTestService;
  readonly #slice62LiveTestService?: Slice62LiveTestService;
  readonly #slice63LiveTestService?: Slice63LiveTestService;
  readonly #slice64LiveTestService?: Slice64LiveTestService;
  readonly #slice71LiveTestService?: Slice71LiveTestService;
  readonly #slice72LiveTestService?: Slice72LiveTestService;
  readonly #slice73LiveTestService?: Slice73LiveTestService;
  readonly #slice74LiveTestService?: Slice74LiveTestService;
  readonly #slice81LiveTestService?: Slice81LiveTestService;
  readonly #slice82LiveTestService?: Slice82LiveTestService;
  readonly #slice83LiveTestService?: Slice83LiveTestService;
  readonly #slice84LiveTestService?: Slice84LiveTestService;
  readonly #mapModelService?: AdventureLandMapModelService;
  readonly #movementDebugService?: MovementDebugService;
  readonly #pathPlannerService?: SimplePathPlannerService;
  readonly #smartMoveService?: SmartMoveService;
  readonly #watchdogService?: WatchdogService;
  readonly #simpleFarmerService?: SimpleFarmerTemplateService;
  readonly #updateService?: UpdateService;
  readonly #diagnostics?: DiagnosticsService;
  readonly #gameVersionService?: AdventureLandVersionService;
  readonly #gameDataService?: AdventureLandGameDataService;
  #server?: Server;
  #url?: string;
  readonly #clients = new Set<ServerResponse>();
  readonly #rendererUnsubscribes = new Set<() => void>();
  #unsubscribe?: () => void;

  constructor(options: DashboardServerOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#host = options.host ?? "127.0.0.1";
    this.#port = options.port ?? 3210;
    this.#accountService = options.accountService;
    this.#selectionService = options.selectionService;
    this.#characterService = options.characterService;
    this.#multiCharacterSessionManager = options.multiCharacterSessionManager;
    this.#localCharacterMessagingService = options.localCharacterMessagingService;
    this.#partyCoordinatorService = options.partyCoordinatorService;
    this.#partyTemplateService = options.partyTemplateService;
    this.#characterCardsService = options.characterCardsService;
    this.#setupWizardService = options.setupWizardService;
    this.#templateConfigurationService = options.templateConfigurationService;
    this.#explainabilityService = options.explainabilityService;
    this.#dashboardLayoutStore = options.dashboardLayoutStore;
    this.#scriptPackageImporter = options.scriptPackageImporter;
    this.#scriptPackageLibrary = options.scriptPackageLibrary;
    this.#scriptPackageUpdateService = options.scriptPackageUpdateService;
    this.#rendererBridge = options.rendererBridge;
    this.#rendererHandoffService = options.rendererHandoffService;
    this.#alhdAssetProvider = options.alhdAssetProvider;
    this.#controlModeService = options.controlModeService;
    this.#actionGateway = options.actionGateway;
    this.#movementService = options.movementService;
    this.#attackService = options.attackService;
    this.#skillService = options.skillService;
    this.#lootConsumableService = options.lootConsumableService;
    this.#slice35LiveTestService = options.slice35LiveTestService;
    this.#scriptRuntime = options.scriptRuntime;
    this.#slice41LiveTestService = options.slice41LiveTestService;
    this.#slice42LiveTestService = options.slice42LiveTestService;
    this.#slice43LiveTestService = options.slice43LiveTestService;
    this.#slice44LiveTestService = options.slice44LiveTestService;
    this.#slice45LiveTestService = options.slice45LiveTestService;
    this.#slice51LiveTestService = options.slice51LiveTestService;
    this.#slice52LiveTestService = options.slice52LiveTestService;
    this.#slice53LiveTestService = options.slice53LiveTestService;
    this.#slice54LiveTestService = options.slice54LiveTestService;
    this.#slice61LiveTestService = options.slice61LiveTestService;
    this.#slice62LiveTestService = options.slice62LiveTestService;
    this.#slice63LiveTestService = options.slice63LiveTestService;
    this.#slice64LiveTestService = options.slice64LiveTestService;
    this.#slice71LiveTestService = options.slice71LiveTestService;
    this.#slice72LiveTestService = options.slice72LiveTestService;
    this.#slice73LiveTestService = options.slice73LiveTestService;
    this.#slice74LiveTestService = options.slice74LiveTestService;
    this.#slice81LiveTestService = options.slice81LiveTestService;
    this.#slice82LiveTestService = options.slice82LiveTestService;
    this.#slice83LiveTestService = options.slice83LiveTestService;
    this.#slice84LiveTestService = options.slice84LiveTestService;
    this.#mapModelService = options.mapModelService;
    this.#movementDebugService = options.movementDebugService;
    this.#pathPlannerService = options.pathPlannerService;
    this.#smartMoveService = options.smartMoveService;
    this.#watchdogService = options.watchdogService;
    this.#simpleFarmerService = options.simpleFarmerService;
    this.#updateService = options.updateService;
    this.#diagnostics = options.diagnostics;
    this.#gameVersionService = options.gameVersionService;
    this.#gameDataService = options.gameDataService;
  }

  get url(): string {
    if (!this.#url) throw new Error("Dashboard server has not started.");
    return this.#url;
  }

  async start(): Promise<string> {
    if (this.#server) return this.url;

    const server = createServer((request, response) => {
      void this.#handleRequest(request, response).catch((error) => {
        this.#logger.error("Dashboard request failed.", error, {
          method: request.method,
          path: request.url,
        });
        if (!response.headersSent) {
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        }
        if (!response.writableEnded) response.end(JSON.stringify({ error: "Dashboard request failed." }));
      });
    });
    this.#server = server;
    this.#unsubscribe = this.#logger.subscribe((record) => this.#broadcast(record));

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.#port, this.#host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard server did not expose a TCP address.");
    this.#url = `http://${this.#host}:${address.port}`;
    this.#logger.info("Dashboard server started.", { url: this.#url });
    return this.#url;
  }

  async stop(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    for (const client of this.#clients) client.end();
    this.#clients.clear();
    for (const unsubscribe of this.#rendererUnsubscribes) unsubscribe();
    this.#rendererUnsubscribes.clear();

    const server = this.#server;
    this.#server = undefined;
    this.#url = undefined;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const pathWithQuery = request.url ?? "/";
    const method = request.method ?? "GET";
    const path = pathWithQuery.split("?", 1)[0];

    if (method === "GET" && path === "/api/packages/format") {
      return this.#json(response, scriptPackageFormatDescriptor());
    }
    if (method === "GET" && path === "/api/packages/format/self-test") {
      return this.#json(response, runScriptPackageFormatSelfTest());
    }
    if (method === "GET" && path === "/api/packages/permissions") {
      return this.#json(response, scriptPackagePermissionDescriptor());
    }
    if (method === "GET" && path === "/api/packages/permissions/self-test") {
      return this.#json(response, runScriptPackagePermissionSelfTest());
    }
    if (method === "GET" && path === "/api/packages/updates/descriptor") {
      if (!this.#scriptPackageUpdateService) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#scriptPackageUpdateService.descriptor());
    }
    if (method === "GET" && path === "/api/packages/updates/self-test") {
      if (!this.#scriptPackageUpdateService) {
        return this.#json(response, { error: "Package update service is unavailable." }, 503);
      }
      return this.#runPackageImportAction(
        response,
        () => this.#scriptPackageUpdateService!.runSelfTest(),
      );
    }
    if (method === "POST" && path === "/api/packages/updates/check") {
      if (!this.#scriptPackageUpdateService) {
        return this.#json(response, { error: "Package update service is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request);
        if (typeof body.packageId !== "string" || !body.packageId.trim()) {
          throw new Error("packageId is required.");
        }
        return this.#scriptPackageUpdateService!.check(body.packageId);
      });
    }
    if (method === "POST" && path === "/api/packages/updates/apply") {
      if (!this.#scriptPackageUpdateService) {
        return this.#json(response, { error: "Package update service is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request);
        if (
          typeof body.packageId !== "string" ||
          !body.packageId.trim() ||
          typeof body.previewToken !== "string" ||
          !body.previewToken
        ) {
          throw new Error("packageId and previewToken are required.");
        }
        if (
          body.approvedNewPermissions !== undefined &&
          (!Array.isArray(body.approvedNewPermissions) ||
            body.approvedNewPermissions.some((value) => typeof value !== "string"))
        ) {
          throw new Error("approvedNewPermissions must be an array of permission strings.");
        }
        return this.#scriptPackageUpdateService!.applyUpdate({
          packageId: body.packageId,
          previewToken: body.previewToken,
          approvedNewPermissions:
            body.approvedNewPermissions as readonly string[] | undefined,
        });
      });
    }
    if (method === "POST" && path === "/api/packages/updates/rollback") {
      if (!this.#scriptPackageUpdateService) {
        return this.#json(response, { error: "Package update service is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request);
        if (typeof body.packageId !== "string" || !body.packageId.trim()) {
          throw new Error("packageId is required.");
        }
        return this.#scriptPackageUpdateService!.rollback(body.packageId);
      });
    }

    if (method === "GET" && path === "/api/packages/library") {
      if (!this.#scriptPackageLibrary) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#scriptPackageLibrary.snapshot());
    }
    if (method === "GET" && path === "/api/packages/library/descriptor") {
      if (!this.#scriptPackageLibrary) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#scriptPackageLibrary.descriptor());
    }
    if (method === "GET" && path === "/api/packages/library/self-test") {
      if (!this.#scriptPackageLibrary) {
        return this.#json(response, { error: "Script Library is unavailable." }, 503);
      }
      return this.#runPackageImportAction(
        response,
        () => this.#scriptPackageLibrary!.runSelfTest(),
      );
    }
    if (method === "POST" && path === "/api/packages/library/active") {
      if (!this.#scriptPackageLibrary) {
        return this.#json(response, { error: "Script Library is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request);
        if (
          typeof body.packageId !== "string" ||
          typeof body.version !== "string" ||
          typeof body.active !== "boolean"
        ) {
          throw new Error("packageId, version, and boolean active are required.");
        }
        return this.#scriptPackageLibrary!.setActive({
          packageId: body.packageId,
          version: body.version,
          active: body.active,
        });
      });
    }
    if (method === "POST" && path === "/api/packages/library/configuration") {
      if (!this.#scriptPackageLibrary) {
        return this.#json(response, { error: "Script Library is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request, 160 * 1024);
        if (
          typeof body.packageId !== "string" ||
          typeof body.version !== "string" ||
          !("configuration" in body)
        ) {
          throw new Error("packageId, version, and configuration are required.");
        }
        return this.#scriptPackageLibrary!.setConfiguration({
          packageId: body.packageId,
          version: body.version,
          configuration: body.configuration,
        });
      });
    }

    if (method === "GET" && path === "/api/packages/import") {
      if (!this.#scriptPackageImporter) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#scriptPackageImporter.descriptor());
    }
    if (method === "GET" && path === "/api/packages/import/self-test") {
      if (!this.#scriptPackageImporter) {
        return this.#json(response, { error: "Package importer is unavailable." }, 503);
      }
      return this.#runPackageImportAction(
        response,
        () => this.#scriptPackageImporter!.runSelfTest(),
      );
    }
    if (method === "GET" && path === "/api/packages/import/remote/self-test") {
      if (!this.#scriptPackageImporter) {
        return this.#json(response, { error: "Package importer is unavailable." }, 503);
      }
      return this.#runPackageImportAction(
        response,
        () => this.#scriptPackageImporter!.runRemoteSelfTest(),
      );
    }
    if (method === "POST" && path === "/api/packages/import/remote/preview") {
      if (!this.#scriptPackageImporter) {
        return this.#json(response, { error: "Package importer is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request);
        if (typeof body.source !== "string" || !body.source.trim()) {
          throw new Error("Request body must include source.");
        }
        return this.#scriptPackageImporter!.previewRemote(body.source);
      });
    }
    if (method === "POST" && path === "/api/packages/import/remote/confirm") {
      if (!this.#scriptPackageImporter) {
        return this.#json(response, { error: "Package importer is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request);
        if (typeof body.source !== "string" || !body.source.trim()) {
          throw new Error("Request body must include source.");
        }
        if (typeof body.previewToken !== "string" || !body.previewToken) {
          throw new Error("Request body must include previewToken.");
        }
        if (
          body.approvedDangerous !== undefined &&
          (!Array.isArray(body.approvedDangerous) ||
            body.approvedDangerous.some((value) => typeof value !== "string"))
        ) {
          throw new Error("approvedDangerous must be an array of permission strings.");
        }
        return this.#scriptPackageImporter!.importRemote({
          source: body.source,
          previewToken: body.previewToken,
          approvedDangerous: body.approvedDangerous as readonly string[] | undefined,
        });
      });
    }

    if (method === "POST" && path === "/api/packages/import/preview") {
      if (!this.#scriptPackageImporter) {
        return this.#json(response, { error: "Package importer is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request, 3 * 1024 * 1024);
        if (!("package" in body)) throw new Error("Request body must include package.");
        return this.#scriptPackageImporter!.preview(body.package);
      });
    }
    if (method === "POST" && path === "/api/packages/import/confirm") {
      if (!this.#scriptPackageImporter) {
        return this.#json(response, { error: "Package importer is unavailable." }, 503);
      }
      return this.#runPackageImportAction(response, async () => {
        const body = await this.#readJsonObject(request, 3 * 1024 * 1024);
        if (!("package" in body)) throw new Error("Request body must include package.");
        if (typeof body.previewToken !== "string" || !body.previewToken) {
          throw new Error("Request body must include previewToken.");
        }
        if (
          body.approvedDangerous !== undefined &&
          (!Array.isArray(body.approvedDangerous) ||
            body.approvedDangerous.some((value) => typeof value !== "string"))
        ) {
          throw new Error("approvedDangerous must be an array of permission strings.");
        }
        return this.#scriptPackageImporter!.importPackage({
          packageDocument: body.package,
          previewToken: body.previewToken,
          approvedDangerous: body.approvedDangerous as readonly string[] | undefined,
        });
      });
    }

    if (method === "GET" && path === "/api/hd/assets") {
      if (!this.#alhdAssetProvider) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#alhdAssetProvider.state());
    }
    if (method === "GET" && path === "/api/hd/assets/diagnostics") {
      if (!this.#alhdAssetProvider) {
        return this.#json(response, { error: "ALHD asset provider is unavailable." }, 503);
      }
      try {
        const url = new URL(pathWithQuery, "http://127.0.0.1");
        const maxTextureSize = parseOptionalPositiveInteger(
          url.searchParams.get("maxTextureSize"),
          "maxTextureSize",
        );
        return this.#json(response, this.#alhdAssetProvider.diagnose(maxTextureSize));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid texture diagnostics request.";
        return this.#json(response, { error: message }, 400);
      }
    }
    if (method === "GET" && path === "/api/hd/assets/browser-plan") {
      if (!this.#alhdAssetProvider) {
        return this.#json(response, { error: "ALHD asset provider is unavailable." }, 503);
      }
      try {
        const url = new URL(pathWithQuery, "http://127.0.0.1");
        const maxTextureSize = parseOptionalPositiveInteger(
          url.searchParams.get("maxTextureSize"),
          "maxTextureSize",
        );
        return this.#json(response, this.#alhdAssetProvider.browserPlan(maxTextureSize));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid Browser asset plan request.";
        return this.#json(response, { error: message }, 400);
      }
    }
    if (method === "GET" && path === "/api/hd/assets/content") {
      if (!this.#alhdAssetProvider) {
        return this.#json(response, { error: "ALHD asset provider is unavailable." }, 503);
      }
      try {
        const url = new URL(pathWithQuery, "http://127.0.0.1");
        const hdPath = url.searchParams.get("hdPath") ?? "";
        if (!hdPath.trim()) {
          return this.#json(response, { error: "hdPath is required." }, 400);
        }
        return this.#json(response, this.#alhdAssetProvider.readBrowserAsset(hdPath));
      } catch (error) {
        const message = error instanceof Error ? error.message : "HD asset payload is unavailable.";
        return this.#json(response, { error: message }, 404);
      }
    }

    if (method === "GET" && path === "/api/hd/assets/resolve") {
      if (!this.#alhdAssetProvider) {
        return this.#json(response, { error: "ALHD asset provider is unavailable." }, 503);
      }
      let sourcePath = "";
      let maxTextureSize: number | null | undefined;
      try {
        const url = new URL(pathWithQuery, "http://127.0.0.1");
        sourcePath = url.searchParams.get("sourcePath") ?? "";
        maxTextureSize = parseOptionalPositiveInteger(
          url.searchParams.get("maxTextureSize"),
          "maxTextureSize",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid asset resolution request.";
        return this.#json(response, { error: message }, 400);
      }
      if (!sourcePath.trim()) {
        return this.#json(response, { error: "sourcePath is required." }, 400);
      }
      try {
        return this.#json(
          response,
          this.#alhdAssetProvider.resolve(sourcePath, { maxTextureSize }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid sourcePath.";
        return this.#json(response, { error: message }, 400);
      }
    }

    if (method === "GET" && path === "/api/account") {
      if (!this.#accountService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#accountService.state());
    }
    if (method === "POST" && path === "/api/account/login") {
      if (!this.#accountService) return this.#json(response, { error: "Account service is unavailable." }, 503);
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email.trim() || !password) {
        return this.#json(response, { error: "Email and password are required." }, 400);
      }
      const accountState = await this.#accountService.login({ email, password });
      if (accountState.status === "connected" && this.#selectionService) {
        await this.#selectionService.refresh();
      }
      return this.#json(response, accountState);
    }
    if (method === "POST" && path === "/api/account/disconnect") {
      if (!this.#accountService) return this.#json(response, { error: "Account service is unavailable." }, 503);
      if (this.#multiCharacterSessionManager) await this.#multiCharacterSessionManager.stopAll("account_disconnect");
      if (this.#characterService) await this.#characterService.stop("account_disconnect");
      const accountState = this.#accountService.disconnect();
      this.#selectionService?.clear();
      return this.#json(response, accountState);
    }

    if (method === "GET" && path === "/api/selection") {
      if (!this.#selectionService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#selectionService.state());
    }
    if (method === "POST" && path === "/api/selection/refresh") {
      if (!this.#selectionService) return this.#json(response, { error: "Character and server service is unavailable." }, 503);
      return this.#runSelectionAction(response, () => this.#selectionService!.refresh());
    }
    if (method === "POST" && path === "/api/selection/server") {
      if (!this.#selectionService) return this.#json(response, { error: "Character and server service is unavailable." }, 503);
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const serverKey = typeof body.serverKey === "string" ? body.serverKey : "";
      if (!serverKey.trim()) return this.#json(response, { error: "Server selection is required." }, 400);
      return this.#runSelectionAction(
        response,
        () => this.#selectionService!.selectServer(serverKey),
      );
    }

    if (method === "GET" && path === "/api/character") {
      if (!this.#characterService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#characterService.state());
    }
    if (method === "POST" && path === "/api/character/start") {
      if (!this.#characterService) return this.#json(response, { error: "Character connection service is unavailable." }, 503);
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      if (!characterId.trim()) return this.#json(response, { error: "Character selection is required." }, 400);
      return this.#runCharacterAction(
        response,
        () => this.#characterService!.start(characterId),
      );
    }
    if (method === "POST" && path === "/api/character/stop") {
      if (!this.#characterService) return this.#json(response, { error: "Character connection service is unavailable." }, 503);
      return this.#runCharacterAction(
        response,
        () => this.#characterService!.stop("dashboard"),
      );
    }

    if (method === "GET" && path === "/api/character-sessions") {
      if (!this.#multiCharacterSessionManager) {
        return this.#json(response, {
          status: "unavailable",
          message: "Multi-character session manager is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#multiCharacterSessionManager.state());
    }
    if (method === "POST" && path === "/api/character-sessions/start") {
      if (!this.#multiCharacterSessionManager) {
        return this.#json(response, {
          error: "Multi-character session manager is unavailable.",
        }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      const serverKey = typeof body.serverKey === "string" ? body.serverKey : undefined;
      if (!characterId.trim()) {
        return this.#json(response, { error: "Character selection is required." }, 400);
      }
      return this.#runCharacterSessionAction(
        response,
        () => this.#multiCharacterSessionManager!.start(characterId, serverKey),
      );
    }
    if (method === "POST" && path === "/api/character-sessions/stop") {
      if (!this.#multiCharacterSessionManager) {
        return this.#json(response, {
          error: "Multi-character session manager is unavailable.",
        }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      if (!characterId.trim()) {
        return this.#json(response, { error: "Character selection is required." }, 400);
      }
      return this.#runCharacterSessionAction(
        response,
        () => this.#multiCharacterSessionManager!.stop(characterId, "dashboard"),
      );
    }


    if (method === "GET" && path === "/api/character-cards") {
      if (!this.#characterCardsService) {
        return this.#json(response, {
          status: "unavailable",
          cards: [],
          message: "Character Cards are unavailable.",
        }, 503);
      }
      return this.#json(response, this.#characterCardsService.state());
    }
    if (
      method === "POST" &&
      (path === "/api/character-cards/start" ||
        path === "/api/character-cards/pause" ||
        path === "/api/character-cards/stop")
    ) {
      if (!this.#characterCardsService) {
        return this.#json(response, { error: "Character Cards are unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      if (!characterId.trim()) {
        return this.#json(response, { error: "Character selection is required." }, 400);
      }
      try {
        if (path.endsWith("/start")) {
          return this.#json(response, await this.#characterCardsService.start(characterId));
        }
        if (path.endsWith("/pause")) {
          return this.#json(response, await this.#characterCardsService.pause(characterId));
        }
        return this.#json(response, await this.#characterCardsService.stop(characterId));
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : String(error),
        }, 400);
      }
    }


    if (method === "GET" && path === "/api/setup-wizard") {
      if (!this.#setupWizardService) {
        return this.#json(response, { status: "blocked", message: "Setup Wizard is unavailable." }, 503);
      }
      return this.#json(response, this.#setupWizardService.state());
    }
    if (method === "POST" && path === "/api/setup-wizard/start") {
      if (!this.#setupWizardService) {
        return this.#json(response, { error: "Setup Wizard is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, { error: error instanceof Error ? error.message : "Invalid request body." }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      const serverKey = typeof body.serverKey === "string" ? body.serverKey : "";
      const taskTemplateId = typeof body.taskTemplateId === "string" ? body.taskTemplateId : "";
      const configuration = body.configuration && typeof body.configuration === "object" && !Array.isArray(body.configuration)
        ? body.configuration as Record<string, unknown>
        : {};
      try {
        return this.#json(response, await this.#setupWizardService.start({
          characterId,
          serverKey,
          taskTemplateId,
          configuration,
        } as SetupWizardStartInput));
      } catch (error) {
        return this.#json(response, { error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }

    if (method === "GET" && path === "/api/character-messaging") {
      if (!this.#localCharacterMessagingService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Local Character messaging is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#localCharacterMessagingService.state());
    }

    if (method === "GET" && path === "/api/party-coordinator") {
      if (!this.#partyCoordinatorService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Party Coordinator is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#partyCoordinatorService.state());
    }



    if (method === "GET" && path === "/api/party-templates") {
      if (!this.#partyTemplateService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Party Templates are unavailable.",
        }, 503);
      }
      return this.#json(response, this.#partyTemplateService.state());
    }
    if (method === "POST" && path === "/api/party-templates/assign") {
      if (!this.#partyTemplateService) {
        return this.#json(response, { error: "Party Templates are unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      const role = typeof body.role === "string" ? body.role : "";
      if (!characterId.trim() || !["tank", "healer", "dps"].includes(role)) {
        return this.#json(response, {
          error: "Character selection and role (tank, healer, or dps) are required.",
        }, 400);
      }
      try {
        return this.#json(
          response,
          this.#partyTemplateService.assignRole(
            characterId,
            role as "tank" | "healer" | "dps",
          ),
        );
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : String(error),
        }, 400);
      }
    }
    if (method === "POST" && path === "/api/party-templates/clear") {
      if (!this.#partyTemplateService) {
        return this.#json(response, { error: "Party Templates are unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      if (!characterId.trim()) {
        return this.#json(response, { error: "Character selection is required." }, 400);
      }
      try {
        return this.#json(response, this.#partyTemplateService.clearRole(characterId));
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : String(error),
        }, 400);
      }
    }
    if (method === "POST" && path === "/api/party-templates/apply-recommended") {
      if (!this.#partyTemplateService) {
        return this.#json(response, { error: "Party Templates are unavailable." }, 503);
      }
      try {
        return this.#json(response, this.#partyTemplateService.applyRecommendedRoles());
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : String(error),
        }, 400);
      }
    }

    if (method === "GET" && path === "/api/control-mode") {
      if (!this.#controlModeService) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#controlModeService.state());
    }
    if (method === "POST" && path === "/api/control-mode") {
      if (!this.#controlModeService) {
        return this.#json(response, { error: "Control modes are unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const mode = parseControlMode(body.mode);
      if (!mode) {
        return this.#json(response, {
          error: "Control mode must be automatic, assist, or manual.",
        }, 400);
      }
      const state = this.#controlModeService.setMode(mode);
      this.#logger.info("Control mode changed.", {
        mode: state.mode,
        label: state.label,
        userScriptInterrupted: false,
        characterRestarted: false,
      });
      return this.#json(response, state);
    }
    if (method === "POST" && path === "/api/control-mode/verification-probe") {
      if (!this.#controlModeService || !this.#actionGateway) {
        return this.#json(response, { error: "Control mode verification is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const origin = body.origin === "dashboard" ||
          body.origin === "script" ||
          body.origin === "system"
        ? body.origin as ActionOrigin
        : undefined;
      if (!origin) {
        return this.#json(response, {
          error: "Verification probe origin must be dashboard, script, or system.",
        }, 400);
      }
      const result = await this.#actionGateway.run({
        action: "control-mode.verification-probe",
        origin,
        characterId: this.#characterService?.state().characterId,
        input: {
          kind: "non-gameplay-control-mode-probe",
          mode: this.#controlModeService.state().mode,
        },
        timeoutMs: 1_000,
        minIntervalMs: 0,
        execute: () => ({
          ok: true,
          gameplayMutation: false,
          mode: this.#controlModeService!.state().mode,
        }),
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "GET" && path === "/api/action-gateway") {
      if (!this.#actionGateway) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#actionGateway.state());
    }
    if (method === "POST" && path === "/api/action-gateway/probe") {
      if (!this.#actionGateway) {
        return this.#json(response, { error: "Action gateway is unavailable." }, 503);
      }
      const characterId = this.#characterService?.state().characterId;
      const result = await this.#actionGateway.run({
        action: "gateway.probe",
        origin: "dashboard",
        characterId,
        input: { kind: "local-probe" },
        timeoutMs: 1_000,
        minIntervalMs: 1_000,
        execute: () => ({
          ok: true,
          message: "Local action gateway probe completed.",
        }),
      });
      return this.#json(
        response,
        result,
        gatewayStatusCode(result),
      );
    }

    if (method === "POST" && path === "/api/action-gateway/movement-test") {
      if (!this.#movementService) {
        return this.#json(response, { error: "Movement test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }

      const mode = parseMovementMode(body.mode);
      const direction = parseMovementDirection(body.direction);
      if (!mode || !direction) {
        return this.#json(
          response,
          {
            error:
              "Movement test requires mode move/xmove and direction left/right/up/down.",
          },
          400,
        );
      }

      const result = await this.#movementService.runDashboardTest({
        mode,
        direction,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "POST" && path === "/api/action-gateway/attack-test") {
      if (!this.#attackService) {
        return this.#json(response, { error: "Attack test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }

      if (typeof body.targetId !== "string" || !body.targetId.trim()) {
        return this.#json(
          response,
          { error: "Attack test requires one visible monster target ID." },
          400,
        );
      }

      const result = await this.#attackService.runDashboardTest({
        targetId: body.targetId,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "GET" && path === "/api/action-gateway/skill-options") {
      if (!this.#skillService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Skill test service is unavailable.",
          skills: [],
        }, 503);
      }
      return this.#json(response, this.#skillService.dashboardOptions());
    }

    if (method === "POST" && path === "/api/action-gateway/skill-test") {
      if (!this.#skillService) {
        return this.#json(response, { error: "Skill test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }

      if (typeof body.skillName !== "string" || !body.skillName.trim()) {
        return this.#json(
          response,
          { error: "Skill test requires one supported skill name." },
          400,
        );
      }
      if (
        body.targetId !== undefined &&
        body.targetId !== null &&
        typeof body.targetId !== "string"
      ) {
        return this.#json(
          response,
          { error: "Skill target ID must be a string when provided." },
          400,
        );
      }

      const result = await this.#skillService.runDashboardTest({
        skillName: body.skillName,
        targetId: typeof body.targetId === "string"
          ? body.targetId
          : undefined,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "GET" && path === "/api/action-gateway/loot-consumable-options") {
      if (!this.#lootConsumableService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Loot and consumable test service is unavailable.",
          lootChests: [],
          consumables: [],
        }, 503);
      }
      return this.#json(response, this.#lootConsumableService.dashboardOptions());
    }

    if (method === "POST" && path === "/api/action-gateway/loot-test") {
      if (!this.#lootConsumableService) {
        return this.#json(response, { error: "Loot test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      if (typeof body.chestId !== "string" || !body.chestId.trim()) {
        return this.#json(
          response,
          { error: "Loot test requires one visible loot chest ID." },
          400,
        );
      }

      const result = await this.#lootConsumableService.runDashboardLoot({
        chestId: body.chestId,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "POST" && path === "/api/action-gateway/consumable-test") {
      if (!this.#lootConsumableService) {
        return this.#json(response, { error: "Consumable test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      if (
        typeof body.inventoryIndex !== "number" ||
        !Number.isInteger(body.inventoryIndex) ||
        body.inventoryIndex < 0 ||
        typeof body.itemName !== "string" ||
        !body.itemName.trim() ||
        (body.kind !== "hp" && body.kind !== "mp")
      ) {
        return this.#json(
          response,
          { error: "Consumable test requires one validated HP/MP inventory item." },
          400,
        );
      }

      const result = await this.#lootConsumableService.runDashboardConsumable({
        inventoryIndex: body.inventoryIndex,
        itemName: body.itemName,
        kind: body.kind,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "GET" && path === "/api/live-test/slice-3-5") {
      if (!this.#slice35LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 3.5 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice35LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-3-5/start") {
      if (!this.#slice35LiveTestService) {
        return this.#json(response, {
          error: "Slice 3.5 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice35LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 3.5 one-click live test",
        result,
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/script-runtime") {
      if (!this.#scriptRuntime) {
        return this.#json(response, { status: "unavailable", message: "Script runtime is unavailable." }, 503);
      }
      return this.#json(response, this.#scriptRuntime.state());
    }

    if (method === "POST" && path === "/api/script-runtime/load") {
      if (!this.#scriptRuntime) {
        return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      if (typeof body.name !== "string" || typeof body.source !== "string") {
        return this.#json(response, { error: "Script name and source are required." }, 400);
      }
      try {
        return this.#json(response, await this.#scriptRuntime.load({
          name: body.name,
          source: body.source,
        }));
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Script could not be loaded.",
        }, 400);
      }
    }

    if (method === "POST" && path === "/api/script-runtime/start") {
      if (!this.#scriptRuntime) return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      try {
        return this.#json(response, await this.#scriptRuntime.start());
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Script could not be started.",
        }, 400);
      }
    }

    if (method === "POST" && path === "/api/script-runtime/pause") {
      if (!this.#scriptRuntime) return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      return this.#json(response, await this.#scriptRuntime.pause());
    }

    if (method === "POST" && path === "/api/script-runtime/stop") {
      if (!this.#scriptRuntime) return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      return this.#json(response, await this.#scriptRuntime.stop());
    }

    if (method === "GET" && path === "/api/live-test/slice-4-1") {
      if (!this.#slice41LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.1 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice41LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-4-1/start") {
      if (!this.#slice41LiveTestService) {
        return this.#json(response, {
          error: "Slice 4.1 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice41LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.1 one-click live test",
        result,
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-4-2") {
      if (!this.#slice42LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.2 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice42LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-4-2/start") {
      if (!this.#slice42LiveTestService) {
        return this.#json(response, {
          error: "Slice 4.2 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice42LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.2 one-click live test",
        result,
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-4-3") {
      if (!this.#slice43LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.3 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice43LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-4-3/start") {
      if (!this.#slice43LiveTestService) {
        return this.#json(response, {
          error: "Slice 4.3 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice43LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.3 one-click live test",
        result,
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-4-4") {
      if (!this.#slice44LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.4 one-click storage-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice44LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-4-4/start") {
      if (!this.#slice44LiveTestService) {
        return this.#json(response, {
          error: "Slice 4.4 one-click storage-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice44LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.4 one-click storage test",
        result,
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }



    if (method === "GET" && path === "/api/dashboard-layout") {
      if (!this.#dashboardLayoutStore) {
        return this.#json(response, { error: "Dashboard layout persistence is unavailable." }, 503);
      }
      return this.#json(response, this.#dashboardLayoutStore.state());
    }
    if (method === "POST" && path.startsWith("/api/dashboard-layout/")) {
      if (!this.#dashboardLayoutStore) {
        return this.#json(response, { error: "Dashboard layout persistence is unavailable." }, 503);
      }
      let body: Record<string, unknown> = {};
      if (!path.endsWith("/reload")) {
        try {
          body = await this.#readJsonObject(request);
        } catch (error) {
          return this.#json(response, {
            error: error instanceof Error ? error.message : "Invalid request body.",
          }, 400);
        }
      }
      try {
        const profileId = typeof body.profileId === "string" ? body.profileId : "";
        if (path.endsWith("/profile/create")) {
          const name = typeof body.name === "string" ? body.name : "";
          return this.#json(response, this.#dashboardLayoutStore.createProfile(profileId, name));
        }
        if (path.endsWith("/profile/active")) {
          return this.#json(response, this.#dashboardLayoutStore.setActive(profileId));
        }
        if (path.endsWith("/profile/delete")) {
          return this.#json(response, this.#dashboardLayoutStore.deleteProfile(profileId));
        }
        if (path.endsWith("/save")) {
          const variant = body.variant as DashboardLayoutVariant;
          return this.#json(
            response,
            this.#dashboardLayoutStore.saveLayout(
              profileId,
              variant,
              body.layout as DashboardPersistentLayout,
            ),
          );
        }
        if (path.endsWith("/reset")) {
          const variant = body.variant as DashboardLayoutVariant;
          return this.#json(response, this.#dashboardLayoutStore.resetVariant(profileId, variant));
        }
        if (path.endsWith("/reload")) {
          return this.#json(response, this.#dashboardLayoutStore.reload());
        }
        return this.#json(response, { error: "Dashboard layout action is unknown." }, 404);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : String(error),
        }, 400);
      }
    }

    if (method === "GET" && path === "/api/explainability") {
      if (!this.#explainabilityService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Explainability is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#explainabilityService.state());
    }

    if (method === "GET" && path === "/api/template-config") {
      if (!this.#templateConfigurationService) {
        return this.#json(response, {
          status: "unavailable",
          templates: [],
          message: "Template Configuration is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#templateConfigurationService.state());
    }
    if (
      method === "POST" &&
      (path === "/api/template-config/save" ||
        path === "/api/template-config/reset" ||
        path === "/api/template-config/start" ||
        path === "/api/template-config/stop")
    ) {
      if (!this.#templateConfigurationService) {
        return this.#json(response, { error: "Template Configuration is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const templateId = typeof body.templateId === "string" ? body.templateId : "";
      if (!templateId.trim()) {
        return this.#json(response, { error: "Template selection is required." }, 400);
      }
      try {
        if (path.endsWith("/save")) {
          const values = body.values && typeof body.values === "object" && !Array.isArray(body.values)
            ? body.values as Record<string, unknown>
            : {};
          return this.#json(response, this.#templateConfigurationService.save(templateId, values));
        }
        if (path.endsWith("/reset")) {
          return this.#json(response, this.#templateConfigurationService.reset(templateId));
        }
        if (path.endsWith("/start")) {
          return this.#json(response, await this.#templateConfigurationService.start(templateId));
        }
        return this.#json(response, await this.#templateConfigurationService.stop(templateId));
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : String(error),
        }, 400);
      }
    }

    if (method === "GET" && path === "/api/simple-farmer") {
      if (!this.#simpleFarmerService) {
        return this.#json(response, { status: "unavailable", message: "Simple Farmer Template is unavailable." }, 503);
      }
      return this.#json(response, this.#simpleFarmerService.state());
    }
    if (method === "GET" && path === "/api/simple-farmer/options") {
      if (!this.#simpleFarmerService) {
        return this.#json(response, { status: "unavailable", message: "Simple Farmer Template is unavailable.", monsters: [] }, 503);
      }
      return this.#json(response, this.#simpleFarmerService.options());
    }
    if (method === "POST" && path === "/api/simple-farmer/start") {
      if (!this.#simpleFarmerService) {
        return this.#json(response, { error: "Simple Farmer Template is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, { error: error instanceof Error ? error.message : "Invalid request body." }, 400);
      }
      if (
        typeof body.monster !== "string" ||
        !Number.isInteger(body.hpThresholdPercent) ||
        !Number.isInteger(body.mpThresholdPercent) ||
        typeof body.loot !== "boolean" ||
        typeof body.respawn !== "boolean"
      ) {
        return this.#json(response, { error: "Monster, integer HP/MP thresholds, loot, and respawn settings are required." }, 400);
      }
      try {
        return this.#json(response, await this.#simpleFarmerService.start({
          monster: body.monster,
          hpThresholdPercent: body.hpThresholdPercent as number,
          mpThresholdPercent: body.mpThresholdPercent as number,
          loot: body.loot,
          respawn: body.respawn,
        } satisfies SimpleFarmerConfig));
      } catch (error) {
        return this.#json(response, { error: error instanceof Error ? error.message : "Simple Farmer could not start." }, 400);
      }
    }
    if (method === "POST" && path === "/api/simple-farmer/stop") {
      if (!this.#simpleFarmerService) {
        return this.#json(response, { error: "Simple Farmer Template is unavailable." }, 503);
      }
      return this.#json(response, await this.#simpleFarmerService.stop());
    }

    if (method === "GET" && path === "/api/live-test/slice-4-5") {
      if (!this.#slice45LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.5 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice45LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-4-5/start") {
      if (!this.#slice45LiveTestService) {
        return this.#json(response, { error: "Slice 4.5 one-click live-test service is unavailable." }, 503);
      }
      const result = await this.#slice45LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.5 one-click live test",
        result,
        simpleFarmer: this.#simpleFarmerService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-5-1") {
      if (!this.#slice51LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 5.1 heartbeat test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice51LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-5-1/start") {
      if (!this.#slice51LiveTestService) {
        return this.#json(response, { error: "Slice 5.1 heartbeat test service is unavailable." }, 503);
      }
      const result = await this.#slice51LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 5.1 one-click heartbeat test",
        result,
        core: this.#runtime.health(),
        character: this.#characterService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-5-2") {
      if (!this.#slice52LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 5.2 disconnect/reconnect test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice52LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-5-2/start") {
      if (!this.#slice52LiveTestService) {
        return this.#json(response, { error: "Slice 5.2 disconnect/reconnect test service is unavailable." }, 503);
      }
      const result = await this.#slice52LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 5.2 one-click disconnect/reconnect test",
        result,
        character: this.#characterService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-5-3") {
      if (!this.#slice53LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 5.3 death/respawn recovery test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice53LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-5-3/start") {
      if (!this.#slice53LiveTestService) {
        return this.#json(response, {
          error: "Slice 5.3 death/respawn recovery test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice53LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 5.3 one-click death/respawn recovery test",
        result,
        character: this.#characterService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/watchdog") {
      if (!this.#watchdogService) {
        return this.#json(response, { status: "unavailable", message: "Watchdog service is unavailable." }, 503);
      }
      return this.#json(response, this.#watchdogService.state());
    }
    if (method === "POST" && path === "/api/watchdog/reset-budget") {
      if (!this.#watchdogService) {
        return this.#json(response, { error: "Watchdog service is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const component = typeof body.component === "string" ? body.component : "";
      if (!["core", "character", "script"].includes(component)) {
        return this.#json(response, { error: "Watchdog component must be core, character, or script." }, 400);
      }
      return this.#json(response, this.#watchdogService.resetBudget(component as WatchdogComponent));
    }

    if (method === "GET" && path === "/api/live-test/slice-5-4") {
      if (!this.#slice54LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 5.4 watchdog/restart-guard test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice54LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-5-4/start") {
      if (!this.#slice54LiveTestService) {
        return this.#json(response, {
          error: "Slice 5.4 watchdog/restart-guard test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice54LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 5.4 one-click watchdog/restart-guard test",
        result,
        watchdog: this.#watchdogService?.state(),
        character: this.#characterService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/navigation/map-model") {
      if (!this.#mapModelService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Map/geometry model service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#mapModelService.state());
    }
    if (method === "POST" && path === "/api/navigation/map-model/map") {
      if (!this.#mapModelService) {
        return this.#json(response, { error: "Map/geometry model service is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const key = typeof body.key === "string" ? body.key.trim() : "";
      if (!key) return this.#json(response, { error: "Map key is required." }, 400);
      const map = this.#mapModelService.map(key);
      return map
        ? this.#json(response, map)
        : this.#json(response, { error: `Map ${key} is not available in the loaded model.` }, 404);
    }

    if (method === "GET" && path === "/api/navigation/path-planner") {
      if (!this.#pathPlannerService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Simple path planner service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#pathPlannerService.state());
    }
    if (method === "POST" && path === "/api/navigation/plan-route") {
      if (!this.#pathPlannerService) {
        return this.#json(response, {
          error: "Simple path planner service is unavailable.",
        }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Invalid request body.",
        }, 400);
      }
      const from = parsePathLocation(body.from);
      const to = parsePathLocation(body.to);
      if (!from || !to) {
        return this.#json(response, {
          error: "Route planning requires from/to objects with map and finite x/y coordinates.",
        }, 400);
      }
      return this.#json(response, this.#pathPlannerService.plan(from, to));
    }

    if (method === "GET" && path === "/api/navigation/smart-move") {
      if (!this.#smartMoveService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Smart-move compatibility service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#smartMoveService.state());
    }

    if (method === "GET" && path === "/api/live-test/slice-6-4") {
      if (!this.#slice64LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 6.4 movement-debug test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice64LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-6-4/start") {
      if (!this.#slice64LiveTestService) {
        return this.#json(response, {
          error: "Slice 6.4 movement-debug test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice64LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 6.4 one-click movement trail and planned-route test",
        result,
        movementDebug: this.#movementDebugService?.state(),
        pathPlanner: this.#pathPlannerService?.state(),
        mapModel: this.#mapModelService?.state(),
        character: this.#characterService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        actionGateway: this.#actionGateway?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-7-1") {
      if (!this.#slice71LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 7.1 multi-character session test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice71LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-7-1/start") {
      if (!this.#slice71LiveTestService) {
        return this.#json(response, {
          error: "Slice 7.1 multi-character session test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice71LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 7.1 one-click multi-character session-manager test",
        result,
        characterSessions: this.#multiCharacterSessionManager?.state(),
        primaryCharacter: this.#characterService?.state(),
        selection: this.#selectionService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        gameData: this.#gameDataService?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-7-2") {
      if (!this.#slice72LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 7.2 local Character messaging test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice72LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-7-2/start") {
      if (!this.#slice72LiveTestService) {
        return this.#json(response, {
          error: "Slice 7.2 local Character messaging test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice72LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 7.2 one-click local Character messaging test",
        result,
        characterMessaging: this.#localCharacterMessagingService?.state(),
        characterSessions: this.#multiCharacterSessionManager?.state(),
        primaryCharacter: this.#characterService?.state(),
        selection: this.#selectionService?.state(),
        userScriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-7-3") {
      if (!this.#slice73LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 7.3 Party Coordinator test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice73LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-7-3/start") {
      if (!this.#slice73LiveTestService) {
        return this.#json(response, {
          error: "Slice 7.3 Party Coordinator test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice73LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 7.3 one-click Party Coordinator test",
        result,
        partyCoordinator: this.#partyCoordinatorService?.state(),
        characterMessaging: this.#localCharacterMessagingService?.state(),
        characterSessions: this.#multiCharacterSessionManager?.state(),
        primaryCharacter: this.#characterService?.state(),
        selection: this.#selectionService?.state(),
        userScriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }


    if (method === "GET" && path === "/api/live-test/slice-7-4") {
      if (!this.#slice74LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 7.4 Party Templates test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice74LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-7-4/start") {
      if (!this.#slice74LiveTestService) {
        return this.#json(response, {
          error: "Slice 7.4 Party Templates test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice74LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 7.4 one-click Party Templates test",
        result,
        partyTemplates: this.#partyTemplateService?.state(),
        partyCoordinator: this.#partyCoordinatorService?.state(),
        characterMessaging: this.#localCharacterMessagingService?.state(),
        characterSessions: this.#multiCharacterSessionManager?.state(),
        primaryCharacter: this.#characterService?.state(),
        selection: this.#selectionService?.state(),
        userScriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }


    if (method === "GET" && path === "/api/live-test/slice-8-1") {
      if (!this.#slice81LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 8.1 Character Cards test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice81LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-8-1/start") {
      if (!this.#slice81LiveTestService) {
        return this.#json(response, {
          error: "Slice 8.1 Character Cards test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice81LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 8.1 one-click Character Cards test",
        result,
        characterCards: this.#characterCardsService?.state(),
        characterSessions: this.#multiCharacterSessionManager?.state(),
        primaryCharacter: this.#characterService?.state(),
        selection: this.#selectionService?.state(),
        userScriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }


    if (method === "GET" && path === "/api/live-test/slice-8-2") {
      if (!this.#slice82LiveTestService) {
        return this.#json(response, { status: "unavailable", message: "Slice 8.2 Setup Wizard test service is unavailable." }, 503);
      }
      return this.#json(response, this.#slice82LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-8-2/start") {
      if (!this.#slice82LiveTestService) {
        return this.#json(response, { error: "Slice 8.2 Setup Wizard test service is unavailable." }, 503);
      }
      const result = await this.#slice82LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 8.2 one-click Setup Wizard test",
        result,
        setupWizard: this.#setupWizardService?.state(),
        characterCards: this.#characterCardsService?.state(),
        characterSessions: this.#multiCharacterSessionManager?.state(),
        primaryCharacter: this.#characterService?.state(),
        selection: this.#selectionService?.state(),
        account: this.#accountService?.state(),
        userScriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }


    if (method === "GET" && path === "/api/live-test/slice-8-3") {
      if (!this.#slice83LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 8.3 Template Configuration test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice83LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-8-3/start") {
      if (!this.#slice83LiveTestService) {
        return this.#json(response, {
          error: "Slice 8.3 Template Configuration test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice83LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 8.3 one-click Template Configuration test",
        result,
        templateConfiguration: this.#templateConfigurationService?.state(),
        simpleFarmer: this.#simpleFarmerService?.state(),
        primaryCharacter: this.#characterService?.state(),
        userScriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }


    if (method === "GET" && path === "/api/live-test/slice-8-4") {
      if (!this.#slice84LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 8.4 explainability test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice84LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-8-4/start") {
      if (!this.#slice84LiveTestService) {
        return this.#json(response, {
          error: "Slice 8.4 explainability test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice84LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 8.4 one-click explainability test",
        result,
        explainability: this.#explainabilityService?.state(),
        primaryCharacter: this.#characterService?.state(),
        simpleFarmer: this.#simpleFarmerService?.state(),
        actionGateway: this.#actionGateway?.state(),
        userScriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/navigation/movement-debug") {
      if (!this.#movementDebugService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Movement debug telemetry is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#movementDebugService.state());
    }

    if (method === "GET" && path === "/api/live-test/slice-6-1") {
      if (!this.#slice61LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 6.1 map/geometry-model test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice61LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-6-1/start") {
      if (!this.#slice61LiveTestService) {
        return this.#json(response, {
          error: "Slice 6.1 map/geometry-model test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice61LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 6.1 one-click map/geometry-model test",
        result,
        mapModel: this.#mapModelService?.state(),
        character: this.#characterService?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-6-2") {
      if (!this.#slice62LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 6.2 simple path-planner test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice62LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-6-2/start") {
      if (!this.#slice62LiveTestService) {
        return this.#json(response, {
          error: "Slice 6.2 simple path-planner test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice62LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 6.2 one-click simple path-planner test",
        result,
        pathPlanner: this.#pathPlannerService?.state(),
        mapModel: this.#mapModelService?.state(),
        character: this.#characterService?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-6-3") {
      if (!this.#slice63LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 6.3 smart_move() compatibility test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice63LiveTestService.state());
    }
    if (method === "POST" && path === "/api/live-test/slice-6-3/start") {
      if (!this.#slice63LiveTestService) {
        return this.#json(response, {
          error: "Slice 6.3 smart_move() compatibility test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice63LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 6.3 one-click smart_move compatibility test",
        result,
        smartMove: this.#smartMoveService?.state(),
        pathPlanner: this.#pathPlannerService?.state(),
        mapModel: this.#mapModelService?.state(),
        character: this.#characterService?.state(),
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/diagnostics/snapshot") {
      if (!this.#diagnostics) return this.#json(response, { error: "Diagnostics service is unavailable." }, 503);
      return this.#json(response, this.#diagnostics.snapshot());
    }
    if (method === "GET" && path === "/api/diagnostics/package") {
      if (!this.#diagnostics) return this.#json(response, { error: "Diagnostics service is unavailable." }, 503);
      const diagnosticPackage = this.#diagnostics.package();
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${diagnosticPackage.fileName}"`,
        "Cache-Control": "no-store",
      });
      response.end(diagnosticPackage.content);
      return;
    }

    if (method === "GET" && path === "/api/renderer/handoff") {
      if (!this.#rendererHandoffService) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#rendererHandoffService.state());
    }

    if (method === "GET" && path === "/api/renderer/snapshot") {
      if (!this.#rendererBridge) {
        return this.#json(response, { error: "Renderer bridge is unavailable." }, 503);
      }
      return this.#json(response, {
        bridge: this.#rendererBridge.state(),
        snapshot: this.#rendererBridge.snapshot(),
      });
    }
    if (method === "GET" && path === "/api/renderer/stream") {
      if (!this.#rendererBridge) {
        return this.#json(response, { error: "Renderer bridge is unavailable." }, 503);
      }
      const rendererId = rendererClientId(pathWithQuery);
      if (rendererId && this.#rendererHandoffService) {
        this.#rendererHandoffService.attach(rendererId);
      }
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.write(": renderer connected\n\n");
      let unsubscribe: (() => void) | undefined;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        unsubscribe?.();
        unsubscribe = undefined;
        if (rendererId && this.#rendererHandoffService) {
          this.#rendererHandoffService.detach(rendererId);
        }
        this.#rendererUnsubscribes.delete(release);
      };
      unsubscribe = this.#rendererBridge.subscribe((event) => {
        if (response.writableEnded) return;
        response.write(
          `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      });
      this.#rendererUnsubscribes.add(release);
      response.on("close", release);
      return;
    }

    if (method === "GET" && path === "/api/status") {
      return this.#json(response, this.#runtime.health());
    }
    if (method === "GET" && path === "/api/game-data") {
      if (!this.#gameDataService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#gameDataService.state());
    }
    if (method === "POST" && path === "/api/game-data/reload") {
      if (!this.#gameDataService) return this.#json(response, { error: "Game data service is unavailable." }, 503);
      return this.#runGameDataAction(response, () => this.#gameDataService!.loadNow(true));
    }

    if (method === "GET" && path === "/api/game-version") {
      if (!this.#gameVersionService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#gameVersionService.state());
    }
    if (method === "POST" && path === "/api/game-version/check") {
      if (!this.#gameVersionService) return this.#json(response, { error: "Game version service is unavailable." }, 503);
      return this.#runGameVersionAction(response, () => this.#gameVersionService!.checkNow(true));
    }

    if (method === "GET" && path === "/api/update") {
      if (!this.#updateService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#updateService.state());
    }
    if (method === "POST" && path === "/api/update/check") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.checkNow(true));
    }
    if (method === "POST" && path === "/api/update/skip") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.skipVersion());
    }
    if (method === "POST" && path === "/api/update/remind") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.remindTomorrow());
    }
    if (method === "POST" && path === "/api/update/install") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.installUpdate());
    }

    if (method === "GET" && path === "/api/logs") {
      return this.#json(response, { records: this.#logger.records() });
    }
    if (method === "GET" && path === "/api/logs/export") {
      return this.#json(response, this.#exportPayload());
    }
    if (method === "POST" && path === "/api/logs/clear") {
      this.#logger.clearBuffer();
      this.#broadcastEvent("clear", { ok: true });
      return this.#json(response, { ok: true });
    }
    if (method === "GET" && path === "/api/logs/stream") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");
      for (const record of this.#logger.records()) {
        response.write(this.#event("log", record));
      }
      this.#clients.add(response);
      response.on("close", () => this.#clients.delete(response));
      return;
    }

    if (method !== "GET") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed.");
      return;
    }

    const assets: Readonly<Record<string, string>> = {
      "/": "index.html",
      "/index.html": "index.html",
      "/styles.css": "styles.css",
      "/app.js": "app.js",
      "/browser-view": "browser-view.html",
      "/browser-view.html": "browser-view.html",
      "/browser-view.js": "browser-view.js",
      "/graphics-profiles.js": "graphics-profiles.js",
      "/dashboard-editor.js": "editor.js",
      "/dashboard-layout-transfer.js": "layout-transfer.js",
    };
    const assetName = assets[path];
    if (!assetName) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    const assetUrl = new URL(`../../dashboard/${assetName}`, import.meta.url);
    const filePath = fileURLToPath(assetUrl);
    if (!existsSync(filePath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    createReadStream(filePath).pipe(response);
  }

  async #runSelectionAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runCharacterAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runCharacterSessionAction(
    response: ServerResponse,
    action: () => unknown | Promise<unknown>,
  ): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : undefined;
      const statusCode = code === "SESSION_LIMIT_REACHED" ||
          code === "SESSION_CHARACTER_ALREADY_ACTIVE" ||
          code === "SESSION_CHARACTER_ALREADY_ONLINE"
        ? 409
        : 400;
      this.#json(response, { error: message, errorCode: code }, statusCode);
    }
  }

  async #runGameDataAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runGameVersionAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runUpdateAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runPackageImportAction(
    response: ServerResponse,
    action: () => unknown | Promise<unknown>,
  ): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : undefined;
      this.#json(response, { error: message, errorCode }, 400);
    }
  }

  async #readJsonObject(request: IncomingMessage, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        throw new Error("Request body is too large.");
      }
      chunks.push(buffer);
    }

    if (bytes === 0) return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("Request body must be valid JSON.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  }

  #json(response: ServerResponse, payload: unknown, statusCode = 200): void {
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(payload));
  }

  #broadcast(record: LogRecord): void {
    const event = this.#event("log", record);
    for (const client of this.#clients) client.write(event);
  }

  #broadcastEvent(name: string, payload: unknown): void {
    const event = this.#event(name, payload);
    for (const client of this.#clients) client.write(event);
  }

  #event(name: string, payload: unknown): string {
    return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  #exportPayload(): {
    readonly text: string;
    readonly lineCount: number;
    readonly from: string;
    readonly to: string;
    readonly sanitized: true;
  } {
    const records = this.#logger.records();
    const health: HealthSnapshot = this.#runtime.health();
    const from = records.at(0)?.timestamp ?? "n/a";
    const to = records.at(-1)?.timestamp ?? "n/a";
    const header = [
      "ALRemastered Diagnostic Log",
      `Client version: ${health.version}`,
      `Platform: ${health.platform}`,
      `Log lines: ${records.length}`,
      `Time range: ${from} -> ${to}`,
      "Secrets sanitized: yes",
      "",
    ].join("\n");

    return {
      text: `${header}${records.map((record) => JSON.stringify(record)).join("\n")}`,
      lineCount: records.length,
      from,
      to,
      sanitized: true,
    };
  }
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    default: return "application/octet-stream";
  }
}


function gatewayStatusCode(result: ActionGatewayResult): number {
  switch (result.outcome) {
    case "success": return 200;
    case "rate_limited": return 429;
    case "timeout": return 504;
    case "error": return 400;
  }
}

function parsePathLocation(
  value: unknown,
): { readonly map: string; readonly x: number; readonly y: number } | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.map !== "string" ||
    !record.map.trim() ||
    typeof record.x !== "number" ||
    !Number.isFinite(record.x) ||
    typeof record.y !== "number" ||
    !Number.isFinite(record.y)
  ) {
    return undefined;
  }
  return {
    map: record.map.trim(),
    x: record.x,
    y: record.y,
  };
}

function parseOptionalPositiveInteger(
  value: string | null,
  name: string,
): number | null | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function rendererClientId(pathWithQuery: string): string | undefined {
  try {
    const url = new URL(pathWithQuery, "http://127.0.0.1");
    const clientId = url.searchParams.get("clientId")?.trim();
    if (!clientId || clientId.length > 160) return undefined;
    return clientId;
  } catch {
    return undefined;
  }
}

function parseMovementMode(value: unknown): MovementMode | undefined {
  return value === "move" || value === "xmove" ? value : undefined;
}

function parseMovementDirection(
  value: unknown,
): MovementDirection | undefined {
  return value === "left" ||
      value === "right" ||
      value === "up" ||
      value === "down"
    ? value
    : undefined;
}
