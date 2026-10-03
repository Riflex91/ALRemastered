import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { DiagnosticsService } from "../src/diagnostics/service.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes status, logs and sanitized export on loopback", async () => {
  const runtime = new CoreRuntime();
  runtime.start();

  const logger = new Logger({ component: "test", ringSize: 20 });
  logger.info("Connected token=secret-value", { password: "hidden-password", safe: "visible" });

  const dashboard = new DashboardServer({
    logger,
    runtime,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const status = await fetch(`${url}/api/status`);
    assert.equal(status.status, 200);
    const statusPayload = await status.json();
    assert.equal(statusPayload.application, "ALRemastered");
    assert.equal(statusPayload.status, "running");

    const logs = await fetch(`${url}/api/logs`);
    assert.equal(logs.status, 200);
    const logPayload = await logs.json();
    assert.ok(logPayload.records.length >= 2);

    const exported = await fetch(`${url}/api/logs/export`);
    assert.equal(exported.status, 200);
    const exportPayload = await exported.json();
    assert.equal(exportPayload.sanitized, true);
    assert.doesNotMatch(exportPayload.text, /secret-value|hidden-password/);
    assert.match(exportPayload.text, /Secrets sanitized: yes/);

    const traversal = await fetch(`${url}/package.json`);
    assert.equal(traversal.status, 404);

    const cleared = await fetch(`${url}/api/logs/clear`, { method: "POST" });
    assert.equal(cleared.status, 200);
    const afterClear = await fetch(`${url}/api/logs`);
    const afterClearPayload = await afterClear.json();
    assert.equal(afterClearPayload.records.length, 0);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard streams new log records with server-sent events", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "stream-test" });
  const dashboard = new DashboardServer({ logger, runtime, host: "127.0.0.1", port: 0 });
  const url = await dashboard.start();

  const controller = new AbortController();
  try {
    const response = await fetch(`${url}/api/logs/stream`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.ok(response.body);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    logger.warn("Live dashboard event.");

    let received = "";
    for (let attempt = 0; attempt < 5 && !received.includes("Live dashboard event."); attempt += 1) {
      const result = await reader.read();
      if (result.done) break;
      received += decoder.decode(result.value, { stream: true });
    }

    assert.match(received, /event: log/);
    assert.match(received, /Live dashboard event\./);
  } finally {
    controller.abort();
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard user interface contains the required English controls", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  for (const label of [
    "Core status",
    "Client version",
    "Uptime",
    "Debug Console",
    "Auto-scroll",
    "Copy full log",
    "Copy filtered log",
    "Download log",
    "Clear log",
    "Check for updates",
    "Install update",
    "Skip this version",
    "Remind me tomorrow",
    "Release notes",
    "Diagnostics overview",
    "Recent errors",
    "Copy diagnostic snapshot",
    "Download diagnostic package",
    "Check game version",
    "Adventure Land version",
    "Game version status",
    "Last deploy",
    "Adventure Land account",
    "Account status",
    "Account ID",
    "Connected at",
    "Email",
    "Password",
    "Connect account",
    "Disconnect account",
    "Password and session are kept in memory only",
    "Characters and servers",
    "Refresh characters and servers",
    "Selection status",
    "Characters",
    "Servers",
    "Selected server",
    "Server selection",
    "Use selected server",
    "No character is started",
    "Game data",
    "Reload game data",
    "Game data status",
    "Game data version",
    "Loaded families",
    "Loaded at",
    "Game data source",
    "Cache status",
    "Cached at",
    "Simple Farmer Template",
    "Monster",
    "HP threshold %",
    "MP threshold %",
    "Loot",
    "Respawn",
    "Start Simple Farmer",
    "Stop Simple Farmer",
    "Slice 4.5 one-click live farm test",
  ]) {
    assert.equal(html.includes(label), true, `Missing dashboard label: ${label}`);
  }
});


test("dashboard update API delegates update actions", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-update-test" });
  const available = {
    status: "available",
    currentVersion: "0.1.0-alpha.4",
    latestVersion: "0.1.0-alpha.5",
    publishedAt: "2026-10-02T14:00:00.000Z",
    releaseNotesUrl: "https://github.com/Riflex91/ALRemastered/releases/tag/v0.1.0-alpha.5",
  };
  const fakeUpdateService = {
    state: () => available,
    checkNow: async () => available,
    skipVersion: () => ({ ...available, status: "deferred", message: "This version will be skipped." }),
    remindTomorrow: () => ({ ...available, status: "deferred", message: "This update will be shown again tomorrow." }),
    installUpdate: async () => ({ ...available, status: "installing", progressPercent: 100 }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    updateService: fakeUpdateService,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/update`);
    assert.equal((await current.json()).status, "available");

    const checked = await fetch(`${url}/api/update/check`, { method: "POST" });
    assert.equal((await checked.json()).latestVersion, "0.1.0-alpha.5");

    const skipped = await fetch(`${url}/api/update/skip`, { method: "POST" });
    assert.equal((await skipped.json()).status, "deferred");

    const reminded = await fetch(`${url}/api/update/remind`, { method: "POST" });
    assert.equal((await reminded.json()).status, "deferred");

    const installing = await fetch(`${url}/api/update/install`, { method: "POST" });
    assert.equal((await installing.json()).status, "installing");
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes sanitized diagnostics snapshot and package", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-diagnostics-test" });
  const diagnostics = new DiagnosticsService(logger, () => runtime.health());
  diagnostics.registerComponent("core", () => ({
    name: "core",
    status: "healthy",
    message: "Core runtime is running.",
  }));
  logger.error(
    "Dashboard request failed.",
    new Error("password=diagnostic-secret"),
    { token: "hidden-token", route: "/api/synthetic" },
  );

  const dashboard = new DashboardServer({
    logger,
    runtime,
    diagnostics,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const snapshotResponse = await fetch(`${url}/api/diagnostics/snapshot`);
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.sanitized, true);
    assert.equal(snapshot.recentErrors.length, 1);
    assert.equal(snapshot.components[0].name, "core");
    assert.doesNotMatch(JSON.stringify(snapshot), /diagnostic-secret|hidden-token/);

    const packageResponse = await fetch(`${url}/api/diagnostics/package`);
    assert.equal(packageResponse.status, 200);
    assert.match(packageResponse.headers.get("content-disposition") ?? "", /ALRemastered-diagnostics-/);
    const diagnosticPackage = await packageResponse.text();
    assert.match(diagnosticPackage, /ALRemasteredDiagnosticPackage/);
    assert.doesNotMatch(diagnosticPackage, /diagnostic-secret|hidden-token/);
  } finally {
    await dashboard.stop();
    diagnostics.dispose();
    runtime.stop();
  }
});

test("dashboard script provides technical details and Copy full log on error cards", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /Technical details/);
  assert.match(script, /copy\.textContent = "Copy full log"/);
  assert.match(script, /refreshDiagnostics/);
});


test("dashboard game version API exposes state and manual checks", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-game-version-test" });
  const current = {
    status: "current",
    currentVersion: 15555,
    storedVersion: 15555,
    lastDeploy: "[10/09/26]",
    checkedAt: "2026-10-02T16:30:00.000Z",
    sourceUrl: "https://example.test/version.js",
    message: "Stored Adventure Land version matches the current online version.",
  };
  let checks = 0;
  const fakeGameVersionService = {
    state: () => current,
    checkNow: async () => {
      checks += 1;
      return current;
    },
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    gameVersionService: fakeGameVersionService,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const stateResponse = await fetch(`${url}/api/game-version`);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.currentVersion, 15555);
    assert.equal(state.status, "current");

    const checkResponse = await fetch(`${url}/api/game-version/check`, { method: "POST" });
    assert.equal(checkResponse.status, 200);
    assert.equal((await checkResponse.json()).currentVersion, 15555);
    assert.equal(checks, 1);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard script renders Adventure Land version state", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /refreshGameVersion/);
  assert.match(script, /Changed from/);
  assert.match(script, /Checking Adventure Land game version/);
});


test("dashboard game data API exposes loading state and manual reload", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-game-data-test" });
  const loaded = {
    status: "loaded",
    version: 15555,
    loadedAt: "2026-10-02T17:00:00.000Z",
    sourceUrl: "https://example.test/data.js",
    bytes: 1234,
    origin: "cache",
    cacheStatus: "loaded",
    cachedAt: "2026-10-02T16:55:00.000Z",
    familyCount: 14,
    loadedFamilyCount: 14,
    families: [
      { name: "items", required: true, loaded: true, count: 900 },
      { name: "geometry", required: true, loaded: true, count: 42 },
      { name: "events", required: false, loaded: true, count: 8 },
    ],
    message: "Adventure Land game data is loaded and available.",
  };
  let reloads = 0;
  const fakeGameDataService = {
    state: () => loaded,
    loadNow: async () => {
      reloads += 1;
      return loaded;
    },
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    gameDataService: fakeGameDataService,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const stateResponse = await fetch(`${url}/api/game-data`);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.status, "loaded");
    assert.equal(state.version, 15555);
    assert.equal(state.origin, "cache");
    assert.equal(state.cacheStatus, "loaded");
    assert.equal(state.loadedFamilyCount, 14);

    const reloadResponse = await fetch(`${url}/api/game-data/reload`, { method: "POST" });
    assert.equal(reloadResponse.status, 200);
    assert.equal((await reloadResponse.json()).status, "loaded");
    assert.equal(reloads, 1);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard script renders Adventure Land game data families and counts", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /refreshGameData/);
  assert.match(script, /G\.\$\{family\.name\}/);
  assert.match(script, /entries/);
  assert.match(script, /Local cache/);
  assert.match(script, /cacheStatusLabels/);
  assert.match(script, /Reloading Adventure Land game data/);
});


test("dashboard account API accepts credentials without exposing secrets", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-account-test" });
  let received: { email: string; password: string } | undefined;
  let state = {
    status: "disconnected",
    message: "No Adventure Land account is connected.",
  };
  const fakeAccountService = {
    state: () => state,
    login: async (credentials: { email: string; password: string }) => {
      received = credentials;
      state = {
        status: "connected",
        userId: "user-123",
        connectedAt: "2026-10-02T20:00:00.000Z",
        message: "Adventure Land account is connected.",
      } as typeof state;
      return state;
    },
    disconnect: () => {
      state = {
        status: "disconnected",
        message: "Adventure Land account disconnected from this ALRemastered process.",
      };
      return state;
    },
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    accountService: fakeAccountService as any,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const initial = await fetch(`${url}/api/account`);
    assert.equal((await initial.json()).status, "disconnected");

    const login = await fetch(`${url}/api/account/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "player@example.test",
        password: "dashboard-password-secret",
      }),
    });
    assert.equal(login.status, 200);
    const connected = await login.json();
    assert.equal(connected.status, "connected");
    assert.equal(connected.userId, "user-123");
    assert.equal(received?.email, "player@example.test");
    assert.equal(received?.password, "dashboard-password-secret");
    assert.doesNotMatch(JSON.stringify(connected), /dashboard-password-secret|auth/);

    const disconnected = await fetch(`${url}/api/account/disconnect`, { method: "POST" });
    assert.equal((await disconnected.json()).status, "disconnected");
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard account login rejects missing credentials without logging them", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-account-validation-test" });
  const fakeAccountService = {
    state: () => ({ status: "disconnected", message: "Disconnected." }),
    login: async () => ({ status: "connected", message: "Connected." }),
    disconnect: () => ({ status: "disconnected", message: "Disconnected." }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    accountService: fakeAccountService as any,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const response = await fetch(`${url}/api/account/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "player@example.test", password: "" }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Email and password are required/);
    assert.doesNotMatch(logger.exportText(), /player@example\.test/);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard script renders account connection state and clears password input", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /refreshAccount/);
  assert.match(script, /Connecting to Adventure Land/);
  assert.match(script, /accountPassword\.value = ""/);
  assert.match(script, /\/api\/account\/login/);
  assert.match(script, /\/api\/account\/disconnect/);
});


test("dashboard update flow keeps the current page and reloads after the new backend starts", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /waitForUpdatedDashboard/);
  assert.match(script, /Keep this dashboard open; it will reload automatically/);
  assert.match(script, /window\.location\.reload\(\)/);
  assert.match(script, /expectedVersionReached/);
  assert.match(script, /updateReconnectPending/);
});


test("dashboard selection API exposes characters and stores only the chosen server", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-selection-test" });
  let state = {
    status: "ready",
    characters: [{
      id: "CH_1",
      name: "RangerOne",
      type: "ranger",
      level: 45,
      online: false,
    }],
    servers: [
      { key: "SR_EUI", name: "I", region: "EU", players: 100 },
      { key: "SR_USI", name: "I", region: "US", players: 80 },
    ],
    message: "Loaded 1 characters and 2 servers.",
  };
  const fakeSelectionService = {
    state: () => state,
    refresh: async () => state,
    clear: () => {
      state = {
        status: "disconnected",
        characters: [],
        servers: [],
        message: "Disconnected.",
      } as typeof state;
      return state;
    },
    selectServer: (serverKey: string) => {
      if (!state.servers.some((server) => server.key === serverKey)) {
        throw new Error("The selected Adventure Land server is not available.");
      }
      state = {
        ...state,
        selectedServerKey: serverKey,
        message: "Server selected. No character has been started.",
      } as typeof state;
      return state;
    },
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    selectionService: fakeSelectionService as any,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/selection`);
    const currentPayload = await current.json();
    assert.equal(currentPayload.characters[0].name, "RangerOne");
    assert.equal(currentPayload.servers.length, 2);

    const selected = await fetch(`${url}/api/selection/server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverKey: "SR_USI" }),
    });
    const selectedPayload = await selected.json();
    assert.equal(selectedPayload.selectedServerKey, "SR_USI");
    assert.match(selectedPayload.message, /No character has been started/);

    const refreshed = await fetch(`${url}/api/selection/refresh`, { method: "POST" });
    assert.equal((await refreshed.json()).status, "ready");

    const startAttempt = await fetch(`${url}/api/selection/start`, { method: "POST" });
    assert.equal(startAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard script renders character and server selection without a character start action", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /renderSelection/);
  assert.match(script, /Level \$\{character\.level\}/);
  assert.match(script, /\/api\/selection\/refresh/);
  assert.match(script, /\/api\/selection\/server/);
  assert.doesNotMatch(script, /\/api\/selection\/start/);
});


test("dashboard character API starts and stops one headless connection without automation", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-character-test" });
  let state = {
    status: "disconnected",
    message: "No headless Adventure Land character is connected.",
  };
  let startedCharacterId = "";
  let stopReason = "";
  const fakeCharacterService = {
    state: () => state,
    start: async (characterId: string) => {
      startedCharacterId = characterId;
      state = {
        status: "connected",
        characterId,
        characterName: "RangerOne",
        serverKey: "SR_EUII",
        serverRegion: "EU",
        serverName: "II",
        connectedAt: "2026-10-02T20:05:00.000Z",
        pingMs: 37,
        lastLiveUpdateAt: "2026-10-02T20:05:01.000Z",
        character: {
          id: characterId,
          name: "RangerOne",
          type: "ranger",
          level: 45,
          xp: 12345,
          maxXp: 50000,
          hp: 3500,
          maxHp: 4000,
          mp: 850,
          maxMp: 1000,
          map: "main",
          x: 12,
          y: 34,
          direction: 2,
          directionLabel: "Right",
          target: "goo-1",
          dead: false,
          inventory: [{ name: "hpot0", q: 20 }, null, { name: "scroll0", level: 0 }],
          equipment: { mainhand: { name: "bow", level: 3 }, helmet: null },
          gold: 123456,
          conditions: { mluck: { ms: 5000, f: "Merchant" } },
        },
        entities: [
          { id: "MageOne", kind: "player", name: "MageOne", type: "mage", level: 50, x: 25, y: 45 },
          { id: "goo-1", kind: "monster", name: "goo-1", type: "goo", hp: 90, maxHp: 120, x: 36, y: 46 },
        ],
        party: {
          inParty: true,
          leader: "RangerOne",
          members: ["RangerOne", "MageOne"],
          details: {
            RangerOne: { name: "RangerOne", type: "ranger", level: 45, map: "main" },
            MageOne: { name: "MageOne", type: "mage", level: 50, map: "main" },
          },
        },
        message: "RangerOne is connected headlessly. Live state is updating; no automation is running.",
      } as typeof state;
      return state;
    },
    stop: async (reason: string) => {
      stopReason = reason;
      state = {
        status: "disconnected",
        message: "No headless Adventure Land character is connected.",
      };
      return state;
    },
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    characterService: fakeCharacterService as any,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const initial = await fetch(`${url}/api/character`);
    assert.equal((await initial.json()).status, "disconnected");

    const started = await fetch(`${url}/api/character/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: "CH_1" }),
    });
    assert.equal(started.status, 200);
    const startedPayload = await started.json();
    assert.equal(startedPayload.status, "connected");
    assert.equal(startedPayload.character.gold, 123456);
    assert.equal(startedPayload.character.inventory[0].name, "hpot0");
    assert.equal(startedPayload.character.equipment.mainhand.name, "bow");
    assert.equal(startedPayload.character.conditions.mluck.ms, 5000);
    assert.equal(startedPayload.entities.length, 2);
    assert.equal(startedPayload.entities[0].kind, "player");
    assert.equal(startedPayload.party.leader, "RangerOne");
    assert.deepEqual(startedPayload.party.members, ["RangerOne", "MageOne"]);
    assert.equal(startedCharacterId, "CH_1");

    const automationAttempt = await fetch(`${url}/api/character/automation`, {
      method: "POST",
    });
    assert.equal(automationAttempt.status, 405);

    const stopped = await fetch(`${url}/api/character/stop`, { method: "POST" });
    assert.equal((await stopped.json()).status, "disconnected");
    assert.equal(stopReason, "dashboard");
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard script exposes only headless character start and disconnect controls", () => {
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  assert.match(script, /refreshCharacterConnection/);
  assert.match(script, /\/api\/character\/start/);
  assert.match(script, /\/api\/character\/stop/);
  assert.match(script, /No automation is running/);
  assert.doesNotMatch(script, /\/api\/character\/automation/);
});


