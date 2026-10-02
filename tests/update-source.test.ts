import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { GitHubReleaseSource, validateManifest } from "../src/update/source.ts";

function manifest(version: string, url = "https://github.com/Riflex91/ALRemastered/releases/download/v0.1.0/installer.exe") {
  return {
    schemaVersion: 1,
    product: "ALRemastered",
    channel: "stable",
    version,
    publishedAt: "2026-10-02T14:00:00.000Z",
    releaseNotesUrl: `https://github.com/Riflex91/ALRemastered/releases/tag/v${version}`,
    assets: [{
      platform: "win32",
      arch: "x64",
      fileName: "installer.exe",
      url,
      sha256: "a".repeat(64),
      sizeBytes: 123,
    }],
  };
}

test("manifest validation rejects non-GitHub installer URLs", () => {
  assert.throws(
    () => validateManifest(manifest("0.1.0-alpha.5", "https://example.com/installer.exe")),
    /approved ALRemastered GitHub Release URL/,
  );
});

test("GitHub release source selects the highest valid manifest", async () => {
  const responses = new Map([
    ["https://example.test/releases", [
      { draft: false, tag_name: "v0.1.0-alpha.5", assets: [{ name: "ALRemastered-update.json", browser_download_url: "https://example.test/m5" }] },
      { draft: false, tag_name: "v0.1.0-alpha.6", assets: [{ name: "ALRemastered-update.json", browser_download_url: "https://example.test/m6" }] },
    ]],
    ["https://example.test/m5", manifest("0.1.0-alpha.5")],
    ["https://example.test/m6", manifest("0.1.0-alpha.6")],
  ]);

  const fakeFetch = async (url: string | URL | Request) => {
    const value = responses.get(String(url));
    if (value === undefined) return new Response("not found", { status: 404 });
    return Response.json(value);
  };

  const source = new GitHubReleaseSource(
    new Logger({ component: "source-test" }),
    fakeFetch as typeof fetch,
    "https://example.test/releases",
  );
  assert.equal((await source.latestManifest())?.version, "0.1.0-alpha.6");
});
