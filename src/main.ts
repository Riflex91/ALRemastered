import { join } from "node:path";
import { AdventureLandAccountService } from "./account/service.ts";
import { AdventureLandAccountSource } from "./account/source.ts";
import { AdventureLandSelectionService } from "./account/selection-service.ts";
import { AdventureLandSelectionSource } from "./account/selection-source.ts";
import { ActionGateway } from "./action/gateway.ts";
import { AdventureLandMovementService } from "./action/movement.ts";
import { AdventureLandAttackService } from "./action/attack.ts";
import { AdventureLandSkillService } from "./action/skill.ts";
import { AdventureLandLootConsumableService } from "./action/loot-consumable.ts";
import { AdventureLandRespawnService } from "./action/respawn.ts";
import { AdventureLandCharacterService } from "./character/service.ts";
import { MultiCharacterSessionManager } from "./character/session-manager.ts";
import { LocalCharacterMessagingService } from "./character/messaging.ts";
import { AdventureLandCharacterTransport } from "./character/transport.ts";
import { CoreRuntime } from "./core/app.ts";
import { openDashboard } from "./dashboard/open.ts";
import { DashboardServer } from "./dashboard/server.ts";
import { DiagnosticsService } from "./diagnostics/service.ts";
import { AdventureLandGameDataCache } from "./game/data-cache.ts";
import { AdventureLandGameDataService } from "./game/data-service.ts";
import { AdventureLandGameDataSource } from "./game/data-source.ts";
import { AdventureLandVersionService } from "./game/version-service.ts";
import { AdventureLandVersionSource } from "./game/version-source.ts";
import { AdventureLandVersionStore } from "./game/version-store.ts";
import { Logger } from "./logging/logger.ts";
import { Slice35LiveTestService } from "./live-test/slice-3-5.ts";
import { Slice41LiveTestService } from "./live-test/slice-4-1.ts";
import { Slice42LiveTestService } from "./live-test/slice-4-2.ts";
import { Slice43LiveTestService } from "./live-test/slice-4-3.ts";
import { Slice44LiveTestService } from "./live-test/slice-4-4.ts";
import { Slice45LiveTestService } from "./live-test/slice-4-5.ts";
import { Slice51LiveTestService } from "./live-test/slice-5-1.ts";
import { Slice52LiveTestService } from "./live-test/slice-5-2.ts";
import { Slice53LiveTestService } from "./live-test/slice-5-3.ts";
import { Slice54LiveTestService } from "./live-test/slice-5-4.ts";
import { Slice61LiveTestService } from "./live-test/slice-6-1.ts";
import { Slice62LiveTestService } from "./live-test/slice-6-2.ts";
import { Slice63LiveTestService } from "./live-test/slice-6-3.ts";
import { Slice64LiveTestService } from "./live-test/slice-6-4.ts";
import { Slice71LiveTestService } from "./live-test/slice-7-1.ts";
import { Slice72LiveTestService } from "./live-test/slice-7-2.ts";
import { getUserPaths } from "./platform/paths.ts";
import { AdventureLandScriptApiBridge } from "./script/adventure-api.ts";
import { ScriptRuntimeService } from "./script/runtime.ts";
import { SimpleFarmerTemplateService } from "./script/simple-farmer.ts";
import { ScriptStorageStore } from "./script/storage.ts";
import { getReleaseMetadata } from "./release/version-model.ts";
import { AdventureLandMapModelService } from "./navigation/map-model.ts";
import { MovementDebugService } from "./navigation/movement-debug.ts";
import { SimplePathPlannerService } from "./navigation/path-planner.ts";
import { SmartMoveService } from "./navigation/smart-move.ts";
import { WatchdogService } from "./recovery/watchdog.ts";
import {
  dashboardUpdateInstallerArguments,
  scheduleInstallerAfterCurrentProcess,
} from "./update/installer-launcher.ts";
import { UpdatePreferenceStore } from "./update/preferences.ts";
import {
  decodeUpdateSessionHandoff,
  encodeUpdateSessionHandoff,
  UPDATE_SESSION_HANDOFF_ENV,
} from "./update/session-handoff.ts";
import { UpdateService } from "./update/service.ts";
import { GitHubReleaseSource } from "./update/source.ts";
import { getAppVersion } from "./version.ts";

