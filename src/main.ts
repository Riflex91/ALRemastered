import { join } from "node:path";
import { CoreRuntime } from "./core/app.ts";
import { openDashboard } from "./dashboard/open.ts";
import { DashboardServer } from "./dashboard/server.ts";
import { Logger } from "./logging/logger.ts";
import { getUserPaths } from "./platform/paths.ts";
import { getReleaseMetadata } from "./release/version-model.ts";
import { scheduleInstallerAfterCurrentProcess } from "./update/installer-launcher.ts";
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
runtime.start();
logger.info("Core started.", runtime.health());

if (args.has("--health-check")) {
  logger.info("Health check completed.", runtime.health());
  process.stdout.write(`${JSON.stringify(runtime.health())}\n`);
  runtime.stop();
  logger.info("Core stopped after health check.");
  process.exit(0);
}

let shuttingDown = false;
let dashboard: DashboardServer | undefined;
let updateService: UpdateService | undefined;
const keepAlive = setInterval(() => undefined, 60_000);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(keepAlive);

  process.stdout.write(`Received ${signal}. Stopping ALRemastered.\n`);
  logger.info("Shutdown requested.", { signal });

  updateService?.stop();

  if (dashboard) {
    try {
      await dashboard.stop();
    } catch (error) {
      logger.error("Dashboard server failed to stop cleanly.", error);
    }
  }

  runtime.stop();
  logger.info("Core stopped.");
  process.exit(0);
}

const source = new GitHubReleaseSource(logger);
const preferences = new UpdatePreferenceStore(join(userPaths.configDir, "update-preferences.json"));
updateService = new UpdateService({
  currentVersion: getAppVersion(),
  logger,
  source,
  preferences,
  updatesDir: join(userPaths.dataDir, "updates"),
  scheduleInstaller: (installerPath) => scheduleInstallerAfterCurrentProcess(installerPath, logger),
  onInstallScheduled: () => {
    setTimeout(() => void shutdown("SIGTERM"), 1500);
  },
});

dashboard = new DashboardServer({
  logger,
  runtime,
  updateService,
  host: "127.0.0.1",
  port: 3210,
});

let dashboardUrl: string;
try {
  dashboardUrl = await dashboard.start();
} catch (error) {
  stopAfterUnexpectedError("Dashboard server failed to start.", error);
}

if (!args.has("--no-update-check")) {
  updateService.start();
} else {
  logger.debug("Automatic update check disabled for this process.");
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
