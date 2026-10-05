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
import {
  createScriptPackage,
  scriptPackageFormatDescriptor,
  validateScriptPackage,
} from "../src/packages/format.ts";
import {
  ScriptPackageImportError,
  ScriptPackageImporter,
} from "../src/packages/importer.ts";
import { ScriptPackageLibrary } from "../src/packages/library.ts";

function portableProfile() {
  return {
    kind: "ALRemasteredDashboardProfile",
    schemaVersion: 1,
    profile: {
      name: "Combined package layout",
      roles: [{ id: "healer", label: "Healer" }],
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
            characterRole: "healer",
          }],
        },
      },
    },
  };
}

function combinedDocument() {
  return createScriptPackage({
    manifest: {
      kind: "combined",
      id: "org.example.slice132-combined",
      name: "Slice 13.2 Combined Pack",
      version: "1.0.0",
      author: { name: "Test Author" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.81" },
        adventureLand: { channel: "live" },
      },
      permissions: ["movement", "inventory.destroy"],
      scripts: [
        { path: "scripts/main.js", entry: true },
        { path: "scripts/helper.js", entry: false },
      ],
      configSchema: { path: "config.schema.json" },
      dashboard: { path: "dashboard/profile.json" },
      assets: [{ path: "assets/guide.txt", mediaType: "text/plain" }],
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": "export function main() { return 'not executed'; }\n",
      "scripts/helper.js": "export const helper = true;\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: {
          monster: { type: "string", default: "goo" },
        },
        required: ["monster"],
        additionalProperties: false,
      }),
      "dashboard/profile.json": JSON.stringify(portableProfile()),
      "assets/guide.txt": "Combined pack guide.\n",
      "README.md": "# Slice 13.2 Combined Pack\n",
    },
  });
}

test("Slice 13.2 format supports Scripts, Dashboard, roles, Config Schema, assets, and Permissions together", () => {
  const document = combinedDocument();
  const inspection = validateScriptPackage(document);
  const descriptor = scriptPackageFormatDescriptor();

  assert.equal(document.format, "alremastered-script-package");
  assert.equal(document.schemaVersion, 1);
  assert.equal(inspection.packageKind, "combined");
  assert.equal(inspection.scriptCount, 2);
  assert.equal(inspection.entryScript, "scripts/main.js");
  assert.equal(inspection.configSchemaPath, "config.schema.json");
  assert.equal(inspection.dashboardPath, "dashboard/profile.json");
  assert.equal(inspection.assetCount, 1);
  assert.deepEqual(inspection.assetPaths, ["assets/guide.txt"]);
  assert.deepEqual(inspection.permissions, ["movement", "inventory.destroy"]);
  assert.equal(descriptor.combinedScriptDashboardPackagesSupported, true);
  assert.equal(descriptor.combinedAssetsSupported, true);
  assert.deepEqual(descriptor.supportedPackageKinds, ["script", "dashboard", "combined"]);
});

