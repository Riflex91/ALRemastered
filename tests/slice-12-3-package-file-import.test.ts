import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  createScriptPackage,
  sha256Text,
  validateScriptPackage,
} from "../src/packages/format.ts";
import {
  ScriptPackageImportError,
  ScriptPackageImporter,
} from "../src/packages/importer.ts";

function fixture(mainSource = "log('fixture remains inactive');\n") {
  return createScriptPackage({
    manifest: {
      id: "org.example.import-fixture",
      name: "Import Fixture",
      version: "1.2.3",
      author: { name: "Example Author" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.76" },
        adventureLand: { channel: "live" },
      },
      permissions: ["movement", "inventory.destroy"],
      scripts: [
        { path: "scripts/main.js", entry: true },
        { path: "scripts/helper.js", entry: false },
      ],
      configSchema: { path: "config.schema.json" },
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": mainSource,
      "scripts/helper.js": "export const helper = true;\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: { monster: { type: "string", default: "goo" } },
        additionalProperties: false,
      }),
      "README.md": "# Import Fixture\n\nA package description shown before import.\n",
    },
  });
}

test("Slice 12.3 preview exposes description, rights, config and source without execution", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-import-preview-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const preview = importer.preview(fixture());

    assert.equal(preview.status, "ready");
    assert.equal(preview.name, "Import Fixture");
    assert.match(preview.description, /package description shown before import/i);
    assert.deepEqual(preview.permissions, ["movement", "inventory.destroy"]);
    assert.deepEqual(preview.safePermissions, ["movement"]);
    assert.deepEqual(preview.dangerousPermissions, ["inventory.destroy"]);
    assert.equal(preview.requiresDangerousConfirmation, true);
    assert.equal(preview.configSchema.type, "object");
    assert.equal(preview.code.length, 2);
    assert.equal(preview.code.find((file) => file.entry)?.path, "scripts/main.js");
    assert.match(preview.code.find((file) => file.entry)?.source ?? "", /remains inactive/);
    assert.equal(preview.executionSupported, false);
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.3 blocks unapproved dangerous rights and imports approved package inactive", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-import-confirm-"));
  try {
    const importer = new ScriptPackageImporter(root, undefined, () => new Date("2026-10-04T17:00:00.000Z"));
    const packageDocument = fixture();
    const preview = importer.preview(packageDocument);

    assert.throws(
      () => importer.importPackage({
        packageDocument,
        previewToken: preview.previewToken,
      }),
      (error: unknown) =>
        error instanceof ScriptPackageImportError &&
        error.code === "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED",
    );

    const receipt = importer.importPackage({
      packageDocument,
      previewToken: preview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });
    assert.equal(receipt.status, "imported");
    assert.equal(receipt.inactive, true);
    assert.equal(receipt.executionAttempted, false);
    assert.equal(receipt.gameplayMutation, false);
    assert.deepEqual(receipt.approvedDangerous, ["inventory.destroy"]);

    const packageDir = join(root, sha256Text(preview.packageId));
    const importedPath = join(packageDir, receipt.importedFileName);
    const receiptPath = join(packageDir, receipt.receiptFileName);
    assert.equal(existsSync(importedPath), true);
    assert.equal(existsSync(receiptPath), true);
    assert.equal(validateScriptPackage(JSON.parse(readFileSync(importedPath, "utf8"))).valid, true);
    const storedReceipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(storedReceipt.inactive, true);
    assert.equal(storedReceipt.executionAttempted, false);
    assert.deepEqual(storedReceipt.approvedDangerous, ["inventory.destroy"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.3 rejects stale preview and conflicting same-version content", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-import-conflict-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const first = fixture();
    const firstPreview = importer.preview(first);

    assert.throws(
      () => importer.importPackage({
        packageDocument: first,
        previewToken: "stale-token",
        approvedDangerous: ["inventory.destroy"],
      }),
      (error: unknown) =>
        error instanceof ScriptPackageImportError &&
        error.code === "PACKAGE_IMPORT_PREVIEW_STALE",
    );

    importer.importPackage({
      packageDocument: first,
      previewToken: firstPreview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });

    const changed = fixture("log('different same-version content');\n");
    const changedPreview = importer.preview(changed);
    assert.throws(
      () => importer.importPackage({
        packageDocument: changed,
        previewToken: changedPreview.previewToken,
        approvedDangerous: ["inventory.destroy"],
      }),
      (error: unknown) =>
        error instanceof ScriptPackageImportError &&
        error.code === "PACKAGE_IMPORT_VERSION_CONFLICT",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.3 self-test exercises persistence and cleans verification files", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-import-self-test-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const result = importer.runSelfTest();
    assert.equal(result.status, "ready");
    assert.equal(result.checks.previewReady, true);
    assert.equal(result.checks.descriptionVisible, true);
    assert.equal(result.checks.permissionsVisible, true);
    assert.equal(result.checks.configurationVisible, true);
    assert.equal(result.checks.codeVisible, true);
    assert.equal(result.checks.dangerousConfirmationRequired, true);
    assert.equal(result.checks.unapprovedRejected, true);
    assert.equal(result.checks.unapprovedErrorCode, "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED");
    assert.equal(result.checks.importPersisted, true);
    assert.equal(result.checks.approvedPermissionPersisted, true);
    assert.equal(result.checks.importedInactive, true);
    assert.equal(result.checks.executionAttempted, false);
    assert.equal(result.checks.cleanup, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.3 dashboard endpoints preview and confirm package import without execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-import-api-"));
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const importer = new ScriptPackageImporter(root);
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-12-3-package-import-test" }),
    runtime,
    scriptPackageImporter: importer,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();
  const packageDocument = fixture();

  try {
    const descriptorResponse = await fetch(`${url}/api/packages/import`);
    assert.equal(descriptorResponse.status, 200);
    const descriptor = await descriptorResponse.json();
    assert.equal(descriptor.importedPackagesInactive, true);
    assert.equal(descriptor.executionSupported, false);

    const previewResponse = await fetch(`${url}/api/packages/import/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ package: packageDocument }),
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.description.includes("package description"), true);
    assert.deepEqual(preview.dangerousPermissions, ["inventory.destroy"]);

    const deniedResponse = await fetch(`${url}/api/packages/import/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package: packageDocument,
        previewToken: preview.previewToken,
        approvedDangerous: [],
      }),
    });
    assert.equal(deniedResponse.status, 400);
    const denied = await deniedResponse.json();
    assert.equal(denied.errorCode, "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED");

    const importResponse = await fetch(`${url}/api/packages/import/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package: packageDocument,
        previewToken: preview.previewToken,
        approvedDangerous: ["inventory.destroy"],
      }),
    });
    assert.equal(importResponse.status, 200);
    const receipt = await importResponse.json();
    assert.equal(receipt.status, "imported");
    assert.equal(receipt.inactive, true);
    assert.equal(receipt.executionAttempted, false);

    const selfTestResponse = await fetch(`${url}/api/packages/import/self-test`);
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

test("Slice 12.3 file import remains retained while Slice 12.4 owns remote import", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const importer = readFileSync(new URL("../src/packages/importer.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="13\.2"/);
  assert.match(html, /id="package-import-file"/);
  assert.match(html, /id="package-import-preview"/);
  assert.match(html, /id="package-import-confirm"/);
  assert.match(html, /id="package-import-description"/);
  assert.match(html, /id="package-import-permissions"/);
  assert.match(html, /id="package-import-config"/);
  assert.match(html, /id="package-import-code"/);
  assert.match(html, /Slice 12\.3 one-click Package File Import test/);

  assert.match(app, /\/api\/packages\/import\/preview/);
  assert.match(app, /\/api\/packages\/import\/confirm/);
  assert.match(app, /dangerous-confirmation-required/);
  assert.match(app, /confirmed-import-persisted/);
  assert.match(app, /Imported inactive/);

  assert.match(server, /POST" && path === "\/api\/packages\/import\/preview"/);
  assert.match(server, /POST" && path === "\/api\/packages\/import\/confirm"/);
  assert.match(server, /GET" && path === "\/api\/packages\/import\/self-test"/);

  assert.match(importer, /importedPackagesInactive: true/);
  assert.match(importer, /executionSupported: false/);
  assert.match(importer, /linkImportSupported: true/);
  assert.match(importer, /githubImportSupported: true/);
  assert.match(importer, /libraryManagementSupported: false/);
});