const args = new Set(process.argv.slice(2));

if (args.has("--version")) {
  process.stdout.write(`${getAppVersion()}\n`);
  process.exit(0);
}

if (args.has("--release-info")) {
  process.stdout.write(`${JSON.stringify(getReleaseMetadata())}\n`);
  process.exit(0);
}

if (args.has("--paths")) {
  process.stdout.write(`${JSON.stringify(getUserPaths())}\n`);
  process.exit(0);
}

const userPaths = getUserPaths();
const logger = new Logger({
  component: "core",
  logFile: join(userPaths.logsDir, "client.log"),
});

const updateSessionHandoffRaw = process.env[UPDATE_SESSION_HANDOFF_ENV];
delete process.env[UPDATE_SESSION_HANDOFF_ENV];
const updateSessionHandoff = args.has("--post-update")
  ? decodeUpdateSessionHandoff(updateSessionHandoffRaw)
  : undefined;
if (args.has("--post-update")) {
  logger.info("Update restart session handoff status.", {
    present: Boolean(updateSessionHandoffRaw),
    decoded: Boolean(updateSessionHandoff),
    consumed: true,
    secretPersisted: false,
  });
}
if (args.has("--post-update") && updateSessionHandoffRaw && !updateSessionHandoff) {
  logger.warn("Update session handoff was invalid and was discarded.", {
    secretPersisted: false,
  });
}

function stopAfterUnexpectedError(message: string, error: unknown): never {
  logger.fatal(message, error);
  process.stderr.write("ALRemastered stopped because of an unexpected error. See client.log for details.\n");
  process.exit(1);
}

process.on("uncaughtException", (error) => stopAfterUnexpectedError("Uncaught exception.", error));
process.on("unhandledRejection", (reason) => stopAfterUnexpectedError("Unhandled promise rejection.", reason));

const runtime = new CoreRuntime();
logger.info("ALRemastered starting.", {
  version: getAppVersion(),
  releaseChannel: getReleaseMetadata().channel,
  platform: process.platform,
});
if (args.has("--post-update")) {
  logger.info("ALRemastered restarted automatically after update.");
}
if (args.has("--post-update-rollback")) {
  logger.warn("ALRemastered restarted automatically after update rollback.");
}
runtime.start();
logger.info("Core started.", runtime.health());

const diagnostics = new DiagnosticsService(logger, () => runtime.health());
diagnostics.registerComponent("core", () => ({
  name: "core",
  status: runtime.status === "running" ? "healthy" : "degraded",
  message: runtime.status === "running" ? "Core runtime is running." : `Core runtime status is ${runtime.status}.`,
}));

if (args.has("--health-check")) {
  logger.info("Health check completed.", runtime.health());
  process.stdout.write(`${JSON.stringify(runtime.health())}\n`);
  runtime.stop();
  logger.info("Core stopped after health check.");
  process.exit(0);
}

