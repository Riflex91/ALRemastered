import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative } from "node:path";

const buildRoot = "build/package";
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

for (const file of ["package.json", "LICENSE", "README.md"]) {
  writeFileSync(join(buildRoot, file), readFileSync(file));
}

const metadata = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync(
  join(buildRoot, "build-info.json"),
  `${JSON.stringify({ application: "ALRemastered", version: metadata.version }, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Build staged at ${buildRoot}.\n`);
