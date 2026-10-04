import { randomUUID } from "node:crypto";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { LocalCharacterMessagingService } from "../character/messaging.ts";
import type {
  MultiCharacterSessionManager,
  MultiCharacterSessionManagerError,
} from "../character/session-manager.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger } from "../logging/logger.ts";
import type {
  PartyCoordinatorRole,
  PartyCoordinatorService,
  PartyCoordinatorState,
} from "../party/coordinator.ts";
import type { ScriptRuntimeService, ScriptRuntimeState } from "../script/runtime.ts";

export type Slice73LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice73LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice73LiveTestResult {
  readonly testId: string;
  readonly slice: "7.3";
  readonly outcome: Slice73LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly managedCharacterId?: string;
  readonly managedCharacterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice73LiveTestStep[];
  readonly error?: Readonly<{ readonly code: string; readonly step: string; readonly message: string }>;
}

export interface Slice73LiveTestState {
  readonly status: "idle" | "running" | Slice73LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice73LiveTestResult;
}

export interface Slice73LiveTestServiceOptions {
  readonly logger: Logger;
  readonly userRuntime: Pick<ScriptRuntimeService, "state">;
  readonly primary: Pick<AdventureLandCharacterService, "state">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly sessions: Pick<MultiCharacterSessionManager, "state" | "start" | "stop">;
  readonly coordinator: Pick<
    PartyCoordinatorService,
    "state" | "assignRole" | "clearRole" | "setTarget" | "clearTarget"
  >;
  readonly messaging: Pick<LocalCharacterMessagingService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice73LiveTestService {
  readonly #logger: Logger;
  readonly #userRuntime: Slice73LiveTestServiceOptions["userRuntime"];
  readonly #primary: Slice73LiveTestServiceOptions["primary"];
  readonly #selection: Slice73LiveTestServiceOptions["selection"];
  readonly #sessions: Slice73LiveTestServiceOptions["sessions"];
  readonly #coordinator: Slice73LiveTestServiceOptions["coordinator"];
  readonly #messaging: Slice73LiveTestServiceOptions["messaging"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice73LiveTestResult>;
  #state: Slice73LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 7.3 Party Coordinator test is ready.",
  });

  constructor(options: Slice73LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#userRuntime = options.userRuntime;
    this.#primary = options.primary;
    this.#selection = options.selection;
    this.#sessions = options.sessions;
    this.#coordinator = options.coordinator;
    this.#messaging = options.messaging;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live73-${randomUUID()}`);
  }

  state(): Slice73LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice73LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice73LiveTestResult> {
    const testId = this.#idFactory();
    const targetId = `slice73-target-${randomUUID()}`;
    const startedAt = this.#clock().toISOString();
    const steps: Slice73LiveTestStep[] = [];
    const userBefore = this.#userRuntime.state();
    const primaryBefore = this.#primary.state();
    const messagingBefore = this.#messaging.state();
    const coordinatorBefore = this.#coordinator.state();
    let managedId: string | undefined;
    let managedName: string | undefined;

    this.#state = Object.freeze({
      status: "running",
      message:
        "Slice 7.3 is connecting one temporary Character, exercising roles and one shared coordinator target, then removing only the test session.",
    });
    this.#logger.info("Slice 7.3 Party Coordinator live test started.", {
      testId,
      bounded: true,
      gameplayMutation: false,
      rawSocketAccess: false,
      partyTemplatesActive: false,
      userScriptInterrupted: false,
    });

    try {
      if (userBefore.status === "running" || userBefore.status === "paused") {
        throw failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A user script is running or paused. Slice 7.3 did not interrupt or replace it.",
          "preflight",
          true,
        );
      }
      if (
        primaryBefore.status !== "connected" ||
        !primaryBefore.characterId ||
        !primaryBefore.characterName ||
        !primaryBefore.serverKey
      ) {
        throw failure(
          "LIVE_TEST_PRIMARY_CHARACTER_NOT_CONNECTED",
          "Connect one primary headless Character before running Slice 7.3.",
          "preflight",
          true,
        );
      }
      const selection = this.#selection.state();
      if (selection.status !== "ready") {
        throw failure(
          "LIVE_TEST_SELECTION_NOT_READY",
          "Characters and servers must be loaded before running Slice 7.3.",
          "preflight",
          true,
        );
      }
      const managerBefore = this.#sessions.state();
      if (managerBefore.managedSessionCount !== 0) {
        throw failure(
          "LIVE_TEST_MANAGED_SESSIONS_ALREADY_ACTIVE",
          "Slice 7.3 will not interrupt existing managed Character sessions.",
          "preflight",
          true,
        );
      }
      if (managerBefore.activeSessionCount !== 1 || managerBefore.availableSlots < 1) {
        throw failure(
          "LIVE_TEST_SESSION_CAPACITY_UNAVAILABLE",
          "The session manager does not have one free bounded slot for the Party Coordinator probe.",
          "preflight",
          true,
        );
      }
      const candidate = selection.characters.find((character) =>
        character.id !== primaryBefore.characterId && !character.online
      );
      if (!candidate) {
        throw failure(
          "LIVE_TEST_NO_SECOND_OFFLINE_CHARACTER",
          "No second offline Character is available for the Party Coordinator probe.",
          "preflight",
          true,
        );
      }
      managedId = candidate.id;
      managedName = candidate.name;
      if (messagingBefore.localOnly !== true || messagingBefore.rawSocketAccess !== false) {
        throw failure(
          "LIVE_TEST_LOCAL_MESSAGING_MODE_INVALID",
          "Local Character messaging is not reporting the required local-only safety mode.",
          "preflight",
        );
      }

      steps.push(step("preflight",
        "A primary Character, one offline secondary Character, free capacity, an untouched user Script runtime, and safe local coordination infrastructure are available.",
        {
          primaryCharacterId: primaryBefore.characterId,
          managedCharacterId: candidate.id,
          serverKey: primaryBefore.serverKey,
          activeSessionCountBefore: managerBefore.activeSessionCount,
          userScriptStatusBefore: userBefore.status,
          coordinatorMemberCountBefore: coordinatorBefore.memberCount,
          coordinatorTargetBefore: coordinatorBefore.target?.id,
          localMessagingRequestCountBefore: messagingBefore.requestCount,
          localMessagingDeliveryCountBefore: messagingBefore.localDeliveryCount,
        }));

      try {
        await this.#sessions.start(candidate.id, primaryBefore.serverKey);
      } catch (error) {
        const managerError = asManagerError(error);
        throw failure(
          managerError.code === "SESSION_CONNECT_FAILED"
            ? "LIVE_TEST_SECONDARY_CONNECT_BLOCKED"
            : managerError.code,
          managerError.message,
          "roles-and-target",
          managerError.code === "SESSION_CONNECT_FAILED" ||
            managerError.code === "SESSION_CHARACTER_ALREADY_ONLINE",
        );
      }

      this.#coordinator.assignRole(primaryBefore.characterId, "tank");
      this.#coordinator.assignRole(candidate.id, "healer");
      const coordinated = this.#coordinator.setTarget(targetId);
      assertMember(coordinated, primaryBefore.characterId, "tank", "ready", "roles-and-target");
      assertMember(coordinated, candidate.id, "healer", "ready", "roles-and-target");
      if (
        coordinated.target?.id !== targetId ||
        coordinated.roles.tank.status !== "ready" ||
        coordinated.roles.healer.status !== "ready" ||
        coordinated.partyTemplatesActive ||
        coordinated.gameplayMutation ||
        coordinated.rawSocketAccess
      ) {
        throw failure(
          "LIVE_TEST_COORDINATOR_STATE_MISMATCH",
          "Tank/Healer roles or the shared Party Coordinator target did not reach the expected ready state.",
          "roles-and-target",
        );
      }
      steps.push(step("roles-and-target",
        "Primary and managed sessions were coordinated as Tank and Healer around one shared logical target without gameplay automation.",
        {
          sharedTargetId: coordinated.target.id,
          tank: coordinated.roles.tank,
          healer: coordinated.roles.healer,
          dps: coordinated.roles.dps,
          coordinationTransport: coordinated.coordinationTransport,
          localMessagingRequired: coordinated.localMessagingRequired,
          gameplayMutation: coordinated.gameplayMutation,
          rawSocketAccess: coordinated.rawSocketAccess,
          partyTemplatesActive: coordinated.partyTemplatesActive,
        }));

      const roleChanged = this.#coordinator.assignRole(candidate.id, "dps");
      assertMember(roleChanged, candidate.id, "dps", "ready", "role-change");
      if (
        roleChanged.roles.healer.status !== "unassigned" ||
        roleChanged.roles.dps.status !== "ready"
      ) {
        throw failure(
          "LIVE_TEST_ROLE_CHANGE_MISMATCH",
          "Changing the managed Character from Healer to DPS retained stale role state.",
          "role-change",
        );
      }
      const noTarget = this.#coordinator.clearTarget();
      assertMember(noTarget, primaryBefore.characterId, "tank", "no-target", "role-change");
      assertMember(noTarget, candidate.id, "dps", "no-target", "role-change");
      this.#coordinator.setTarget(targetId);
      steps.push(step("role-change",
        "The managed Character changed from Healer to DPS without cross-session role leakage, and clearing the target produced explicit no-target states.",
        {
          tank: roleChanged.roles.tank,
          healer: roleChanged.roles.healer,
          dps: roleChanged.roles.dps,
          noTargetStatuses: noTarget.members.map((member) => ({
            characterId: member.characterId,
            status: member.status,
          })),
        }));

      await this.#sessions.stop(candidate.id, "slice73_live_test");
      managedId = undefined;
      const removed = this.#coordinator.state();
      if (
        removed.memberCount !== 1 ||
        removed.members.some((member) => member.characterId === candidate.id) ||
        removed.roles.dps.assignedCount !== 0
      ) {
        throw failure(
          "LIVE_TEST_MEMBER_REMOVAL_MISMATCH",
          "Removing the temporary managed session did not prune its Coordinator member and role state.",
          "member-removal",
        );
      }
      steps.push(step("member-removal",
        "Removing the temporary managed session pruned only that Coordinator member and its DPS assignment while the primary remained isolated.",
        {
          memberCountAfterRemoval: removed.memberCount,
          remainingMemberIds: removed.members.map((member) => member.characterId),
          dpsAssignedAfterRemoval: removed.roles.dps.assignedCount,
        }));

      restoreCoordinator(this.#coordinator, coordinatorBefore);
      const managerAfter = this.#sessions.state();
      const primaryAfter = this.#primary.state();
      const userAfter = this.#userRuntime.state();
      const messagingAfter = this.#messaging.state();
      const coordinatorAfter = this.#coordinator.state();
      const requestDelta = messagingAfter.requestCount - messagingBefore.requestCount;
      const deliveryDelta = messagingAfter.localDeliveryCount - messagingBefore.localDeliveryCount;
      if (
        managerAfter.activeSessionCount !== 1 ||
        managerAfter.managedSessionCount !== 0 ||
        primaryAfter.status !== "connected" ||
        primaryAfter.characterId !== primaryBefore.characterId ||
        primaryAfter.serverKey !== primaryBefore.serverKey ||
        !sameRuntime(userBefore, userAfter) ||
        requestDelta !== 0 ||
        deliveryDelta !== 0 ||
        messagingAfter.localOnly !== true ||
        messagingAfter.rawSocketAccess !== false ||
        !sameCoordinatorConfiguration(coordinatorBefore, coordinatorAfter)
      ) {
        throw failure(
          "LIVE_TEST_FINAL_STATE_MISMATCH",
          "The bounded Party Coordinator probe did not restore the expected session, Script, messaging, and Coordinator configuration.",
          "final-state",
        );
      }
      steps.push(step("final-state",
        "Only the temporary managed session was removed; the primary Character, user Script, messaging telemetry, and pre-test Coordinator configuration were preserved.",
        {
          primaryCharacterId: primaryAfter.characterId,
          primaryStatus: primaryAfter.status,
          activeSessionCountAfter: managerAfter.activeSessionCount,
          managedSessionCountAfter: managerAfter.managedSessionCount,
          userScriptInterrupted: false,
          localMessagingRequestDelta: requestDelta,
          localMessagingDeliveryDelta: deliveryDelta,
          localOnly: true,
          gameplayMutation: false,
          rawSocketAccess: false,
          partyTemplatesActive: false,
          coordinatorConfigurationRestored: true,
        }));

      const result: Slice73LiveTestResult = Object.freeze({
        testId,
        slice: "7.3",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primaryBefore.characterId,
        primaryCharacterName: primaryBefore.characterName,
        managedCharacterId: candidate.id,
        managedCharacterName: candidate.name,
        serverKey: primaryBefore.serverKey,
        message:
          "Slice 7.3 passed: local sessions shared one Coordinator target, Tank/Healer/DPS state changed cleanly, member removal was isolated, and no gameplay, raw-socket, template, messaging, or user-script side effect occurred.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 7.3 Party Coordinator live test passed.", {
        testId,
        localMessagingRequestDelta: requestDelta,
        localMessagingDeliveryDelta: deliveryDelta,
        gameplayMutation: false,
        rawSocketAccess: false,
        partyTemplatesActive: false,
        userScriptInterrupted: false,
      });
      return structuredClone(result);
    } catch (error) {
      if (managedId) {
        const manager = this.#sessions.state();
        if (manager.sessions.some((session) =>
          session.role === "managed" && session.characterId === managedId
        )) {
          try {
            await this.#sessions.stop(managedId, "slice73_cleanup");
          } catch (cleanupError) {
            this.#logger.warn("Slice 7.3 managed Character cleanup failed.", {
              testId,
              characterId: managedId,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
              gameplayMutation: false,
            });
          }
        }
      }
      try {
        restoreCoordinator(this.#coordinator, coordinatorBefore);
      } catch (cleanupError) {
        this.#logger.warn("Slice 7.3 Coordinator configuration restore failed.", {
          testId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          gameplayMutation: false,
        });
      }
      const problem = error instanceof Slice73Failure
        ? error
        : failure(
          "LIVE_TEST_SLICE_7_3_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice73LiveTestOutcome = problem.blocked ? "blocked" : "failed";
      const primary = this.#primary.state();
      const result: Slice73LiveTestResult = Object.freeze({
        testId,
        slice: "7.3",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primary.characterId,
        primaryCharacterName: primary.characterName,
        managedCharacterId: managedId,
        managedCharacterName: managedName,
        serverKey: primary.serverKey,
        message: problem.message,
        steps: Object.freeze(steps),
        error: Object.freeze({ code: problem.code, step: problem.step, message: problem.message }),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      this.#logger.warn("Slice 7.3 Party Coordinator live test did not pass.", {
        testId,
        outcome,
        errorCode: problem.code,
        step: problem.step,
        message: problem.message,
      });
      return structuredClone(result);
    }
  }
}

