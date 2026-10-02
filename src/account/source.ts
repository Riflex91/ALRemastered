export interface AdventureLandAccountCredentials {
  readonly email: string;
  readonly password: string;
}

export interface AdventureLandAccountSession {
  readonly userId: string;
  readonly auth: string;
  readonly language?: string;
}

export class AdventureLandAccountError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AdventureLandAccountError";
    this.code = code;
  }
}

export const ADVENTURE_LAND_ACCOUNT_LOGIN_URL =
  "https://adventure.land/api/signup_or_login";

export class AdventureLandAccountSource {
  readonly #fetch: typeof fetch;
  readonly #loginUrl: string;

  constructor(
    fetchImpl: typeof fetch = fetch,
    loginUrl = ADVENTURE_LAND_ACCOUNT_LOGIN_URL,
  ) {
    this.#fetch = fetchImpl;
    this.#loginUrl = loginUrl;
  }

  async login(
    credentials: AdventureLandAccountCredentials,
  ): Promise<AdventureLandAccountSession> {
    let response: Response;
    try {
      response = await this.#fetch(this.#loginUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "ALRemastered",
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          only_login: true,
          mobile: true,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AdventureLandAccountError(
        "Could not reach Adventure Land. Check your internet connection and try again.",
        "network_error",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AdventureLandAccountError(
        "Adventure Land returned an invalid login response.",
        "invalid_response",
      );
    }

    if (!response.ok) {
      throw new AdventureLandAccountError(
        "Adventure Land login request failed with HTTP " + response.status + ".",
        "http_error",
      );
    }

    if (!isRecord(payload)) {
      throw new AdventureLandAccountError(
        "Adventure Land returned an invalid login response.",
        "invalid_response",
      );
    }

    if (payload.failed === true) {
      const reason = typeof payload.reason === "string" ? payload.reason : "login_failed";
      throw new AdventureLandAccountError(loginFailureMessage(reason), reason);
    }

    if (
      payload.success !== true ||
      typeof payload.user !== "string" ||
      payload.user.length === 0 ||
      typeof payload.auth !== "string" ||
      payload.auth.length === 0
    ) {
      throw new AdventureLandAccountError(
        "Adventure Land returned an incomplete login response.",
        "invalid_response",
      );
    }

    return Object.freeze({
      userId: payload.user,
      auth: payload.auth,
      language: typeof payload.language === "string" ? payload.language : undefined,
    });
  }
}

function loginFailureMessage(reason: string): string {
  switch (reason) {
    case "wrong_password":
    case "email_not_found":
    case "login_failed":
      return "Adventure Land rejected the email or password.";
    case "cant_login_inside_bank":
      return "Adventure Land rejected the login while the account is active in the bank.";
    case "timeout":
      return "Adventure Land login timed out. Please try again.";
    case "network_error":
      return "Could not reach Adventure Land. Check your internet connection and try again.";
    default:
      return "Adventure Land rejected the login request (" + reason + ").";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
