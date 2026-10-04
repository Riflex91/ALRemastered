import type { AdventureLandAccountService } from "../account/service.ts";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { CharacterCardsService, CharacterCardState } from "./character-cards.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";
import type {
  SimpleFarmerConfig,
  SimpleFarmerTemplateService,
} from "../script/simple-farmer.ts";
import type { Logger } from "../logging/logger.ts";

export type SetupWizardTaskTemplateId =
  | "connect-only"
  | "simple-farmer"
  | "custom-script";

export interface SetupWizardTaskTemplate {
  readonly id: SetupWizardTaskTemplateId;
  readonly label: string;
  readonly description: string;
  readonly requiresPrimary: boolean;
}

export interface SetupWizardStep {
  readonly number: 1 | 2 | 3 | 4 | 5 | 6;
  readonly id: "account" | "character" | "server" | "task-template" | "configuration" | "start";
  readonly label: string;
}

export interface SetupWizardState {
  readonly status: "ready" | "blocked";
  readonly message: string;
  readonly accountConnected: boolean;
  readonly accountUserId?: string;
  readonly selectionReady: boolean;
  readonly selectedServerKey?: string;
  readonly characters: readonly Readonly<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly level: number;
    readonly online: boolean;
  }>[];
  readonly servers: readonly Readonly<{
    readonly key: string;
    readonly name: string;
    readonly region: string;
    readonly players: number;
  }>[];
  readonly taskTemplates: readonly SetupWizardTaskTemplate[];
  readonly steps: readonly SetupWizardStep[];
}

export interface SetupWizardStartInput {
  readonly characterId: string;
  readonly serverKey: string;
  readonly taskTemplateId: SetupWizardTaskTemplateId;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export interface SetupWizardStartResult {
  readonly status: "started";
  readonly characterId: string;
  readonly characterName: string;
  readonly serverKey: string;
  readonly sessionRole: "primary" | "managed";
  readonly taskTemplateId: SetupWizardTaskTemplateId;
  readonly startedSession: boolean;
  readonly taskStarted: boolean;
  readonly message: string;
  readonly card: CharacterCardState;
}

export interface SetupWizardServiceOptions {
  readonly logger: Logger;
  readonly account: Pick<AdventureLandAccountService, "state">;
  readonly selection: Pick<AdventureLandSelectionService, "state" | "selectServer">;
  readonly cards: Pick<CharacterCardsService, "state" | "start" | "stop">;
  readonly farmer: Pick<SimpleFarmerTemplateService, "options" | "start" | "stop">;
  readonly runtime: Pick<ScriptRuntimeService, "state" | "load" | "start" | "stop">;
}

const STEPS: readonly SetupWizardStep[] = Object.freeze([
  Object.freeze({ number: 1, id: "account", label: "Account" }),
  Object.freeze({ number: 2, id: "character", label: "Character" }),
  Object.freeze({ number: 3, id: "server", label: "Server" }),
  Object.freeze({ number: 4, id: "task-template", label: "Task / Template" }),
  Object.freeze({ number: 5, id: "configuration", label: "Configuration" }),
  Object.freeze({ number: 6, id: "start", label: "Start" }),
]);

const TASKS: readonly SetupWizardTaskTemplate[] = Object.freeze([
  Object.freeze({
    id: "connect-only",
    label: "Connect only",
    description: "Start the selected Character session without starting automation.",
    requiresPrimary: false,
  }),
  Object.freeze({
    id: "simple-farmer",
    label: "Simple Farmer Template",
    description: "Use the existing no-code Simple Farmer on the primary Character.",
    requiresPrimary: true,
  }),
  Object.freeze({
    id: "custom-script",
    label: "Custom Script",
    description: "Load and start an existing isolated Script runtime on the primary Character.",
    requiresPrimary: true,
  }),
]);

export class SetupWizardService {
  readonly #logger: Logger;
  readonly #account: SetupWizardServiceOptions["account"];
  readonly #selection: SetupWizardServiceOptions["selection"];
  readonly #cards: SetupWizardServiceOptions["cards"];
  readonly #farmer: SetupWizardServiceOptions["farmer"];
  readonly #runtime: SetupWizardServiceOptions["runtime"];

