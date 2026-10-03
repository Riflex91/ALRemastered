import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import {
  AdventureLandMovementService,
  canMoveDirect,
} from "../src/action/movement.ts";
import type { AdventureLandGameData } from "../src/game/data-source.ts";
import { Logger } from "../src/logging/logger.ts";
import { AdventureLandCharacterTransportError } from "../src/character/transport.ts";

function gameData(
  xLines: readonly (readonly [number, number, number])[] = [],
  yLines: readonly (readonly [number, number, number])[] = [],
): AdventureLandGameData {
  return {
    version: 17397,
    items: {},
    monsters: {},
    maps: { main: {} },
    geometry: {
      main: {
        x_lines: xLines,
        y_lines: yLines,
      },
    },
    skills: {},
    classes: {},
    npcs: {},
    drops: {},
    craft: {},
    conditions: {},
  };
}

function connectedCharacter(
  sent: Array<{ x: number; y: number }>,
  x = 100,
  y = 100,
) {
  return {
    state: () => ({
      status: "connected" as const,
      characterId: "CH_1",
      characterName: "RangerOne",
      message: "Connected.",
      character: {
        id: "CH_1",
        name: "RangerOne",
        type: "ranger",
        level: 45,
        map: "main",
        x,
        y,
        dead: false,
        movementSequence: 7,
      },
    }),
    async sendDirectMovement(input: { x: number; y: number }) {
      sent.push({ x: input.x, y: input.y });
      return {
        fromX: x,
        fromY: y,
        targetX: input.x,
        targetY: input.y,
        confirmedX: input.x,
        confirmedY: input.y,
      };
    },
  };
}

test("movement geometry accepts clear direct paths and rejects wall crossings", () => {
  assert.equal(
    canMoveDirect({ xLines: [], yLines: [] }, 100, 100, 132, 100),
    true,
  );
  assert.equal(
    canMoveDirect(
      { xLines: [[116, 0, 200]], yLines: [] },
      100,
      100,
      132,
      100,
    ),
    false,
  );
});

test("dashboard Move uses the Action Gateway and emits one bounded direct step", async () => {
  const logger = new Logger({ component: "movement-test" });
  const sent: Array<{ x: number; y: number }> = [];
  const service = new AdventureLandMovementService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-move-test",
    }),
    character: connectedCharacter(sent) as any,
    gameData: () => gameData(),
  });

  const result = await service.runDashboardTest({
    mode: "move",
    direction: "right",
  });

  assert.equal(result.outcome, "success");
  assert.equal(result.requestId, "act-move-test");
  assert.equal(result.action, "character.move");
  assert.equal(result.origin, "dashboard");
  assert.equal(result.characterId, "CH_1");
  assert.deepEqual(sent, [{ x: 132, y: 100 }]);
  assert.deepEqual(result.result, {
    mode: "move",
    direction: "right",
    map: "main",
    fromX: 100,
    fromY: 100,
    targetX: 132,
    targetY: 100,
    transport: "move",
    path: "direct",
    confirmedX: 132,
    confirmedY: 100,
    serverConfirmed: true,
  });
  assert.match(logger.exportText(), /Action gateway request started/);
  assert.match(logger.exportText(), /"action":"character.move"/);
  assert.doesNotMatch(logger.exportText(), /"targetX":132/);
});

test("movement sent without server position confirmation is not reported as success", async () => {
  const logger = new Logger({ component: "movement-confirmation-test" });
  const service = new AdventureLandMovementService({
    gateway: new ActionGateway({
      logger,
      idFactory: () => "act-move-unconfirmed",
    }),
    character: {
      state: () => ({
        status: "connected" as const,
        characterId: "CH_1",
        characterName: "RangerOne",
        message: "Connected.",
        character: {
          id: "CH_1",
          name: "RangerOne",
          type: "ranger",
          level: 45,
          map: "main",
          x: 100,
          y: 100,
          dead: false,
          movementSequence: 7,
        },
      }),
      sendDirectMovement: async () => {
        throw new AdventureLandCharacterTransportError(
          "Adventure Land did not confirm the requested movement.",
          "movement_not_confirmed",
        );
      },
    } as any,
    gameData: () => gameData(),
  });

  const result = await service.runDashboardTest({
    mode: "move",
    direction: "right",
  });

  assert.equal(result.outcome, "error");
  assert.equal(result.requestId, "act-move-unconfirmed");
  assert.equal(result.error?.code, "MOVE_NOT_CONFIRMED");
  assert.match(result.error?.message ?? "", /did not confirm/i);
});

