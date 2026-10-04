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
};

const verificationState = {
  ready: false,
  renderCount: 0,
  transport: "SSE",
  lastCharacterId: null,
  lastCharacterStatus: null,
  lastSequence: null,
};
globalThis.__alrBrowserViewState = verificationState;

let source;

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
  source = new EventSource("/api/renderer/stream");
  source.addEventListener("open", () => {
    elements.connection.textContent = "Live";
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
  connectStream();
} catch (error) {
  elements.connection.textContent = "Unavailable";
  elements.characterMessage.textContent =
    error instanceof Error ? error.message : "Browser View could not load renderer state.";
}
