const state = {
  records: [],
  seenIds: new Set(),
  paused: false,
  autoScroll: true,
  status: null,
  account: null,
  selection: null,
  character: null,
  actionGateway: null,
  skillOptions: null,
  lootConsumableOptions: null,
  slice35LiveTest: null,
  slice35LastReport: null,
  scriptRuntime: null,
  slice41LiveTest: null,
  slice41LastReport: null,
  slice42LiveTest: null,
  slice42LastReport: null,
  slice43LiveTest: null,
  slice43LastReport: null,
  slice44LiveTest: null,
  slice44LastReport: null,
  simpleFarmerOptions: null,
  simpleFarmer: null,
  slice45LiveTest: null,
  slice45LastReport: null,
  slice51LiveTest: null,
  slice51LastReport: null,
  slice52LiveTest: null,
  slice52LastReport: null,
  slice53LiveTest: null,
  slice53LastReport: null,
  update: null,
  gameVersion: null,
  gameData: null,
  diagnostics: null,
  source: null,
  updateReconnectPending: false,
};

const elements = {
  connectionStatus: document.querySelector("#connection-status"),
  coreStatus: document.querySelector("#core-status"),
  version: document.querySelector("#client-version"),
  uptime: document.querySelector("#uptime"),
  platform: document.querySelector("#platform"),
  accountStatus: document.querySelector("#account-status"),
  accountUserId: document.querySelector("#account-user-id"),
  accountConnectedAt: document.querySelector("#account-connected-at"),
  accountForm: document.querySelector("#account-login-form"),
  accountEmail: document.querySelector("#account-email"),
  accountPassword: document.querySelector("#account-password"),
  accountConnect: document.querySelector("#account-connect"),
  accountDisconnect: document.querySelector("#account-disconnect"),
  selectionPanel: document.querySelector("#selection-panel"),
  selectionStatus: document.querySelector("#selection-status"),
  characterCount: document.querySelector("#character-count"),
  serverCount: document.querySelector("#server-count"),
  selectedServer: document.querySelector("#selected-server"),
  characterList: document.querySelector("#character-list"),
  serverList: document.querySelector("#server-list"),
  serverSelect: document.querySelector("#server-select"),
  selectServer: document.querySelector("#select-server"),
  refreshSelection: document.querySelector("#refresh-selection"),
  characterConnectionStatus: document.querySelector("#character-connection-status"),
  activeCharacter: document.querySelector("#active-character"),
  characterServer: document.querySelector("#character-server"),
  characterConnectedAt: document.querySelector("#character-connected-at"),
  characterHp: document.querySelector("#character-hp"),
  characterMp: document.querySelector("#character-mp"),
  characterLevel: document.querySelector("#character-level"),
  characterXp: document.querySelector("#character-xp"),
  characterMap: document.querySelector("#character-map"),
  characterPosition: document.querySelector("#character-position"),
  characterDirection: document.querySelector("#character-direction"),
  characterTarget: document.querySelector("#character-target"),
  characterDeathState: document.querySelector("#character-death-state"),
  characterPing: document.querySelector("#character-ping"),
  characterGold: document.querySelector("#character-gold"),
  characterInventorySummary: document.querySelector("#character-inventory-summary"),
  characterEquipmentSummary: document.querySelector("#character-equipment-summary"),
  characterConditionsSummary: document.querySelector("#character-conditions-summary"),
  characterEntitiesSummary: document.querySelector("#character-entities-summary"),
  characterPlayersSummary: document.querySelector("#character-players-summary"),
  characterMonstersSummary: document.querySelector("#character-monsters-summary"),
  characterPartySummary: document.querySelector("#character-party-summary"),
  characterEntities: document.querySelector("#character-entities"),
  characterParty: document.querySelector("#character-party"),
  characterInventory: document.querySelector("#character-inventory"),
  characterEquipment: document.querySelector("#character-equipment"),
  characterConditions: document.querySelector("#character-conditions"),
  characterSelect: document.querySelector("#character-select"),
  startCharacter: document.querySelector("#start-character"),
  stopCharacter: document.querySelector("#stop-character"),
  actionGatewayStatus: document.querySelector("#action-gateway-status"),
  actionGatewayActive: document.querySelector("#action-gateway-active"),
  actionGatewayTotal: document.querySelector("#action-gateway-total"),
  actionGatewayRequestId: document.querySelector("#action-gateway-request-id"),
  actionGatewayOutcome: document.querySelector("#action-gateway-outcome"),
  runActionGatewayProbe: document.querySelector("#run-action-gateway-probe"),
  movementMode: document.querySelector("#movement-mode"),
  movementButtons: document.querySelectorAll("[data-movement-direction]"),
  attackTarget: document.querySelector("#attack-target"),
  runAttackTest: document.querySelector("#run-attack-test"),
  skillName: document.querySelector("#skill-name"),
  skillTarget: document.querySelector("#skill-target"),
  runSkillTest: document.querySelector("#run-skill-test"),
  skillTestNote: document.querySelector("#skill-test-note"),
  lootChest: document.querySelector("#loot-chest"),
  runLootTest: document.querySelector("#run-loot-test"),
  consumableItem: document.querySelector("#consumable-item"),
  runConsumableTest: document.querySelector("#run-consumable-test"),
  lootConsumableTestNote: document.querySelector("#loot-consumable-test-note"),
  startSlice35LiveTest: document.querySelector("#start-slice-3-5-live-test"),
  slice35LiveTestStatus: document.querySelector("#slice-3-5-live-test-status"),
  slice35LiveTestNote: document.querySelector("#slice-3-5-live-test-note"),
  copySlice35LiveTestResult: document.querySelector("#copy-slice-3-5-live-test-result"),
  scriptRuntimeStatus: document.querySelector("#script-runtime-status"),
  scriptRuntimeName: document.querySelector("#script-runtime-name"),
  scriptRuntimeTimers: document.querySelector("#script-runtime-timers"),
  scriptRuntimeLogRecords: document.querySelector("#script-runtime-log-records"),
  scriptRuntimeScriptName: document.querySelector("#script-runtime-script-name"),
  scriptRuntimeSource: document.querySelector("#script-runtime-source"),
  scriptRuntimeLoad: document.querySelector("#script-runtime-load"),
  scriptRuntimeStart: document.querySelector("#script-runtime-start"),
  scriptRuntimePause: document.querySelector("#script-runtime-pause"),
  scriptRuntimeStop: document.querySelector("#script-runtime-stop"),
  startSlice41LiveTest: document.querySelector("#start-slice-4-1-live-test"),
  slice41LiveTestStatus: document.querySelector("#slice-4-1-live-test-status"),
  slice41LiveTestNote: document.querySelector("#slice-4-1-live-test-note"),
  copySlice41LiveTestResult: document.querySelector("#copy-slice-4-1-live-test-result"),
  startSlice42LiveTest: document.querySelector("#start-slice-4-2-live-test"),
  slice42LiveTestStatus: document.querySelector("#slice-4-2-live-test-status"),
  slice42LiveTestNote: document.querySelector("#slice-4-2-live-test-note"),
  copySlice42LiveTestResult: document.querySelector("#copy-slice-4-2-live-test-result"),
  startSlice43LiveTest: document.querySelector("#start-slice-4-3-live-test"),
  slice43LiveTestStatus: document.querySelector("#slice-4-3-live-test-status"),
  slice43LiveTestNote: document.querySelector("#slice-4-3-live-test-note"),
  copySlice43LiveTestResult: document.querySelector("#copy-slice-4-3-live-test-result"),
  startSlice44LiveTest: document.querySelector("#start-slice-4-4-live-test"),
  slice44LiveTestStatus: document.querySelector("#slice-4-4-live-test-status"),
  slice44LiveTestNote: document.querySelector("#slice-4-4-live-test-note"),
  copySlice44LiveTestResult: document.querySelector("#copy-slice-4-4-live-test-result"),
  simpleFarmerMonster: document.querySelector("#simple-farmer-monster"),
  simpleFarmerHpThreshold: document.querySelector("#simple-farmer-hp-threshold"),
  simpleFarmerMpThreshold: document.querySelector("#simple-farmer-mp-threshold"),
  simpleFarmerLoot: document.querySelector("#simple-farmer-loot"),
  simpleFarmerRespawn: document.querySelector("#simple-farmer-respawn"),
  simpleFarmerStart: document.querySelector("#simple-farmer-start"),
  simpleFarmerStop: document.querySelector("#simple-farmer-stop"),
  simpleFarmerStatus: document.querySelector("#simple-farmer-status"),
  simpleFarmerNote: document.querySelector("#simple-farmer-note"),
  startSlice45LiveTest: document.querySelector("#start-slice-4-5-live-test"),
  slice45LiveTestStatus: document.querySelector("#slice-4-5-live-test-status"),
  slice45LiveTestNote: document.querySelector("#slice-4-5-live-test-note"),
  copySlice45LiveTestResult: document.querySelector("#copy-slice-4-5-live-test-result"),
  startSlice51LiveTest: document.querySelector("#start-slice-5-1-live-test"),
  slice51LiveTestStatus: document.querySelector("#slice-5-1-live-test-status"),
  slice51LiveTestNote: document.querySelector("#slice-5-1-live-test-note"),
  copySlice51LiveTestResult: document.querySelector("#copy-slice-5-1-live-test-result"),
  startSlice52LiveTest: document.querySelector("#start-slice-5-2-live-test"),
  slice52LiveTestStatus: document.querySelector("#slice-5-2-live-test-status"),
  slice52LiveTestNote: document.querySelector("#slice-5-2-live-test-note"),
  copySlice52LiveTestResult: document.querySelector("#copy-slice-5-2-live-test-result"),
  startSlice53LiveTest: document.querySelector("#start-slice-5-3-live-test"),
  slice53LiveTestStatus: document.querySelector("#slice-5-3-live-test-status"),
  slice53LiveTestNote: document.querySelector("#slice-5-3-live-test-note"),
  copySlice53LiveTestResult: document.querySelector("#copy-slice-5-3-live-test-result"),
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

function renderAccount() {
  const account = state.account;
  if (!account) return;

  const labels = {
    disconnected: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected",
    error: "Connection failed",
  };
  elements.accountStatus.textContent = labels[account.status] ?? account.status;
  elements.accountStatus.title = account.message ?? "";
  elements.accountUserId.textContent = account.userId ?? "—";
  elements.accountConnectedAt.textContent =
    account.connectedAt ? formatPublished(account.connectedAt) : "—";

  const connected = account.status === "connected";
  elements.accountForm.hidden = connected;
  elements.accountDisconnect.hidden = !connected;
  elements.accountConnect.disabled = account.status === "connecting";
}

function renderCharacterConnection() {
  const connection = state.character;
  if (!connection) return;

  const labels = {
    disconnected: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected",
    disconnecting: "Disconnecting…",
    error: "Connection failed",
  };
  elements.characterConnectionStatus.textContent =
    labels[connection.status] ?? connection.status;
  elements.characterConnectionStatus.title = connection.message ?? "";
  elements.activeCharacter.textContent =
    connection.characterName ?? connection.character?.name ?? "—";
  elements.characterServer.textContent =
    connection.serverRegion && connection.serverName
      ? `${connection.serverRegion} ${connection.serverName}`
      : "—";
  elements.characterConnectedAt.textContent =
    connection.connectedAt ? formatPublished(connection.connectedAt) : "—";

  const character = connection.character;
  elements.characterHp.textContent =
    character?.hp === undefined
      ? "—"
      : `${character.hp} / ${character.maxHp ?? "?"}`;
  elements.characterMp.textContent =
    character?.mp === undefined
      ? "—"
      : `${character.mp} / ${character.maxMp ?? "?"}`;
  elements.characterLevel.textContent =
    character?.level === undefined ? "—" : String(character.level);
  elements.characterXp.textContent =
    character?.xp === undefined
      ? "—"
      : `${character.xp} / ${character.maxXp ?? "?"}`;
  elements.characterMap.textContent = character?.map ?? "—";
  elements.characterPosition.textContent =
    character?.x === undefined || character?.y === undefined
      ? "—"
      : `${character.x.toFixed(1)}, ${character.y.toFixed(1)}`;
  elements.characterDirection.textContent =
    character?.directionLabel ??
    (character?.angle === undefined ? "—" : `${character.angle.toFixed(1)}°`);
  elements.characterTarget.textContent = character?.target ?? "None";
  elements.characterDeathState.textContent =
    character ? (character.dead ? "Dead" : "Alive") : "—";
  elements.characterPing.textContent =
    connection.pingMs === undefined
      ? (connection.status === "connected" ? "Measuring…" : "—")
      : `${Math.round(connection.pingMs)} ms`;

  const inventory = character?.inventory;
  const inventoryUsed = inventory?.filter(Boolean).length;
  const equipment = character?.equipment;
  const equipmentUsed = equipment
    ? Object.values(equipment).filter(Boolean).length
    : undefined;
  const conditions = character?.conditions;
  const conditionCount = conditions ? Object.keys(conditions).length : undefined;

  elements.characterGold.textContent =
    character?.gold === undefined ? "—" : character.gold.toLocaleString("en-US");
  elements.characterInventorySummary.textContent =
    inventory === undefined ? "—" : `${inventoryUsed} / ${inventory.length} used`;
  elements.characterEquipmentSummary.textContent =
    equipment === undefined ? "—" : `${equipmentUsed} equipped`;
  elements.characterConditionsSummary.textContent =
    conditions === undefined ? "—" : `${conditionCount} active`;

  const entities = connection.entities;
  const nearbyPlayers = entities?.filter((entity) => entity.kind === "player") ?? [];
  const nearbyMonsters = entities?.filter((entity) => entity.kind === "monster") ?? [];
  const party = connection.party;
  elements.characterEntitiesSummary.textContent =
    entities === undefined ? "—" : `${entities.length} visible`;
  elements.characterPlayersSummary.textContent =
    entities === undefined ? "—" : String(nearbyPlayers.length);
  elements.characterMonstersSummary.textContent =
    entities === undefined ? "—" : String(nearbyMonsters.length);
  elements.characterPartySummary.textContent =
    party === undefined
      ? "—"
      : party.inParty
        ? party.members.length
          ? `${party.members.length} members · Leader: ${party.leader ?? "Unknown"}`
          : `In party · Leader: ${party.leader ?? "Unknown"} · waiting for members`
        : "Solo";

  renderInventoryState(inventory);
  renderEquipmentState(equipment);
  renderConditionState(conditions);
  renderEntityState(entities);
  renderAttackTargets(nearbyMonsters, character, connection.status === "connected");
  renderPartyState(party);

  const busy = ["connecting", "connected", "disconnecting"].includes(connection.status);
  const canStart =
    state.account?.status === "connected" &&
    state.selection?.status === "ready" &&
    Boolean(state.selection?.selectedServerKey) &&
    Boolean(elements.characterSelect.value) &&
    !busy;
  elements.startCharacter.disabled = !canStart;
  elements.stopCharacter.hidden =
    connection.status !== "connected" && connection.status !== "connecting";
  elements.stopCharacter.disabled = connection.status === "disconnecting";
  elements.characterSelect.disabled = busy;
  elements.serverSelect.disabled = busy || state.selection?.status !== "ready";
  elements.selectServer.disabled =
    busy ||
    state.selection?.status !== "ready" ||
    (state.selection?.servers?.length ?? 0) === 0;
}

function renderInventoryState(inventory) {
  elements.characterInventory.replaceChildren();
  if (!inventory) {
    appendStateEmpty(elements.characterInventory, "Inventory state is not available.");
    return;
  }

  let rendered = 0;
  inventory.forEach((item, index) => {
    if (!item) return;
    appendStateCard(
      elements.characterInventory,
      `Slot ${index + 1}`,
      formatItemState(item),
    );
    rendered += 1;
  });
  if (!rendered) appendStateEmpty(elements.characterInventory, "Inventory is empty.");
}

function renderEquipmentState(equipment) {
  elements.characterEquipment.replaceChildren();
  if (!equipment) {
    appendStateEmpty(elements.characterEquipment, "Equipment state is not available.");
    return;
  }

  const equipped = Object.entries(equipment)
    .filter(([, item]) => Boolean(item))
    .sort(([left], [right]) => left.localeCompare(right));
  if (!equipped.length) {
    appendStateEmpty(elements.characterEquipment, "No equipment is currently equipped.");
    return;
  }
  for (const [slot, item] of equipped) {
    appendStateCard(elements.characterEquipment, slot, formatItemState(item));
  }
}

function renderConditionState(conditions) {
  elements.characterConditions.replaceChildren();
  if (!conditions) {
    appendStateEmpty(elements.characterConditions, "Condition state is not available.");
    return;
  }

  const entries = Object.entries(conditions).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (!entries.length) {
    appendStateEmpty(elements.characterConditions, "No active conditions.");
    return;
  }
  for (const [name, condition] of entries) {
    const details = [];
    if (typeof condition.ms === "number") {
      details.push(`${Math.max(0, Math.ceil(condition.ms / 1000))}s remaining`);
    }
    if (typeof condition.f === "string" && condition.f) {
      details.push(`Source: ${condition.f}`);
    }
    appendStateCard(
      elements.characterConditions,
      name,
      details.join(" · ") || "Active",
    );
  }
}

function renderEntityState(entities) {
  elements.characterEntities.replaceChildren();
  if (!entities) {
    appendStateEmpty(elements.characterEntities, "Nearby entity state is not available.");
    return;
  }
  if (!entities.length) {
    appendStateEmpty(elements.characterEntities, "No nearby entities are currently visible.");
    return;
  }

  const sorted = [...entities].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.name.localeCompare(right.name);
  });
  for (const entity of sorted) {
    const details = [
      entity.kind === "player" ? "Player" : "Monster",
      entity.type,
    ];
    if (typeof entity.level === "number") details.push(`Level ${entity.level}`);
    if (typeof entity.hp === "number") {
      details.push(`HP ${entity.hp} / ${entity.maxHp ?? "?"}`);
    }
    if (typeof entity.x === "number" && typeof entity.y === "number") {
      details.push(`${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}`);
    }
    if (entity.target) details.push(`Target: ${entity.target}`);
    appendStateCard(elements.characterEntities, entity.name, details.join(" · "));
  }
}