let shuttingDown = false;
let dashboard: DashboardServer | undefined;
let accountService: AdventureLandAccountService | undefined;
let selectionService: AdventureLandSelectionService | undefined;
let characterService: AdventureLandCharacterService | undefined;
let multiCharacterSessionManager: MultiCharacterSessionManager | undefined;
let localCharacterMessagingService: LocalCharacterMessagingService | undefined;
let actionGateway: ActionGateway | undefined;
let movementService: AdventureLandMovementService | undefined;
let attackService: AdventureLandAttackService | undefined;
let skillService: AdventureLandSkillService | undefined;
let lootConsumableService: AdventureLandLootConsumableService | undefined;
let respawnService: AdventureLandRespawnService | undefined;
let simpleFarmerService: SimpleFarmerTemplateService | undefined;
let slice35LiveTestService: Slice35LiveTestService | undefined;
let scriptRuntime: ScriptRuntimeService | undefined;
let slice41LiveTestService: Slice41LiveTestService | undefined;
let slice42LiveTestService: Slice42LiveTestService | undefined;
let slice43LiveTestService: Slice43LiveTestService | undefined;
let slice44LiveTestService: Slice44LiveTestService | undefined;
let slice45LiveTestService: Slice45LiveTestService | undefined;
let slice51LiveTestService: Slice51LiveTestService | undefined;
let slice52LiveTestService: Slice52LiveTestService | undefined;
let slice53LiveTestService: Slice53LiveTestService | undefined;
let slice54LiveTestService: Slice54LiveTestService | undefined;
let slice61LiveTestService: Slice61LiveTestService | undefined;
let slice62LiveTestService: Slice62LiveTestService | undefined;
let slice63LiveTestService: Slice63LiveTestService | undefined;
let slice64LiveTestService: Slice64LiveTestService | undefined;
let slice71LiveTestService: Slice71LiveTestService | undefined;
let slice72LiveTestService: Slice72LiveTestService | undefined;
let mapModelService: AdventureLandMapModelService | undefined;
let movementDebugService: MovementDebugService | undefined;
let pathPlannerService: SimplePathPlannerService | undefined;
let smartMoveService: SmartMoveService | undefined;
let watchdogService: WatchdogService | undefined;
let updateService: UpdateService | undefined;
let gameVersionService: AdventureLandVersionService | undefined;
let gameDataService: AdventureLandGameDataService | undefined;
const keepAlive = setInterval(() => undefined, 60_000);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(keepAlive);

  process.stdout.write(`Received ${signal}. Stopping ALRemastered.\n`);
  logger.info("Shutdown requested.", { signal });

  watchdogService?.stop();
  updateService?.stop();
  gameVersionService?.stop();
  gameDataService?.stop();

  if (scriptRuntime) {
    try {
      await scriptRuntime.dispose();
    } catch (error) {
      logger.error("Script runtime failed to stop cleanly.", error);
    }
  }

  if (multiCharacterSessionManager) {
    try {
      await multiCharacterSessionManager.stopAll("shutdown");
    } catch (error) {
      logger.error("Managed Character sessions failed to stop cleanly.", error);
    }
  }

  if (characterService) {
    try {
      await characterService.stop("shutdown");
    } catch (error) {
      logger.error("Headless character connection failed to stop cleanly.", error);
    }
  }

  if (dashboard) {
    try {
      await dashboard.stop();
    } catch (error) {
      logger.error("Dashboard server failed to stop cleanly.", error);
    }
  }

  runtime.stop();
  logger.info("Core stopped.");
  diagnostics.dispose();
  process.exit(0);
}

accountService = new AdventureLandAccountService({
  logger,
  source: new AdventureLandAccountSource(),
});

if (updateSessionHandoff) {
  accountService.restoreSession(updateSessionHandoff.session);
}

diagnostics.registerComponent("account", () => {
  const state = accountService!.state();
  return {
    name: "account",
    status: state.status === "error" ? "degraded" : "healthy",
    message: state.message,
  };
});

selectionService = new AdventureLandSelectionService({
  logger,
  source: new AdventureLandSelectionSource(),
  session: () => accountService!.session(),
});

if (updateSessionHandoff) {
  const restoredSelection = await selectionService.refresh();
  if (
    restoredSelection.status === "ready" &&
    restoredSelection.servers.some((server) =>
      server.key === updateSessionHandoff.selectedServerKey
    )
  ) {
    selectionService.selectServer(updateSessionHandoff.selectedServerKey);
  } else {
    logger.warn("Update session handoff could not restore the selected server.", {
      serverKey: updateSessionHandoff.selectedServerKey,
      selectionStatus: restoredSelection.status,
      secretPersisted: false,
    });
  }
}

diagnostics.registerComponent("selection", () => {
  const state = selectionService!.state();
  return {
    name: "selection",
    status: state.status === "error" ? "degraded" : "healthy",
    message: state.message,
  };
});

