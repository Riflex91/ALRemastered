import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type DashboardViewportProfile = "desktop" | "small";

export interface DashboardSavedWidget {
  readonly columns: number;
  readonly height: number | null;
  readonly characterId: string;
  readonly hiddenFields: readonly string[];
  readonly displayMode: "standard" | "compact" | "spacious";
  readonly duplicateOf: string | null;
}

export interface DashboardSavedLayout {
  readonly schemaVersion: 1;
  readonly activePage: "overview" | "combat" | "party" | "merchant" | "logs" | "debugging";
  readonly order: readonly string[];
  readonly removed: readonly string[];
  readonly widgets: Readonly<Record<string, DashboardSavedWidget>>;
}

export interface DashboardLayoutProfile {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly layouts: Readonly<Partial<Record<DashboardViewportProfile, DashboardSavedLayout>>>;
}

export interface DashboardLayoutStoreState {
  readonly schemaVersion: 1;
  readonly activeProfileId: string;
  readonly profiles: readonly DashboardLayoutProfile[];
}

export interface DashboardLayoutStoreOptions {
  readonly clock?: () => Date;
  readonly createId?: () => string;
}

const DEFAULT_PROFILE_ID = "default";
const MAX_PROFILES = 12;
const MAX_WIDGETS = 128;
const MAX_HIDDEN_FIELDS = 64;
const PAGE_IDS = new Set(["overview", "combat", "party", "merchant", "logs", "debugging"]);
const DISPLAY_MODES = new Set(["standard", "compact", "spacious"]);

export class DashboardLayoutStore {
  readonly #path: string;
  readonly #clock: () => Date;
  readonly #createId: () => string;
  #state: DashboardLayoutStoreState;

  constructor(path: string, options: DashboardLayoutStoreOptions = {}) {
    this.#path = path;
    this.#clock = options.clock ?? (() => new Date());
    this.#createId = options.createId ?? (() => `profile-${randomUUID()}`);
    this.#state = this.#load();
  }

