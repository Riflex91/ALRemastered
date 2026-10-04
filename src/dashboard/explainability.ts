import type { ActionGateway } from "../action/gateway.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandVisibleEntity } from "../character/world-state.ts";
import type { MovementDebugService } from "../navigation/movement-debug.ts";
import type { SimpleFarmerTemplateService } from "../script/simple-farmer.ts";
import type { TemplateConfigurationService } from "./template-config.ts";

export interface ExplainabilityTarget {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly distance?: number;
  readonly attackRange?: number;
  readonly inRange?: boolean;
}

export interface ExplainabilityRejectedTarget {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly distance?: number;
  readonly reason: string;
}

export interface ExplainabilityCooldowns {
  readonly attackMs: number;
  readonly hpMs: number;
  readonly mpMs: number;
}

export interface ExplainabilityMovementTarget {
  readonly status: "none" | "telemetry";
  readonly map?: string;
  readonly x?: number;
  readonly y?: number;
  readonly source?: "last-gateway-action" | "latest-planned-route";
  readonly message: string;
}

export interface ExplainabilityNextAction {
  readonly key:
    | "connect"
    | "start-template"
    | "wait"
    | "respawn"
    | "use-hp"
    | "use-mp"
    | "loot"
    | "attack";
  readonly label: string;
  readonly reason: string;
}

export interface ExplainabilityState {
  readonly status: "ready" | "unavailable";
  readonly strategy: Readonly<{
    readonly name: string;
    readonly active: boolean;
    readonly runtimeStatus: string;
    readonly configuredMonster?: string;
  }>;
  readonly currentTarget?: ExplainabilityTarget;
  readonly selectionReason: string;
  readonly rejectedTargets: readonly ExplainabilityRejectedTarget[];
  readonly range: Readonly<{
    readonly attackRange?: number;
    readonly targetDistance?: number;
    readonly inRange?: boolean;
    readonly message: string;
  }>;
  readonly cooldowns: ExplainabilityCooldowns;
  readonly movementTarget: ExplainabilityMovementTarget;
  readonly nextAction: ExplainabilityNextAction;
  readonly blockers: readonly string[];
  readonly lastGatewayAction?: Readonly<{
    readonly action: string;
    readonly outcome: string;
    readonly origin: string;
    readonly errorCode?: string;
    readonly retryAfterMs?: number;
  }>;
  readonly readOnly: true;
  readonly gameplayMutation: false;
  readonly rawSocketAccess: false;
  readonly message: string;
}

export interface ExplainabilityServiceOptions {
  readonly character: Pick<
    AdventureLandCharacterService,
    "state" | "attackCooldownRemainingMs" | "skillCooldownRemainingMs"
  >;
  readonly farmer: Pick<SimpleFarmerTemplateService, "state">;
  readonly config: Pick<TemplateConfigurationService, "state">;
  readonly gateway: Pick<ActionGateway, "state">;
  readonly movementDebug: Pick<MovementDebugService, "state">;
}

export class ExplainabilityService {
  readonly #character: ExplainabilityServiceOptions["character"];
  readonly #farmer: ExplainabilityServiceOptions["farmer"];
  readonly #config: ExplainabilityServiceOptions["config"];
  readonly #gateway: ExplainabilityServiceOptions["gateway"];
  readonly #movementDebug: ExplainabilityServiceOptions["movementDebug"];

  constructor(options: ExplainabilityServiceOptions) {
    this.#character = options.character;
    this.#farmer = options.farmer;
    this.#config = options.config;
    this.#gateway = options.gateway;
    this.#movementDebug = options.movementDebug;
  }

