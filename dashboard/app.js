const state = {
  records: [],
  seenIds: new Set(),
  paused: false,
  autoScroll: true,
  status: null,
  update: null,
  gameVersion: null,
  gameData: null,
  diagnostics: null,
  source: null,
};

const elements = {
  connectionStatus: document.querySelector("#connection-status"),
  coreStatus: document.querySelector("#core-status"),
  version: document.querySelector("#client-version"),
  uptime: document.querySelector("#uptime"),
  platform: document.querySelector("#platform"),
  gameVersion: document.querySelector("#game-version"),
  gameVersionStatus: document.querySelector("#game-version-status"),
  gameLastDeploy: document.querySelector("#game-last-deploy"),
  checkGameVersion: document.querySelector("#check-game-version"),
  gameDataStatus: document.querySelector("#game-data-status"),
  gameDataVersion: document.querySelector("#game-data-version"),
  gameDataFamilyTotal: document.querySelector("#game-data-family-total"),
  gameDataLoadedAt: document.querySelector("#game-data-loaded-at"),
  gameDataOrigin: document.querySelector("#game-data-origin"),
  gameDataCacheStatus: document.querySelector("#game-data-cache-status"),
  gameDataCachedAt: document.querySelector("#game-data-cached-at"),
  gameDataFamilies: document.querySelector("#game-data-families"),
  reloadGameData: document.querySelector("#reload-game-data"),
  console: document.querySelector("#log-console"),
  feedback: document.querySelector("#feedback"),
  level: document.querySelector("#level-filter"),
  search: document.querySelector("#search"),
  autoScroll: document.querySelector("#auto-scroll"),
  pause: document.querySelector("#pause"),
  copyFull: document.querySelector("#copy-full"),
  copyFiltered: document.querySelector("#copy-filtered"),
  download: document.querySelector("#download-log"),
  clear: document.querySelector("#clear-log"),
  checkUpdates: document.querySelector("#check-updates"),
  updateBanner: document.querySelector("#update-banner"),
  updateTitle: document.querySelector("#update-title"),
  updateSummary: document.querySelector("#update-summary"),
  releaseNotes: document.querySelector("#release-notes"),
  updateProgress: document.querySelector("#update-progress"),
  updateProgressBar: document.querySelector("#update-progress-bar"),
  updateProgressLabel: document.querySelector("#update-progress-label"),
  installUpdate: document.querySelector("#install-update"),
  skipUpdate: document.querySelector("#skip-update"),
  remindUpdate: document.querySelector("#remind-update"),
  componentHealth: document.querySelector("#component-health"),
  recentErrors: document.querySelector("#recent-errors-list"),
  copySnapshot: document.querySelector("#copy-snapshot"),
  downloadPackage: document.querySelector("#download-package"),
};

