const state = {
  records: [],
  paused: false,
  autoScroll: true,
  status: null,
  source: null,
};

const elements = {
  connectionStatus: document.querySelector("#connection-status"),
  coreStatus: document.querySelector("#core-status"),
  version: document.querySelector("#client-version"),
  uptime: document.querySelector("#uptime"),
  platform: document.querySelector("#platform"),
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

async function loadLogs() {
  const response = await fetch("/api/logs", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load logs: HTTP ${response.status}`);
  const payload = await response.json();
  state.records = payload.records;
  renderLogs();
}

function connectStream() {
  state.source?.close();
  const source = new EventSource("/api/logs/stream");
  state.source = source;

  source.addEventListener("log", (event) => {
    const record = JSON.parse(event.data);
    state.records.push(record);
    if (state.records.length > 2000) state.records.splice(0, state.records.length - 2000);
    renderLogs();
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

elements.copyFull.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/logs/export", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    await writeClipboard(payload.text);
    setFeedback(
      `Copied ${payload.lineCount} log lines. Time range: ${payload.from} -> ${payload.to}. Secrets sanitized: yes.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Copy failed: ${error.message}`, "error");
  }
});

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
    state.records = [];
    renderLogs();
    setFeedback("In-memory diagnostic log cleared. Persistent log files were kept.", "success");
  } catch (error) {
    setFeedback(`Clear failed: ${error.message}`, "error");
  }
});

await refreshStatus();
await loadLogs();
connectStream();
setInterval(refreshStatus, 3000);
setInterval(updateStatusView, 1000);
