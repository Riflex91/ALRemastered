import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type {
  AdventureLandCharacterConnectionState,
  AdventureLandCharacterConnectionStatus,
  AdventureLandCharacterService,
} from "../character/service.ts";
import type {
  MultiCharacterSessionManager,
  MultiCharacterSessionRuntimeState,
} from "../character/session-manager.ts";
import type { Logger } from "../logging/logger.ts";
import type {
  ScriptRuntimeService,
  ScriptRuntimeStatus,
} from "../script/runtime.ts";

export type CharacterCardHealth = "healthy" | "attention" | "critical" | "offline";

export interface CharacterCardControlState {
  readonly enabled: boolean;
  readonly reason: string;
}

export interface CharacterCardScriptState {
  readonly scope: "primary" | "managed";
  readonly status: ScriptRuntimeStatus | "not-available";
  readonly name?: string;
  readonly message: string;
}

export interface CharacterCardState {
  readonly characterId: string;
  readonly characterName: string;
  readonly characterType: string;
  readonly level: number;
  readonly accountOnline: boolean;
  readonly sessionRole?: "primary" | "managed";
  readonly connectionStatus: AdventureLandCharacterConnectionStatus | "offline";
  readonly serverKey?: string;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly mp?: number;
  readonly maxMp?: number;
  readonly map?: string;
  readonly target?: string;
  readonly dead?: boolean;
  readonly health: Readonly<{
    readonly status: CharacterCardHealth;
    readonly message: string;
  }>;
  readonly script: CharacterCardScriptState;
  readonly controls: Readonly<{
    readonly start: CharacterCardControlState;
    readonly pause: CharacterCardControlState;
    readonly stop: CharacterCardControlState;
  }>;
}

export interface CharacterCardsState {
  readonly status: "ready" | "unavailable";
  readonly selectedServerKey?: string;
  readonly activeSessionCount: number;
  readonly sessionLimit: number;
  readonly cards: readonly CharacterCardState[];
  readonly message: string;
}

export interface CharacterCardsServiceOptions {
  readonly logger: Logger;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly primary: Pick<AdventureLandCharacterService, "state" | "start" | "stop">;
  readonly sessions: Pick<
    MultiCharacterSessionManager,
    "state" | "characterStates" | "start" | "stop"
  >;
  readonly runtime: Pick<ScriptRuntimeService, "state" | "pause" | "stop">;
}

export class CharacterCardsService {
  readonly #logger: Logger;
  readonly #selection: CharacterCardsServiceOptions["selection"];
  readonly #primary: CharacterCardsServiceOptions["primary"];
  readonly #sessions: CharacterCardsServiceOptions["sessions"];
  readonly #runtime: CharacterCardsServiceOptions["runtime"];

  constructor(options: CharacterCardsServiceOptions) {
    this.#logger = options.logger;
    this.#selection = options.selection;
    this.#primary = options.primary;
    this.#sessions = options.sessions;
    this.#runtime = options.runtime;
  }

  state(): CharacterCardsState {
    const selection = this.#selection.state();
    const manager = this.#sessions.state();
    const runtimeStates = this.#sessions.characterStates();
    const runtimeById = new Map(runtimeStates.map((item) => [item.characterId, item]));
    const primary = this.#primary.state();
    const script = this.#runtime.state();
    const primaryActive = Boolean(
      primary.characterId && isActiveConnectionStatus(primary.status),
    );

    const cards = selection.characters
      .map((character) => {
        const runtime = runtimeById.get(character.id);
        const card = cardFromState({
          character,
          runtime,
          primaryCharacterId: primary.characterId,
          primaryActive,
          selectedServerKey: selection.selectedServerKey,
          selectionReady: selection.status === "ready",
          availableSlots: manager.availableSlots,
          script,
        });
        return Object.freeze(card);
      })
      .sort((left, right) => {
        if (left.sessionRole !== right.sessionRole) {
          if (left.sessionRole === "primary") return -1;
          if (right.sessionRole === "primary") return 1;
          if (left.sessionRole === "managed") return -1;
          if (right.sessionRole === "managed") return 1;
        }
        return left.characterName.localeCompare(right.characterName);
      });

    return structuredClone(Object.freeze({
      status: selection.status === "ready" ? "ready" as const : "unavailable" as const,
      selectedServerKey: selection.selectedServerKey,
      activeSessionCount: manager.activeSessionCount,
      sessionLimit: manager.sessionLimit,
      cards: Object.freeze(cards),
      message: selection.status === "ready"
        ? `Character Cards ready. ${manager.activeSessionCount}/${manager.sessionLimit} local Character sessions are active.`
        : selection.message,
    }));
  }

