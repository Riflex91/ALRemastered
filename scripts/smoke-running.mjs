import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const child = spawn(process.execPath, ["build/package/src/main.js", "--no-open-dashboard", "--no-update-check", "--no-game-version-check"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

await delay(1000);

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

const dashboardMatch = stdout.match(/Dashboard: (http:\/\/127\.0\.0\.1:\d+)/);
if (!dashboardMatch) {
  child.kill();
  process.stderr.write("Client did not report the local dashboard URL.\n");
  process.stderr.write(stdout);
  process.exit(1);
}

const dashboardUrl = dashboardMatch[1];
const [statusResponse, pageResponse] = await Promise.all([
  fetch(`${dashboardUrl}/api/status`),
  fetch(dashboardUrl),
]);

if (!statusResponse.ok) {
  child.kill();
  process.stderr.write(`Dashboard status endpoint failed with HTTP ${statusResponse.status}.\n`);
  process.exit(1);
}

const status = await statusResponse.json();
if (status.application !== "ALRemastered" || status.status !== "running") {
  child.kill();
  process.stderr.write("Dashboard status endpoint returned an invalid core state.\n");
  process.exit(1);
}

const page = await pageResponse.text();
if (!pageResponse.ok || !page.includes("Debug Console") || !page.includes("Copy full log")) {
  child.kill();
  process.stderr.write("Dashboard page did not contain the required debug console controls.\n");
  process.exit(1);
}

child.kill();
await once(child, "exit");

process.stdout.write("Normal client and local dashboard remained available until explicitly stopped.\n");
