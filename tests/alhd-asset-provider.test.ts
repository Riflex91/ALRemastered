import assert from "node:assert/strict";
import { test } from "node:test";
import { AlhdAssetProvider } from "../src/hd/asset-provider.ts";

const manifest = JSON.stringify({
  schemaVersion: 1,
  phase: "test",
  rules: {
    preserveLogicalSize: true,
    originalFallbackRequired: true,
  },
  replacements: [
    {
      sourcePath: "images/source.png",
      hdPath: "map/source@8x.png",
      scale: 8,
      state: "active",
      preserveLogicalSize: true,
      originalFallback: true,
      originalPixels: { width: 10, height: 20 },
      hdPixels: { width: 80, height: 160 },
    },
  ],
});

test("ALHD asset provider reads presentation-only manifests and resolves available HD files", () => {
  const provider = new AlhdAssetProvider({
    manifestPath: "/virtual/hd-assets.json",
    hdAssetRoot: "/virtual/hd-assets",
    sourceRef: "test-ref",
    readText: () => manifest,
    fileExists: (path) =>
      path === "/virtual/hd-assets.json" ||
      path.replaceAll("\\", "/").endsWith("/virtual/hd-assets/map/source@8x.png"),
  });

  const state = provider.state();
  assert.equal(state.status, "ready");
  assert.equal(state.manifestStatus, "loaded");
  assert.equal(state.manifestSchemaVersion, 1);
  assert.equal(state.replacementCount, 1);
  assert.equal(state.activeReplacementCount, 1);
  assert.equal(state.availableHdFiles, 1);
  assert.equal(state.missingHdFiles, 0);
  assert.equal(state.presentationOnly, true);
  assert.equal(state.originalFallback, true);
  assert.equal(state.gameplaySemanticChanges, false);

  assert.deepEqual(provider.resolve("images/source.png"), {
    schemaVersion: 1,
    sourcePath: "images/source.png",
    resolvedPath: "map/source@8x.png",
    mode: "hd",
    reason: "hd-available",
    presentationOnly: true,
    originalFallback: true,
  });
});

test("ALHD asset provider always falls back to original assets when HD data is unavailable", () => {
  const provider = new AlhdAssetProvider({
    manifestPath: "/virtual/hd-assets.json",
    hdAssetRoot: "/virtual/hd-assets",
    sourceRef: "test-ref",
    readText: () => manifest,
    fileExists: (path) => path === "/virtual/hd-assets.json",
  });

  assert.deepEqual(provider.resolve("images/source.png"), {
    schemaVersion: 1,
    sourcePath: "images/source.png",
    resolvedPath: "images/source.png",
    mode: "original",
    reason: "hd-file-missing",
    presentationOnly: true,
    originalFallback: true,
  });
  assert.equal(provider.resolve("images/unknown.png").reason, "not-in-manifest");
});

test("ALHD asset provider fails closed on missing or invalid manifests", () => {
  const missing = new AlhdAssetProvider({
    manifestPath: "/missing/hd-assets.json",
    hdAssetRoot: "/missing/hd-assets",
    sourceRef: "test-ref",
    fileExists: () => false,
  });
  assert.equal(missing.state().status, "fallback");
  assert.equal(missing.state().manifestStatus, "missing");
  assert.equal(missing.resolve("images/source.png").reason, "manifest-unavailable");

  const invalid = new AlhdAssetProvider({
    manifestPath: "/virtual/invalid.json",
    hdAssetRoot: "/virtual/hd-assets",
    sourceRef: "test-ref",
    readText: () => JSON.stringify({
      schemaVersion: 1,
      rules: { preserveLogicalSize: true, originalFallbackRequired: false },
      replacements: [],
    }),
    fileExists: (path) => path === "/virtual/invalid.json",
  });
  assert.equal(invalid.state().status, "fallback");
  assert.equal(invalid.state().manifestStatus, "invalid");
});

