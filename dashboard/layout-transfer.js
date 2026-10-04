const KIND = "ALRemasteredDashboardProfile";
const MAX_ROLES = 32;
const MAX_WIDGETS = 128;
const DISPLAY_MODES = new Set(["standard", "compact", "spacious"]);

export function createPortableDashboardProfile(profile) {
  const source = normalizeStoredProfile(profile);
  const characterRoles = new Map();
  const roles = [];

  const roleForCharacter = (characterId) => {
    if (!characterId) return null;
    const key = String(characterId);
    let roleId = characterRoles.get(key);
    if (!roleId) {
      roleId = `character-role-${characterRoles.size + 1}`;
      characterRoles.set(key, roleId);
      roles.push({
        id: roleId,
        label: `Character role ${roles.length + 1}`,
      });
    }
    return roleId;
  };

  const layouts = {};
  for (const variant of ["desktop", "small"]) {
    const layout = source.layouts?.[variant];
    if (!layout) continue;
    layouts[variant] = {
      schemaVersion: 1,
      order: [...layout.order],
      widgets: layout.widgets.map((widget) => ({
        id: widget.id,
        duplicateOf: widget.duplicateOf,
        columns: widget.columns,
        height: widget.height,
        removed: widget.removed,
        characterRole: roleForCharacter(widget.characterId),
        hiddenFields: [...widget.hiddenFields],
        displayMode: widget.displayMode,
      })),
    };
  }

  if (!Object.keys(layouts).length) {
    throw new Error("Save at least one dashboard layout before exporting the profile.");
  }

  return normalizePortableDashboardProfile({
    kind: KIND,
    schemaVersion: 1,
    profile: {
      name: source.name,
      roles,
      layouts,
    },
  });
}

export function parsePortableDashboardProfile(input) {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  return normalizePortableDashboardProfile(value);
}

export function resolvePortableDashboardProfile(portableInput, roleMapping = {}) {
  const portable = normalizePortableDashboardProfile(portableInput);
  const mapping = new Map();

  for (const role of portable.profile.roles) {
    const characterId = String(roleMapping?.[role.id] ?? "").trim();
    if (!characterId || characterId.length > 180) {
      throw new Error(`Character mapping is required for ${role.label}.`);
    }
    mapping.set(role.id, characterId);
  }

  const layouts = {};
  for (const variant of ["desktop", "small"]) {
    const layout = portable.profile.layouts[variant];
    if (!layout) continue;
    layouts[variant] = {
      schemaVersion: 1,
      order: [...layout.order],
      widgets: layout.widgets.map((widget) => ({
        id: widget.id,
        duplicateOf: widget.duplicateOf,
        columns: widget.columns,
        height: widget.height,
        removed: widget.removed,
        characterId: widget.characterRole ? mapping.get(widget.characterRole) : "",
        hiddenFields: [...widget.hiddenFields],
        displayMode: widget.displayMode,
      })),
    };
  }

  return {
    name: portable.profile.name,
    layouts,
  };
}

export function portableDashboardRoleIds(portableInput) {
  return normalizePortableDashboardProfile(portableInput).profile.roles.map((role) => role.id);
}

function normalizePortableDashboardProfile(value) {
  if (!record(value) || value.kind !== KIND || value.schemaVersion !== 1 || !record(value.profile)) {
    throw new Error("Dashboard import file is not a supported ALRemastered dashboard profile.");
  }

  const name = cleanString(value.profile.name, 80, "Dashboard profile name is invalid.");
  if (!Array.isArray(value.profile.roles) || value.profile.roles.length > MAX_ROLES) {
    throw new Error("Dashboard role list is invalid.");
  }
  const roles = value.profile.roles.map((role, index) => normalizeRole(role, index));
  const roleIds = new Set(roles.map((role) => role.id));
  if (roleIds.size !== roles.length) throw new Error("Dashboard role IDs must be unique.");

  if (!record(value.profile.layouts)) throw new Error("Dashboard layouts are invalid.");
  const layouts = {};
  for (const variant of ["desktop", "small"]) {
    if (value.profile.layouts[variant] === undefined) continue;
    layouts[variant] = normalizePortableLayout(value.profile.layouts[variant], roleIds);
  }
  if (!Object.keys(layouts).length) throw new Error("Dashboard import file contains no layouts.");

  return {
    kind: KIND,
    schemaVersion: 1,
    profile: {
      name,
      roles,
      layouts,
    },
  };
}

