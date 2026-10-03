import { randomUUID } from "node:crypto";
import type {
  AdventureLandAttackService,
  AttackActionResult,
} from "../action/attack.ts";
import type {
  ActionGatewayResult,
} from "../action/gateway.ts";
import type {
  AdventureLandLootConsumableService,
  ConsumableActionResult,
  DashboardConsumableOption,
  LootActionResult,
} from "../action/loot-consumable.ts";
import type {
  AdventureLandMovementService,
  MovementActionResult,
  MovementDirection,
} from "../action/movement.ts";
import type {
  AdventureLandSkillService,
  SkillActionResult,
} from "../action/skill.ts";
import type {
  AdventureLandCharacterConnectionState,
  AdventureLandCharacterService,
} from "../character/service.ts";
import type { AdventureLandVisibleEntity } from "../character/world-state.ts";
import type { AdventureLandGameData } from "../game/data-source.ts";
import type { Logger } from "../logging/logger.ts";

export type Slice35LiveTestOutcome =
  | "idle"
  | "running"
  | "passed"
  | "blocked"
  | "failed";

export interface Slice35LiveTestStep {
  readonly name: string;
  readonly outcome: "passed" | "blocked" | "failed";
  readonly message: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly action?: ActionGatewayResult;
}

export interface Slice35LiveTestResult {
  readonly testId: string;
  readonly slice: "3.5";
  readonly outcome: Exclude<Slice35LiveTestOutcome, "idle" | "running">;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterId?: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly steps: readonly Slice35LiveTestStep[];
  readonly errorCode?: string;
  readonly message: string;
}

export interface Slice35LiveTestState {
  readonly status: Slice35LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice35LiveTestResult;
}

