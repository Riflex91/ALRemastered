import { sanitizeRecord } from "../logging/sanitizer.ts";

export const ADVENTURE_LAND_GAME_EVENT_NAMES = Object.freeze([
  "player",
  "entities",
  "new_map",
  "party_update",
  "drop",
  "chest_opened",
  "death",
  "disappear",
  "skill_timeout",
  "game_response",
] as const);

export type AdventureLandGameEventName =
  typeof ADVENTURE_LAND_GAME_EVENT_NAMES[number];

export interface AdventureLandGameEvent {
  readonly name: AdventureLandGameEventName;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly observedAt: string;
}

export function isAdventureLandGameEventName(
  value: unknown,
): value is AdventureLandGameEventName {
  return typeof value === "string" &&
    (ADVENTURE_LAND_GAME_EVENT_NAMES as readonly string[]).includes(value);
}

export function createAdventureLandGameEvent(
  name: AdventureLandGameEventName,
  payload: Readonly<Record<string, unknown>>,
  observedAt = new Date().toISOString(),
): AdventureLandGameEvent {
  const safePayload = sanitizeRecord(structuredClone(payload));
  return Object.freeze({
    name,
    payload: Object.freeze(safePayload),
    observedAt,
  });
}