test("dashboard renders Slice 2.4 base live-state fields", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const id of [
    "character-hp",
    "character-mp",
    "character-level",
    "character-xp",
    "character-map",
    "character-position",
    "character-direction",
    "character-target",
    "character-death-state",
    "character-ping",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(script, /character\?\.hp/);
  assert.match(script, /character\?\.xp/);
  assert.match(script, /character\?\.map/);
  assert.match(script, /character\?\.directionLabel/);
  assert.match(script, /character\?\.target/);
  assert.match(script, /character\.dead/);
  assert.match(script, /connection\.pingMs/);
});


test("dashboard renders Slice 2.5 inventory equipment gold and condition state", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const id of [
    "character-gold",
    "character-inventory-summary",
    "character-equipment-summary",
    "character-conditions-summary",
    "character-inventory",
    "character-equipment",
    "character-conditions",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(script, /character\?\.gold/);
  assert.match(script, /character\?\.inventory/);
  assert.match(script, /character\?\.equipment/);
  assert.match(script, /character\?\.conditions/);
  assert.match(script, /renderInventoryState/);
  assert.match(script, /renderEquipmentState/);
  assert.match(script, /renderConditionState/);
  assert.doesNotMatch(script, /\/api\/character\/(buy|sell|equip|unequip|use|swap)/);
});