  state(): DashboardLayoutStoreState {
    return cloneState(this.#state);
  }

  reload(): DashboardLayoutStoreState {
    this.#state = this.#load();
    return this.state();
  }

  createProfile(name: string): DashboardLayoutStoreState {
    const normalizedName = normalizeProfileName(name);
    if (this.#state.profiles.length >= MAX_PROFILES) {
      throw new Error(`Dashboard profile limit reached (${MAX_PROFILES}).`);
    }

    const now = this.#clock().toISOString();
    let id = normalizeProfileId(this.#createId());
    while (this.#state.profiles.some((profile) => profile.id === id)) {
      id = normalizeProfileId(this.#createId());
    }

    const profile: DashboardLayoutProfile = Object.freeze({
      id,
      name: normalizedName,
      createdAt: now,
      updatedAt: now,
      layouts: Object.freeze({}),
    });
    this.#state = freezeState({
      schemaVersion: 1,
      activeProfileId: id,
      profiles: [...this.#state.profiles, profile],
    });
    this.#save();
    return this.state();
  }

  selectProfile(profileId: string): DashboardLayoutStoreState {
    const id = normalizeProfileId(profileId);
    if (!this.#state.profiles.some((profile) => profile.id === id)) {
      throw new Error("Dashboard profile does not exist.");
    }
    if (this.#state.activeProfileId === id) return this.state();
    this.#state = freezeState({
      ...this.#state,
      activeProfileId: id,
    });
    this.#save();
    return this.state();
  }

  deleteProfile(profileId: string): DashboardLayoutStoreState {
    const id = normalizeProfileId(profileId);
    if (this.#state.profiles.length <= 1) {
      throw new Error("At least one dashboard profile must remain.");
    }
    if (!this.#state.profiles.some((profile) => profile.id === id)) {
      throw new Error("Dashboard profile does not exist.");
    }

    const profiles = this.#state.profiles.filter((profile) => profile.id !== id);
    const activeProfileId = this.#state.activeProfileId === id
      ? profiles[0]!.id
      : this.#state.activeProfileId;
    this.#state = freezeState({
      schemaVersion: 1,
      activeProfileId,
      profiles,
    });
    this.#save();
    return this.state();
  }

  saveLayout(
    profileId: string,
    viewport: DashboardViewportProfile,
    layout: unknown,
  ): DashboardLayoutStoreState {
    const id = normalizeProfileId(profileId);
    const normalizedViewport = normalizeViewport(viewport);
    const normalizedLayout = normalizeLayout(layout);
    const now = this.#clock().toISOString();
    let found = false;

    const profiles = this.#state.profiles.map((profile) => {
      if (profile.id !== id) return profile;
      found = true;
      return Object.freeze({
        ...profile,
        updatedAt: now,
        layouts: Object.freeze({
          ...profile.layouts,
          [normalizedViewport]: normalizedLayout,
        }),
      });
    });
    if (!found) throw new Error("Dashboard profile does not exist.");

    this.#state = freezeState({
      ...this.#state,
      profiles,
    });
    this.#save();
    return this.state();
  }

  resetLayout(
    profileId: string,
    viewport: DashboardViewportProfile,
  ): DashboardLayoutStoreState {
    const id = normalizeProfileId(profileId);
    const normalizedViewport = normalizeViewport(viewport);
    const now = this.#clock().toISOString();
    let found = false;

    const profiles = this.#state.profiles.map((profile) => {
      if (profile.id !== id) return profile;
      found = true;
      const layouts = { ...profile.layouts };
      delete layouts[normalizedViewport];
      return Object.freeze({
        ...profile,
        updatedAt: now,
        layouts: Object.freeze(layouts),
      });
    });
    if (!found) throw new Error("Dashboard profile does not exist.");

    this.#state = freezeState({
      ...this.#state,
      profiles,
    });
    this.#save();
    return this.state();
  }

  #load(): DashboardLayoutStoreState {
    if (!existsSync(this.#path)) return defaultState(this.#clock);
    try {
      const parsed = JSON.parse(readFileSync(this.#path, "utf8")) as unknown;
      return normalizeState(parsed);
    } catch {
      return defaultState(this.#clock());
    }
  }

  #save(): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.#state, null, 2)}\n`, "utf8");
    rmSync(this.#path, { force: true });
    renameSync(temporary, this.#path);
  }
}

export function normalizeDashboardSavedLayout(value: unknown): DashboardSavedLayout {
  return normalizeLayout(value);
}

function defaultState(clock: () => Date): DashboardLayoutStoreState {
  const now = clock().toISOString();
  return freezeState({
    schemaVersion: 1,
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: [{
      id: DEFAULT_PROFILE_ID,
      name: "Default",
      createdAt: now,
      updatedAt: now,
      layouts: {},
    }],
  });
}

function normalizeState(value: unknown): DashboardLayoutStoreState {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.profiles)) {
    throw new Error("Invalid dashboard layout store.");
  }
  if (value.profiles.length < 1 || value.profiles.length > MAX_PROFILES) {
    throw new Error("Invalid dashboard profile count.");
  }

  const profiles = value.profiles.map(normalizeProfile);
  const ids = new Set(profiles.map((profile) => profile.id));
  if (ids.size !== profiles.length) throw new Error("Duplicate dashboard profile id.");

  const activeProfileId = normalizeProfileId(value.activeProfileId);
  if (!ids.has(activeProfileId)) throw new Error("Active dashboard profile does not exist.");

  return freezeState({
    schemaVersion: 1,
    activeProfileId,
    profiles,
  });
}

function normalizeProfile(value: unknown): DashboardLayoutProfile {
  if (!isRecord(value)) throw new Error("Invalid dashboard profile.");
  const id = normalizeProfileId(value.id);
  const name = normalizeProfileName(value.name);
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  const layoutsValue = value.layouts;
  if (!isRecord(layoutsValue)) throw new Error("Invalid dashboard profile layouts.");

  const layouts: Partial<Record<DashboardViewportProfile, DashboardSavedLayout>> = {};
  if (layoutsValue.desktop !== undefined) layouts.desktop = normalizeLayout(layoutsValue.desktop);
  if (layoutsValue.small !== undefined) layouts.small = normalizeLayout(layoutsValue.small);

  return Object.freeze({
    id,
    name,
    createdAt,
    updatedAt,
    layouts: Object.freeze(layouts),
  });
}

function normalizeLayout(value: unknown): DashboardSavedLayout {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Invalid dashboard layout.");
  }
  if (!PAGE_IDS.has(String(value.activePage))) throw new Error("Invalid dashboard layout page.");
  if (!Array.isArray(value.order) || value.order.length > MAX_WIDGETS) {
    throw new Error("Invalid dashboard widget order.");
  }

  const order = value.order.map(normalizeWidgetId);
  if (new Set(order).size !== order.length) throw new Error("Dashboard widget order contains duplicates.");

  if (!Array.isArray(value.removed)) throw new Error("Invalid removed dashboard widgets.");
  const removed = value.removed.map(normalizeWidgetId);
  if (new Set(removed).size !== removed.length) throw new Error("Removed dashboard widgets contain duplicates.");

  if (!isRecord(value.widgets)) throw new Error("Invalid dashboard widget configuration.");
  const entries = Object.entries(value.widgets);
  if (entries.length > MAX_WIDGETS) throw new Error("Too many dashboard widgets.");

  const widgets: Record<string, DashboardSavedWidget> = {};
  for (const [rawId, rawWidget] of entries) {
    const id = normalizeWidgetId(rawId);
    widgets[id] = normalizeWidget(rawWidget);
  }

  if (order.some((id) => !widgets[id])) throw new Error("Dashboard widget order references missing widget data.");
  if (removed.some((id) => !widgets[id])) throw new Error("Removed dashboard widget references missing widget data.");

  return Object.freeze({
    schemaVersion: 1,
    activePage: String(value.activePage) as DashboardSavedLayout["activePage"],
    order: Object.freeze(order),
    removed: Object.freeze(removed),
    widgets: Object.freeze(widgets),
  });
}

function normalizeWidget(value: unknown): DashboardSavedWidget {
  if (!isRecord(value)) throw new Error("Invalid dashboard widget.");
  const columns = Number(value.columns);
  if (!Number.isInteger(columns) || columns < 3 || columns > 12) {
    throw new Error("Invalid dashboard widget columns.");
  }

  let height: number | null = null;
  if (value.height !== null && value.height !== undefined) {
    height = Number(value.height);
    if (!Number.isInteger(height) || height < 96 || height > 10_000) {
      throw new Error("Invalid dashboard widget height.");
    }
  }

  const characterId = value.characterId === undefined ? "" : normalizeShortString(value.characterId, 160);
  if (!Array.isArray(value.hiddenFields) || value.hiddenFields.length > MAX_HIDDEN_FIELDS) {
    throw new Error("Invalid dashboard hidden fields.");
  }
  const hiddenFields = value.hiddenFields.map((field) => normalizeShortString(field, 160));
  if (new Set(hiddenFields).size !== hiddenFields.length) {
    throw new Error("Dashboard hidden fields contain duplicates.");
  }

  const displayMode = String(value.displayMode ?? "standard");
  if (!DISPLAY_MODES.has(displayMode)) throw new Error("Invalid dashboard display mode.");

  const duplicateOf = value.duplicateOf === null || value.duplicateOf === undefined
    ? null
    : normalizeWidgetId(value.duplicateOf);

  return Object.freeze({
    columns,
    height,
    characterId,
    hiddenFields: Object.freeze(hiddenFields),
    displayMode: displayMode as DashboardSavedWidget["displayMode"],
    duplicateOf,
  });
}

function normalizeViewport(value: unknown): DashboardViewportProfile {
  if (value !== "desktop" && value !== "small") {
    throw new Error("Dashboard viewport profile must be desktop or small.");
  }
  return value;
}

function normalizeProfileId(value: unknown): string {
  const id = normalizeShortString(value, 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error("Invalid dashboard profile id.");
  }
  return id;
}

function normalizeWidgetId(value: unknown): string {
  const id = normalizeShortString(value, 180);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)) {
    throw new Error("Invalid dashboard widget id.");
  }
  return id;
}

