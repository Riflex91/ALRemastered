import type { Logger } from "../logging/logger.ts";
import type {
  PartyCoordinatorMemberState,
  PartyCoordinatorRole,
  PartyCoordinatorService,
} from "./coordinator.ts";

export type PartyTemplateId = "warrior-tank" | "priest-healer" | "dps";

export interface PartyTemplateDefinition {
  readonly id: PartyTemplateId;
  readonly label: string;
  readonly role: PartyCoordinatorRole;
  readonly appliesTo: string;
}

export interface PartyTemplateAssignment {
  readonly characterId: string;
  readonly characterName?: string;
  readonly characterType?: string;
  readonly sessionRole: PartyCoordinatorMemberState["sessionRole"];
  readonly connectionStatus: PartyCoordinatorMemberState["connectionStatus"];
  readonly recommendedTemplateId?: PartyTemplateId;
  readonly recommendedRole?: PartyCoordinatorRole;
  readonly currentRole?: PartyCoordinatorRole;
  readonly status: "matched" | "needs-assignment" | "override" | "unavailable";
  readonly matchesRecommendation: boolean;
}

export interface PartyTemplateState {
  readonly status: "idle" | "ready" | "degraded";
  readonly memberCount: number;
  readonly recommendedCount: number;
  readonly matchedCount: number;
  readonly assignments: readonly PartyTemplateAssignment[];
  readonly templates: readonly PartyTemplateDefinition[];
  readonly templateLayerActive: true;
  readonly coordinationTransport: "party-coordinator";
  readonly localMessagingRequired: false;
  readonly gameplayMutation: false;
  readonly rawSocketAccess: false;
  readonly message: string;
}

export interface PartyTemplateServiceOptions {
  readonly logger: Logger;
  readonly coordinator: Pick<
    PartyCoordinatorService,
    "state" | "assignRole" | "clearRole"
  >;
}

export class PartyTemplateService {
  readonly #logger: Logger;
  readonly #coordinator: PartyTemplateServiceOptions["coordinator"];

  constructor(options: PartyTemplateServiceOptions) {
    this.#logger = options.logger;
    this.#coordinator = options.coordinator;
  }

  state(): PartyTemplateState {
    const coordinator = this.#coordinator.state();
    const assignments = coordinator.members.map((member) => assignmentFor(member));
    const recommendedCount = assignments.filter((item) => item.recommendedRole).length;
    const matchedCount = assignments.filter((item) => item.matchesRecommendation).length;
    const unavailable = assignments.filter((item) => !item.recommendedRole).length;
    const status = assignments.length === 0
      ? "idle" as const
      : unavailable === 0 && matchedCount === assignments.length
        ? "ready" as const
        : "degraded" as const;

    return structuredClone(Object.freeze({
      status,
      memberCount: assignments.length,
      recommendedCount,
      matchedCount,
      assignments: Object.freeze(assignments),
      templates: PARTY_TEMPLATE_DEFINITIONS,
      templateLayerActive: true as const,
      coordinationTransport: "party-coordinator" as const,
      localMessagingRequired: false as const,
      gameplayMutation: false as const,
      rawSocketAccess: false as const,
      message: templateMessage(assignments, matchedCount, unavailable),
    }));
  }

  applyRecommendedRoles(): PartyTemplateState {
    const members = this.#coordinator.state().members;
    let applied = 0;
    for (const member of members) {
      const role = recommendedPartyRole(member.characterType);
      if (!role) continue;
      this.#coordinator.assignRole(member.characterId, role);
      applied += 1;
    }
    this.#logger.info("Party Template recommended roles applied.", {
      memberCount: members.length,
      applied,
      gameplayMutation: false,
      rawSocketAccess: false,
      localMessagingRequired: false,
    });
    return this.state();
  }

  assignRole(characterId: string, role: PartyCoordinatorRole): PartyTemplateState {
    this.#coordinator.assignRole(characterId, role);
    this.#logger.info("Party Template role assigned.", {
      characterId,
      role,
      gameplayMutation: false,
      rawSocketAccess: false,
      localMessagingRequired: false,
    });
    return this.state();
  }

  clearRole(characterId: string): PartyTemplateState {
    this.#coordinator.clearRole(characterId);
    this.#logger.info("Party Template role cleared.", {
      characterId,
      gameplayMutation: false,
      rawSocketAccess: false,
      localMessagingRequired: false,
    });
    return this.state();
  }
}

export const PARTY_TEMPLATE_DEFINITIONS: readonly PartyTemplateDefinition[] = Object.freeze([
  Object.freeze({
    id: "warrior-tank" as const,
    label: "Warrior Tank",
    role: "tank" as const,
    appliesTo: "warrior",
  }),
  Object.freeze({
    id: "priest-healer" as const,
    label: "Priest Healer",
    role: "healer" as const,
    appliesTo: "priest",
  }),
  Object.freeze({
    id: "dps" as const,
    label: "DPS",
    role: "dps" as const,
    appliesTo: "all other Character classes",
  }),
]);

export function recommendedPartyRole(
  characterType?: string,
): PartyCoordinatorRole | undefined {
  const normalized = characterType?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "warrior") return "tank";
  if (normalized === "priest") return "healer";
  return "dps";
}

function recommendedTemplateId(
  role?: PartyCoordinatorRole,
): PartyTemplateId | undefined {
  if (role === "tank") return "warrior-tank";
  if (role === "healer") return "priest-healer";
  if (role === "dps") return "dps";
  return undefined;
}

function assignmentFor(member: PartyCoordinatorMemberState): PartyTemplateAssignment {
  const recommendedRole = recommendedPartyRole(member.characterType);
  const matchesRecommendation = Boolean(
    recommendedRole && member.role === recommendedRole,
  );
  const status = !recommendedRole
    ? "unavailable" as const
    : matchesRecommendation
      ? "matched" as const
      : member.role
        ? "override" as const
        : "needs-assignment" as const;

  return Object.freeze({
    characterId: member.characterId,
    characterName: member.characterName,
    characterType: member.characterType,
    sessionRole: member.sessionRole,
    connectionStatus: member.connectionStatus,
    recommendedTemplateId: recommendedTemplateId(recommendedRole),
    recommendedRole,
    currentRole: member.role,
    status,
    matchesRecommendation,
  });
}

function templateMessage(
  assignments: readonly PartyTemplateAssignment[],
  matchedCount: number,
  unavailable: number,
): string {
  if (assignments.length === 0) {
    return "Party Templates are waiting for local Character sessions.";
  }
  if (unavailable > 0) {
    return `Party Templates cannot recommend a role for ${unavailable} member(s) without a Character class.`;
  }
  if (matchedCount === assignments.length) {
    return `Party Templates ready. ${matchedCount}/${assignments.length} local member(s) match their recommended roles.`;
  }
  return `Party Templates need assignment changes for ${assignments.length - matchedCount} member(s).`;
}
