import {
  ActionGatewayExecutionError,
  type ActionGateway,
  type ActionGatewayResult,
  type ActionOrigin,
} from "./gateway.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandVisibleEntity } from "../character/world-state.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";
import type { Logger } from "../logging/logger.ts";

export type SkillTargetMode = "none" | "player" | "monster";

export interface DashboardSkillRequest {
  readonly skillName: string;
  readonly targetId?: string;
}

export interface DashboardSkillTargetOption {
  readonly id: string;
  readonly name: string;
  readonly kind: "player" | "monster";
  readonly distance?: number;
}

export interface DashboardSkillOption {
  readonly skillName: string;
  readonly displayName: string;
  readonly targetMode: SkillTargetMode;
  readonly mpCost: number;
  readonly cooldownMs?: number;
  readonly range?: number;
  readonly targets: readonly DashboardSkillTargetOption[];
}

export interface DashboardSkillOptionsState {
  readonly status: "ready" | "unavailable";
  readonly message: string;
  readonly characterId?: string;
  readonly skills: readonly DashboardSkillOption[];
}

export interface SkillActionResult {
  readonly skillName: string;
  readonly displayName: string;
  readonly targetId?: string;
  readonly targetName?: string;
  readonly targetKind?: "player" | "monster";
  readonly distance?: number;
  readonly range?: number;
  readonly mpCost: number;
  readonly serverAccepted: true;
  readonly cooldownMs?: number;
}

export interface AdventureLandSkillServiceOptions {
  readonly gateway: ActionGateway;
  readonly logger: Logger;
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "sendSkill" | "skillCooldownRemainingMs"
  >;
  readonly gameData: () => AdventureLandGameData | undefined;
}

interface SimpleSkillDefinition {
  readonly skillName: string;
  readonly displayName: string;
  readonly classNames?: readonly string[];
  readonly level?: number;
  readonly mpCost: number;
  readonly cooldownMs?: number;
  readonly cooldownKey: string;
  readonly targetMode: SkillTargetMode;
  readonly range?: number;
}

const SKILL_RATE_INTERVAL_MS = 400;

const EXCLUDED_SKILLS = new Set([
  "attack",
  "heal",
  "use_hp",
  "use_mp",
  "regen_hp",
  "regen_mp",
  "stop",
  "town",
  "blink",
  "dash",
  "magiport",
  "warp",
  "energize",
  "cburst",
  "3shot",
  "5shot",
  "fanofknives",
  "pcoat",
  "revive",
  "entangle",
  "poisonarrow",
  "shadowstrike",
  "phaseout",
  "throw",
  "stack",
  "fishing",
  "mining",
]);

export class AdventureLandSkillService {
  readonly #gateway: ActionGateway;
  readonly #logger: Logger;
  readonly #character: Pick<
    AdventureLandCharacterService,
    "state" | "sendSkill" | "skillCooldownRemainingMs"
  >;
  readonly #gameData: () => AdventureLandGameData | undefined;

  constructor(options: AdventureLandSkillServiceOptions) {
    this.#gateway = options.gateway;
    this.#logger = options.logger;
    this.#character = options.character;
    this.#gameData = options.gameData;
  }

  dashboardOptions(): DashboardSkillOptionsState {
    const state = this.#character.state();
    const data = this.#gameData();
    if (state.status !== "connected" || !state.character) {
      return Object.freeze({
        status: "unavailable",
        message: "Connect a headless character to load safe skill tests.",
        characterId: state.characterId,
        skills: Object.freeze([]),
      });
    }
    if (!data) {
      return Object.freeze({
        status: "unavailable",
        message: "Adventure Land game data is required to validate skills.",
        characterId: state.characterId,
        skills: Object.freeze([]),
      });
    }

    const definitions = simpleDashboardSkills(data, state.character.type);
    const skills = definitions
      .filter((definition) =>
        definition.level === undefined ||
        state.character!.level >= definition.level
      )
      .map((definition) => Object.freeze({
        skillName: definition.skillName,
        displayName: definition.displayName,
        targetMode: definition.targetMode,
        mpCost: definition.mpCost,
        cooldownMs: definition.cooldownMs,
        range: definition.range,
        targets: Object.freeze(
          skillTargets(
            state.entities ?? [],
            state.character!.x,
            state.character!.y,
            definition,
          ),
        ),
      }))
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.skillName.localeCompare(right.skillName)
      );

