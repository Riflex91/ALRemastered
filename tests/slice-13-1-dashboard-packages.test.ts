import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardLayoutStore } from "../src/dashboard/layout-store.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  DashboardPackageService,
} from "../src/packages/dashboard.ts";
import {
  ScriptPackageFormatError,
  createScriptPackage,
  validateScriptPackage,
} from "../src/packages/format.ts";
import { ScriptPackageImporter } from "../src/packages/importer.ts";
import {
  ScriptPackageLibrary,
  ScriptPackageLibraryError,
} from "../src/packages/library.ts";

function portableProfile() {
  return {
    kind: "ALRemasteredDashboardProfile",
    schemaVersion: 1,
    profile: {
      name: "Packaged dashboard",
      roles: [{ id: "farmer", label: "Farmer" }],
      layouts: {
        desktop: {
          schemaVersion: 1,
          order: ["character-card"],
          widgets: [{
            id: "character-card",
            duplicateOf: null,
            columns: 6,
            height: 192,
            removed: false,
            hiddenFields: [],
            displayMode: "standard",
            characterRole: "farmer",
          }],
        },
      },
    },
  };
}

function dashboardPackage() {
  return createScriptPackage({
    manifest: {
      kind: "dashboard",
      id: "org.example.slice131-dashboard",
      name: "Slice 13.1 Dashboard Package",
      version: "1.0.0",
      author: { name: "Test Author" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.80" },
        adventureLand: { channel: "live" },
      },
      permissions: [],
      dashboard: { path: "dashboard/profile.json" },
      readme: { path: "README.md" },
    },
    files: {
      "dashboard/profile.json": JSON.stringify(portableProfile()),
      "README.md": "# Dashboard Package\n\nPortable layout fixture.\n",
    },
  });
}

