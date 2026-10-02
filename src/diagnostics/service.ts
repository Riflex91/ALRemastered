import type { HealthSnapshot } from "../core/app.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";

export type ComponentHealthStatus = "healthy" | "degraded" | "unavailable";

export interface ComponentHealth {
  readonly name: string;
  readonly status: ComponentHealthStatus;
  readonly message: string;
}

export interface DiagnosticError {
  readonly id: number;
  readonly timestamp: string;
  readonly level: "ERROR" | "FATAL";
  readonly component: string;
  readonly summary: string;
  readonly technical: {
    readonly message: string;
    readonly error?: LogRecord["error"];
    readonly context?: unknown;
  };
}

export interface DiagnosticSnapshot {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly application: "ALRemastered";
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly nodeVersion: string;
  readonly core: HealthSnapshot;
  readonly components: readonly ComponentHealth[];
  readonly recentErrors: readonly DiagnosticError[];
  readonly sanitized: true;
}

type HealthProvider = () => ComponentHealth;

export class DiagnosticsService {
  readonly #logger: Logger;
  readonly #coreHealth: () => HealthSnapshot;
  readonly #providers = new Map<string, HealthProvider>();
  readonly #clock: () => Date;
  readonly #maxErrors: number;
  readonly #errors: DiagnosticError[] = [];
  readonly #unsubscribe: () => void;

  constructor(
    logger: Logger,
    coreHealth: () => HealthSnapshot,
    options: { clock?: () => Date; maxErrors?: number } = {},
  ) {
    this.#logger = logger;
    this.#coreHealth = coreHealth;
    this.#clock = options.clock ?? (() => new Date());
    this.#maxErrors = Math.max(1, options.maxErrors ?? 20);

    for (const record of logger.records()) this.#capture(record);
    this.#unsubscribe = logger.subscribe((record) => this.#capture(record));
  }

  registerComponent(name: string, provider: HealthProvider): void {
    this.#providers.set(name, provider);
  }

  dispose(): void {
    this.#unsubscribe();
  }

  componentHealth(): readonly ComponentHealth[] {
    return [...this.#providers.entries()]
      .map(([name, provider]) => {
        try {
          const health = provider();
          return Object.freeze({
            name,
            status: health.status,
            message: health.message,
          });
        } catch {
          return Object.freeze({
            name,
            status: "unavailable" as const,
            message: "Health information is unavailable.",
          });
        }
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  recentErrors(): readonly DiagnosticError[] {
    return this.#errors.map((error) => structuredClone(error));
  }

  snapshot(): DiagnosticSnapshot {
    const core = this.#coreHealth();
    return Object.freeze({
      schemaVersion: 1,
      generatedAt: this.#clock().toISOString(),
      application: "ALRemastered",
      version: core.version,
      platform: core.platform,
      nodeVersion: process.version,
      core,
      components: this.componentHealth(),
      recentErrors: this.recentErrors(),
      sanitized: true,
    });
  }

  package(): {
    readonly fileName: string;
    readonly content: string;
    readonly sanitized: true;
  } {
    const snapshot = this.snapshot();
    const payload = {
      schemaVersion: 1,
      kind: "ALRemasteredDiagnosticPackage",
      generatedAt: snapshot.generatedAt,
      sanitized: true,
      snapshot,
      logs: this.#logger.records(),
    };

    const stamp = snapshot.generatedAt.replace(/[:.]/g, "-");
    return {
      fileName: `ALRemastered-diagnostics-${stamp}.json`,
      content: `${JSON.stringify(payload, null, 2)}\n`,
      sanitized: true,
    };
  }

  #capture(record: LogRecord): void {
    if (record.level !== "ERROR" && record.level !== "FATAL") return;

    const error: DiagnosticError = Object.freeze({
      id: record.id,
      timestamp: record.timestamp,
      level: record.level,
      component: record.component,
      summary: friendlySummary(record),
      technical: {
        message: record.message,
        error: record.error,
        context: record.context,
      },
    });

    this.#errors.push(error);
    if (this.#errors.length > this.#maxErrors) {
      this.#errors.splice(0, this.#errors.length - this.#maxErrors);
    }
  }
}

function friendlySummary(record: LogRecord): string {
  const message = record.message.toLowerCase();

  if (message.includes("adventure land game data load failed")) {
    return "ALRemastered could not load the Adventure Land game data. Previously loaded data remains available when possible.";
  }
  if (message.includes("adventure land version check failed")) {
    return "ALRemastered could not verify the Adventure Land game version online. The last stored version remains available.";
  }
  if (message.includes("update check failed")) {
    return "ALRemastered could not check for updates. You can keep using the current version and try again later.";
  }
  if (message.includes("update installation preparation failed")) {
    return "The update could not be prepared. Your current installation was not changed.";
  }
  if (message.includes("dashboard request failed")) {
    return "A dashboard request failed. Refresh the page and try again.";
  }
  if (message.includes("dashboard server failed")) {
    return "The local dashboard encountered a problem. Restart ALRemastered if the dashboard is unavailable.";
  }
  if (message.includes("uncaught exception") || message.includes("unhandled promise rejection")) {
    return "ALRemastered encountered an unexpected internal error. Technical details are available below.";
  }

  return `ALRemastered reported an error in ${record.component}. Open technical details for more information.`;
}