  state(): ExplainabilityState {
    const characterState = this.#character.state();
    const farmer = this.#farmer.state();
    const template = this.#config.state().templates.find((item) => item.id === "simple-farmer");
    const gateway = this.#gateway.state();
    const movement = this.#movementDebug.state();
    const configured = farmer.config ?? configFromTemplate(template?.values);
    const active = farmer.status === "running";
    const connected = characterState.status === "connected" && Boolean(characterState.character);
    const character = characterState.character;
    const attackRange = finite(character?.range);
    const attackCooldownMs = connected ? this.#character.attackCooldownRemainingMs() : 0;
    const hpCooldownMs = connected ? this.#character.skillCooldownRemainingMs("use_hp") : 0;
    const mpCooldownMs = connected ? this.#character.skillCooldownRemainingMs("use_mp") : 0;

    const analysis = analyzeTargets(
      characterState.entities ?? [],
      configured?.monster,
      character?.map,
      character?.x,
      character?.y,
      attackRange,
    );
    const currentTarget = analysis.selected;
    const blockers: string[] = [];

    if (!connected) blockers.push("Primary Character is not connected.");
    if (!configured?.monster) blockers.push("No Simple Farmer monster is configured.");
    if (!active) blockers.push("Simple Farmer Template is not running.");
    if (connected && character?.dead && !configured?.respawn) {
      blockers.push("Character is dead and Respawn is disabled.");
    }
    if (active && configured?.monster && !currentTarget) {
      blockers.push(`No eligible visible ${configured.monster} target is available.`);
    }
    if (currentTarget && currentTarget.inRange === false) {
      blockers.push("Selected target is outside attack range; Simple Farmer does not navigate.");
    }
    if (active && attackCooldownMs > 0) {
      blockers.push(`Attack cooldown is active for ${attackCooldownMs} ms.`);
    }

    const selectionReason = !configured?.monster
      ? "No target can be selected until a Simple Farmer monster is configured."
      : currentTarget
        ? active
          ? `Nearest visible ${configured.monster} without another target; Simple Farmer then checks attack range and cooldown before attacking.`
          : `Read-only preview: nearest visible ${configured.monster} without another target. The template is not running.`
        : `No eligible visible ${configured.monster} matched the Simple Farmer target filter.`;

    const nextAction = chooseNextAction({
      connected,
      active,
      character,
      configured,
      currentTarget,
      attackCooldownMs,
      hpCooldownMs,
      mpCooldownMs,
      visibleLoot: (characterState.lootChests ?? []).length,
    });

    const range = Object.freeze({
      attackRange,
      targetDistance: currentTarget?.distance,
      inRange: currentTarget?.inRange,
      message: currentTarget
        ? currentTarget.inRange === true
          ? `Target is in range (${formatNumber(currentTarget.distance)} ≤ ${formatNumber(attackRange)}).`
          : currentTarget.inRange === false
            ? `Target is out of range (${formatNumber(currentTarget.distance)} > ${formatNumber(attackRange)}).`
            : "Target distance/range is incomplete."
        : attackRange !== undefined
          ? `Attack range is ${formatNumber(attackRange)}; no eligible target is selected.`
          : "Attack range is unavailable.",
    });

    const movementTarget = movementTargetFrom(gateway.lastResult, movement.plannedRoute);
    const lastGatewayAction = gateway.lastResult
      ? Object.freeze({
        action: gateway.lastResult.action,
        outcome: gateway.lastResult.outcome,
        origin: gateway.lastResult.origin,
        errorCode: gateway.lastResult.error?.code,
        retryAfterMs: gateway.lastResult.retryAfterMs,
      })
      : undefined;

    return structuredClone(Object.freeze({
      status: connected ? "ready" as const : "unavailable" as const,
      strategy: Object.freeze({
        name: "Simple Farmer",
        active,
        runtimeStatus: farmer.status,
        configuredMonster: configured?.monster,
      }),
      currentTarget,
      selectionReason,
      rejectedTargets: Object.freeze(analysis.rejected.slice(0, 12)),
      range,
      cooldowns: Object.freeze({
        attackMs: Math.max(0, attackCooldownMs),
        hpMs: Math.max(0, hpCooldownMs),
        mpMs: Math.max(0, mpCooldownMs),
      }),
      movementTarget,
      nextAction,
      blockers: Object.freeze(blockers),
      lastGatewayAction,
      readOnly: true as const,
      gameplayMutation: false as const,
      rawSocketAccess: false as const,
      message: connected
        ? "Explainability is computed from existing live state and telemetry only; it does not control the bot."
        : "Connect a primary Character to populate live explainability.",
    }));
  }
}

