import type { Logger } from "../logging/logger.ts";
import {
  type SimpleFarmerConfig,
  type SimpleFarmerTemplateService,
  validateSimpleFarmerConfig,
} from "../script/simple-farmer.ts";

export type TemplateConfigValue = string | number | boolean;

export interface TemplateConfigFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface TemplateConfigField {
  readonly key: keyof SimpleFarmerConfig;
  readonly label: string;
  readonly type: "select" | "number" | "boolean";
  readonly description: string;
  readonly required: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly TemplateConfigFieldOption[];
}

export interface TemplateConfigTemplateState {
  readonly id: "simple-farmer";
  readonly label: "Simple Farmer Template";
  readonly description: string;
  readonly status: "ready" | "unavailable";
  readonly configured: boolean;
  readonly fields: readonly TemplateConfigField[];
  readonly values: Readonly<Record<keyof SimpleFarmerConfig, TemplateConfigValue>>;
  readonly runtimeStatus: string;
  readonly message: string;
}

export interface TemplateConfigurationState {
  readonly status: "ready" | "unavailable";
  readonly selectedTemplateId: "simple-farmer";
  readonly templates: readonly TemplateConfigTemplateState[];
  readonly normalSettingsRequireCodeChanges: false;
  readonly gameplayMutation: false;
  readonly rawSocketAccess: false;
  readonly message: string;
}

export interface TemplateConfigurationServiceOptions {
  readonly logger: Logger;
  readonly farmer: Pick<SimpleFarmerTemplateService, "options" | "state" | "start" | "stop">;
}

export class TemplateConfigurationService {
  readonly #logger: Logger;
  readonly #farmer: TemplateConfigurationServiceOptions["farmer"];
  #draft?: SimpleFarmerConfig;

  constructor(options: TemplateConfigurationServiceOptions) {
    this.#logger = options.logger;
    this.#farmer = options.farmer;
  }

  state(): TemplateConfigurationState {
    const options = this.#farmer.options();
    const farmer = this.#farmer.state();
    const defaultValues = this.#defaultValues();
    const values = this.#draft ?? farmer.config ?? defaultValues;
    const ready = options.status === "ready" && options.monsters.length > 0;
    const template: TemplateConfigTemplateState = Object.freeze({
      id: "simple-farmer" as const,
      label: "Simple Farmer Template" as const,
      description:
        "Configure the existing Simple Farmer Template without editing JavaScript source.",
      status: ready ? "ready" as const : "unavailable" as const,
      configured: Boolean(this.#draft),
      fields: Object.freeze(this.#fields()),
      values: Object.freeze({ ...values }),
      runtimeStatus: farmer.status,
      message: ready
        ? "Normal Simple Farmer settings can be changed from the dashboard without code changes."
        : options.message,
    });
    return structuredClone(Object.freeze({
      status: ready ? "ready" as const : "unavailable" as const,
      selectedTemplateId: "simple-farmer" as const,
      templates: Object.freeze([template]),
      normalSettingsRequireCodeChanges: false as const,
      gameplayMutation: false as const,
      rawSocketAccess: false as const,
      message: template.message,
    }));
  }

  save(
    templateId: string,
    values: Readonly<Record<string, unknown>>,
  ): TemplateConfigurationState {
    this.#requireTemplate(templateId);
    const config = validateSimpleFarmerConfig({
      monster: typeof values.monster === "string" ? values.monster : "",
      hpThresholdPercent: values.hpThresholdPercent as number,
      mpThresholdPercent: values.mpThresholdPercent as number,
      loot: values.loot as boolean,
      respawn: values.respawn as boolean,
    });
    const options = this.#farmer.options();
    if (!options.monsters.includes(config.monster)) {
      throw new Error("Monster must be one of the currently visible monster types.");
    }
    this.#draft = Object.freeze({ ...config });
    this.#logger.info("Template Configuration settings saved.", {
      templateId,
      monster: config.monster,
      hpThresholdPercent: config.hpThresholdPercent,
      mpThresholdPercent: config.mpThresholdPercent,
      loot: config.loot,
      respawn: config.respawn,
      normalSettingsRequireCodeChanges: false,
      gameplayMutation: false,
      rawSocketAccess: false,
    });
    return this.state();
  }

  reset(templateId: string): TemplateConfigurationState {
    this.#requireTemplate(templateId);
    this.#draft = undefined;
    this.#logger.info("Template Configuration settings reset.", {
      templateId,
      normalSettingsRequireCodeChanges: false,
      gameplayMutation: false,
      rawSocketAccess: false,
    });
    return this.state();
  }

  async start(templateId: string): Promise<TemplateConfigurationState> {
    this.#requireTemplate(templateId);
    const config = this.#draft ?? validateSimpleFarmerConfig(this.#defaultValues());
    await this.#farmer.start(config);
    this.#logger.info("Template Configuration started existing template.", {
      templateId,
      gameplayMutation: true,
      rawSocketAccess: false,
    });
    return this.state();
  }

  async stop(templateId: string): Promise<TemplateConfigurationState> {
    this.#requireTemplate(templateId);
    await this.#farmer.stop();
    this.#logger.info("Template Configuration stopped existing template.", {
      templateId,
      gameplayMutation: false,
      rawSocketAccess: false,
    });
    return this.state();
  }

  snapshotDraft(): SimpleFarmerConfig | undefined {
    return this.#draft ? structuredClone(this.#draft) : undefined;
  }

  restoreDraft(snapshot: SimpleFarmerConfig | undefined): TemplateConfigurationState {
    this.#draft = snapshot ? Object.freeze({ ...snapshot }) : undefined;
    return this.state();
  }

  #fields(): TemplateConfigField[] {
    const options = this.#farmer.options();
    return [
      Object.freeze({
        key: "monster" as const,
        label: "Monster",
        type: "select" as const,
        description: "Currently visible monster type.",
        required: true,
        options: Object.freeze(options.monsters.map((monster) =>
          Object.freeze({ value: monster, label: monster })
        )),
      }),
      Object.freeze({
        key: "hpThresholdPercent" as const,
        label: "HP threshold %",
        type: "number" as const,
        description: "Use an HP consumable below this percentage.",
        required: true,
        min: 1,
        max: 99,
        step: 1,
      }),
      Object.freeze({
        key: "mpThresholdPercent" as const,
        label: "MP threshold %",
        type: "number" as const,
        description: "Use an MP consumable below this percentage.",
        required: true,
        min: 1,
        max: 99,
        step: 1,
      }),
      Object.freeze({
        key: "loot" as const,
        label: "Loot",
        type: "boolean" as const,
        description: "Loot visible chests through the existing validated helper.",
        required: true,
      }),
      Object.freeze({
        key: "respawn" as const,
        label: "Respawn",
        type: "boolean" as const,
        description: "Use the existing validated respawn helper after death.",
        required: true,
      }),
    ];
  }

  #defaultValues(): SimpleFarmerConfig {
    const options = this.#farmer.options();
    return {
      monster: options.monsters[0] ?? "",
      hpThresholdPercent: options.defaults.hpThresholdPercent,
      mpThresholdPercent: options.defaults.mpThresholdPercent,
      loot: options.defaults.loot,
      respawn: options.defaults.respawn,
    };
  }

  #requireTemplate(templateId: string): void {
    if (templateId !== "simple-farmer") {
      throw new Error("Choose a supported configurable template.");
    }
  }
}
