import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DashboardLayoutStore,
  type DashboardPersistentLayout,
} from "../src/dashboard/layout-store.ts";

function layout(columns: number): DashboardPersistentLayout {
  return {
    schemaVersion: 1,
    order: ["widget-a"],
    widgets: [{
      id: "widget-a",
      duplicateOf: null,
      columns,
      height: 192,
      removed: false,
      characterId: "",
      hiddenFields: [],
      displayMode: "standard",
    }],
  };
}

test("dashboard layout store persists profiles and desktop/small variants across reload", () => {
  const directory = mkdtempSync(join(tmpdir(), "alremastered-layout-"));
  try {
    const path = join(directory, "dashboard-layouts.json");
    const store = new DashboardLayoutStore(path);

    assert.equal(store.state().activeProfileId, "default");
    assert.equal(store.state().profiles.length, 1);

    store.createProfile("combat", "Combat layout");
    store.saveLayout("combat", "desktop", layout(8));
    store.saveLayout("combat", "small", layout(12));
    store.createProfile("merchant", "Merchant layout");
    store.setActive("combat");

    const restarted = new DashboardLayoutStore(path);
    const state = restarted.state();
    assert.equal(state.activeProfileId, "combat");
    assert.deepEqual(state.profiles.map((profile) => profile.id), ["default", "combat", "merchant"]);

    const combat = state.profiles.find((profile) => profile.id === "combat");
    assert.equal(combat?.layouts.desktop?.widgets[0]?.columns, 8);
    assert.equal(combat?.layouts.small?.widgets[0]?.columns, 12);

    restarted.resetVariant("combat", "small");
    assert.equal(
      restarted.state().profiles.find((profile) => profile.id === "combat")?.layouts.small,
      undefined,
    );

    restarted.deleteProfile("merchant");
    assert.equal(restarted.state().profiles.some((profile) => profile.id === "merchant"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dashboard layout store rejects invalid geometry and profile identifiers", () => {
  const directory = mkdtempSync(join(tmpdir(), "alremastered-layout-invalid-"));
  try {
    const store = new DashboardLayoutStore(join(directory, "dashboard-layouts.json"));
    assert.throws(() => store.createProfile("../bad", "Bad"), /profile ID/i);
    assert.throws(
      () => store.saveLayout("default", "desktop", layout(2)),
      /geometry/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
