import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DASHBOARD_DISPLAY_MODES,
  normalizeDashboardDisplayMode,
} from "../dashboard/editor.js";

test("Slice 9.2 display options normalize deterministically", () => {
  assert.deepEqual(DASHBOARD_DISPLAY_MODES, ["standard", "compact", "spacious"]);
  assert.equal(normalizeDashboardDisplayMode("compact"), "compact");
  assert.equal(normalizeDashboardDisplayMode("spacious"), "spacious");
  assert.equal(normalizeDashboardDisplayMode("unknown"), "standard");
  assert.equal(normalizeDashboardDisplayMode(undefined), "standard");
});

test("Slice 9.2 exposes transient widget configuration without later-slice persistence", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../dashboard/editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../dashboard/styles.css", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="9\.2"/);
  assert.match(html, /data-verification-test="9\.2" hidden/);
  assert.match(html, /id="start-slice-9-2-live-test"/);
  assert.match(html, /Character binding/);
  assert.match(html, /field visibility/);
  assert.match(html, /display options/);
  assert.match(html, /widget duplication/);

  assert.match(editor, /setCharacterOptions\(/);
  assert.match(editor, /configureWidget\(/);
  assert.match(editor, /duplicateWidget\(/);
  assert.match(editor, /Widget configuration/);
  assert.match(editor, /Visible fields/);
  assert.match(editor, /Duplicate widget/);
  assert.match(editor, /dataset\.widgetDisplay/);
  assert.match(editor, /data\.widgetCharacter/);
  assert.match(editor, /sanitizeDuplicateContent/);
  assert.match(editor, /removeAttribute\("id"\)/);
  assert.match(editor, /control\.disabled = true/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|\/api\/dashboard-layout/);

  assert.match(script, /runDashboardWidgetConfigurationVerification/);
  assert.match(script, /dashboardEditor\?\.setCharacterOptions/);
  assert.match(script, /Configuration persistence: false/);
  assert.match(script, /Action Gateway requests: 0/);
  assert.match(script, /User Script touched: false/);

  assert.match(css, /\.dashboard-widget-config/);
  assert.match(css, /data-widget-display="compact"/);
  assert.match(css, /data-widget-display="spacious"/);
  assert.match(css, /data-dashboard-duplicate-of/);
});

test("Slice 9.2 keeps Slice 9.1 harness retained while Current verification advances", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  assert.match(html, /data-verification-test="9\.1" hidden/);
  assert.match(html, /id="start-slice-9-1-live-test"/);
  const current = html.match(/<body data-current-verification-slice="([^"]*)">/)?.[1];
  assert.equal(current, "9.2");
});

test("Slice 9.2 remains dashboard-only and does not add page, profile, or import/export features", () => {
  const editor = readFileSync(new URL("../dashboard/editor.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");

  assert.doesNotMatch(editor, /undoStack|redoStack|layoutProfile|importLayout|exportLayout/);
  assert.doesNotMatch(html, /Dashboard pages|Dashboard tabs|Import dashboard|Export dashboard/);
});
