import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface UpdatePreferences {
  readonly skippedVersion?: string;
  readonly snoozedVersion?: string;
  readonly snoozedUntil?: string;
}

export class UpdatePreferenceStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  load(): UpdatePreferences {
    if (!existsSync(this.#path)) return {};

    try {
      const parsed = JSON.parse(readFileSync(this.#path, "utf8")) as UpdatePreferences;
      return {
        skippedVersion: typeof parsed.skippedVersion === "string" ? parsed.skippedVersion : undefined,
        snoozedVersion: typeof parsed.snoozedVersion === "string" ? parsed.snoozedVersion : undefined,
        snoozedUntil: typeof parsed.snoozedUntil === "string" ? parsed.snoozedUntil : undefined,
      };
    } catch {
      return {};
    }
  }

  save(preferences: UpdatePreferences): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
    rmSync(this.#path, { force: true });
    renameSync(temporary, this.#path);
  }
}
