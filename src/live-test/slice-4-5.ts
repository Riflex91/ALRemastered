import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterConnectionState, AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandVisibleEntity } from "../character/world-state.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";
import type { AdventureLandMovementService } from "../action/movement.ts";
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
  readonly movement: Pick<AdventureLandMovementService, "runScript">;
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

const MAX_TEST_MS = 25_000;
const PREFLIGHT_TARGET_WAIT_MS = 12_000;
const PREFLIGHT_TARGET_POLL_MS = 200;
const APPROACH_SETTLE_MS = 250;
const MAX_APPROACH_MOVES = 4;
const MAX_ATTACKS = 12;

export class Slice45LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: Pick<ScriptRuntimeService, "state">;
  readonly #farmer: Pick<SimpleFarmerTemplateService, "start" | "stop" | "state">;
  readonly #character: Pick<AdventureLandCharacterService, "state">;
  readonly #movement: Pick<AdventureLandMovementService, "runScript">;
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
    this.#movement = options.movement;
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
      navigation: "bounded-direct-preflight",
      maxApproachMoves: MAX_APPROACH_MOVES,
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
      const acquired = await this.#acquireSafeTarget(data!);
      target = acquired?.target;
      const preflight = acquired?.state ?? this.#character.state();
      if (!target || !acquired) {
        const safeVisible = this.#safeVisibleCandidates(preflight, data!);
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_NO_REACHABLE_SAFE_FARM_TARGET",
          "The one-click test could not find and directly approach a bounded low-risk, untargeted visible monster within the preflight budget.",
          true,
          "preflight",
          {
            waitedMs: PREFLIGHT_TARGET_WAIT_MS,
            visibleMonsters: preflight.entities?.filter((entry) => entry.kind === "monster").length ?? 0,
            safeVisibleMonsters: safeVisible.length,
            maxApproachMoves: MAX_APPROACH_MOVES,
          },
        );
      }

      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message: "The test selected a low-risk visible monster and automatically reached attack range when necessary.",
        evidence: Object.freeze({
          targetId: target.entity.id,
          targetType: target.entity.type,
          targetHp: target.hp,
          targetAttack: target.attack,
          targetDistance: roundOne(target.distance),
          waitedMs: acquired.waitedMs,
          approachMoveCount: acquired.movementRequestIds.length,
          approachRequestIds: Object.freeze(acquired.movementRequestIds),
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
          farmerNavigation: false,
          preflightNavigation: "bounded-direct",
        }),
      }));

      const observed = await this.#waitForFarmCycle(logStartId);
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
      if (!observed.attack) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARM_ATTACK_TIMEOUT",
          "The Simple Farmer did not complete a confirmed script-origin attack within the bounded test window.",
          false,
          "automated-farm",
        );
      }
      if (!observed.loot) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARM_LOOT_TIMEOUT",
          "The Simple Farmer attacked successfully but did not collect a script-origin loot chest within the bounded test window.",
          true,
          "automated-loot",
          { attackCount: observed.attackCount },
        );
      }

      const actions = this.#successfulActionsAfter(logStartId);
      const attacks = actions.filter((record) => contextString(record, "action") === "character.attack");
      const loots = actions.filter((record) => contextString(record, "action") === "character.loot");
      const movement = actions.filter((record) => {
        const action = contextString(record, "action");
        return action === "character.move" || action === "character.xmove";
      });
      if (
        attacks.length < 1 ||
        attacks.length > MAX_ATTACKS ||
        loots.length < 1 ||
        movement.length > 0
      ) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARM_ACTION_EVIDENCE_INVALID",
          "The bounded farmer action evidence did not match the Slice 4.5 safety contract.",
          false,
          "evidence",
          { attackCount: attacks.length, lootCount: loots.length, movementCount: movement.length },
        );
      }
      steps.push(Object.freeze({
        name: "automated-farm-action",
        outcome: "passed",
        message: "The template completed real server-confirmed script-origin attacks through the central Action Gateway.",
        evidence: Object.freeze({
          attackCount: attacks.length,
          requestIds: Object.freeze(attacks.map((record) => record.requestId).filter(Boolean)),
          farmerNavigationActions: 0,
        }),
      }));
      steps.push(Object.freeze({
        name: "automated-loot",
        outcome: "passed",
        message: "With Loot enabled, the template collected the resulting chest through the central Action Gateway.",
        evidence: Object.freeze({
          lootCount: loots.length,
          requestIds: Object.freeze(loots.map((record) => record.requestId).filter(Boolean)),
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
          "Slice 4.5 passed: the test selected and approached a safe visible monster automatically, then the no-code Simple Farmer completed a bounded real attack-and-loot cycle.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({ status: "passed", message: result.message, lastResult: result });
      this.#logger.info("Slice 4.5 one-click live test passed.", {
        testId,
        targetId: result.targetId,
        targetType: result.targetType,
        attackCount: result.attackCount,
        lootCount: result.lootCount,
        farmerNavigationActions: 0,
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

  async #acquireSafeTarget(data: AdventureLandGameData): Promise<{
    readonly target: SafeMonsterCandidate;
    readonly state: AdventureLandCharacterConnectionState;
    readonly waitedMs: number;
    readonly movementRequestIds: readonly string[];
  } | undefined> {
    const attempts = Math.ceil(PREFLIGHT_TARGET_WAIT_MS / PREFLIGHT_TARGET_POLL_MS);
    const movementRequestIds: string[] = [];

    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      const state = this.#character.state();
      this.#requireReady(state, data);
      const inRange = this.#selectSafeInRangeMonster(state, data);
      if (inRange) {
        return Object.freeze({
          target: inRange,
          state,
          waitedMs: attempt * PREFLIGHT_TARGET_POLL_MS,
          movementRequestIds: Object.freeze([...movementRequestIds]),
        });
      }

      if (movementRequestIds.length < MAX_APPROACH_MOVES) {
        const candidates = this.#safeVisibleCandidates(state, data);
        for (const candidate of candidates) {
          const moved = await this.#approachCandidate(candidate, state);
          if (!moved) continue;
          movementRequestIds.push(moved);
          await this.#delay(APPROACH_SETTLE_MS);
          const refreshed = this.#character.state();
          this.#requireReady(refreshed, data);
          const reached = this.#selectSafeInRangeMonster(refreshed, data);
          if (reached) {
            return Object.freeze({
              target: reached,
              state: refreshed,
              waitedMs: attempt * PREFLIGHT_TARGET_POLL_MS,
              movementRequestIds: Object.freeze([...movementRequestIds]),
            });
          }
          break;
        }
      }

      if (attempt < attempts) await this.#delay(PREFLIGHT_TARGET_POLL_MS);
    }
    return undefined;
  }

  async #approachCandidate(
    candidate: SafeMonsterCandidate,
    state: AdventureLandCharacterConnectionState,
  ): Promise<string | undefined> {
    const character = state.character;
    const entity = candidate.entity;
    if (
      !character ||
      character.x === undefined ||
      character.y === undefined ||
      character.range === undefined ||
      character.range <= 0 ||
      entity.x === undefined ||
      entity.y === undefined
    ) return undefined;

    if (candidate.distance <= character.range) return undefined;
    const desiredDistance = Math.max(8, Math.min(character.range * 0.65, character.range - 8));
    const dx = entity.x - character.x;
    const dy = entity.y - character.y;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance <= desiredDistance) return undefined;
    const travel = distance - desiredDistance;
    const x = character.x + dx / distance * travel;
    const y = character.y + dy / distance * travel;

    const result = await this.#movement.runScript({ mode: "move", x, y });
    if (result.outcome === "success") return result.requestId;
    if (result.outcome === "rate_limited") {
      await this.#delay(Math.max(25, result.retryAfterMs ?? PREFLIGHT_TARGET_POLL_MS));
      return undefined;
    }
    if (
      result.error?.code === "MOVE_BLOCKED" ||
      result.error?.code === "MOVE_TARGET_INVALID"
    ) return undefined;

    throw new Slice45LiveTestFailure(
      "LIVE_TEST_APPROACH_FAILED",
      result.error?.message ?? "Automatic preflight movement failed.",
      true,
      "preflight",
      {
        targetId: candidate.entity.id,
        targetType: candidate.entity.type,
        movementCode: result.error?.code,
        movementOutcome: result.outcome,
      },
    );
  }

  #selectSafeInRangeMonster(
    state: AdventureLandCharacterConnectionState,
    data: AdventureLandGameData,
  ): SafeMonsterCandidate | undefined {
    const range = state.character?.range;
    if (typeof range !== "number" || !Number.isFinite(range) || range <= 0) return undefined;
    return this.#safeVisibleCandidates(state, data)
      .filter((candidate) => candidate.distance <= range)[0];
  }

  #safeVisibleCandidates(
    state: AdventureLandCharacterConnectionState,
    data: AdventureLandGameData,
  ): SafeMonsterCandidate[] {
    const character = state.character;
    if (
      !character ||
      character.x === undefined ||
      character.y === undefined ||
      character.maxHp === undefined ||
      character.maxHp <= 0
    ) return [];

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
          hp > Math.max(1_500, character.maxHp * 0.75) ||
          attack > Math.max(120, character.maxHp * 0.05)
        ) return [];
        const distance = Math.hypot(entity.x - character.x, entity.y - character.y);
        return [{ entity, hp, attack, distance }];
      })
      .sort((left, right) =>
        left.hp - right.hp ||
        left.attack - right.attack ||
        left.distance - right.distance ||
        left.entity.id.localeCompare(right.entity.id)
      );
  }

  async #waitForFarmCycle(logStartId: number): Promise<{
    readonly attack: boolean;
    readonly loot: boolean;
    readonly attackCount: number;
  }> {
    const deadline = Date.now() + MAX_TEST_MS;
    let attackCount = 0;
    while (Date.now() <= deadline) {
      if (this.#runtime.state().status === "crashed") {
        return { attack: false, loot: false, attackCount };
      }
      this.#assertHpSafety(this.#character.state(), true);
      const actions = this.#successfulActionsAfter(logStartId);
      attackCount = actions.filter((record) =>
        contextString(record, "action") === "character.attack"
      ).length;
      const loot = actions.some((record) =>
        contextString(record, "action") === "character.loot"
      );
      if (attackCount > MAX_ATTACKS) {
        throw new Slice45LiveTestFailure(
          "LIVE_TEST_FARM_ATTACK_BUDGET_EXCEEDED",
          "The Simple Farmer exceeded the bounded successful attack budget.",
          false,
          "automated-farm",
          { attackCount },
        );
      }
      if (attackCount >= 1 && loot) {
        return { attack: true, loot: true, attackCount };
      }
      await this.#delay(50);
    }
    return { attack: attackCount >= 1, loot: false, attackCount };
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