function renderAttackTargets(monsters, character, connected) {
  const previous = elements.attackTarget.value;
  elements.attackTarget.replaceChildren();

  if (!connected || !character || character.dead || !monsters.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = !connected
      ? "Connect a character first"
      : character?.dead
        ? "Character is dead"
        : "No visible monsters";
    elements.attackTarget.append(option);
    elements.runAttackTest.disabled = true;
    return;
  }

  for (const monster of monsters) {
    const option = document.createElement("option");
    option.value = monster.id;
    const details = [monster.type || "monster", `ID ${monster.id}`];
    if (
      typeof character.x === "number" &&
      typeof character.y === "number" &&
      typeof monster.x === "number" &&
      typeof monster.y === "number"
    ) {
      details.push(
        `Distance ${Math.hypot(monster.x - character.x, monster.y - character.y).toFixed(1)}`,
      );
    }
    if (typeof monster.hp === "number") {
      details.push(`HP ${monster.hp}${typeof monster.maxHp === "number" ? `/${monster.maxHp}` : ""}`);
    }
    option.textContent = details.join(" · ");
    elements.attackTarget.append(option);
  }

  elements.attackTarget.value = monsters.some((monster) => monster.id === previous)
    ? previous
    : monsters[0].id;
  elements.runAttackTest.disabled = !elements.attackTarget.value;
}

