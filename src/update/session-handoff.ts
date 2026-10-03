import type { AdventureLandAccountSession } from "../account/source.ts";

export const UPDATE_SESSION_HANDOFF_ENV =
  "ALREMASTERED_UPDATE_SESSION_HANDOFF";

export interface UpdateSessionHandoff {
  readonly schemaVersion: 1;
  readonly session: AdventureLandAccountSession;
  readonly selectedServerKey: string;
  readonly characterId: string;
}

export function encodeUpdateSessionHandoff(
  session: AdventureLandAccountSession | undefined,
  selectedServerKey: string | undefined,
  characterId: string | undefined,
): string | undefined {
  if (
    !session ||
    !session.userId ||
    !session.auth ||
    !selectedServerKey?.trim() ||
    !characterId?.trim()
  ) {
    return undefined;
  }

  const payload: UpdateSessionHandoff = {
    schemaVersion: 1,
    session: {
      userId: session.userId,
      auth: session.auth,
      language: session.language,
    },
    selectedServerKey: selectedServerKey.trim(),
    characterId: characterId.trim(),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeUpdateSessionHandoff(
  value: string | undefined,
): UpdateSessionHandoff | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) return undefined;
    if (
      !isRecord(parsed.session) ||
      typeof parsed.session.userId !== "string" ||
      !parsed.session.userId ||
      typeof parsed.session.auth !== "string" ||
      !parsed.session.auth ||
      (
        parsed.session.language !== undefined &&
        typeof parsed.session.language !== "string"
      ) ||
      typeof parsed.selectedServerKey !== "string" ||
      !parsed.selectedServerKey ||
      typeof parsed.characterId !== "string" ||
      !parsed.characterId
    ) {
      return undefined;
    }

    return Object.freeze({
      schemaVersion: 1 as const,
      session: Object.freeze({
        userId: parsed.session.userId,
        auth: parsed.session.auth,
        language: parsed.session.language,
      }),
      selectedServerKey: parsed.selectedServerKey,
      characterId: parsed.characterId,
    });
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
