import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { AdventureLandRespawnService } from "../src/action/respawn.ts";
import { Logger } from "../src/logging/logger.ts";

test("respawn service rejects living characters and confirms server-accepted death respawn", async () => {
  const logger = new Logger({ component: "respawn-test" });
  let dead = false;
  let sends = 0;
  const service = new AdventureLandRespawnService({
    gateway: new ActionGateway({ logger }),
    logger,
    character: {
      state: () => ({
        status: "connected",
        characterId: "CH_1",
        character: { id: "CH_1", name: "Ranger", type: "ranger", dead },
        message: "connected",
      }),
      sendRespawn: async () => {
        sends += 1;
        return { success: true };
      },
    } as any,
  });

  const alive = await service.run("script");
  assert.equal(alive.outcome, "error");
  assert.equal(alive.error?.code, "RESPAWN_CHARACTER_ALIVE");
  assert.equal(sends, 0);

  await new Promise((resolve) => setTimeout(resolve, 1_025));
  dead = true;
  const result = await service.run("script");
  assert.equal(result.outcome, "success");
  assert.equal(result.result?.serverAccepted, true);
  assert.equal(sends, 1);
});
