import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DEFAULT_GRAPHICS_PROFILE,
  GRAPHICS_PROFILE_IDS,
  graphicsProfileDefinition,
  graphicsProfileUsesHd,
  normalizeGraphicsProfile,
  resolveGraphicsProfileTextureLimit,
} from "../dashboard/graphics-profiles.js";

test("Slice 11.4 defines the four canonical graphics profiles and deterministic texture policy", () => {
  assert.deepEqual(GRAPHICS_PROFILE_IDS, [
    "original",
    "hd-performance",
    "hd-auto",
    "hd-maximum",
  ]);
  assert.equal(DEFAULT_GRAPHICS_PROFILE, "hd-auto");
  assert.equal(normalizeGraphicsProfile("unknown"), "hd-auto");

  assert.equal(graphicsProfileDefinition("original").label, "Original");
  assert.equal(graphicsProfileDefinition("hd-performance").label, "HD Performance");
  assert.equal(graphicsProfileDefinition("hd-auto").label, "HD Auto");
  assert.equal(graphicsProfileDefinition("hd-maximum").label, "HD Maximum");

  assert.equal(graphicsProfileUsesHd("original"), false);
  assert.equal(graphicsProfileUsesHd("hd-performance"), true);
  assert.equal(graphicsProfileUsesHd("hd-auto"), true);
  assert.equal(graphicsProfileUsesHd("hd-maximum"), true);

  assert.equal(resolveGraphicsProfileTextureLimit("original", 16_384), null);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-performance", 16_384), 2_048);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-performance", 1_024), 1_024);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-auto", 16_384), 4_096);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-auto", 2_048), 2_048);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-maximum", 16_384), 16_384);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-performance", null), 2_048);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-auto", null), 4_096);
  assert.equal(resolveGraphicsProfileTextureLimit("hd-maximum", null), null);
});

test("Slice 11.4 exposes profile switching in Browser View without a gameplay mutation route", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const browserHtml = readFileSync(new URL("../dashboard/browser-view.html", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../dashboard/browser-view.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="12\.6"/);
  assert.match(html, /Slice 11\.4 one-click Graphics Profiles test/);
  assert.match(html, /id="start-slice-11-4-live-test"/);

  assert.match(browserHtml, /id="browser-graphics-profile"/);
  assert.match(browserHtml, />Original</);
  assert.match(browserHtml, />HD Performance</);
  assert.match(browserHtml, />HD Auto</);
  assert.match(browserHtml, />HD Maximum</);
  assert.match(browserHtml, /id="browser-graphics-generation"/);

  assert.match(browser, /graphicsProfileDefinition/);
  assert.match(browser, /resolveGraphicsProfileTextureLimit/);
  assert.match(browser, /verificationState\.setGraphicsProfile/);
  assert.match(browser, /verificationState\.rendererGeneration \+= 1/);
  assert.match(browser, /No HD image payloads are loaded/);

  assert.match(app, /profile-original/);
  assert.match(app, /profile-hd-performance/);
  assert.match(app, /profile-hd-auto/);
  assert.match(app, /profile-hd-maximum/);
  assert.match(app, /profile-switch-renderer-reinitialized/);
  assert.match(app, /core-character-script-continuity-during-switch/);
  assert.match(app, /Action Gateway requests:/);

  assert.match(server, /"\/graphics-profiles\.js": "graphics-profiles\.js"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/hd\/assets\/graphics-profile"/);
});
