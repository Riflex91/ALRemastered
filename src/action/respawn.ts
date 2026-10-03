import {
  ActionGatewayExecutionError,
  type ActionGateway,
  type ActionGatewayResult,
  type ActionOrigin,
} from "./gateway.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger } from "../logging/logger.ts";

export interface RespawnActionResult {
  readonly serverAccepted: true;
  readonly retryAfterMs?: number;
}

export interface AdventureLandRespawnServiceOptions {
  readonly gateway: ActionGateway;
  readonly logger: Logger;
  readonly character: Pick<AdventureLandCharacterService, "state" | "sendRespawn">;
}

const RESPAWN_RATE_INTERVAL_MS = 1_000;

export class AdventureLandRespawnService {
  readonly #gateway: ActionGateway;
  readonly #logger: Logger;
  readonly #character: Pick<AdventureLandCharacterService, "state" | "sendRespawn">;

  constructor(options: AdventureLandRespawnServiceOptions) {
    this.#gateway = options.gateway;
    this.#logger = options.logger;
    this.#character = options.character;
  }

  run(origin: ActionOrigin): Promise<ActionGatewayResult<RespawnActionResult>> {
    const characterId = this.#character.state().characterId;
    return this.#gateway.run({
      action: "character.respawn",
      origin,
      characterId,
      input: {},
      timeoutMs: 6_000,
      minIntervalMs: RESPAWN_RATE_INTERVAL_MS,
      rateLimitKey: [origin, characterId ?? "-", "character.respawn"].join(":"),
      execute: async ({ signal, requestId, characterId: executionCharacterId }) => {
        const state = this.#character.state();
        if (state.status !== "connected" || !state.character) {
          throw new ActionGatewayExecutionError(
            "Connect a headless character before respawning.",
            "CHARACTER_NOT_CONNECTED",
          );
        }
        if (!state.character.dead) {
          throw new ActionGatewayExecutionError(
            "Respawn is only available while the character is dead.",
            "RESPAWN_CHARACTER_ALIVE",
          );
        }

        const receipt = await this.#character.sendRespawn({ signal });
        if (!receipt.success) {
          this.#logger.warn("Respawn server response rejected.", {
            action: "character.respawn",
            origin,
            reason: receipt.reason,
            retryAfterMs: receipt.retryAfterMs,
          }, { requestId, characterId: executionCharacterId });
          throw new ActionGatewayExecutionError(
            receipt.reason
              ? `Adventure Land rejected respawn (${receipt.reason}).`
              : "Adventure Land rejected respawn.",
            "RESPAWN_SERVER_REJECTED",
            receipt.retryAfterMs,
          );
        }

        const result = {
          serverAccepted: true as const,
          retryAfterMs: receipt.retryAfterMs,
        };
        this.#logger.info("Respawn server response confirmed.", {
          action: "character.respawn",
          origin,
          ...result,
        }, { requestId, characterId: executionCharacterId });
        return result;
      },
    });
  }
}
