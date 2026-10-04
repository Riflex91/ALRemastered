import type { Logger } from "../logging/logger.ts";
import type {
  MultiCharacterSessionManager,
  MultiCharacterSessionRole,
  MultiCharacterSessionRuntimeState,
} from "../character/session-manager.ts";

export type PartyCoordinatorRole = "tank" | "healer" | "dps";
export type PartyCoordinatorMemberStatus =
  | "ready"
  | "disconnected"
  | "unavailable"
  | "no-role"
  | "no-target";

export interface PartyCoordinatorMemberState {
  readonly sessionRole: MultiCharacterSessionRole;
  readonly characterId: string;
  readonly characterName?: string;
  readonly characterType?: string;
  readonly connectionStatus: MultiCharacterSessionRuntimeState["state"]["status"];
  readonly role?: PartyCoordinatorRole;
  readonly status: PartyCoordinatorMemberStatus;
  readonly sharedTargetId?: string;
  readonly characterTargetId?: string;
  readonly targetMatchesCharacter: boolean;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly hpRatio?: number;
  readonly mp?: number;
  readonly maxMp?: number;
  readonly mpRatio?: number;
  readonly dead: boolean;
  readonly serverParty: Readonly<{
    readonly inParty: boolean;
    readonly leader?: string;
    readonly members: readonly string[];
  }>;
}

export interface PartyCoordinatorRoleStatus {
  readonly role: PartyCoordinatorRole;
  readonly status: "ready" | "degraded" | "unassigned";
  readonly assignedCount: number;
  readonly readyCount: number;
  readonly notReadyCount: number;
  readonly memberIds: readonly string[];
}

export interface PartyCoordinatorState {
  readonly status: "ready" | "degraded";
  readonly memberCount: number;
  readonly assignedRoleCount: number;
  readonly target?: Readonly<{ readonly id: string; readonly setAt: string }>;
  readonly members: readonly PartyCoordinatorMemberState[];
  readonly roles: Readonly<{
    readonly tank: PartyCoordinatorRoleStatus;
    readonly healer: PartyCoordinatorRoleStatus;
    readonly dps: PartyCoordinatorRoleStatus;
  }>;
  readonly coordinationTransport: "shared-process-state";
  readonly localMessagingRequired: false;
  readonly gameplayMutation: false;
  readonly rawSocketAccess: false;
  readonly partyTemplatesActive: false;
  readonly lastChangedAt?: string;
  readonly message: string;
}

export interface PartyCoordinatorServiceOptions {
  readonly logger: Logger;
  readonly sessions: Pick<MultiCharacterSessionManager, "characterStates">;
  readonly now?: () => Date;
}

export class PartyCoordinatorError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PartyCoordinatorError";
    this.code = code;
  }
}

export class PartyCoordinatorService {
  readonly #logger: Logger;
  readonly #sessions: PartyCoordinatorServiceOptions["sessions"];
  readonly #now: () => Date;
  readonly #roles = new Map<string, PartyCoordinatorRole>();
  #target?: Readonly<{ id: string; setAt: string }>;
  #lastChangedAt?: string;

  constructor(options: PartyCoordinatorServiceOptions) {
    this.#logger = options.logger;
    this.#sessions = options.sessions;
    this.#now = options.now ?? (() => new Date());
  }