    return Object.freeze({
      status: "ready",
      message: skills.length
        ? "Safe simple skills are available for manual dashboard testing."
        : "No safe simple skills are available for this character.",
      characterId: state.characterId,
      skills: Object.freeze(skills),
    });
  }

  runDashboardTest(
    request: DashboardSkillRequest,
  ): Promise<ActionGatewayResult<SkillActionResult>> {
    return this.run(request, "dashboard");
  }

  run(
    request: DashboardSkillRequest,
    origin: ActionOrigin,
  ): Promise<ActionGatewayResult<SkillActionResult>> {
    const skillName = request.skillName.trim();
    const targetId = request.targetId?.trim() || undefined;
    const characterId = this.#character.state().characterId;

    return this.#gateway.run({
      action: "character.skill",
      origin,
      characterId,
      input: { skillName, targetId },
      timeoutMs: 4_000,
      minIntervalMs: SKILL_RATE_INTERVAL_MS,
      rateLimitKey: [
        origin,
        characterId ?? "-",
        "character.skill",
      ].join(":"),
      execute: async ({ signal, requestId, characterId: executionCharacterId }) => {
        if (!skillName || skillName.length > 80) {
          throw new ActionGatewayExecutionError(
            "Select a supported skill before running the skill test.",
            "SKILL_REQUIRED",
          );
        }

        const state = this.#character.state();
        const data = this.#gameData();
        if (state.status !== "connected" || !state.character) {
          throw new ActionGatewayExecutionError(
            "Connect a headless character before testing a skill.",
            "CHARACTER_NOT_CONNECTED",
          );
        }
        if (!data) {
          throw new ActionGatewayExecutionError(
            "Adventure Land game data is required to validate skills.",
            "SKILL_GAME_DATA_UNAVAILABLE",
          );
        }
        if (state.character.dead) {
          throw new ActionGatewayExecutionError(
            "A dead character cannot run the skill test.",
            "SKILL_CHARACTER_DEAD",
          );
        }

        const definition = simpleDashboardSkills(data, state.character.type)
          .find((entry) => entry.skillName === skillName);
        if (!definition) {
          throw new ActionGatewayExecutionError(
            "This skill is not available through the bounded Slice 3.4 dashboard test.",
            "SKILL_NOT_ALLOWED",
          );
        }
        if (
          definition.level !== undefined &&
          state.character.level < definition.level
        ) {
          throw new ActionGatewayExecutionError(
            `This skill requires level ${definition.level}.`,
            "SKILL_LEVEL_REQUIRED",
          );
        }

        const mp = state.character.mp;
        if (
          definition.mpCost > 0 &&
          (typeof mp !== "number" || !Number.isFinite(mp) || mp < definition.mpCost)
        ) {
          throw new ActionGatewayExecutionError(
            `This skill requires ${definition.mpCost} MP.`,
            "SKILL_NO_MP",
          );
        }

        const target = validateTarget(
          state.entities ?? [],
          state.character.x,
          state.character.y,
          definition,
          targetId,
        );

        const cooldownMs = this.#character.skillCooldownRemainingMs(
          definition.cooldownKey,
        );
        if (cooldownMs > 0) {
          throw new ActionGatewayExecutionError(
            "Skill cooldown is still active.",
            "SKILL_COOLDOWN",
            cooldownMs,
          );
        }

        if (signal.aborted) {
          throw new ActionGatewayExecutionError(
            "Skill was cancelled before it started.",
            "SKILL_ABORTED",
          );
        }

        const receipt = await this.#character.sendSkill({
          name: definition.skillName,
          targetId: target?.id,
          cooldownKey: definition.cooldownKey,
          signal,
        });
        if (!receipt.success) {
          this.#logger.warn(
            "Skill server response rejected.",
            {
              action: "character.skill",
              origin,
              skillName: definition.skillName,
              targetId: target?.id,
              reason: receipt.reason,
              cooldownMs: receipt.cooldownMs,
            },
            {
              requestId,
              characterId: executionCharacterId,
            },
          );
          throw serverSkillFailure(receipt.reason, receipt.cooldownMs);
        }

        const result = {
          skillName: definition.skillName,
          displayName: definition.displayName,
          targetId: target?.id,
          targetName: target?.name,
          targetKind: target?.kind,
          distance: target?.distance,
          range: target ? definition.range : undefined,
          mpCost: definition.mpCost,
          serverAccepted: true as const,
          cooldownMs: receipt.cooldownMs,
        };

        this.#logger.info(
          "Skill server response confirmed.",
          {
            action: "character.skill",
            origin,
            skillName: result.skillName,
            targetId: result.targetId,
            targetKind: result.targetKind,
            distance: result.distance,
            range: result.range,
            mpCost: result.mpCost,
            cooldownMs: result.cooldownMs,
            serverAccepted: true,
          },
          {
            requestId,
            characterId: executionCharacterId,
          },
        );
        return result;
      },
    });
  }
}

