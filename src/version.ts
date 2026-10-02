import { readFileSync } from "node:fs";

export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

let cachedMetadata: PackageMetadata | undefined;

export function getPackageMetadata(): PackageMetadata {
  if (cachedMetadata) return cachedMetadata;

  const packageUrl = new URL("../package.json", import.meta.url);
  const parsed = JSON.parse(readFileSync(packageUrl, "utf8")) as Partial<PackageMetadata>;

  if (parsed.name !== "alremastered" || typeof parsed.version !== "string") {
    throw new Error("Invalid ALRemastered package metadata.");
  }

  cachedMetadata = Object.freeze({ name: parsed.name, version: parsed.version });
  return cachedMetadata;
}

export function getAppVersion(): string {
  return getPackageMetadata().version;
}
