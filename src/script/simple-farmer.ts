import type { AdventureLandCharacterService } from "../character/service.ts";
import type { ScriptRuntimeService, ScriptRuntimeState } from "./runtime.ts";

export interface SimpleFarmerConfig {
  readonly monster: string;
  readonly hpThresholdPercent: number;
  readonly mpThresholdPercent: number;
  readonly loot: boolean;
  readonly respawn: boolean;
}

export interface SimpleFarmerOptions {
  readonly status: "ready" | "unavailable";
  readonly message: string;
  readonly monsters: readonly string[];
  readonly defaults: {
    readonly hpThresholdPercent: 50;
    readonly mpThresholdPercent: 30;
    readonly loot: true;
    readonly respawn: true;
  };
}

export interface SimpleFarmerState {
  readonly status: "idle" | "running" | "stopped" | "error";
  readonly message: string;
  readonly config?: SimpleFarmerConfig;
  readonly scriptRuntime?: ScriptRuntimeState;
}

export interface SimpleFarmerTemplateServiceOptions {
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly runtime: Pick<ScriptRuntimeService, "state" | "load" | "start" | "stop">;
}

const SCRIPT_NAME = "simple-farmer-template";

export class SimpleFarmerTemplateService {
  readonly #character: Pick<AdventureLandCharacterService, "state">;
  readonly #runtime: Pick<ScriptRuntimeService, "state" | "load" | "start" | "stop">;
  #config?: SimpleFarmerConfig;
  #status: SimpleFarmerState["status"] = "idle";
  #message = "Simple Farmer Template is ready.";

  constructor(options: SimpleFarmerTemplateServiceOptions) {
    this.#character = options.character;
    this.#runtime = options.runtime;
  }

  options(): SimpleFarmerOptions {
    const state = this.#character.state();
    const monsters = [...new Set(
      (state.entities ?? [])
        .filter((entity) => entity.kind === "monster" && entity.type)
        .map((entity) => entity.type),
    )].sort();
    return Object.freeze({
      status: state.status === "connected" ? "ready" : "unavailable",
      message: state.status === "connected"
        ? "Choose one currently visible monster type. Navigation is intentionally not part of Slice 4.5."
        : "Connect a headless character to configure the Simple Farmer Template.",
      monsters: Object.freeze(monsters),
      defaults: Object.freeze({
        hpThresholdPercent: 50 as const,
        mpThresholdPercent: 30 as const,
        loot: true as const,
        respawn: true as const,
      }),
    });
  }

  state(): SimpleFarmerState {
    const runtime = this.#runtime.state();
    const ownsRuntime = runtime.scriptName === SCRIPT_NAME;
    return Object.freeze({
      status: ownsRuntime && runtime.status === "running"
        ? "running"
        : this.#status,
      message: this.#message,
      config: this.#config ? Object.freeze({ ...this.#config }) : undefined,
      scriptRuntime: ownsRuntime ? runtime : undefined,
    });
  }

  async start(input: SimpleFarmerConfig): Promise<SimpleFarmerState> {
    const config = validateSimpleFarmerConfig(input);
    const character = this.#character.state();
    if (character.status !== "connected" || !character.character) {
      throw new Error("Connect a headless character before starting the Simple Farmer Template.");
    }
    const visibleTypes = new Set(
      (character.entities ?? [])
        .filter((entity) => entity.kind === "monster")
        .map((entity) => entity.type),
    );
    if (!visibleTypes.has(config.monster)) {
      throw new Error("Select a currently visible monster type before starting the Simple Farmer Template.");
    }

    const runtime = this.#runtime.state();
    if (runtime.status === "running" && runtime.scriptName !== SCRIPT_NAME) {
      throw new Error("Another isolated script is already running.");
    }
    if (runtime.status === "running") await this.#runtime.stop();

    await this.#runtime.load({
      name: SCRIPT_NAME,
      source: createSimpleFarmerSource(config),
    });
    const started = await this.#runtime.start();
    if (started.status !== "running") {
      this.#status = "error";
      this.#message = "Simple Farmer Template could not start its isolated worker.";
      throw new Error(this.#message);
    }
    this.#config = config;
    this.#status = "running";
    this.#message =
      `Simple Farmer is running for ${config.monster}. It only attacks currently visible in-range targets.`;
    return this.state();
  }

  async stop(): Promise<SimpleFarmerState> {
    const runtime = this.#runtime.state();
    if (runtime.scriptName === SCRIPT_NAME) await this.#runtime.stop();
    this.#status = "stopped";
    this.#message = "Simple Farmer Template stopped.";
    return this.state();
  }
}

