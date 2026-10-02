import { join } from "node:path";
import { CoreRuntime } from "./core/app.ts";
import { openDashboard } from "./dashboard/open.ts";
import { DashboardServer } from "./dashboard/server.ts";
import { DiagnosticsService } from "./diagnostics/service.ts";
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
  diagnostics.dispose();
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

dashboard = new DashboardServer({
  logger,
  runtime,
  updateService,
  diagnostics,
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

process.stdout.write(`ALRemastered ${getAppVersion()}\n`);
process.stdout.write("Core is running.\n");
process.stdout.write(`Dashboard: ${dashboardUrl}\n`);
process.stdout.write("Press Ctrl+C to stop.\n");

if (!args.has("--no-open-dashboard")) {
  openDashboard(dashboardUrl, logger);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