  async start(characterId: string): Promise<CharacterCardsState> {
    const id = requireCharacterId(characterId);
    const selection = this.#selection.state();
    if (selection.status !== "ready") {
      throw new Error("Characters and servers must be loaded before starting a Character Card.");
    }
    if (!selection.selectedServerKey) {
      throw new Error("Select an Adventure Land server before starting a Character Card.");
    }
    const character = selection.characters.find((item) => item.id === id);
    if (!character) throw new Error("The selected Character Card is not available.");
    if (character.online) {
      throw new Error("Adventure Land reports that Character as already online.");
    }
    const current = this.#sessions.characterStates().find((item) => item.characterId === id);
    if (current && isActiveConnectionStatus(current.state.status)) {
      throw new Error("That Character Card already has an active local session.");
    }

    const primary = this.#primary.state();
    if (!primary.characterId || !isActiveConnectionStatus(primary.status)) {
      await this.#primary.start(id);
      this.#logger.info("Character Card started primary session.", {
        characterId: id,
        serverKey: selection.selectedServerKey,
        beginnerDashboard: true,
        gameplayMutation: false,
      });
    } else {
      await this.#sessions.start(id, selection.selectedServerKey);
      this.#logger.info("Character Card started managed session.", {
        characterId: id,
        serverKey: selection.selectedServerKey,
        beginnerDashboard: true,
        gameplayMutation: false,
      });
    }
    return this.state();
  }

  async pause(characterId: string): Promise<CharacterCardsState> {
    const id = requireCharacterId(characterId);
    const primary = this.#primary.state();
    if (primary.characterId !== id || !isActiveConnectionStatus(primary.status)) {
      throw new Error("Pause is available only for the active primary Character script.");
    }
    const runtime = this.#runtime.state();
    if (runtime.status !== "running") {
      throw new Error("The primary Character script is not currently running.");
    }
    await this.#runtime.pause();
    this.#logger.info("Character Card paused primary script.", {
      characterId: id,
      scriptName: runtime.scriptName,
      beginnerDashboard: true,
      gameplayMutation: false,
    });
    return this.state();
  }

  async stop(characterId: string): Promise<CharacterCardsState> {
    const id = requireCharacterId(characterId);
    const primary = this.#primary.state();
    if (primary.characterId === id && isActiveConnectionStatus(primary.status)) {
      const runtime = this.#runtime.state();
      if (runtime.status === "running" || runtime.status === "paused") {
        await this.#runtime.stop();
      }
      await this.#primary.stop("character_card");
      this.#logger.info("Character Card stopped primary session.", {
        characterId: id,
        beginnerDashboard: true,
        gameplayMutation: false,
      });
      return this.state();
    }

    await this.#sessions.stop(id, "character_card");
    this.#logger.info("Character Card stopped managed session.", {
      characterId: id,
      beginnerDashboard: true,
      gameplayMutation: false,
    });
    return this.state();
  }
}

