import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardLayoutStore } from "../src/dashboard/layout-store.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

function savedLayout(page = "overview") {
  return {
    schemaVersion: 1,
    activePage: page,
    order: ["widget-a", "widget-b"],
    removed: [],
    widgets: {
      "widget-a": {
        columns: 7,
        height: 192,
        characterId: "",
        hiddenFields: [],
        displayMode: "compact",
        duplicateOf: null,
      },
      "widget-b": {
        columns: 12,
        height: null,
        characterId: "",
        hiddenFields: [],
        displayMode: "standard",
        duplicateOf: null,
      },
    },
  };
}

async function postJson(url, path, body = {}) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

test("Slice 9.4 exposes persistent profile, history and reset controls", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../dashboard/editor.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="9\.4"/);
  assert.match(html, /id="dashboard-layout-profile"/);
  assert.match(html, /id="dashboard-layout-profile-name"/);
  assert.match(html, /id="dashboard-create-profile"/);
  assert.match(html, /id="dashboard-delete-profile"/);
  assert.match(html, /id="dashboard-save-layout"/);
  assert.match(html, /id="dashboard-undo-layout"/);
  assert.match(html, /id="dashboard-redo-layout"/);
  assert.match(html, /id="dashboard-reset-layout"/);
  assert.match(html, /id="dashboard-layout-viewport"/);
  assert.match(html, /data-verification-test="9\.4" hidden/);
  assert.match(html, /id="start-slice-9-4-live-test"/);

  assert.match(editor, /layoutState\(\)/);
  assert.match(editor, /applySavedLayout\(/);
  assert.match(editor, /resetLayout\(/);
  assert.match(editor, /undoStack/);
  assert.match(editor, /redoStack/);
  assert.match(editor, /undo\(\)/);
  assert.match(editor, /redo\(\)/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage/);

  assert.match(script, /\/api\/dashboard-layouts\/save/);
  assert.match(script, /\/api\/dashboard-layouts\/reload/);
  assert.match(script, /dashboardSmallViewport/);
  assert.match(script, /Small-screen layout/);
  assert.match(script, /Disk reload verified: true/);
  assert.match(script, /Action Gateway requests: 0/);
  assert.doesNotMatch(`${script}\n${editor}`, /importLayout|exportLayout|Import dashboard|Export dashboard/);

  assert.match(server, /\/api\/dashboard-layouts/);
  assert.match(server, /dashboardLayoutStore/);
  assert.match(main, /dashboard-layouts\.json/);
  assert.match(main, /userPaths\.configDir/);
});

test("Slice 9.4 keeps historical 9.1 through 9.3 harnesses retained", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  for (const slice of ["9.1", "9.2", "9.3", "9.4"]) {
    assert.match(
      html,
      new RegExp(`data-verification-test="${slice.replace(".", "\\.")}" hidden`),
    );
  }
  assert.match(html, /id="start-slice-9-1-live-test"/);
  assert.match(html, /id="start-slice-9-2-live-test"/);
  assert.match(html, /id="start-slice-9-3-live-test"/);
  assert.match(html, /id="start-slice-9-4-live-test"/);
});

test("Slice 9.4 dashboard layout API persists and reloads Desktop/Small-screen profiles", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-slice94-dashboard-"));
  const runtime = new CoreRuntime();
  runtime.start();
  const store = new DashboardLayoutStore(join(root, "dashboard-layouts.json"), {
    createId: () => "profile-live-test",
  });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice94-dashboard-test" }),
    runtime,
    dashboardLayoutStore: store,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const initialResponse = await fetch(`${url}/api/dashboard-layouts`);
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json();
    assert.equal(initial.activeProfileId, "default");

    const created = await postJson(url, "/api/dashboard-layouts/profile", { name: "Live profile" });
    assert.equal(created.activeProfileId, "profile-live-test");

    await postJson(url, "/api/dashboard-layouts/save", {
      profileId: "profile-live-test",
      viewport: "desktop",
      layout: savedLayout("combat"),
    });
    await postJson(url, "/api/dashboard-layouts/save", {
      profileId: "profile-live-test",
      viewport: "small",
      layout: savedLayout("debugging"),
    });

    const reloaded = await postJson(url, "/api/dashboard-layouts/reload");
    const profile = reloaded.profiles.find((entry) => entry.id === "profile-live-test");
    assert.equal(profile.layouts.desktop.activePage, "combat");
    assert.equal(profile.layouts.small.activePage, "debugging");

    const reset = await postJson(url, "/api/dashboard-layouts/reset", {
      profileId: "profile-live-test",
      viewport: "small",
    });
    const resetProfile = reset.profiles.find((entry) => entry.id === "profile-live-test");
    assert.equal(resetProfile.layouts.small, undefined);
    assert.equal(resetProfile.layouts.desktop.activePage, "combat");

    const selected = await postJson(url, "/api/dashboard-layouts/select", { profileId: "default" });
    assert.equal(selected.activeProfileId, "default");
    const deleted = await postJson(url, "/api/dashboard-layouts/delete", {
      profileId: "profile-live-test",
    });
    assert.equal(deleted.profiles.length, 1);
    assert.equal(deleted.activeProfileId, "default");
  } finally {
    await dashboard.stop();
    runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
