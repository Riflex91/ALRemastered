import { homedir, platform } from "node:os";
import { join } from "node:path";

export interface UserPaths {
  readonly configDir: string;
  readonly dataDir: string;
  readonly logsDir: string;
}

export function getUserPaths(
  targetPlatform: NodeJS.Platform = platform(),
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): UserPaths {
  if (targetPlatform === "win32") {
    const base = environment.LOCALAPPDATA || environment.APPDATA || join(home, "AppData", "Local");
    const root = join(base, "ALRemastered");
    return Object.freeze({
      configDir: join(root, "config"),
      dataDir: join(root, "data"),
      logsDir: join(root, "logs"),
    });
  }

  const configHome = environment.XDG_CONFIG_HOME || join(home, ".config");
  const dataHome = environment.XDG_DATA_HOME || join(home, ".local", "share");
  return Object.freeze({
    configDir: join(configHome, "ALRemastered"),
    dataDir: join(dataHome, "ALRemastered"),
    logsDir: join(dataHome, "ALRemastered", "logs"),
  });
}