test("blocked Move and pathfinding XMove are rejected before socket mutation", async () => {
  const sent: Array<{ x: number; y: number }> = [];
  let now = 1_000;
  const logger = new Logger({ component: "movement-test" });
  const gateway = new ActionGateway({
    logger,
    nowMs: () => now,
    idFactory: () => `act-${now}`,
  });
  const service = new AdventureLandMovementService({
    gateway,
    character: connectedCharacter(sent) as any,
    gameData: () => gameData([[116, 0, 200]]),
  });

  const move = await service.runDashboardTest({
    mode: "move",
    direction: "right",
  });
  assert.equal(move.outcome, "error");
  assert.equal(move.error?.code, "MOVE_BLOCKED");
  assert.equal(sent.length, 0);

  now += 1_000;
  const xmove = await service.runDashboardTest({
    mode: "xmove",
    direction: "right",
  });
  assert.equal(xmove.outcome, "error");
  assert.equal(xmove.error?.code, "XMOVE_PATH_REQUIRED");
  assert.equal(sent.length, 0);
});

test("movement test requires connected state, loaded geometry, and obeys rate guard", async () => {
  const logger = new Logger({ component: "movement-test" });
  let now = 5_000;
  const gateway = new ActionGateway({
    logger,
    nowMs: () => now,
    idFactory: () => `act-${now}`,
  });

  const disconnected = new AdventureLandMovementService({
    gateway,
    character: {
      state: () => ({
        status: "disconnected",
        message: "No character.",
      }),
      sendDirectMovement: () => {
        throw new Error("must not run");
      },
    } as any,
    gameData: () => gameData(),
  });
  const noCharacter = await disconnected.runDashboardTest({
    mode: "move",
    direction: "up",
  });
  assert.equal(noCharacter.outcome, "error");
  assert.equal(noCharacter.error?.code, "CHARACTER_NOT_CONNECTED");

  now += 1_000;
  const sent: Array<{ x: number; y: number }> = [];
  const noGeometry = new AdventureLandMovementService({
    gateway,
    character: connectedCharacter(sent) as any,
    gameData: () => undefined,
  });
  const missingGeometry = await noGeometry.runDashboardTest({
    mode: "move",
    direction: "up",
  });
  assert.equal(missingGeometry.outcome, "error");
  assert.equal(missingGeometry.error?.code, "MOVE_GEOMETRY_UNAVAILABLE");
  assert.equal(sent.length, 0);

  now += 1_000;
  const guarded = new AdventureLandMovementService({
    gateway,
    character: connectedCharacter(sent) as any,
    gameData: () => gameData(),
  });
  const first = await guarded.runDashboardTest({
    mode: "move",
    direction: "up",
  });
  assert.equal(first.outcome, "success");
  const second = await guarded.runDashboardTest({
    mode: "xmove",
    direction: "down",
  });
  assert.equal(second.outcome, "rate_limited");
  assert.equal(second.error?.code, "ACTION_RATE_LIMITED");
  assert.equal(sent.length, 1);
});


test("script Move/XMove accept validated coordinates and keep script origin", async () => {
  const logger = new Logger({ component: "script-movement-test" });
  const sent: Array<{ x: number; y: number }> = [];
  let now = 80_000;
  const service = new AdventureLandMovementService({
    gateway: new ActionGateway({
      logger,
      nowMs: () => now,
      idFactory: () => `act-script-move-${now}`,
    }),
    character: connectedCharacter(sent) as any,
    gameData: () => gameData(),
  });

  const moved = await service.runScript({ mode: "move", x: 116, y: 100 });
  assert.equal(moved.outcome, "success");
  assert.equal(moved.origin, "script");
  assert.equal(moved.action, "character.move");
  assert.equal(moved.result?.direction, undefined);
  assert.equal(moved.result?.targetX, 116);
  assert.equal(moved.result?.targetY, 100);

  now += 1_000;
  const xmoved = await service.runScript({ mode: "xmove", x: 100, y: 116 });
  assert.equal(xmoved.outcome, "success");
  assert.equal(xmoved.origin, "script");
  assert.equal(xmoved.action, "character.xmove");
  assert.deepEqual(sent, [
    { x: 116, y: 100 },
    { x: 100, y: 116 },
  ]);
});
