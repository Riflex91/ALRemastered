import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type DashboardLayoutVariant = "desktop" | "small";

export interface DashboardPersistentWidget {
  readonly id: string;
  readonly duplicateOf: string | null;
  readonly columns: number;
  readonly height: number | null;
  readonly removed: boolean;
  readonly characterId: string;
  readonly hiddenFields: readonly string[];
  readonly displayMode: "standard" | "compact" | "spacious";
}

export interface DashboardPersistentLayout {
  readonly schemaVersion: 1;
  readonly order: readonly string[];
  readonly widgets: readonly DashboardPersistentWidget[];
}

export interface DashboardLayoutProfile {
  readonly id: string;
  readonly name: string;
  readonly layouts: Readonly<Partial<Record<DashboardLayoutVariant, DashboardPersistentLayout>>>;
  readonly updatedAt?: string;
}

export interface DashboardLayoutStoreState {
  readonly schemaVersion: 1;
  readonly activeProfileId: string;
  readonly profiles: readonly DashboardLayoutProfile[];
}

export class DashboardLayoutStore {
  readonly #path: string;
  #state: DashboardLayoutStoreState;

  constructor(path: string) {
    this.#path = path;
    this.#state = this.#load();
  }

  state(): DashboardLayoutStoreState {
    return clone(this.#state);
  }

  reload(): DashboardLayoutStoreState {
    this.#state = this.#load();
    return this.state();
  }

  createProfile(id: string, name: string): DashboardLayoutStoreState {
    const profileId = profileIdValue(id);
    if (this.#state.profiles.some((profile) => profile.id === profileId)) {
      throw new Error("Dashboard layout profile already exists.");
    }
    this.#state = {
      schemaVersion: 1,
      activeProfileId: profileId,
      profiles: [
        ...this.#state.profiles,
        { id: profileId, name: profileNameValue(name), layouts: {}, updatedAt: now() },
      ],
    };
    return this.#commit();
  }

  setActive(profileId: string): DashboardLayoutStoreState {
    const id = profileIdValue(profileId);
    if (!this.#state.profiles.some((profile) => profile.id === id)) {
      throw new Error("Dashboard layout profile does not exist.");
    }
    this.#state = { ...this.#state, activeProfileId: id };
    return this.#commit();
  }

