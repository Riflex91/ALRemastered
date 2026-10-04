import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DashboardLayoutStore,
  normalizeDashboardSavedLayout,
} from "../src/dashboard/layout-store.ts";

function sampleLayout(page = "overview") {
  return {
    schemaVersion: 1,
    activePage: page,
    order: ["widget-a", "widget-b"],
    removed: ["widget-b"],
    widgets: {
      "widget-a": {
        columns: 7,
        height: 192,
        characterId: "char-a",
        hiddenFields: ["field-1"],
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

test("dashboard layout store persists profiles and desktop/small variants across recreation", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-dashboard-layouts-"));
  const path = join(root, "dashboard-layouts.json");
  let now = Date.parse("2026-10-04T11:15:00.000Z");
  let id = 0;
  try {
    const store = new DashboardLayoutStore(path, {
      clock: () => new Date(now),
      createId: () => `profile-test-${++id}`,
    });

    assert.equal(store.state().activeProfileId, "default");
    assert.equal(store.state().profiles.length, 1);

    now += 1_000;
    const created = store.createProfile("Raiding");
    const profileId = created.activeProfileId;
    assert.equal(profileId, "profile-test-1");
    assert.equal(created.profiles.find((profile) => profile.id === profileId)?.name, "Raiding");

    store.saveLayout(profileId, "desktop", sampleLayout("combat"));
    now += 1_000;
    store.saveLayout(profileId, "small", sampleLayout("party"));

    const reopened = new DashboardLayoutStore(path);
    const state = reopened.state();
    assert.equal(state.activeProfileId, profileId);
    const profile = state.profiles.find((entry) => entry.id === profileId);
    assert.equal(profile?.layouts.desktop?.activePage, "combat");
    assert.equal(profile?.layouts.small?.activePage, "party");
    assert.equal(profile?.layouts.desktop?.widgets["widget-a"]?.columns, 7);
    assert.equal(profile?.layouts.desktop?.widgets["widget-a"]?.displayMode, "compact");

    const raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.schemaVersion, 1);
    assert.equal(raw.profiles.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dashboard layout reset clears only the selected viewport variant", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-dashboard-layout-reset-"));
  try {
    const store = new DashboardLayoutStore(join(root, "dashboard-layouts.json"), {
      createId: () => "profile-reset",
    });
    const profileId = store.createProfile("Reset test").activeProfileId;
    store.saveLayout(profileId, "desktop", sampleLayout("combat"));
    store.saveLayout(profileId, "small", sampleLayout("logs"));

    const state = store.resetLayout(profileId, "small");
    const profile = state.profiles.find((entry) => entry.id === profileId);
    assert.equal(profile?.layouts.small, undefined);
    assert.equal(profile?.layouts.desktop?.activePage, "combat");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dashboard layout profiles can be selected and deleted while one profile always remains", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-dashboard-layout-profiles-"));
  let id = 0;
  try {
    const store = new DashboardLayoutStore(join(root, "dashboard-layouts.json"), {
      createId: () => `profile-${++id}`,
    });

    const first = store.createProfile("One").activeProfileId;
    const second = store.createProfile("Two").activeProfileId;
    assert.equal(second, "profile-2");
    assert.equal(store.selectProfile(first).activeProfileId, first);

    const afterDelete = store.deleteProfile(first);
    assert.equal(afterDelete.profiles.some((profile) => profile.id === first), false);
    assert.equal(afterDelete.activeProfileId, "default");

    store.deleteProfile(second);
    assert.equal(store.state().profiles.length, 1);
    assert.throws(() => store.deleteProfile("default"), /At least one dashboard profile/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dashboard saved layout validation rejects malformed or unsafe layout data", () => {
  assert.equal(normalizeDashboardSavedLayout(sampleLayout()).schemaVersion, 1);

  assert.throws(
    () => normalizeDashboardSavedLayout({ ...sampleLayout(), order: ["widget-a", "widget-a"] }),
    /duplicates/,
  );
  assert.throws(
    () => normalizeDashboardSavedLayout({
      ...sampleLayout(),
      widgets: {
        ...sampleLayout().widgets,
        "widget-a": { ...sampleLayout().widgets["widget-a"], columns: 99 },
      },
    }),
    /columns/,
  );
  assert.throws(
    () => normalizeDashboardSavedLayout({ ...sampleLayout(), activePage: "secrets" }),
    /page/,
  );
});
