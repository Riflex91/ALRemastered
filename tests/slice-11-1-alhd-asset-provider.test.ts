import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { AlhdAssetProvider } from "../src/hd/asset-provider.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 11.1 loads the packaged ALHD manifest and exposes read-only original fallback", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const logger = new Logger({ component: "slice-11-1-alhd-provider-test" });
  const provider = new AlhdAssetProvider({
    manifestPath: fileURLToPath(new URL("../assets/alhd/hd-assets.json", import.meta.url)),
    hdAssetRoot: fileURLToPath(new URL("../assets/alhd/hd-assets/", import.meta.url)),
    sourceRef:
      "Riflex91/Riflex91-Repo@43bcdee99ab12a92f7cbf8e7bcdac8f0e99983f2/Adventure Land HD/manifests/hd-assets.json",
  });
  const dashboard = new DashboardServer({
    logger,
    runtime,
    alhdAssetProvider: provider,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const stateResponse = await fetch(`${url}/api/hd/assets`);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.status, "ready");
    assert.equal(state.manifestStatus, "loaded");
    assert.equal(state.manifestSchemaVersion, 1);
    assert.equal(state.replacementCount, 2);
    assert.equal(state.activeReplacementCount, 2);
    assert.equal(state.availableHdFiles, 1);
    assert.equal(state.missingHdFiles, 1);
    assert.equal(state.presentationOnly, true);
    assert.equal(state.originalFallback, true);
    assert.equal(state.gameplaySemanticChanges, false);

    const sourcePath = "images/tiles/map/doors.png";
    const known = await (
      await fetch(
        `${url}/api/hd/assets/resolve?sourcePath=${encodeURIComponent(sourcePath)}`,
      )
    ).json();
    assert.equal(known.sourcePath, sourcePath);
    assert.equal(known.resolvedPath, sourcePath);
    assert.equal(known.mode, "original");
    assert.equal(known.reason, "hd-file-missing");

    const unknown = await (
      await fetch(
        `${url}/api/hd/assets/resolve?sourcePath=${encodeURIComponent("images/not-listed.png")}`,
      )
    ).json();
    assert.equal(unknown.mode, "original");
    assert.equal(unknown.reason, "not-in-manifest");

    const mutationAttempt = await fetch(`${url}/api/hd/assets`, { method: "POST" });
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 11.1 retains ALHD source semantics and is the only current verification slot", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const build = readFileSync(new URL("../../../scripts/build.mjs", import.meta.url), "utf8");
  const manifest = JSON.parse(
    readFileSync(new URL("../assets/alhd/hd-assets.json", import.meta.url), "utf8"),
  );

  assert.match(html, /data-current-verification-slice="14\.2"/);
  assert.match(html, /data-verification-test="10\.4" hidden/);
  assert.match(html, /data-verification-test="11\.1" hidden/);
  assert.match(html, /Slice 11\.1 one-click ALHD asset provider test/);

  assert.match(app, /\/api\/hd\/assets/);
  assert.match(app, /manifest-loaded/);
  assert.match(app, /presentation-only/);
  assert.match(app, /known-original-fallback/);
  assert.match(app, /unknown-original-fallback/);
  assert.match(app, /Dashboard GET only: true/);
  assert.match(app, /Gameplay mutation: false/);
  assert.match(app, /Action Gateway requests:/);

  assert.match(server, /GET" && path === "\/api\/hd\/assets"/);
  assert.match(server, /GET" && path === "\/api\/hd\/assets\/resolve"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/hd\/assets/);

  assert.match(main, /new AlhdAssetProvider/);
  assert.match(main, /alhdAssetProvider,/);
  assert.match(main, /Riflex91\/Riflex91-Repo@43bcdee/);
  assert.match(build, /cpSync\("assets"/);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.rules.preserveLogicalSize, true);
  assert.equal(manifest.rules.originalFallbackRequired, true);
  assert.equal(manifest.replacements.length, 2);
  assert.ok(manifest.replacements.every((entry) => entry.state === "active"));
  assert.ok(manifest.replacements.every((entry) => entry.preserveLogicalSize === true));
  assert.ok(manifest.replacements.every((entry) => entry.originalFallback === true));
});
