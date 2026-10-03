import { randomUUID } from "node:crypto";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type {
  LocalCharacterMessageEnvelope,
  LocalCharacterMessagingService,
} from "../character/messaging.ts";
import type {
  MultiCharacterSessionManager,
  MultiCharacterSessionManagerError,
} from "../character/session-manager.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService, ScriptRuntimeState } from "../script/runtime.ts";

export type Slice72LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice72LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice72LiveTestResult {
  readonly testId: string;
  readonly slice: "7.2";
  readonly outcome: Slice72LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly managedCharacterId?: string;
  readonly managedCharacterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice72LiveTestStep[];
  readonly error?: Readonly<{
    readonly code: string;
    readonly step: string;
    readonly message: string;
  }>;
}

export interface Slice72LiveTestState {
  readonly status: "idle" | "running" | Slice72LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice72LiveTestResult;
}

type ProbeRuntime = Pick<
  ScriptRuntimeService,
  "load" | "start" | "stop" | "dispose" | "state"
>;

export interface Slice72LiveTestServiceOptions {
  readonly logger: Logger;
  readonly userRuntime: Pick<ScriptRuntimeService, "state">;
  readonly createProbeRuntime: () => ProbeRuntime;
  readonly primary: Pick<AdventureLandCharacterService, "state">;
  readonly selection: Pick<AdventureLandSelectionService, "state">;
  readonly sessions: Pick<MultiCharacterSessionManager, "state" | "start" | "stop">;
  readonly messaging: Pick<LocalCharacterMessagingService, "state" | "send" | "onMessage">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice72LiveTestService {
  readonly #logger: Logger;
  readonly #userRuntime: Slice72LiveTestServiceOptions["userRuntime"];
  readonly #createProbeRuntime: Slice72LiveTestServiceOptions["createProbeRuntime"];
  readonly #primary: Slice72LiveTestServiceOptions["primary"];
  readonly #selection: Slice72LiveTestServiceOptions["selection"];
  readonly #sessions: Slice72LiveTestServiceOptions["sessions"];
  readonly #messaging: Slice72LiveTestServiceOptions["messaging"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice72LiveTestResult>;
  #state: Slice72LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 7.2 local Character messaging test is ready.",
  });

  constructor(options: Slice72LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#userRuntime = options.userRuntime;
    this.#createProbeRuntime = options.createProbeRuntime;
    this.#primary = options.primary;
    this.#selection = options.selection;
    this.#sessions = options.sessions;
    this.#messaging = options.messaging;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live72-${randomUUID()}`);
  }

  state(): Slice72LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice72LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice72LiveTestResult> {
    const testId = this.#idFactory();
    const token = `slice72-${randomUUID()}`;
    const startedAt = this.#clock().toISOString();
    const steps: Slice72LiveTestStep[] = [];
    const userRuntimeBefore = this.#userRuntime.state();
    const primaryBefore = this.#primary.state();
    const messagingBefore = this.#messaging.state();
    let managedCharacterId: string | undefined;
    let managedCharacterName: string | undefined;
    let probeRuntime: ProbeRuntime | undefined;
    let unsubscribe: (() => void) | undefined;
    let outboundEnvelope: LocalCharacterMessageEnvelope | undefined;
    let replyEnvelope: LocalCharacterMessageEnvelope | undefined;
    let replyError: unknown;

    this.#state = Object.freeze({
      status: "running",
      message:
        "Slice 7.2 is connecting one additional Character, exercising local send_cm() plus character.on('cm'), then removing only the test session.",
    });
    this.#logger.info("Slice 7.2 local Character messaging live test started.", {
      testId,
      bounded: true,
      localOnly: true,
      gameplayMutation: false,
      rawSocketAccess: false,
      userScriptInterrupted: false,
    });

    try {
      if (
        userRuntimeBefore.status === "running" ||
        userRuntimeBefore.status === "paused"
      ) {
        throw new Slice72Failure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A user script is running or paused. Slice 7.2 did not interrupt or replace it.",
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
        throw new Slice72Failure(
          "LIVE_TEST_PRIMARY_CHARACTER_NOT_CONNECTED",
          "Connect one primary headless Character before running Slice 7.2.",
          "preflight",
          true,
        );
      }

      const selection = this.#selection.state();
      if (selection.status !== "ready") {
        throw new Slice72Failure(
          "LIVE_TEST_SELECTION_NOT_READY",
          "Characters and servers must be loaded before running Slice 7.2.",
          "preflight",
          true,
        );
      }

      const managerBefore = this.#sessions.state();
      if (managerBefore.managedSessionCount !== 0) {
        throw new Slice72Failure(
          "LIVE_TEST_MANAGED_SESSIONS_ALREADY_ACTIVE",
          "Slice 7.2 will not interrupt existing managed Character sessions.",
          "preflight",
          true,
        );
      }
      if (managerBefore.activeSessionCount !== 1 || managerBefore.availableSlots < 1) {
        throw new Slice72Failure(
          "LIVE_TEST_SESSION_CAPACITY_UNAVAILABLE",
          "The session manager does not have one free bounded slot for the local messaging probe.",
          "preflight",
          true,
        );
      }

      const candidate = selection.characters.find((character) =>
        character.id !== primaryBefore.characterId && !character.online
      );
      if (!candidate) {
        throw new Slice72Failure(
          "LIVE_TEST_NO_SECOND_OFFLINE_CHARACTER",
          "No second offline Character is available for the local messaging probe.",
          "preflight",
          true,
        );
      }
      managedCharacterId = candidate.id;
      managedCharacterName = candidate.name;

      if (
        messagingBefore.localOnly !== true ||
        messagingBefore.rawSocketAccess !== false
      ) {
        throw new Slice72Failure(
          "LIVE_TEST_LOCAL_MESSAGING_MODE_INVALID",
          "Local Character messaging is not reporting the required local-only safety mode.",
          "preflight",
        );
      }

      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message:
          "One primary Character, one offline secondary Character, free session capacity, an untouched user Script runtime, and local-only messaging are available.",
        evidence: Object.freeze({
          primaryCharacterId: primaryBefore.characterId,
          primaryCharacterName: primaryBefore.characterName,
          managedCharacterId: candidate.id,
          managedCharacterName: candidate.name,
          serverKey: primaryBefore.serverKey,
          activeSessionCountBefore: managerBefore.activeSessionCount,
          availableSlotsBefore: managerBefore.availableSlots,
          userScriptStatusBefore: userRuntimeBefore.status,
          userScriptRunIdBefore: userRuntimeBefore.runId,
          localOnly: messagingBefore.localOnly,
          rawSocketAccess: messagingBefore.rawSocketAccess,
          messagingRequestCountBefore: messagingBefore.requestCount,
          localDeliveryCountBefore: messagingBefore.localDeliveryCount,
        }),
      }));

      try {
        await this.#sessions.start(candidate.id, primaryBefore.serverKey);
      } catch (error) {
        const managerError = asManagerError(error);
        throw new Slice72Failure(
          managerError.code === "SESSION_CONNECT_FAILED"
            ? "LIVE_TEST_SECONDARY_CONNECT_BLOCKED"
            : managerError.code,
          managerError.message,
          "local-send",
          managerError.code === "SESSION_CONNECT_FAILED" ||
            managerError.code === "SESSION_CHARACTER_ALREADY_ONLINE",
        );
      }

      const managerDuring = this.#sessions.state();
      if (
        managerDuring.activeSessionCount !== 2 ||
        managerDuring.managedSessionCount !== 1 ||
        !managerDuring.sessions.some((session) =>
          session.role === "managed" &&
          session.characterName === candidate.name &&
          session.status === "connected"
        )
      ) {
        throw new Slice72Failure(
          "LIVE_TEST_SECONDARY_SESSION_STATE_MISMATCH",
          "The secondary Character did not become one healthy local managed session.",
          "local-send",
        );
      }

      unsubscribe = this.#messaging.onMessage((envelope) => {
        if (
          envelope.senderName === primaryBefore.characterName &&
          envelope.receiverName === candidate.name &&
          isMessageKind(envelope.message, "slice72-probe", token)
        ) {
          outboundEnvelope = envelope;
          void this.#messaging.send(
            candidate.name,
            primaryBefore.characterName!,
            { kind: "slice72-reply", token },
          ).then(() => undefined).catch((error) => {
            replyError = error;
          });
          return;
        }
        if (
          envelope.senderName === candidate.name &&
          envelope.receiverName === primaryBefore.characterName &&
          isMessageKind(envelope.message, "slice72-reply", token)
        ) {
          replyEnvelope = envelope;
        }
      });

      probeRuntime = this.#createProbeRuntime();
      await probeRuntime.load({
        name: "slice72-local-cm-probe",
        source: probeSource(candidate.name, token),
      });
      const probeStart = await probeRuntime.start();
      if (probeStart.status !== "running") {
        throw new Slice72Failure(
          "LIVE_TEST_PROBE_SCRIPT_START_FAILED",
          probeStart.error?.message ?? "The isolated send_cm() probe did not start.",
          "local-send",
        );
      }

      const sendObserved = await waitFor(
        () => Boolean(outboundEnvelope) && logExists(
          this.#logger,
          "script:slice72-local-cm-probe",
          `slice72-send-result:${token}`,
        ),
        2_500,
      );
      if (!sendObserved || !outboundEnvelope) {
        throw new Slice72Failure(
          "LIVE_TEST_LOCAL_SEND_NOT_CONFIRMED",
          "The isolated script did not complete a compatible local send_cm() delivery.",
          "local-send",
        );
      }

      const messagingAfterSend = this.#messaging.state();
      steps.push(Object.freeze({
        name: "local-send",
        outcome: "passed",
        message:
          "The isolated primary Character script used send_cm() to deliver one JSON message locally; an intentionally missing recipient was omitted from receivers/locals.",
        evidence: Object.freeze({
          senderName: outboundEnvelope.senderName,
          receiverName: outboundEnvelope.receiverName,
          sequence: outboundEnvelope.sequence,
          token,
          compatibleResult: {
            receivers: [candidate.name],
            locals: [candidate.name],
          },
          missingRecipientOmitted: true,
          activeSessionCount: managerDuring.activeSessionCount,
          localOnly: messagingAfterSend.localOnly,
          rawSocketAccess: messagingAfterSend.rawSocketAccess,
        }),
      }));

      const replyObserved = await waitFor(
        () => !replyError &&
          Boolean(replyEnvelope) &&
          logExists(
            this.#logger,
            "script:slice72-local-cm-probe",
            `slice72-cm-received:${token}`,
          ),
        2_500,
      );
      if (replyError) {
        throw new Slice72Failure(
          "LIVE_TEST_LOCAL_REPLY_FAILED",
          replyError instanceof Error ? replyError.message : String(replyError),
          "compatible-receive",
        );
      }
      if (!replyObserved || !replyEnvelope) {
        throw new Slice72Failure(
          "LIVE_TEST_CHARACTER_CM_EVENT_NOT_RECEIVED",
          "The primary probe script did not receive the managed Character reply through character.on('cm').",
          "compatible-receive",
        );
      }

      steps.push(Object.freeze({
        name: "compatible-receive",
        outcome: "passed",
        message:
          "A managed Character local reply reached the primary isolated worker through the Adventure Land-compatible character.on('cm') event payload.",
        evidence: Object.freeze({
          senderName: replyEnvelope.senderName,
          receiverName: replyEnvelope.receiverName,
          sequence: replyEnvelope.sequence,
          eventPayload: {
            name: candidate.name,
            message: { kind: "slice72-reply", token },
          },
          characterOnCm: true,
          globalServerRoutingUsed: false,
        }),
      }));

      await probeRuntime.stop();
      await probeRuntime.dispose();
      probeRuntime = undefined;
      unsubscribe();
      unsubscribe = undefined;

      await this.#sessions.stop(candidate.id, "slice72_live_test");
      managedCharacterId = undefined;

      const managerAfter = this.#sessions.state();
      const messagingAfter = this.#messaging.state();
      const primaryAfter = this.#primary.state();
      const userRuntimeAfter = this.#userRuntime.state();
      const requestDelta = messagingAfter.requestCount - messagingBefore.requestCount;
      const deliveryDelta =
        messagingAfter.localDeliveryCount - messagingBefore.localDeliveryCount;
      const unavailableDelta =
        messagingAfter.unavailableRecipientCount -
        messagingBefore.unavailableRecipientCount;

      if (
        managerAfter.activeSessionCount !== 1 ||
        managerAfter.managedSessionCount !== 0 ||
        primaryAfter.status !== "connected" ||
        primaryAfter.characterId !== primaryBefore.characterId ||
        primaryAfter.serverKey !== primaryBefore.serverKey ||
        !sameUserRuntimeIdentity(userRuntimeBefore, userRuntimeAfter) ||
        requestDelta !== 2 ||
        deliveryDelta !== 2 ||
        unavailableDelta !== 1 ||
        messagingAfter.localOnly !== true ||
        messagingAfter.rawSocketAccess !== false
      ) {
        throw new Slice72Failure(
          "LIVE_TEST_FINAL_STATE_MISMATCH",
          "The bounded local messaging probe did not restore the exact expected session, Script, or messaging state.",
          "final-state",
        );
      }

      steps.push(Object.freeze({
        name: "final-state",
        outcome: "passed",
        message:
          "Only the managed test session and isolated probe runtime were removed; the primary Character and user Script runtime remained unchanged.",
        evidence: Object.freeze({
          primaryCharacterId: primaryAfter.characterId,
          primaryStatus: primaryAfter.status,
          activeSessionCountAfter: managerAfter.activeSessionCount,
          managedSessionCountAfter: managerAfter.managedSessionCount,
          userScriptStatusBefore: userRuntimeBefore.status,
          userScriptStatusAfter: userRuntimeAfter.status,
          userScriptRunIdBefore: userRuntimeBefore.runId,
          userScriptRunIdAfter: userRuntimeAfter.runId,
          userScriptInterrupted: false,
          messagingRequestDelta: requestDelta,
          localDeliveryDelta: deliveryDelta,
          unavailableRecipientDelta: unavailableDelta,
          localOnly: true,
          gameplayMutation: false,
          rawSocketAccess: false,
          serverRoutingUsed: false,
        }),
      }));

      const result: Slice72LiveTestResult = Object.freeze({
        testId,
        slice: "7.2",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primaryBefore.characterId,
        primaryCharacterName: primaryBefore.characterName,
        managedCharacterId: candidate.id,
        managedCharacterName: candidate.name,
        serverKey: primaryBefore.serverKey,
        message:
          "Slice 7.2 passed: send_cm() delivered locally between two active Character sessions, character.on('cm') received the reply, and cleanup left the primary and user Script state untouched.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 7.2 local Character messaging live test passed.", {
        testId,
        primaryCharacterName: primaryBefore.characterName,
        managedCharacterName: candidate.name,
        requestDelta,
        localDeliveryDelta: deliveryDelta,
        unavailableRecipientDelta: unavailableDelta,
        localOnly: true,
        gameplayMutation: false,
        rawSocketAccess: false,
        userScriptInterrupted: false,
      });
      return structuredClone(result);
    } catch (error) {
      try {
        if (probeRuntime) {
          await probeRuntime.stop();
          await probeRuntime.dispose();
          probeRuntime = undefined;
        }
      } catch (cleanupError) {
        this.#logger.warn("Slice 7.2 isolated probe runtime cleanup failed.", {
          testId,
          error: cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        });
      }
      unsubscribe?.();
      unsubscribe = undefined;

      if (managedCharacterId) {
        const manager = this.#sessions.state();
        if (manager.sessions.some((session) =>
          session.role === "managed" &&
          session.characterId === managedCharacterId
        )) {
          try {
            await this.#sessions.stop(managedCharacterId, "slice72_cleanup");
          } catch (cleanupError) {
            this.#logger.warn("Slice 7.2 managed Character cleanup failed.", {
              testId,
              characterId: managedCharacterId,
              error: cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
              gameplayMutation: false,
            });
          }
        }
      }

      const failure = error instanceof Slice72Failure
        ? error
        : new Slice72Failure(
          "LIVE_TEST_SLICE_7_2_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice72LiveTestOutcome = failure.blocked
        ? "blocked"
        : "failed";
      const primary = this.#primary.state();
      const result: Slice72LiveTestResult = Object.freeze({
        testId,
        slice: "7.2",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: primary.characterId,
        primaryCharacterName: primary.characterName,
        managedCharacterId,
        managedCharacterName,
        serverKey: primary.serverKey,
        message: failure.message,
        steps: Object.freeze(steps),
        error: Object.freeze({
          code: failure.code,
          step: failure.step,
          message: failure.message,
        }),
      });
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      this.#logger.warn("Slice 7.2 local Character messaging live test did not pass.", {
        testId,
        outcome,
        errorCode: failure.code,
        step: failure.step,
        message: failure.message,
      });
      return structuredClone(result);
    }
  }
}

