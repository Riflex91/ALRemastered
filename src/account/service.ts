import type { Logger } from "../logging/logger.ts";
import {
  AdventureLandAccountError,
  type AdventureLandAccountCredentials,
  type AdventureLandAccountSession,
  type AdventureLandAccountSource,
} from "./source.ts";

export type AdventureLandAccountStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface AdventureLandAccountState {
  readonly status: AdventureLandAccountStatus;
  readonly userId?: string;
  readonly language?: string;
  readonly connectedAt?: string;
  readonly message: string;
  readonly errorCode?: string;
}

export interface AdventureLandAccountServiceOptions {
  readonly logger: Logger;
  readonly source: Pick<AdventureLandAccountSource, "login">;
  readonly now?: () => Date;
}

export class AdventureLandAccountService {
  readonly #logger: Logger;
  readonly #source: Pick<AdventureLandAccountSource, "login">;
  readonly #now: () => Date;
  #state: AdventureLandAccountState;
  #session?: AdventureLandAccountSession;
  #connecting?: Promise<AdventureLandAccountState>;

  constructor(options: AdventureLandAccountServiceOptions) {
    this.#logger = options.logger;
    this.#source = options.source;
    this.#now = options.now ?? (() => new Date());
    this.#state = Object.freeze({
      status: "disconnected",
      message: "No Adventure Land account is connected.",
    });
  }

  state(): AdventureLandAccountState {
    return structuredClone(this.#state);
  }

  session(): AdventureLandAccountSession | undefined {
    return this.#session;
  }

  login(credentials: AdventureLandAccountCredentials): Promise<AdventureLandAccountState> {
    if (this.#connecting) return this.#connecting;
    this.#connecting = this.#performLogin(credentials).finally(() => {
      this.#connecting = undefined;
    });
    return this.#connecting;
  }

  restoreSession(
    session: AdventureLandAccountSession,
    source = "update_handoff",
  ): AdventureLandAccountState {
    const connectedAt = this.#now().toISOString();
    this.#session = Object.freeze({
      userId: session.userId,
      auth: session.auth,
      language: session.language,
    });
    this.#setState({
      status: "connected",
      userId: session.userId,
      language: session.language,
      connectedAt,
      message: "Adventure Land account session restored after update.",
    });
    this.#logger.info("Adventure Land account session restored.", {
      userId: session.userId,
      language: session.language,
      connectedAt,
      source,
      secretPersisted: false,
    });
    return this.state();
  }

  disconnect(): AdventureLandAccountState {
    const previousUserId = this.#state.userId;
    this.#session = undefined;
    this.#setState({
      status: "disconnected",
      message: "Adventure Land account disconnected from this ALRemastered process.",
    });
    this.#logger.info("Adventure Land account disconnected.", {
      userId: previousUserId,
      sessionCleared: true,
    });
    return this.state();
  }

  async #performLogin(
    credentials: AdventureLandAccountCredentials,
  ): Promise<AdventureLandAccountState> {
    const email = credentials.email.trim();
    if (!email || !credentials.password) {
      this.#session = undefined;
      this.#setState({
        status: "error",
        message: "Email and password are required.",
        errorCode: "invalid_credentials",
      });
      return this.state();
    }

    this.#session = undefined;
    this.#setState({
      status: "connecting",
      message: "Connecting to Adventure Land…",
    });
    this.#logger.info("Adventure Land account connection started.");

    try {
      const session = await this.#source.login({
        email,
        password: credentials.password,
      });
      const connectedAt = this.#now().toISOString();
      this.#session = session;
      this.#setState({
        status: "connected",
        userId: session.userId,
        language: session.language,
        connectedAt,
        message: "Adventure Land account is connected.",
      });
      this.#logger.info("Adventure Land account connected.", {
        userId: session.userId,
        language: session.language,
        connectedAt,
      });
      return this.state();
    } catch (error) {
      this.#session = undefined;
      const accountError = error instanceof AdventureLandAccountError
        ? error
        : new AdventureLandAccountError(
            "Adventure Land account connection failed.",
            "unknown_error",
          );
      this.#setState({
        status: "error",
        message: accountError.message,
        errorCode: accountError.code,
      });
      this.#logger.error("Adventure Land account connection failed.", accountError, {
        errorCode: accountError.code,
      });
      return this.state();
    }
  }

  #setState(state: AdventureLandAccountState): void {
    this.#state = Object.freeze(state);
  }
}
