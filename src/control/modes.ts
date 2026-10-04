import type { ActionOrigin } from "../action/gateway.ts";

export type ControlMode = "automatic" | "assist" | "manual";

export interface ControlModeAuthorization {
  readonly allowed: boolean;
  readonly code?: string;
  readonly message?: string;
}

export interface ControlModeState {
  readonly schemaVersion: 1;
  readonly mode: ControlMode;
  readonly label: "Automatic" | "Assist" | "Manual";
  readonly userActionsAllowed: true;
  readonly scriptActionsAllowed: boolean;
  readonly systemActionsAllowed: boolean;
  readonly message: string;
}

export class ControlModeService {
  #mode: ControlMode;

  constructor(initialMode: ControlMode = "automatic") {
    this.#mode = initialMode;
  }

  state(): ControlModeState {
    const mode = this.#mode;
    return Object.freeze({
      schemaVersion: 1 as const,
      mode,
      label: controlModeLabel(mode),
      userActionsAllowed: true as const,
      scriptActionsAllowed: mode === "automatic",
      systemActionsAllowed: mode !== "manual",
      message: controlModeMessage(mode),
    });
  }

  setMode(mode: ControlMode): ControlModeState {
    this.#mode = mode;
    return this.state();
  }

  authorize(origin: ActionOrigin, action: string): ControlModeAuthorization {
    if (origin === "dashboard") return Object.freeze({ allowed: true });

    if (origin === "script" && this.#mode !== "automatic") {
      return Object.freeze({
        allowed: false,
        code: "CONTROL_MODE_SCRIPT_BLOCKED",
        message: this.#mode === "assist"
          ? `Script action "${action}" is blocked in Assist mode; user confirmation is required.`
          : `Script action "${action}" is blocked in Manual mode.`,
      });
    }

    if (origin === "system" && this.#mode === "manual") {
      return Object.freeze({
        allowed: false,
        code: "CONTROL_MODE_SYSTEM_BLOCKED",
        message: `System action "${action}" is blocked in Manual mode.`,
      });
    }

    return Object.freeze({ allowed: true });
  }
}

export function parseControlMode(value: unknown): ControlMode | undefined {
  return value === "automatic" || value === "assist" || value === "manual"
    ? value
    : undefined;
}

function controlModeLabel(mode: ControlMode): ControlModeState["label"] {
  switch (mode) {
    case "automatic": return "Automatic";
    case "assist": return "Assist";
    case "manual": return "Manual";
  }
}

function controlModeMessage(mode: ControlMode): string {
  switch (mode) {
    case "automatic":
      return "Automatic mode allows script, system, and explicit user actions through the Action Gateway.";
    case "assist":
      return "Assist mode keeps system assistance and explicit user actions available while script gameplay mutations require user control.";
    case "manual":
      return "Manual mode allows only explicit user gameplay actions through the Action Gateway.";
  }
}
