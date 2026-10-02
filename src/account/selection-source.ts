import type { AdventureLandAccountSession } from "./source.ts";

export interface AdventureLandCharacterSummary {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly level: number;
  readonly online: boolean;
  readonly serverKey?: string;
  readonly map?: string;
  readonly home?: string;
}

export interface AdventureLandServerSummary {
  readonly key: string;
  readonly name: string;
  readonly region: string;
  readonly players: number;
  readonly address: string;
  readonly path: string;
}

export interface AdventureLandSelectionSnapshot {
  readonly characters: readonly AdventureLandCharacterSummary[];
  readonly servers: readonly AdventureLandServerSummary[];
}

export class AdventureLandSelectionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AdventureLandSelectionError";
    this.code = code;
  }
}

export const ADVENTURE_LAND_SELECTION_URL =
  "https://adventure.land/api/servers_and_characters";

export class AdventureLandSelectionSource {
  readonly #fetch: typeof fetch;
  readonly #url: string;

  constructor(
    fetchImpl: typeof fetch = fetch,
    url = ADVENTURE_LAND_SELECTION_URL,
  ) {
    this.#fetch = fetchImpl;
    this.#url = url;
  }

  async load(session: AdventureLandAccountSession): Promise<AdventureLandSelectionSnapshot> {
    let response: Response;
    try {
      response = await this.#fetch(this.#url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "ALRemastered",
          Cookie: `auth=${session.userId}-${session.auth}`,
        },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AdventureLandSelectionError(
        "Could not load Adventure Land characters and servers.",
        "network_error",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AdventureLandSelectionError(
        "Adventure Land returned an invalid characters and servers response.",
        "invalid_response",
      );
    }

    if (!response.ok) {
      throw new AdventureLandSelectionError(
        "Adventure Land characters and servers request failed with HTTP " + response.status + ".",
        "http_error",
      );
    }
    if (!isRecord(payload)) {
      throw new AdventureLandSelectionError(
        "Adventure Land returned an invalid characters and servers response.",
        "invalid_response",
      );
    }
    if (payload.failed === true) {
      const reason = typeof payload.reason === "string" ? payload.reason : "request_failed";
      throw new AdventureLandSelectionError(selectionFailureMessage(reason), reason);
    }

    const infs = Array.isArray(payload.infs) ? payload.infs : [];
    const selection = infs.find(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) && entry.type === "servers_and_characters",
    );
    if (!selection || !Array.isArray(selection.characters) || !Array.isArray(selection.servers)) {
      throw new AdventureLandSelectionError(
        "Adventure Land returned no characters and servers payload.",
        "invalid_response",
      );
    }

    return Object.freeze({
      characters: Object.freeze(selection.characters.flatMap(parseCharacter)),
      servers: Object.freeze(selection.servers.flatMap(parseServer)),
    });
  }
}

function parseCharacter(value: unknown): AdventureLandCharacterSummary[] {
  if (!isRecord(value)) return [];
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.type !== "string" ||
    typeof value.level !== "number" ||
    !Number.isFinite(value.level)
  ) {
    return [];
  }

  return [Object.freeze({
    id: value.id,
    name: value.name,
    type: value.type,
    level: value.level,
    online: Boolean(value.online),
    serverKey: typeof value.server === "string" ? value.server : undefined,
    map: typeof value.map === "string" ? value.map : undefined,
    home: typeof value.home === "string" ? value.home : undefined,
  })];
}

function parseServer(value: unknown): AdventureLandServerSummary[] {
  if (!isRecord(value)) return [];
  if (
    typeof value.key !== "string" ||
    typeof value.name !== "string" ||
    typeof value.region !== "string" ||
    typeof value.address !== "string" ||
    typeof value.path !== "string"
  ) {
    return [];
  }

  return [Object.freeze({
    key: value.key,
    name: value.name,
    region: value.region,
    players:
      typeof value.players === "number" && Number.isFinite(value.players)
        ? value.players
        : 0,
    address: value.address,
    path: value.path,
  })];
}

function selectionFailureMessage(reason: string): string {
  switch (reason) {
    case "not_logged_in":
    case "invalid_auth":
    case "unauthorized":
      return "Adventure Land account session is no longer valid. Reconnect the account.";
    default:
      return "Adventure Land rejected the characters and servers request (" + reason + ").";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