function configFromTemplate(
  values: Readonly<Record<string, string | number | boolean>> | undefined,
): {
  readonly monster: string;
  readonly hpThresholdPercent: number;
  readonly mpThresholdPercent: number;
  readonly loot: boolean;
  readonly respawn: boolean;
} | undefined {
  if (!values || typeof values.monster !== "string" || !values.monster.trim()) return undefined;
  return {
    monster: values.monster,
    hpThresholdPercent: typeof values.hpThresholdPercent === "number"
      ? values.hpThresholdPercent
      : 50,
    mpThresholdPercent: typeof values.mpThresholdPercent === "number"
      ? values.mpThresholdPercent
      : 30,
    loot: values.loot !== false,
    respawn: values.respawn !== false,
  };
}

function analyzeTargets(
  entities: readonly AdventureLandVisibleEntity[],
  monster: string | undefined,
  characterMap: string | undefined,
  characterX: number | undefined,
  characterY: number | undefined,
  attackRange: number | undefined,
): {
  readonly selected?: ExplainabilityTarget;
  readonly rejected: readonly ExplainabilityRejectedTarget[];
} {
  if (!monster) return { rejected: Object.freeze([]) };

  const eligible: Array<{ entity: AdventureLandVisibleEntity; distance?: number }> = [];
  const rejected: ExplainabilityRejectedTarget[] = [];
  for (const entity of entities.filter((item) => item.kind === "monster")) {
    const distance = pointDistance(characterX, characterY, entity.x, entity.y);
    let reason: string | undefined;
    if (entity.type !== monster) reason = `Different monster type (${entity.type}).`;
    else if (typeof entity.hp === "number" && entity.hp <= 0) reason = "Target is already defeated.";
    else if (entity.target) reason = `Target is already engaged with ${entity.target}.`;
    else if (characterMap && entity.map && entity.map !== characterMap) reason = "Target is on another map.";
    else if (distance === undefined) reason = "Target position is incomplete.";

    if (reason) {
      rejected.push(Object.freeze({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        distance: roundOne(distance),
        reason,
      }));
      continue;
    }
    eligible.push({ entity, distance });
  }

  eligible.sort((left, right) =>
    (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY) ||
    left.entity.id.localeCompare(right.entity.id)
  );
  const chosen = eligible[0];
  if (!chosen) return { rejected: Object.freeze(rejected) };

  for (const alternate of eligible.slice(1)) {
    rejected.push(Object.freeze({
      id: alternate.entity.id,
      name: alternate.entity.name,
      type: alternate.entity.type,
      distance: roundOne(alternate.distance),
      reason: "Farther away than the selected matching target.",
    }));
  }

  const selectedDistance = roundOne(chosen.distance);
  return {
    selected: Object.freeze({
      id: chosen.entity.id,
      name: chosen.entity.name,
      type: chosen.entity.type,
      distance: selectedDistance,
      attackRange: roundOne(attackRange),
      inRange: selectedDistance !== undefined && attackRange !== undefined
        ? selectedDistance <= attackRange
        : undefined,
    }),
    rejected: Object.freeze(rejected),
  };
}

