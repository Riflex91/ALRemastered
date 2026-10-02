import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Logger } from "../build/package/src/logging/logger.js";
import { scheduleInstallerAfterCurrentProcess } from "../build/package/src/update/installer-launcher.js";

const marker = process.argv[2];
if (!marker) throw new Error("Marker path is required.");

const probe = resolve(dirname(marker), "alremastered-linux-update-probe.sh");
rmSync(marker, { force: true });
rmSync(probe, { force: true });
writeFileSync(
  probe,
  '#!/usr/bin/env sh\nset -eu\nprintf "%s" "$1" > "$2"\n',
  "utf8",
);
chmodSync(probe, 0o755);

await scheduleInstallerAfterCurrentProcess(
  probe,
  new Logger({ component: "update-handoff-smoke" }),
  "linux",
  process.pid,
  ["started-after-parent-exit", resolve(marker)],
);

process.stdout.write("Linux update handoff process was confirmed.\n");
