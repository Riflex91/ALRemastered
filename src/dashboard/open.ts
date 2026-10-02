import { spawn } from "node:child_process";
import type { Logger } from "../logging/logger.ts";

export function openDashboard(url: string, logger: Logger): void {
  const platform = process.platform;

  try {
    if (platform === "win32") {
      const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", (error) => {
        logger.warn("Dashboard could not be opened automatically.", { reason: error.message, url });
      });
      child.unref();
      return;
    }

    if (platform === "linux") {
      if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
        logger.info("Automatic dashboard opening skipped because no graphical session was detected.", { url });
        return;
      }

      const child = spawn("xdg-open", [url], {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", (error) => {
        logger.warn("Dashboard could not be opened automatically.", { reason: error.message, url });
      });
      child.unref();
      return;
    }

    logger.warn("Automatic dashboard opening is not supported on this platform.", { platform, url });
  } catch (error) {
    logger.warn("Dashboard could not be opened automatically.", {
      reason: error instanceof Error ? error.message : String(error),
      url,
    });
  }
}