characterService = new AdventureLandCharacterService({
  logger,
  transport: new AdventureLandCharacterTransport(),
  selection: selectionService,
  session: () => accountService!.session(),
});

if (
  updateSessionHandoff &&
  selectionService.state().selectedServerKey ===
    updateSessionHandoff.selectedServerKey
) {
  try {
    const restoredCharacter = await characterService.start(
      updateSessionHandoff.characterId,
    );
    if (restoredCharacter.status !== "connected") {
      logger.warn("Update session handoff could not restore the headless character.", {
        characterId: updateSessionHandoff.characterId,
        status: restoredCharacter.status,
        errorCode: restoredCharacter.errorCode,
        secretPersisted: false,
      });
    } else {
      logger.info("Update session handoff restored the headless character.", {
        characterId: restoredCharacter.characterId,
        serverKey: restoredCharacter.serverKey,
        secretPersisted: false,
      });
    }
  } catch (error) {
    logger.warn("Update session handoff character restore failed.", {
      characterId: updateSessionHandoff.characterId,
      error: error instanceof Error ? error.message : String(error),
      secretPersisted: false,
    });
  }
}

diagnostics.registerComponent("character-connection", () => {
  const state = characterService!.state();
  return {
    name: "character-connection",
    status: state.status === "error" ? "degraded" : "healthy",
    message: state.message,
  };
});

actionGateway = new ActionGateway({ logger });
diagnostics.registerComponent("action-gateway", () => {
  const state = actionGateway!.state();
  return {
    name: "action-gateway",
    status: "healthy",
    message: `Action gateway ready. ${state.totalRequests} requests handled; ${state.active} active.`,
  };
});

const source = new GitHubReleaseSource(logger);
const preferences = new UpdatePreferenceStore(join(userPaths.configDir, "update-preferences.json"));
updateService = new UpdateService({
  currentVersion: getAppVersion(),
  logger,
  source,
  preferences,
  updatesDir: join(userPaths.dataDir, "updates"),
  scheduleInstaller: (installerPath) => {
    const selection = selectionService!.state();
    const character = characterService!.state();
    const handoff = encodeUpdateSessionHandoff(
      accountService!.session(),
      selection.selectedServerKey,
      character.status === "connected" ? character.characterId : undefined,
    );
    if (handoff) {
      logger.info("Prepared ephemeral session handoff for update restart.", {
        accountConnected: true,
        serverKey: selection.selectedServerKey,
        characterId: character.characterId,
        secretPersisted: false,
      });
    } else {
      logger.info("No complete session handoff was available for update restart.", {
        accountConnected: accountService!.state().status === "connected",
        serverSelected: Boolean(selection.selectedServerKey),
        characterConnected: character.status === "connected",
        secretPersisted: false,
      });
    }

    return scheduleInstallerAfterCurrentProcess(
      installerPath,
      logger,
      process.platform,
      process.pid,
      dashboardUpdateInstallerArguments(process.platform, process.pid),
      handoff
        ? {
          ...process.env,
          [UPDATE_SESSION_HANDOFF_ENV]: handoff,
        }
        : process.env,
    );
  },
  onInstallScheduled: () => {
    setTimeout(() => void shutdown("SIGTERM"), 1500);
  },
});

diagnostics.registerComponent("updater", () => {
  const state = updateService!.state();
  return {
    name: "updater",
    status: state.status === "error" ? "degraded" : "healthy",
    message: state.status === "error"
      ? "Updater reported an error. Open Recent errors for details."
      : "Updater is operational.",
  };
});

const liveGameDataSource = new AdventureLandGameDataSource();
const gameVersionStore = new AdventureLandVersionStore(
  join(userPaths.dataDir, "game", "version.json"),
);

gameVersionService = new AdventureLandVersionService({
  logger,
  source: new AdventureLandVersionSource(liveGameDataSource),
  store: gameVersionStore,
});