  state(): PartyCoordinatorState {
    const runtime = this.#sessions.characterStates();
    this.#synchronizeMembership(runtime);
    const members = runtime
      .map((session) => this.#memberState(session))
      .sort((left, right) => {
        if (left.sessionRole !== right.sessionRole) {
          return left.sessionRole === "primary" ? -1 : 1;
        }
        return left.characterId.localeCompare(right.characterId);
      });
    const roles = Object.freeze({
      tank: roleStatus("tank", members),
      healer: roleStatus("healer", members),
      dps: roleStatus("dps", members),
    });
    const ready = members.length > 0 && members.every((member) => member.status === "ready");
    return structuredClone(Object.freeze({
      status: ready ? "ready" as const : "degraded" as const,
      memberCount: members.length,
      assignedRoleCount: members.filter((member) => member.role).length,
      target: this.#target,
      members: Object.freeze(members),
      roles,
      coordinationTransport: "shared-process-state" as const,
      localMessagingRequired: false as const,
      gameplayMutation: false as const,
      rawSocketAccess: false as const,
      partyTemplatesActive: false as const,
      lastChangedAt: this.#lastChangedAt,
      message: ready
        ? `Party coordinator ready. ${members.length} local member(s) share target ${this.#target!.id}.`
        : coordinatorMessage(members, this.#target?.id),
    }));
  }

  assignRole(characterId: string, role: PartyCoordinatorRole): PartyCoordinatorState {
    const id = required(characterId, "PARTY_MEMBER_REQUIRED", "Character selection is required.");
    if (!isPartyRole(role)) {
      throw new PartyCoordinatorError(
        "Party role must be tank, healer, or dps.",
        "PARTY_ROLE_INVALID",
      );
    }
    this.#requireMember(id);
    const previousRole = this.#roles.get(id);
    this.#roles.set(id, role);
    this.#markChanged();
    this.#logger.info("Party coordinator role assigned.", {
      characterId: id,
      previousRole,
      role,
      gameplayMutation: false,
      rawSocketAccess: false,
      partyTemplate: false,
    });
    return this.state();
  }

  clearRole(characterId: string): PartyCoordinatorState {
    const id = required(characterId, "PARTY_MEMBER_REQUIRED", "Character selection is required.");
    this.#requireMember(id);
    const previousRole = this.#roles.get(id);
    this.#roles.delete(id);
    this.#markChanged();
    this.#logger.info("Party coordinator role cleared.", {
      characterId: id,
      previousRole,
      gameplayMutation: false,
      rawSocketAccess: false,
      partyTemplate: false,
    });
    return this.state();
  }

  setTarget(targetId: string): PartyCoordinatorState {
    const id = required(targetId, "PARTY_TARGET_REQUIRED", "Shared party target is required.");
    const setAt = this.#now().toISOString();
    this.#target = Object.freeze({ id, setAt });
    this.#lastChangedAt = setAt;
    this.#logger.info("Party coordinator shared target set.", {
      targetId: id,
      memberCount: this.#sessions.characterStates().length,
      gameplayMutation: false,
      rawSocketAccess: false,
      partyTemplate: false,
    });
    return this.state();
  }

  clearTarget(): PartyCoordinatorState {
    const previousTargetId = this.#target?.id;
    this.#target = undefined;
    this.#markChanged();
    this.#logger.info("Party coordinator shared target cleared.", {
      previousTargetId,
      gameplayMutation: false,
      rawSocketAccess: false,
      partyTemplate: false,
    });
    return this.state();
  }

  reset(reason = "reset"): PartyCoordinatorState {
    const roleCount = this.#roles.size;
    const previousTargetId = this.#target?.id;
    this.#roles.clear();
    this.#target = undefined;
    this.#markChanged();
    this.#logger.info("Party coordinator local state reset.", {
      reason,
      roleCount,
      previousTargetId,
      gameplayMutation: false,
      rawSocketAccess: false,
      partyTemplate: false,
    });
    return this.state();
  }

  #requireMember(characterId: string): MultiCharacterSessionRuntimeState {
    const member = this.#sessions.characterStates()
      .find((candidate) => candidate.characterId === characterId);
    if (!member) {
      throw new PartyCoordinatorError(
        "That Character is not a current local Character session.",
        "PARTY_MEMBER_NOT_FOUND",
      );
    }
    return member;
  }

  #memberState(session: MultiCharacterSessionRuntimeState): PartyCoordinatorMemberState {
    const role = this.#roles.get(session.characterId);
    const character = session.state.character;
    const sharedTargetId = this.#target?.id;
    let status: PartyCoordinatorMemberStatus;
    if (session.state.status === "disconnected") status = "disconnected";
    else if (session.state.status !== "connected" || character?.dead) status = "unavailable";
    else if (!role) status = "no-role";
    else if (!sharedTargetId) status = "no-target";
    else status = "ready";

    return Object.freeze({
      sessionRole: session.role,
      characterId: session.characterId,
      characterName: session.state.characterName ?? character?.name,
      characterType: character?.type,
      connectionStatus: session.state.status,
      role,
      status,
      sharedTargetId,
      characterTargetId: character?.target,
      targetMatchesCharacter: Boolean(sharedTargetId && character?.target === sharedTargetId),
      hp: character?.hp,
      maxHp: character?.maxHp,
      hpRatio: ratio(character?.hp, character?.maxHp),
      mp: character?.mp,
      maxMp: character?.maxMp,
      mpRatio: ratio(character?.mp, character?.maxMp),
      dead: Boolean(character?.dead),
      serverParty: Object.freeze({
        inParty: Boolean(session.state.party?.inParty),
        leader: session.state.party?.leader,
        members: Object.freeze([...(session.state.party?.members ?? [])]),
      }),
    });
  }

  #synchronizeMembership(runtime: readonly MultiCharacterSessionRuntimeState[]): void {
    const current = new Set(runtime.map((session) => session.characterId));
    for (const characterId of [...this.#roles.keys()]) {
      if (current.has(characterId)) continue;
      this.#roles.delete(characterId);
      this.#logger.debug("Party coordinator removed stale local role assignment.", {
        characterId,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
    }
    if (runtime.length === 0 && this.#target) {
      const previousTargetId = this.#target.id;
      this.#target = undefined;
      this.#markChanged();
      this.#logger.debug("Party coordinator cleared stale target after all local sessions ended.", {
        previousTargetId,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
    }
  }

  #markChanged(): void {
    this.#lastChangedAt = this.#now().toISOString();
  }
}

