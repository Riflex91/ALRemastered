import {
  DEFAULT_GRAPHICS_PROFILE,
  graphicsProfileDefinition,
  normalizeGraphicsProfile,
  resolveGraphicsProfileTextureLimit,
} from "/graphics-profiles.js";

const elements = {
  connection: document.querySelector("#browser-view-connection"),
  close: document.querySelector("#close-browser-view"),
  characterName: document.querySelector("#browser-character-name"),
  characterStatus: document.querySelector("#browser-character-status"),
  characterServer: document.querySelector("#browser-character-server"),
  characterMap: document.querySelector("#browser-character-map"),
  characterPosition: document.querySelector("#browser-character-position"),
  characterLevel: document.querySelector("#browser-character-level"),
  characterHp: document.querySelector("#browser-character-hp"),
  characterMp: document.querySelector("#browser-character-mp"),
  characterMessage: document.querySelector("#browser-character-message"),
  bridgeSequence: document.querySelector("#browser-bridge-sequence"),
  snapshotTime: document.querySelector("#browser-snapshot-time"),
  coreStatus: document.querySelector("#browser-core-status"),
  scriptStatus: document.querySelector("#browser-script-status"),
  handoffMode: document.querySelector("#browser-handoff-mode"),
  socketStrategy: document.querySelector("#browser-socket-strategy"),
  hdMode: document.querySelector("#browser-hd-mode"),
  graphicsProfile: document.querySelector("#browser-graphics-profile"),
  graphicsProfileLimit: document.querySelector("#browser-graphics-profile-limit"),
  graphicsGeneration: document.querySelector("#browser-graphics-generation"),
  hdAvailable: document.querySelector("#browser-hd-available"),
  hdApplied: document.querySelector("#browser-hd-applied"),
  hdMissing: document.querySelector("#browser-hd-missing"),
  hdBlocked: document.querySelector("#browser-hd-blocked"),
  hdTextureLimit: document.querySelector("#browser-hd-texture-limit"),
  hdPreviews: document.querySelector("#browser-hd-previews"),
  hdMessage: document.querySelector("#browser-hd-message"),
};

const verificationState = {
  ready: false,
  renderCount: 0,
  transport: "SSE",
  lastCharacterId: null,
  lastCharacterStatus: null,
  lastSequence: null,
  clientId: `browser-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
  handoffAttached: false,
  handoffMode: null,
  alhdReady: false,
  alhdStatus: null,
  graphicsProfile: DEFAULT_GRAPHICS_PROFILE,
  rendererGeneration: 0,
  profileHistory: [],
  setGraphicsProfile: null,
};
globalThis.__alrBrowserViewState = verificationState;

let source;

async function refreshHandoffState() {
  const response = await fetch("/api/renderer/handoff", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Renderer handoff state failed with HTTP ${response.status}.`);
  }
  const handoff = await response.json();
  verificationState.handoffMode = handoff.mode ?? null;
  verificationState.handoffAttached =
    handoff.mode === "browser" && Number(handoff.attachedRenderers ?? 0) > 0;
  elements.handoffMode.textContent = value(handoff.mode, "Unavailable");
  elements.socketStrategy.textContent =
    handoff.socketStrategy === "preserve"
      ? "Preserve headless socket"
      : value(handoff.socketStrategy, "Unavailable");
  return handoff;
}

function detectWebglTextureCapability() {
  let context;
  let contextType = null;
  let contextReleased = false;
  try {
    const canvas = document.createElement("canvas");
    context = canvas.getContext("webgl");
    contextType = context ? "webgl" : null;
    if (!context) {
      context = canvas.getContext("experimental-webgl");
      contextType = context ? "experimental-webgl" : null;
    }
    if (
      !context ||
      typeof context.getParameter !== "function" ||
      typeof context.MAX_TEXTURE_SIZE === "undefined"
    ) {
      return { maxTextureSize: null, contextType, contextReleased };
    }
    const value = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
    try {
      const lose = typeof context.getExtension === "function"
        ? context.getExtension("WEBGL_lose_context")
        : null;
      if (lose && typeof lose.loseContext === "function") {
        lose.loseContext();
        contextReleased = true;
      }
    } catch {
      // Best-effort cleanup only.
    }
    return {
      maxTextureSize: Number.isFinite(value) && value > 0 ? Math.trunc(value) : null,
      contextType,
      contextReleased,
    };
  } catch {
    return { maxTextureSize: null, contextType, contextReleased };
  }
}