diagnostics.registerComponent("game-version", () => {
  const state = gameVersionService!.state();
  return {
    name: "game-version",
    status: state.status === "error" ? "degraded" : "healthy",
    message: state.message ?? "Adventure Land game version status is available.",
  };
});

gameDataService = new AdventureLandGameDataService({
  logger,
  source: liveGameDataSource,
  cache: new AdventureLandGameDataCache(join(userPaths.dataDir, "game", "cache")),
  expectedVersion: () => gameVersionStore.load()?.version,
});
multiCharacterSessionManager = new MultiCharacterSessionManager({
  logger,
  primary: characterService!,
  selection: selectionService!,
  createSession: (serverKey) =>
    new AdventureLandCharacterService({
      logger,
      transport: new AdventureLandCharacterTransport(),
      selection: {
        state: () => ({
          ...selectionService!.state(),
          selectedServerKey: serverKey,
        }),
      },
      session: () => accountService!.session(),
    }),
  sharedGameDataVersion: () => gameDataService!.state().version,
});
diagnostics.registerComponent("character-sessions", () => {
  const state = multiCharacterSessionManager!.state();
  return {
    name: "character-sessions",
    status: state.status === "degraded" ? "degraded" : "healthy",
    message: state.message,
  };
});
localCharacterMessagingService = new LocalCharacterMessagingService({
  logger,
  sessions: multiCharacterSessionManager!,
});
diagnostics.registerComponent("character-messaging", () => {
  const state = localCharacterMessagingService!.state();
  return {
    name: "character-messaging",
    status: "healthy",
    message: state.message,
  };
});
mapModelService = new AdventureLandMapModelService({
  logger,
  gameData: () => gameDataService!.data(),
});
movementDebugService = new MovementDebugService();
pathPlannerService = new SimplePathPlannerService({
  logger,
  mapModel: mapModelService,
  onPlan: (plan) => movementDebugService!.recordPlan(plan),
});

diagnostics.registerComponent("path-planner", () => {
  const state = pathPlannerService!.state();
  return {
    name: "path-planner",
    status: state.status === "ready" ? "healthy" : "healthy",
    message: state.message,
  };
});

diagnostics.registerComponent("map-model", () => {
  const state = mapModelService!.state();
  return {
    name: "map-model",
    status:
      state.status === "ready" && state.blockingInvalidTransitionCount === 0
        ? "healthy"
        : state.status === "unavailable"
          ? "healthy"
          : "degraded",
    message: state.message,
  };
});

diagnostics.registerComponent("game-data", () => {
  const state = gameDataService!.state();
  const gameVersion = gameVersionService!.state().currentVersion;
  const versionMismatch =
    state.version !== undefined &&
    gameVersion !== undefined &&
    state.version !== gameVersion;

  const cacheError = state.cacheStatus === "error";

  return {
    name: "game-data",
    status: state.status === "error" || versionMismatch || cacheError ? "degraded" : "healthy",
    message: versionMismatch
      ? `Loaded game data version ${state.version} does not match detected Adventure Land version ${gameVersion}.`
      : cacheError
        ? state.cacheMessage ?? "Adventure Land game data cache reported an error."
        : state.message ?? "Adventure Land game data status is available.",
  };
});

movementService = new AdventureLandMovementService({
  gateway: actionGateway!,
  character: characterService!,
  gameData: () => gameDataService!.data(),
  onConfirmedMovement: (event) => movementDebugService!.recordMovement(event),
});
smartMoveService = new SmartMoveService({
  logger,
  character: characterService!,
  mapModel: mapModelService!,
  planner: pathPlannerService!,
  movement: movementService!,
});
diagnostics.registerComponent("movement-debug", () => {
  const state = movementDebugService!.state();
  return {
    name: "movement-debug",
    status: "healthy",
    message:
      `Movement debug ready. ${state.trailPointCount} trail points and ${state.plannedRouteCount} planned routes observed.`,
  };
});