function renderSkillControls() {
  const payload = state.skillOptions;
  const previousSkill = elements.skillName.value;
  const previousTarget = elements.skillTarget.value;
  elements.skillName.replaceChildren();

  const skills = payload?.skills ?? [];
  if (payload?.status !== "ready" || !skills.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = payload?.message ?? "No supported skills";
    elements.skillName.append(option);
    elements.skillName.disabled = true;
    elements.skillTarget.replaceChildren();
    const targetOption = document.createElement("option");
    targetOption.value = "";
    targetOption.textContent = "No target available";
    elements.skillTarget.append(targetOption);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = true;
    elements.skillTestNote.textContent =
      payload?.message ??
      "Slice 3.4 safe skill options are not available yet.";
    return;
  }

  for (const skill of skills) {
    const option = document.createElement("option");
    option.value = skill.skillName;
    const details = [skill.displayName, skill.skillName];
    if (skill.mpCost > 0) details.push(`${skill.mpCost} MP`);
    if (typeof skill.cooldownMs === "number") {
      details.push(`${skill.cooldownMs} ms cooldown`);
    }
    option.textContent = details.join(" · ");
    elements.skillName.append(option);
  }
  elements.skillName.disabled = false;
  elements.skillName.value = skills.some((skill) => skill.skillName === previousSkill)
    ? previousSkill
    : skills[0].skillName;
  renderSkillTargets(previousTarget);
}

function renderSkillTargets(previousTarget = elements.skillTarget.value) {
  const skills = state.skillOptions?.skills ?? [];
  const skill = skills.find((entry) => entry.skillName === elements.skillName.value);
  elements.skillTarget.replaceChildren();

  if (!skill) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No skill selected";
    elements.skillTarget.append(option);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = true;
    return;
  }

  if (skill.targetMode === "none") {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No target required";
    elements.skillTarget.append(option);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = false;
  } else if (!skill.targets?.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `No in-range visible ${skill.targetMode} targets`;
    elements.skillTarget.append(option);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = true;
  } else {
    for (const target of skill.targets) {
      const option = document.createElement("option");
      option.value = target.id;
      const details = [target.name, target.kind, `ID ${target.id}`];
      if (typeof target.distance === "number") {
        details.push(`Distance ${target.distance.toFixed(1)}`);
      }
      option.textContent = details.join(" · ");
      elements.skillTarget.append(option);
    }
    elements.skillTarget.disabled = false;
    elements.skillTarget.value = skill.targets.some((target) => target.id === previousTarget)
      ? previousTarget
      : skill.targets[0].id;
    elements.runSkillTest.disabled = !elements.skillTarget.value;
  }

  const range = typeof skill.range === "number"
    ? ` Range: ${skill.range}.`
    : "";
  elements.skillTestNote.textContent =
    `Slice 3.4 safe skill: ${skill.displayName}. Target mode: ${skill.targetMode}. MP cost: ${skill.mpCost}.${range} One click sends at most one validated skill and waits for the Adventure Land server result; special, hostile, movement, item-consuming and multi-target payloads remain excluded.`;
}

function renderLootConsumableControls() {
  const payload = state.lootConsumableOptions;
  const previousChest = elements.lootChest.value;
  const previousConsumable = elements.consumableItem.value;

  elements.lootChest.replaceChildren();
  const chests = payload?.lootChests ?? [];
  if (payload?.status !== "ready" || chests.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = payload?.status !== "ready"
      ? payload?.message ?? "Loot options unavailable"
      : "No visible loot chests";
    elements.lootChest.append(option);
    elements.lootChest.disabled = true;
    elements.runLootTest.disabled = true;
  } else {
    for (const chest of chests) {
      const option = document.createElement("option");
      option.value = chest.id;
      const details = [`Chest ${chest.id}`];
      if (typeof chest.distance === "number") {
        details.push(`Distance ${chest.distance.toFixed(1)}`);
      }
      if (typeof chest.itemCount === "number") {
        details.push(`${chest.itemCount} item${chest.itemCount === 1 ? "" : "s"}`);
      }
      option.textContent = details.join(" · ");
      elements.lootChest.append(option);
    }
    elements.lootChest.disabled = false;
    elements.lootChest.value = chests.some((chest) => chest.id === previousChest)
      ? previousChest
      : chests[0].id;
    elements.runLootTest.disabled = !elements.lootChest.value;
  }

  elements.consumableItem.replaceChildren();
  const consumables = payload?.consumables ?? [];
  if (payload?.status !== "ready" || consumables.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = payload?.status !== "ready"
      ? payload?.message ?? "Consumable options unavailable"
      : "No supported HP/MP consumables";
    elements.consumableItem.append(option);
    elements.consumableItem.disabled = true;
    elements.runConsumableTest.disabled = true;
  } else {
    for (const item of consumables) {
      const option = document.createElement("option");
      option.value = String(item.inventoryIndex);
      const details = [
        item.displayName,
        item.kind.toUpperCase(),
        `+${item.restoreAmount}`,
        `Qty ${item.quantity}`,
        `Slot ${item.inventoryIndex}`,
      ];
      if (typeof item.cooldownMs === "number") {
        details.push(`${item.cooldownMs} ms cooldown`);
      }
      option.textContent = details.join(" · ");
      elements.consumableItem.append(option);
    }
    elements.consumableItem.disabled = false;
    elements.consumableItem.value = consumables.some((item) =>
      String(item.inventoryIndex) === previousConsumable
    )
      ? previousConsumable
      : String(consumables[0].inventoryIndex);
    elements.runConsumableTest.disabled = !elements.consumableItem.value;
  }

  if (payload?.status === "ready") {
    elements.lootConsumableTestNote.textContent =
      `Slice 3.5 currently exposes ${chests.length} visible loot chest(s) and ${consumables.length} validated HP/MP inventory item(s). Each click sends exactly one bounded request and waits for Adventure Land server confirmation; no automatic loop or free-form payload is available.`;
  } else {
    elements.lootConsumableTestNote.textContent =
      payload?.message ?? "Slice 3.5 loot and consumable options are unavailable.";
  }
}

function renderPartyState(party) {
  elements.characterParty.replaceChildren();
  if (!party) {
    appendStateEmpty(elements.characterParty, "Party state is not available.");
    return;
  }
  if (!party.inParty) {
    appendStateEmpty(elements.characterParty, "Character is not in a party.");
    return;
  }
  if (!party.members.length) {
    const leader = party.leader ? ` · Leader: ${party.leader}` : "";
    appendStateEmpty(
      elements.characterParty,
      `Party detected${leader}. Waiting for member details.`,
    );
    return;
  }

  for (const name of party.members) {
    const member = party.details?.[name];
    const details = [];
    if (name === party.leader) details.push("Leader");
    if (member?.type) details.push(member.type);
    if (typeof member?.level === "number") details.push(`Level ${member.level}`);
    if (member?.map) details.push(member.map);
    if (typeof member?.x === "number" && typeof member?.y === "number") {
      details.push(`${member.x.toFixed(1)}, ${member.y.toFixed(1)}`);
    }
    if (member?.dead === true) details.push("Dead");
    appendStateCard(elements.characterParty, name, details.join(" · ") || "Party member");
  }
}

function appendStateCard(container, titleText, detailText) {
  const card = document.createElement("article");
  card.className = "selection-card";

  const title = document.createElement("strong");
  title.textContent = titleText;

  const details = document.createElement("span");
  details.textContent = detailText;

  card.append(title, details);
  container.append(card);
}

function appendStateEmpty(container, message) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  container.append(empty);
}

function formatItemState(item) {
  if (!item) return "Empty";
  const name = typeof item.name === "string" ? item.name : "Unknown item";
  const details = [];
  if (typeof item.level === "number") details.push(`Level ${item.level}`);
  if (typeof item.q === "number") details.push(`Qty ${item.q}`);
  return details.length ? `${name} · ${details.join(" · ")}` : name;
}

