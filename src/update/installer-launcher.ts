import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import type { Logger } from "../logging/logger.ts";

export function dashboardUpdateInstallerArguments(
  platform: NodeJS.Platform,
  parentPid: number = process.pid,
): readonly string[] {
  if (platform === "win32") {
    return ["/S", "/ALRUPDATE=1", `/ALRWAITPID=${parentPid}`];
  }
  if (platform === "linux") return ["--yes", "--no-desktop", "--restart"];
  return [];
}

export async function scheduleInstallerAfterCurrentProcess(
  installerPath: string,
  logger: Logger,
  platform: NodeJS.Platform = process.platform,
  parentPid: number = process.pid,
  installerArguments: readonly string[] = [],
  environment?: NodeJS.ProcessEnv,
): Promise<void> {
  if (platform === "win32") {
    await spawnConfirmed(installerPath, [...installerArguments], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: environment ?? process.env,
    });
    logger.info("Verified Windows update installer handoff started.", {
      installerPath,
      automatic: installerArguments.includes("/ALRUPDATE=1"),
      waitsForCurrentProcess: installerArguments.some((value) =>
        value.startsWith("/ALRWAITPID=")
      ),
    });
    return;
  }

  if (platform === "linux") {
    chmodSync(installerPath, 0o755);
    const script = [
      'parent_pid="$1"',
      'installer="$2"',
      "shift 2",
      'while kill -0 "$parent_pid" 2>/dev/null; do sleep 0.2; done',
      "sleep 0.5",
      'exec "$installer" "$@"',
    ].join("; ");
    await spawnConfirmed(
      "/bin/sh",
      [
        "-c",
        script,
        "alremastered-updater",
        String(parentPid),
        installerPath,
        ...installerArguments,
      ],
      {
        detached: true,
        stdio: "ignore",
        env: environment ?? process.env,
      },
    );
    logger.info("Verified Linux update installer handoff started.", {
      installerPath,
      automatic: installerArguments.includes("--restart"),
    });
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