function simpleDashboardSkills(
  data: AdventureLandGameData,
  characterType: string,
): readonly SimpleSkillDefinition[] {
  const result: SimpleSkillDefinition[] = [];
  for (const [skillName, raw] of Object.entries(data.skills)) {
    if (!isRecord(raw)) continue;
    const definition = parseSimpleSkill(skillName, raw);
    if (!definition) continue;
    if (
      definition.classNames &&
      !definition.classNames.includes(characterType)
    ) {
      continue;
    }
    result.push(definition);
  }
  return result;
}

function parseSimpleSkill(
  skillName: string,
  raw: Readonly<Record<string, unknown>>,
): SimpleSkillDefinition | undefined {
  if (
    raw.type !== "skill" ||
    EXCLUDED_SKILLS.has(skillName) ||
    raw.hostile === true ||
    raw.multi === true ||
    raw.party === true ||
    raw.consume !== undefined ||
    raw.slot !== undefined ||
    raw.requirements !== undefined ||
    raw.wtype !== undefined ||
    raw.offhand_type !== undefined ||
    raw.emote !== undefined ||
    raw.global === true
  ) {
    return undefined;
  }

  let targetMode: SkillTargetMode = "none";
  if (raw.target === "player") targetMode = "player";
  else if (raw.target === "monster") targetMode = "monster";
  else if (raw.target === true) return undefined;
  else if (raw.target !== undefined && raw.target !== false) return undefined;

  const classNames = Array.isArray(raw.class)
    ? raw.class.filter((entry): entry is string =>
      typeof entry === "string" && Boolean(entry)
    )
    : undefined;
  const level = finiteNumber(raw.level);
  const mpCost = Math.max(0, finiteNumber(raw.mp) ?? 0);
  const cooldownMs = positiveNumber(raw.cooldown) ??
    positiveNumber(raw.reuse_cooldown);
  const cooldownKey = typeof raw.share === "string" && raw.share
    ? raw.share
    : skillName;

  let range: number | undefined;
  if (targetMode !== "none") {
    range = positiveNumber(raw.range);
    if (range === undefined) return undefined;
  }

  return Object.freeze({
    skillName,
    displayName: typeof raw.name === "string" && raw.name
      ? raw.name
      : skillName,
    classNames: classNames?.length ? Object.freeze(classNames) : undefined,
    level,
    mpCost,
    cooldownMs,
    cooldownKey,
    targetMode,
    range,
  });
}