function renderSelection() {
  const selection = state.selection;
  const connected = state.account?.status === "connected";
  elements.selectionPanel.hidden = !connected;
  if (!connected || !selection) return;

  const statusLabels = {
    disconnected: "Disconnected",
    loading: "Loading…",
    ready: "Ready",
    error: "Load failed",
  };
  elements.selectionStatus.textContent =
    statusLabels[selection.status] ?? selection.status;
  elements.selectionStatus.title = selection.message ?? "";
  elements.characterCount.textContent = String(selection.characters?.length ?? 0);
  elements.serverCount.textContent = String(selection.servers?.length ?? 0);

  const servers = selection.servers ?? [];
  const selected = servers.find(
    (server) => server.key === selection.selectedServerKey,
  );
  elements.selectedServer.textContent = selected
    ? `${selected.region} ${selected.name}`
    : "Not selected";

  elements.characterList.replaceChildren();
  const characters = selection.characters ?? [];

  const previousCharacter = elements.characterSelect.value;
  elements.characterSelect.replaceChildren();
  if (characters.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No characters available";
    elements.characterSelect.append(option);
  } else {
    for (const character of characters) {
      const option = document.createElement("option");
      option.value = character.id;
      option.textContent =
        `${character.name} · ${character.type} · Level ${character.level}`;
      elements.characterSelect.append(option);
    }
    const activeId = state.character?.characterId;
    elements.characterSelect.value =
      activeId && characters.some((character) => character.id === activeId)
        ? activeId
        : characters.some((character) => character.id === previousCharacter)
          ? previousCharacter
          : characters[0].id;
  }

  if (characters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      selection.status === "error"
        ? selection.message ?? "Characters could not be loaded."
        : "No characters were returned for this account.";
    elements.characterList.append(empty);
  } else {
    for (const character of characters) {
      const card = document.createElement("article");
      card.className = "selection-card";

      const name = document.createElement("strong");
      name.textContent = character.name;

      const details = document.createElement("span");
      details.textContent = `${character.type} · Level ${character.level}`;

      const presence = document.createElement("small");
      presence.textContent = character.online
        ? `Online${character.serverKey ? ` · ${character.serverKey}` : ""}`
        : "Offline";

      card.append(name, details, presence);
      elements.characterList.append(card);
    }
  }

  const previousValue = elements.serverSelect.value;
  elements.serverSelect.replaceChildren();
  if (servers.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No servers available";
    elements.serverSelect.append(option);
  } else {
    for (const server of servers) {
      const option = document.createElement("option");
      option.value = server.key;
      option.textContent =
        `${server.region} ${server.name} · ${server.players} players`;
      elements.serverSelect.append(option);
    }
    const preferred =
      selection.selectedServerKey &&
      servers.some((server) => server.key === selection.selectedServerKey)
        ? selection.selectedServerKey
        : servers.some((server) => server.key === previousValue)
          ? previousValue
          : servers[0].key;
    elements.serverSelect.value = preferred;
  }

  const characterBusy = ["connecting", "connected", "disconnecting"].includes(
    state.character?.status,
  );
  elements.selectServer.disabled =
    characterBusy || selection.status !== "ready" || servers.length === 0;
  elements.serverSelect.disabled =
    characterBusy || selection.status !== "ready" || servers.length === 0;
  elements.refreshSelection.disabled = selection.status === "loading";

  elements.serverList.replaceChildren();
  if (servers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      selection.status === "error"
        ? selection.message ?? "Servers could not be loaded."
        : "No servers are available.";
    elements.serverList.append(empty);
  } else {
    for (const server of servers) {
      const card = document.createElement("article");
      card.className = "selection-card";
      if (server.key === selection.selectedServerKey) {
        card.dataset.selected = "true";
      }

      const name = document.createElement("strong");
      name.textContent = `${server.region} ${server.name}`;

      const details = document.createElement("span");
      details.textContent = server.key;

      const players = document.createElement("small");
      players.textContent = `${server.players} players`;

      card.append(name, details, players);
      elements.serverList.append(card);
    }
  }

  renderCharacterConnection();
}

function renderActionGateway() {
  const gateway = state.actionGateway;
  if (!gateway) return;

  elements.actionGatewayStatus.textContent =
    gateway.status === "ready" ? "Ready" : gateway.status ?? "Unavailable";
  elements.actionGatewayActive.textContent = String(gateway.active ?? 0);
  elements.actionGatewayTotal.textContent = String(gateway.totalRequests ?? 0);
  elements.actionGatewayRequestId.textContent =
    gateway.lastResult?.requestId ?? "—";
  elements.actionGatewayOutcome.textContent =
    gateway.lastResult?.outcome ?? "—";
}

function renderSlice35LiveTest() {
  const test = state.slice35LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice35LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice35LiveTest.disabled = status === "running";
  elements.copySlice35LiveTestResult.hidden = !state.slice35LastReport;

  if (status === "running") {
    elements.slice35LiveTestNote.textContent =
      "The one-click test is preparing and validating the required live game state automatically. Do not perform manual gameplay actions while it is running.";
  } else if (test?.message) {
    elements.slice35LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice35LiveTestNote.textContent =
      "The test prepares a bounded safe game state automatically, runs the Slice 3.5 loot and consumable checks, verifies Adventure Land server responses and live postconditions, then copies the complete structured result and sanitized diagnostic log to the clipboard. No manual target, chest, item, movement, or combat preparation is required.";
  }
}

function renderScriptRuntime() {
  const runtime = state.scriptRuntime;
  const status = runtime?.status ?? "unavailable";
  const labels = {
    unloaded: "No script loaded",
    loaded: "Loaded",
    running: "Running",
    paused: "Paused",
    stopped: "Stopped",
    crashed: "Crashed",
    unavailable: "Unavailable",
  };

  elements.scriptRuntimeStatus.textContent = labels[status] ?? status;
  elements.scriptRuntimeStatus.title = runtime?.message ?? "";
  elements.scriptRuntimeName.textContent = runtime?.scriptName ?? "—";
  elements.scriptRuntimeTimers.textContent = String(runtime?.activeTimers ?? 0);
  elements.scriptRuntimeLogRecords.textContent = String(runtime?.logRecords ?? 0);

  elements.scriptRuntimeStart.disabled =
    !runtime || status === "unavailable" || status === "unloaded" || status === "running";
  elements.scriptRuntimePause.disabled = status !== "running";
  elements.scriptRuntimeStop.disabled =
    !runtime || status === "unavailable" || status === "unloaded" || status === "stopped";
}

function renderSlice41LiveTest() {
  const test = state.slice41LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice41LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice41LiveTest.disabled = status === "running";
  elements.copySlice41LiveTestResult.hidden = !state.slice41LastReport;

  if (status === "running") {
    elements.slice41LiveTestNote.textContent =
      "The test is automatically exercising the isolated script lifecycle. No Adventure Land gameplay preparation is required.";
  } else if (test?.message) {
    elements.slice41LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice41LiveTestNote.textContent =
      "The test automatically verifies script loading, isolated start, timer cleanup on pause and stop, crash isolation, recovery after a script crash, and separately marked script logs. No Adventure Land gameplay preparation is required.";
  }
}

function renderSlice42LiveTest() {
  const test = state.slice42LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice42LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice42LiveTest.disabled = status === "running";
  elements.copySlice42LiveTestResult.hidden = !state.slice42LastReport;

  if (status === "running") {
    elements.slice42LiveTestNote.textContent =
      "The bounded isolated script farmer is selecting and validating one low-risk target automatically. Do not perform manual gameplay actions while it is running.";
  } else if (test?.message) {
    elements.slice42LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice42LiveTestNote.textContent =
      "The test selects one bounded low-risk visible monster automatically, exercises the first Adventure Land-compatible script globals and helpers, then runs script-origin attack, loot, move, and direct-path xmove actions through the central Action Gateway. No manual target or developer controls are required.";
  }
}

function renderSlice43LiveTest() {
  const test = state.slice43LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice43LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice43LiveTest.disabled = status === "running";
  elements.copySlice43LiveTestResult.hidden = !state.slice43LastReport;

  if (status === "running") {
    elements.slice43LiveTestNote.textContent =
      "The isolated event script is observing fresh read-only headless state. Do not stop the character connection while the test is running.";
  } else if (test?.message) {
    elements.slice43LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice43LiveTestNote.textContent =
      "The test observes a real entities event, validates its safe worker snapshot, and verifies listener cleanup across off(), pause, stop, restart, and handler crash without gameplay mutation.";
  }
}

function renderSlice44LiveTest() {
  const test = state.slice44LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice44LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice44LiveTest.disabled = status === "running";
  elements.copySlice44LiveTestResult.hidden = !state.slice44LastReport;

  if (status === "running") {
    elements.slice44LiveTestNote.textContent =
      "The isolated storage probe is verifying local persistence and namespace isolation. No Adventure Land connection is required.";
  } else if (test?.message) {
    elements.slice44LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice44LiveTestNote.textContent =
      "The test writes JSON state with set(), restores it with get() in a fresh worker, proves a second script uses a separate namespace, then verifies del() and bounded test cleanup.";
  }
}

function renderSimpleFarmer() {
  const options = state.simpleFarmerOptions;
  const farmer = state.simpleFarmer;
  const selected = elements.simpleFarmerMonster.value;
  const monsters = Array.isArray(options?.monsters) ? options.monsters : [];
  elements.simpleFarmerMonster.replaceChildren();
  if (!monsters.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No visible monsters";
    elements.simpleFarmerMonster.append(option);
  } else {
    for (const monster of monsters) {
      const option = document.createElement("option");
      option.value = monster;
      option.textContent = monster;
      elements.simpleFarmerMonster.append(option);
    }
    elements.simpleFarmerMonster.value = monsters.includes(selected) ? selected : monsters[0];
  }

  const running = farmer?.status === "running";
  elements.simpleFarmerStatus.textContent = running
    ? "Running"
    : farmer?.status === "error"
      ? "Error"
      : farmer?.status === "stopped"
        ? "Stopped"
        : "Idle";
  elements.simpleFarmerStart.disabled = options?.status !== "ready" || !monsters.length || running;
  elements.simpleFarmerStop.disabled = !running;
  elements.simpleFarmerNote.textContent = farmer?.message ??
    options?.message ??
    "Configure a currently visible monster type. Slice 4.5 does not navigate.";
}

function renderSlice45LiveTest() {
  const test = state.slice45LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice45LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice45LiveTest.disabled = status === "running";
  elements.copySlice45LiveTestResult.hidden = !state.slice45LastReport;
  if (status === "running") {
    elements.slice45LiveTestNote.textContent =
      "The bounded test is selecting a safe visible monster, approaching it automatically when needed, then verifying real server-confirmed attack and loot.";
  } else if (test?.message) {
    elements.slice45LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice45LiveTestNote.textContent =
      "The test selects one low-risk visible monster, approaches it automatically when needed, starts the no-code Simple Farmer, proves script-origin attack and loot, then stops and verifies cleanup.";
  }
}