  constructor(options: SetupWizardServiceOptions) {
    this.#logger = options.logger;
    this.#account = options.account;
    this.#selection = options.selection;
    this.#cards = options.cards;
    this.#farmer = options.farmer;
    this.#runtime = options.runtime;
  }

  state(): SetupWizardState {
    const account = this.#account.state();
    const selection = this.#selection.state();
    const accountConnected = account.status === "connected";
    const selectionReady = selection.status === "ready";
    return structuredClone(Object.freeze({
      status: accountConnected && selectionReady ? "ready" as const : "blocked" as const,
      message: !accountConnected
        ? "Connect your Adventure Land account to begin the Setup Wizard."
        : !selectionReady
          ? "Characters and servers are still unavailable."
          : "Setup Wizard is ready. Complete Account, Character, Server, Task / Template, Configuration, then Start.",
      accountConnected,
      accountUserId: account.userId,
      selectionReady,
      selectedServerKey: selection.selectedServerKey,
      characters: Object.freeze(selection.characters.map((character) => Object.freeze({
        id: character.id,
        name: character.name,
        type: character.type,
        level: character.level,
        online: character.online,
      }))),
      servers: Object.freeze(selection.servers.map((server) => Object.freeze({
        key: server.key,
        name: server.name,
        region: server.region,
        players: server.players,
      }))),
      taskTemplates: TASKS,
      steps: STEPS,
    }));
  }

  async start(input: SetupWizardStartInput): Promise<SetupWizardStartResult> {
    const account = this.#account.state();
    if (account.status !== "connected") {
      throw new Error("Connect your Adventure Land account before using Start.");
    }
    const selection = this.#selection.state();
    if (selection.status !== "ready") {
      throw new Error("Load Characters and servers before using Start.");
    }

    const characterId = requireText(input.characterId, "Character selection is required.");
    const serverKey = requireText(input.serverKey, "Server selection is required.");
    const taskTemplateId = requireTask(input.taskTemplateId);
    const character = selection.characters.find((item) => item.id === characterId);
    if (!character) throw new Error("The selected Character is not available.");
    const server = selection.servers.find((item) => item.key === serverKey);
    if (!server) throw new Error("The selected server is not available.");

    const beforeCards = this.#cards.state();
    const beforeCard = beforeCards.cards.find((item) => item.characterId === characterId);
    const wasActive = Boolean(beforeCard?.sessionRole && beforeCard.connectionStatus !== "offline");
    if (wasActive && beforeCard?.serverKey && beforeCard.serverKey !== serverKey) {
      throw new Error("The selected Character is already active on a different server.");
    }

    const runtimeBefore = this.#runtime.state();
    if (
      taskTemplateId !== "connect-only" &&
      (runtimeBefore.status === "running" || runtimeBefore.status === "paused")
    ) {
      throw new Error("Stop the current primary Script before starting a Wizard task or template.");
    }

    let startedSession = false;
    this.#selection.selectServer(serverKey);
    try {
      let cards = this.#cards.state();
      let card = cards.cards.find((item) => item.characterId === characterId);
      if (!wasActive) {
        cards = await this.#cards.start(characterId);
        startedSession = true;
        card = cards.cards.find((item) => item.characterId === characterId);
      }
      if (!card || card.connectionStatus !== "connected" || !card.sessionRole) {
        throw new Error("The selected Character did not reach a connected local session.");
      }

      let taskStarted = false;
      if (taskTemplateId === "simple-farmer") {
        requirePrimary(card);
        const configuration = normalizeFarmerConfiguration(input.configuration);
        const options = this.#farmer.options();
        const monster = configuration.monster || options.monsters[0];
        if (!monster) {
          throw new Error(
            "Simple Farmer needs a visible monster. Leave Monster blank to use the first visible type at Start.",
          );
        }
        const config: SimpleFarmerConfig = {
          monster,
          hpThresholdPercent: configuration.hpThresholdPercent,
          mpThresholdPercent: configuration.mpThresholdPercent,
          loot: configuration.loot,
          respawn: configuration.respawn,
        };
        await this.#farmer.start(config);
        taskStarted = true;
      } else if (taskTemplateId === "custom-script") {
        requirePrimary(card);
        const configuration = normalizeScriptConfiguration(input.configuration);
        await this.#runtime.load({
          name: configuration.scriptName,
          source: configuration.scriptSource,
        });
        const started = await this.#runtime.start();
        if (started.status !== "running") {
          throw new Error("The custom Script did not reach running state.");
        }
        taskStarted = true;
      }

