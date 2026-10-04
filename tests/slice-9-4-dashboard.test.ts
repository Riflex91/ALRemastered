import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Slice 9.4 exposes persistence, history, reset, profiles, and viewport variants", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../dashboard/editor.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../dashboard/styles.css", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="9\.4"/);
  assert.match(html, /id="dashboard-layout-profile"/);
  assert.match(html, /id="dashboard-layout-save"[^>]*>Save layout</);
  assert.match(html, /id="dashboard-layout-undo"[^>]*>Undo</);
  assert.match(html, /id="dashboard-layout-redo"[^>]*>Redo</);
  assert.match(html, /id="dashboard-layout-reset"[^>]*>Reset layout</);
  assert.match(html, /id="dashboard-layout-profile-create"/);
  assert.match(html, /id="dashboard-layout-profile-delete"/);
  assert.match(html, /data-verification-test="9\.4" hidden/);
  assert.match(html, /id="start-slice-9-4-live-test"/);

  assert.match(editor, /persistentState\(\)/);
  assert.match(editor, /applyPersistentState\(/);
  assert.match(editor, /resetToDefault\(\)/);
  assert.match(editor, /canUndo\(\)/);
  assert.match(editor, /canRedo\(\)/);
  assert.match(editor, /undo\(\)/);
  assert.match(editor, /redo\(\)/);
  assert.match(editor, /historyPast/);
  assert.match(editor, /historyFuture/);

  assert.match(script, /currentDashboardLayoutVariant/);
  assert.match(script, /globalThis\.innerWidth <= 720/);
  assert.match(script, /\/api\/dashboard-layout\/save/);
  assert.match(script, /\/api\/dashboard-layout\/reload/);
  assert.match(script, /Persistence: true/);
  assert.match(script, /Disk reload: true/);
  assert.match(script, /Profiles: multiple/);
  assert.match(script, /Viewport layouts: Desktop \/ Small/);

  assert.match(server, /\/api\/dashboard-layout/);
  assert.match(server, /dashboardLayoutStore\.saveLayout/);
  assert.match(server, /dashboardLayoutStore\.reload/);
  assert.match(main, /dashboard-layouts\.json/);
  assert.match(css, /\.dashboard-layout-controls/);

  const combined = `${script}\n${editor}\n${server}`;
  assert.doesNotMatch(combined, /localStorage|sessionStorage/);
  assert.doesNotMatch(combined, /importLayout|exportLayout/);
});

test("Slice 9.4 keeps 9.1 through 9.3 one-click harnesses retained", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  for (const slice of ["9.1", "9.2", "9.3"]) {
    assert.match(html, new RegExp(`data-verification-test="${slice.replace(".", "\\.")}" hidden`));
  }
});
