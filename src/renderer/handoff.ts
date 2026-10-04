import type { AdventureLandCharacterConnectionState } from "../character/service.ts";

export type RendererHandoffMode = "headless" | "browser";

export interface RendererHandoffState {
  readonly schemaVersion: 1;
  readonly mode: RendererHandoffMode;
  readonly attachedRenderers: number;
  readonly socketOwnership: "headless-core";
  readonly socketStrategy: "preserve";
  readonly reconnectFallback: "soft-handoff";
  readonly handoffCount: number;
  readonly lastAttachedAt?: string;
  readonly lastDetachedAt?: string;
  readonly lastSocketContinuity?: boolean;
  readonly message: string;
}

export interface RendererHandoffServiceOptions {
  readonly character: () => AdventureLandCharacterConnectionState;
  readonly clock?: () => Date;
}

interface RendererAttachmentBaseline {
  readonly characterId?: string;
  readonly connectedAt?: string;
  readonly reconnectCount?: number;
  readonly lastDisconnectAt?: string;
  readonly lastReconnectAt?: string;
}

export class RendererHandoffService {
  readonly #character: RendererHandoffServiceOptions["character"];
  readonly #clock: () => Date;
  readonly #attachments = new Map<string, RendererAttachmentBaseline>();
  #handoffCount = 0;
  #lastAttachedAt?: string;
  #lastDetachedAt?: string;
  #lastSocketContinuity?: boolean;

  constructor(options: RendererHandoffServiceOptions) {
    this.#character = options.character;
    this.#clock = options.clock ?? (() => new Date());
  }

  state(): RendererHandoffState {
    const attachedRenderers = this.#attachments.size;
    return Object.freeze({
      schemaVersion: 1 as const,
      mode: attachedRenderers > 0 ? "browser" : "headless",
      attachedRenderers,
      socketOwnership: "headless-core" as const,
      socketStrategy: "preserve" as const,
      reconnectFallback: "soft-handoff" as const,
      handoffCount: this.#handoffCount,
      lastAttachedAt: this.#lastAttachedAt,
      lastDetachedAt: this.#lastDetachedAt,
      lastSocketContinuity: this.#lastSocketContinuity,
      message: attachedRenderers > 0
        ? `${attachedRenderers} Browser renderer(s) attached; the headless Character socket remains owned by Core.`
        : "Headless mode active; no Browser renderer is attached.",
    });
  }

  attach(rendererId: string): RendererHandoffState {
    const id = normalizeRendererId(rendererId);
    if (!this.#attachments.has(id)) {
      this.#attachments.set(id, characterBaseline(this.#character()));
      this.#handoffCount += 1;
      this.#lastAttachedAt = this.#clock().toISOString();
    }
    return this.state();
  }

  detach(rendererId: string): RendererHandoffState {
    const id = normalizeRendererId(rendererId);
    const baseline = this.#attachments.get(id);
    if (!baseline) return this.state();

    this.#attachments.delete(id);
    this.#lastDetachedAt = this.#clock().toISOString();
    this.#lastSocketContinuity = sameCharacterConnection(
      baseline,
      characterBaseline(this.#character()),
    );
    return this.state();
  }
}

function normalizeRendererId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 160) {
    throw new Error("Renderer ID must be 1-160 characters.");
  }
  return id;
}

function characterBaseline(
  state: AdventureLandCharacterConnectionState,
): RendererAttachmentBaseline {
  return {
    characterId: state.characterId,
    connectedAt: state.connectedAt,
    reconnectCount: state.reconnectCount,
    lastDisconnectAt: state.lastDisconnectAt,
    lastReconnectAt: state.lastReconnectAt,
  };
}

function sameCharacterConnection(
  before: RendererAttachmentBaseline,
  after: RendererAttachmentBaseline,
): boolean {
  return before.characterId === after.characterId &&
    before.connectedAt === after.connectedAt &&
    before.reconnectCount === after.reconnectCount &&
    before.lastDisconnectAt === after.lastDisconnectAt &&
    before.lastReconnectAt === after.lastReconnectAt;
}