test("dashboard renders Slice 2.6 nearby entities and party state", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const id of [
    "character-entities-summary",
    "character-players-summary",
    "character-monsters-summary",
    "character-party-summary",
    "character-entities",
    "character-party",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(script, /connection\.entities/);
  assert.match(script, /entity\.kind === "player"/);
  assert.match(script, /entity\.kind === "monster"/);
  assert.match(script, /connection\.party/);
  assert.match(script, /party\.members/);
  assert.match(script, /party\.leader/);
  assert.match(script, /renderEntityState/);
  assert.match(script, /renderPartyState/);
  assert.doesNotMatch(script, /\/api\/character\/(invite|party|request|accept|leave|move|attack)/);
});


test("dashboard exposes a fixed local-only Action Gateway probe", async () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-action-gateway-test" });
  let requestNumber = 0;
  const actionGateway = new ActionGateway({
    logger,
    idFactory: () => `act-dashboard-${++requestNumber}`,
    nowMs: () => 1_000,
  });
  const fakeCharacterService = {
    state: () => ({
      status: "connected",
      characterId: "CH_probe",
      characterName: "ProbeCharacter",
      message: "Connected.",
    }),
  };

  const movementService = {
    runDashboardTest: async (request: { mode: "move" | "xmove"; direction: string }) => ({
      requestId: "act-movement-test",
      action: request.mode === "xmove" ? "character.xmove" : "character.move",
      origin: "dashboard",
      characterId: "CH_probe",
      startedAt: 1_000,
      completedAt: 1_001,
      durationMs: 1,
      outcome: "success",
      result: {
        mode: request.mode,
        direction: request.direction,
        map: "main",
        fromX: 100,
        fromY: 100,
        targetX: 132,
        targetY: 100,
        transport: "move",
        path: "direct",
      },
    }),
  };

  const attackService = {
    runDashboardTest: async (request: { targetId: string }) => ({
      requestId: "act-attack-test",
      action: "character.attack",
      origin: "dashboard",
      characterId: "CH_probe",
      startedAt: "2026-10-03T00:00:00.000Z",
      completedAt: "2026-10-03T00:00:00.010Z",
      durationMs: 10,
      outcome: "success",
      result: {
        targetId: request.targetId,
        targetName: request.targetId,
        targetType: "goo",
        distance: 50,
        range: 120,
        serverAccepted: true,
        cooldownMs: 700,
      },
    }),
  };

  const skillService = {
    dashboardOptions: () => ({
      status: "ready",
      message: "Safe simple skills are available for manual dashboard testing.",
      characterId: "CH_probe",
      skills: [{
        skillName: "massproduction",
        displayName: "Mass Production",
        targetMode: "none",
        mpCost: 20,
        cooldownMs: 50,
        targets: [],
      }],
    }),
    runDashboardTest: async (request: {
      skillName: string;
      targetId?: string;
    }) => ({
      requestId: "act-skill-test",
      action: "character.skill",
      origin: "dashboard",
      characterId: "CH_probe",
      startedAt: "2026-10-03T00:00:00.000Z",
      completedAt: "2026-10-03T00:00:00.010Z",
      durationMs: 10,
      outcome: "success",
      result: {
        skillName: request.skillName,
        displayName: "Mass Production",
        targetId: request.targetId,
        mpCost: 20,
        serverAccepted: true,
        cooldownMs: 50,
      },
    }),
  };

  const lootConsumableService = {
    dashboardOptions: () => ({
      status: "ready",
      message: "Bounded loot and consumable options are available.",
      characterId: "CH_probe",
      lootChests: [{
        id: "chest-probe",
        map: "main",
        x: 110,
        y: 100,
        itemCount: 1,
        distance: 10,
      }],
      consumables: [{
        inventoryIndex: 0,
        itemName: "hpot0",
        displayName: "HP Potion",
        kind: "hp",
        quantity: 5,
        restoreAmount: 200,
        cooldownMs: 2000,
      }],
    }),
    runDashboardLoot: async (request: { chestId: string }) => ({
      requestId: "act-loot-test",
      action: "character.loot",
      origin: "dashboard",
      characterId: "CH_probe",
      startedAt: "2026-10-03T00:00:00.000Z",
      completedAt: "2026-10-03T00:00:00.010Z",
      durationMs: 10,
      outcome: "success",
      result: {
        chestId: request.chestId,
        map: "main",
        distance: 10,
        itemCount: 1,
        serverAccepted: true,
      },
    }),
    runDashboardConsumable: async (request: {
      inventoryIndex: number;
      itemName: string;
      kind: "hp" | "mp";
    }) => ({
      requestId: "act-consumable-test",
      action: "character.consume",
      origin: "dashboard",
      characterId: "CH_probe",
      startedAt: "2026-10-03T00:00:00.000Z",
      completedAt: "2026-10-03T00:00:00.010Z",
      durationMs: 10,
      outcome: "success",
      result: {
        inventoryIndex: request.inventoryIndex,
        itemName: request.itemName,
        displayName: "HP Potion",
        kind: request.kind,
        quantityBefore: 5,
        restoreAmount: 200,
        serverAccepted: true,
        cooldownMs: 2000,
      },
    }),
  };

  const slice35LiveTestService = {
    state: () => ({
      status: "idle",
      message: "Slice 3.5 one-click live test is ready.",
    }),
    run: async () => ({
      testId: "live35-dashboard",
      slice: "3.5",
      outcome: "passed",
      startedAt: "2026-10-03T12:00:00.000Z",
      completedAt: "2026-10-03T12:00:01.000Z",
      characterId: "CH_probe",
      characterName: "ProbeCharacter",
      serverKey: "SR_EUII",
      steps: [{
        name: "loot",
        outcome: "passed",
        message: "Loot passed.",
      }, {
        name: "consumable",
        outcome: "passed",
        message: "Consumable passed.",
      }],
      message: "Slice 3.5 passed.",
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    actionGateway,
    characterService: fakeCharacterService as any,
    movementService: movementService as any,
    attackService: attackService as any,
    skillService: skillService as any,
    lootConsumableService: lootConsumableService as any,
    slice35LiveTestService: slice35LiveTestService as any,
    host: "127.0.0.1",
    port: 0,
  });

  const url = await dashboard.start();
  try {
    const initial = await fetch(`${url}/api/action-gateway`);
    assert.equal(initial.status, 200);
    const initialPayload = await initial.json();
    assert.equal(initialPayload.status, "ready");
    assert.equal(initialPayload.active, 0);
    assert.equal(initialPayload.totalRequests, 0);

    const probe = await fetch(`${url}/api/action-gateway/probe`, { method: "POST" });
    assert.equal(probe.status, 200);
    const probePayload = await probe.json();
    assert.equal(probePayload.requestId, "act-dashboard-1");
    assert.equal(probePayload.action, "gateway.probe");
    assert.equal(probePayload.origin, "dashboard");
    assert.equal(probePayload.characterId, "CH_probe");
    assert.equal(probePayload.outcome, "success");
    assert.equal(probePayload.result.ok, true);

    const current = await fetch(`${url}/api/action-gateway`);
    const currentPayload = await current.json();
    assert.equal(currentPayload.totalRequests, 1);
    assert.equal(currentPayload.lastResult.requestId, "act-dashboard-1");

    const rateLimited = await fetch(
      `${url}/api/action-gateway/probe`,
      { method: "POST" },
    );
    assert.equal(rateLimited.status, 429);
    const limitedPayload = await rateLimited.json();
    assert.equal(limitedPayload.outcome, "rate_limited");
    assert.equal(limitedPayload.error.code, "ACTION_RATE_LIMITED");

    const movement = await fetch(
      `${url}/api/action-gateway/movement-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "move", direction: "right" }),
      },
    );
    assert.equal(movement.status, 200);
    const movementPayload = await movement.json();
    assert.equal(movementPayload.requestId, "act-movement-test");
    assert.equal(movementPayload.action, "character.move");
    assert.equal(movementPayload.result.targetX, 132);

    const invalidMovement = await fetch(
      `${url}/api/action-gateway/movement-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "teleport", direction: "right" }),
      },
    );
    assert.equal(invalidMovement.status, 400);

    const attack = await fetch(
      `${url}/api/action-gateway/attack-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: "14" }),
      },
    );
    assert.equal(attack.status, 200);
    const attackPayload = await attack.json();
    assert.equal(attackPayload.requestId, "act-attack-test");
    assert.equal(attackPayload.action, "character.attack");
    assert.equal(attackPayload.result.targetId, "14");
    assert.equal(attackPayload.result.serverAccepted, true);

    const invalidAttack = await fetch(
      `${url}/api/action-gateway/attack-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: "" }),
      },
    );
    assert.equal(invalidAttack.status, 400);

    const skillOptions = await fetch(
      `${url}/api/action-gateway/skill-options`,
    );
    assert.equal(skillOptions.status, 200);
    const skillOptionsPayload = await skillOptions.json();
    assert.equal(skillOptionsPayload.status, "ready");
    assert.equal(skillOptionsPayload.skills[0].skillName, "massproduction");

    const skill = await fetch(
      `${url}/api/action-gateway/skill-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillName: "massproduction" }),
      },
    );
    assert.equal(skill.status, 200);
    const skillPayload = await skill.json();
    assert.equal(skillPayload.requestId, "act-skill-test");
    assert.equal(skillPayload.action, "character.skill");
    assert.equal(skillPayload.result.skillName, "massproduction");
    assert.equal(skillPayload.result.serverAccepted, true);

    const invalidSkill = await fetch(
      `${url}/api/action-gateway/skill-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillName: "" }),
      },
    );
    assert.equal(invalidSkill.status, 400);

    const lootConsumableOptions = await fetch(
      `${url}/api/action-gateway/loot-consumable-options`,
    );
    assert.equal(lootConsumableOptions.status, 200);
    const lootConsumablePayload = await lootConsumableOptions.json();
    assert.equal(lootConsumablePayload.status, "ready");
    assert.equal(lootConsumablePayload.lootChests[0].id, "chest-probe");
    assert.equal(lootConsumablePayload.consumables[0].itemName, "hpot0");

    const loot = await fetch(
      `${url}/api/action-gateway/loot-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chestId: "chest-probe" }),
      },
    );
    assert.equal(loot.status, 200);
    const lootPayload = await loot.json();
    assert.equal(lootPayload.requestId, "act-loot-test");
    assert.equal(lootPayload.action, "character.loot");
    assert.equal(lootPayload.result.chestId, "chest-probe");
    assert.equal(lootPayload.result.serverAccepted, true);

    const invalidLoot = await fetch(
      `${url}/api/action-gateway/loot-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chestId: "" }),
      },
    );
    assert.equal(invalidLoot.status, 400);

    const consumable = await fetch(
      `${url}/api/action-gateway/consumable-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryIndex: 0,
          itemName: "hpot0",
          kind: "hp",
        }),
      },
    );
    assert.equal(consumable.status, 200);
    const consumablePayload = await consumable.json();
    assert.equal(consumablePayload.requestId, "act-consumable-test");
    assert.equal(consumablePayload.action, "character.consume");
    assert.equal(consumablePayload.result.itemName, "hpot0");
    assert.equal(consumablePayload.result.serverAccepted, true);

    const invalidConsumable = await fetch(
      `${url}/api/action-gateway/consumable-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryIndex: 0,
          itemName: "hpot0",
          kind: "gold",
        }),
      },
    );
    assert.equal(invalidConsumable.status, 400);

    const liveTestState = await fetch(
      `${url}/api/live-test/slice-3-5`,
    );
    assert.equal(liveTestState.status, 200);
    assert.equal((await liveTestState.json()).status, "idle");

    const liveTest = await fetch(
      `${url}/api/live-test/slice-3-5/start`,
      { method: "POST" },
    );
    assert.equal(liveTest.status, 200);
    const liveTestPayload = await liveTest.json();
    assert.equal(liveTestPayload.result.outcome, "passed");
    assert.equal(liveTestPayload.clipboardSuggested, true);
    assert.match(liveTestPayload.reportText, /ALRemastered Slice 3\.5 one-click live test/);
    assert.match(liveTestPayload.reportText, /ALRemastered Diagnostic Log/);
    assert.match(liveTestPayload.reportText, /Secrets sanitized: yes/);

    const arbitrary = await fetch(
      `${url}/api/action-gateway/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attack" }),
      },
    );
    assert.equal(arbitrary.status, 405);

    const logs = logger.exportText();
    assert.match(logs, /"requestId":"act-dashboard-1"/);
    assert.match(logs, /"action":"gateway.probe"/);
    assert.doesNotMatch(logs, /movement|combat|skill|attack target/i);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard renders fixed Phase 3 bounded action controls through Slice 3.5", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const id of [
    "action-gateway-status",
    "action-gateway-active",
    "action-gateway-total",
    "action-gateway-request-id",
    "action-gateway-outcome",
    "run-action-gateway-probe",
    "movement-mode",
    "attack-target",
    "run-attack-test",
    "skill-name",
    "skill-target",
    "run-skill-test",
    "loot-chest",
    "run-loot-test",
    "consumable-item",
    "run-consumable-test",
    "start-slice-3-5-live-test",
    "slice-3-5-live-test-status",
    "copy-slice-3-5-live-test-result",
    "developer-manual-controls",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(html, /local-only/);
  assert.match(script, /\/api\/action-gateway/);
  assert.match(script, /\/api\/action-gateway\/probe/);
  assert.match(script, /Action gateway probe completed/);
  assert.match(script, /\/api\/action-gateway\/movement-test/);
  assert.match(html, /data-movement-direction="left"/);
  assert.match(html, /data-movement-direction="right"/);
  assert.match(html, /fixed 32-unit same-map step/);
  assert.match(script, /\/api\/action-gateway\/attack-test/);
  assert.match(script, /monster\.id === previous/);
  assert.match(script, /entity\.kind === "monster"/);
  assert.match(html, /Attack selected monster once/);
  assert.match(html, /No automatic targeting or repeated attack loop/);
  assert.match(script, /\/api\/action-gateway\/skill-options/);
  assert.match(script, /\/api\/action-gateway\/skill-test/);
  assert.match(html, /Skill test controls/);
  assert.match(html, /Use selected skill once/);
  assert.match(html, /simple non-hostile skills/);
  assert.match(html, /Special-argument, movement, item-consuming, multi-target, hostile/);
  assert.match(script, /\/api\/action-gateway\/loot-consumable-options/);
  assert.match(script, /\/api\/action-gateway\/loot-test/);
  assert.match(script, /\/api\/action-gateway\/consumable-test/);
  assert.match(html, /Loot &amp; consumable test controls/);
  assert.match(html, /Loot selected chest once/);
  assert.match(html, /Use selected HP\/MP item once/);
  assert.match(html, /No auto-loot, auto-potion loop, free-form item ID/);
  assert.match(html, />Start test<\/button>/);
  assert.match(html, /No manual target, chest, item, movement, or combat preparation is required/);
  assert.match(html, /Developer manual controls/);
  assert.match(script, /\/api\/live-test\/slice-3-5\/start/);
  assert.match(script, /beginDeferredClipboardWrite/);
  assert.match(script, /navigator\.clipboard\?\.write/);
  assert.match(script, /Complete result and sanitized diagnostic log copied to clipboard/);
  assert.doesNotMatch(script, /\/api\/action-gateway\/action/);
  assert.doesNotMatch(
    script,
    /\/api\/action-gateway\/(use|buy|sell|party)(?:["'/?])/,
  );
});


test("dashboard exposes isolated Script Runtime controls and Slice 4.1 one-click API", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "script-runtime-status",
    "script-runtime-name",
    "script-runtime-timers",
    "script-runtime-log-records",
    "script-runtime-script-name",
    "script-runtime-source",
    "script-runtime-load",
    "script-runtime-start",
    "script-runtime-pause",
    "script-runtime-stop",
    "start-slice-4-1-live-test",
    "slice-4-1-live-test-status",
    "copy-slice-4-1-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Script runtime/);
  assert.match(html, /Slice 4\.1 one-click live test/);
  assert.match(html, /No Adventure Land gameplay preparation is required/);
  assert.match(html, /Slice 4\.2 exposes character, G, Entities/);
  assert.match(html, /Slice 4\.3 adds controlled on\(\)\/off\(\) game event listeners/);
  assert.match(script, /\/api\/script-runtime\/load/);
  assert.match(script, /\/api\/script-runtime\/start/);
  assert.match(script, /\/api\/script-runtime\/pause/);
  assert.match(script, /\/api\/script-runtime\/stop/);
  assert.match(script, /\/api\/live-test\/slice-4-1\/start/);
  assert.match(script, /Complete result and sanitized diagnostic log copied to clipboard/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-script-runtime-test" });
  let runtimeState = {
    status: "unloaded",
    activeTimers: 0,
    logRecords: 0,
    message: "No script loaded.",
  };
  const fakeScriptRuntime = {
    state: () => ({ ...runtimeState }),
    load: async ({ name }: { name: string; source: string }) => {
      runtimeState = {
        status: "loaded",
        scriptName: name,
        activeTimers: 0,
        logRecords: 0,
        message: "Script loaded and ready to start.",
      } as any;
      return { ...runtimeState };
    },
    start: async () => {
      runtimeState = {
        ...runtimeState,
        status: "running",
        activeTimers: 1,
        message: "Script is running in an isolated worker.",
      } as any;
      return { ...runtimeState };
    },
    pause: async () => {
      runtimeState = {
        ...runtimeState,
        status: "paused",
        activeTimers: 0,
        message: "Script paused. All registered timers were cleared.",
      } as any;
      return { ...runtimeState };
    },
    stop: async () => {
      runtimeState = {
        ...runtimeState,
        status: "stopped",
        activeTimers: 0,
        message: "Script stopped. Timers and worker resources were released.",
      } as any;
      return { ...runtimeState };
    },
  };
  const fakeLiveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 4.1 one-click live test is ready.",
    }),
    run: async () => ({
      testId: "live41-dashboard",
      outcome: "passed",
      startedAt: "2026-10-03T12:00:00.000Z",
      completedAt: "2026-10-03T12:00:01.000Z",
      message: "Slice 4.1 one-click live test passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    scriptRuntime: fakeScriptRuntime as any,
    slice41LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const initial = await fetch(`${url}/api/script-runtime`);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).status, "unloaded");

    const loaded = await fetch(`${url}/api/script-runtime/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "dashboard-test", source: 'console.info("ok");' }),
    });
    assert.equal(loaded.status, 200);
    assert.equal((await loaded.json()).status, "loaded");

    const started = await fetch(`${url}/api/script-runtime/start`, { method: "POST" });
    assert.equal((await started.json()).status, "running");
    const paused = await fetch(`${url}/api/script-runtime/pause`, { method: "POST" });
    assert.equal((await paused.json()).activeTimers, 0);
    const stopped = await fetch(`${url}/api/script-runtime/stop`, { method: "POST" });
    assert.equal((await stopped.json()).status, "stopped");

    const live = await fetch(`${url}/api/live-test/slice-4-1/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const livePayload = await live.json();
    assert.equal(livePayload.result.outcome, "passed");
    assert.match(livePayload.reportText, /ALRemastered Slice 4\.1 one-click live test/);
    assert.equal(livePayload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Slice 4.2 compatible API one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const id of [
    "start-slice-4-2-live-test",
    "slice-4-2-live-test-status",
    "slice-4-2-live-test-note",
    "copy-slice-4-2-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Slice 4\.2 one-click live test/);
  assert.match(html, /get_nearest_monster\(\)/);
  assert.match(html, /is_in_range\(\)/);
  assert.match(html, /can_attack\(\)/);
  assert.match(html, /validated move\(\), xmove\(\), attack\(\), and loot\(\)/);
  assert.match(html, /No manual target or developer controls are required/);
  assert.match(script, /\/api\/live-test\/slice-4-2\/start/);
  assert.match(script, /bounded isolated script farmer/);
  assert.match(script, /Complete result and sanitized diagnostic log copied to clipboard/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice-4-2-test" });
  const fakeRuntime = {
    state: () => ({
      status: "stopped",
      scriptName: "slice-4-2-live-farmer",
      activeTimers: 0,
      logRecords: 10,
      message: "Script stopped.",
    }),
  };
  const fakeLiveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 4.2 one-click live test is ready.",
    }),
    run: async () => ({
      testId: "live42-dashboard",
      slice: "4.2",
      outcome: "passed",
      startedAt: "2026-10-03T14:00:00.000Z",
      completedAt: "2026-10-03T14:00:05.000Z",
      characterId: "CH_1",
      targetId: "monster-1",
      targetType: "crab",
      message: "Slice 4.2 one-click live test passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    scriptRuntime: fakeRuntime as any,
    slice42LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/live-test/slice-4-2`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");

    const live = await fetch(`${url}/api/live-test/slice-4-2/start`, {
      method: "POST",
    });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "4.2");
    assert.equal(payload.clipboardSuggested, true);
    assert.match(payload.reportText, /ALRemastered Slice 4\.2 one-click live test/);
    assert.match(payload.reportText, /slice-4-2-live-farmer/);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Slice 4.3 event API one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const id of [
    "start-slice-4-3-live-test",
    "slice-4-3-live-test-status",
    "slice-4-3-live-test-note",
    "copy-slice-4-3-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Slice 4\.3 one-click live test/);
  assert.match(html, /controlled on\(\)\/off\(\) game event listeners/);
  assert.match(html, /performs no gameplay mutation/);
  assert.match(script, /\/api\/live-test\/slice-4-3\/start/);
  assert.match(script, /Fresh read-only game events/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice-4-3-test" });
  const fakeRuntime = {
    state: () => ({
      status: "stopped",
      scriptName: "slice-4-3-live-events",
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 10,
      message: "Script stopped.",
    }),
  };
  const fakeLiveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 4.3 one-click live test is ready.",
    }),
    run: async () => ({
      testId: "live43-dashboard",
      slice: "4.3",
      outcome: "passed",
      startedAt: "2026-10-03T16:00:00.000Z",
      completedAt: "2026-10-03T16:00:03.000Z",
      characterId: "CH_1",
      characterName: "RangerOne",
      serverKey: "SR_EUII",
      observedEvent: "entities",
      message: "Slice 4.3 one-click live test passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    scriptRuntime: fakeRuntime as any,
    slice43LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/live-test/slice-4-3`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");

    const live = await fetch(`${url}/api/live-test/slice-4-3/start`, {
      method: "POST",
    });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "4.3");
    assert.equal(payload.result.observedEvent, "entities");
    assert.equal(payload.clipboardSuggested, true);
    assert.match(payload.reportText, /ALRemastered Slice 4\.3 one-click live test/);
    assert.match(payload.reportText, /slice-4-3-live-events/);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Slice 4.4 persistent script storage one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const id of [
    "start-slice-4-4-live-test",
    "slice-4-4-live-test-status",
    "slice-4-4-live-test-note",
    "copy-slice-4-4-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Slice 4\.4 one-click storage test/);
  assert.match(html, /namespaced persistent get\(\)\/set\(\)\/del\(\) script storage/);
  assert.match(html, /No Adventure Land connection or gameplay mutation is required/);
  assert.match(script, /\/api\/live-test\/slice-4-4\/start/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice-4-4-test" });
  const fakeRuntime = {
    state: () => ({
      status: "stopped",
      scriptName: "slice-4-4-storage-primary",
      activeTimers: 0,
      activeEventListeners: 0,
      logRecords: 8,
      message: "Script stopped.",
    }),
  };
  const fakeLiveTest = {
    state: () => ({
      status: "idle",
      message: "Slice 4.4 one-click storage test is ready.",
    }),
    run: async () => ({
      testId: "live44-dashboard",
      slice: "4.4",
      outcome: "passed",
      startedAt: "2026-10-03T17:00:00.000Z",
      completedAt: "2026-10-03T17:00:02.000Z",
      message: "Slice 4.4 one-click storage test passed.",
      steps: [],
    }),
  };

  const dashboard = new DashboardServer({
    logger,
    runtime,
    scriptRuntime: fakeRuntime as any,
    slice44LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/live-test/slice-4-4`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");

    const live = await fetch(`${url}/api/live-test/slice-4-4/start`, {
      method: "POST",
    });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "4.4");
    assert.equal(payload.clipboardSuggested, true);
    assert.match(payload.reportText, /ALRemastered Slice 4\.4 one-click storage test/);
    assert.match(payload.reportText, /slice-4-4-storage-primary/);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Simple Farmer controls and Slice 4.5 live-test APIs", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "simple-farmer-monster",
    "simple-farmer-hp-threshold",
    "simple-farmer-mp-threshold",
    "simple-farmer-loot",
    "simple-farmer-respawn",
    "simple-farmer-start",
    "simple-farmer-stop",
    "start-slice-4-5-live-test",
    "slice-4-5-live-test-status",
    "copy-slice-4-5-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /automatic navigation remains reserved for Phase 6/);
  assert.match(html, /walks into attack range through bounded server-confirmed direct movement/);
  assert.match(script, /\/api\/simple-farmer\/start/);
  assert.match(script, /\/api\/live-test\/slice-4-5\/start/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice45-test" });
  let farmerState:any = { status: "idle", message: "ready" };
  const fakeFarmer = {
    options: () => ({
      status: "ready",
      message: "ready",
      monsters: ["goo"],
      defaults: { hpThresholdPercent: 50, mpThresholdPercent: 30, loot: true, respawn: true },
    }),
    state: () => farmerState,
    start: async (config:any) => farmerState = { status: "running", message: "running", config },
    stop: async () => farmerState = { status: "stopped", message: "stopped" },
  };
  const fakeLiveTest = {
    state: () => ({ status: "idle", message: "ready" }),
    run: async () => ({
      testId: "live45-dashboard",
      slice: "4.5",
      outcome: "passed",
      startedAt: "2026-10-03T17:40:00.000Z",
      completedAt: "2026-10-03T17:40:01.000Z",
      targetId: "M1",
      targetType: "goo",
      attackCount: 1,
      lootCount: 1,
      message: "Slice 4.5 passed.",
      steps: [],
    }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    simpleFarmerService: fakeFarmer as any,
    slice45LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const options = await fetch(`${url}/api/simple-farmer/options`);
    assert.equal(options.status, 200);
    assert.deepEqual((await options.json()).monsters, ["goo"]);

    const start = await fetch(`${url}/api/simple-farmer/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monster: "goo",
        hpThresholdPercent: 50,
        mpThresholdPercent: 30,
        loot: true,
        respawn: true,
      }),
    });
    assert.equal(start.status, 200);
    assert.equal((await start.json()).status, "running");

    const live = await fetch(`${url}/api/live-test/slice-4-5/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.match(payload.reportText, /ALRemastered Slice 4\.5 one-click live test/);

    const stop = await fetch(`${url}/api/simple-farmer/stop`, { method: "POST" });
    assert.equal(stop.status, 200);
    assert.equal((await stop.json()).status, "stopped");
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Slice 5.1 heartbeat one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "start-slice-5-1-live-test",
    "slice-5-1-live-test-status",
    "copy-slice-5-1-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Core, Character, and isolated Script heartbeats/);
  assert.match(script, /\/api\/live-test\/slice-5-1\/start/);

  const runtime = new CoreRuntime({ heartbeatIntervalMs: 25 });
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice51-test" });
  const fakeLiveTest = {
    state: () => ({ status: "idle", message: "ready" }),
    run: async () => ({
      testId: "live51-dashboard",
      slice: "5.1",
      outcome: "passed",
      startedAt: "2026-10-03T18:30:00.000Z",
      completedAt: "2026-10-03T18:30:01.000Z",
      message: "Slice 5.1 passed.",
      steps: [],
    }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    slice51LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/live-test/slice-5-1`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");
    const live = await fetch(`${url}/api/live-test/slice-5-1/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "5.1");
    assert.match(payload.reportText, /ALRemastered Slice 5\.1 one-click heartbeat test/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Slice 5.2 disconnect/reconnect one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "start-slice-5-2-live-test",
    "slice-5-2-live-test-status",
    "copy-slice-5-2-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /bounded exponential backoff/);
  assert.match(script, /\/api\/live-test\/slice-5-2\/start/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice52-test" });
  const fakeLiveTest = {
    state: () => ({ status: "idle", message: "ready" }),
    run: async () => ({
      testId: "live52-dashboard",
      slice: "5.2",
      outcome: "passed",
      startedAt: "2026-10-03T19:00:00.000Z",
      completedAt: "2026-10-03T19:00:01.000Z",
      message: "Slice 5.2 passed.",
      steps: [],
    }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    slice52LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/live-test/slice-5-2`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");
    const live = await fetch(`${url}/api/live-test/slice-5-2/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "5.2");
    assert.match(payload.reportText, /ALRemastered Slice 5\.2 one-click disconnect\/reconnect test/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Slice 5.3 death/respawn recovery one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "start-slice-5-3-live-test",
    "slice-5-3-live-test-status",
    "copy-slice-5-3-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /real Adventure Land server-observed death state/);
  assert.match(html, /central Action Gateway/);
  assert.match(script, /\/api\/live-test\/slice-5-3\/start/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice53-test" });
  const fakeLiveTest = {
    state: () => ({ status: "idle", message: "ready" }),
    run: async () => ({
      testId: "live53-dashboard",
      slice: "5.3",
      outcome: "passed",
      startedAt: "2026-10-03T20:00:00.000Z",
      completedAt: "2026-10-03T20:00:01.000Z",
      message: "Slice 5.3 passed.",
      steps: [],
    }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    slice53LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const current = await fetch(`${url}/api/live-test/slice-5-3`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");
    const live = await fetch(`${url}/api/live-test/slice-5-3/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "5.3");
    assert.match(payload.reportText, /ALRemastered Slice 5\.3 one-click death\/respawn recovery test/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});


test("dashboard exposes Slice 5.4 watchdog/restart-guard one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "start-slice-5-4-live-test",
    "slice-5-4-live-test-status",
    "copy-slice-5-4-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /restart-budget exhaustion/);
  assert.match(html, /No gameplay action or raw socket access/);
  assert.match(script, /\/api\/live-test\/slice-5-4\/start/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice54-test" });
  const fakeWatchdog = {
    state: () => ({
      status: "running",
      checkIntervalMs: 500,
      restartWindowMs: 30000,
      maxRestartsPerWindow: 2,
      checks: 1,
      components: {
        core: { monitored: true, stale: false, blocked: false, restartCount: 0, budgetUsed: 0, budgetLimit: 2 },
        character: { monitored: false, stale: false, blocked: false, restartCount: 0, budgetUsed: 0, budgetLimit: 2 },
        script: { monitored: false, stale: false, blocked: false, restartCount: 0, budgetUsed: 0, budgetLimit: 2 },
      },
      message: "watchdog running",
    }),
    resetBudget: () => fakeWatchdog.state(),
  };
  const fakeLiveTest = {
    state: () => ({ status: "idle", message: "ready" }),
    run: async () => ({
      testId: "live54-dashboard",
      slice: "5.4",
      outcome: "passed",
      startedAt: "2026-10-03T20:20:00.000Z",
      completedAt: "2026-10-03T20:20:03.000Z",
      message: "Slice 5.4 passed.",
      steps: [],
    }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    watchdogService: fakeWatchdog as any,
    slice54LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const watchdog = await fetch(`${url}/api/watchdog`);
    assert.equal(watchdog.status, 200);
    assert.equal((await watchdog.json()).status, "running");
    const current = await fetch(`${url}/api/live-test/slice-5-4`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");
    const live = await fetch(`${url}/api/live-test/slice-5-4/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "5.4");
    assert.match(payload.reportText, /ALRemastered Slice 5\.4 one-click watchdog\/restart-guard test/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("dashboard exposes Slice 6.1 map/geometry-model APIs and one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "start-slice-6-1-live-test",
    "slice-6-1-live-test-status",
    "copy-slice-6-1-live-test-result",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /map boundaries, door\/transition target-spawn resolution/);
  assert.match(html, /No movement, pathfinding, gameplay action, or raw socket access/);
  assert.match(script, /\/api\/live-test\/slice-6-1\/start/);

  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "dashboard-slice61-test" });
  const fakeMap = {
    key: "main",
    name: "Mainland",
    ignored: false,
    instance: false,
    outside: true,
    safe: false,
    spawnPoints: [{ x: 0, y: 0, direction: 3 }],
    bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100, source: "geometry" },
    collision: { xLines: [[0, -100, 100]], yLines: [], lineCount: 1 },
    transitions: [],
  };
  const fakeMapModel = {
    state: () => ({
      status: "ready",
      version: 17397,
      mapCount: 1,
      geometryMapCount: 1,
      mapsWithBounds: 1,
      collisionLineCount: 1,
      transitionCount: 0,
      invalidTransitionCount: 0,
      missingGeometryMapKeys: [],
      message: "Map/geometry model is ready.",
    }),
    map: (key: string) => key === "main" ? fakeMap : undefined,
  };
  const fakeLiveTest = {
    state: () => ({ status: "idle", message: "ready" }),
    run: async () => ({
      testId: "live61-dashboard",
      slice: "6.1",
      outcome: "passed",
      startedAt: "2026-10-03T21:10:00.000Z",
      completedAt: "2026-10-03T21:10:01.000Z",
      message: "Slice 6.1 passed.",
      steps: [],
    }),
  };
  const dashboard = new DashboardServer({
    logger,
    runtime,
    mapModelService: fakeMapModel as any,
    slice61LiveTestService: fakeLiveTest as any,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  try {
    const model = await fetch(`${url}/api/navigation/map-model`);
    assert.equal(model.status, 200);
    assert.equal((await model.json()).status, "ready");

    const map = await fetch(`${url}/api/navigation/map-model/map`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "main" }),
    });
    assert.equal(map.status, 200);
    assert.equal((await map.json()).key, "main");

    const missingMap = await fetch(`${url}/api/navigation/map-model/map`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "missing" }),
    });
    assert.equal(missingMap.status, 404);

    const current = await fetch(`${url}/api/live-test/slice-6-1`);
    assert.equal(current.status, 200);
    assert.equal((await current.json()).status, "idle");

    const live = await fetch(`${url}/api/live-test/slice-6-1/start`, { method: "POST" });
    assert.equal(live.status, 200);
    const payload = await live.json();
    assert.equal(payload.result.outcome, "passed");
    assert.equal(payload.result.slice, "6.1");
    assert.match(payload.reportText, /ALRemastered Slice 6\.1 one-click map\/geometry-model test/);
    assert.equal(payload.clipboardSuggested, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