function normalizeProfileName(value: unknown): string {
  const name = normalizeShortString(value, 40).trim();
  if (!name) throw new Error("Dashboard profile name is required.");
  return name;
}

function normalizeTimestamp(value: unknown): string {
  const text = normalizeShortString(value, 80);
  if (!Number.isFinite(Date.parse(text))) throw new Error("Invalid dashboard profile timestamp.");
  return text;
}

function normalizeShortString(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error("Invalid dashboard layout string.");
  }
  return value;
}

function freezeState(value: {
  schemaVersion: 1;
  activeProfileId: string;
  profiles: readonly DashboardLayoutProfile[];
}): DashboardLayoutStoreState {
  return Object.freeze({
    schemaVersion: 1,
    activeProfileId: value.activeProfileId,
    profiles: Object.freeze(value.profiles.map((profile) => Object.freeze({
      ...profile,
      layouts: Object.freeze({ ...profile.layouts }),
    }))),
  });
}

function cloneState(state: DashboardLayoutStoreState): DashboardLayoutStoreState {
  return freezeState({
    schemaVersion: 1,
    activeProfileId: state.activeProfileId,
    profiles: state.profiles.map((profile) => ({
      ...profile,
      layouts: {
        desktop: profile.layouts.desktop ? normalizeLayout(profile.layouts.desktop) : undefined,
        small: profile.layouts.small ? normalizeLayout(profile.layouts.small) : undefined,
      },
    })),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