function roleStatus(
  role: PartyCoordinatorRole,
  members: readonly PartyCoordinatorMemberState[],
): PartyCoordinatorRoleStatus {
  const assigned = members.filter((member) => member.role === role);
  const ready = assigned.filter((member) => member.status === "ready");
  return Object.freeze({
    role,
    status: assigned.length === 0
      ? "unassigned" as const
      : ready.length === assigned.length
        ? "ready" as const
        : "degraded" as const,
    assignedCount: assigned.length,
    readyCount: ready.length,
    notReadyCount: assigned.length - ready.length,
    memberIds: Object.freeze(assigned.map((member) => member.characterId)),
  });
}

function coordinatorMessage(
  members: readonly PartyCoordinatorMemberState[],
  targetId?: string,
): string {
  if (members.length === 0) return "Party coordinator is waiting for a local Character session.";
  const disconnected = members.filter((member) => member.status === "disconnected").length;
  const unavailable = members.filter((member) => member.status === "unavailable").length;
  const noRole = members.filter((member) => member.status === "no-role").length;
  const noTarget = members.filter((member) => member.status === "no-target").length;
  if (disconnected || unavailable) {
    return `Party coordinator degraded. ${disconnected} disconnected and ${unavailable} unavailable member(s).`;
  }
  if (noRole) return `Party coordinator needs role assignments for ${noRole} member(s).`;
  if (!targetId || noTarget) return "Party coordinator has no shared target.";
  return "Party coordinator state is incomplete.";
}

function ratio(value?: number, maximum?: number): number | undefined {
  if (value === undefined || maximum === undefined || maximum <= 0) return undefined;
  return Math.max(0, Math.min(1, value / maximum));
}

function required(value: string, code: string, message: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new PartyCoordinatorError(message, code);
  return normalized;
}

function isPartyRole(value: unknown): value is PartyCoordinatorRole {
  return value === "tank" || value === "healer" || value === "dps";
}
