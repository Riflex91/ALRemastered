import type { Logger } from "../logging/logger.ts";
import type { UpdateManifest } from "./model.ts";
import { compareVersions } from "./version.ts";

const RELEASES_API = "https://api.github.com/repos/Riflex91/ALRemastered/releases?per_page=20";
const MANIFEST_NAME = "ALRemastered-update.json";

interface GitHubReleaseAsset {
  readonly name?: unknown;
  readonly browser_download_url?: unknown;
}

interface GitHubRelease {
  readonly draft?: unknown;
  readonly tag_name?: unknown;
  readonly assets?: unknown;
}

export class GitHubReleaseSource {
  readonly #logger: Logger;
  readonly #fetch: typeof fetch;
  readonly #releasesUrl: string;

  constructor(logger: Logger, fetchImpl: typeof fetch = fetch, releasesUrl = RELEASES_API) {
    this.#logger = logger;
    this.#fetch = fetchImpl;
    this.#releasesUrl = releasesUrl;
  }

  async latestManifest(): Promise<UpdateManifest | null> {
    const response = await this.#fetch(this.#releasesUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ALRemastered",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub release check failed with HTTP ${response.status}.`);

    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error("GitHub release response was invalid.");

    const manifests: UpdateManifest[] = [];
    for (const release of releases as GitHubRelease[]) {
      if (release.draft === true || !Array.isArray(release.assets)) continue;

      const manifestAsset = (release.assets as GitHubReleaseAsset[]).find((asset) => asset.name === MANIFEST_NAME);
      if (!manifestAsset || typeof manifestAsset.browser_download_url !== "string") continue;

      try {
        const manifestResponse = await this.#fetch(manifestAsset.browser_download_url, {
          headers: { "User-Agent": "ALRemastered" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status}`);
        const manifest = validateManifest(await manifestResponse.json());
        manifests.push(manifest);
      } catch (error) {
        this.#logger.warn("Update manifest could not be read.", {
          reason: error instanceof Error ? error.message : String(error),
          tag: typeof release.tag_name === "string" ? release.tag_name : undefined,
        });
      }
    }

    manifests.sort((left, right) => compareVersions(right.version, left.version));
    return manifests.at(0) ?? null;
  }
}

export function validateManifest(value: unknown): UpdateManifest {
  if (!value || typeof value !== "object") throw new Error("Update manifest must be an object.");
  const manifest = value as Record<string, unknown>;

  if (
    manifest.schemaVersion !== 1 ||
    manifest.product !== "ALRemastered" ||
    manifest.channel !== "stable" ||
    typeof manifest.version !== "string" ||
    typeof manifest.publishedAt !== "string" ||
    typeof manifest.releaseNotesUrl !== "string" ||
    !Array.isArray(manifest.assets)
  ) {
    throw new Error("Update manifest metadata is invalid.");
  }

  const assets = manifest.assets.map((asset) => validateAsset(asset));
  return Object.freeze({
    schemaVersion: 1,
    product: "ALRemastered",
    channel: "stable",
    version: manifest.version,
    publishedAt: manifest.publishedAt,
    releaseNotesUrl: manifest.releaseNotesUrl,
    assets,
  });
}

function validateAsset(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Update asset must be an object.");
  const asset = value as Record<string, unknown>;
  if (
    (asset.platform !== "win32" && asset.platform !== "linux") ||
    (asset.arch !== "x64" && asset.arch !== "arm64") ||
    typeof asset.fileName !== "string" ||
    typeof asset.url !== "string" ||
    typeof asset.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(asset.sha256) ||
    typeof asset.sizeBytes !== "number" ||
    !Number.isSafeInteger(asset.sizeBytes) ||
    asset.sizeBytes <= 0
  ) {
    throw new Error("Update asset metadata is invalid.");
  }

  const url = new URL(asset.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    !url.pathname.startsWith("/Riflex91/ALRemastered/releases/download/")
  ) {
    throw new Error("Update asset URL is not an approved ALRemastered GitHub Release URL.");
  }

  return Object.freeze({
    platform: asset.platform,
    arch: asset.arch,
    fileName: asset.fileName,
    url: asset.url,
    sha256: asset.sha256.toLowerCase(),
    sizeBytes: asset.sizeBytes,
  });
}
