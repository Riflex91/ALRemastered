import type { Logger } from "../logging/logger.ts";
import type { MultiCharacterSessionManager } from "./session-manager.ts";

export interface LocalCharacterMessageEnvelope {
  readonly sequence: number;
  readonly senderName: string;
  readonly receiverName: string;
  readonly message: unknown;
  readonly deliveredAt: string;
}

export interface LocalCharacterMessageResult {
  readonly receivers: readonly string[];
  readonly locals: readonly string[];
}

export interface LocalCharacterMessagingState {
  readonly status: "ready";
  readonly requestCount: number;
  readonly localDeliveryCount: number;
  readonly unavailableRecipientCount: number;
  readonly listenerCount: number;
  readonly localOnly: true;
  readonly rawSocketAccess: false;
  readonly lastDelivery?: Readonly<{
    readonly sequence: number;
    readonly senderName: string;
    readonly receiverName: string;
    readonly deliveredAt: string;
  }>;
  readonly message: string;
}

export interface LocalCharacterMessagingOptions {
  readonly logger: Logger;
  readonly sessions: Pick<MultiCharacterSessionManager, "state">;
  readonly now?: () => Date;
}

export class LocalCharacterMessagingError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "LocalCharacterMessagingError";
    this.code = code;
  }
}

type MessageListener = (message: LocalCharacterMessageEnvelope) => void;

export class LocalCharacterMessagingService {
  readonly #logger: Logger;
  readonly #sessions: LocalCharacterMessagingOptions["sessions"];
  readonly #now: () => Date;
  readonly #listeners = new Set<MessageListener>();
  #requestCount = 0;
  #localDeliveryCount = 0;
  #unavailableRecipientCount = 0;
  #sequence = 0;
  #lastDelivery?: LocalCharacterMessagingState["lastDelivery"];

  constructor(options: LocalCharacterMessagingOptions) {
    this.#logger = options.logger;
    this.#sessions = options.sessions;
    this.#now = options.now ?? (() => new Date());
  }

  state(): LocalCharacterMessagingState {
    return structuredClone(Object.freeze({
      status: "ready" as const,
      requestCount: this.#requestCount,
      localDeliveryCount: this.#localDeliveryCount,
      unavailableRecipientCount: this.#unavailableRecipientCount,
      listenerCount: this.#listeners.size,
      localOnly: true as const,
      rawSocketAccess: false as const,
      lastDelivery: this.#lastDelivery,
      message:
        `Local Character messaging ready. ${this.#localDeliveryCount} local deliveries from ${this.#requestCount} send_cm request(s).`,
    }));
  }

  onMessage(listener: MessageListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async send(
    senderName: string,
    recipients: string | readonly string[],
    message: unknown,
  ): Promise<LocalCharacterMessageResult> {
    const sender = normalizeName(senderName);
    if (!sender) {
      throw new LocalCharacterMessagingError(
        "send_cm() requires an active local sender Character.",
        "CM_SENDER_REQUIRED",
      );
    }

    const activeNames = this.#activeCharacterNames();
    if (!activeNames.has(sender)) {
      throw new LocalCharacterMessagingError(
        "send_cm() sender is not an active local Character session.",
        "CM_SENDER_NOT_ACTIVE",
      );
    }

    const targets = normalizeRecipients(recipients);
    if (targets.length === 0) {
      throw new LocalCharacterMessagingError(
        "send_cm() requires one Character name or an array of Character names.",
        "CM_TARGET_REQUIRED",
      );
    }

    const safeMessage = cloneJsonMessage(message);
    this.#requestCount += 1;
    const receivers: string[] = [];

    for (const receiverName of targets) {
      if (!activeNames.has(receiverName)) {
        this.#unavailableRecipientCount += 1;
        continue;
      }

      const sequence = ++this.#sequence;
      const deliveredAt = this.#now().toISOString();
      const envelope: LocalCharacterMessageEnvelope = Object.freeze({
        sequence,
        senderName: sender,
        receiverName,
        message: structuredClone(safeMessage),
        deliveredAt,
      });
      this.#localDeliveryCount += 1;
      this.#lastDelivery = Object.freeze({
        sequence,
        senderName: sender,
        receiverName,
        deliveredAt,
      });
      receivers.push(receiverName);

      for (const listener of [...this.#listeners]) {
        try {
          listener(structuredClone(envelope));
        } catch (error) {
          this.#logger.warn("Local Character message listener failed independently.", {
            senderName: sender,
            receiverName,
            sequence,
            error: error instanceof Error ? error.message : String(error),
            gameplayMutation: false,
            rawSocketAccess: false,
          });
        }
      }

      this.#logger.debug("Local Character message delivered.", {
        senderName: sender,
        receiverName,
        sequence,
        payloadBytes: Buffer.byteLength(JSON.stringify(safeMessage), "utf8"),
        gameplayMutation: false,
        rawSocketAccess: false,
      });
    }

    const result = Object.freeze({
      receivers: Object.freeze([...receivers]),
      locals: Object.freeze([...receivers]),
    });
    this.#logger.info("send_cm() local delivery completed.", {
      senderName: sender,
      requestedRecipients: targets.length,
      localRecipients: result.locals,
      unavailableRecipients: targets.length - result.locals.length,
      localOnly: true,
      gameplayMutation: false,
      rawSocketAccess: false,
    });
    return structuredClone(result);
  }

  #activeCharacterNames(): Set<string> {
    return new Set(
      this.#sessions.state().sessions
        .filter((session) => session.status === "connected")
        .map((session) => normalizeName(session.characterName))
        .filter((name): name is string => Boolean(name)),
    );
  }
}

function normalizeName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name || undefined;
}

function normalizeRecipients(
  recipients: string | readonly string[],
): string[] {
  const values = Array.isArray(recipients) ? recipients : [recipients];
  const unique = new Set<string>();
  for (const value of values) {
    const name = normalizeName(value);
    if (name) unique.add(name);
  }
  return [...unique];
}

function cloneJsonMessage(value: unknown): unknown {
  if (value === undefined) {
    throw new LocalCharacterMessagingError(
      "send_cm() data must be JSON-serializable.",
      "CM_PAYLOAD_INVALID",
    );
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = undefined;
  }
  if (serialized === undefined) {
    throw new LocalCharacterMessagingError(
      "send_cm() data must be JSON-serializable.",
      "CM_PAYLOAD_INVALID",
    );
  }
  try {
    return JSON.parse(serialized);
  } catch {
    throw new LocalCharacterMessagingError(
      "send_cm() data must be JSON-serializable.",
      "CM_PAYLOAD_INVALID",
    );
  }
}
