import {
  ActionGatewayExecutionError,
  type ActionGateway,
  type ActionGatewayResult,
  type ActionOrigin,
} from "./gateway.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";

export interface DashboardAttackRequest {
  readonly targetId: string;
}

export interface AttackActionResult {
  readonly targetId: string;
  readonly targetName: string;
  readonly targetType: string;
  readonly distance: number;
  readonly range: number;
  readonly serverAccepted: true;
  readonly cooldownMs?: number;
}

export interface AdventureLandAttackServiceOptions {
  readonly gateway: ActionGateway;
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "sendAttack" | "attackCooldownRemainingMs"
  >;
}

const ATTACK_RATE_INTERVAL_MS = 500;

export class AdventureLandAttackService {
  readonly #gateway: ActionGateway;
  readonly #character: Pick<
    AdventureLandCharacterService,
    "state" | "sendAttack" | "attackCooldownRemainingMs"
  >;

  constructor(options: AdventureLandAttackServiceOptions) {
    this.#gateway = options.gateway;
    this.#character = options.character;
  }

  runDashboardTest(
    request: DashboardAttackRequest,
  ): Promise<ActionGatewayResult<AttackActionResult>> {
    return this.run(request, "dashboard");
  }

  run(
    request: DashboardAttackRequest,
    origin: ActionOrigin,
  ): Promise<ActionGatewayResult<AttackActionResult>> {
    const targetId = request.targetId.trim();
    const characterId = this.#character.state().characterId;

    return this.#gateway.run({
      action: "character.attack",
      origin,
      characterId,
      input: { targetId },
      timeoutMs: 3_000,
      minIntervalMs: ATTACK_RATE_INTERVAL_MS,
      rateLimitKey: [
        origin,
        characterId ?? "-",
        "character.attack",
      ].join(":"),
      execute: async ({ signal }) => {
        if (!targetId) {
          throw new ActionGatewayExecutionError(
            "Select a visible monster before running the attack test.",
            "ATTACK_TARGET_REQUIRED",
          );
        }
        if (targetId.length > 160) {
          throw new ActionGatewayExecutionError(
            "The selected monster ID is invalid.",
            "ATTACK_TARGET_INVALID",
          );
        }
        if (signal.aborted) {
          throw new ActionGatewayExecutionError(
            "Attack was cancelled before it started.",
            "ATTACK_ABORTED",
          );
        }

        const state = this.#character.state();
        if (state.status !== "connected" || !state.character) {
          throw new ActionGatewayExecutionError(
            "Connect a headless character before testing attack.",
            "CHARACTER_NOT_CONNECTED",
          );
        }
        const character = state.character;
        if (character.dead) {
          throw new ActionGatewayExecutionError(
            "A dead character cannot run the attack test.",
            "ATTACK_CHARACTER_DEAD",
          );
        }

        const target = state.entities?.find((entity) =>
          entity.id === targetId && entity.kind === "monster"
        );
        if (!target) {
          throw new ActionGatewayExecutionError(
            "The selected monster is no longer visible in the live state.",
            "ATTACK_TARGET_NOT_VISIBLE",
          );
        }
        if (typeof target.hp === "number" && target.hp <= 0) {
          throw new ActionGatewayExecutionError(
            "The selected monster is already defeated.",
            "ATTACK_TARGET_DEAD",
          );
        }
        if (
          character.map &&
          target.map &&
          character.map !== target.map
        ) {
          throw new ActionGatewayExecutionError(
            "The selected monster is not on the character's current map.",
            "ATTACK_TARGET_WRONG_MAP",
          );
        }

        const x = character.x;
        const y = character.y;
        const range = character.range;
        const targetX = target.x;
        const targetY = target.y;
        if (
          typeof x !== "number" ||
          !Number.isFinite(x) ||
          typeof y !== "number" ||
          !Number.isFinite(y) ||
          typeof targetX !== "number" ||
          !Number.isFinite(targetX) ||
          typeof targetY !== "number" ||
          !Number.isFinite(targetY) ||
          typeof range !== "number" ||
          !Number.isFinite(range) ||
          range <= 0
        ) {
          throw new ActionGatewayExecutionError(
            "Character range and live positions are required before attack.",
            "ATTACK_RANGE_STATE_UNAVAILABLE",
          );
        }

        const distance = Math.hypot(targetX - x, targetY - y);
        if (distance > range) {
          throw new ActionGatewayExecutionError(
            `The selected monster is out of attack range (${distance.toFixed(1)} > ${range.toFixed(1)}).`,
            "ATTACK_OUT_OF_RANGE",
          );
        }

        const localCooldownMs = this.#character.attackCooldownRemainingMs();
        if (localCooldownMs > 0) {
          throw new ActionGatewayExecutionError(
            "Attack cooldown is still active.",
            "ATTACK_COOLDOWN",
            localCooldownMs,
          );
        }

        const receipt = await this.#character.sendAttack({
          targetId,
          signal,
        });
        if (!receipt.success) {
          throw serverAttackFailure(receipt.reason, receipt.cooldownMs);
        }

        return {
          targetId,
          targetName: target.name,
          targetType: target.type,
          distance: roundOne(distance),
          range: roundOne(range),
          serverAccepted: true,
          cooldownMs: receipt.cooldownMs,
        };
      },
    });
  }
}

function serverAttackFailure(
  reason: string | undefined,
  cooldownMs: number | undefined,
): ActionGatewayExecutionError {
  if (reason === "cooldown") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the attack because cooldown is active.",
      "ATTACK_COOLDOWN",
      cooldownMs,
    );
  }
  if (reason === "distance" || reason === "too_far") {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the attack because the target is out of range.",
      "ATTACK_OUT_OF_RANGE",
    );
  }
  if (
    reason === "disabled" ||
    reason === "skill_cant_incapacitated"
  ) {
    return new ActionGatewayExecutionError(
      "Adventure Land rejected the attack because the character is disabled.",
      "ATTACK_DISABLED",
    );
  }
  if (reason === "no_target" || reason === "not_there") {
    return new ActionGatewayExecutionError(
      "Adventure Land could not find the selected monster.",
      "ATTACK_TARGET_NOT_VISIBLE",
    );
  }

  return new ActionGatewayExecutionError(
    reason
      ? `Adventure Land rejected the attack (${reason}).`
      : "Adventure Land rejected the attack.",
    "ATTACK_SERVER_REJECTED",
    cooldownMs,
  );
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
