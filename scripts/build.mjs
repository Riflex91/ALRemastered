import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative } from "node:path";

const buildRoot = "build/package";
const semanticVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const sourcePackage = JSON.parse(readFileSync("package.json", "utf8"));
const releaseConfig = JSON.parse(readFileSync("release.json", "utf8"));
const buildVersion = process.env.ALREMASTERED_BUILD_VERSION || sourcePackage.version;

if (!semanticVersion.test(buildVersion)) {
  throw new Error(`Invalid ALRemastered build version: ${buildVersion}`);
}
if (releaseConfig.schemaVersion !== 1 || releaseConfig.product !== "ALRemastered" || releaseConfig.channel !== "stable") {
  throw new Error("Invalid release.json metadata.");
}

rmSync("build", { recursive: true, force: true });
mkdirSync(buildRoot, { recursive: true });

function compileTree(sourceRoot) {
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = join(sourceRoot, entry.name);
    if (entry.isDirectory()) {
      compileTree(sourcePath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

    const relativePath = relative(".", sourcePath).replace(/\.ts$/, ".js");
    const destination = join(buildRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });

    const source = readFileSync(sourcePath, "utf8");
    const stripped = stripTypeScriptTypes(source, { mode: "strip", sourceUrl: sourcePath });
    const javascript = stripped.replace(/((?:from|import\s*)\s*["'][^"']+)\.ts(["'])/g, "$1.js$2");
    writeFileSync(destination, javascript, "utf8");
  }
}

compileTree("src");
compileTree("tests");
cpSync("dashboard", join(buildRoot, "dashboard"), { recursive: true });
cpSync("assets", join(buildRoot, "assets"), { recursive: true });

const stagedPackage = { ...sourcePackage, version: buildVersion };
writeFileSync(join(buildRoot, "package.json"), `${JSON.stringify(stagedPackage, null, 2)}\n`, "utf8");
writeFileSync(join(buildRoot, "release.json"), `${JSON.stringify(releaseConfig, null, 2)}\n`, "utf8");

for (const file of ["LICENSE", "README.md"]) {
  writeFileSync(join(buildRoot, file), readFileSync(file));
}

writeFileSync(
  join(buildRoot, "build-info.json"),
  `${JSON.stringify({
    schemaVersion: 1,
    application: "ALRemastered",
    version: buildVersion,
    channel: releaseConfig.channel,
  }, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Build ${buildVersion} staged at ${buildRoot}.\n`);