function skillTargets(
  entities: readonly AdventureLandVisibleEntity[],
  characterX: number | undefined,
  characterY: number | undefined,
  definition: SimpleSkillDefinition,
): DashboardSkillTargetOption[] {
  if (
    definition.targetMode === "none" ||
    typeof characterX !== "number" ||
    !Number.isFinite(characterX) ||
    typeof characterY !== "number" ||
    !Number.isFinite(characterY)
  ) {
    return [];
  }

  return entities
    .filter((entity) => entity.kind === definition.targetMode)
    .filter((entity) =>
      typeof entity.x === "number" &&
      Number.isFinite(entity.x) &&
      typeof entity.y === "number" &&
      Number.isFinite(entity.y)
    )
    .map((entity) => {
      const distance = Math.hypot(
        (entity.x as number) - characterX,
        (entity.y as number) - characterY,
      );
      return {
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        distance: roundOne(distance),
      };
    })
    .filter((target) =>
      definition.range === undefined || target.distance <= definition.range
    )
    .sort((left, right) =>
      (left.distance ?? Number.POSITIVE_INFINITY) -
        (right.distance ?? Number.POSITIVE_INFINITY) ||
      left.name.localeCompare(right.name)
    );
}

function validateTarget(
  entities: readonly AdventureLandVisibleEntity[],
  characterX: number | undefined,
  characterY: number | undefined,
  definition: SimpleSkillDefinition,
  targetId: string | undefined,
): DashboardSkillTargetOption | undefined {
  if (definition.targetMode === "none") {
    if (targetId) {
      throw new ActionGatewayExecutionError(
        "This skill does not accept a target in the Slice 3.4 test.",
        "SKILL_TARGET_NOT_ALLOWED",
      );
    }
    return undefined;
  }
  if (!targetId) {
    throw new ActionGatewayExecutionError(
      "Select a visible target for this skill.",
      "SKILL_TARGET_REQUIRED",
    );
  }

  const targets = skillTargets(
    entities,
    characterX,
    characterY,
    definition,
  );
  const target = targets.find((entry) => entry.id === targetId);
  if (!target) {
    const visible = entities.find((entry) => entry.id === targetId);
    if (!visible) {
      throw new ActionGatewayExecutionError(
        "The selected skill target is no longer visible.",
        "SKILL_TARGET_NOT_VISIBLE",
      );
    }
    if (visible.kind !== definition.targetMode) {
      throw new ActionGatewayExecutionError(
        "The selected target type is not valid for this skill.",
        "SKILL_TARGET_INVALID",
      );
    }
    throw new ActionGatewayExecutionError(
      "The selected skill target is out of range.",
      "SKILL_OUT_OF_RANGE",
    );
  }
  return target;
}

function serverSkillFailure(
  reason: string | undefined,
  cooldownMs: number | undefined,
): ActionGatewayExecutionError {
  if (reason === "cooldown") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the skill because cooldown is active.",
      "SKILL_COOLDOWN",
      cooldownMs,
    );
  }
  if (reason === "no_mp") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the skill because MP is insufficient.",
      "SKILL_NO_MP",
    );
  }
  if (reason === "no_level") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the skill because the level requirement is not met.",
      "SKILL_LEVEL_REQUIRED",
    );
  }
  if (reason === "no_target" || reason === "invalid_target" || reason === "not_there") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the selected skill target.",
      "SKILL_TARGET_INVALID",
    );
  }
  if (reason === "distance" || reason === "too_far") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the skill because the target is out of range.",
      "SKILL_OUT_OF_RANGE",
    );
  }
  if (
    reason === "disabled" ||
    reason === "skill_cant_incapacitated"
  ) {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the skill because the character is disabled.",
      "SKILL_DISABLED",
    );
  }
  if (
    reason === "skill_cant_use" ||
    reason === "skill_cant_wtype" ||
    reason === "skill_cant_slot"
  ) {
    return new ActionGatewayExecutionError(
      `Adventure Land rejected the skill (${reason}).`,
      "SKILL_SERVER_REQUIREMENT",
    );
  }

  return new ActionGatewayExecutionError(
    reason
      ? `Adventure Land rejected the skill (${reason}).`
      : "Adventure Land rejected the skill.",
    "SKILL_SERVER_REJECTED",
    cooldownMs,
  );
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