test("ALHD asset provider rejects paths that escape the presentation asset root", () => {
  const provider = new AlhdAssetProvider({
    manifestPath: "/virtual/hd-assets.json",
    hdAssetRoot: "/virtual/hd-assets",
    sourceRef: "test-ref",
    readText: () => manifest,
    fileExists: (path) => path === "/virtual/hd-assets.json",
  });
  assert.throws(() => provider.resolve("../game-data.json"), /stay inside the asset root/);
});

test("ALHD texture guard blocks oversized HD textures and keeps originals", () => {
  const provider = new AlhdAssetProvider({
    manifestPath: "/virtual/hd-assets.json",
    hdAssetRoot: "/virtual/hd-assets",
    sourceRef: "test-ref",
    readText: () => manifest,
    fileExists: (path) =>
      path === "/virtual/hd-assets.json" ||
      path.replaceAll("\\", "/").endsWith("/virtual/hd-assets/map/source@8x.png"),
  });

  const supported = provider.diagnose(4096);
  assert.equal(supported.maxTextureSize, 4096);
  assert.equal(supported.available, 1);
  assert.equal(supported.eligible, 1);
  assert.deepEqual(supported.blocked, []);
  assert.equal(supported.hardwareSuitable, true);

  const blocked = provider.diagnose(64);
  assert.equal(blocked.available, 1);
  assert.equal(blocked.eligible, 0);
  assert.deepEqual(blocked.blocked, ["images/source.png"]);
  assert.equal(blocked.hardwareSuitable, false);
  assert.equal(blocked.presentationOnly, true);
  assert.equal(blocked.originalFallback, true);

  assert.deepEqual(provider.resolve("images/source.png", { maxTextureSize: 64 }), {
    schemaVersion: 1,
    sourcePath: "images/source.png",
    resolvedPath: "images/source.png",
    mode: "original",
    reason: "texture-too-large",
    presentationOnly: true,
    originalFallback: true,
  });
});

test("ALHD texture guard accepts unknown capability without fabricating a hardware limit", () => {
  const provider = new AlhdAssetProvider({
    manifestPath: "/virtual/hd-assets.json",
    hdAssetRoot: "/virtual/hd-assets",
    sourceRef: "test-ref",
    readText: () => manifest,
    fileExists: (path) => path === "/virtual/hd-assets.json",
  });

  const diagnostics = provider.diagnose(null);
  assert.equal(diagnostics.maxTextureSize, null);
  assert.equal(diagnostics.hardwareSuitable, null);
  assert.equal(diagnostics.eligible, 1);
  assert.deepEqual(diagnostics.blocked, []);
  assert.throws(
    () => provider.diagnose(0),
    /maxTextureSize must be a positive integer/,
  );
});

test("ALHD Browser payloads are lazy and do not load in Headless metadata paths", () => {
  const sidecar = "/virtual/hd-assets/map/source@8x.png.base64";
  const provider = new AlhdAssetProvider({
    manifestPath: "/virtual/hd-assets.json",
    hdAssetRoot: "/virtual/hd-assets",
    sourceRef: "test-ref",
    readText: (path) => path === sidecar ? "aVZCT1J3MEtHZ28=" : manifest,
    fileExists: (path) => path === "/virtual/hd-assets.json" || path === sidecar,
  });

  const before = provider.state();
  assert.equal(before.availableHdFiles, 1);
  assert.equal(before.hdPayloadReads, 0);
  assert.equal(before.hdPayloadBytes, 0);
  assert.equal(before.headlessLoadsHdAssets, false);

  const plan = provider.browserPlan(4096);
  assert.equal(plan.mode, "hd");
  assert.equal(plan.available, 1);
  assert.equal(plan.eligible, 1);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.blocked, []);
  assert.equal(provider.state().hdPayloadReads, 0);

  const payload = provider.readBrowserAsset("map/source@8x.png");
  assert.equal(payload.mediaType, "image/png");
  assert.equal(payload.base64, "aVZCT1J3MEtHZ28=");
  assert.equal(provider.state().hdPayloadReads, 1);
  assert.ok(provider.state().hdPayloadBytes > 0);
});

