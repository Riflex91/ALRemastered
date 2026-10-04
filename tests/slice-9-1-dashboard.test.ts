import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_GRID_ROW_PX,
  clampWidgetColumns,
  moveWidgetOrder,
  snapToGrid,
} from "../dashboard/editor.js";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 9.1 dashboard edit helpers snap, resize and reorder deterministically", () => {
  assert.equal(DASHBOARD_GRID_COLUMNS, 12);
  assert.equal(DASHBOARD_GRID_ROW_PX, 48);
  assert.equal(snapToGrid(173, DASHBOARD_GRID_ROW_PX), 192);
  assert.equal(snapToGrid(71, 24), 72);
  assert.equal(clampWidgetColumns(1), 3);
  assert.equal(clampWidgetColumns(7), 7);
  assert.equal(clampWidgetColumns(99), 12);
  assert.deepEqual(
    moveWidgetOrder(["a", "b", "c"], "c", "a"),
    ["c", "a", "b"],
  );
});

test("Slice 9.1 dashboard exposes edit mode without persistence or later-slice configuration", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../dashboard/editor.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../dashboard/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="edit-dashboard"[^>]*>Edit dashboard</);
  assert.match(html, /id="dashboard-edit-toolbar" hidden/);
  assert.match(html, /id="dashboard-widget-add-select"/);
  assert.match(html, /id="dashboard-add-widget"[^>]*>Add widget</);
  assert.match(html, /data-verification-test="9\.1" hidden/);
  assert.match(html, /id="start-slice-9-1-live-test"/);

  assert.match(script, /DashboardEditor/);
  assert.match(script, /runDashboardEditorVerification/);
  assert.match(script, /dashboardEditor\.toggle\(\)/);
  assert.match(script, /dashboardEditor\.addWidget\(id\)/);
  assert.match(script, /Action Gateway requests: 0/);
  assert.match(script, /Persistence: false/);

  assert.match(editor, /addEventListener\("dragstart"/);
  assert.match(editor, /addEventListener\("dragover"/);
  assert.match(editor, /addEventListener\("drop"/);
  assert.match(editor, /addEventListener\("pointerdown"/);
  assert.match(editor, /resizeWidget\(/);
  assert.match(editor, /removeWidget\(/);
  assert.match(editor, /addWidget\(/);
  assert.match(editor, /snapToGrid/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|\/api\/dashboard-layout/);

  assert.match(css, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(css, /background-size: calc\(100% \/ 12\) 48px/);
  assert.match(css, /\.dashboard-widget-controls \{[\s\S]*?display: none/);
  assert.match(css, /\.dashboard-editing \.dashboard-widget-controls \{[\s\S]*?display: flex/);
});

test("Slice 9.1 harness remains retained after Current verification advances", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  assert.match(html, /data-verification-test="9\.1" hidden/);
  assert.match(html, /id="start-slice-9-1-live-test"/);

  for (const slice of ["8.1", "8.2", "8.3", "8.4"]) {
    assert.match(html, new RegExp(`data-verification-test="${slice.replace(".", "\\.")}" hidden`));
  }
});

test("dashboard server serves the Slice 9.1 editor module", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice91-dashboard-test" }),
    runtime,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const response = await fetch(`${url}/dashboard-editor.js`);
    assert.equal(response.status, 200);
    const source = await response.text();
    assert.match(source, /class DashboardEditor/);
    assert.match(source, /runDashboardEditorVerification/);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
