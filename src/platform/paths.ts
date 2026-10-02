import { homedir, platform } from "node:os";
import { posix, win32 } from "node:path";

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
    const base = environment.LOCALAPPDATA || environment.APPDATA || win32.join(home, "AppData", "Local");
    const root = win32.join(base, "ALRemastered");
    return Object.freeze({
      configDir: win32.join(root, "config"),
      dataDir: win32.join(root, "data"),
      logsDir: win32.join(root, "logs"),
    });
  }

  const configHome = environment.XDG_CONFIG_HOME || posix.join(home, ".config");
  const dataHome = environment.XDG_DATA_HOME || posix.join(home, ".local", "share");
  return Object.freeze({
    configDir: posix.join(configHome, "ALRemastered"),
    dataDir: posix.join(dataHome, "ALRemastered"),
    logsDir: posix.join(dataHome, "ALRemastered", "logs"),
  });
}