diagnostics.registerComponent("smart-move", () => {
  const state = smartMoveService!.state();
  return {
    name: "smart-move",
    status: state.status === "ready" ? "healthy" : "healthy",
    message: state.message,
  };
});
attackService = new AdventureLandAttackService({
  gateway: actionGateway!,
  logger,
  character: characterService!,
});
skillService = new AdventureLandSkillService({
  gateway: actionGateway!,
  logger,
  character: characterService!,
  gameData: () => gameDataService!.data(),
});
lootConsumableService = new AdventureLandLootConsumableService({
  gateway: actionGateway!,
  logger,
  character: characterService!,
  gameData: () => gameDataService!.data(),
});
respawnService = new AdventureLandRespawnService({
  gateway: actionGateway!,
  logger,
  character: characterService!,
});
slice35LiveTestService = new Slice35LiveTestService({
  logger,
  character: characterService!,
  attack: attackService!,
  movement: movementService!,
  skill: skillService!,
  lootConsumable: lootConsumableService,
  gameData: () => gameDataService!.data(),
});

const scriptApiBridge = new AdventureLandScriptApiBridge({
  character: characterService!,
  movement: movementService!,
  smartMove: smartMoveService!,
  attack: attackService!,
  lootConsumable: lootConsumableService,
  respawn: respawnService,
  messaging: localCharacterMessagingService,
  gameData: () => gameDataService!.data(),
});
const scriptStorage = new ScriptStorageStore(
  join(userPaths.dataDir, "scripts", "storage"),
  logger,
);
scriptRuntime = new ScriptRuntimeService({
  logger,
  api: scriptApiBridge,
  storage: scriptStorage,
});
simpleFarmerService = new SimpleFarmerTemplateService({
  character: characterService!,
  runtime: scriptRuntime,
});
slice41LiveTestService = new Slice41LiveTestService({
  logger,
  runtime: scriptRuntime,
});
slice42LiveTestService = new Slice42LiveTestService({
  logger,
  runtime: scriptRuntime,
  character: characterService!,
  gameData: () => gameDataService!.data(),
});
slice43LiveTestService = new Slice43LiveTestService({
  logger,
  runtime: scriptRuntime,
  character: characterService!,
});
slice44LiveTestService = new Slice44LiveTestService({
  logger,
  runtime: scriptRuntime,
  storage: scriptStorage,
});
slice45LiveTestService = new Slice45LiveTestService({
  logger,
  runtime: scriptRuntime,
  farmer: simpleFarmerService,
  character: characterService!,
  movement: movementService!,
  gameData: () => gameDataService!.data(),
});
slice51LiveTestService = new Slice51LiveTestService({
  logger,
  core: runtime,
  character: characterService!,
  script: scriptRuntime,
});
slice52LiveTestService = new Slice52LiveTestService({
  logger,
  character: characterService!,
  script: scriptRuntime,
});
slice53LiveTestService = new Slice53LiveTestService({
  logger,
  character: characterService!,
  script: scriptRuntime,
});
watchdogService = new WatchdogService({
  logger,
  core: runtime,
  character: characterService!,
  script: scriptRuntime,
});
slice54LiveTestService = new Slice54LiveTestService({
  logger,
  watchdog: watchdogService,
  character: characterService!,
  script: scriptRuntime,
});
slice61LiveTestService = new Slice61LiveTestService({
  logger,
  gameData: gameDataService!,
  mapModel: mapModelService!,
  character: characterService!,
});
slice62LiveTestService = new Slice62LiveTestService({
  logger,
  gameData: gameDataService!,
  mapModel: mapModelService!,
  planner: pathPlannerService!,
  character: characterService!,
});
slice63LiveTestService = new Slice63LiveTestService({
  logger,
  runtime: scriptRuntime!,
  character: characterService!,
  smartMove: smartMoveService!,
});
slice64LiveTestService = new Slice64LiveTestService({
  logger,
  runtime: scriptRuntime!,
  character: characterService!,
  mapModel: mapModelService!,
  planner: pathPlannerService!,
  movement: movementService!,
  movementDebug: movementDebugService!,
});
slice71LiveTestService = new Slice71LiveTestService({
  logger,
  runtime: scriptRuntime!,
  primary: characterService!,
  selection: selectionService!,
  sessions: multiCharacterSessionManager!,
  gameData: gameDataService!,
});
slice72LiveTestService = new Slice72LiveTestService({
  logger,
  userRuntime: scriptRuntime!,
  createProbeRuntime: () => new ScriptRuntimeService({
    logger,
    api: scriptApiBridge,
  }),
  primary: characterService!,
  selection: selectionService!,
  sessions: multiCharacterSessionManager!,
  messaging: localCharacterMessagingService!,
});
watchdogService.start();
diagnostics.registerComponent("watchdog", () => {
  const state = watchdogService!.state();
  const blocked = Object.entries(state.components)
    .filter(([, component]) => component.blocked)
    .map(([name]) => name);
  return {
    name: "watchdog",
    status: blocked.length > 0 ? "degraded" : "healthy",
    message: state.message,
  };
});
diagnostics.registerComponent("script-runtime", () => {
  const state = scriptRuntime!.state();
  return {
    name: "script-runtime",
    status: state.status === "crashed" ? "degraded" : "healthy",
    message: state.message,
  };
});