test("Slice 13.1 Dashboard package self-test validates package sharing without execution", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-dashboard-package-self-test-"));
  try {
    const importer = new ScriptPackageImporter(join(root, "packages"));
    const layoutStore = new DashboardLayoutStore(join(root, "layouts.json"));
    const service = new DashboardPackageService({
      rootDir: join(root, "packages"),
      importer,
      layoutStore,
    });
    const result = service.runSelfTest();

    assert.equal(result.status, "ready");
    assert.equal(result.descriptor.packageKind, "dashboard");
    assert.equal(result.descriptor.packageExtension, ".alrpkg");
    assert.equal(result.descriptor.packageExecutionSupported, false);
    assert.equal(result.descriptor.combinedScriptDashboardPackagesSupported, true);
    assert.equal(result.checks.samePackageFormat, true);
    assert.equal(result.checks.dashboardKind, true);
    assert.equal(result.checks.portableProfileValidated, true);
    assert.equal(result.checks.noScriptPayload, true);
    assert.equal(result.checks.importedInactive, true);
    assert.equal(result.checks.explicitRoleMapping, true);
    assert.equal(result.checks.sourceCharacterIdsAbsent, true);
    assert.equal(result.checks.layoutPersisted, true);
    assert.equal(result.checks.combinedPackDeferred, true);
    assert.equal(result.checks.combinedErrorCode, "PACKAGE_COMBINED_KIND_UNSUPPORTED");
    assert.equal(result.checks.noExecution, true);
    assert.equal(result.checks.noGameplayMutation, true);
    assert.equal(result.checks.cleanup, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.1 uses the existing .alrpkg format for Dashboard-only packages", () => {
  const document = dashboardPackage();
  const inspection = validateScriptPackage(document);

  assert.equal(document.format, "alremastered-script-package");
  assert.equal(document.schemaVersion, 1);
  assert.equal(inspection.packageKind, "dashboard");
  assert.equal(inspection.dashboardPath, "dashboard/profile.json");
  assert.equal(inspection.scriptCount, 0);
  assert.equal(inspection.entryScript, undefined);
  assert.equal(inspection.configSchemaPath, undefined);
  assert.deepEqual(inspection.permissions, []);

  assert.throws(
    () => createScriptPackage({
      manifest: {
        kind: "dashboard",
        id: "org.example.slice131-combined",
        name: "Combined",
        version: "1.0.0",
        author: { name: "Test Author" },
        compatibility: {
          alremastered: { minVersion: "0.1.0-alpha.80" },
          adventureLand: { channel: "live" },
        },
        permissions: [],
        scripts: [{ path: "scripts/main.js", entry: true }],
        dashboard: { path: "dashboard/profile.json" },
        readme: { path: "README.md" },
      },
      files: {
        "scripts/main.js": "log('not yet');\n",
        "dashboard/profile.json": JSON.stringify(portableProfile()),
        "README.md": "# Combined\n",
      },
    }),
    (error: unknown) =>
      error instanceof ScriptPackageFormatError &&
      error.code === "PACKAGE_COMBINED_KIND_UNSUPPORTED",
  );
});

test("Slice 13.1 importer and library preserve Dashboard packages without Script activation", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-dashboard-package-library-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const document = dashboardPackage();
    const preview = importer.preview(document);

    assert.equal(preview.packageKind, "dashboard");
    assert.equal(preview.code.length, 0);
    assert.equal(preview.permissions.length, 0);
    assert.deepEqual(preview.dashboard?.roleIds, ["farmer"]);

    importer.importPackage({
      packageDocument: document,
      previewToken: preview.previewToken,
    });

    const library = new ScriptPackageLibrary({ rootDir: root });
    const snapshot = library.snapshot();
    const version = snapshot.imported[0]?.versions[0];

    assert.equal(version?.packageKind, "dashboard");
    assert.equal(version?.active, false);
    assert.equal(version?.executionAttempted, false);

    assert.throws(
      () => library.setActive({
        packageId: document.manifest.id,
        version: document.manifest.version,
        active: true,
      }),
      (error: unknown) =>
        error instanceof ScriptPackageLibraryError &&
        error.code === "PACKAGE_LIBRARY_ACTIVATION_UNSUPPORTED",
    );

    assert.throws(
      () => library.setConfiguration({
        packageId: document.manifest.id,
        version: document.manifest.version,
        configuration: {},
      }),
      (error: unknown) =>
        error instanceof ScriptPackageLibraryError &&
        error.code === "PACKAGE_LIBRARY_CONFIGURATION_UNSUPPORTED",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.1 Dashboard API exposes descriptor, export, inspect, apply and isolated self-test", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-dashboard-package-api-"));
  const packageRoot = join(root, "packages");
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();

  const importer = new ScriptPackageImporter(packageRoot);
  const layoutStore = new DashboardLayoutStore(join(root, "layouts.json"));
  const service = new DashboardPackageService({
    rootDir: packageRoot,
    importer,
    layoutStore,
  });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-13-1-test" }),
    runtime,
    dashboardLayoutStore: layoutStore,
    scriptPackageImporter: importer,
    dashboardPackageService: service,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const descriptorResponse = await fetch(`${url}/api/packages/dashboard`);
    assert.equal(descriptorResponse.status, 200);
    const descriptor = await descriptorResponse.json();
    assert.equal(descriptor.packageKind, "dashboard");
    assert.equal(descriptor.packageExtension, ".alrpkg");
    assert.equal(descriptor.packageExecutionSupported, false);

    const exportResponse = await fetch(`${url}/api/packages/dashboard/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: "org.example.api-dashboard",
        name: "API Dashboard",
        version: "1.0.0",
        author: "API Author",
        portableProfile: portableProfile(),
      }),
    });
    assert.equal(exportResponse.status, 200);
    const exported = await exportResponse.json();
    assert.equal(exported.packageKind, "dashboard");
    assert.equal(exported.packageDocument.manifest.kind, "dashboard");
    assert.equal(exported.packageDocument.manifest.scripts, undefined);

    const preview = importer.preview(exported.packageDocument);
    importer.importPackage({
      packageDocument: exported.packageDocument,
      previewToken: preview.previewToken,
    });

    const inspectResponse = await fetch(`${url}/api/packages/dashboard/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: "org.example.api-dashboard",
        version: "1.0.0",
      }),
    });
    assert.equal(inspectResponse.status, 200);
    const inspected = await inspectResponse.json();
    assert.deepEqual(inspected.dashboard.roleIds, ["farmer"]);

    const applyResponse = await fetch(`${url}/api/packages/dashboard/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: "org.example.api-dashboard",
        version: "1.0.0",
        roleMapping: { farmer: "CURRENT_CHARACTER" },
      }),
    });
    assert.equal(applyResponse.status, 200);
    const applied = await applyResponse.json();
    assert.equal(applied.status, "applied");
    assert.equal(applied.executionAttempted, false);
    assert.equal(applied.gameplayMutation, false);

    const selfTestResponse = await fetch(`${url}/api/packages/dashboard/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");
    assert.equal(selfTest.checks.cleanup, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.1 is current verification and UI exposes Dashboard package sharing", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const format = readFileSync(new URL("../src/packages/format.js", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/packages/dashboard.js", import.meta.url), "utf8");
  const updater = readFileSync(new URL("../src/packages/updater.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="13\.2"/);
  assert.match(html, /Slice 13\.1 one-click Dashboard Packages test/);
  assert.match(html, /id="dashboard-package-export"/);
  assert.match(html, />Export as \.alrpkg</);
  assert.match(html, /id="package-import-kind"/);

  assert.match(app, /\/api\/packages\/dashboard\/export/);
  assert.match(app, /\/api\/packages\/dashboard\/inspect/);
  assert.match(app, /\/api\/packages\/dashboard\/apply/);
  assert.match(app, /Apply dashboard layout/);
  assert.match(app, /combined-pack-deferred/);
  assert.match(app, /explicit-role-mapping/);

  assert.match(server, /GET" && path === "\/api\/packages\/dashboard"/);
  assert.match(server, /GET" && path === "\/api\/packages\/dashboard\/self-test"/);
  assert.match(server, /POST" && path === "\/api\/packages\/dashboard\/export"/);
  assert.match(server, /POST" && path === "\/api\/packages\/dashboard\/inspect"/);
  assert.match(server, /POST" && path === "\/api\/packages\/dashboard\/apply"/);

  assert.match(format, /supportedPackageKinds: Object\.freeze\(\["script", "dashboard", "combined"\]\)/);
  assert.match(format, /combinedScriptDashboardPackagesSupported: true/);
  assert.match(format, /PACKAGE_COMBINED_KIND_UNSUPPORTED/);
  assert.match(service, /packageExecutionSupported: false/);
  assert.match(service, /resolvePortableDashboardProfile/);
  assert.match(service, /executionAttempted: false/);
  assert.match(service, /gameplayMutation: false/);
  assert.match(updater, /dashboardPackageUpdatesSupported: false/);
  assert.match(updater, /PACKAGE_UPDATE_KIND_UNSUPPORTED/);
});