function renderSlice51LiveTest() {
  const test = state.slice51LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice51LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice51LiveTest.disabled = status === "running";
  elements.copySlice51LiveTestResult.hidden = !state.slice51LastReport;
  if (status === "running") {
    elements.slice51LiveTestNote.textContent =
      "Observing passive Core, Character, and Script heartbeat sequences. No reconnect, restart, or gameplay mutation is performed.";
  } else if (test?.message) {
    elements.slice51LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice51LiveTestNote.textContent =
      "Verifies passive Core, Character, and isolated Script heartbeats using a read-only character state refresh.";
  }
}

function renderSlice52LiveTest() {
  const test = state.slice52LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice52LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice52LiveTest.disabled = status === "running";
  elements.copySlice52LiveTestResult.hidden = !state.slice52LastReport;
  if (status === "running") {
    elements.slice52LiveTestNote.textContent =
      "The real character socket is being interrupted once. ALRemastered is verifying bounded backoff, automatic reconnect, ordered logs, and fresh state without gameplay mutation.";
  } else if (test?.message) {
    elements.slice52LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice52LiveTestNote.textContent =
      "Intentionally interrupts the real headless character socket and verifies disconnect detection, bounded reconnect, and recovery evidence.";
  }
}

function renderSlice53LiveTest() {
  const test = state.slice53LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice53LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice53LiveTest.disabled = status === "running";
  elements.copySlice53LiveTestResult.hidden = !state.slice53LastReport;
  if (status === "running") {
    elements.slice53LiveTestNote.textContent =
      "Verifying real death evidence, server-confirmed respawn through the central Action Gateway, and continuation of the same isolated script run.";
  } else if (test?.message) {
    elements.slice53LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice53LiveTestNote.textContent =
      "Requires a real server-observed dead Character. The harness handles respawn and script-continuation verification without raw socket access.";
  }
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

async function refreshAccount() {
  try {
    const response = await fetch("/api/account", { cache: "no-store" });
    if (!response.ok) return;
    state.account = await response.json();
    renderAccount();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshSelection() {
  try {
    const response = await fetch("/api/selection", { cache: "no-store" });
    if (!response.ok) return;
    state.selection = await response.json();
    renderSelection();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshCharacterConnection() {
  try {
    const response = await fetch("/api/character", { cache: "no-store" });
    if (!response.ok) return;
    state.character = await response.json();
    renderCharacterConnection();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshActionGateway() {
  try {
    const response = await fetch("/api/action-gateway", { cache: "no-store" });
    if (!response.ok) return;
    state.actionGateway = await response.json();
    renderActionGateway();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshSkillOptions() {
  try {
    const response = await fetch("/api/action-gateway/skill-options", {
      cache: "no-store",
    });
    state.skillOptions = await response.json();
    renderSkillControls();
  } catch {
    state.skillOptions = {
      status: "unavailable",
      message: "Skill options could not be loaded.",
      skills: [],
    };
    renderSkillControls();
  }
}

async function refreshLootConsumableOptions() {
  try {
    const response = await fetch("/api/action-gateway/loot-consumable-options", {
      cache: "no-store",
    });
    state.lootConsumableOptions = await response.json();
    renderLootConsumableControls();
  } catch {
    state.lootConsumableOptions = {
      status: "unavailable",
      message: "Loot and consumable options could not be loaded.",
      lootChests: [],
      consumables: [],
    };
    renderLootConsumableControls();
  }
}

async function refreshSlice35LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-3-5", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice35LiveTest = {
        status: "unavailable",
        message: "Slice 3.5 one-click live test is unavailable.",
      };
    } else {
      state.slice35LiveTest = await response.json();
    }
    renderSlice35LiveTest();
  } catch {
    state.slice35LiveTest = {
      status: "unavailable",
      message: "Slice 3.5 one-click live-test status could not be loaded.",
    };
    renderSlice35LiveTest();
  }
}

async function refreshScriptRuntime() {
  try {
    const response = await fetch("/api/script-runtime", { cache: "no-store" });
    if (!response.ok) {
      state.scriptRuntime = {
        status: "unavailable",
        message: "Script runtime is unavailable.",
      };
    } else {
      state.scriptRuntime = await response.json();
    }
    renderScriptRuntime();
  } catch {
    state.scriptRuntime = {
      status: "unavailable",
      message: "Script runtime status could not be loaded.",
    };
    renderScriptRuntime();
  }
}

async function refreshSlice41LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-1", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice41LiveTest = {
        status: "unavailable",
        message: "Slice 4.1 one-click live test is unavailable.",
      };
    } else {
      state.slice41LiveTest = await response.json();
    }
    renderSlice41LiveTest();
  } catch {
    state.slice41LiveTest = {
      status: "unavailable",
      message: "Slice 4.1 one-click live-test status could not be loaded.",
    };
    renderSlice41LiveTest();
  }
}

async function refreshSlice42LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-2", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice42LiveTest = {
        status: "unavailable",
        message: "Slice 4.2 one-click live test is unavailable.",
      };
    } else {
      state.slice42LiveTest = await response.json();
    }
    renderSlice42LiveTest();
  } catch {
    state.slice42LiveTest = {
      status: "unavailable",
      message: "Slice 4.2 one-click live-test status could not be loaded.",
    };
    renderSlice42LiveTest();
  }
}

async function refreshSlice43LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-3", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice43LiveTest = {
        status: "unavailable",
        message: "Slice 4.3 one-click live test is unavailable.",
      };
    } else {
      state.slice43LiveTest = await response.json();
    }
    renderSlice43LiveTest();
  } catch {
    state.slice43LiveTest = {
      status: "unavailable",
      message: "Slice 4.3 one-click live-test status could not be loaded.",
    };
    renderSlice43LiveTest();
  }
}

async function refreshSlice44LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-4", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice44LiveTest = {
        status: "unavailable",
        message: "Slice 4.4 one-click storage test is unavailable.",
      };
    } else {
      state.slice44LiveTest = await response.json();
    }
    renderSlice44LiveTest();
  } catch {
    state.slice44LiveTest = {
      status: "unavailable",
      message: "Slice 4.4 one-click storage-test status could not be loaded.",
    };
    renderSlice44LiveTest();
  }
}

async function refreshSimpleFarmer() {
  try {
    const [optionsResponse, stateResponse] = await Promise.all([
      fetch("/api/simple-farmer/options", { cache: "no-store" }),
      fetch("/api/simple-farmer", { cache: "no-store" }),
    ]);
    state.simpleFarmerOptions = await optionsResponse.json();
    state.simpleFarmer = await stateResponse.json();
    renderSimpleFarmer();
  } catch {
    state.simpleFarmerOptions = { status: "unavailable", monsters: [], message: "Simple Farmer status could not be loaded." };
    state.simpleFarmer = { status: "error", message: "Simple Farmer status could not be loaded." };
    renderSimpleFarmer();
  }
}

async function refreshSlice45LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-5", { cache: "no-store" });
    state.slice45LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 4.5 one-click live test is unavailable." };
    renderSlice45LiveTest();
  } catch {
    state.slice45LiveTest = {
      status: "unavailable",
      message: "Slice 4.5 one-click live-test status could not be loaded.",
    };
    renderSlice45LiveTest();
  }
}

async function refreshSlice51LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-5-1", { cache: "no-store" });
    state.slice51LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 5.1 heartbeat test is unavailable." };
    renderSlice51LiveTest();
  } catch {
    state.slice51LiveTest = {
      status: "unavailable",
      message: "Slice 5.1 heartbeat-test status could not be loaded.",
    };
    renderSlice51LiveTest();
  }
}

async function refreshSlice52LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-5-2", { cache: "no-store" });
    state.slice52LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 5.2 reconnect test is unavailable." };
    renderSlice52LiveTest();
  } catch {
    state.slice52LiveTest = {
      status: "unavailable",
      message: "Slice 5.2 reconnect-test status could not be loaded.",
    };
    renderSlice52LiveTest();
  }
}

async function refreshSlice53LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-5-3", { cache: "no-store" });
    state.slice53LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 5.3 death/respawn recovery test is unavailable." };
    renderSlice53LiveTest();
  } catch {
    state.slice53LiveTest = {
      status: "unavailable",
      message: "Slice 5.3 death/respawn recovery status could not be loaded.",
    };
    renderSlice53LiveTest();
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

async function waitForUpdatedDashboard(previousVersion, expectedVersion) {
  if (state.updateReconnectPending) return;
  state.updateReconnectPending = true;

  const deadline = Date.now() + 2 * 60 * 1000;
  let sawDisconnect = false;
  setFeedback(
    "Installing update. Keep this dashboard open; it will reload automatically.",
    "success",
  );

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const status = await response.json();
      const expectedVersionReached =
        expectedVersion && status.version === expectedVersion;
      const versionChanged =
        previousVersion && status.version !== previousVersion;

      if (expectedVersionReached || (sawDisconnect && versionChanged)) {
        setFeedback(
          `ALRemastered ${status.version} installed successfully. Reloading dashboard…`,
          "success",
        );
        window.location.reload();
        return;
      }
    } catch {
      sawDisconnect = true;
      elements.connectionStatus.textContent = "Installing update…";
      elements.connectionStatus.classList.remove("online");
    }
  }

  state.updateReconnectPending = false;
  setFeedback(
    "The update was started, but the dashboard did not reconnect automatically. Reload this page after ALRemastered finishes updating.",
    "error",
  );
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
    elements.connectionStatus.textContent = state.updateReconnectPending
      ? "Installing update…"
      : "Reconnecting…";
    elements.connectionStatus.classList.remove("online");
  });
}