test("Slice 13.2 importer previews every combined surface and still confirms dangerous permissions", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-combined-import-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const document = combinedDocument();
    const preview = importer.preview(document);

    assert.equal(preview.packageKind, "combined");
    assert.equal(preview.code.length, 2);
    assert.equal(preview.configSchema.type, "object");
    assert.deepEqual(preview.dashboard?.roleIds, ["healer"]);
    assert.equal(preview.assets.length, 1);
    assert.equal(preview.assets[0]?.path, "assets/guide.txt");
    assert.equal(preview.assets[0]?.mediaType, "text/plain");
    assert.equal(preview.permissions.includes("movement"), true);
    assert.equal(preview.dangerousPermissions.includes("inventory.destroy"), true);

    assert.throws(
      () => importer.importPackage({
        packageDocument: document,
        previewToken: preview.previewToken,
      }),
      (error: unknown) =>
        error instanceof ScriptPackageImportError &&
        error.code === "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED",
    );

    const receipt = importer.importPackage({
      packageDocument: document,
      previewToken: preview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });
    assert.equal(receipt.packageKind, "combined");
    assert.equal(receipt.inactive, true);
    assert.equal(receipt.executionAttempted, false);
    assert.equal(receipt.gameplayMutation, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.2 combined self-test keeps Dashboard apply and Script activation independent", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-combined-self-test-"));
  try {
    const packageRoot = join(root, "packages");
    const importer = new ScriptPackageImporter(packageRoot);
    const library = new ScriptPackageLibrary({ rootDir: packageRoot });
    const layoutStore = new DashboardLayoutStore(join(root, "layouts.json"));
    const dashboardPackages = new DashboardPackageService({
      rootDir: packageRoot,
      importer,
      layoutStore,
    });
    const service = new CombinedPackageService({
      rootDir: packageRoot,
      importer,
      library,
      dashboardPackages,
    });
    const result = service.runSelfTest();

    assert.equal(result.status, "ready");
    assert.equal(result.descriptor.packageKind, "combined");
    assert.equal(result.descriptor.multipleScriptsSupported, true);
    assert.equal(result.descriptor.dashboardLayoutSupported, true);
    assert.equal(result.descriptor.portableRolesSupported, true);
    assert.equal(result.descriptor.configSchemaSupported, true);
    assert.equal(result.descriptor.assetsSupported, true);
    assert.equal(result.descriptor.permissionsSupported, true);
    assert.equal(result.descriptor.dashboardApplyActivatesScripts, false);
    assert.equal(result.descriptor.packageExecutionSupported, false);

    for (const [key, value] of Object.entries(result.checks)) {
      assert.equal(value, true, `expected combined self-test check ${key} to pass`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.2 library allows explicit Script config/activation while Dashboard apply stays separate", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-combined-library-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const document = combinedDocument();
    const preview = importer.preview(document);
    importer.importPackage({
      packageDocument: document,
      previewToken: preview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });
    const library = new ScriptPackageLibrary({ rootDir: root });

    const initial = library.snapshot().imported[0]?.versions[0];
    assert.equal(initial?.packageKind, "combined");
    assert.equal(initial?.active, false);

    library.setConfiguration({
      packageId: document.manifest.id,
      version: document.manifest.version,
      configuration: { monster: "crab" },
    });
    library.setActive({
      packageId: document.manifest.id,
      version: document.manifest.version,
      active: true,
    });

    const active = library.snapshot().imported[0]?.versions[0];
    assert.equal(active?.active, true);
    assert.equal(active?.configuration.monster, "crab");
    assert.equal(active?.executionAttempted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.2 Dashboard API exposes combined descriptor, export and self-test", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-combined-api-"));
  const packageRoot = join(root, "packages");
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();

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
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-13-2-test" }),
    runtime,
    dashboardLayoutStore: layoutStore,
    scriptPackageImporter: importer,
    scriptPackageLibrary: library,
    dashboardPackageService: dashboardPackages,
    combinedPackageService: combinedPackages,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const descriptorResponse = await fetch(`${url}/api/packages/combined`);
    assert.equal(descriptorResponse.status, 200);
    const descriptor = await descriptorResponse.json();
    assert.equal(descriptor.packageKind, "combined");
    assert.equal(descriptor.multipleScriptsSupported, true);
    assert.equal(descriptor.assetsSupported, true);
    assert.equal(descriptor.packageExecutionSupported, false);

    const exportResponse = await fetch(`${url}/api/packages/combined/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: "org.example.api-combined",
        name: "API Combined Pack",
        version: "1.0.0",
        author: "API Author",
        scripts: [
          {
            path: "scripts/main.js",
            entry: true,
            source: "export function main() { return 'not executed'; }\n",
          },
          {
            path: "scripts/helper.js",
            entry: false,
            source: "export const helper = true;\n",
          },
        ],
        configSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        portableProfile: portableProfile(),
        assets: [{
          path: "assets/guide.txt",
          content: "Guide\n",
          mediaType: "text/plain",
        }],
        permissions: ["movement"],
      }),
    });
    assert.equal(exportResponse.status, 200);
    const exported = await exportResponse.json();
    assert.equal(exported.packageKind, "combined");
    assert.equal(exported.scriptCount, 2);
    assert.equal(exported.assetCount, 1);
    assert.equal(exported.packageDocument.manifest.kind, "combined");

    const selfTestResponse = await fetch(`${url}/api/packages/combined/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");
    assert.equal(selfTest.checks.dashboardApplyIndependent, true);
    assert.equal(selfTest.checks.scriptActivationExplicit, true);
    assert.equal(selfTest.checks.cleanup, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 13.2 is current verification and UI exposes combined pack creation and dual controls", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const format = readFileSync(new URL("../src/packages/format.js", import.meta.url), "utf8");
  const combined = readFileSync(new URL("../src/packages/combined.js", import.meta.url), "utf8");
  const updater = readFileSync(new URL("../src/packages/updater.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.4"/);
  assert.match(html, /Combined Pack Builder/);
  assert.match(html, /Export combined \.alrpkg/);
  assert.match(html, /Slice 13\.2 one-click Script \+ Dashboard Pack test/);
  assert.match(html, /id="package-import-assets"/);

  assert.match(app, /\/api\/packages\/combined\/export/);
  assert.match(app, /\/api\/packages\/combined\/self-test/);
  assert.match(app, /Script \+ Dashboard/);
  assert.match(app, /dashboardCapable/);
  assert.match(app, /Dashboard apply leaves Scripts inactive/);
  assert.match(app, /dangerous-permission-confirmation/);

  assert.match(server, /GET" && path === "\/api\/packages\/combined"/);
  assert.match(server, /GET" && path === "\/api\/packages\/combined\/self-test"/);
  assert.match(server, /POST" && path === "\/api\/packages\/combined\/export"/);

  assert.match(format, /"script", "dashboard", "combined"/);
  assert.match(format, /combinedScriptDashboardPackagesSupported: true/);
  assert.match(format, /combinedAssetsSupported: true/);
  assert.match(combined, /multipleScriptsSupported: true/);
  assert.match(combined, /dashboardApplyActivatesScripts: false/);
  assert.match(combined, /PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED/);
  assert.match(updater, /combinedPackageUpdatesSupported: true/);
});
