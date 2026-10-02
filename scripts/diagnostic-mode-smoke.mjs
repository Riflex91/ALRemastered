import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const child = spawn(process.execPath, [
  "build/package/src/main.js",
  "--no-open-dashboard",
  "--no-update-check",
  "--no-game-version-check",
  "--diagnostic-test-mode",
], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

try {
  for (let attempt = 0; attempt < 20 && !stdout.includes("Dashboard: "); attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Client exited unexpectedly with code ${child.exitCode}.\n${stderr}`);
    await delay(100);
  }

  const match = stdout.match(/Dashboard: (http:\/\/127\.0\.0\.1:\d+)/);
  if (!match) throw new Error(`Diagnostic test client did not report a dashboard URL.\n${stdout}\n${stderr}`);

  const url = match[1];
  const snapshotResponse = await fetch(`${url}/api/diagnostics/snapshot`);
  if (!snapshotResponse.ok) throw new Error(`Diagnostic snapshot failed with HTTP ${snapshotResponse.status}.`);
  const snapshot = await snapshotResponse.json();

  if (snapshot.recentErrors.length < 3) throw new Error("Synthetic diagnostics did not produce three recent errors.");
  if (!snapshot.recentErrors.some((entry) => /could not check for updates/i.test(entry.summary))) {
    throw new Error("Synthetic update failure did not receive an understandable summary.");
  }
  if (!snapshot.recentErrors.some((entry) => entry.technical?.error?.stack)) {
    throw new Error("Synthetic diagnostics did not retain technical stack details.");
  }

  const snapshotText = JSON.stringify(snapshot);
  if (snapshotText.includes("synthetic-secret-must-be-redacted")) {
    throw new Error("Synthetic secret leaked into the diagnostic snapshot.");
  }

  const packageResponse = await fetch(`${url}/api/diagnostics/package`);
  if (!packageResponse.ok) throw new Error(`Diagnostic package failed with HTTP ${packageResponse.status}.`);
  const packageText = await packageResponse.text();
  if (!packageText.includes("ALRemasteredDiagnosticPackage")) {
    throw new Error("Diagnostic package marker is missing.");
  }
  if (packageText.includes("synthetic-secret-must-be-redacted")) {
    throw new Error("Synthetic secret leaked into the diagnostic package.");
  }

  process.stdout.write("Diagnostic test mode exposed understandable sanitized errors with technical details.\n");
} finally {
  if (child.exitCode === null) child.kill();
  await once(child, "exit").catch(() => undefined);
}
