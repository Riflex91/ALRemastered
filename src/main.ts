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
process.stdout.write("Core started. Press Ctrl+C to stop.\n");

function shutdown(signal: NodeJS.Signals): void {
  process.stdout.write(`Received ${signal}. Stopping ALRemastered.\n`);
  runtime.stop();
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

await new Promise<void>(() => undefined);