      const finalCard = this.#cards.state().cards.find((item) => item.characterId === characterId);
      if (!finalCard?.sessionRole) throw new Error("The selected Character Card disappeared after Start.");
      const result: SetupWizardStartResult = Object.freeze({
        status: "started",
        characterId,
        characterName: character.name,
        serverKey,
        sessionRole: finalCard.sessionRole,
        taskTemplateId,
        startedSession,
        taskStarted,
        message: taskTemplateId === "connect-only"
          ? `Setup complete. ${character.name} is connected on ${server.region} ${server.name}.`
          : taskTemplateId === "simple-farmer"
            ? `Setup complete. ${character.name} is connected and Simple Farmer is running.`
            : `Setup complete. ${character.name} is connected and the custom Script is running.`,
        card: finalCard,
      });
      this.#logger.info("Setup Wizard Start completed.", {
        characterId,
        serverKey,
        taskTemplateId,
        sessionRole: finalCard.sessionRole,
        startedSession,
        taskStarted,
        gameplayMutation: taskTemplateId === "simple-farmer",
        rawSocketAccess: false,
      });
      return structuredClone(result);
    } catch (error) {
      if (startedSession) {
        try {
          await this.#cards.stop(characterId);
        } catch (rollbackError) {
          this.#logger.warn("Setup Wizard could not roll back its Character session.", {
            characterId,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      throw error;
    }
  }
}

function requirePrimary(card: CharacterCardState): void {
  if (card.sessionRole !== "primary") {
    throw new Error(
      "Simple Farmer and Custom Script are available only when the selected Character is the primary session.",
    );
  }
}

function requireTask(value: string): SetupWizardTaskTemplateId {
  if (value === "connect-only" || value === "simple-farmer" || value === "custom-script") {
    return value;
  }
  throw new Error("Choose a supported Task / Template.");
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function normalizeFarmerConfiguration(input: Readonly<Record<string, unknown>> | undefined): {
  readonly monster: string;
  readonly hpThresholdPercent: number;
  readonly mpThresholdPercent: number;
  readonly loot: boolean;
  readonly respawn: boolean;
} {
  const source = input ?? {};
  const monster = typeof source.monster === "string" ? source.monster.trim() : "";
  const hp = source.hpThresholdPercent ?? 50;
  const mp = source.mpThresholdPercent ?? 30;
  const loot = source.loot ?? true;
  const respawn = source.respawn ?? true;
  if (!Number.isInteger(hp) || Number(hp) < 1 || Number(hp) > 99) {
    throw new Error("HP threshold must be an integer from 1 to 99 percent.");
  }
  if (!Number.isInteger(mp) || Number(mp) < 1 || Number(mp) > 99) {
    throw new Error("MP threshold must be an integer from 1 to 99 percent.");
  }
  if (typeof loot !== "boolean" || typeof respawn !== "boolean") {
    throw new Error("Loot and Respawn must be enabled or disabled.");
  }
  return {
    monster,
    hpThresholdPercent: Number(hp),
    mpThresholdPercent: Number(mp),
    loot,
    respawn,
  };
}

function normalizeScriptConfiguration(input: Readonly<Record<string, unknown>> | undefined): {
  readonly scriptName: string;
  readonly scriptSource: string;
} {
  const source = input ?? {};
  const scriptName = requireText(source.scriptName, "Custom Script name is required.");
  const scriptSource = requireText(source.scriptSource, "Custom Script source is required.");
  if (scriptName.length > 80) throw new Error("Custom Script name is limited to 80 characters.");
  return { scriptName, scriptSource };
}
