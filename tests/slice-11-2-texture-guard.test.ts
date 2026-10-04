import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { AlhdAssetProvider } from "../src/hd/asset-provider.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 11.2 exposes WebGL texture guard diagnostics and original fallback", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const logger = new Logger({ component: "slice-11-2-texture-guard-test" });
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
    const diagnostics = await (
      await fetch(`${url}/api/hd/assets/diagnostics?maxTextureSize=1200`)
    ).json();
    assert.equal(diagnostics.maxTextureSize, 1200);
    assert.equal(diagnostics.available, 2);
    assert.equal(diagnostics.eligible, 1);
    assert.deepEqual(diagnostics.blocked, ["images/tiles/map/doors.png"]);
    assert.equal(diagnostics.hardwareSuitable, false);
    assert.equal(diagnostics.presentationOnly, true);
    assert.equal(diagnostics.originalFallback, true);

    const sourcePath = "images/tiles/map/doors.png";
    const blocked = await (
      await fetch(
        `${url}/api/hd/assets/resolve?sourcePath=${encodeURIComponent(sourcePath)}&maxTextureSize=1200`,
      )
    ).json();
    assert.equal(blocked.sourcePath, sourcePath);
    assert.equal(blocked.resolvedPath, sourcePath);
    assert.equal(blocked.mode, "original");
    assert.equal(blocked.reason, "texture-too-large");

    const unguarded = await (
      await fetch(
        `${url}/api/hd/assets/resolve?sourcePath=${encodeURIComponent(sourcePath)}&maxTextureSize=4096`,
      )
    ).json();
    assert.equal(unguarded.mode, "original");
    assert.equal(unguarded.reason, "hd-file-missing");

    const invalid = await fetch(
      `${url}/api/hd/assets/diagnostics?maxTextureSize=0`,
    );
    assert.equal(invalid.status, 400);

    const mutationAttempt = await fetch(
      `${url}/api/hd/assets/diagnostics?maxTextureSize=1200`,
      { method: "POST" },
    );
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 11.2 keeps the GPU guard presentation-only and makes it current verification", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../src/hd/asset-provider.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="11\.3"/);
  assert.match(html, /data-verification-test="11\.1" hidden/);
  assert.match(html, /data-verification-test="11\.2" hidden/);
  assert.match(html, /Slice 11\.2 one-click GPU \/ texture guard test/);

  assert.match(app, /detectWebglTextureCapability/);
  assert.match(app, /MAX_TEXTURE_SIZE/);
  assert.match(app, /WEBGL_lose_context/);
  assert.match(app, /experimental-webgl/);
  assert.match(app, /texture-guard-diagnostics/);
  assert.match(app, /oversized-original-fallback/);
  assert.match(app, /actual-hardware-resolution/);
  assert.match(app, /Dashboard GET only: true/);
  assert.match(app, /Gameplay mutation: false/);

  assert.match(server, /GET" && path === "\/api\/hd\/assets\/diagnostics"/);
  assert.match(server, /maxTextureSize/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/hd\/assets\/diagnostics"/);

  assert.match(provider, /texture-too-large/);
  assert.match(provider, /hardwareSuitable/);
  assert.match(provider, /textureExceedsLimit/);
  assert.match(provider, /originalResolution\(source, "texture-too-large"\)/);
});
