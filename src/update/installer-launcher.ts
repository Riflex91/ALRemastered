import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import type { Logger } from "../logging/logger.ts";

export async function scheduleInstallerAfterCurrentProcess(
  installerPath: string,
  logger: Logger,
  platform: NodeJS.Platform = process.platform,
  parentPid: number = process.pid,
  installerArguments: readonly string[] = [],
): Promise<void> {
  if (platform === "win32") {
    await spawnConfirmed(installerPath, [...installerArguments], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    logger.info("Verified Windows update installer process started.", { installerPath });
    return;
  }

  if (platform === "linux") {
    chmodSync(installerPath, 0o755);
    const script = 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; sleep 1.2; chmod +x "$2"; exec "$2"';
    await spawnConfirmed(
      "/bin/sh",
      ["-c", script, "alremastered-updater", String(parentPid), installerPath],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    logger.info("Verified Linux update installer handoff started.", { installerPath });
    return;
  }

  throw new Error(`Update installation is not supported on platform ${platform}.`);
}

function spawnConfirmed(
  executable: string,
  args: readonly string[],
  options: Parameters<typeof spawn>[2],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], options);
    let settled = false;

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}