async function fetchBrowserHdPlan(maxTextureSize) {
  const query = new URLSearchParams();
  if (Number.isInteger(maxTextureSize) && maxTextureSize > 0) {
    query.set("maxTextureSize", String(maxTextureSize));
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetch(`/api/hd/assets/browser-plan${suffix}`, {
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Browser HD plan failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function fetchBrowserHdPayload(hdPath) {
  const response = await fetch(
    `/api/hd/assets/content?hdPath=${encodeURIComponent(hdPath)}`,
    { cache: "no-store" },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Browser HD asset failed with HTTP ${response.status}.`);
  }
  return payload;
}

function loadImage(dataUrl, entry) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.alt = `HD preview: ${entry.sourcePath}`;
    image.title = entry.sourcePath;
    image.loading = "eager";
    if (entry.hdPixels && Number(entry.scale) > 0) {
      image.width = Math.max(1, Math.round(entry.hdPixels.width / entry.scale));
      image.height = Math.max(1, Math.round(entry.hdPixels.height / entry.scale));
    }
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`HD image decode failed: ${entry.hdPath}`)), {
      once: true,
    });
    image.src = dataUrl;
  });
}

async function fetchAlhdProviderState() {
  const response = await fetch("/api/hd/assets", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `ALHD provider state failed with HTTP ${response.status}.`);
  }
  return payload;
}

function requestedGraphicsProfile() {
  const requested = new URLSearchParams(window.location.search).get("graphicsProfile");
  if (requested) return normalizeGraphicsProfile(requested);
  try {
    return normalizeGraphicsProfile(localStorage.getItem("alremastered.graphicsProfile"));
  } catch {
    return DEFAULT_GRAPHICS_PROFILE;
  }
}

function persistGraphicsProfile(profile) {
  try {
    localStorage.setItem("alremastered.graphicsProfile", profile);
  } catch {
    // Profile persistence is best-effort only.
  }
}

async function applyGraphicsProfile(profileValue, options = {}) {
  const profile = normalizeGraphicsProfile(profileValue);
  const definition = graphicsProfileDefinition(profile);
  const capability = detectWebglTextureCapability();
  const effectiveTextureLimit = resolveGraphicsProfileTextureLimit(
    profile,
    capability.maxTextureSize,
  );
  const applied = [];
  let available = 0;
  let missing = [];
  let blocked = [];

  elements.hdPreviews.replaceChildren();

  if (definition.usesHd) {
    const plan = await fetchBrowserHdPlan(effectiveTextureLimit);
    available = Number(plan.available ?? 0);
    const missingSet = new Set(plan.missing ?? []);
    blocked = [...(plan.blocked ?? [])].sort();

    for (const entry of plan.entries ?? []) {
      if (entry.mode !== "hd") continue;
      try {
        const payload = await fetchBrowserHdPayload(entry.hdPath);
        const image = await loadImage(
          `data:${payload.mediaType};base64,${payload.base64}`,
          entry,
        );
        elements.hdPreviews.append(image);
        applied.push(entry.sourcePath);
      } catch {
        missingSet.add(entry.sourcePath);
      }
    }
    missing = [...missingSet].sort();
  } else {
    const provider = await fetchAlhdProviderState();
    available = Number(provider.activeReplacementCount ?? 0);
  }

  verificationState.rendererGeneration += 1;
  verificationState.graphicsProfile = profile;
  verificationState.profileHistory.push(profile);

  const status = Object.freeze({
    mode: definition.usesHd ? "HD" : "Original",
    profile,
    profileLabel: definition.label,
    available,
    applied: applied.length,
    paths: Object.freeze(applied.slice()),
    missing: Object.freeze(missing),
    blocked: Object.freeze(blocked),
    maxTextureSize: effectiveTextureLimit,
    hardwareMaxTextureSize: capability.maxTextureSize,
    webglContext: capability.contextType,
    temporaryContextReleased: capability.contextReleased,
    rendererGeneration: verificationState.rendererGeneration,
    headlessHdAssetsLoaded: false,
    presentationOnly: true,
    originalFallback: true,
  });

  verificationState.alhdStatus = status;
  verificationState.alhdReady = true;
  if (options.persist !== false) persistGraphicsProfile(profile);

  elements.graphicsProfile.value = profile;
  elements.hdMode.textContent = definition.label;
  elements.graphicsProfileLimit.textContent = definition.usesHd
    ? value(effectiveTextureLimit, "Hardware maximum")
    : "Original only";
  elements.graphicsGeneration.textContent = String(status.rendererGeneration);
  elements.hdAvailable.textContent = String(status.available);
  elements.hdApplied.textContent = String(status.applied);
  elements.hdMissing.textContent = String(status.missing.length);
  elements.hdBlocked.textContent = String(status.blocked.length);
  elements.hdTextureLimit.textContent = value(status.hardwareMaxTextureSize, "Unavailable");
  elements.hdMessage.textContent = definition.usesHd
    ? `${definition.label}: applied ${status.applied}/${status.available}; ` +
      `${status.missing.length} missing and ${status.blocked.length} blocked use original assets.`
    : "Original profile selected. No HD image payloads are loaded; Adventure Land originals remain authoritative.";
  return status;
}

async function loadBrowserHdAssets() {
  return await applyGraphicsProfile(requestedGraphicsProfile(), { persist: false });
}

verificationState.setGraphicsProfile = async (profile) => await applyGraphicsProfile(profile);

function value(value, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function resource(current, maximum) {
  if (current === undefined || current === null) return "—";
  if (maximum === undefined || maximum === null) return String(current);
  return `${current} / ${maximum}`;
}

function position(character) {
  if (!character || !Number.isFinite(character.x) || !Number.isFinite(character.y)) return "—";
  return `${character.x.toFixed(1)}, ${character.y.toFixed(1)}`;
}

function render(snapshot, sequence) {
  const connection = snapshot?.character ?? {};
  const character = connection.character ?? {};

  elements.characterStatus.textContent = value(connection.status, "Unavailable");
  elements.characterName.textContent =
    value(connection.characterName ?? character.name, "No Character connected");
  elements.characterServer.textContent = value(
    [connection.serverRegion, connection.serverName].filter(Boolean).join(" ") ||
      connection.serverKey,
  );
  elements.characterMap.textContent = value(character.map);
  elements.characterPosition.textContent = position(character);
  elements.characterLevel.textContent = value(character.level);
  elements.characterHp.textContent = resource(character.hp, character.maxHp);
  elements.characterMp.textContent = resource(character.mp, character.maxMp);
  elements.characterMessage.textContent = value(
    connection.message,
    "Character state is unavailable.",
  );
  elements.bridgeSequence.textContent = value(sequence ?? snapshot?.eventSequence);
  elements.snapshotTime.textContent = value(snapshot?.generatedAt);
  elements.coreStatus.textContent = value(snapshot?.core?.status);
  elements.scriptStatus.textContent = value(snapshot?.script?.status);

  verificationState.ready = true;
  verificationState.renderCount += 1;
  verificationState.lastCharacterId = connection.characterId ?? character.id ?? null;
  verificationState.lastCharacterStatus = connection.status ?? null;
  verificationState.lastSequence = sequence ?? snapshot?.eventSequence ?? null;
  document.body.dataset.browserViewReady = "true";
}

async function loadInitialSnapshot() {
  const response = await fetch("/api/renderer/snapshot", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Renderer snapshot failed with HTTP ${response.status}.`);
  }
  const payload = await response.json();
  render(payload.snapshot, payload.bridge?.eventSequence);
}

function connectStream() {
  source?.close();
  source = new EventSource(
    `/api/renderer/stream?clientId=${encodeURIComponent(verificationState.clientId)}`,
  );
  source.addEventListener("open", () => {
    elements.connection.textContent = "Live";
    void refreshHandoffState().catch(() => {
      elements.handoffMode.textContent = "Unavailable";
    });
  });
  source.addEventListener("state", (event) => {
    try {
      const payload = JSON.parse(event.data);
      render(payload.snapshot, payload.sequence);
      elements.connection.textContent = "Live";
    } catch {
      elements.connection.textContent = "Invalid event";
    }
  });
  source.addEventListener("error", () => {
    elements.connection.textContent = "Reconnecting…";
  });
}

elements.graphicsProfile.addEventListener("change", async () => {
  elements.graphicsProfile.disabled = true;
  try {
    await applyGraphicsProfile(elements.graphicsProfile.value);
  } catch (error) {
    elements.hdMessage.textContent =
      error instanceof Error ? error.message : "Graphics profile switch failed.";
  } finally {
    elements.graphicsProfile.disabled = false;
  }
});

elements.close.addEventListener("click", () => {
  source?.close();
  window.close();
  globalThis.setTimeout(() => {
    if (!window.closed) {
      elements.connection.textContent = "Close this tab";
      elements.characterMessage.textContent =
        "This tab was not opened by the dashboard. Close it to return to ALRemastered.";
    }
  }, 100);
});

window.addEventListener("beforeunload", () => source?.close());

try {
  await loadInitialSnapshot();
  await refreshHandoffState();
  await loadBrowserHdAssets();
  connectStream();
} catch (error) {
  elements.connection.textContent = "Unavailable";
  elements.characterMessage.textContent =
    error instanceof Error ? error.message : "Browser View could not load renderer state.";
}
