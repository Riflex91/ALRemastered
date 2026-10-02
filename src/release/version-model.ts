import { readFileSync } from "node:fs";
import { getPackageMetadata } from "../version.ts";

export type ReleaseChannel = "stable";

export interface ReleaseMetadata {
  readonly schemaVersion: 1;
  readonly product: "ALRemastered";
  readonly channel: ReleaseChannel;
  readonly version: string;
}

let cachedRelease: ReleaseMetadata | undefined;

export function getReleaseMetadata(): ReleaseMetadata {
  if (cachedRelease) return cachedRelease;

  const releaseUrl = new URL("../../release.json", import.meta.url);
  const parsed = JSON.parse(readFileSync(releaseUrl, "utf8")) as Partial<ReleaseMetadata>;
  const packageMetadata = getPackageMetadata();

  if (parsed.schemaVersion !== 1 || parsed.product !== "ALRemastered" || parsed.channel !== "stable") {
    throw new Error("Invalid ALRemastered release metadata.");
  }

  cachedRelease = Object.freeze({
    schemaVersion: 1,
    product: "ALRemastered",
    channel: "stable",
    version: packageMetadata.version,
  });
  return cachedRelease;
}
