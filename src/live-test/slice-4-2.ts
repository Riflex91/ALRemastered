import { randomUUID } from "node:crypto";
import {
  canMoveDirect,
  movementGeometry,
} from "../action/movement.ts";
import type {
  AdventureLandCharacterConnectionState,
  AdventureLandCharacterService,
} from "../character/service.ts";
import type { AdventureLandVisibleEntity } from "../character/world-state.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";

export type Slice42LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice42LiveTestStep {
  readonly name: string;
  readonly outcome: "passed" | "blocked" | "failed";
  readonly message: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface Slice42LiveTestResult {
  readonly testId: string;
  readonly slice: "4.2";
  readonly outcome: Slice42LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly targetId?: string;
  readonly targetType?: string;
  readonly errorCode?: string;
  readonly message: string;
  readonly steps: readonly Slice42LiveTestStep[];
}

export interface Slice42LiveTestState {
  readonly status: "idle" | "running" | Slice42LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice42LiveTestResult;
}

export interface Slice42LiveTestServiceOptions {
  readonly logger: Logger;
  readonly runtime: ScriptRuntimeService;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly gameData: () => AdventureLandGameData | undefined;
  readonly now?: () => Date;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly idFactory?: () => string;
}

interface SafeMonsterCandidate {
  readonly entity: AdventureLandVisibleEntity;
  readonly distance: number;
  readonly hp: number;
  readonly attack: number;
}

const SCRIPT_NAME = "slice-4-2-live-farmer";
const MAX_ATTACKS = 12;
const MAX_TEST_MS = 25_000;
const PREFLIGHT_TARGET_WAIT_MS = 5_000;
const PREFLIGHT_TARGET_POLL_MS = 125;

export class Slice42LiveTestService {
  readonly #logger: Logger;
  readonly #runtime: ScriptRuntimeService;
  readonly #character: Pick<AdventureLandCharacterService, "state">;
  readonly #gameData: () => AdventureLandGameData | undefined;
  readonly #now: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #running?: Promise<Slice42LiveTestResult>;
  #state: Slice42LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 4.2 one-click live test is ready.",
  });

  constructor(options: Slice42LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#character = options.character;
    this.#gameData = options.gameData;
    this.#now = options.now ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live42-${randomUUID()}`);
  }

  state(): Slice42LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice42LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice42LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#now().toISOString();
    const steps: Slice42LiveTestStep[] = [];
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 4.2 one-click live test is running.",
    });
    this.#logger.info("Slice 4.2 one-click live test started.", {
      testId,
      bounded: true,
      automation: "one-safe-monster",
      maxAttacks: MAX_ATTACKS,
    });

    let target: SafeMonsterCandidate | undefined;
    try {
      if (this.#runtime.state().status === "running") {
        throw new Slice42LiveTestFailure(
          "LIVE_TEST_SCRIPT_RUNTIME_BUSY",
          "A script is already running. The Slice 4.2 live test did not interrupt it.",
          true,
          "preflight",
        );
      }

      let preflightState = this.#character.state();
      const data = this.#gameData();
      this.#requireReady(preflightState, data);
      target = this.#selectSafeInRangeMonster(preflightState, data!);
      let targetWaitMs = 0;
      if (!target) {
        this.#logger.info("Slice 4.2 preflight is waiting for a safe in-range target.", {
          testId,
          waitMs: PREFLIGHT_TARGET_WAIT_MS,
          pollMs: PREFLIGHT_TARGET_POLL_MS,
        });
        const waited = await this.#waitForSafeInRangeMonster(data!);
        target = waited?.target;
        if (waited) {
          preflightState = waited.state;
          targetWaitMs = waited.waitedMs;
        }
      }
      if (!target) {
        throw new Slice42LiveTestFailure(
          "LIVE_TEST_NO_SAFE_SCRIPT_TARGET",
          "No bounded low-risk, untargeted monster appeared inside attack range during the 5-second preflight window.",
          true,
          "preflight",
          {
            waitMs: PREFLIGHT_TARGET_WAIT_MS,
            visibleMonsters: preflightState.entities?.filter((entity) => entity.kind === "monster").length ?? 0,
          },
        );
      }
      const movement = this.#safeRoundTrip(preflightState, data!);
      if (!movement) {
        throw new Slice42LiveTestFailure(
          "LIVE_TEST_NO_SAFE_SCRIPT_MOVE",
          "No short direct movement round-trip is available from the current position.",
          true,
          "preflight",
        );
      }

      steps.push(Object.freeze({
        name: "preflight",
        outcome: "passed",
        message: "Connected state, current game data, a low-risk target, and a safe direct round-trip are available.",
        evidence: Object.freeze({
          targetId: target.entity.id,
          targetType: target.entity.type,
          targetHp: target.hp,
          targetAttack: target.attack,
          targetDistance: roundOne(target.distance),
          targetWaitMs,
          moveX: movement.x,
          moveY: movement.y,
          returnX: movement.returnX,
          returnY: movement.returnY,
        }),
      }));

      const logStartId = this.#logger.records().at(-1)?.id ?? 0;
      await this.#runtime.load({
        name: SCRIPT_NAME,
        source: farmerScript({
          targetId: target.entity.id,
          targetType: target.entity.type,
          moveX: movement.x,
          moveY: movement.y,
          returnX: movement.returnX,
          returnY: movement.returnY,
        }),
      });
      const started = await this.#runtime.start();
      if (started.status !== "running") {
        throw new Slice42LiveTestFailure(
          "LIVE_TEST_SCRIPT_START_FAILED",
          started.error?.message ?? started.message,
          false,
          "script-start",
        );
      }

      const terminal = await this.#waitFor(() => {
        const records = this.#recordsAfter(logStartId);
        if (records.some((record) =>
          record.component === `script:${SCRIPT_NAME}` &&
          record.message === "slice42:passed"
        )) {
          return "passed" as const;
        }
        if (this.#runtime.state().status === "crashed") return "crashed" as const;
        return undefined;
      }, MAX_TEST_MS);

      const runtimeBeforeStop = this.#runtime.state();
      await this.#runtime.stop();
      if (terminal !== "passed") {
        throw new Slice42LiveTestFailure(
          terminal === "crashed"
            ? "LIVE_TEST_SCRIPT_CRASHED"
            : "LIVE_TEST_SCRIPT_TIMEOUT",
          runtimeBeforeStop.error?.message ??
            "The bounded Slice 4.2 farmer did not reach its completion marker.",
          false,
          "script-run",
        );
      }

      const records = this.#recordsAfter(logStartId);
      const scriptRecords = records.filter((record) =>
        record.component === `script:${SCRIPT_NAME}`
      );
      const actionRecords = records.filter(isSuccessfulScriptAction);
      const actions = actionRecords.map((record) => ({
        action: contextString(record, "action"),
        requestId: record.requestId,
      }));
      const actionNames = actions.map((entry) => entry.action);
      const attackCount = actionNames.filter((action) => action === "character.attack").length;

      this.#requireMarker(scriptRecords, "slice42:globals-ok:");
      this.#requireMarker(scriptRecords, "slice42:helpers-ok");
      this.#requireMarker(scriptRecords, "slice42:target-locked:");
      this.#requireMarker(scriptRecords, "slice42:loot-ok:");
      this.#requireMarker(scriptRecords, "slice42:move-ok:");
      this.#requireMarker(scriptRecords, "slice42:xmove-ok:");
      const targetLockedRecord = scriptRecords.find((record) =>
        record.message.startsWith("slice42:target-locked:")
      );
      const finalTargetId = targetLockedRecord?.message
        .slice("slice42:target-locked:".length)
        .trim();
      if (!finalTargetId) {
        throw new Slice42LiveTestFailure(
          "LIVE_TEST_SCRIPT_TARGET_EVIDENCE_MISSING",
          "The farmer did not record the monster it locked after its first successful attack.",
          false,
          "evidence",
        );
      }
      if (
        !actionNames.includes("character.loot") ||
        !actionNames.includes("character.move") ||
        !actionNames.includes("character.xmove") ||
        attackCount < 1 ||
        attackCount > MAX_ATTACKS
      ) {
        throw new Slice42LiveTestFailure(
          "LIVE_TEST_SCRIPT_ACTION_EVIDENCE_INCOMPLETE",
          "The farmer completed without the required script-origin Action Gateway evidence.",
          false,
          "evidence",
          {
            actionNames,
            attackCount,
          },
        );
      }

      steps.push(Object.freeze({
        name: "globals-and-helpers",
        outcome: "passed",
        message: "character, G, Entities, get_nearest_monster(), is_in_range(), and can_attack() were exercised inside the isolated script.",
        evidence: Object.freeze({
          globalsMarker: true,
          helpersMarker: true,
          targetId: finalTargetId,
          targetType: target.entity.type,
        }),
      }));
      steps.push(Object.freeze({
        name: "script-farmer-actions",
        outcome: "passed",
        message: "The isolated farmer used script-origin attack and loot actions through the central Action Gateway.",
        evidence: Object.freeze({
          attackCount,
          actions: Object.freeze(actions),
        }),
      }));
      steps.push(Object.freeze({
        name: "script-movement",
        outcome: "passed",
        message: "The script completed a validated direct move() and direct-path xmove() round-trip.",
        evidence: Object.freeze({
          moveConfirmed: true,
          xmoveConfirmed: true,
        }),
      }));

      const finalState = this.#character.state();
      this.#assertHpSafety(finalState);
      const result: Slice42LiveTestResult = Object.freeze({
        testId,
        slice: "4.2",
        outcome: "passed",
        startedAt,
        completedAt: this.#now().toISOString(),
        characterId: finalState.characterId,
        characterName: finalState.characterName,
        serverKey: finalState.serverKey,
        targetId: finalTargetId,
        targetType: target.entity.type,
        message:
          "Slice 4.2 passed: the isolated script used the first Adventure Land-compatible globals/helpers and completed bounded attack, loot, move, and xmove actions through the central Action Gateway.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 4.2 one-click live test passed.", {
        testId,
        characterId: result.characterId,
        targetId: result.targetId,
        targetType: result.targetType,
        steps: result.steps.map((step) => step.name),
      });
      return result;
    } catch (error) {
      await this.#runtime.stop().catch(() => undefined);
      const failure = normalizeFailure(error);
      const finalState = this.#character.state();
      steps.push(Object.freeze({
        name: failure.step ?? "live-test",
        outcome: failure.blocked ? "blocked" : "failed",
        message: failure.message,
        evidence: failure.evidence,
      }));
      const outcome: Slice42LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const result: Slice42LiveTestResult = Object.freeze({
        testId,
        slice: "4.2",
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
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      if (failure.blocked) {
        this.#logger.warn("Slice 4.2 one-click live test blocked.", {
          testId,
          errorCode: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 4.2 one-click live test failed.", failure, {
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
      throw new Slice42LiveTestFailure(
        "LIVE_TEST_CHARACTER_NOT_CONNECTED",
        "The one-click test requires an update-restored headless character connection.",
        true,
        "preflight",
      );
    }
    if (state.character.dead) {
      throw new Slice42LiveTestFailure(
        "LIVE_TEST_CHARACTER_DEAD",
        "The connected character is dead; the script farmer did not start.",
        true,
        "preflight",
      );
    }
    if (!data) {
      throw new Slice42LiveTestFailure(
        "LIVE_TEST_GAME_DATA_UNAVAILABLE",
        "Current Adventure Land game data is not loaded.",
        true,
        "preflight",
      );
    }
    this.#assertHpSafety(state);
  }

  #assertHpSafety(state: AdventureLandCharacterConnectionState): void {
    const hp = state.character?.hp;
    const maxHp = state.character?.maxHp;
    if (
      hp !== undefined &&
      maxHp !== undefined &&
      maxHp > 0 &&
      hp / maxHp < 0.65
    ) {
      throw new Slice42LiveTestFailure(
        "LIVE_TEST_HP_SAFETY_STOP",
        "Character HP is below the bounded script-farmer safety threshold.",
        true,
        "safety",
        { hp, maxHp },
      );
    }
  }

  async #waitForSafeInRangeMonster(
    data: AdventureLandGameData,
  ): Promise<{
    readonly target: SafeMonsterCandidate;
    readonly state: AdventureLandCharacterConnectionState;
    readonly waitedMs: number;
  } | undefined> {
    const started = Date.now();
    while (Date.now() - started <= PREFLIGHT_TARGET_WAIT_MS) {
      await this.#delay(PREFLIGHT_TARGET_POLL_MS);
      const state = this.#character.state();
      this.#requireReady(state, data);
      const target = this.#selectSafeInRangeMonster(state, data);
      if (target) {
        return Object.freeze({
          target,
          state,
          waitedMs: Math.min(
            PREFLIGHT_TARGET_WAIT_MS,
            Math.max(PREFLIGHT_TARGET_POLL_MS, Date.now() - started),
          ),
        });
      }
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
    ) {
      return undefined;
    }
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
        ) {
          return [];
        }
        const raw = data.monsters[entity.type];
        if (!isRecord(raw)) return [];
        if (
          raw.stationary === true ||
          raw.cooperative === true ||
          raw.peaceful === true ||
          raw.immune === true ||
          raw.boss === true
        ) {
          return [];
        }
        const hp = finiteNumber(entity.hp) ??
          finiteNumber(entity.maxHp) ??
          finiteNumber(raw.hp);
        const attack = Math.max(0, finiteNumber(raw.attack) ?? 0);
        const xp = Math.max(0, finiteNumber(raw.xp) ?? 0);
        const gold = Math.max(0, finiteNumber(raw.gold) ?? 0);
        if (hp === undefined || hp <= 0 || (xp <= 0 && gold <= 0)) return [];
        const maxSafeHp = Math.max(1_500, character.maxHp * 0.75);
        const maxSafeAttack = Math.max(120, character.maxHp * 0.05);
        if (hp > maxSafeHp || attack > maxSafeAttack) return [];
        const distance = Math.hypot(entity.x - character.x!, entity.y - character.y!);
        if (distance > character.range!) return [];
        return [{ entity, distance, hp, attack }];
      })
      .sort((left, right) =>
        left.hp - right.hp ||
        left.attack - right.attack ||
        left.distance - right.distance ||
        left.entity.id.localeCompare(right.entity.id)
      )[0];
  }

  #safeRoundTrip(
    state: AdventureLandCharacterConnectionState,
    data: AdventureLandGameData,
  ): { x: number; y: number; returnX: number; returnY: number } | undefined {
    const character = state.character;
    if (
      !character?.map ||
      character.x === undefined ||
      character.y === undefined
    ) {
      return undefined;
    }
    const geometry = movementGeometry(data, character.map);
    if (!geometry) return undefined;
    const distances = [16, 24, 32];
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    for (const distance of distances) {
      for (const [dx, dy] of directions) {
        const x = character.x + dx * distance;
        const y = character.y + dy * distance;
        if (
          canMoveDirect(geometry, character.x, character.y, x, y) &&
          canMoveDirect(geometry, x, y, character.x, character.y)
        ) {
          return {
            x,
            y,
            returnX: character.x,
            returnY: character.y,
          };
        }
      }
    }
    return undefined;
  }

  #recordsAfter(id: number): readonly LogRecord[] {
    return this.#logger.records().filter((record) => record.id > id);
  }

  #requireMarker(records: readonly LogRecord[], prefix: string): void {
    if (!records.some((record) => record.message.startsWith(prefix))) {
      throw new Slice42LiveTestFailure(
        "LIVE_TEST_SCRIPT_MARKER_MISSING",
        `Required script evidence marker is missing: ${prefix}`,
        false,
        "evidence",
      );
    }
  }

  async #waitFor<T>(
    read: () => T | undefined,
    timeoutMs: number,
  ): Promise<T | undefined> {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const value = read();
      if (value !== undefined) return value;
      await this.#delay(75);
    }
    return undefined;
  }
}

