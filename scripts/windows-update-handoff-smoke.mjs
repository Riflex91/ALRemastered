import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { Logger } from "../build/package/src/logging/logger.js";
import { scheduleInstallerAfterCurrentProcess } from "../build/package/src/update/installer-launcher.js";

const marker = process.argv[2];
if (!marker) throw new Error("Marker path is required.");

const envName = "ALREMASTERED_UPDATE_HANDOFF_SMOKE";
const envValue = "environment-survived-parent-exit";
rmSync(marker, { force: true });

const delayedProbe = [
  "const fs=require('fs');",
  "const marker=process.argv[1];",
  `const value=process.env[${JSON.stringify(envName)}]||'';`,
  "setTimeout(()=>{fs.writeFileSync(marker,value,'utf8');process.exit(0);},1200);",
].join("");

await scheduleInstallerAfterCurrentProcess(
  process.execPath,
  new Logger({ component: "update-handoff-smoke" }),
  "win32",
  process.pid,
  ["-e", delayedProbe, resolve(marker)],
  {
    ...process.env,
    [envName]: envValue,
  },
);

process.stdout.write("Windows update handoff process and environment were confirmed.\n");
