import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardLayoutStore } from "../src/dashboard/layout-store.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import { CombinedPackageService } from "../src/packages/combined.ts";
import { DashboardPackageService } from "../src/packages/dashboard.ts";
import { ScriptPackageImporter } from "../src/packages/importer.ts";
import { ScriptPackageLibrary } from "../src/packages/library.ts";
import {
  PartyPackWizardError,
  PartyPackWizardService,
  recommendPartyPackRoles,
  validatePartyPackRoleMapping,
} from "../src/packages/party-wizard.ts";

function characters() {
  return [
    { id: "CH_WARRIOR", name: "Warrior", type: "warrior", level: 100, online: false },
    { id: "CH_PRIEST", name: "Priest", type: "priest", level: 100, online: false },
    { id: "CH_RANGER", name: "Ranger", type: "ranger", level: 100, online: false },
    { id: "CH_MERCHANT", name: "Merchant", type: "merchant", level: 100, online: false },
  ];
}

function createHarness(root: string) {
  const packageRoot = join(root, "packages");
  const importer = new ScriptPackageImporter(packageRoot);
  const library = new ScriptPackageLibrary({ rootDir: packageRoot });
  const layoutStore = new DashboardLayoutStore(join(root, "layouts.json"));
  const dashboardPackages = new DashboardPackageService({
    rootDir: packageRoot,
    importer,
    layoutStore,
  });
  const combinedPackages = new CombinedPackageService({
    rootDir: packageRoot,
    importer,
    library,
    dashboardPackages,
  });
  const created = combinedPackages.createPackage({
    packageId: "org.example.slice133-party-pack",
    name: "4-Man Boss Party Pack",
    version: "1.0.0",
    author: "Test Author",
    scripts: [{
      path: "scripts/main.js",
      entry: true,
      source: "export function main() { return 'not executed'; }\n",
    }],
    configSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    portableProfile: {
      kind: "ALRemasteredDashboardProfile",
      schemaVersion: 1,
      profile: {
        name: "4-Man Boss Party Pack",
        roles: [
          { id: "tank", label: "Tank" },
          { id: "healer", label: "Healer" },
          { id: "dps", label: "DPS" },
          { id: "merchant", label: "Merchant" },
        ],
        layouts: {
          desktop: {
            schemaVersion: 1,
            order: ["tank", "healer", "dps", "merchant"],
            widgets: [
              widget("tank", "tank"),
              widget("healer", "healer"),
              widget("dps", "dps"),
              widget("merchant", "merchant"),
            ],
          },
        },
      },
    },
    permissions: [],
  });
  const preview = importer.preview(created.packageDocument);
  importer.importPackage({
    packageDocument: created.packageDocument,
    previewToken: preview.previewToken,
  });
  const selection = {
    state: () => ({
      status: "ready" as const,
      characters: characters(),
      servers: [],
      message: "Characters ready.",
    }),
  };
  const wizard = new PartyPackWizardService({
    rootDir: packageRoot,
    selection,
    combinedPackages,
    dashboardPackages,
    library,
  });
  return {
    packageRoot,
    importer,
    library,
    layoutStore,
    dashboardPackages,
    combinedPackages,
    created,
    selection,
    wizard,
  };
}

function widget(id: string, role: string) {
  return {
    id,
    duplicateOf: null,
    columns: 3,
    height: 144,
    removed: false,
    hiddenFields: [],
    displayMode: "compact",
    characterRole: role,
  };
}

test("Slice 13.3 recommends Warrior Tank, Priest Healer, Ranger DPS, and Merchant", () => {
  const roles = [
    { id: "tank", label: "Tank" },
    { id: "healer", label: "Healer" },
    { id: "dps", label: "DPS" },
    { id: "merchant", label: "Merchant" },
  ];
  const recommendations = recommendPartyPackRoles(roles, characters());
  assert.deepEqual(
    recommendations.map((role) => [role.id, role.recommendedCharacterId, role.recommendation]),
    [
      ["tank", "CH_WARRIOR", "class-match"],
      ["healer", "CH_PRIEST", "class-match"],
      ["dps", "CH_RANGER", "class-match"],
      ["merchant", "CH_MERCHANT", "class-match"],
    ],
  );
});

test("Slice 13.3 requires every role and a unique available Character", () => {
  assert.throws(
    () => validatePartyPackRoleMapping(
      ["tank", "healer"],
      characters(),
      { tank: "CH_WARRIOR" },
    ),
    (error: unknown) =>
      error instanceof PartyPackWizardError &&
      error.code === "PARTY_PACK_ROLE_MAPPING_REQUIRED",
  );
  assert.throws(
    () => validatePartyPackRoleMapping(
      ["tank", "healer"],
      characters(),
      { tank: "CH_WARRIOR", healer: "CH_WARRIOR" },
    ),
    (error: unknown) =>
      error instanceof PartyPackWizardError &&
      error.code === "PARTY_PACK_CHARACTER_DUPLICATE",
  );
  assert.throws(
    () => validatePartyPackRoleMapping(
      ["tank"],
      characters(),
      { tank: "MISSING" },
    ),
    (error: unknown) =>
      error instanceof PartyPackWizardError &&
      error.code === "PARTY_PACK_CHARACTER_UNAVAILABLE",
  );
});