class Slice72Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(
    code: string,
    message: string,
    step: string,
    blocked = false,
  ) {
    super(message);
    this.name = "Slice72Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function probeSource(managedName: string, token: string): string {
  return [
    `const slice72Token = ${JSON.stringify(token)};`,
    `const slice72Managed = ${JSON.stringify(managedName)};`,
    "character.on('cm', (data) => {",
    "  if (data?.name === slice72Managed && data?.message?.kind === 'slice72-reply' && data?.message?.token === slice72Token) {",
    "    console.info('slice72-cm-received:' + slice72Token);",
    "  }",
    "});",
    "(async () => {",
    "  const result = await send_cm([slice72Managed, '__slice72_missing__'], {kind:'slice72-probe', token:slice72Token});",
    "  if (!result || result.receivers.length !== 1 || result.receivers[0] !== slice72Managed) throw new Error('send_cm receivers mismatch');",
    "  if (result.locals.length !== 1 || result.locals[0] !== slice72Managed) throw new Error('send_cm locals mismatch');",
    "  console.info('slice72-send-result:' + slice72Token);",
    "})()",
  ].join("\n");
}

function isMessageKind(
  message: unknown,
  kind: string,
  token: string,
): boolean {
  return Boolean(
    message &&
    typeof message === "object" &&
    (message as Record<string, unknown>).kind === kind &&
    (message as Record<string, unknown>).token === token
  );
}

function logExists(
  logger: Logger,
  component: string,
  message: string,
): boolean {
  return logger.records().some((record) =>
    record.component === component && record.message === message
  );
}

function sameUserRuntimeIdentity(
  before: ScriptRuntimeState,
  after: ScriptRuntimeState,
): boolean {
  return before.status === after.status &&
    before.scriptName === after.scriptName &&
    before.runId === after.runId &&
    before.loadedAt === after.loadedAt &&
    before.startedAt === after.startedAt &&
    before.pausedAt === after.pausedAt &&
    before.stoppedAt === after.stoppedAt &&
    before.crashedAt === after.crashedAt;
}

async function waitFor(
  check: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}

function asManagerError(error: unknown): Readonly<{
  code: string;
  message: string;
}> {
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
