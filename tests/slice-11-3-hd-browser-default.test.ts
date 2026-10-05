import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { AlhdAssetProvider } from "../src/hd/asset-provider.ts";
import { Logger } from "../src/logging/logger.ts";

function packagedProvider(): AlhdAssetProvider {
  return new AlhdAssetProvider({
    manifestPath: fileURLToPath(new URL("../assets/alhd/hd-assets.json", import.meta.url)),
    hdAssetRoot: fileURLToPath(new URL("../assets/alhd/hd-assets/", import.meta.url)),
    sourceRef:
      "Riflex91/Riflex91-Repo@43bcdee99ab12a92f7cbf8e7bcdac8f0e99983f2/Adventure Land HD/manifests/hd-assets.json",
  });
}

test("Slice 11.3 packages one active HD pilot lazily for Browser mode", () => {
  const provider = packagedProvider();
  const before = provider.state();
  assert.equal(before.availableHdFiles, 1);
  assert.equal(before.missingHdFiles, 1);
  assert.equal(before.hdPayloadReads, 0);
  assert.equal(before.headlessLoadsHdAssets, false);

  const plan = provider.browserPlan(16_384);
  assert.equal(plan.mode, "hd");
  assert.equal(plan.available, 2);
  assert.equal(plan.eligible, 2);
  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.missing, ["images/tiles/map/doors.png"]);

  const jubchan = plan.entries.find(
    (entry) => entry.sourcePath === "images/tiles/characters/jubchan_1.png",
  );
  assert.ok(jubchan);
  assert.equal(jubchan.mode, "hd");
  assert.equal(jubchan.reason, "hd-available");
  assert.equal(provider.state().hdPayloadReads, 0);

  const payload = provider.readBrowserAsset(jubchan.hdPath);
  assert.equal(payload.mediaType, "image/png");
  assert.match(payload.base64, /^iVBORw0KGgo/);
  assert.equal(provider.state().hdPayloadReads, 1);
  assert.ok(provider.state().hdPayloadBytes > 0);
});

test("Slice 11.3 Browser APIs expose the plan and load payloads only on explicit Browser request", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const provider = packagedProvider();
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-11-3-hd-browser-test" }),
    runtime,
    alhdAssetProvider: provider,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const state = await (await fetch(`${url}/api/hd/assets`)).json();
    assert.equal(state.hdPayloadReads, 0);
    assert.equal(state.headlessLoadsHdAssets, false);

    const plan = await (
      await fetch(`${url}/api/hd/assets/browser-plan?maxTextureSize=16384`)
    ).json();
    assert.equal(plan.mode, "hd");
    assert.equal(plan.available, 2);
    assert.equal(provider.state().hdPayloadReads, 0);

    const payloadResponse = await fetch(
      `${url}/api/hd/assets/content?hdPath=${encodeURIComponent("characters/jubchan_1@8x.png")}`,
    );
    assert.equal(payloadResponse.status, 200);
    const payload = await payloadResponse.json();
    assert.match(payload.base64, /^iVBORw0KGgo/);
    assert.equal(provider.state().hdPayloadReads, 1);

    const mutation = await fetch(`${url}/api/hd/assets/content`, { method: "POST" });
    assert.equal(mutation.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 11.3 makes HD preferred only in Browser View and exposes required status", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const browserHtml = readFileSync(new URL("../dashboard/browser-view.html", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../dashboard/browser-view.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const base64 = readFileSync(
    new URL("../assets/alhd/hd-assets/characters/jubchan_1@8x.png.base64", import.meta.url),
    "utf8",
  ).trim();

  assert.match(html, /data-current-verification-slice="14\.4"/);
  assert.match(html, /Slice 11\.3 one-click HD Browser default test/);
  assert.match(browserHtml, /Adventure Land HD/);
  assert.match(browserHtml, /id="browser-hd-available"/);
  assert.match(browserHtml, /id="browser-hd-applied"/);
  assert.match(browserHtml, /id="browser-hd-missing"/);
  assert.match(browserHtml, /id="browser-hd-blocked"/);
  assert.match(browserHtml, /id="browser-hd-texture-limit"/);

  assert.match(browser, /loadBrowserHdAssets/);
  assert.match(browser, /mode: definition\.usesHd \? "HD" : "Original"/);
  assert.match(browser, /\/api\/hd\/assets\/browser-plan/);
  assert.match(browser, /\/api\/hd\/assets\/content/);
  assert.match(browser, /verificationState\.alhdReady = true/);
  assert.match(browser, /headlessHdAssetsLoaded: false/);

  assert.match(app, /headless-no-hd-payload/);
  assert.match(app, /browser-hd-default/);
  assert.match(app, /browser-hd-status/);
  assert.match(app, /headless-stays-metadata-only/);
  assert.match(app, /Headless loads HD assets:/);

  assert.match(server, /GET" && path === "\/api\/hd\/assets\/browser-plan"/);
  assert.match(server, /GET" && path === "\/api\/hd\/assets\/content"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/hd\/assets\/content"/);

  const png = Buffer.from(base64, "base64");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
