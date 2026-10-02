import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const child = spawn(process.execPath, ["build/package/src/main.js"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

await delay(750);

if (child.exitCode !== null) {
  process.stderr.write(`Client exited unexpectedly with code ${child.exitCode}.\n`);
  process.stderr.write(stdout);
  process.stderr.write(stderr);
  process.exit(1);
}

if (!stdout.includes("Core is running.")) {
  child.kill();
  process.stderr.write("Client did not report a running core.\n");
  process.stderr.write(stdout);
  process.stderr.write(stderr);
  process.exit(1);
}

child.kill();
await once(child, "exit");

process.stdout.write("Normal client process remained running until explicitly stopped.\n");
