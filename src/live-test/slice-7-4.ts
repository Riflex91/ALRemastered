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
import {
  recommendedPartyRole,
  type PartyTemplateService,
  type PartyTemplateState,
} from "../party/templates.ts";
import type { ScriptRuntimeService, ScriptRuntimeState } from "../script/runtime.ts";

export type Slice74LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice74LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice74LiveTestResult {
  readonly testId: string;
  readonly slice: "7.4";
  readonly outcome: Slice74LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly managedCharacters: readonly Readonly<{
    readonly characterId: string;
    readonly characterName: string;
    readonly characterType: string;
    readonly expectedRole: PartyCoordinatorRole;
  }>[];
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice74LiveTestStep[];
  readonly error?: Readonly<{
    readonly code: string;
    readonly step: string;
    readonly message: string;
  }>;
}

export interface Slice74LiveTestState {
  readonly status: "idle" | "running" | Slice74LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice74LiveTestResult;
}

export interface Slice74LiveTestServiceOptions {
  readonly logger: Logger;
  readonly userRuntime: Pick<ScriptRuntimeService, "state">;
  readonly primary: Pick<AdventureLandCharacterService, "state">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly sessions: Pick<MultiCharacterSessionManager, "state" | "start" | "stop">;
  readonly coordinator: Pick<
    PartyCoordinatorService,
    "state" | "assignRole" | "clearRole" | "setTarget" | "clearTarget"
  >;
  readonly templates: Pick<
    PartyTemplateService,
    "state" | "applyRecommendedRoles" | "assignRole" | "clearRole"
  >;
  readonly messaging: Pick<LocalCharacterMessagingService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice74LiveTestService {
  readonly #logger: Logger;
  readonly #userRuntime: Slice74LiveTestServiceOptions["userRuntime"];
  readonly #primary: Slice74LiveTestServiceOptions["primary"];
  readonly #selection: Slice74LiveTestServiceOptions["selection"];
  readonly #sessions: Slice74LiveTestServiceOptions["sessions"];
  readonly #coordinator: Slice74LiveTestServiceOptions["coordinator"];
  readonly #templates: Slice74LiveTestServiceOptions["templates"];
  readonly #messaging: Slice74LiveTestServiceOptions["messaging"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice74LiveTestResult>;
  #state: Slice74LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 7.4 Party Templates test is ready.",
  });

  constructor(options: Slice74LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#userRuntime = options.userRuntime;
    this.#primary = options.primary;
    this.#selection = options.selection;
    this.#sessions = options.sessions;
    this.#coordinator = options.coordinator;
    this.#templates = options.templates;
    this.#messaging = options.messaging;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live74-${randomUUID()}`);
  }

  state(): Slice74LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice74LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice74LiveTestResult> {
    const testId = this.#idFactory();
    const targetId = `slice74-target-${randomUUID()}`;
    const startedAt = this.#clock().toISOString();
    const steps: Slice74LiveTestStep[] = [];
    const userBefore = this.#userRuntime.state();
    const primaryBefore = this.#primary.state();
    const messagingBefore = this.#messaging.state();
    const coordinatorBefore = this.#coordinator.state();
    const managedStarted: string[] = [];
    let selectedManaged: Slice74LiveTestResult["managedCharacters"] = [];

    this.#state = Object.freeze({
      status: "running",
      message:
        "Slice 7.4 is connecting two bounded template-role Characters, applying Warrior Tank / Priest Healer / DPS roles, then restoring the original local state.",
    });
    this.#logger.info("Slice 7.4 Party Templates live test started.", {
      testId,
      bounded: true,
      gameplayMutation: false,
      rawSocketAccess: false,
      localMessagingRequired: false,
      userScriptInterrupted: false,
    });

    try {
      if (userBefore.status === "running" || userBefore.status === "paused") {
        throw failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A user script is running or paused. Slice 7.4 did not interrupt or replace it.",
          "preflight",
          true,
        );
      }
      if (
        primaryBefore.status !== "connected" ||
        !primaryBefore.characterId ||
        !primaryBefore.characterName ||
        !primaryBefore.serverKey ||
        !primaryBefore.character?.type
      ) {
        throw failure(
          "LIVE_TEST_PRIMARY_CHARACTER_NOT_CONNECTED",
          "Connect one primary headless Character with live class data before running Slice 7.4.",
          "preflight",
          true,
        );
      }
      const primaryRole = recommendedPartyRole(primaryBefore.character.type);
      if (!primaryRole) {
        throw failure(
          "LIVE_TEST_PRIMARY_TEMPLATE_UNAVAILABLE",
          "The primary Character class does not have a Party Template recommendation.",
          "preflight",
          true,
        );
      }

      const selection = this.#selection.state();
      if (selection.status !== "ready") {
        throw failure(
          "LIVE_TEST_SELECTION_NOT_READY",
          "Characters and servers must be loaded before running Slice 7.4.",
          "preflight",
          true,
        );
      }
      const managerBefore = this.#sessions.state();
      if (managerBefore.managedSessionCount !== 0) {
        throw failure(
          "LIVE_TEST_MANAGED_SESSIONS_ALREADY_ACTIVE",
          "Slice 7.4 will not interrupt existing managed Character sessions.",
          "preflight",
          true,
        );
      }

      const requiredRoles: PartyCoordinatorRole[] = ["tank", "healer", "dps"]
        .filter((role) => role !== primaryRole) as PartyCoordinatorRole[];
      if (managerBefore.activeSessionCount !== 1 || managerBefore.availableSlots < requiredRoles.length) {
        throw failure(
          "LIVE_TEST_SESSION_CAPACITY_UNAVAILABLE",
          `The session manager needs ${requiredRoles.length} free bounded slot(s) for the Party Templates probe.`,
          "preflight",
          true,
        );
      }

      const used = new Set<string>([primaryBefore.characterId]);
      const selected = requiredRoles.map((role) => {
        const candidate = selection.characters.find((character) =>
          !used.has(character.id) &&
          !character.online &&
          recommendedPartyRole(character.type) === role
        );
        if (!candidate) {
          throw failure(
            "LIVE_TEST_REQUIRED_TEMPLATE_CHARACTER_UNAVAILABLE",
            `No offline Character is available for the ${role} Party Template role.`,
            "preflight",
            true,
          );
        }
        used.add(candidate.id);
        return Object.freeze({
          characterId: candidate.id,
          characterName: candidate.name,
          characterType: candidate.type,
          expectedRole: role,
        });
      });
      selectedManaged = Object.freeze(selected);

      if (messagingBefore.localOnly !== true || messagingBefore.rawSocketAccess !== false) {
        throw failure(
          "LIVE_TEST_LOCAL_MESSAGING_MODE_INVALID",
          "Local Character messaging is not reporting the required local-only safety mode.",
          "preflight",
        );
      }

      steps.push(step(
        "preflight",
        "One primary Character, the missing template-role Characters, free capacity, an untouched user Script runtime, and local-only safety infrastructure are available.",
        {
          primaryCharacterId: primaryBefore.characterId,
          primaryCharacterType: primaryBefore.character.type,
          primaryRecommendedRole: primaryRole,
          managedCandidates: selectedManaged,
          activeSessionCountBefore: managerBefore.activeSessionCount,
          availableSlotsBefore: managerBefore.availableSlots,
          userScriptStatusBefore: userBefore.status,
          coordinatorMemberCountBefore: coordinatorBefore.memberCount,
          localMessagingRequestCountBefore: messagingBefore.requestCount,
          localMessagingDeliveryCountBefore: messagingBefore.localDeliveryCount,
        },
      ));

      for (const candidate of selectedManaged) {
        try {
          await this.#sessions.start(candidate.characterId, primaryBefore.serverKey);
          managedStarted.push(candidate.characterId);
        } catch (error) {
          const managerError = asManagerError(error);
          throw failure(
            managerError.code === "SESSION_CONNECT_FAILED"
              ? "LIVE_TEST_TEMPLATE_CHARACTER_CONNECT_BLOCKED"
              : managerError.code,
            managerError.message,
            "recommended-templates",
            managerError.code === "SESSION_CONNECT_FAILED" ||
              managerError.code === "SESSION_CHARACTER_ALREADY_ONLINE",
          );
        }
      }

      this.#coordinator.setTarget(targetId);
      const applied = this.#templates.applyRecommendedRoles();
      assertTemplateAssignment(applied, primaryBefore.characterId, primaryRole, true, "recommended-templates");
      for (const candidate of selectedManaged) {
        assertTemplateAssignment(
          applied,
          candidate.characterId,
          candidate.expectedRole,
          true,
          "recommended-templates",
        );
      }
      const coordinated = this.#coordinator.state();
      for (const member of coordinated.members) {
        const expected = recommendedPartyRole(member.characterType);
        if (!expected || member.role !== expected || member.status !== "ready") {
          throw failure(
            "LIVE_TEST_TEMPLATE_COORDINATOR_MISMATCH",
            `Coordinator member ${member.characterId} did not become ready with its recommended template role.`,
            "recommended-templates",
          );
        }
      }
      if (
        applied.status !== "ready" ||
        applied.matchedCount !== applied.memberCount ||
        applied.templateLayerActive !== true ||
        applied.gameplayMutation ||
        applied.rawSocketAccess ||
        applied.localMessagingRequired
      ) {
        throw failure(
          "LIVE_TEST_TEMPLATE_STATE_MISMATCH",
          "Party Templates did not report all local members matched with the required safety flags.",
          "recommended-templates",
        );
      }
      steps.push(step(
        "recommended-templates",
        "Warrior Tank, Priest Healer, and DPS recommendations were applied to the current local sessions through the existing Party Coordinator.",
        {
          sharedTargetId: targetId,
          assignments: applied.assignments,
          coordinatorRoles: coordinated.roles,
          templateLayerActive: applied.templateLayerActive,
          gameplayMutation: applied.gameplayMutation,
          rawSocketAccess: applied.rawSocketAccess,
          localMessagingRequired: applied.localMessagingRequired,
        },
      ));

      const dps = applied.assignments.find((item) => item.recommendedRole === "dps");
      if (!dps) {
        throw failure(
          "LIVE_TEST_DPS_TEMPLATE_MISSING",
          "The Party Templates probe did not expose a DPS member.",
          "simple-assignment",
        );
      }
      const overridden = this.#templates.assignRole(dps.characterId, "healer");
      assertTemplateAssignment(overridden, dps.characterId, "dps", false, "simple-assignment");
      const override = overridden.assignments.find((item) => item.characterId === dps.characterId);
      if (override?.currentRole !== "healer" || override.status !== "override") {
        throw failure(
          "LIVE_TEST_SIMPLE_ASSIGNMENT_MISMATCH",
          "Manual Party Template role assignment did not produce the expected override state.",
          "simple-assignment",
        );
      }
      const cleared = this.#templates.clearRole(dps.characterId);
      const clearedAssignment = cleared.assignments.find((item) => item.characterId === dps.characterId);
      if (clearedAssignment?.currentRole !== undefined || clearedAssignment?.status !== "needs-assignment") {
        throw failure(
          "LIVE_TEST_SIMPLE_CLEAR_MISMATCH",
          "Clearing one Party Template role did not produce the expected unassigned state.",
          "simple-assignment",
        );
      }
      const restored = this.#templates.applyRecommendedRoles();
      assertTemplateAssignment(restored, dps.characterId, "dps", true, "simple-assignment");
      steps.push(step(
        "simple-assignment",
        "One DPS member accepted a manual Healer override, could be cleared, and returned to DPS through the recommended-role action without creating separate template state.",
        {
          characterId: dps.characterId,
          recommendedRole: "dps",
          overrideRole: "healer",
          overrideStatus: override.status,
          clearStatus: clearedAssignment.status,
          restoredStatus: restored.assignments.find((item) => item.characterId === dps.characterId)?.status,
        },
      ));

      for (const characterId of [...managedStarted].reverse()) {
        await this.#sessions.stop(characterId, "slice74_live_test");
        managedStarted.splice(managedStarted.indexOf(characterId), 1);
      }
      const afterRemoval = this.#templates.state();
      if (
        afterRemoval.memberCount !== 1 ||
        afterRemoval.assignments.some((item) =>
          selectedManaged.some((candidate) => candidate.characterId === item.characterId)
        )
      ) {
        throw failure(
          "LIVE_TEST_TEMPLATE_MEMBER_REMOVAL_MISMATCH",
          "Removing the temporary managed sessions did not prune their Party Template assignments.",
          "member-removal",
        );
      }
      steps.push(step(
        "member-removal",
        "Only the two temporary managed sessions were removed, and their template assignments disappeared with the Coordinator members.",
        {
          memberCountAfterRemoval: afterRemoval.memberCount,
          remainingAssignments: afterRemoval.assignments,
        },
      ));

      restoreCoordinator(this.#coordinator, coordinatorBefore);
      const managerAfter = this.#sessions.state();
      const primaryAfter = this.#primary.state();
      const userAfter = this.#userRuntime.state();
      const messagingAfter = this.#messaging.state();
      const coordinatorAfter = this.#coordinator.state();
      const templateAfter = this.#templates.state();
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
          "The bounded Party Templates probe did not restore the expected session, Script, messaging, and Coordinator configuration.",
          "final-state",
        );
      }
      steps.push(step(
        "final-state",
        "The template layer remained stateless over the Coordinator; primary, user Script, messaging telemetry, and the pre-test Coordinator configuration were preserved.",
        {
          primaryCharacterId: primaryAfter.characterId,
          primaryStatus: primaryAfter.status,
          activeSessionCountAfter: managerAfter.activeSessionCount,
          managedSessionCountAfter: managerAfter.managedSessionCount,
          userScriptInterrupted: false,
          localMessagingRequestDelta: requestDelta,
          localMessagingDeliveryDelta: deliveryDelta,
          localOnly: true,
          gameplayMutation: templateAfter.gameplayMutation,
          rawSocketAccess: templateAfter.rawSocketAccess,
          localMessagingRequired: templateAfter.localMessagingRequired,
          coordinatorConfigurationRestored: true,
        },
      ));

      const result: Slice74LiveTestResult = Object.freeze({
        testId,
        slice: "7.4",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primaryBefore.characterId,
        primaryCharacterName: primaryBefore.characterName,
        managedCharacters: selectedManaged,
        serverKey: primaryBefore.serverKey,
        message:
          "Slice 7.4 passed: Warrior Tank, Priest Healer, DPS, manual role assignment, cleanup, and stateless Coordinator restoration were verified without gameplay, raw-socket, messaging, or user-script side effects.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 7.4 Party Templates live test passed.", {
        testId,
        localMessagingRequestDelta: requestDelta,
        localMessagingDeliveryDelta: deliveryDelta,
        gameplayMutation: false,
        rawSocketAccess: false,
        localMessagingRequired: false,
        userScriptInterrupted: false,
      });
      return structuredClone(result);
    } catch (error) {
      for (const characterId of [...managedStarted].reverse()) {
        try {
          await this.#sessions.stop(characterId, "slice74_cleanup");
        } catch (cleanupError) {
          this.#logger.warn("Slice 7.4 managed Character cleanup failed.", {
            testId,
            characterId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            gameplayMutation: false,
          });
        }
      }
      try {
        restoreCoordinator(this.#coordinator, coordinatorBefore);
      } catch (cleanupError) {
        this.#logger.warn("Slice 7.4 Coordinator configuration restore failed.", {
          testId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          gameplayMutation: false,
        });
      }
      const problem = error instanceof Slice74Failure
        ? error
        : failure(
          "LIVE_TEST_SLICE_7_4_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice74LiveTestOutcome = problem.blocked ? "blocked" : "failed";
      const primary = this.#primary.state();
      const result: Slice74LiveTestResult = Object.freeze({
        testId,
        slice: "7.4",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primary.characterId,
        primaryCharacterName: primary.characterName,
        managedCharacters: selectedManaged,
        serverKey: primary.serverKey,
        message: problem.message,
        steps: Object.freeze(steps),
        error: Object.freeze({
          code: problem.code,
          step: problem.step,
          message: problem.message,
        }),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      this.#logger.warn("Slice 7.4 Party Templates live test did not pass.", {
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

class Slice74Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice74Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function failure(code: string, message: string, stepName: string, blocked = false): Slice74Failure {
  return new Slice74Failure(code, message, stepName, blocked);
}

function step(
  name: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): Slice74LiveTestStep {
  return Object.freeze({
    name,
    outcome: "passed" as const,
    message,
    evidence: Object.freeze(evidence),
  });
}

function assertTemplateAssignment(
  state: PartyTemplateState,
  characterId: string,
  recommendedRole: PartyCoordinatorRole,
  matchesRecommendation: boolean,
  stepName: string,
): void {
  const assignment = state.assignments.find((item) => item.characterId === characterId);
  if (
    !assignment ||
    assignment.recommendedRole !== recommendedRole ||
    assignment.matchesRecommendation !== matchesRecommendation
  ) {
    throw failure(
      "LIVE_TEST_TEMPLATE_ASSIGNMENT_MISMATCH",
      `Party Template assignment ${characterId} did not report recommended role ${recommendedRole} with matchesRecommendation=${matchesRecommendation}.`,
      stepName,
    );
  }
}

function restoreCoordinator(
  coordinator: Slice74LiveTestServiceOptions["coordinator"],
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