class Slice42LiveTestFailure extends Error {
  readonly code: string;
  readonly blocked: boolean;
  readonly step?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    blocked: boolean,
    step?: string,
    evidence?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "Slice42LiveTestFailure";
    this.code = code;
    this.blocked = blocked;
    this.step = step;
    this.evidence = evidence;
  }
}

function farmerScript(input: {
  readonly targetId: string;
  readonly targetType: string;
  readonly moveX: number;
  readonly moveY: number;
  readonly returnX: number;
  readonly returnY: number;
}): string {
  const targetId = JSON.stringify(input.targetId);
  const targetType = JSON.stringify(input.targetType);
  return [
    "(async () => {",
    "  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    `  const expectedTargetId = ${targetId};`,
    `  const targetType = ${targetType};`,
    "  let lockedTargetId = null;",
    "  let reacquireAttempts = 0;",
    "  if (!character.id || !character.ctype || !character.map) throw new Error('Slice 4.2 character global is incomplete.');",
    "  if (!G.monsters || !G.monsters[targetType]) throw new Error('Slice 4.2 G global is incomplete.');",
    "  if (!Entities || typeof Entities !== 'object') throw new Error('Slice 4.2 Entities global is incomplete.');",
    "  console.info('slice42:globals-ok:' + character.id + ':' + targetType);",
    "  const usableTarget = (candidate) => Boolean(candidate && candidate.type === 'monster' && candidate.mtype === targetType && !candidate.target && candidate.rip !== true && !(typeof candidate.hp === 'number' && candidate.hp <= 0) && is_in_range(candidate));",
    "  const chooseUnlockedTarget = () => {",
    "    const preferred = Entities[expectedTargetId];",
    "    if (usableTarget(preferred)) return preferred;",
    "    const replacement = get_nearest_monster({type: targetType, no_target: true});",
    "    return usableTarget(replacement) ? replacement : null;",
    "  };",
    "  let target = chooseUnlockedTarget();",
    "  if (!target) throw new Error('No bounded same-type target is currently visible in attack range.');",
    "  if (String(target.id) !== expectedTargetId) console.info('slice42:target-reacquired:' + expectedTargetId + ':' + target.id);",
    "  if (!is_in_range(target)) throw new Error('is_in_range() rejected the bounded in-range target.');",
    "  console.info('slice42:helpers-ok');",
    "  let attackNumber = 0;",
    `  while (attackNumber < ${MAX_ATTACKS}) {`,
    "    target = lockedTargetId ? Entities[lockedTargetId] : chooseUnlockedTarget();",
    "    if (lockedTargetId && (!target || target.rip === true || (typeof target.hp === 'number' && target.hp <= 0))) break;",
    "    if (!target) {",
    "      const acquireDeadline = Date.now() + 1200;",
    "      while (!target && Date.now() < acquireDeadline) {",
    "        await delay(50);",
    "        target = chooseUnlockedTarget();",
    "      }",
    "      if (!target) throw new Error('No bounded same-type replacement target became available.');",
    "    }",
    "    const safetyHp = Number(character.hp);",
    "    const safetyMaxHp = Number(character.max_hp);",
    "    if (Number.isFinite(safetyHp) && Number.isFinite(safetyMaxHp) && safetyMaxHp > 0 && safetyHp / safetyMaxHp < 0.65) throw new Error('Slice 4.2 HP safety stop.');",
    "    const readyDeadline = Date.now() + 3000;",
    "    while (!can_attack(target) && Date.now() < readyDeadline) {",
    "      await delay(50);",
    "      target = lockedTargetId ? Entities[lockedTargetId] : chooseUnlockedTarget();",
    "      if (lockedTargetId && !target) break;",
    "    }",
    "    if (lockedTargetId && !target) break;",
    "    if (!target || !can_attack(target)) throw new Error('can_attack() did not become ready for the bounded target.');",
    "    let result;",
    "    try {",
    "      result = await attack(target);",
    "    } catch (error) {",
    "      if (!lockedTargetId && error && error.code === 'ATTACK_TARGET_NOT_VISIBLE' && reacquireAttempts < 6) {",
    "        reacquireAttempts += 1;",
    "        const vanishedId = String(target.id);",
    "        await delay(75);",
    "        const replacement = chooseUnlockedTarget();",
    "        if (replacement) {",
    "          console.info('slice42:target-reacquired:' + vanishedId + ':' + replacement.id);",
    "          continue;",
    "        }",
    "      }",
    "      throw error;",
    "    }",
    "    attackNumber += 1;",
    "    if (!lockedTargetId) {",
    "      lockedTargetId = String(target.id);",
    "      console.info('slice42:target-locked:' + lockedTargetId);",
    "    }",
    "    console.info('slice42:attack-ok:' + attackNumber + ':' + (result.requestId || ''));",
    "    await delay(125);",
    "  }",
    "  if (!lockedTargetId) throw new Error('No bounded target received a successful attack.');",
    "  target = Entities[lockedTargetId];",
    "  if (target && target.rip !== true && !(typeof target.hp === 'number' && target.hp <= 0)) throw new Error('Bounded attack budget ended before the target was defeated.');",
    "  await delay(2500);",
    "  const lootResult = await loot();",
    "  console.info('slice42:loot-ok:' + (lootResult.requestId || ''));",
    `  const moveResult = await move(${input.moveX}, ${input.moveY});`,
    "  console.info('slice42:move-ok:' + (moveResult.requestId || ''));",
    "  await delay(450);",
    `  const xmoveResult = await xmove(${input.returnX}, ${input.returnY});`,
    "  console.info('slice42:xmove-ok:' + (xmoveResult.requestId || ''));",
    "  console.info('slice42:passed');",
    "})()",
  ].join("\n");
}

function isSuccessfulScriptAction(record: LogRecord): boolean {
  if (record.message !== "Action gateway request completed.") return false;
  if (!isRecord(record.context)) return false;
  return record.context.origin === "script" && record.context.outcome === "success";
}

function contextString(record: LogRecord, key: string): string | undefined {
  if (!isRecord(record.context)) return undefined;
  const value = record.context[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeFailure(error: unknown): Slice42LiveTestFailure {
  if (error instanceof Slice42LiveTestFailure) return error;
  return new Slice42LiveTestFailure(
    "LIVE_TEST_UNEXPECTED_ERROR",
    error instanceof Error ? error.message : String(error),
    false,
    "live-test",
  );
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
