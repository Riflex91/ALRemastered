import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredAdventureLandVersion {
  readonly schemaVersion: 1;
  readonly version: number;
  readonly lastDeploy?: string;
  readonly observedAt: string;
}

export class AdventureLandVersionStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  load(): StoredAdventureLandVersion | undefined {
    if (!existsSync(this.#path)) return undefined;

    try {
      const parsed = JSON.parse(readFileSync(this.#path, "utf8")) as Partial<StoredAdventureLandVersion>;
      if (
        parsed.schemaVersion !== 1 ||
        !Number.isSafeInteger(parsed.version) ||
        (parsed.version ?? 0) <= 0 ||
        typeof parsed.observedAt !== "string"
      ) {
        return undefined;
      }

      return Object.freeze({
        schemaVersion: 1,
        version: parsed.version!,
        lastDeploy: typeof parsed.lastDeploy === "string" ? parsed.lastDeploy : undefined,
        observedAt: parsed.observedAt,
      });
    } catch {
      return undefined;
    }
  }

  save(record: StoredAdventureLandVersion): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    const temporary = this.#path + ".tmp";
    writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", "utf8");
    rmSync(this.#path, { force: true });
    renameSync(temporary, this.#path);
  }
}