function cardFromState(input: {
  readonly character: Readonly<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly level: number;
    readonly online: boolean;
  }>;
  readonly runtime?: MultiCharacterSessionRuntimeState;
  readonly primaryCharacterId?: string;
  readonly primaryActive: boolean;
  readonly selectedServerKey?: string;
  readonly selectionReady: boolean;
  readonly availableSlots: number;
  readonly script: Readonly<{
    readonly status: ScriptRuntimeStatus;
    readonly scriptName?: string;
    readonly message: string;
  }>;
}): CharacterCardState {
  const connection = input.runtime?.state;
  const sessionRole = input.runtime?.role;
  const isActive = Boolean(connection && isActiveConnectionStatus(connection.status));
  const health = healthFromConnection(connection, input.character.online);
  const script = sessionRole === "primary"
    ? Object.freeze({
      scope: "primary" as const,
      status: input.script.status,
      name: input.script.scriptName,
      message: input.script.message,
    })
    : Object.freeze({
      scope: "managed" as const,
      status: "not-available" as const,
      message: "Managed Character scripts are not available in Slice 8.1.",
    });

  const startReason = isActive
    ? "Character session is already active."
    : input.character.online
      ? "Adventure Land reports this Character as already online."
      : !input.selectionReady
        ? "Load Characters and servers first."
        : !input.selectedServerKey
          ? "Select a server first."
          : input.primaryActive && input.availableSlots <= 0
            ? "The concurrent Character session limit is reached."
            : input.primaryActive
              ? "Start as a managed Character session."
              : "Start as the primary Character session.";

  const pauseEnabled = sessionRole === "primary" &&
    isActive &&
    input.script.status === "running";
  const pauseReason = sessionRole !== "primary"
    ? "Pause is available only for the primary Character script."
    : !isActive
      ? "The primary Character session is not active."
      : input.script.status !== "running"
        ? "The primary Character script is not running."
        : "Pause the primary Character script.";

  return {
    characterId: input.character.id,
    characterName: input.character.name,
    characterType: input.character.type,
    level: input.character.level,
    accountOnline: input.character.online,
    sessionRole,
    connectionStatus: connection?.status ?? "offline",
    serverKey: connection?.serverKey,
    hp: connection?.character?.hp,
    maxHp: connection?.character?.maxHp,
    mp: connection?.character?.mp,
    maxMp: connection?.character?.maxMp,
    map: connection?.character?.map,
    target: connection?.character?.target,
    dead: connection?.character?.dead,
    health,
    script,
    controls: Object.freeze({
      start: Object.freeze({
        enabled: !isActive &&
          !input.character.online &&
          input.selectionReady &&
          Boolean(input.selectedServerKey) &&
          (!input.primaryActive || input.availableSlots > 0),
        reason: startReason,
      }),
      pause: Object.freeze({
        enabled: pauseEnabled,
        reason: pauseReason,
      }),
      stop: Object.freeze({
        enabled: isActive,
        reason: isActive ? "Stop this local Character session." : "No local Character session is active.",
      }),
    }),
  };
}

function healthFromConnection(
  state: AdventureLandCharacterConnectionState | undefined,
  accountOnline: boolean,
): Readonly<{ status: CharacterCardHealth; message: string }> {
  if (!state) {
    return accountOnline
      ? Object.freeze({
        status: "attention" as const,
        message: "Adventure Land reports this Character online outside the local session manager.",
      })
      : Object.freeze({
        status: "offline" as const,
        message: "No local Character session is active.",
      });
  }
  if (state.status === "error") {
    return Object.freeze({
      status: "critical" as const,
      message: state.message || "The Character session reported an error.",
    });
  }
  if (state.character?.dead) {
    return Object.freeze({
      status: "critical" as const,
      message: "Character is dead and needs recovery.",
    });
  }
  if (state.status === "connected") {
    return Object.freeze({
      status: "healthy" as const,
      message: "Character session is connected and updating live state.",
    });
  }
  if (
    state.status === "connecting" ||
    state.status === "reconnecting" ||
    state.status === "disconnecting"
  ) {
    return Object.freeze({
      status: "attention" as const,
      message: state.message || `Character session is ${state.status}.`,
    });
  }
  return Object.freeze({
    status: "offline" as const,
    message: state.message || "Character session is disconnected.",
  });
}

function isActiveConnectionStatus(status: AdventureLandCharacterConnectionStatus): boolean {
  return status === "connecting" ||
    status === "connected" ||
    status === "reconnecting" ||
    status === "disconnecting";
}

function requireCharacterId(characterId: string): string {
  const id = characterId.trim();
  if (!id) throw new Error("Character selection is required.");
  return id;
}
