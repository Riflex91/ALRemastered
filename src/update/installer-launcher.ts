import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import type { Logger } from "../logging/logger.ts";

export function scheduleInstallerAfterCurrentProcess(
  installerPath: string,
  logger: Logger,
  platform: NodeJS.Platform = process.platform,
  parentPid: number = process.pid,
): void {
  if (platform === "win32") {
    const escapedPath = installerPath.replace(/'/g, "''");
    const command = [
      `Wait-Process -Id ${parentPid} -ErrorAction SilentlyContinue`,
      "Start-Sleep -Milliseconds 1200",
      `Start-Process -FilePath '${escapedPath}'`,
    ].join("; ");

    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", command],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.once("error", (error) => {
      logger.error("Verified update installer could not be scheduled.", error);
    });
    child.unref();
    return;
  }

  if (platform === "linux") {
    chmodSync(installerPath, 0o755);
    const script = 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; sleep 1.2; chmod +x "$2"; exec "$2"';
    const child = spawn("/bin/sh", ["-c", script, "alremastered-updater", String(parentPid), installerPath], {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", (error) => {
      logger.error("Verified update installer could not be scheduled.", error);
    });
    child.unref();
    return;
  }

  throw new Error(`Update installation is not supported on platform ${platform}.`);
}
