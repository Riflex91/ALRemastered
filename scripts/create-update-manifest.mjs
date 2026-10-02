import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [version, outputPath, windowsPath, linuxPath] = process.argv.slice(2);
if (!version || !outputPath || !windowsPath || !linuxPath) {
  throw new Error("Usage: node scripts/create-update-manifest.mjs <version> <output> <windows-installer> <linux-installer>");
}

const semanticVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
if (!semanticVersion.test(version)) throw new Error(`Invalid release version: ${version}`);

const tag = `v${version}`;
const releaseBase = `https://github.com/Riflex91/ALRemastered/releases/download/${tag}`;

const assets = [
  describeAsset(windowsPath, "win32"),
  describeAsset(linuxPath, "linux"),
];

const manifest = {
  schemaVersion: 1,
  product: "ALRemastered",
  channel: "stable",
  version,
  publishedAt: new Date().toISOString(),
  releaseNotesUrl: `https://github.com/Riflex91/ALRemastered/releases/tag/${tag}`,
  assets,
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Created update manifest for ALRemastered ${version}.\n`);

function describeAsset(path, platform) {
  const fileName = basename(path);
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const arch = fileName.toLowerCase().includes("arm64") ? "arm64" : "x64";

  return {
    platform,
    arch,
    fileName,
    url: `${releaseBase}/${encodeURIComponent(fileName).replace(/%2F/gi, "/")}`,
    sha256,
    sizeBytes: statSync(path).size,
  };
}