function normalizeStoredProfile(profile) {
  if (!record(profile)) throw new Error("Dashboard profile is unavailable.");
  const name = cleanString(profile.name, 80, "Dashboard profile name is invalid.");
  if (!record(profile.layouts)) throw new Error("Dashboard profile layouts are invalid.");
  const layouts = {};
  for (const variant of ["desktop", "small"]) {
    if (profile.layouts[variant] === undefined) continue;
    layouts[variant] = normalizeStoredLayout(profile.layouts[variant]);
  }
  return { name, layouts };
}

function normalizeStoredLayout(value) {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.order) || !Array.isArray(value.widgets)) {
    throw new Error("Dashboard layout payload is invalid.");
  }
  if (value.widgets.length > MAX_WIDGETS) throw new Error("Dashboard layout contains too many widgets.");
  const widgets = value.widgets.map(normalizeStoredWidget);
  const ids = new Set(widgets.map((widget) => widget.id));
  const order = normalizeOrder(value.order, ids);
  return { schemaVersion: 1, order, widgets };
}

function normalizePortableLayout(value, roleIds) {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.order) || !Array.isArray(value.widgets)) {
    throw new Error("Portable dashboard layout is invalid.");
  }
  if (value.widgets.length > MAX_WIDGETS) throw new Error("Portable dashboard layout contains too many widgets.");
  const widgets = value.widgets.map((widget) => normalizePortableWidget(widget, roleIds));
  const ids = new Set(widgets.map((widget) => widget.id));
  const order = normalizeOrder(value.order, ids);
  return { schemaVersion: 1, order, widgets };
}

function normalizeStoredWidget(value) {
  if (!record(value)) throw new Error("Dashboard layout widget is invalid.");
  const geometry = normalizeWidgetGeometry(value);
  return {
    ...geometry,
    characterId: typeof value.characterId === "string" ? value.characterId : "",
  };
}

function normalizePortableWidget(value, roleIds) {
  if (!record(value)) throw new Error("Portable dashboard widget is invalid.");
  if (Object.prototype.hasOwnProperty.call(value, "characterId")) {
    throw new Error("Portable dashboard widgets must use character roles instead of fixed Character IDs.");
  }
  const geometry = normalizeWidgetGeometry(value);
  let characterRole = null;
  if (value.characterRole !== null && value.characterRole !== undefined && value.characterRole !== "") {
    characterRole = cleanString(value.characterRole, 80, "Dashboard character role is invalid.");
    if (!roleIds.has(characterRole)) throw new Error("Dashboard widget references an unknown character role.");
  }
  return { ...geometry, characterRole };
}

function normalizeWidgetGeometry(value) {
  const id = cleanString(value.id, 160, "Dashboard widget ID is invalid.");
  const duplicateOf =
    value.duplicateOf === null || value.duplicateOf === undefined
      ? null
      : cleanString(value.duplicateOf, 160, "Dashboard duplicate widget source is invalid.");
  const columns = Number(value.columns);
  const height = value.height === null || value.height === undefined ? null : Number(value.height);
  if (!Number.isInteger(columns) || columns < 3 || columns > 12) {
    throw new Error("Dashboard widget columns are invalid.");
  }
  if (height !== null && (!Number.isFinite(height) || height < 96 || height > 10000)) {
    throw new Error("Dashboard widget height is invalid.");
  }
  if (!Array.isArray(value.hiddenFields)) throw new Error("Dashboard widget hidden fields are invalid.");
  const hiddenFields = value.hiddenFields.map((item) =>
    cleanString(item, 160, "Dashboard hidden field is invalid.")
  );
  if (!DISPLAY_MODES.has(value.displayMode)) throw new Error("Dashboard widget display mode is invalid.");
  return {
    id,
    duplicateOf,
    columns,
    height,
    removed: Boolean(value.removed),
    hiddenFields,
    displayMode: value.displayMode,
  };
}

function normalizeRole(value, index) {
  if (!record(value)) throw new Error("Dashboard character role is invalid.");
  const id = cleanString(value.id, 80, "Dashboard character role ID is invalid.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)) {
    throw new Error("Dashboard character role ID is invalid.");
  }
  const label = cleanString(
    value.label ?? `Character role ${index + 1}`,
    80,
    "Dashboard character role label is invalid.",
  );
  return { id, label };
}

function normalizeOrder(order, ids) {
  const normalized = order.map((item) => cleanString(item, 160, "Dashboard widget order is invalid."));
  if (new Set(normalized).size !== normalized.length || normalized.some((id) => !ids.has(id))) {
    throw new Error("Dashboard widget order is invalid.");
  }
  return normalized;
}

function cleanString(value, maxLength, message) {
  if (typeof value !== "string") throw new Error(message);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(message);
  return text;
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