function chooseNextAction(input: {
  readonly connected: boolean;
  readonly active: boolean;
  readonly character: Readonly<{
    readonly hp?: number;
    readonly maxHp?: number;
    readonly mp?: number;
    readonly maxMp?: number;
    readonly dead?: boolean;
  }> | undefined;
  readonly configured: Readonly<{
    readonly hpThresholdPercent: number;
    readonly mpThresholdPercent: number;
    readonly loot: boolean;
    readonly respawn: boolean;
  }> | undefined;
  readonly currentTarget?: ExplainabilityTarget;
  readonly attackCooldownMs: number;
  readonly hpCooldownMs: number;
  readonly mpCooldownMs: number;
  readonly visibleLoot: number;
}): ExplainabilityNextAction {
  if (!input.connected) return action("connect", "Connect Character", "A live primary Character is required.");
  if (!input.active) return action("start-template", "Start template", "Simple Farmer is configured/readable but is not running.");
  if (!input.configured) return action("wait", "Wait", "Simple Farmer configuration is unavailable.");
  if (input.character?.dead) {
    return input.configured.respawn
      ? action("respawn", "Respawn", "Character is dead and Respawn is enabled.")
      : action("wait", "Wait", "Character is dead and Respawn is disabled.");
  }

  const hpPercent = percent(input.character?.hp, input.character?.maxHp);
  if (hpPercent !== undefined && hpPercent <= input.configured.hpThresholdPercent) {
    return input.hpCooldownMs > 0
      ? action("wait", "Wait for HP cooldown", `HP is below threshold but use_hp cooldown has ${input.hpCooldownMs} ms remaining.`)
      : action("use-hp", "Use HP consumable", `HP is ${roundOne(hpPercent)}%, at/below the configured ${input.configured.hpThresholdPercent}% threshold.`);
  }

  const mpPercent = percent(input.character?.mp, input.character?.maxMp);
  if (mpPercent !== undefined && mpPercent <= input.configured.mpThresholdPercent) {
    return input.mpCooldownMs > 0
      ? action("wait", "Wait for MP cooldown", `MP is below threshold but use_mp cooldown has ${input.mpCooldownMs} ms remaining.`)
      : action("use-mp", "Use MP consumable", `MP is ${roundOne(mpPercent)}%, at/below the configured ${input.configured.mpThresholdPercent}% threshold.`);
  }

  if (input.configured.loot && input.visibleLoot > 0) {
    return action("loot", "Loot visible chest", `${input.visibleLoot} visible loot chest(s) are available and Loot is enabled.`);
  }
  if (!input.currentTarget) return action("wait", "Wait for target", "No eligible configured monster is currently visible.");
  if (input.currentTarget.inRange === false) {
    return action("wait", "Wait for in-range target", "Selected target is out of range and Simple Farmer does not navigate.");
  }
  if (input.attackCooldownMs > 0) {
    return action("wait", "Wait for attack cooldown", `Attack cooldown has ${input.attackCooldownMs} ms remaining.`);
  }
  return action("attack", "Attack selected target", "Selected target matches the configured monster filter and is attackable now.");
}

function movementTargetFrom(
  lastResult: ReturnType<ActionGateway["state"]>["lastResult"],
  plannedRoute: ReturnType<MovementDebugService["state"]>["plannedRoute"],
): ExplainabilityMovementTarget {
  if (
    lastResult &&
    (lastResult.action === "character.move" || lastResult.action === "character.xmove") &&
    lastResult.result &&
    typeof lastResult.result === "object"
  ) {
    const result = lastResult.result as Record<string, unknown>;
    const x = finite(result.targetX);
    const y = finite(result.targetY);
    const map = typeof result.map === "string" ? result.map : undefined;
    if (x !== undefined && y !== undefined) {
      return Object.freeze({
        status: "telemetry" as const,
        map,
        x,
        y,
        source: "last-gateway-action" as const,
        message: "Latest confirmed movement action target from Action Gateway telemetry.",
      });
    }
  }
  if (plannedRoute?.to) {
    return Object.freeze({
      status: "telemetry" as const,
      map: plannedRoute.to.map,
      x: plannedRoute.to.x,
      y: plannedRoute.to.y,
      source: "latest-planned-route" as const,
      message: "Latest read-only path-planner target. It is not an independent movement command.",
    });
  }
  return Object.freeze({
    status: "none" as const,
    message: "No current movement target is available. Simple Farmer itself does not navigate.",
  });
}

function action(
  key: ExplainabilityNextAction["key"],
  label: string,
  reason: string,
): ExplainabilityNextAction {
  return Object.freeze({ key, label, reason });
}

function percent(current: number | undefined, maximum: number | undefined): number | undefined {
  return finite(current) !== undefined && finite(maximum) !== undefined && maximum! > 0
    ? current! / maximum! * 100
    : undefined;
}

function pointDistance(
  ax: number | undefined,
  ay: number | undefined,
  bx: number | undefined,
  by: number | undefined,
): number | undefined {
  if ([ax, ay, bx, by].some((value) => finite(value) === undefined)) return undefined;
  return Math.hypot(bx! - ax!, by! - ay!);
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundOne(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 10) / 10;
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "?" : String(roundOne(value));
}
