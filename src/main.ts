import { CoreRuntime } from "./core/app.ts";
import { getAppVersion } from "./version.ts";

const args = new Set(process.argv.slice(2));

if (args.has("--version")) {
  process.stdout.write(`${getAppVersion()}\n`);
  process.exit(0);
}

const runtime = new CoreRuntime();
runtime.start();

if (args.has("--health-check")) {
  process.stdout.write(`${JSON.stringify(runtime.health())}\n`);
  runtime.stop();
  process.exit(0);
}

process.stdout.write(`ALRemastered ${getAppVersion()}\n`);
process.stdout.write("Core is running. Dashboard is not available yet in Slice 0.1.\n");
process.stdout.write("Press Ctrl+C to stop.\n");

const keepAlive = setInterval(() => undefined, 60_000);

function shutdown(signal: NodeJS.Signals): void {
  clearInterval(keepAlive);
  process.stdout.write(`Received ${signal}. Stopping ALRemastered.\n`);
  runtime.stop();
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