export interface Slice35LiveTestServiceOptions {
  readonly logger: Logger;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly attack: Pick<AdventureLandAttackService, "run">;
  readonly movement: Pick<AdventureLandMovementService, "run">;
  readonly skill: Pick<AdventureLandSkillService, "dashboardOptions" | "run">;
  readonly lootConsumable: Pick<
    AdventureLandLootConsumableService,
    "dashboardOptions" | "runLoot" | "runConsumable"
  >;
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

const MAX_MOVEMENT_STEPS = 8;
const MAX_MONSTER_SETUPS = 2;
const MAX_ATTACKS_PER_MONSTER = 12;
const MAX_TARGET_DISTANCE = 512;

export class Slice35LiveTestService {
  readonly #logger: Logger;
  readonly #character: Pick<AdventureLandCharacterService, "state">;
  readonly #attack: Pick<AdventureLandAttackService, "run">;
  readonly #movement: Pick<AdventureLandMovementService, "run">;
  readonly #skill: Pick<AdventureLandSkillService, "dashboardOptions" | "run">;
  readonly #lootConsumable: Pick<
    AdventureLandLootConsumableService,
    "dashboardOptions" | "runLoot" | "runConsumable"
  >;
  readonly #gameData: () => AdventureLandGameData | undefined;
  readonly #now: () => Date;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #idFactory: () => string;
  #state: Slice35LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 3.5 one-click live test is ready.",
  });
  #running?: Promise<Slice35LiveTestResult>;

  constructor(options: Slice35LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#character = options.character;
    this.#attack = options.attack;
    this.#movement = options.movement;
    this.#skill = options.skill;
    this.#lootConsumable = options.lootConsumable;
    this.#gameData = options.gameData;
    this.#now = options.now ?? (() => new Date());
    this.#delay = options.delay ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    );
    this.#idFactory = options.idFactory ?? (() => `live35-${randomUUID()}`);
  }

  state(): Slice35LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice35LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice35LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#now().toISOString();
    const initial = this.#character.state();
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 3.5 one-click live test is running.",
    });
    this.#logger.info("Slice 3.5 one-click live test started.", {
      testId,
      bounded: true,
      manualGameplayPreparation: false,
    });

    const steps: Slice35LiveTestStep[] = [];
    try {
      this.#requireReady(initial);
      const lootStep = await this.#runLootTest(steps);
      steps.push(lootStep);

      const consumableStep = await this.#runConsumableTest(steps);
      steps.push(consumableStep);

      const completedAt = this.#now().toISOString();
      const finalState = this.#character.state();
      const result: Slice35LiveTestResult = Object.freeze({
        testId,
        slice: "3.5",
        outcome: "passed",
        startedAt,
        completedAt,
        characterId: finalState.characterId,
        characterName: finalState.characterName,
        serverKey: finalState.serverKey,
        steps: Object.freeze([...steps]),
        message:
          "Slice 3.5 passed: automated loot and consumable live checks both completed with server confirmation and observed postconditions.",
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 3.5 one-click live test passed.", {
        testId,
        characterId: result.characterId,
        serverKey: result.serverKey,
        steps: result.steps.length,
      });
      return result;
    } catch (error) {
      const failure = normalizeLiveTestFailure(error);
      const completedAt = this.#now().toISOString();
      const finalState = this.#character.state();
      const terminalStep: Slice35LiveTestStep = Object.freeze({
        name: failure.step ?? "live-test",
        outcome: failure.blocked ? "blocked" : "failed",
        message: failure.message,
        evidence: failure.evidence,
        action: failure.action,
      });
      steps.push(terminalStep);

      const outcome = failure.blocked ? "blocked" : "failed";
      const result: Slice35LiveTestResult = Object.freeze({
        testId,
        slice: "3.5",
        outcome,
        startedAt,
        completedAt,
        characterId: finalState.characterId,
        characterName: finalState.characterName,
        serverKey: finalState.serverKey,
        steps: Object.freeze([...steps]),
        errorCode: failure.code,
        message: failure.message,
      });
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      this.#logger.warn("Slice 3.5 one-click live test stopped.", {
        testId,
        outcome,
        errorCode: failure.code,
        step: failure.step,
        characterId: result.characterId,
      });
      return result;
    }
  }

  #requireReady(state: AdventureLandCharacterConnectionState): void {
    if (state.status !== "connected" || !state.character) {
      throw new LiveTestFailure(
        "LIVE_TEST_CHARACTER_NOT_CONNECTED",
        "The one-click test requires the update-restored headless character connection.",
        true,
        "preflight",
      );
    }
    if (state.character.dead) {
      throw new LiveTestFailure(
        "LIVE_TEST_CHARACTER_DEAD",
        "The connected character is dead; the test stopped before any mutation.",
        true,
        "preflight",
      );
    }
    if (!this.#gameData()) {
      throw new LiveTestFailure(
        "LIVE_TEST_GAME_DATA_UNAVAILABLE",
        "Current Adventure Land game data is not loaded.",
        true,
        "preflight",
      );
    }
  }

  async #runLootTest(
    preparationSteps: Slice35LiveTestStep[],
  ): Promise<Slice35LiveTestStep> {
    const startingState = this.#character.state();
    this.#requireReady(startingState);
    const initialChestIds = new Set(
      (startingState.lootChests ?? []).map((chest) => chest.id),
    );

    let chestId = this.#lootConsumable.dashboardOptions().lootChests[0]?.id;
    if (chestId) {
      preparationSteps.push(Object.freeze({
        name: "loot-setup-existing-chest",
        outcome: "passed",
        message:
          "A chest already observed by the current headless session is available; no combat setup is needed.",
        evidence: Object.freeze({ chestId }),
      }));
    }

    for (
      let setupNumber = 1;
      setupNumber <= MAX_MONSTER_SETUPS && !chestId;
      setupNumber += 1
    ) {
      let candidate = this.#selectSafeMonster();
      if (!candidate) {
        throw new LiveTestFailure(
          "LIVE_TEST_NO_SAFE_LOOT_TARGET",
          "No bounded low-risk loot-producing monster is currently visible within the test search radius.",
          true,
          "loot-setup",
        );
      }

      if (!this.#isInAttackRange(candidate)) {
        candidate = await this.#moveIntoRange(candidate, preparationSteps);
      }

      for (
        let attackNumber = 1;
        attackNumber <= MAX_ATTACKS_PER_MONSTER;
        attackNumber += 1
      ) {
        const freshState = this.#character.state();
        this.#assertCombatSafety(freshState);
        const freshTarget = freshState.entities?.find((entity) =>
          entity.kind === "monster" && entity.id === candidate!.entity.id
        );

        if (!freshTarget || (freshTarget.hp !== undefined && freshTarget.hp <= 0)) {
          chestId = await this.#waitForNewChest(initialChestIds, 2_500);
          break;
        }

        const refreshed = this.#candidateForEntity(freshTarget);
        if (!refreshed) {
          throw new LiveTestFailure(
            "LIVE_TEST_TARGET_BECAME_UNSAFE",
            "The selected loot-setup monster no longer satisfies the bounded safety rules.",
            true,
            "loot-setup",
          );
        }
        candidate = refreshed;
        if (!this.#isInAttackRange(candidate)) {
          candidate = await this.#moveIntoRange(candidate, preparationSteps);
        }

        const attack = await this.#attack.run(
          { targetId: candidate.entity.id },
          "dashboard",
        );
        if (attack.outcome !== "success" || !attack.result?.serverAccepted) {
          throw actionFailure(
            "LIVE_TEST_ATTACK_FAILED",
            "A bounded loot-setup attack did not receive a confirmed success result; no automatic retry was performed.",
            "loot-setup",
            attack,
          );
        }
        preparationSteps.push(Object.freeze({
          name: "loot-setup-attack",
          outcome: "passed",
          message: "Bounded low-risk setup attack was server-confirmed.",
          action: attack,
          evidence: Object.freeze({
            setupNumber,
            attackNumber,
            targetId: candidate.entity.id,
            targetType: candidate.entity.type,
          }),
        }));

        const waitMs = Math.min(
          2_000,
          Math.max(550, (attack.result.cooldownMs ?? 500) + 75),
        );
        await this.#delay(waitMs);
        chestId = await this.#waitForNewChest(initialChestIds, 350);
        if (chestId) break;
      }

      if (!chestId) {
        chestId = await this.#waitForNewChest(initialChestIds, 2_500);
      }
    }

    if (!chestId) {
      throw new LiveTestFailure(
        "LIVE_TEST_CHEST_NOT_OBSERVED",
        "The bounded combat setup completed without a new Adventure Land chest becoming visible.",
        true,
        "loot-setup",
      );
    }

    const before = this.#character.state();
    const goldBefore = before.character?.gold;
    const inventoryBefore = inventorySignature(before);
    const loot = await this.#lootConsumable.runLoot({ chestId }, "dashboard");
    if (loot.outcome !== "success" || !loot.result?.serverAccepted) {
      throw actionFailure(
        "LIVE_TEST_LOOT_FAILED",
        "The generated chest did not complete with confirmed Adventure Land loot acceptance; no retry was performed.",
        "loot",
        loot,
      );
    }

    const postcondition = await this.#waitFor(
      () => {
        const state = this.#character.state();
        const chestGone = !(state.lootChests ?? []).some((chest) =>
          chest.id === chestId
        );
        const goldChanged = (
          goldBefore !== undefined &&
          state.character?.gold !== undefined &&
          state.character.gold !== goldBefore
        );
        const inventoryChanged = inventorySignature(state) !== inventoryBefore;
        return chestGone && (goldChanged || inventoryChanged)
          ? { chestGone, goldChanged, inventoryChanged }
          : undefined;
      },
      3_000,
    );

    if (!postcondition) {
      throw new LiveTestFailure(
        "LIVE_TEST_LOOT_POSTCONDITION_MISSING",
        "Adventure Land accepted the loot action, but the required chest/reward postcondition was not fully observed.",
        false,
        "loot",
        { chestId },
        loot,
      );
    }

    return Object.freeze({
      name: "loot",
      outcome: "passed",
      message:
        "A newly generated live chest was opened exactly once and its reward mutation was observed.",
      action: loot,
      evidence: Object.freeze({
        chestId,
        ...postcondition,
      }),
    });
  }

  async #runConsumableTest(
    preparationSteps: Slice35LiveTestStep[],
  ): Promise<Slice35LiveTestStep> {
    let option = this.#selectConsumableWithDeficit();
    if (!option) {
      const setup = await this.#createMpDeficit();
      preparationSteps.push(setup);
      option = this.#selectConsumableWithDeficit("mp");
    }

    if (!option) {
      throw new LiveTestFailure(
        "LIVE_TEST_NO_SAFE_CONSUMABLE",
        "No validated HP/MP consumable has a safe observable resource deficit after bounded setup.",
        true,
        "consumable-setup",
      );
    }

    const before = this.#character.state();
    const resourceBefore = resourceValue(before, option.kind);
    const quantityBefore = itemQuantity(before, option.inventoryIndex);
    const cooldownKey = option.kind === "hp" ? "use_hp" : "use_mp";

    const cooldownReady = await this.#waitFor(
      () => {
        const options = this.#lootConsumable.dashboardOptions();
        if (options.status !== "ready") return undefined;
        const current = options.consumables.find((item) =>
          item.inventoryIndex === option!.inventoryIndex &&
          item.itemName === option!.itemName &&
          item.kind === option!.kind
        );
        return current ? true : undefined;
      },
      Math.min(4_000, Math.max(750, (option.cooldownMs ?? 0) + 250)),
    );
    if (!cooldownReady) {
      throw new LiveTestFailure(
        "LIVE_TEST_CONSUMABLE_CHANGED",
        "The selected consumable changed before the bounded use could start.",
        true,
        "consumable",
        { cooldownKey },
      );
    }

    const consume = await this.#lootConsumable.runConsumable({
      inventoryIndex: option.inventoryIndex,
      itemName: option.itemName,
      kind: option.kind,
    }, "dashboard");
    if (consume.outcome !== "success" || !consume.result?.serverAccepted) {
      throw actionFailure(
        "LIVE_TEST_CONSUMABLE_FAILED",
        "The bounded consumable use did not receive confirmed Adventure Land acceptance; no retry was performed.",
        "consumable",
        consume,
      );
    }

    const postcondition = await this.#waitFor(
      () => {
        const state = this.#character.state();
        const resourceAfter = resourceValue(state, option!.kind);
        const quantityAfter = itemQuantity(state, option!.inventoryIndex);
        const resourceIncreased = (
          resourceBefore !== undefined &&
          resourceAfter !== undefined &&
          resourceAfter > resourceBefore
        );
        const quantityDecreased = (
          quantityBefore !== undefined &&
          quantityAfter !== undefined &&
          quantityAfter < quantityBefore
        ) || (quantityBefore === 1 && quantityAfter === undefined);
        return resourceIncreased || quantityDecreased
          ? {
            resourceBefore,
            resourceAfter,
            quantityBefore,
            quantityAfter,
            resourceIncreased,
            quantityDecreased,
          }
          : undefined;
      },
      3_000,
    );

    if (!postcondition) {
      throw new LiveTestFailure(
        "LIVE_TEST_CONSUMABLE_POSTCONDITION_MISSING",
        "Adventure Land accepted the consumable action, but neither resource nor quantity postcondition became observable.",
        false,
        "consumable",
        {
          inventoryIndex: option.inventoryIndex,
          itemName: option.itemName,
          kind: option.kind,
        },
        consume,
      );
    }

    return Object.freeze({
      name: "consumable",
      outcome: "passed",
      message:
        "One validated HP/MP consumable was used exactly once and its live postcondition was observed.",
      action: consume,
      evidence: Object.freeze({
        inventoryIndex: option.inventoryIndex,
        itemName: option.itemName,
        kind: option.kind,
        ...postcondition,
      }),
    });
  }

  async #createMpDeficit(): Promise<Slice35LiveTestStep> {
    const state = this.#character.state();
    this.#requireReady(state);
    const mpPotion = this.#lootConsumable.dashboardOptions().consumables
      .filter((item) => item.kind === "mp")
      .sort((left, right) =>
        right.quantity - left.quantity ||
        left.inventoryIndex - right.inventoryIndex
      )[0];
    if (!mpPotion) {
      throw new LiveTestFailure(
        "LIVE_TEST_MP_POTION_UNAVAILABLE",
        "Resources are full and no validated MP potion is available for safe automatic setup.",
        true,
        "consumable-setup",
      );
    }

    const currentMp = state.character?.mp;
    const options = this.#skill.dashboardOptions();
    const skill = options.skills
      .filter((entry) =>
        entry.targetMode === "none" &&
        entry.mpCost > 0 &&
        currentMp !== undefined &&
        entry.mpCost < currentMp
      )
      .sort((left, right) =>
        left.mpCost - right.mpCost ||
        left.skillName.localeCompare(right.skillName)
      )[0];
    if (!skill) {
      throw new LiveTestFailure(
        "LIVE_TEST_MP_SETUP_SKILL_UNAVAILABLE",
        "Resources are full and no bounded non-hostile no-target skill can safely create an MP deficit.",
        true,
        "consumable-setup",
      );
    }

    const mpBefore = currentMp;
    const action = await this.#skill.run({ skillName: skill.skillName }, "dashboard");
    if (action.outcome !== "success" || !action.result?.serverAccepted) {
      throw actionFailure(
        "LIVE_TEST_MP_SETUP_SKILL_FAILED",
        "The bounded MP setup skill did not complete successfully; no retry was performed.",
        "consumable-setup",
        action,
      );
    }

    const observed = await this.#waitFor(
      () => {
        const mpAfter = this.#character.state().character?.mp;
        return (
          mpBefore !== undefined &&
          mpAfter !== undefined &&
          mpAfter < mpBefore
        )
          ? { mpBefore, mpAfter }
          : undefined;
      },
      2_500,
    );
    if (!observed) {
      throw new LiveTestFailure(
        "LIVE_TEST_MP_SETUP_POSTCONDITION_MISSING",
        "The setup skill was accepted but the expected MP decrease was not observed.",
        false,
        "consumable-setup",
        { skillName: skill.skillName },
        action,
      );
    }

    return Object.freeze({
      name: "consumable-setup",
      outcome: "passed",
      message:
        "A bounded non-hostile skill created the MP deficit needed for the consumable check.",
      action,
      evidence: Object.freeze({
        skillName: skill.skillName,
        ...observed,
      }),
    });
  }

  #selectConsumableWithDeficit(
    requiredKind?: "hp" | "mp",
  ): DashboardConsumableOption | undefined {
    const state = this.#character.state();
    const options = this.#lootConsumable.dashboardOptions();
    if (options.status !== "ready" || !state.character) return undefined;

    return options.consumables
      .filter((item) => !requiredKind || item.kind === requiredKind)
      .filter((item) => {
        const current = item.kind === "hp"
          ? state.character!.hp
          : state.character!.mp;
        const maximum = item.kind === "hp"
          ? state.character!.maxHp
          : state.character!.maxMp;
        return (
          current !== undefined &&
          maximum !== undefined &&
          current < maximum
        );
      })
      .sort((left, right) =>
        right.quantity - left.quantity ||
        left.restoreAmount - right.restoreAmount ||
        left.inventoryIndex - right.inventoryIndex
      )[0];
  }

  #selectSafeMonster(): SafeMonsterCandidate | undefined {
    const state = this.#character.state();
    const data = this.#gameData();
    if (state.status !== "connected" || !state.character || !data) {
      return undefined;
    }

    const character = state.character;
    const maximumHp = character.maxHp;
    if (
      character.x === undefined ||
      character.y === undefined ||
      maximumHp === undefined ||
      maximumHp <= 0
    ) {
      return undefined;
    }

    return (state.entities ?? [])
      .flatMap((entity) => {
        const candidate = this.#candidateForEntity(entity);
        return candidate ? [candidate] : [];
      })
      .sort((left, right) =>
        Number(this.#isInAttackRange(right)) -
          Number(this.#isInAttackRange(left)) ||
        left.hp - right.hp ||
        left.attack - right.attack ||
        left.distance - right.distance
      )[0];
  }

  #candidateForEntity(
    entity: AdventureLandVisibleEntity,
  ): SafeMonsterCandidate | undefined {
    const state = this.#character.state();
    const data = this.#gameData();
    const character = state.character;
    if (
      entity.kind !== "monster" ||
      !character ||
      !data ||
      entity.hp === 0 ||
      entity.type.startsWith("target") ||
      /dummy|target/i.test(entity.name) ||
      entity.x === undefined ||
      entity.y === undefined ||
      character.x === undefined ||
      character.y === undefined ||
      character.maxHp === undefined
    ) {
      return undefined;
    }
    if (
      entity.target &&
      entity.target !== character.name &&
      entity.target !== character.id
    ) {
      return undefined;
    }

    const raw = data.monsters[entity.type];
    if (!isRecord(raw)) return undefined;
    if (
      raw.stationary === true ||
      raw.cooperative === true ||
      raw.peaceful === true ||
      raw.immune === true ||
      raw.boss === true
    ) {
      return undefined;
    }

    const hp = finiteNumber(entity.hp) ??
      finiteNumber(entity.maxHp) ??
      finiteNumber(raw.hp);
    const attack = Math.max(0, finiteNumber(raw.attack) ?? 0);
    const xp = Math.max(0, finiteNumber(raw.xp) ?? 0);
    const gold = Math.max(0, finiteNumber(raw.gold) ?? 0);
    if (hp === undefined || hp <= 0 || (xp <= 0 && gold <= 0)) return undefined;

    const maxSafeHp = Math.max(1_500, character.maxHp * 0.75);
    const maxSafeAttack = Math.max(120, character.maxHp * 0.05);
    if (hp > maxSafeHp || attack > maxSafeAttack) return undefined;

    const distance = Math.hypot(
      entity.x - character.x,
      entity.y - character.y,
    );
    if (distance > MAX_TARGET_DISTANCE) return undefined;

    return {
      entity,
      distance,
      hp,
      attack,
    };
  }

  #isInAttackRange(candidate: SafeMonsterCandidate): boolean {
    const range = this.#character.state().character?.range;
    return range !== undefined && range > 0 && candidate.distance <= range;
  }

  async #moveIntoRange(
    initial: SafeMonsterCandidate,
    steps: Slice35LiveTestStep[],
  ): Promise<SafeMonsterCandidate> {
    let candidate = initial;
    for (let index = 1; index <= MAX_MOVEMENT_STEPS; index += 1) {
      if (this.#isInAttackRange(candidate)) return candidate;
      const state = this.#character.state();
      this.#assertCombatSafety(state);
      const freshEntity = state.entities?.find((entity) =>
        entity.kind === "monster" && entity.id === candidate.entity.id
      );
      if (!freshEntity) {
        const replacement = this.#selectSafeMonster();
        if (!replacement) {
          throw new LiveTestFailure(
            "LIVE_TEST_LOOT_TARGET_LOST",
            "The safe loot target disappeared and no replacement is available.",
            true,
            "loot-setup",
          );
        }
        candidate = replacement;
        continue;
      }

      const refreshed = this.#candidateForEntity(freshEntity);
      if (!refreshed) {
        throw new LiveTestFailure(
          "LIVE_TEST_LOOT_TARGET_UNSAFE",
          "The loot target no longer satisfies the bounded safety rules.",
          true,
          "loot-setup",
        );
      }
      candidate = refreshed;
      if (this.#isInAttackRange(candidate)) return candidate;

      const character = state.character!;
      const directions = movementDirections(
        candidate.entity.x! - character.x!,
        candidate.entity.y! - character.y!,
      );
      let moved = false;
      for (const direction of directions) {
        const movement = await this.#movement.run(
          { mode: "move", direction },
          "dashboard",
        );
        if (movement.outcome === "success" && movement.result?.serverConfirmed) {
          steps.push(Object.freeze({
            name: "loot-setup-move",
            outcome: "passed",
            message: "Bounded direct movement moved toward the safe loot target.",
            action: movement,
            evidence: Object.freeze({
              step: index,
              direction,
              targetId: candidate.entity.id,
            }),
          }));
          moved = true;
          break;
        }
        if (
          movement.error?.code !== "MOVE_BLOCKED" &&
          movement.error?.code !== "XMOVE_PATH_REQUIRED"
        ) {
          throw actionFailure(
            "LIVE_TEST_MOVEMENT_FAILED",
            "Bounded loot-setup movement failed unexpectedly.",
            "loot-setup",
            movement,
          );
        }
      }
      if (!moved) {
        throw new LiveTestFailure(
          "LIVE_TEST_SAFE_PATH_UNAVAILABLE",
          "No safe direct 32-unit movement step can approach the loot target.",
          true,
          "loot-setup",
        );
      }
      await this.#delay(125);

      const after = this.#character.state().entities?.find((entity) =>
        entity.kind === "monster" && entity.id === candidate.entity.id
      );
      const next = after ? this.#candidateForEntity(after) : undefined;
      if (next) candidate = next;
    }

    if (!this.#isInAttackRange(candidate)) {
      throw new LiveTestFailure(
        "LIVE_TEST_TARGET_OUT_OF_RANGE",
        "The bounded movement budget ended before a safe loot target entered attack range.",
        true,
        "loot-setup",
      );
    }
    return candidate;
  }

  #assertCombatSafety(state: AdventureLandCharacterConnectionState): void {
    this.#requireReady(state);
    const hp = state.character?.hp;
    const maxHp = state.character?.maxHp;
    if (
      hp !== undefined &&
      maxHp !== undefined &&
      maxHp > 0 &&
      hp / maxHp < 0.65
    ) {
      throw new LiveTestFailure(
        "LIVE_TEST_HP_SAFETY_STOP",
        "Character HP fell below the bounded live-test safety threshold.",
        true,
        "loot-setup",
        { hp, maxHp },
      );
    }
  }

  async #waitForNewChest(
    initialChestIds: ReadonlySet<string>,
    timeoutMs: number,
  ): Promise<string | undefined> {
    const found = await this.#waitFor(
      () => (this.#character.state().lootChests ?? [])
        .find((chest) => !initialChestIds.has(chest.id))?.id,
      timeoutMs,
    );
    return found;
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

class LiveTestFailure extends Error {
  readonly code: string;
  readonly blocked: boolean;
  readonly step?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly action?: ActionGatewayResult;

  constructor(
    code: string,
    message: string,
    blocked: boolean,
    step?: string,
    evidence?: Readonly<Record<string, unknown>>,
    action?: ActionGatewayResult,
  ) {
    super(message);
    this.name = "LiveTestFailure";
    this.code = code;
    this.blocked = blocked;
    this.step = step;
    this.evidence = evidence;
    this.action = action;
  }
}

function actionFailure(
  code: string,
  message: string,
  step: string,
  action: ActionGatewayResult<
    AttackActionResult | MovementActionResult | SkillActionResult |
      LootActionResult | ConsumableActionResult
  >,
): LiveTestFailure {
  return new LiveTestFailure(
    code,
    message,
    false,
    step,
    action.error
      ? Object.freeze({
        action: action.action,
        actionErrorCode: action.error.code,
        retryAfterMs: action.retryAfterMs,
      })
      : undefined,
    action,
  );
}

function normalizeLiveTestFailure(error: unknown): LiveTestFailure {
  if (error instanceof LiveTestFailure) return error;
  return new LiveTestFailure(
    "LIVE_TEST_UNEXPECTED_ERROR",
    error instanceof Error ? error.message : String(error),
    false,
    "live-test",
  );
}

function movementDirections(dx: number, dy: number): readonly MovementDirection[] {
  const horizontal: MovementDirection = dx < 0 ? "left" : "right";
  const vertical: MovementDirection = dy < 0 ? "up" : "down";
  return Math.abs(dx) >= Math.abs(dy)
    ? [horizontal, vertical]
    : [vertical, horizontal];
}

function resourceValue(
  state: AdventureLandCharacterConnectionState,
  kind: "hp" | "mp",
): number | undefined {
  return kind === "hp" ? state.character?.hp : state.character?.mp;
}

function itemQuantity(
  state: AdventureLandCharacterConnectionState,
  inventoryIndex: number,
): number | undefined {
  const item = state.character?.inventory?.[inventoryIndex];
  if (!item) return undefined;
  const quantity = finiteNumber(item.q);
  return quantity !== undefined && quantity > 0 ? quantity : 1;
}

function inventorySignature(state: AdventureLandCharacterConnectionState): string {
  return JSON.stringify(
    (state.character?.inventory ?? []).map((item) => {
      if (!item) return null;
      return [
        typeof item.name === "string" ? item.name : "",
        finiteNumber(item.level) ?? 0,
        finiteNumber(item.q) ?? 1,
      ];
    }),
  );
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