function setFeedback(message, kind = "") {
  elements.feedback.textContent = message;
  elements.feedback.className = `feedback ${kind}`.trim();
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatPublished(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function appendRecord(record) {
  if (state.seenIds.has(record.id)) return;
  state.seenIds.add(record.id);
  state.records.push(record);

  if (state.records.length > 2000) {
    const removed = state.records.splice(0, state.records.length - 2000);
    for (const entry of removed) state.seenIds.delete(entry.id);
  }
}

function replaceRecords(records) {
  state.records = [];
  state.seenIds.clear();
  for (const record of records) appendRecord(record);
}

function clearRecords() {
  state.records = [];
  state.seenIds.clear();
  renderLogs();
}

function visibleRecords() {
  const level = elements.level.value;
  const query = elements.search.value.trim().toLowerCase();

  return state.records.filter((record) => {
    if (level !== "ALL" && record.level !== level) return false;
    if (!query) return true;
    return JSON.stringify(record).toLowerCase().includes(query);
  });
}

function recordText(record) {
  const context = record.context === undefined ? "" : ` ${JSON.stringify(record.context)}`;
  const error = record.error === undefined ? "" : ` ${JSON.stringify(record.error)}`;
  return `${record.message}${context}${error}`;
}

function renderLogs() {
  if (state.paused) return;

  const records = visibleRecords();
  elements.console.replaceChildren();

  if (records.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No log entries match the current filters.";
    elements.console.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const record of records) {
    const line = document.createElement("div");
    line.className = "log-line";
    line.dataset.level = record.level;

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = record.timestamp;

    const level = document.createElement("span");
    level.className = "log-level";
    level.textContent = record.level;

    const component = document.createElement("span");
    component.className = "log-component";
    component.textContent = record.component;

    const message = document.createElement("span");
    message.textContent = recordText(record);

    line.append(time, level, component, message);
    fragment.append(line);
  }

  elements.console.append(fragment);
  if (state.autoScroll) elements.console.scrollTop = elements.console.scrollHeight;
}

function updateStatusView() {
  if (!state.status) return;
  elements.coreStatus.textContent = state.status.status;
  elements.version.textContent = state.status.version;
  elements.platform.textContent = state.status.platform;
  const started = Date.parse(state.status.startedAt);
  elements.uptime.textContent = formatDuration(Date.now() - started);
}

function renderGameVersion() {
  const gameVersion = state.gameVersion;
  if (!gameVersion) return;

  elements.gameVersion.textContent =
    gameVersion.currentVersion === undefined ? "Not checked" : String(gameVersion.currentVersion);
  elements.gameLastDeploy.textContent = gameVersion.lastDeploy ?? "—";

  if (gameVersion.status === "checking") {
    elements.gameVersionStatus.textContent = "Checking…";
  } else if (gameVersion.status === "current") {
    elements.gameVersionStatus.textContent = "Current";
  } else if (gameVersion.status === "changed") {
    elements.gameVersionStatus.textContent =
      gameVersion.previousVersion === undefined
        ? "Changed"
        : `Changed from ${gameVersion.previousVersion}`;
  } else if (gameVersion.status === "error") {
    elements.gameVersionStatus.textContent = "Check failed";
  } else {
    elements.gameVersionStatus.textContent = "Waiting";
  }

  elements.gameVersionStatus.title = gameVersion.message ?? "";
}

function renderGameData() {
  const gameData = state.gameData;
  if (!gameData) return;

  const statusLabels = {
    idle: "Waiting",
    loading: "Loading…",
    loaded: "Loaded",
    error: "Load failed",
  };

  elements.gameDataStatus.textContent = statusLabels[gameData.status] ?? gameData.status;
  elements.gameDataStatus.title = gameData.message ?? "";
  elements.gameDataVersion.textContent =
    gameData.version === undefined ? "—" : String(gameData.version);
  elements.gameDataFamilyTotal.textContent =
    `${gameData.loadedFamilyCount ?? 0} / ${gameData.familyCount ?? 0}`;
  elements.gameDataLoadedAt.textContent =
    gameData.loadedAt ? formatPublished(gameData.loadedAt) : "—";
  elements.gameDataOrigin.textContent =
    gameData.origin === "live"
      ? "Live snapshot"
      : gameData.origin === "cache"
        ? "Local cache"
        : "—";
  const cacheStatusLabels = {
    disabled: "Disabled",
    "not-checked": "Not checked",
    missing: "Empty",
    loaded: "Loaded",
    stored: "Current",
    stale: "Stale",
    invalid: "Invalid",
    error: "Error",
  };
  elements.gameDataCacheStatus.textContent =
    cacheStatusLabels[gameData.cacheStatus] ?? gameData.cacheStatus ?? "—";
  elements.gameDataCacheStatus.title = gameData.cacheMessage ?? "";
  elements.gameDataCachedAt.textContent =
    gameData.cachedAt ? formatPublished(gameData.cachedAt) : "—";

  elements.gameDataFamilies.replaceChildren();
  const families = gameData.families ?? [];
  if (families.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Game data has not been loaded yet.";
    elements.gameDataFamilies.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const family of families) {
    const card = document.createElement("article");
    card.className = "game-data-family";
    card.dataset.loaded = String(family.loaded);

    const name = document.createElement("span");
    name.className = "label";
    name.textContent = `G.${family.name}`;

    const count = document.createElement("strong");
    count.textContent = family.loaded ? `${family.count} entries` : "Not loaded";

    const kind = document.createElement("small");
    kind.textContent = family.required ? "Required data family" : "Additional data family";

    card.append(name, count, kind);
    fragment.append(card);
  }
  elements.gameDataFamilies.append(fragment);
}

function renderUpdate() {
  const update = state.update;
  const visible = update && ["available", "downloading", "installing"].includes(update.status);
  elements.updateBanner.hidden = !visible;
  if (!visible) return;

  elements.updateTitle.textContent = `ALRemastered ${update.latestVersion} is available`;
  elements.updateSummary.textContent =
    `Current version: ${update.currentVersion} · New version: ${update.latestVersion} · Published: ${formatPublished(update.publishedAt)}`;

  if (update.releaseNotesUrl) {
    elements.releaseNotes.href = update.releaseNotesUrl;
    elements.releaseNotes.hidden = false;
  } else {
    elements.releaseNotes.hidden = true;
  }

  const busy = update.status === "downloading" || update.status === "installing";
  elements.installUpdate.disabled = busy;
  elements.skipUpdate.disabled = busy;
  elements.remindUpdate.disabled = busy;
  elements.updateProgress.hidden = !busy;

  if (busy) {
    const progress = Math.max(0, Math.min(100, update.progressPercent ?? 0));
    elements.updateProgressBar.style.width = `${progress}%`;
    elements.updateProgressLabel.textContent = update.status === "installing" ? "Verified" : `${progress}%`;
  }
}

function renderDiagnostics() {
  const diagnostics = state.diagnostics;
  if (!diagnostics) return;

  elements.componentHealth.replaceChildren();
  const healthFragment = document.createDocumentFragment();
  for (const component of diagnostics.components) {
    const card = document.createElement("article");
    card.className = "health-card";
    card.dataset.status = component.status;

    const name = document.createElement("span");
    name.className = "label";
    name.textContent = component.name;

    const status = document.createElement("strong");
    status.textContent = component.status;

    const message = document.createElement("p");
    message.textContent = component.message;

    card.append(name, status, message);
    healthFragment.append(card);
  }
  elements.componentHealth.append(healthFragment);

  elements.recentErrors.replaceChildren();
  if (diagnostics.recentErrors.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No recent errors.";
    elements.recentErrors.append(empty);
    return;
  }

  const errorFragment = document.createDocumentFragment();
  for (const diagnosticError of [...diagnostics.recentErrors].reverse()) {
    const card = document.createElement("article");
    card.className = "error-card";

    const header = document.createElement("div");
    header.className = "error-card-header";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy full log";
    copy.addEventListener("click", () => void copyFullLog());

    const summaryGroup = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "error-card-meta";
    meta.textContent = `${diagnosticError.timestamp} · ${diagnosticError.level} · ${diagnosticError.component}`;

    const summary = document.createElement("p");
    summary.textContent = diagnosticError.summary;
    summaryGroup.append(meta, summary);
    header.append(summaryGroup, copy);

    const details = document.createElement("details");
    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = "Technical details";
    const technical = document.createElement("pre");
    technical.textContent = JSON.stringify(diagnosticError.technical, null, 2);
    details.append(detailsSummary, technical);

    card.append(header, details);
    errorFragment.append(card);
  }
  elements.recentErrors.append(errorFragment);
}

async function refreshDiagnostics() {
  try {
    const response = await fetch("/api/diagnostics/snapshot", { cache: "no-store" });
    if (!response.ok) return;
    state.diagnostics = await response.json();
    renderDiagnostics();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function copyFullLog() {
  try {
    const response = await fetch("/api/logs/export", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    await writeClipboard(payload.text);
    setFeedback(
      `Copied ${payload.lineCount} log lines. Version: ${state.status?.version ?? "unknown"}. Platform: ${state.status?.platform ?? "unknown"}. Time range: ${payload.from} -> ${payload.to}. Secrets sanitized: yes.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Copy failed: ${error.message}`, "error");
  }
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.status = await response.json();
    updateStatusView();
    elements.connectionStatus.textContent = "Dashboard connected";
    elements.connectionStatus.classList.add("online");
  } catch {
    elements.connectionStatus.textContent = "Dashboard disconnected";
    elements.connectionStatus.classList.remove("online");
  }
}

async function refreshGameData() {
  try {
    const response = await fetch("/api/game-data", { cache: "no-store" });
    if (!response.ok) return;
    state.gameData = await response.json();
    renderGameData();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshGameVersion() {
  try {
    const response = await fetch("/api/game-version", { cache: "no-store" });
    if (!response.ok) return;
    state.gameVersion = await response.json();
    renderGameVersion();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshUpdate() {
  try {
    const response = await fetch("/api/update", { cache: "no-store" });
    if (!response.ok) return;
    state.update = await response.json();
    renderUpdate();
  } catch {
    // The connection indicator already reports dashboard connectivity.
  }
}

async function loadLogs() {
  const response = await fetch("/api/logs", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load logs: HTTP ${response.status}`);
  const payload = await response.json();
  replaceRecords(payload.records);
  renderLogs();
}

function connectStream() {
  state.source?.close();
  const source = new EventSource("/api/logs/stream");
  state.source = source;

  source.addEventListener("log", (event) => {
    appendRecord(JSON.parse(event.data));
    renderLogs();
  });

  source.addEventListener("clear", () => {
    clearRecords();
    setFeedback("In-memory diagnostic log cleared. Persistent log files were kept.", "success");
  });

  source.addEventListener("open", () => {
    elements.connectionStatus.textContent = "Dashboard connected";
    elements.connectionStatus.classList.add("online");
  });

  source.addEventListener("error", () => {
    elements.connectionStatus.textContent = "Reconnecting…";
    elements.connectionStatus.classList.remove("online");
  });
}

async function gameDataAction(path) {
  const response = await fetch(path, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.gameData = payload;
  renderGameData();
  return payload;
}

async function gameVersionAction(path) {
  const response = await fetch(path, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.gameVersion = payload;
  renderGameVersion();
  return payload;
}

async function updateAction(path) {
  const response = await fetch(path, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.update = payload;
  renderUpdate();
  return payload;
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access was denied.");
}

function diagnosticHeader(records) {
  const first = records.at(0)?.timestamp ?? "n/a";
  const last = records.at(-1)?.timestamp ?? "n/a";
  return [
    "ALRemastered Diagnostic Log",
    `Client version: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Log lines: ${records.length}`,
    `Time range: ${first} -> ${last}`,
    "Secrets sanitized: yes",
    "",
  ].join("\n");
}

function serializeRecords(records) {
  return `${diagnosticHeader(records)}${records.map((record) => JSON.stringify(record)).join("\n")}`;
}

elements.level.addEventListener("change", renderLogs);
elements.search.addEventListener("input", renderLogs);

elements.autoScroll.addEventListener("change", () => {
  state.autoScroll = elements.autoScroll.checked;
  if (state.autoScroll) elements.console.scrollTop = elements.console.scrollHeight;
});

elements.pause.addEventListener("click", () => {
  state.paused = !state.paused;
  elements.pause.textContent = state.paused ? "Resume" : "Pause";
  elements.pause.setAttribute("aria-pressed", String(state.paused));
  setFeedback(state.paused ? "Live display paused. Logging continues." : "Live display resumed.");
  if (!state.paused) renderLogs();
});

elements.copyFull.addEventListener("click", () => void copyFullLog());

elements.copyFiltered.addEventListener("click", async () => {
  try {
    const records = visibleRecords();
    await writeClipboard(serializeRecords(records));
    setFeedback(`Copied ${records.length} filtered log lines. Secrets sanitized: yes.`, "success");
  } catch (error) {
    setFeedback(`Copy failed: ${error.message}`, "error");
  }
});

elements.download.addEventListener("click", () => {
  const text = serializeRecords(state.records);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ALRemastered-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  document.body.append(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  setFeedback(`Downloaded ${state.records.length} log lines. Secrets sanitized: yes.`, "success");
});

elements.clear.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/logs/clear", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    clearRecords();
  } catch (error) {
    setFeedback(`Clear failed: ${error.message}`, "error");
  }
});

elements.copySnapshot.addEventListener("click", async () => {
  try {
    await refreshDiagnostics();
    await writeClipboard(JSON.stringify(state.diagnostics, null, 2));
    setFeedback("Copied diagnostic snapshot. Secrets sanitized: yes.", "success");
  } catch (error) {
    setFeedback(`Snapshot copy failed: ${error.message}`, "error");
  }
});

elements.downloadPackage.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/diagnostics/package", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ALRemastered-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.append(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
    setFeedback("Diagnostic package downloaded. Secrets sanitized: yes.", "success");
  } catch (error) {
    setFeedback(`Diagnostic package download failed: ${error.message}`, "error");
  }
});

elements.reloadGameData.addEventListener("click", async () => {
  elements.reloadGameData.disabled = true;
  setFeedback("Reloading Adventure Land game data…");
  state.gameData = { ...state.gameData, status: "loading" };
  renderGameData();
  try {
    const gameData = await gameDataAction("/api/game-data/reload");
    if (gameData.status === "loaded") {
      setFeedback(
        `Loaded Adventure Land game data version ${gameData.version}: ${gameData.loadedFamilyCount} / ${gameData.familyCount} data families available.`,
        "success",
      );
    } else {
      setFeedback(`Game data load failed: ${gameData.message}`, "error");
    }
  } catch (error) {
    setFeedback(`Game data load failed: ${error.message}`, "error");
  } finally {
    elements.reloadGameData.disabled = false;
  }
});

elements.checkGameVersion.addEventListener("click", async () => {
  elements.checkGameVersion.disabled = true;
  setFeedback("Checking Adventure Land game version…");
  try {
    const gameVersion = await gameVersionAction("/api/game-version/check");
    if (gameVersion.status === "changed") {
      setFeedback(gameVersion.message ?? "Adventure Land game version changed.", "success");
    } else if (gameVersion.status === "current") {
      setFeedback(
        `Adventure Land version ${gameVersion.currentVersion} is current and stored locally.`,
        "success",
      );
    } else if (gameVersion.status === "error") {
      setFeedback(`Game version check failed: ${gameVersion.message}`, "error");
    }
  } catch (error) {
    setFeedback(`Game version check failed: ${error.message}`, "error");
  } finally {
    elements.checkGameVersion.disabled = false;
  }
});

elements.checkUpdates.addEventListener("click", async () => {
  elements.checkUpdates.disabled = true;
  setFeedback("Checking for updates…");
  try {
    const update = await updateAction("/api/update/check");
    if (update.status === "available") {
      setFeedback(`ALRemastered ${update.latestVersion} is available.`, "success");
    } else if (update.status === "upToDate") {
      setFeedback("ALRemastered is up to date.", "success");
    } else if (update.status === "deferred") {
      setFeedback(update.message ?? "The latest update is currently deferred.");
    } else if (update.status === "error") {
      setFeedback(`Update check failed: ${update.message}`, "error");
    }
  } catch (error) {
    setFeedback(`Update check failed: ${error.message}`, "error");
  } finally {
    elements.checkUpdates.disabled = false;
  }
});

elements.skipUpdate.addEventListener("click", async () => {
  try {
    const update = await updateAction("/api/update/skip");
    setFeedback(update.message ?? "This version will be skipped.", "success");
  } catch (error) {
    setFeedback(`Skip failed: ${error.message}`, "error");
  }
});

elements.remindUpdate.addEventListener("click", async () => {
  try {
    const update = await updateAction("/api/update/remind");
    setFeedback(update.message ?? "This update will be shown again tomorrow.", "success");
  } catch (error) {
    setFeedback(`Reminder failed: ${error.message}`, "error");
  }
});

elements.installUpdate.addEventListener("click", async () => {
  setFeedback("Downloading and verifying update…");
  state.update = { ...state.update, status: "downloading", progressPercent: 0 };
  renderUpdate();
  try {
    const update = await updateAction("/api/update/install");
    setFeedback(update.message ?? "Update verified. Starting installer…", "success");
  } catch (error) {
    setFeedback(`Update installation failed: ${error.message}`, "error");
    await refreshUpdate();
  }
});

await refreshStatus();
await refreshGameVersion();
await refreshGameData();
await refreshUpdate();
await refreshDiagnostics();
await loadLogs();
connectStream();
setInterval(refreshStatus, 3000);
setInterval(refreshGameVersion, 2000);
setInterval(refreshGameData, 2000);
setInterval(refreshUpdate, 1500);
setInterval(refreshDiagnostics, 1500);
setInterval(updateStatusView, 1000);