test("Slice 13.3 Party Pack Wizard self-test covers guided setup without Character starts or execution", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-party-pack-wizard-self-test-"));
  try {
    const harness = createHarness(root);
    const result = harness.wizard.runSelfTest();
    assert.equal(result.status, "ready");
    assert.equal(result.descriptor.packageKind, "combined");
    assert.equal(result.descriptor.guidedRoleMapping, true);
    assert.equal(result.descriptor.characterRecommendations, true);
    assert.equal(result.descriptor.uniqueCharacterPerRoleRequired, true);
    assert.equal(result.descriptor.setupStartsCharacters, false);
    assert.equal(result.descriptor.setupExecutesPackage, false);
    for (const [key, value] of Object.entries(result.checks)) {
      assert.equal(value, true, `expected Party Pack Wizard self-test check ${key} to pass`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.3 setup applies role-mapped Dashboard and explicitly activates package metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-party-pack-wizard-setup-"));
  try {
    const harness = createHarness(root);
    const preview = harness.wizard.preview(
      harness.created.packageId,
      harness.created.version,
    );
    assert.equal(preview.roles.length, 4);
    assert.equal(preview.characters.length, 4);
    assert.equal(preview.active, false);

    const result = harness.wizard.setup({
      packageId: harness.created.packageId,
      version: harness.created.version,
      roleMapping: {
        tank: "CH_WARRIOR",
        healer: "CH_PRIEST",
        dps: "CH_RANGER",
        merchant: "CH_MERCHANT",
      },
    });

    assert.equal(result.status, "configured");
    assert.equal(result.packageActive, true);
    assert.equal(result.charactersStarted, false);
    assert.equal(result.executionAttempted, false);
    assert.equal(result.gameplayMutation, false);
    assert.equal(result.rawSocketAccess, false);
    assert.equal(result.userScriptTouched, false);

    const profile = harness.layoutStore.state().profiles
      .find((entry) => entry.id === result.profileId);
    const mapping = Object.fromEntries(
      (profile?.layouts.desktop?.widgets ?? []).map((entry) => [
        entry.id,
        entry.characterId,
      ]),
    );
    assert.deepEqual(mapping, {
      tank: "CH_WARRIOR",
      healer: "CH_PRIEST",
      dps: "CH_RANGER",
      merchant: "CH_MERCHANT",
    });
    assert.equal(
      harness.library.snapshot().imported[0]?.versions[0]?.active,
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.3 Dashboard API exposes Wizard state, preview, setup, and isolated self-test", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-party-pack-wizard-api-"));
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const harness = createHarness(root);
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-13-3-test" }),
    runtime,
    selectionService: harness.selection as any,
    dashboardLayoutStore: harness.layoutStore,
    scriptPackageImporter: harness.importer,
    scriptPackageLibrary: harness.library,
    dashboardPackageService: harness.dashboardPackages,
    combinedPackageService: harness.combinedPackages,
    partyPackWizardService: harness.wizard,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const stateResponse = await fetch(`${url}/api/packages/party-wizard`);
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.ready, true);
    assert.equal(state.packs.length, 1);
    assert.equal(state.characters.length, 4);

    const previewResponse = await fetch(`${url}/api/packages/party-wizard/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: harness.created.packageId,
        version: harness.created.version,
      }),
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.roles.length, 4);
    assert.equal(preview.roles[0].recommendedCharacterId, "CH_WARRIOR");

    const setupResponse = await fetch(`${url}/api/packages/party-wizard/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: harness.created.packageId,
        version: harness.created.version,
        roleMapping: {
          tank: "CH_WARRIOR",
          healer: "CH_PRIEST",
          dps: "CH_RANGER",
          merchant: "CH_MERCHANT",
        },
      }),
    });
    assert.equal(setupResponse.status, 200);
    const setup = await setupResponse.json();
    assert.equal(setup.status, "configured");
    assert.equal(setup.packageActive, true);
    assert.equal(setup.charactersStarted, false);
    assert.equal(setup.executionAttempted, false);

    const selfTestResponse = await fetch(`${url}/api/packages/party-wizard/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");
    assert.equal(selfTest.checks.classRecommendations, true);
    assert.equal(selfTest.checks.cleanup, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.3 remains retained while Slice 14.1 is current verification", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../src/packages/party-wizard.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.1"/);
  assert.match(html, /<h2>Party Pack Wizard<\/h2>/);
  assert.match(html, /id="party-pack-wizard-package"/);
  assert.match(html, /id="party-pack-wizard-roles"/);
  assert.match(html, /id="party-pack-wizard-setup"/);
  assert.match(html, />Set up</);
  assert.match(html, /Slice 13\.3 one-click Party Pack Wizard test/);

  assert.match(app, /\/api\/packages\/party-wizard\/preview/);
  assert.match(app, /\/api\/packages\/party-wizard\/setup/);
  assert.match(app, /recommended/);
  assert.match(app, /Each Party Pack role must use a different/);
  assert.match(app, /Characters started:/);

  assert.match(server, /GET" && path === "\/api\/packages\/party-wizard"/);
  assert.match(server, /GET" && path === "\/api\/packages\/party-wizard\/self-test"/);
  assert.match(server, /POST" && path === "\/api\/packages\/party-wizard\/preview"/);
  assert.match(server, /POST" && path === "\/api\/packages\/party-wizard\/setup"/);

  assert.match(wizard, /guidedRoleMapping: true/);
  assert.match(wizard, /characterRecommendations: true/);
  assert.match(wizard, /setupStartsCharacters: false/);
  assert.match(wizard, /setupExecutesPackage: false/);
  assert.match(wizard, /PARTY_PACK_CHARACTER_DUPLICATE/);
});