class Slice73Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice73Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function failure(code: string, message: string, stepName: string, blocked = false): Slice73Failure {
  return new Slice73Failure(code, message, stepName, blocked);
}

function step(
  name: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): Slice73LiveTestStep {
  return Object.freeze({ name, outcome: "passed" as const, message, evidence: Object.freeze(evidence) });
}

function assertMember(
  state: PartyCoordinatorState,
  characterId: string,
  role: PartyCoordinatorRole,
  status: string,
  stepName: string,
): void {
  const member = state.members.find((candidate) => candidate.characterId === characterId);
  if (!member || member.role !== role || member.status !== status) {
    throw failure(
      "LIVE_TEST_COORDINATOR_MEMBER_MISMATCH",
      `Coordinator member ${characterId} did not report ${role}/${status}.`,
      stepName,
    );
  }
}

function restoreCoordinator(
  coordinator: Slice73LiveTestServiceOptions["coordinator"],
  before: PartyCoordinatorState,
): void {
  const current = coordinator.state();
  for (const member of current.members) {
    if (member.role) coordinator.clearRole(member.characterId);
  }
  coordinator.clearTarget();
  for (const member of before.members) {
    if (!member.role) continue;
    if (coordinator.state().members.some((candidate) => candidate.characterId === member.characterId)) {
      coordinator.assignRole(member.characterId, member.role);
    }
  }
  if (before.target?.id) coordinator.setTarget(before.target.id);
}

function sameCoordinatorConfiguration(
  before: PartyCoordinatorState,
  after: PartyCoordinatorState,
): boolean {
  if (before.target?.id !== after.target?.id) return false;
  const roles = (state: PartyCoordinatorState) => state.members
    .filter((member) => member.role)
    .map((member) => `${member.characterId}:${member.role}`)
    .sort();
  return JSON.stringify(roles(before)) === JSON.stringify(roles(after));
}

function sameRuntime(before: ScriptRuntimeState, after: ScriptRuntimeState): boolean {
  return before.status === after.status &&
    before.scriptName === after.scriptName &&
    before.runId === after.runId &&
    before.loadedAt === after.loadedAt &&
    before.startedAt === after.startedAt &&
    before.pausedAt === after.pausedAt &&
    before.stoppedAt === after.stoppedAt &&
    before.crashedAt === after.crashedAt;
}

function asManagerError(error: unknown): Readonly<{ code: string; message: string }> {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as MultiCharacterSessionManagerError).code === "string"
  ) {
    return {
      code: (error as MultiCharacterSessionManagerError).code,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    code: "SESSION_MANAGER_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}
