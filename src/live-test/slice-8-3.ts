import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type {
  TemplateConfigurationService,
  TemplateConfigurationState,
} from "../dashboard/template-config.ts";
import type { Logger } from "../logging/logger.ts";
import type { ScriptRuntimeService, ScriptRuntimeState } from "../script/runtime.ts";

export type Slice83LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice83LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice83LiveTestResult {
  readonly testId: string;
  readonly slice: "8.3";
  readonly outcome: Slice83LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly primaryCharacterId?: string;
  readonly primaryCharacterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice83LiveTestStep[];
  readonly error?: Readonly<{ readonly code: string; readonly step: string; readonly message: string }>;
}

export interface Slice83LiveTestState {
  readonly status: "idle" | "running" | Slice83LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice83LiveTestResult;
}

export interface Slice83LiveTestServiceOptions {
  readonly logger: Logger;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly config: Pick<
    TemplateConfigurationService,
    "state" | "save" | "snapshotDraft" | "restoreDraft"
  >;
  readonly userRuntime: Pick<ScriptRuntimeService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice83LiveTestService {
  readonly #logger: Logger;
  readonly #character: Slice83LiveTestServiceOptions["character"];
  readonly #config: Slice83LiveTestServiceOptions["config"];
  readonly #userRuntime: Slice83LiveTestServiceOptions["userRuntime"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice83LiveTestResult>;
  #state: Slice83LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 8.3 Template Configuration test is ready.",
  });

  constructor(options: Slice83LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#character = options.character;
    this.#config = options.config;
    this.#userRuntime = options.userRuntime;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live83-${randomUUID()}`);
  }

  state(): Slice83LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice83LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice83LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice83LiveTestStep[] = [];
    const characterBefore = this.#character.state();
    const runtimeBefore = this.#userRuntime.state();
    const draftBefore = this.#config.snapshotDraft();

    this.#state = Object.freeze({
      status: "running",
      message: "Slice 8.3 is verifying schema-driven template settings without starting gameplay automation.",
    });

    try {
      if (
        characterBefore.status !== "connected" ||
        !characterBefore.characterId ||
        !characterBefore.characterName ||
        !characterBefore.serverKey
      ) {
        throw failure(
          "LIVE_TEST_PRIMARY_NOT_CONNECTED",
          "Connect one primary Character before running Slice 8.3 so visible monster options are available.",
          "preflight",
          true,
        );
      }

      const before = this.#config.state();
      const template = requireTemplate(before);
      const fieldKeys = template.fields.map((field) => field.key);
      if (
        before.normalSettingsRequireCodeChanges !== false ||
        before.gameplayMutation !== false ||
        before.rawSocketAccess !== false ||
        fieldKeys.join("|") !== "monster|hpThresholdPercent|mpThresholdPercent|loot|respawn" ||
        template.status !== "ready"
      ) {
        throw failure(
          "LIVE_TEST_TEMPLATE_SCHEMA_MISMATCH",
          "Template Configuration did not expose the expected no-code Simple Farmer settings.",
          "schema",
        );
      }
      if (template.fields.some((field) => String(field.key).toLowerCase().includes("source"))) {
        throw failure(
          "LIVE_TEST_CODE_FIELD_EXPOSED",
          "Normal Template Configuration unexpectedly exposed a code/source setting.",
          "schema",
        );
      }
      steps.push(step(
        "schema",
        "Template Configuration exposed five normal Simple Farmer settings and no JavaScript source field.",
        {
          templateId: template.id,
          fieldKeys,
          normalSettingsRequireCodeChanges: before.normalSettingsRequireCodeChanges,
          gameplayMutation: before.gameplayMutation,
          rawSocketAccess: before.rawSocketAccess,
        },
      ));

      const monster = String(template.values.monster);
      const hp = Number(template.values.hpThresholdPercent);
      const mp = Number(template.values.mpThresholdPercent);
      const loot = Boolean(template.values.loot);
      const respawn = Boolean(template.values.respawn);
      const changedHp = hp === 49 ? 50 : 49;
      const changedMp = mp === 29 ? 30 : 29;

      const saved = this.#config.save("simple-farmer", {
        monster,
        hpThresholdPercent: changedHp,
        mpThresholdPercent: changedMp,
        loot: !loot,
        respawn,
      });
      const savedTemplate = requireTemplate(saved);
      if (
        savedTemplate.configured !== true ||
        savedTemplate.values.hpThresholdPercent !== changedHp ||
        savedTemplate.values.mpThresholdPercent !== changedMp ||
        savedTemplate.values.loot !== !loot
      ) {
        throw failure(
          "LIVE_TEST_CONFIG_SAVE_MISMATCH",
          "Saved normal settings did not round-trip through the schema-driven Template Configuration service.",
          "save",
        );
      }
      if (!sameRuntime(runtimeBefore, this.#userRuntime.state())) {
        throw failure(
          "LIVE_TEST_RUNTIME_CHANGED_ON_SAVE",
          "Saving normal Template Configuration settings changed the user Script runtime.",
          "save",
        );
      }
      steps.push(step(
        "save",
        "Normal settings were changed and saved without editing or starting Script code.",
        {
          monster,
          hpThresholdPercentBefore: hp,
          hpThresholdPercentSaved: changedHp,
          mpThresholdPercentBefore: mp,
          mpThresholdPercentSaved: changedMp,
          lootBefore: loot,
          lootSaved: !loot,
          respawn,
          userScriptInterrupted: false,
          gameplayMutation: false,
          rawSocketAccess: false,
        },
      ));

      const restored = this.#config.restoreDraft(draftBefore);
      if (!sameRuntime(runtimeBefore, this.#userRuntime.state())) {
        throw failure(
          "LIVE_TEST_RUNTIME_CHANGED_ON_RESTORE",
          "Restoring Template Configuration changed the user Script runtime.",
          "restore",
        );
      }
      const finalCharacter = this.#character.state();
      if (
        finalCharacter.status !== "connected" ||
        finalCharacter.characterId !== characterBefore.characterId ||
        finalCharacter.serverKey !== characterBefore.serverKey
      ) {
        throw failure(
          "LIVE_TEST_CHARACTER_STATE_CHANGED",
          "Template Configuration validation changed the primary Character session.",
          "final-state",
        );
      }
      steps.push(step(
        "restore",
        "The pre-test Template Configuration draft was restored exactly after validation.",
        {
          hadSavedDraftBefore: Boolean(draftBefore),
          configuredAfterRestore: requireTemplate(restored).configured,
        },
      ));
      steps.push(step(
        "final-state",
        "Primary Character and user Script runtime were preserved and no gameplay action was started.",
        {
          primaryCharacterId: finalCharacter.characterId,
          primaryStatus: finalCharacter.status,
          userScriptStatusAfter: this.#userRuntime.state().status,
          userScriptInterrupted: false,
          gameplayMutation: false,
          rawSocketAccess: false,
        },
      ));

      const result: Slice83LiveTestResult = Object.freeze({
        testId,
        slice: "8.3",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: characterBefore.characterId,
        primaryCharacterName: characterBefore.characterName,
        serverKey: characterBefore.serverKey,
        message:
          "Slice 8.3 passed: normal Simple Farmer settings were exposed, changed, saved, and restored through schema-driven UI state without code changes, user-script interruption, gameplay mutation, or raw sockets.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 8.3 Template Configuration live test passed.", {
        testId,
        userScriptInterrupted: false,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
      return structuredClone(result);
    } catch (error) {
      this.#config.restoreDraft(draftBefore);
      const problem = error instanceof Slice83Failure
        ? error
        : failure(
          "LIVE_TEST_SLICE_8_3_FAILED",
          error instanceof Error ? error.message : String(error),
          "unknown",
        );
      const outcome: Slice83LiveTestOutcome = problem.blocked ? "blocked" : "failed";
      const result: Slice83LiveTestResult = Object.freeze({
        testId,
        slice: "8.3",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        primaryCharacterId: this.#character.state().characterId,
        primaryCharacterName: this.#character.state().characterName,
        serverKey: this.#character.state().serverKey,
        message: problem.message,
        steps: Object.freeze(steps),
        error: Object.freeze({ code: problem.code, step: problem.step, message: problem.message }),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      this.#logger.warn("Slice 8.3 Template Configuration live test did not pass.", {
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

class Slice83Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, stepName: string, blocked = false) {
    super(message);
    this.name = "Slice83Failure";
    this.code = code;
    this.step = stepName;
    this.blocked = blocked;
  }
}

function failure(code: string, message: string, stepName: string, blocked = false): Slice83Failure {
  return new Slice83Failure(code, message, stepName, blocked);
}

function step(
  name: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): Slice83LiveTestStep {
  return Object.freeze({ name, outcome: "passed" as const, message, evidence: Object.freeze(evidence) });
}

function requireTemplate(state: TemplateConfigurationState) {
  const template = state.templates.find((item) => item.id === "simple-farmer");
  if (!template) throw new Error("Simple Farmer Template Configuration is unavailable.");
  return template;
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
