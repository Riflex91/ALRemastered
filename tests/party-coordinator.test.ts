import assert from "node:assert/strict";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import {
  PartyCoordinatorError,
  PartyCoordinatorService,
} from "../src/party/coordinator.ts";

function runtimeState(
  characterId: string,
  name: string,
  role: "primary" | "managed",
  status: "connected" | "reconnecting" | "disconnected" | "error" = "connected",
  options: { type?: string; dead?: boolean; target?: string; hp?: number; mp?: number } = {},
) {
  return {
    role,
    characterId,
    state: {
      status,
      characterId,
      characterName: name,
      serverKey: "SR_EUII",
      message: \`\${name} \${status}.\`,
      character: {
        id: characterId,
        name,
        type: options.type ?? (role === "primary" ? "warrior" : "priest"),
        level: 80,
        hp: options.hp ?? 8000,
        maxHp: 10000,
        mp: options.mp ?? 2400,
        maxMp: 3000,
        target: options.target,
        dead: options.dead ?? false,
      },
      party: {
        inParty: true,
        leader: "Primary",
        members: ["Primary", "Support"],
        details: {},
      },
    },
  } as any;
}

test("Party Coordinator assigns and changes roles around one shared target without gameplay automation", () => {
  const logger = new Logger({ component: "party-coordinator-test" });
  const runtime = [
    runtimeState("CH_PRIMARY", "Primary", "primary", "connected", {
      type: "warrior",
      target: "goo-1",
    }),
    runtimeState("CH_SUPPORT", "Support", "managed", "connected", {
      type: "priest",
      hp: 6000,
      mp: 2800,
    }),
  ];
  const coordinator = new PartyCoordinatorService({
    logger,
    sessions: { characterStates: () => structuredClone(runtime) },
    now: () => new Date("2026-10-04T01:00:00.000Z"),
  });

  assert.deepEqual(coordinator.state().members.map((member) => member.status), ["no-role", "no-role"]);
  coordinator.assignRole("CH_PRIMARY", "tank");
  coordinator.assignRole("CH_SUPPORT", "healer");
  const ready = coordinator.setTarget("goo-1");
  assert.equal(ready.status, "ready");
  assert.equal(ready.roles.tank.status, "ready");
  assert.equal(ready.roles.healer.status, "ready");
  assert.equal(ready.roles.dps.status, "unassigned");
  assert.equal(ready.members[0]?.characterType, "warrior");
  assert.equal(ready.members[0]?.hpRatio, 0.8);
  assert.equal(ready.members[0]?.targetMatchesCharacter, true);
  assert.equal(ready.members[0]?.serverParty.inParty, true);
  assert.equal(ready.coordinationTransport, "shared-process-state");
  assert.equal(ready.localMessagingRequired, false);
  assert.equal(ready.gameplayMutation, false);
  assert.equal(ready.rawSocketAccess, false);
  assert.equal(ready.partyTemplatesActive, false);

  const changed = coordinator.assignRole("CH_SUPPORT", "dps");
  assert.equal(changed.roles.healer.status, "unassigned");
  assert.equal(changed.roles.dps.status, "ready");
  const noTarget = coordinator.clearTarget();
  assert.deepEqual(noTarget.members.map((member) => member.status), ["no-target", "no-target"]);
  assert.equal(noTarget.roles.tank.notReadyCount, 1);
});

test("Party Coordinator isolates failed sessions and prunes removed member state", () => {
  const logger = new Logger({ component: "party-coordinator-isolation-test" });
  let runtime = [
    runtimeState("CH_PRIMARY", "Primary", "primary"),
    runtimeState("CH_RECONNECT", "Reconnect", "managed", "reconnecting"),
    runtimeState("CH_FAILED", "Failed", "managed", "error"),
  ];
  const coordinator = new PartyCoordinatorService({
    logger,
    sessions: { characterStates: () => structuredClone(runtime) },
  });
  coordinator.assignRole("CH_PRIMARY", "tank");
  coordinator.assignRole("CH_RECONNECT", "healer");
  coordinator.assignRole("CH_FAILED", "dps");
  const state = coordinator.setTarget("target-1");
  assert.equal(state.members.find((member) => member.characterId === "CH_PRIMARY")?.status, "ready");
  assert.equal(state.members.find((member) => member.characterId === "CH_RECONNECT")?.status, "unavailable");
  assert.equal(state.members.find((member) => member.characterId === "CH_FAILED")?.status, "unavailable");

  runtime = [runtimeState("CH_PRIMARY", "Primary", "primary")];
  const removed = coordinator.state();
  assert.equal(removed.roles.healer.assignedCount, 0);
  assert.equal(removed.roles.dps.assignedCount, 0);

  runtime = [
    runtimeState("CH_PRIMARY", "Primary", "primary"),
    runtimeState("CH_RECONNECT", "Reconnect", "managed"),
  ];
  const rejoined = coordinator.state();
  assert.equal(rejoined.members.find((member) => member.characterId === "CH_RECONNECT")?.status, "no-role");
  assert.match(logger.exportText(), /removed stale local role assignment/);
});

test("Party Coordinator handles disconnected, dead, validation, cloning, and empty membership", () => {
  const logger = new Logger({ component: "party-coordinator-validation-test" });
  let runtime = [
    runtimeState("CH_PRIMARY", "Primary", "primary", "disconnected"),
    runtimeState("CH_DEAD", "Dead", "managed", "connected", { dead: true }),
  ];
  const coordinator = new PartyCoordinatorService({
    logger,
    sessions: { characterStates: () => structuredClone(runtime) },
  });
  coordinator.assignRole("CH_PRIMARY", "tank");
  coordinator.assignRole("CH_DEAD", "healer");
  const state = coordinator.setTarget("target-2");
  assert.equal(state.members[0]?.status, "disconnected");
  assert.equal(state.members[1]?.status, "unavailable");
  assert.throws(
    () => coordinator.assignRole("CH_MISSING", "dps"),
    (error: unknown) =>
      error instanceof PartyCoordinatorError && error.code === "PARTY_MEMBER_NOT_FOUND",
  );
  assert.throws(
    () => coordinator.setTarget("   "),
    (error: unknown) =>
      error instanceof PartyCoordinatorError && error.code === "PARTY_TARGET_REQUIRED",
  );
  const cloned = coordinator.state() as any;
  cloned.members[0].status = "ready";
  assert.equal(coordinator.state().members[0]?.status, "disconnected");

  runtime = [];
  const empty = coordinator.state();
  assert.equal(empty.memberCount, 0);
  assert.equal(empty.target, undefined);
  assert.match(empty.message, /waiting for a local Character session/);
});
