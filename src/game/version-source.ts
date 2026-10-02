export interface AdventureLandRemoteVersion {
  readonly version: number;
  readonly lastDeploy?: string;
  readonly sourceUrl: string;
}

const DEFAULT_SOURCE_URL =
  "https://raw.githubusercontent.com/kaansoral/adventureland_mongodb/main/version.js";

export class AdventureLandVersionSource {
  readonly #fetch: typeof fetch;
  readonly #sourceUrl: string;

  constructor(fetchImpl: typeof fetch = fetch, sourceUrl = DEFAULT_SOURCE_URL) {
    this.#fetch = fetchImpl;
    this.#sourceUrl = sourceUrl;
  }

  async fetchVersion(): Promise<AdventureLandRemoteVersion> {
    const response = await this.#fetch(this.#sourceUrl, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "ALRemastered",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error("Adventure Land version check failed with HTTP " + response.status + ".");
    }

    const source = await response.text();
    return parseAdventureLandVersionSource(source, this.#sourceUrl);
  }
}

export function parseAdventureLandVersionSource(
  source: string,
  sourceUrl = DEFAULT_SOURCE_URL,
): AdventureLandRemoteVersion {
  const versionMatch = source.match(/\bVersion\s*=\s*(\d+)\s*;/);
  if (!versionMatch) {
    throw new Error("Adventure Land version source did not contain a valid Version value.");
  }

  const version = Number(versionMatch[1]);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error("Adventure Land version source contained an invalid version number.");
  }

  const deployMatch = source.match(/\bLastDeploy\s*=\s*["']([^"']+)["']\s*;/);

  return Object.freeze({
    version,
    lastDeploy: deployMatch?.[1],
    sourceUrl,
  });
}

export { DEFAULT_SOURCE_URL as ADVENTURE_LAND_VERSION_SOURCE_URL };