export function validateSimpleFarmerConfig(input: SimpleFarmerConfig): SimpleFarmerConfig {
  const monster = typeof input.monster === "string" ? input.monster.trim() : "";
  if (!monster || monster.length > 120 || /[\u0000-\u001f\u007f]/.test(monster)) {
    throw new Error("Monster must be a safe non-empty monster type.");
  }
  for (const [label, value] of [
    ["HP", input.hpThresholdPercent],
    ["MP", input.mpThresholdPercent],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 99) {
      throw new Error(`${label} threshold must be an integer from 1 to 99 percent.`);
    }
  }
  if (typeof input.loot !== "boolean" || typeof input.respawn !== "boolean") {
    throw new Error("Loot and respawn settings must be boolean values.");
  }
  return Object.freeze({
    monster,
    hpThresholdPercent: input.hpThresholdPercent,
    mpThresholdPercent: input.mpThresholdPercent,
    loot: input.loot,
    respawn: input.respawn,
  });
}

export function createSimpleFarmerSource(config: SimpleFarmerConfig): string {
  const safe = validateSimpleFarmerConfig(config);
  const monster = JSON.stringify(safe.monster);
  return [
    "let farmerWorking = false;",
    "const farmerDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    "setInterval(async () => {",
    "  if (farmerWorking) return;",
    "  farmerWorking = true;",
    "  try {",
    `    if (character.rip) { ${safe.respawn ? "try { await respawn(); } catch (error) { if (error?.code !== 'RESPAWN_SERVER_REJECTED') throw error; }" : "return;"} return; }`,
    `    if (typeof character.hp === 'number' && typeof character.max_hp === 'number' && character.max_hp > 0 && character.hp / character.max_hp * 100 <= ${safe.hpThresholdPercent}) {`,
    "      try { await use_hp(); } catch (error) { if (!['CONSUMABLE_COOLDOWN','SCRIPT_CONSUMABLE_UNAVAILABLE'].includes(error?.code)) throw error; }",
    "    }",
    `    if (typeof character.mp === 'number' && typeof character.max_mp === 'number' && character.max_mp > 0 && character.mp / character.max_mp * 100 <= ${safe.mpThresholdPercent}) {`,
    "      try { await use_mp(); } catch (error) { if (!['CONSUMABLE_COOLDOWN','SCRIPT_CONSUMABLE_UNAVAILABLE'].includes(error?.code)) throw error; }",
    "    }",
    safe.loot
      ? "    try { await loot(); } catch (error) { if (error?.code !== 'SCRIPT_LOOT_CHEST_UNAVAILABLE') throw error; }"
      : "    // Loot disabled by template configuration.",
    `    const target = get_nearest_monster({ type: ${monster} });`,
    "    if (!target || !can_attack(target)) return;",
    "    try { await attack(target); } catch (error) {",
    "      if (!['ATTACK_COOLDOWN','ATTACK_TARGET_DEAD','ATTACK_TARGET_NOT_VISIBLE','ATTACK_OUT_OF_RANGE','ATTACK_TARGET_WRONG_MAP'].includes(error?.code)) throw error;",
    "    }",
    "    await farmerDelay(25);",
    "  } finally {",
    "    farmerWorking = false;",
    "  }",
    "}, 250);",
  ].join("\n");
}