dashboard = new DashboardServer({
  logger,
  runtime,
  accountService,
  selectionService,
  characterService,
  multiCharacterSessionManager,
  localCharacterMessagingService,
  actionGateway,
  movementService,
  attackService,
  skillService,
  lootConsumableService,
  slice35LiveTestService,
  scriptRuntime,
  slice41LiveTestService,
  slice42LiveTestService,
  slice43LiveTestService,
  slice44LiveTestService,
  slice45LiveTestService,
  slice51LiveTestService,
  slice52LiveTestService,
  slice53LiveTestService,
  slice54LiveTestService,
  slice61LiveTestService,
  slice62LiveTestService,
  slice63LiveTestService,
  slice64LiveTestService,
  slice71LiveTestService,
  slice72LiveTestService,
  mapModelService,
  movementDebugService,
  pathPlannerService,
  smartMoveService,
  watchdogService,
  simpleFarmerService,
  updateService,
  diagnostics,
  gameVersionService,
  gameDataService,
  host: "127.0.0.1",
  port: 3210,
});

let dashboardUrl: string;
try {
  dashboardUrl = await dashboard.start();
  diagnostics.registerComponent("dashboard", () => ({
    name: "dashboard",
    status: "healthy",
    message: "Local dashboard server is running.",
  }));
} catch (error) {
  stopAfterUnexpectedError("Dashboard server failed to start.", error);
}

if (args.has("--diagnostic-test-mode")) {
  logger.warn("Diagnostic test mode enabled. Synthetic errors will be generated.");
  logger.error(
    "Update check failed.",
    new Error("Synthetic update-check failure for diagnostic testing."),
    { testMode: true, password: "synthetic-secret-must-be-redacted" },
  );
  logger.error(
    "Dashboard request failed.",
    new Error("Synthetic dashboard failure for diagnostic testing."),
    { testMode: true, route: "/api/diagnostics/test" },
  );
  logger.fatal(
    "Synthetic internal failure.",
    new Error("Synthetic internal stack detail for diagnostic testing."),
    { testMode: true },
  );
}

if (!args.has("--no-update-check")) {
  updateService.start();
} else {
  logger.debug("Automatic update check disabled for this process.");
}

if (!args.has("--no-game-version-check")) {
  gameVersionService.start();
} else {
  logger.debug("Automatic Adventure Land version check disabled for this process.");
}

if (!args.has("--no-game-data-load")) {
  gameDataService.start();
} else {
  logger.debug("Automatic Adventure Land game data load disabled for this process.");
}

process.stdout.write(`ALRemastered ${getAppVersion()}\n`);
process.stdout.write("Core is running.\n");
process.stdout.write(`Dashboard: ${dashboardUrl}\n`);
process.stdout.write("Press Ctrl+C to stop.\n");

if (!args.has("--no-open-dashboard")) {
  openDashboard(dashboardUrl, logger);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
