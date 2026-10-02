import { join } from "node:path";
import { AdventureLandAccountService } from "./account/service.ts";
import { AdventureLandAccountSource } from "./account/source.ts";
import { AdventureLandSelectionService } from "./account/selection-service.ts";
import { AdventureLandSelectionSource } from "./account/selection-source.ts";
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
import { getUserPaths } from "./platform/paths.ts";
import { getReleaseMetadata } from "./release/version-model.ts";
import {
  dashboardUpdateInstallerArguments,
  scheduleInstallerAfterCurrentProcess,
} from "./update/installer-launcher.ts";
import { UpdatePreferenceStore } from "./update/preferences.ts";
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

  updateService?.stop();
  gameVersionService?.stop();
  gameDataService?.stop();

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

diagnostics.registerComponent("selection", () => {
  const state = selectionService!.state();
  return {
    name: "selection",
    status: state.status === "error" ? "degraded" : "healthy",
    message: state.message,
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
  scheduleInstaller: (installerPath) =>
    scheduleInstallerAfterCurrentProcess(
      installerPath,
      logger,
      process.platform,
      process.pid,
      dashboardUpdateInstallerArguments(process.platform, process.pid),
    ),
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

dashboard = new DashboardServer({
  logger,
  runtime,
  accountService,
  selectionService,
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
