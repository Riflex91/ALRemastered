import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Slice 9.5 exposes portable dashboard import/export and explicit role mapping", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const transfer = readFileSync(new URL("../dashboard/layout-transfer.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../dashboard/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="dashboard-layout-export"[^>]*>Export profile</);
  assert.match(html, /id="dashboard-layout-import"[^>]*>Import profile</);
  assert.match(html, /id="dashboard-layout-import-file"/);
  assert.match(html, /id="dashboard-layout-import-panel"/);
  assert.match(html, /id="dashboard-layout-role-mappings"/);
  assert.match(html, /id="dashboard-layout-import-apply"/);
  assert.match(html, /data-verification-test="9\.5" hidden/);
  assert.match(html, /id="start-slice-9-5-live-test"/);

  assert.match(script, /createPortableDashboardProfile/);
  assert.match(script, /parsePortableDashboardProfile/);
  assert.match(script, /resolvePortableDashboardProfile/);
  assert.match(script, /dashboardImportMapping/);
  assert.match(script, /Map .*Character role/);
  assert.match(script, /Fixed Character IDs exported: false/);
  assert.match(script, /Character names exported: false/);
  assert.match(script, /Role mapping: explicit/);
  assert.match(script, /Imported profile persisted: true/);
  assert.match(script, /Action Gateway requests: 0/);

  assert.match(transfer, /ALRemasteredDashboardProfile/);
  assert.match(transfer, /characterRole/);
  assert.match(transfer, /must use character roles instead of fixed Character IDs/);
  assert.match(transfer, /Character mapping is required/);
  assert.match(server, /"\/dashboard-layout-transfer\.js": "layout-transfer\.js"/);
  assert.match(css, /\.dashboard-layout-import-panel/);
  assert.match(css, /\.dashboard-layout-role-mappings/);
});

test("Slice 9.5 keeps historical 9.1 through 9.4 harnesses retained", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  for (const slice of ["9.1", "9.2", "9.3", "9.4", "9.5"]) {
    assert.match(
      html,
      new RegExp(`data-verification-test="${slice.replace(".", "\\.")}" hidden`),
    );
  }
  assert.match(html, /id="start-slice-9-1-live-test"/);
  assert.match(html, /id="start-slice-9-2-live-test"/);
  assert.match(html, /id="start-slice-9-3-live-test"/);
  assert.match(html, /id="start-slice-9-4-live-test"/);
  assert.match(html, /id="start-slice-9-5-live-test"/);
});
