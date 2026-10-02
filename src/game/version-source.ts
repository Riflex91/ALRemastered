import {
  ADVENTURE_LAND_GAME_DATA_URL,
  type AdventureLandGameDataSource,
} from "./data-source.ts";

export interface AdventureLandRemoteVersion {
  readonly version: number;
  readonly lastDeploy?: string;
  readonly sourceUrl: string;
}

export class AdventureLandVersionSource {
  readonly #gameDataSource: Pick<AdventureLandGameDataSource, "fetchData">;

  constructor(gameDataSource: Pick<AdventureLandGameDataSource, "fetchData">) {
    this.#gameDataSource = gameDataSource;
  }

  async fetchVersion(): Promise<AdventureLandRemoteVersion> {
    const snapshot = await this.#gameDataSource.fetchData();
    return Object.freeze({
      version: snapshot.data.version,
      sourceUrl: snapshot.sourceUrl,
    });
  }
}

export const ADVENTURE_LAND_VERSION_SOURCE_URL = ADVENTURE_LAND_GAME_DATA_URL;
