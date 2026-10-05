import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  createScriptPackage,
  type ScriptPackageDocument,
} from "../src/packages/format.ts";
import { ScriptPackageImporter } from "../src/packages/importer.ts";
import { ScriptPackageLibrary } from "../src/packages/library.ts";
import {
  ScriptPackageUpdateError,
  ScriptPackageUpdateService,
} from "../src/packages/updater.ts";

function fixture(version = "1.0.0"): ScriptPackageDocument {
  return createScriptPackage({
    manifest: {
      id: "org.example.slice126",
      name: "Slice 12.6 Test Package",
      version,
      author: { name: "Test Author" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.79" },
        adventureLand: { channel: "live" },
      },
      permissions: ["movement"],
      scripts: [{ path: "scripts/main.js", entry: true }],
      configSchema: { path: "config.schema.json" },
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": "log('never executed');\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: { monster: { type: "string", default: "goo" } },
        required: ["monster"],
        additionalProperties: false,
      }),
      "README.md":
        `# Slice 12.6 Test Package\n\n## Changelog\n\n### ${version}\n\n- Test release.\n`,
    },
  });
}

test("Slice 12.6 self-test verifies version, changelog, permission confirmation, update and rollback", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-self-test-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const library = new ScriptPackageLibrary({ rootDir: root });
    const updater = new ScriptPackageUpdateService({
      rootDir: root,
      importer,
      library,
    });
    const result = await updater.runSelfTest();
    assert.equal(result.status, "ready");
    assert.equal(result.checks.remoteSourcePersisted, true);
    assert.equal(result.checks.availableVersionVisible, true);
    assert.equal(result.checks.changelogVisible, true);
    assert.equal(result.checks.newPermissionsDetected, true);
    assert.equal(result.checks.allNewPermissionsRequireConfirmation, true);
    assert.equal(result.checks.updateInstalled, true);
    assert.equal(result.checks.dangerousApprovalPersisted, true);
    assert.equal(result.checks.configurationMigrated, true);
    assert.equal(result.checks.rollbackRestored, true);
    assert.equal(result.checks.staleUpdateRejected, true);
    assert.equal(result.checks.noExecution, true);
    assert.equal(result.checks.sourceRefetched, true);
    assert.equal(result.checks.cleanup, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.6 local-file packages fail update checks without a persisted remote source", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-local-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const document = fixture();
    const preview = importer.preview(document);
    importer.importPackage({
      packageDocument: document,
      previewToken: preview.previewToken,
    });
    const library = new ScriptPackageLibrary({ rootDir: root });
    library.setActive({
      packageId: document.manifest.id,
      version: document.manifest.version,
      active: true,
    });
    const updater = new ScriptPackageUpdateService({
      rootDir: root,
      importer,
      library,
    });
    await assert.rejects(
      () => updater.check(document.manifest.id),
      (error: unknown) =>
        error instanceof ScriptPackageUpdateError &&
        error.code === "PACKAGE_UPDATE_SOURCE_UNAVAILABLE",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.6 dashboard API exposes update descriptor and isolated self-test", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-api-"));
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const importer = new ScriptPackageImporter(root);
  const library = new ScriptPackageLibrary({ rootDir: root });
  const updater = new ScriptPackageUpdateService({
    rootDir: root,
    importer,
    library,
  });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-12-6-test" }),
    runtime,
    scriptPackageImporter: importer,
    scriptPackageLibrary: library,
    scriptPackageUpdateService: updater,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const descriptorResponse = await fetch(`${url}/api/packages/updates/descriptor`);
    assert.equal(descriptorResponse.status, 200);
    const descriptor = await descriptorResponse.json();
    assert.equal(descriptor.availableVersionSupported, true);
    assert.equal(descriptor.changelogSupported, true);
    assert.equal(descriptor.updateSupported, true);
    assert.equal(descriptor.rollbackSupported, true);
    assert.equal(descriptor.newPermissionsRequireConfirmation, true);
    assert.equal(descriptor.updateExecutesPackage, false);
    assert.equal(descriptor.rollbackExecutesPackage, false);
    assert.equal(descriptor.executionSupported, false);

    const selfTestResponse = await fetch(`${url}/api/packages/updates/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");
    assert.equal(selfTest.checks.updateInstalled, true);
    assert.equal(selfTest.checks.rollbackRestored, true);
    assert.equal(selfTest.checks.cleanup, true);
  } finally {
    await dashboard.stop();
    runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.6 is current verification and UI exposes update and rollback controls", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const updater = readFileSync(new URL("../src/packages/updater.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.2"/);
  assert.match(html, /Slice 12\.6 one-click Updates \/ Rollback test/);
  assert.match(html, /Every permission newly requested by an update must be explicitly confirmed/);

  assert.match(app, /Check for updates/);
  assert.match(app, /Install update/);
  assert.match(app, /Restore previous version/);
  assert.match(app, /\/api\/packages\/updates\/check/);
  assert.match(app, /\/api\/packages\/updates\/apply/);
  assert.match(app, /\/api\/packages\/updates\/rollback/);
  assert.match(app, /new-permissions-confirmation-required/);
  assert.match(app, /previous-version-rollback/);
  assert.match(app, /stale-update-protection/);

  assert.match(server, /GET" && path === "\/api\/packages\/updates\/descriptor"/);
  assert.match(server, /GET" && path === "\/api\/packages\/updates\/self-test"/);
  assert.match(server, /POST" && path === "\/api\/packages\/updates\/check"/);
  assert.match(server, /POST" && path === "\/api\/packages\/updates\/apply"/);
  assert.match(server, /POST" && path === "\/api\/packages\/updates\/rollback"/);

  assert.match(updater, /availableVersionSupported: true/);
  assert.match(updater, /changelogSupported: true/);
  assert.match(updater, /newPermissionsRequireConfirmation: true/);
  assert.match(updater, /PACKAGE_UPDATE_PERMISSION_CONFIRMATION_REQUIRED/);
  assert.match(updater, /PACKAGE_UPDATE_PREVIEW_STALE/);
  assert.match(updater, /rollback\(packageId\s*\)/);
  assert.match(updater, /updateExecutesPackage: false/);
  assert.match(updater, /rollbackExecutesPackage: false/);
});