async function accountAction(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.account = payload;
  renderAccount();
  return payload;
}

async function selectionAction(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.selection = payload;
  renderSelection();
  return payload;
}

async function characterAction(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.character = payload;
  renderCharacterConnection();
  return payload;
}

async function actionGatewayProbe() {
  const response = await fetch("/api/action-gateway/probe", { method: "POST" });
  const payload = await response.json();
  await refreshActionGateway();
  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
      payload.error ??
      `Gateway probe failed with HTTP ${response.status}`,
    );
  }
  return payload;
}

async function movementTest(direction) {
  const response = await fetch("/api/action-gateway/movement-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      mode: elements.movementMode.value,
      direction,
    }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
      payload.error ??
      `Movement test failed with HTTP ${response.status}`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function attackTest() {
  const targetId = elements.attackTarget.value;
  if (!targetId) throw new Error("Select a visible monster first.");

  const response = await fetch("/api/action-gateway/attack-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ targetId }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Attack test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function skillTest() {
  const skillName = elements.skillName.value;
  if (!skillName) throw new Error("Select a supported skill first.");
  const targetId = elements.skillTarget.disabled
    ? undefined
    : elements.skillTarget.value || undefined;

  const response = await fetch("/api/action-gateway/skill-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ skillName, targetId }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  await refreshSkillOptions();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Skill test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function lootTest() {
  const chestId = elements.lootChest.value;
  if (!chestId) throw new Error("Select a visible loot chest first.");

  const response = await fetch("/api/action-gateway/loot-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chestId }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  await refreshLootConsumableOptions();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Loot test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function consumableTest() {
  const inventoryIndex = Number(elements.consumableItem.value);
  const option = (state.lootConsumableOptions?.consumables ?? []).find(
    (item) => item.inventoryIndex === inventoryIndex,
  );
  if (!option) throw new Error("Select a validated HP/MP consumable first.");

  const response = await fetch("/api/action-gateway/consumable-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      inventoryIndex: option.inventoryIndex,
      itemName: option.itemName,
      kind: option.kind,
    }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  await refreshLootConsumableOptions();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Consumable test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

function beginDeferredClipboardWrite() {
  if (
    navigator.clipboard?.write &&
    typeof ClipboardItem === "function"
  ) {
    let resolveText;
    const textPromise = new Promise((resolve) => {
      resolveText = resolve;
    });
    const item = new ClipboardItem({
      "text/plain": textPromise.then((text) =>
        new Blob([text], { type: "text/plain;charset=utf-8" })
      ),
    });
    const writePromise = navigator.clipboard.write([item]).then(
      () => true,
      () => false,
    );
    return {
      finish: async (text) => {
        resolveText(text);
        return await writePromise;
      },
    };
  }

  return {
    finish: async (text) => {
      try {
        await writeClipboard(text);
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function startSlice35LiveTest(clipboardWrite) {
  state.slice35LiveTest = {
    status: "running",
    message: "Slice 3.5 one-click live test is running.",
  };
  renderSlice35LiveTest();

  const response = await fetch("/api/live-test/slice-3-5/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 3.5 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 3.5 live test returned no copyable report.");
  }

  state.slice35LastReport = payload.reportText;
  state.slice35LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 3.5 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice35LiveTest();
  await refreshCharacterConnection();
  await refreshActionGateway();
  await refreshSkillOptions();
  await refreshLootConsumableOptions();

  return { payload, copied };
}

async function scriptRuntimeAction(path, body) {
  const options = { method: "POST" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.scriptRuntime = payload;
  renderScriptRuntime();
  return payload;
}

async function startSlice41LiveTest(clipboardWrite) {
  state.slice41LiveTest = {
    status: "running",
    message: "Slice 4.1 one-click live test is running.",
  };
  renderSlice41LiveTest();

  const response = await fetch("/api/live-test/slice-4-1/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.1 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.1 live test returned no copyable report.");
  }

  state.slice41LastReport = payload.reportText;
  state.slice41LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.1 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice41LiveTest();
  await refreshScriptRuntime();
  await refreshDiagnostics();

  return { payload, copied };
}

async function startSlice42LiveTest(clipboardWrite) {
  state.slice42LiveTest = {
    status: "running",
    message: "Slice 4.2 one-click live test is running.",
  };
  renderSlice42LiveTest();

  const response = await fetch("/api/live-test/slice-4-2/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.2 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.2 live test returned no copyable report.");
  }

  state.slice42LastReport = payload.reportText;
  state.slice42LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.2 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice42LiveTest();
  await refreshScriptRuntime();
  await refreshCharacterConnection();
  await refreshActionGateway();
  await refreshDiagnostics();

  return { payload, copied };
}

async function startSlice43LiveTest(clipboardWrite) {
  state.slice43LiveTest = {
    status: "running",
    message: "Slice 4.3 one-click live test is running.",
  };
  renderSlice43LiveTest();

  const response = await fetch("/api/live-test/slice-4-3/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.3 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.3 live test returned no copyable report.");
  }

  state.slice43LastReport = payload.reportText;
  state.slice43LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.3 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice43LiveTest();
  await refreshScriptRuntime();
  await refreshCharacterConnection();
  await refreshDiagnostics();

  return { payload, copied };
}

async function startSlice44LiveTest(clipboardWrite) {
  state.slice44LiveTest = {
    status: "running",
    message: "Slice 4.4 one-click storage test is running.",
  };
  renderSlice44LiveTest();

  const response = await fetch("/api/live-test/slice-4-4/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.4 storage test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.4 storage test returned no copyable report.");
  }

  state.slice44LastReport = payload.reportText;
  state.slice44LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.4 storage test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice44LiveTest();
  await refreshScriptRuntime();
  await refreshDiagnostics();

  return { payload, copied };
}

async function simpleFarmerAction(path, body) {
  const options = { method: "POST" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.simpleFarmer = payload;
  renderSimpleFarmer();
  await refreshScriptRuntime();
  return payload;
}

async function startSlice45LiveTest(clipboardWrite) {
  state.slice45LiveTest = {
    status: "running",
    message: "Slice 4.5 one-click live test is running.",
  };
  renderSlice45LiveTest();
  const response = await fetch("/api/live-test/slice-4-5/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Slice 4.5 live test failed with HTTP ${response.status}`);
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.5 live test returned no copyable report.");
  }
  state.slice45LastReport = payload.reportText;
  state.slice45LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.5 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice45LiveTest();
  await refreshSimpleFarmer();
  await refreshScriptRuntime();
  await refreshCharacterConnection();
  await refreshActionGateway();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice51LiveTest(clipboardWrite) {
  state.slice51LiveTest = {
    status: "running",
    message: "Slice 5.1 heartbeat test is running.",
  };
  renderSlice51LiveTest();
  const response = await fetch("/api/live-test/slice-5-1/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Slice 5.1 heartbeat test failed with HTTP ${response.status}`);
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 5.1 heartbeat test returned no copyable report.");
  }
  state.slice51LastReport = payload.reportText;
  state.slice51LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 5.1 heartbeat test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice51LiveTest();
  await refreshStatus();
  await refreshCharacterConnection();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice52LiveTest(clipboardWrite) {
  state.slice52LiveTest = {
    status: "running",
    message: "Slice 5.2 reconnect test is running.",
  };
  renderSlice52LiveTest();
  const response = await fetch("/api/live-test/slice-5-2/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Slice 5.2 reconnect test failed with HTTP ${response.status}`);
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 5.2 reconnect test returned no copyable report.");
  }
  state.slice52LastReport = payload.reportText;
  state.slice52LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 5.2 reconnect test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice52LiveTest();
  await refreshCharacterConnection();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice53LiveTest(clipboardWrite) {
  state.slice53LiveTest = {
    status: "running",
    message: "Slice 5.3 death/respawn recovery test is running.",
  };
  renderSlice53LiveTest();
  const response = await fetch("/api/live-test/slice-5-3/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 5.3 death/respawn recovery test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 5.3 death/respawn recovery test returned no copyable report.");
  }
  state.slice53LastReport = payload.reportText;
  state.slice53LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 5.3 death/respawn recovery test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice53LiveTest();
  await refreshCharacterConnection();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
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

elements.accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.accountConnect.disabled = true;
  setFeedback("Connecting to Adventure Land…");
  try {
    const account = await accountAction("/api/account/login", {
      email: elements.accountEmail.value,
      password: elements.accountPassword.value,
    });
    if (account.status === "connected") {
      elements.accountEmail.value = "";
      await refreshSelection();
      const selection = state.selection;
      if (selection?.status === "ready") {
        setFeedback(
          `Adventure Land account connected. Loaded ${selection.characters.length} characters and ${selection.servers.length} servers.`,
          "success",
        );
      } else {
        setFeedback(
          selection?.message ?? "Adventure Land account connected.",
          selection?.status === "error" ? "error" : "success",
        );
      }
    } else {
      setFeedback(account.message ?? "Adventure Land account connection failed.", "error");
    }
  } catch (error) {
    setFeedback(`Adventure Land account connection failed: ${error.message}`, "error");
  } finally {
    elements.accountPassword.value = "";
    elements.accountConnect.disabled = false;
  }
});

elements.accountDisconnect.addEventListener("click", async () => {
  elements.accountDisconnect.disabled = true;
  try {
    await accountAction("/api/account/disconnect");
    state.selection = {
      status: "disconnected",
      characters: [],
      servers: [],
      message: "Connect an Adventure Land account to load characters and servers.",
    };
    state.character = {
      status: "disconnected",
      message: "No headless Adventure Land character is connected.",
    };
    renderSelection();
    renderCharacterConnection();
    elements.accountEmail.value = "";
    elements.accountPassword.value = "";
    setFeedback("Adventure Land account disconnected.", "success");
  } catch (error) {
    setFeedback(`Account disconnect failed: ${error.message}`, "error");
  } finally {
    elements.accountDisconnect.disabled = false;
  }
});

elements.refreshSelection.addEventListener("click", async () => {
  elements.refreshSelection.disabled = true;
  setFeedback("Refreshing Adventure Land characters and servers…");
  try {
    const selection = await selectionAction("/api/selection/refresh");
    if (selection.status === "ready") {
      setFeedback(
        `Loaded ${selection.characters.length} characters and ${selection.servers.length} servers.`,
        "success",
      );
    } else {
      setFeedback(selection.message ?? "Character and server refresh failed.", "error");
    }
  } catch (error) {
    setFeedback(`Character and server refresh failed: ${error.message}`, "error");
  } finally {
    elements.refreshSelection.disabled = false;
  }
});

elements.selectServer.addEventListener("click", async () => {
  const serverKey = elements.serverSelect.value;
  if (!serverKey) return;
  elements.selectServer.disabled = true;
  try {
    const selection = await selectionAction("/api/selection/server", { serverKey });
    setFeedback(selection.message ?? "Adventure Land server selected.", "success");
  } catch (error) {
    setFeedback(`Server selection failed: ${error.message}`, "error");
  } finally {
    elements.selectServer.disabled = false;
  }
});

elements.startCharacter.addEventListener("click", async () => {
  const characterId = elements.characterSelect.value;
  if (!characterId) return;
  elements.startCharacter.disabled = true;
  setFeedback("Starting headless Adventure Land character connection…");
  try {
    const connection = await characterAction("/api/character/start", { characterId });
    if (connection.status === "connected") {
      setFeedback(
        `${connection.characterName} connected headlessly to ${connection.serverRegion} ${connection.serverName}. No automation is running.`,
        "success",
      );
    } else {
      setFeedback(connection.message ?? "Character connection failed.", "error");
    }
  } catch (error) {
    setFeedback(`Character connection failed: ${error.message}`, "error");
  } finally {
    renderCharacterConnection();
  }
});

elements.stopCharacter.addEventListener("click", async () => {
  elements.stopCharacter.disabled = true;
  try {
    const connection = await characterAction("/api/character/stop");
    setFeedback(connection.message ?? "Headless character disconnected.", "success");
  } catch (error) {
    setFeedback(`Character disconnect failed: ${error.message}`, "error");
  } finally {
    renderCharacterConnection();
  }
});

elements.runActionGatewayProbe.addEventListener("click", async () => {
  elements.runActionGatewayProbe.disabled = true;
  setFeedback("Running local action gateway probe…");
  try {
    const result = await actionGatewayProbe();
    setFeedback(
      `Action gateway probe completed. Request ID: ${result.requestId}. Outcome: ${result.outcome}.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Action gateway probe failed: ${error.message}`, "error");
  } finally {
    elements.runActionGatewayProbe.disabled = false;
  }
});

for (const button of elements.movementButtons) {
  button.addEventListener("click", async () => {
    const direction = button.dataset.movementDirection;
    if (!direction) return;

    for (const movementButton of elements.movementButtons) {
      movementButton.disabled = true;
    }
    setFeedback(
      `Running ${elements.movementMode.value} ${direction} movement test…`,
    );
    try {
      const result = await movementTest(direction);
      const target = result.result
        ? ` Target: (${result.result.targetX}, ${result.result.targetY}).`
        : "";
      const confirmed = result.result?.serverConfirmed
        ? ` Confirmed position: (${result.result.confirmedX}, ${result.result.confirmedY}).`
        : "";
      setFeedback(
        `Movement confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}.${target}${confirmed}`,
        "success",
      );
    } catch (error) {
      setFeedback(`Movement test failed: ${error.message}`, "error");
    } finally {
      for (const movementButton of elements.movementButtons) {
        movementButton.disabled = false;
      }
    }
  });
}

elements.attackTarget.addEventListener("change", () => {
  elements.runAttackTest.disabled = !elements.attackTarget.value;
});

elements.runAttackTest.addEventListener("click", async () => {
  const targetId = elements.attackTarget.value;
  if (!targetId) return;
  elements.runAttackTest.disabled = true;
  setFeedback(`Attacking selected monster ${targetId} once…`);
  try {
    const result = await attackTest();
    const cooldown = typeof result.result?.cooldownMs === "number"
      ? ` Cooldown: ${result.result.cooldownMs} ms.`
      : "";
    setFeedback(
      `Attack confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Target: ${result.result?.targetType ?? targetId} (${targetId}).${cooldown}`,
      "success",
    );
  } catch (error) {
    setFeedback(`Attack test failed: ${error.message}`, "error");
  } finally {
    renderCharacterConnection();
  }
});

elements.skillName.addEventListener("change", () => {
  renderSkillTargets("");
});

elements.skillTarget.addEventListener("change", () => {
  const skills = state.skillOptions?.skills ?? [];
  const skill = skills.find((entry) => entry.skillName === elements.skillName.value);
  elements.runSkillTest.disabled = !skill ||
    (skill.targetMode !== "none" && !elements.skillTarget.value);
});

elements.runSkillTest.addEventListener("click", async () => {
  const skillName = elements.skillName.value;
  if (!skillName) return;
  elements.runSkillTest.disabled = true;
  setFeedback(`Using safe skill ${skillName} once…`);
  try {
    const result = await skillTest();
    const target = result.result?.targetName
      ? ` Target: ${result.result.targetName} (${result.result.targetId}).`
      : "";
    const cooldown = typeof result.result?.cooldownMs === "number"
      ? ` Cooldown: ${result.result.cooldownMs} ms.`
      : "";
    setFeedback(
      `Skill confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Skill: ${result.result?.displayName ?? skillName}.${target}${cooldown}`,
      "success",
    );
  } catch (error) {
    setFeedback(`Skill test failed: ${error.message}`, "error");
  } finally {
    await refreshSkillOptions();
  }
});

elements.lootChest.addEventListener("change", () => {
  elements.runLootTest.disabled = !elements.lootChest.value;
});

elements.runLootTest.addEventListener("click", async () => {
  const chestId = elements.lootChest.value;
  if (!chestId) return;
  elements.runLootTest.disabled = true;
  setFeedback("Looting selected visible chest once…");
  try {
    const result = await lootTest();
    setFeedback(
      `Loot confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Chest: ${result.result?.chestId ?? chestId}.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Loot test failed: ${error.message}`, "error");
  } finally {
    await refreshLootConsumableOptions();
  }
});

elements.consumableItem.addEventListener("change", () => {
  elements.runConsumableTest.disabled = !elements.consumableItem.value;
});

elements.runConsumableTest.addEventListener("click", async () => {
  const inventoryIndex = Number(elements.consumableItem.value);
  const option = (state.lootConsumableOptions?.consumables ?? []).find(
    (item) => item.inventoryIndex === inventoryIndex,
  );
  if (!option) return;
  elements.runConsumableTest.disabled = true;
  setFeedback(`Using ${option.displayName} once…`);
  try {
    const result = await consumableTest();
    const cooldown = typeof result.result?.cooldownMs === "number"
      ? ` Cooldown: ${result.result.cooldownMs} ms.`
      : "";
    setFeedback(
      `Consumable confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Item: ${result.result?.displayName ?? option.displayName}. Resource: ${option.kind.toUpperCase()}.${cooldown}`,
      "success",
    );
  } catch (error) {
    setFeedback(`Consumable test failed: ${error.message}`, "error");
  } finally {
    await refreshLootConsumableOptions();
  }
});

elements.startSlice35LiveTest.addEventListener("click", async () => {
  if (state.slice35LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice35LastReport = null;
  elements.copySlice35LiveTestResult.hidden = true;
  setFeedback(
    "Slice 3.5 live test started. Safe preparation and all checks now run automatically.",
  );

  try {
    const { payload, copied } = await startSlice35LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 3.5 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice35LiveTest();
    setFeedback(
      `Slice 3.5 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice35LiveTest();
  }
});

elements.copySlice35LiveTestResult.addEventListener("click", async () => {
  if (!state.slice35LastReport) return;
  try {
    await writeClipboard(state.slice35LastReport);
    setFeedback(
      "Complete Slice 3.5 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.scriptRuntimeLoad.addEventListener("click", async () => {
  elements.scriptRuntimeLoad.disabled = true;
  setFeedback("Loading script into the isolated runtime…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/load", {
      name: elements.scriptRuntimeScriptName.value,
      source: elements.scriptRuntimeSource.value,
    });
    setFeedback(`Script loaded: ${runtime.scriptName}.`, "success");
  } catch (error) {
    setFeedback(`Script load failed: ${error.message}`, "error");
  } finally {
    elements.scriptRuntimeLoad.disabled = false;
    await refreshScriptRuntime();
  }
});

elements.scriptRuntimeStart.addEventListener("click", async () => {
  setFeedback("Starting script in its isolated worker…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/start");
    setFeedback(
      runtime.status === "running"
        ? `Script started: ${runtime.scriptName}.`
        : `Script start ended with status ${runtime.status}: ${runtime.message}`,
      runtime.status === "running" ? "success" : "error",
    );
  } catch (error) {
    setFeedback(`Script start failed: ${error.message}`, "error");
  } finally {
    await refreshScriptRuntime();
  }
});

elements.scriptRuntimePause.addEventListener("click", async () => {
  setFeedback("Pausing script and clearing its timers…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/pause");
    setFeedback(`Script status: ${runtime.status}. Active timers: ${runtime.activeTimers}.`, "success");
  } catch (error) {
    setFeedback(`Script pause failed: ${error.message}`, "error");
  } finally {
    await refreshScriptRuntime();
  }
});

elements.scriptRuntimeStop.addEventListener("click", async () => {
  setFeedback("Stopping script and releasing its worker…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/stop");
    setFeedback(`Script status: ${runtime.status}. Active timers: ${runtime.activeTimers}.`, "success");
  } catch (error) {
    setFeedback(`Script stop failed: ${error.message}`, "error");
  } finally {
    await refreshScriptRuntime();
  }
});

elements.startSlice41LiveTest.addEventListener("click", async () => {
  if (state.slice41LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice41LastReport = null;
  elements.copySlice41LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.1 live test started. Script lifecycle and crash-isolation checks now run automatically.",
  );

  try {
    const { payload, copied } = await startSlice41LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.1 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice41LiveTest();
    setFeedback(
      `Slice 4.1 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice41LiveTest();
  }
});

elements.copySlice41LiveTestResult.addEventListener("click", async () => {
  if (!state.slice41LastReport) return;
  try {
    await writeClipboard(state.slice41LastReport);
    setFeedback(
      "Complete Slice 4.1 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice42LiveTest.addEventListener("click", async () => {
  if (state.slice42LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice42LastReport = null;
  elements.copySlice42LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.2 live test started. A bounded isolated script farmer now runs automatically.",
  );

  try {
    const { payload, copied } = await startSlice42LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.2 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice42LiveTest();
    setFeedback(
      `Slice 4.2 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice42LiveTest();
  }
});

elements.copySlice42LiveTestResult.addEventListener("click", async () => {
  if (!state.slice42LastReport) return;
  try {
    await writeClipboard(state.slice42LastReport);
    setFeedback(
      "Complete Slice 4.2 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice43LiveTest.addEventListener("click", async () => {
  if (state.slice43LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice43LastReport = null;
  elements.copySlice43LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.3 live test started. Fresh read-only game events are now verified automatically.",
  );

  try {
    const { payload, copied } = await startSlice43LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.3 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice43LiveTest();
    setFeedback(
      `Slice 4.3 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice43LiveTest();
  }
});

elements.copySlice43LiveTestResult.addEventListener("click", async () => {
  if (!state.slice43LastReport) return;
  try {
    await writeClipboard(state.slice43LastReport);
    setFeedback(
      "Complete Slice 4.3 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice44LiveTest.addEventListener("click", async () => {
  if (state.slice44LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice44LastReport = null;
  elements.copySlice44LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.4 storage test started. Persistence and namespace isolation checks now run automatically.",
  );

  try {
    const { payload, copied } = await startSlice44LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.4 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice44LiveTest();
    setFeedback(
      `Slice 4.4 one-click storage test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice44LiveTest();
  }
});

elements.copySlice44LiveTestResult.addEventListener("click", async () => {
  if (!state.slice44LastReport) return;
  try {
    await writeClipboard(state.slice44LastReport);
    setFeedback(
      "Complete Slice 4.4 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.simpleFarmerStart.addEventListener("click", async () => {
  setFeedback("Starting the no-code Simple Farmer Template…");
  try {
    const farmer = await simpleFarmerAction("/api/simple-farmer/start", {
      monster: elements.simpleFarmerMonster.value,
      hpThresholdPercent: Number(elements.simpleFarmerHpThreshold.value),
      mpThresholdPercent: Number(elements.simpleFarmerMpThreshold.value),
      loot: elements.simpleFarmerLoot.checked,
      respawn: elements.simpleFarmerRespawn.checked,
    });
    setFeedback(farmer.message ?? "Simple Farmer started.", "success");
  } catch (error) {
    setFeedback(`Simple Farmer start failed: ${error.message}`, "error");
  } finally {
    await refreshSimpleFarmer();
  }
});

elements.simpleFarmerStop.addEventListener("click", async () => {
  setFeedback("Stopping Simple Farmer…");
  try {
    const farmer = await simpleFarmerAction("/api/simple-farmer/stop");
    setFeedback(farmer.message ?? "Simple Farmer stopped.", "success");
  } catch (error) {
    setFeedback(`Simple Farmer stop failed: ${error.message}`, "error");
  } finally {
    await refreshSimpleFarmer();
  }
});

elements.startSlice45LiveTest.addEventListener("click", async () => {
  if (state.slice45LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice45LastReport = null;
  elements.copySlice45LiveTestResult.hidden = true;
  setFeedback("Slice 4.5 live farm test started. The test will select and approach a safe monster automatically, then verify attack and loot.");
  try {
    const { payload, copied } = await startSlice45LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.5 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice45LiveTest();
    setFeedback(`Slice 4.5 one-click test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice45LiveTest();
  }
});

elements.copySlice45LiveTestResult.addEventListener("click", async () => {
  if (!state.slice45LastReport) return;
  try {
    await writeClipboard(state.slice45LastReport);
    setFeedback("Complete Slice 4.5 test result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice51LiveTest.addEventListener("click", async () => {
  if (state.slice51LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice51LastReport = null;
  elements.copySlice51LiveTestResult.hidden = true;
  setFeedback("Slice 5.1 heartbeat test started. Core, Character, and Script liveness will be observed passively.");
  try {
    const { payload, copied } = await startSlice51LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 5.1 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice51LiveTest();
    setFeedback(`Slice 5.1 heartbeat test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice51LiveTest();
  }
});

elements.copySlice51LiveTestResult.addEventListener("click", async () => {
  if (!state.slice51LastReport) return;
  try {
    await writeClipboard(state.slice51LastReport);
    setFeedback("Complete Slice 5.1 heartbeat result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Heartbeat-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice52LiveTest.addEventListener("click", async () => {
  if (state.slice52LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice52LastReport = null;
  elements.copySlice52LiveTestResult.hidden = true;
  setFeedback("Slice 5.2 reconnect test started. The real character socket will be interrupted once and recovered automatically.");
  try {
    const { payload, copied } = await startSlice52LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 5.2 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice52LiveTest();
    setFeedback(`Slice 5.2 reconnect test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice52LiveTest();
  }
});

elements.copySlice52LiveTestResult.addEventListener("click", async () => {
  if (!state.slice52LastReport) return;
  try {
    await writeClipboard(state.slice52LastReport);
    setFeedback("Complete Slice 5.2 reconnect result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Reconnect-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice53LiveTest.addEventListener("click", async () => {
  if (state.slice53LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice53LastReport = null;
  elements.copySlice53LiveTestResult.hidden = true;
  setFeedback(
    "Slice 5.3 recovery test started. A real server-observed death state is required; respawn and script continuation are handled automatically.",
  );
  try {
    const { payload, copied } = await startSlice53LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 5.3 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice53LiveTest();
    setFeedback(`Slice 5.3 death/respawn recovery test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice53LiveTest();
  }
});

elements.copySlice53LiveTestResult.addEventListener("click", async () => {
  if (!state.slice53LastReport) return;
  try {
    await writeClipboard(state.slice53LastReport);
    setFeedback(
      "Complete Slice 5.3 death/respawn recovery result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Death/respawn recovery-result copy failed: ${error.message}`, "error");
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
    const previousVersion = state.status?.version ?? state.update?.currentVersion;
    const update = await updateAction("/api/update/install");
    setFeedback(
      update.message ?? "Update verified. Installing automatically…",
      "success",
    );
    void waitForUpdatedDashboard(previousVersion, update.latestVersion);
  } catch (error) {
    setFeedback(`Update installation failed: ${error.message}`, "error");
    await refreshUpdate();
  }
});

await refreshStatus();
await refreshAccount();
await refreshSelection();
await refreshCharacterConnection();
await refreshActionGateway();
await refreshSkillOptions();
await refreshLootConsumableOptions();
await refreshSlice35LiveTest();
await refreshScriptRuntime();
await refreshSlice41LiveTest();
await refreshSlice42LiveTest();
await refreshSlice43LiveTest();
await refreshSlice44LiveTest();
await refreshSimpleFarmer();
await refreshSlice45LiveTest();
await refreshSlice51LiveTest();
await refreshSlice52LiveTest();
await refreshSlice53LiveTest();
await refreshGameVersion();
await refreshGameData();
await refreshUpdate();
await refreshDiagnostics();
await loadLogs();
connectStream();
setInterval(refreshStatus, 3000);
setInterval(refreshAccount, 2000);
setInterval(refreshSelection, 2000);
setInterval(refreshCharacterConnection, 1500);
setInterval(refreshActionGateway, 2000);
setInterval(refreshSkillOptions, 1500);
setInterval(refreshLootConsumableOptions, 1500);
setInterval(refreshSlice35LiveTest, 1500);
setInterval(refreshScriptRuntime, 1500);
setInterval(refreshSlice41LiveTest, 1500);
setInterval(refreshSlice42LiveTest, 1500);
setInterval(refreshSlice43LiveTest, 1500);
setInterval(refreshSlice44LiveTest, 1500);
setInterval(refreshSimpleFarmer, 1500);
setInterval(refreshSlice45LiveTest, 1500);
setInterval(refreshSlice51LiveTest, 1500);
setInterval(refreshSlice52LiveTest, 1500);
setInterval(refreshSlice53LiveTest, 1500);
setInterval(refreshGameVersion, 2000);
setInterval(refreshGameData, 2000);
setInterval(refreshUpdate, 1500);
setInterval(refreshDiagnostics, 1500);
setInterval(updateStatusView, 1000);