  saveLayout(
    profileId: string,
    variant: DashboardLayoutVariant,
    layout: DashboardPersistentLayout,
  ): DashboardLayoutStoreState {
    const id = profileIdValue(profileId);
    const targetVariant = variantValue(variant);
    const validated = layoutValue(layout);
    const existing = this.#state.profiles.find((profile) => profile.id === id);
    if (!existing) throw new Error("Dashboard layout profile does not exist.");
    const updated: DashboardLayoutProfile = {
      ...existing,
      layouts: { ...existing.layouts, [targetVariant]: validated },
      updatedAt: now(),
    };
    this.#state = {
      schemaVersion: 1,
      activeProfileId: id,
      profiles: this.#state.profiles.map((profile) => profile.id === id ? updated : profile),
    };
    return this.#commit();
  }

  resetVariant(profileId: string, variant: DashboardLayoutVariant): DashboardLayoutStoreState {
    const id = profileIdValue(profileId);
    const targetVariant = variantValue(variant);
    const existing = this.#state.profiles.find((profile) => profile.id === id);
    if (!existing) throw new Error("Dashboard layout profile does not exist.");
    const layouts = { ...existing.layouts };
    delete layouts[targetVariant];
    const updated: DashboardLayoutProfile = { ...existing, layouts, updatedAt: now() };
    this.#state = {
      ...this.#state,
      profiles: this.#state.profiles.map((profile) => profile.id === id ? updated : profile),
    };
    return this.#commit();
  }

  deleteProfile(profileId: string): DashboardLayoutStoreState {
    const id = profileIdValue(profileId);
    const profiles = this.#state.profiles.filter((profile) => profile.id !== id);
    if (profiles.length === this.#state.profiles.length) {
      throw new Error("Dashboard layout profile does not exist.");
    }
    const remaining = profiles.length ? profiles : [defaultProfile()];
    this.#state = {
      schemaVersion: 1,
      activeProfileId: this.#state.activeProfileId === id ? remaining[0].id : this.#state.activeProfileId,
      profiles: remaining,
    };
    return this.#commit();
  }

  #load(): DashboardLayoutStoreState {
    if (!existsSync(this.#path)) return defaultState();
    try {
      return stateValue(JSON.parse(readFileSync(this.#path, "utf8")));
    } catch {
      return defaultState();
    }
  }

  #commit(): DashboardLayoutStoreState {
    mkdirSync(dirname(this.#path), { recursive: true });
    writeFileSync(this.#path, JSON.stringify(this.#state, null, 2) + "\n", "utf8");
    return this.state();
  }
}

function defaultProfile(): DashboardLayoutProfile {
  return { id: "default", name: "Default", layouts: {} };
}

function defaultState(): DashboardLayoutStoreState {
  return { schemaVersion: 1, activeProfileId: "default", profiles: [defaultProfile()] };
}

function stateValue(value: unknown): DashboardLayoutStoreState {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.profiles)) {
    throw new Error("Dashboard layout store is invalid.");
  }
  const profiles = value.profiles.map(profileValue);
  if (!profiles.length) throw new Error("Dashboard layout store has no profiles.");
  const activeProfileId = profileIdValue(String(value.activeProfileId ?? ""));
  if (!profiles.some((profile) => profile.id === activeProfileId)) {
    throw new Error("Dashboard layout active profile is invalid.");
  }
  return { schemaVersion: 1, activeProfileId, profiles };
}

function profileValue(value: unknown): DashboardLayoutProfile {
  if (!record(value) || !record(value.layouts)) throw new Error("Dashboard layout profile is invalid.");
  const layouts: Partial<Record<DashboardLayoutVariant, DashboardPersistentLayout>> = {};
  if (value.layouts.desktop !== undefined) layouts.desktop = layoutValue(value.layouts.desktop);
  if (value.layouts.small !== undefined) layouts.small = layoutValue(value.layouts.small);
  return {
    id: profileIdValue(String(value.id ?? "")),
    name: profileNameValue(String(value.name ?? "")),
    layouts,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function layoutValue(value: unknown): DashboardPersistentLayout {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.order) || !Array.isArray(value.widgets)) {
    throw new Error("Dashboard layout payload is invalid.");
  }
  const widgets = value.widgets.map(widgetValue);
  const ids = new Set(widgets.map((widget) => widget.id));
  const order = value.order.map((item) => String(item));
  if (new Set(order).size !== order.length || order.some((id) => !ids.has(id))) {
    throw new Error("Dashboard layout widget order is invalid.");
  }
  return { schemaVersion: 1, order, widgets };
}

function widgetValue(value: unknown): DashboardPersistentWidget {
  if (!record(value)) throw new Error("Dashboard layout widget is invalid.");
  const id = String(value.id ?? "");
  const columns = Number(value.columns);
  const height = value.height === null || value.height === undefined ? null : Number(value.height);
  const mode = value.displayMode;
  if (!id || id.length > 160 || !Number.isInteger(columns) || columns < 3 || columns > 12) {
    throw new Error("Dashboard layout widget geometry is invalid.");
  }
  if (height !== null && (!Number.isFinite(height) || height < 96 || height > 10000)) {
    throw new Error("Dashboard layout widget height is invalid.");
  }
  if (!Array.isArray(value.hiddenFields)) throw new Error("Dashboard layout hidden fields are invalid.");
  if (mode !== "standard" && mode !== "compact" && mode !== "spacious") {
    throw new Error("Dashboard layout display mode is invalid.");
  }
  return {
    id,
    duplicateOf: value.duplicateOf === null || value.duplicateOf === undefined ? null : String(value.duplicateOf),
    columns,
    height,
    removed: Boolean(value.removed),
    characterId: typeof value.characterId === "string" ? value.characterId : "",
    hiddenFields: value.hiddenFields.map((item) => String(item)),
    displayMode: mode,
  };
}

function variantValue(value: string): DashboardLayoutVariant {
  if (value === "desktop" || value === "small") return value;
  throw new Error("Dashboard layout variant must be desktop or small.");
}

function profileIdValue(value: string): string {
  const id = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) {
    throw new Error("Dashboard layout profile ID is invalid.");
  }
  return id;
}

function profileNameValue(value: string): string {
  const name = String(value ?? "").trim();
  if (!name || name.length > 80) throw new Error("Dashboard layout profile name is invalid.");
  return name;
}

function now(): string {
  return new Date().toISOString();
}

function clone(state: DashboardLayoutStoreState): DashboardLayoutStoreState {
  return JSON.parse(JSON.stringify(state)) as DashboardLayoutStoreState;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
