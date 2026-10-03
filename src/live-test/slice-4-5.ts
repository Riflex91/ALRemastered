import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterConnectionState, AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandVisibleEntity } from "../character/world-state.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";
import type { SimpleFarmerTemplateService } from "../script/simple-farmer.ts";

export type Slice45LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice45LiveTestStep {
  readonly name: string;
  readonly outcome: "passed" | "blocked" | "failed";
  readonly message: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface Slice45LiveTestResult {
  readonly testId: string;
  readonly slice: "4.5";
  readonly outcome: Slice45LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly targetId?: string;
  readonly targetType?: string;
  readonly attackCount?: number;
  readonly lootCount?: number;
  readonly errorCode?: string;
  readonly message: string;
  readonly steps: readonly Slice45LiveTestStep[];
}

export interface Slice45LiveTestState {
  readonly status: "idle" | "running" | Slice45LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice45LiveTestResult;
}

export interface Slice45LiveTestServiceOptions {
  readonly logger: Logger;
  readonly runtime: Pick<ScriptRuntimeService, "state">;
  readonly farmer: Pick<SimpleFarmerTemplateService, "start" | "stop" | "state">;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly gameData: () => AdventureLandGameData | undefined;
  readonly now?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

interface SafeMonsterCandidate {
  readonly entity: AdventureLandVisibleEntity;
  readonly hp: number;
  readonly attack: number;
  readonly distance: number;
}

const MAX_TEST_MS = 12_000;
const PREFLIGHT_TARGET_WAIT_MS = 5_000;
const PREFLIGHT_TARGET_POLL_MS = 125;
const MAX_ATTACKS = 6;

export class Slice45LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: Pick<ScriptRuntimeService, "state">;
  readonly #farmer: Pick<SimpleFarmerTemplateService, "start" | "stop" | "state">;
  readonly #character: Pick<AdventureLandCharacterService, "state">;
  readonly #gameData: () => AdventureLandGameData | undefined;
  readonly #now: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice45LiveTestResult>;
  #state: Slice45LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 4.5 one-click live test is ready.",
  });

  constructor(options: Slice45LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#farmer = options.farmer;
    this.#character = options.character;
    this.#gameData = options.gameData;
    this.#now = options.now ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#idFactory = options.idFactory ?? (() => `live45-${randomUUID()}`);
  }

  state(): Slice45LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice45LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice45LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#now().toISOString();
    const steps: Slice45LiveTestStep[] = [];
    let target: SafeMonsterCandidate | undefined;
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 4.5 one-click live test is running.",
    });
    this.#logger.info("Slice 4.5 one-click live test started.", {
      testId,
      bounded: true,
      automation: "simple-farmer",
      navigation: false,
      maxAttacks: MAX_ATTACKS,
      intentionalRespawn: false,
    });

    try {
      if (this.#runtime.state().status === "running") {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A script is already running. The Slice 4.5 live test did not interrupt it.",
          true,
          "preflight",
        );
      }

      const data = this.#gameData();
      let preflight = this.#character.state();
      this.#requireReady(preflight, data);
      target = this.#selectSafeInRangeMonster(preflight, data!);
      let waitedMs = 0;
      if (!target) {
        const waited = await this.#waitForTarget(data!);
        target = waited?.target;
        preflight = waited?.state ?? preflight;
        waitedMs = waited?.waitedMs ?? PREFLIGHT_TARGET_WAIT_MS;
      }
      if (!target) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_NO_SAFE_FARM_TARGET",
          "No bounded low-risk, untargeted monster appeared inside attack range during the 5-second preflight window.",
          true,
          "preflight",
          { waitedMs, visibleMonsters: preflight.entities?.filter((entry) => entry.kind === "monster").length ?? 0 },
        );
      }

      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message: "A connected healthy character and low-risk visible in-range monster are available.",
        evidence: Object.freeze({
          targetId: target.entity.id,
          targetType: target.entity.type,
          targetHp: target.hp,
          targetAttack: target.attack,
          targetDistance: roundOne(target.distance),
          waitedMs,
        }),
      }));

      const logStartId = this.#logger.records().at(-1)?.id ?? 0;
      const config = Object.freeze({
        monster: target.entity.type,
        hpThresholdPercent: 1,
        mpThresholdPercent: 1,
        loot: true,
        respawn: false,
      });
      const farmerState = await this.#farmer.start(config);
      if (farmerState.status !== "running") {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARMER_START_FAILED",
          farmerState.message,
          false,
          "template-start",
        );
      }
      steps.push(Object.freeze({
        name: "no-code-template-config",
        outcome: "passed",
        message: "The Simple Farmer Template started from bounded configuration without custom code.",
        evidence: Object.freeze({
          monster: config.monster,
          hpThresholdPercent: config.hpThresholdPercent,
          mpThresholdPercent: config.mpThresholdPercent,
          loot: config.loot,
          respawn: config.respawn,
          navigation: false,
        }),
      }));

      const observed = await this.#waitForAttack(logStartId);
      const runtimeBeforeStop = this.#runtime.state();
      await this.#farmer.stop();

      if (runtimeBeforeStop.status === "crashed") {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARMER_CRASHED",
          runtimeBeforeStop.error?.message ?? "The Simple Farmer worker crashed.",
          false,
          "automated-farm",
        );
      }
      if (!observed) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARM_ATTACK_TIMEOUT",
          "The Simple Farmer did not complete a confirmed script-origin attack within the bounded test window.",
          false,
          "automated-farm",
        );
      }

      const actions = this.#successfulActionsAfter(logStartId);
      const attacks = actions.filter((record) => contextString(record, "action") === "character.attack");
      const loots = actions.filter((record) => contextString(record, "action") === "character.loot");
      const movement = actions.filter((record) => {
        const action = contextString(record, "action");
        return action === "character.move" || action === "character.xmove";
      });
      if (attacks.length < 1 || attacks.length > MAX_ATTACKS || movement.length > 0) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARM_ACTION_EVIDENCE_INVALID",
          "The bounded farmer action evidence did not match the Slice 4.5 safety contract.",
          false,
          "evidence",
          { attackCount: attacks.length, movementCount: movement.length },
        );
      }
      steps.push(Object.freeze({
        name: "automated-farm-action",
        outcome: "passed",
        message: "The template completed a real server-confirmed script-origin attack through the central Action Gateway.",
        evidence: Object.freeze({
          attackCount: attacks.length,
          lootCount: loots.length,
          requestIds: Object.freeze(attacks.map((record) => record.requestId).filter(Boolean)),
          navigationActions: 0,
        }),
      }));

      const finalRuntime = this.#runtime.state();
      if (
        finalRuntime.status !== "stopped" ||
        finalRuntime.activeTimers !== 0 ||
        finalRuntime.activeEventListeners !== 0
      ) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARMER_CLEANUP_FAILED",
          "The Simple Farmer did not stop with all worker timers/listeners released.",
          false,
          "cleanup",
        );
      }
      this.#assertHpSafety(this.#character.state(), false);
      steps.push(Object.freeze({
        name: "bounded-stop-cleanup",
        outcome: "passed",
        message: "The automated farmer stopped after its bounded action and released worker resources.",
        evidence: Object.freeze({
          status: finalRuntime.status,
          activeTimers: finalRuntime.activeTimers,
          activeEventListeners: finalRuntime.activeEventListeners,
        }),
      }));

      const finalState = this.#character.state();
      const result: Slice45LiveTestResult = Object.freeze({
        testId,
        slice: "4.5",
        outcome: "passed",
        startedAt,
        completedAt: this.#now().toISOString(),
        characterId: finalState.characterId,
        characterName: finalState.characterName,
        serverKey: finalState.serverKey,
        targetId: target.entity.id,
        targetType: target.entity.type,
        attackCount: attacks.length,
        lootCount: loots.length,
        message:
          "Slice 4.5 passed: the no-code Simple Farmer Template selected a configured monster type and completed a bounded real script-origin farm attack without navigation.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 4.5 one-click live test passed.", {
        testId,
        targetId: result.targetId,
        targetType: result.targetType,
        attackCount: result.attackCount,
        lootCount: result.lootCount,
        navigationActions: 0,
      });
      return result;
    } catch (error) {
      await this.#farmer.stop().catch(() => undefined);
      const failure = normalizeFailure(error);
      const finalState = this.#character.state();
      steps.push(Object.freeze({
        name: failure.step ?? "live-test",
        outcome: failure.blocked ? "blocked" : "failed",
        message: failure.message,
        evidence: failure.evidence,
      }));
      const outcome: Slice45LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const result: Slice45LiveTestResult = Object.freeze({
        testId,
        slice: "4.5",
        outcome,
        startedAt,
        completedAt: this.#now().toISOString(),
        characterId: finalState.characterId,
        characterName: finalState.characterName,
        serverKey: finalState.serverKey,
        targetId: target?.entity.id,
        targetType: target?.entity.type,
        errorCode: failure.code,
        message: failure.message,
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: outcome, message: result.message, lastResult: result });
      if (failure.blocked) {
        this.#logger.warn("Slice 4.5 one-click live test blocked.", {
          testId,
          errorCode: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 4.5 one-click live test failed.", failure, {
          testId,
          errorCode: failure.code,
          step: failure.step,
        });
      }
      return result;
    }
  }

  #requireReady(
    state: AdventureLandCharacterConnectionState,
    data: AdventureLandGameData | undefined,
  ): void {
    if (state.status !== "connected" || !state.character) {
      throw new Slice45LiveTestFailure(
        "LIVE_TEST_CHARACTER_NOT_CONNECTED",
        "The one-click farm test requires a connected headless character.",
        true,
        "preflight",
      );
    }
    if (state.character.dead) {
      throw new Slice45LiveTestFailure(
        "LIVE_TEST_CHARACTER_DEAD",
        "The connected character is dead; the bounded farm test did not start.",
        true,
        "preflight",
      );
    }
    if (!data) {
      throw new Slice45LiveTestFailure(
        "LIVE_TEST_GAME_DATA_UNAVAILABLE",
        "Current Adventure Land game data is not loaded.",
        true,
        "preflight",
      );
    }
    this.#assertHpSafety(state, true);
  }

  #assertHpSafety(state: AdventureLandCharacterConnectionState, blocked: boolean): void {
    const hp = state.character?.hp;
    const maxHp = state.character?.maxHp;
    if (hp !== undefined && maxHp !== undefined && maxHp > 0 && hp / maxHp < 0.65) {
      throw new Slice45LiveTestFailure(
        "LIVE_TEST_HP_SAFETY_STOP",
        "Character HP is below the bounded Simple Farmer safety threshold.",
        blocked,
        "safety",
        { hp, maxHp },
      );
    }
  }

  async #waitForTarget(data: AdventureLandGameData): Promise<{
    readonly target: SafeMonsterCandidate;
    readonly state: AdventureLandCharacterConnectionState;
    readonly waitedMs: number;
  } | undefined> {
    const attempts = Math.ceil(PREFLIGHT_TARGET_WAIT_MS / PREFLIGHT_TARGET_POLL_MS);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await this.#delay(PREFLIGHT_TARGET_POLL_MS);
      const state = this.#character.state();
      this.#requireReady(state, data);
      const target = this.#selectSafeInRangeMonster(state, data);
      if (target) return Object.freeze({ target, state, waitedMs: attempt * PREFLIGHT_TARGET_POLL_MS });
    }
    return undefined;
  }

  #selectSafeInRangeMonster(
    state: AdventureLandCharacterConnectionState,
    data: AdventureLandGameData,
  ): SafeMonsterCandidate | undefined {
    const character = state.character;
    if (
      !character ||
      character.x === undefined ||
      character.y === undefined ||
      character.maxHp === undefined ||
      character.maxHp <= 0 ||
      character.range === undefined ||
      character.range <= 0
    ) return undefined;

    return (state.entities ?? [])
      .flatMap((entity) => {
        if (
          entity.kind !== "monster" ||
          entity.target ||
          entity.hp === 0 ||
          entity.type.startsWith("target") ||
          /dummy|target/i.test(entity.name) ||
          entity.x === undefined ||
          entity.y === undefined
        ) return [];
        const raw = data.monsters[entity.type];
        if (!isRecord(raw)) return [];
        if (
          raw.stationary === true ||
          raw.cooperative === true ||
          raw.peaceful === true ||
          raw.immune === true ||
          raw.boss === true
        ) return [];
        const hp = finiteNumber(entity.hp) ?? finiteNumber(entity.maxHp) ?? finiteNumber(raw.hp);
        const attack = Math.max(0, finiteNumber(raw.attack) ?? 0);
        const xp = Math.max(0, finiteNumber(raw.xp) ?? 0);
        const gold = Math.max(0, finiteNumber(raw.gold) ?? 0);
        if (hp === undefined || hp <= 0 || (xp <= 0 && gold <= 0)) return [];
        if (
          hp > Math.max(1_500, character.maxHp! * 0.75) ||
          attack > Math.max(120, character.maxHp! * 0.05)
        ) return [];
        const distance = Math.hypot(entity.x - character.x!, entity.y - character.y!);
        if (distance > character.range!) return [];
        return [{ entity, hp, attack, distance }];
      })
      .sort((left, right) =>
        left.hp - right.hp ||
        left.attack - right.attack ||
        left.distance - right.distance ||
        left.entity.id.localeCompare(right.entity.id)
      )[0];
  }

  async #waitForAttack(logStartId: number): Promise<boolean> {
    const deadline = Date.now() + MAX_TEST_MS;
    while (Date.now() <= deadline) {
      if (this.#runtime.state().status === "crashed") return false;
      if (this.#successfulActionsAfter(logStartId).some((record) =>
        contextString(record, "action") === "character.attack"
      )) return true;
      await this.#delay(50);
    }
    return false;
  }

  #successfulActionsAfter(logStartId: number): LogRecord[] {
    return this.#logger.records().filter((record) =>
      record.id > logStartId &&
      record.message === "Action gateway request completed." &&
      isRecord(record.context) &&
      record.context.origin === "script" &&
      record.context.outcome === "success"
    );
  }
}

class Slice45LiveTestFailure extends Error {
  readonly code: string;
  readonly blocked: boolean;
  readonly step?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    blocked = false,
    step?: string,
    evidence?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "Slice45LiveTestFailure";
    this.code = code;
    this.blocked = blocked;
    this.step = step;
    this.evidence = evidence;
  }
}

function normalizeFailure(error: unknown): Slice45LiveTestFailure {
  if (error instanceof Slice45LiveTestFailure) return error;
  return new Slice45LiveTestFailure(
    "LIVE_TEST_UNEXPECTED_ERROR",
    error instanceof Error ? error.message : String(error),
  );
}

function contextString(record: LogRecord, key: string): string | undefined {
  if (!isRecord(record.context)) return undefined;
  const value = record.context[key];
  return typeof value === "string" ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
