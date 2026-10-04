import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DASHBOARD_PAGES,
  dashboardPagesForWidget,
  normalizeDashboardPage,
} from "../dashboard/editor.js";

test("Slice 9.3 page catalog and widget routing are deterministic", () => {
  assert.deepEqual(
    DASHBOARD_PAGES,
    [
      { id: "overview", label: "Overview" },
      { id: "combat", label: "Combat" },
      { id: "party", label: "Party" },
      { id: "merchant", label: "Merchant" },
      { id: "logs", label: "Logs" },
      { id: "debugging", label: "Debugging" },
    ],
  );
  assert.equal(normalizeDashboardPage("combat"), "combat");
  assert.equal(normalizeDashboardPage("unknown"), "overview");

  assert.deepEqual(
    dashboardPagesForWidget("current-verification-panel", "Current verification"),
    ["overview", "debugging"],
  );
  assert.equal(
    dashboardPagesForWidget("script-runtime-panel", "Script runtime").includes("combat"),
    true,
  );
  assert.equal(
    dashboardPagesForWidget("script-runtime-panel", "Script runtime").includes("party"),
    true,
  );
  assert.equal(
    dashboardPagesForWidget("widget-adventure-land-account", "Adventure Land account").includes("merchant"),
    true,
  );
  assert.equal(
    dashboardPagesForWidget("widget-debug-console", "Debug Console").includes("logs"),
    true,
  );
});

test("Slice 9.3 exposes page tabs and a dashboard-only one-click verification", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../dashboard/editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../dashboard/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="dashboard-page-tabs"/);
  for (const [id, label] of [
    ["overview", "Overview"],
    ["combat", "Combat"],
    ["party", "Party"],
    ["merchant", "Merchant"],
    ["logs", "Logs"],
    ["debugging", "Debugging"],
  ]) {
    assert.match(html, new RegExp(`data-dashboard-page="${id}"[^>]*>${label}<`));
  }
  assert.match(html, /data-verification-test="9\.3" hidden/);
  assert.match(html, /id="start-slice-9-3-live-test"/);

  assert.match(script, /runDashboardPagesVerification/);
  assert.match(script, /dashboardEditor\.setActivePage\(pageId\)/);
  assert.match(script, /Dashboard page changed to/);
  assert.match(script, /Page selection persistence: false/);
  assert.match(script, /Action Gateway requests: 0/);

  assert.match(editor, /activePage = "overview"/);
  assert.match(editor, /visibleWidgetIds\(/);
  assert.match(editor, /setActivePage\(/);
  assert.match(editor, /dataset\.dashboardPageVisible/);
  assert.match(editor, /dataset\.dashboardPage/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|\/api\/dashboard-layout/);

  assert.match(css, /\.dashboard-page-tabs/);
  assert.match(css, /\.dashboard-page-tab\[aria-selected="true"\]/);
  assert.match(css, /data-dashboard-page-visible="false"/);
});

test("Slice 9.3 verification harness remains retained after Current verification advances", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  for (const slice of ["9.1", "9.2", "9.3"]) {
    assert.match(html, new RegExp(`data-verification-test="${slice.replace(".", "\\.")}" hidden`));
    assert.match(html, new RegExp(`id="start-slice-${slice.replace(".", "-")}-live-test"`));
  }
});

test("Slice 9.3 page selection remains transient while later layout persistence is added", () => {
  const editor = readFileSync(new URL("../dashboard/editor.js", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const combined = `${editor}\n${script}`;

  assert.match(script, /Page selection persistence: false/);
  assert.doesNotMatch(combined, /importLayout|exportLayout/);
});
