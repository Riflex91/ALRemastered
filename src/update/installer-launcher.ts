import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import type { Logger } from "../logging/logger.ts";

export function automaticUpdateInstallerArguments(
  platform: NodeJS.Platform,
): readonly string[] {
  if (platform === "win32") return ["/S", "/ALRUPDATE=1"];
  if (platform === "linux") return ["--yes", "--no-desktop", "--restart"];
  return [];
}

export function installerHandoffArguments(
  platform: NodeJS.Platform,
  parentPid: number,
  installerArguments: readonly string[],
): readonly string[] {
  if (
    platform === "win32" &&
    installerArguments.includes("/ALRUPDATE=1")
  ) {
    return [...installerArguments, `/ALRWAITPID=${parentPid}`];
  }
  return [...installerArguments];
}

export async function scheduleInstallerAfterCurrentProcess(
  installerPath: string,
  logger: Logger,
  platform: NodeJS.Platform = process.platform,
  parentPid: number = process.pid,
  installerArguments: readonly string[] = automaticUpdateInstallerArguments(platform),
): Promise<void> {
  const handoffArguments = installerHandoffArguments(
    platform,
    parentPid,
    installerArguments,
  );

  if (platform === "win32") {
    await spawnConfirmed(installerPath, handoffArguments, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    logger.info("Verified Windows update installer handoff started.", {
      installerPath,
      automatic: installerArguments.includes("/ALRUPDATE=1"),
      waitsForCurrentProcess: handoffArguments.some((value) =>
        value.startsWith("/ALRWAITPID=")
      ),
    });
    return;
  }

  if (platform === "linux") {
    chmodSync(installerPath, 0o755);
    const script = [
      'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done',
      "sleep 1.2",
      'installer="$2"',
      "shift 2",
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
        ...handoffArguments,
      ],
      {
        detached: true,
        stdio: "ignore",
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
