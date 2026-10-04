import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPortableDashboardProfile,
  parsePortableDashboardProfile,
  portableDashboardRoleIds,
  resolvePortableDashboardProfile,
} from "../dashboard/layout-transfer.js";

function storedLayout(characterA = "CHAR_A", characterB = "CHAR_B") {
  return {
    schemaVersion: 1,
    order: ["widget-a", "widget-b", "widget-c"],
    widgets: [
      {
        id: "widget-a",
        duplicateOf: null,
        columns: 6,
        height: 192,
        removed: false,
        characterId: characterA,
        hiddenFields: ["field-a"],
        displayMode: "compact",
      },
      {
        id: "widget-b",
        duplicateOf: null,
        columns: 6,
        height: null,
        removed: false,
        characterId: characterB,
        hiddenFields: [],
        displayMode: "standard",
      },
      {
        id: "widget-c",
        duplicateOf: null,
        columns: 12,
        height: null,
        removed: true,
        characterId: characterA,
        hiddenFields: [],
        displayMode: "spacious",
      },
    ],
  };
}

test("Slice 9.5 export replaces fixed Character IDs with stable neutral roles", () => {
  const portable = createPortableDashboardProfile({
    id: "source",
    name: "Portable profile",
    layouts: {
      desktop: storedLayout("SECRET_CHARACTER_A", "SECRET_CHARACTER_B"),
      small: storedLayout("SECRET_CHARACTER_A", "SECRET_CHARACTER_B"),
    },
  });

  assert.equal(portable.kind, "ALRemasteredDashboardProfile");
  assert.equal(portable.schemaVersion, 1);
  assert.equal(portable.profile.name, "Portable profile");
  assert.deepEqual(
    portable.profile.roles,
    [
      { id: "character-role-1", label: "Character role 1" },
      { id: "character-role-2", label: "Character role 2" },
    ],
  );

  const serialized = JSON.stringify(portable);
  assert.equal(serialized.includes("SECRET_CHARACTER_A"), false);
  assert.equal(serialized.includes("SECRET_CHARACTER_B"), false);
  assert.equal(serialized.includes('"characterId"'), false);
  assert.equal(portable.profile.layouts.desktop.widgets[0].characterRole, "character-role-1");
  assert.equal(portable.profile.layouts.desktop.widgets[2].characterRole, "character-role-1");
  assert.equal(portable.profile.layouts.small.widgets[1].characterRole, "character-role-2");
});

test("Slice 9.5 import maps portable roles to current Character IDs", () => {
  const portable = createPortableDashboardProfile({
    name: "Mapped profile",
    layouts: { desktop: storedLayout("OLD_A", "OLD_B") },
  });
  const parsed = parsePortableDashboardProfile(JSON.stringify(portable));
  assert.deepEqual(portableDashboardRoleIds(parsed), ["character-role-1", "character-role-2"]);

  const resolved = resolvePortableDashboardProfile(parsed, {
    "character-role-1": "CURRENT_ALPHA",
    "character-role-2": "CURRENT_BETA",
  });

  assert.equal(resolved.name, "Mapped profile");
  assert.equal(resolved.layouts.desktop.widgets[0].characterId, "CURRENT_ALPHA");
  assert.equal(resolved.layouts.desktop.widgets[2].characterId, "CURRENT_ALPHA");
  assert.equal(resolved.layouts.desktop.widgets[1].characterId, "CURRENT_BETA");
});

test("Slice 9.5 import rejects fixed Character IDs and incomplete mappings", () => {
  const portable = createPortableDashboardProfile({
    name: "Reject profile",
    layouts: { desktop: storedLayout("OLD_A", "OLD_B") },
  });

  const unsafe = structuredClone(portable);
  unsafe.profile.layouts.desktop.widgets[0].characterId = "FIXED_SECRET";
  assert.throws(
    () => parsePortableDashboardProfile(unsafe),
    /must use character roles instead of fixed Character IDs/,
  );

  assert.throws(
    () => resolvePortableDashboardProfile(portable, {
      "character-role-1": "CURRENT_ALPHA",
    }),
    /Character mapping is required/,
  );
});

test("Slice 9.5 export requires at least one saved layout", () => {
  assert.throws(
    () => createPortableDashboardProfile({ name: "Empty", layouts: {} }),
    /Save at least one dashboard layout/,
  );
});
