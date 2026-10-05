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
  type ScriptPackageDocument,
} from "../src/packages/format.ts";
import {
  ScriptPackageImportError,
  ScriptPackageImporter,
} from "../src/packages/importer.ts";

const LINK_URL = "https://packages.example.com/community.alrpkg";
const GITHUB_URL =
  "https://github.com/example/community-pack/blob/v1.2.3/dist/community.alrpkg";
const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/example/community-pack/v1.2.3/dist/community.alrpkg";

function fixture(mainSource = "log('remote fixture remains inactive');\n"): ScriptPackageDocument {
  return createScriptPackage({
    manifest: {
      id: "org.example.remote-import",
      name: "Remote Import Fixture",
      version: "1.2.3",
      author: { name: "Example Author" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.77" },
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
      "README.md": "# Remote Import Fixture\n\nA remote package description shown before import.\n",
    },
  });
}

function remoteDependencies(initial = fixture()) {
  let current: ScriptPackageDocument = initial;
  let requests = 0;
  const fetcher: typeof fetch = async (input) => {
    requests += 1;
    const url = String(input);
    if (url !== LINK_URL && url !== GITHUB_RAW_URL) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(current), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const lookupHost = async () => [{ address: "93.184.216.34", family: 4 }] as const;
  return {
    fetcher,
    lookupHost,
    setCurrent(value: ScriptPackageDocument) {
      current = value;
    },
    requestCount() {
      return requests;
    },
  };
}

test("Slice 12.4 previews approved HTTPS package links and supported GitHub blob sources", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-remote-preview-"));
  const remote = remoteDependencies();
  try {
    const importer = new ScriptPackageImporter(
      root,
      undefined,
      () => new Date("2026-10-04T18:00:00.000Z"),
      remote,
    );

    const link = await importer.previewRemote(LINK_URL);
    assert.equal(link.status, "ready");
    assert.equal(link.remoteSource.kind, "link");
    assert.equal(link.remoteSource.inputUrl, LINK_URL);
    assert.equal(link.remoteSource.resolvedUrl, LINK_URL);
    assert.match(link.description, /remote package description/i);
    assert.deepEqual(link.permissions, ["movement", "inventory.destroy"]);
    assert.deepEqual(link.dangerousPermissions, ["inventory.destroy"]);
    assert.equal(link.configSchema.type, "object");
    assert.equal(link.code.length, 2);
    assert.equal(link.executionSupported, false);

    const github = await importer.previewRemote(GITHUB_URL);
    assert.equal(github.remoteSource.kind, "github");
    assert.equal(github.remoteSource.repository, "example/community-pack");
    assert.equal(github.remoteSource.ref, "v1.2.3");
    assert.equal(github.remoteSource.path, "dist/community.alrpkg");
    assert.equal(github.remoteSource.resolvedUrl, GITHUB_RAW_URL);

    const descriptor = importer.descriptor();
    assert.equal(descriptor.linkImportSupported, true);
    assert.equal(descriptor.githubImportSupported, true);
    assert.equal(descriptor.remotePreviewRefetchOnConfirm, true);
    assert.equal(descriptor.remoteHttpsOnly, true);
    assert.equal(descriptor.executionSupported, false);
    assert.equal(descriptor.libraryManagementSupported, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.4 re-fetches on confirm, requires dangerous approval, and rejects changed remote content", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-remote-confirm-"));
  const remote = remoteDependencies();
  try {
    const importer = new ScriptPackageImporter(
      root,
      undefined,
      () => new Date("2026-10-04T18:00:00.000Z"),
      remote,
    );
    const preview = await importer.previewRemote(LINK_URL);

    await assert.rejects(
      () => importer.importRemote({
        source: LINK_URL,
        previewToken: preview.previewToken,
      }),
      (error: unknown) =>
        error instanceof ScriptPackageImportError &&
        error.code === "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED",
    );

    const receipt = await importer.importRemote({
      source: LINK_URL,
      previewToken: preview.previewToken,
      approvedDangerous: ["inventory.destroy"],
    });
    assert.equal(receipt.status, "imported");
    assert.equal(receipt.inactive, true);
    assert.equal(receipt.executionAttempted, false);
    assert.equal(receipt.gameplayMutation, false);
    assert.equal(receipt.remoteSource.kind, "link");

    const changed = fixture("log('changed remote content');\n");
    remote.setCurrent(changed);
    await assert.rejects(
      () => importer.importRemote({
        source: LINK_URL,
        previewToken: preview.previewToken,
        approvedDangerous: ["inventory.destroy"],
      }),
      (error: unknown) =>
        error instanceof ScriptPackageImportError &&
        error.code === "PACKAGE_IMPORT_PREVIEW_STALE",
    );
    assert.ok(remote.requestCount() >= 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.4 blocks insecure, private, credentialed, and unsupported GitHub sources", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-remote-safety-"));
  const remote = remoteDependencies();
  try {
    const importer = new ScriptPackageImporter(root, undefined, undefined, remote);
    for (const source of [
      "http://packages.example.com/community.alrpkg",
      "https://127.0.0.1/community.alrpkg",
      "https://user:secret@packages.example.com/community.alrpkg",
      "https://packages.example.com:8443/community.alrpkg",
    ]) {
      await assert.rejects(
        () => importer.previewRemote(source),
        (error: unknown) =>
          error instanceof ScriptPackageImportError &&
          error.code === "PACKAGE_IMPORT_REMOTE_SOURCE_UNSAFE",
      );
    }

    await assert.rejects(
      () => importer.previewRemote("https://github.com/example/community-pack/tree/main/dist"),
      (error: unknown) =>
        error instanceof ScriptPackageImportError &&
        error.code === "PACKAGE_IMPORT_GITHUB_SOURCE_UNSUPPORTED",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.4 self-test covers link/GitHub resolution, stale protection, persistence and cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-remote-self-test-"));
  try {
    const importer = new ScriptPackageImporter(root);
    const result = await importer.runRemoteSelfTest();
    assert.equal(result.status, "ready");
    assert.equal(result.checks.linkPreviewReady, true);
    assert.equal(result.checks.githubPreviewReady, true);
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
    assert.equal(result.checks.sourceRefetchedOnConfirm, true);
    assert.equal(result.checks.staleRejected, true);
    assert.equal(result.checks.staleErrorCode, "PACKAGE_IMPORT_PREVIEW_STALE");
    assert.equal(result.checks.insecureSourceRejected, true);
    assert.equal(result.checks.privateSourceRejected, true);
    assert.equal(result.checks.cleanup, true);
    assert.equal(existsSync(join(root, ".slice-12-4-verification")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.4 dashboard API previews and confirms remote packages without execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-remote-api-"));
  const remote = remoteDependencies();
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const importer = new ScriptPackageImporter(root, undefined, undefined, remote);
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-12-4-remote-import-test" }),
    runtime,
    scriptPackageImporter: importer,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const previewResponse = await fetch(`${url}/api/packages/import/remote/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: GITHUB_URL }),
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.remoteSource.kind, "github");
    assert.equal(preview.remoteSource.resolvedUrl, GITHUB_RAW_URL);
    assert.deepEqual(preview.dangerousPermissions, ["inventory.destroy"]);

    const deniedResponse = await fetch(`${url}/api/packages/import/remote/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: GITHUB_URL,
        previewToken: preview.previewToken,
        approvedDangerous: [],
      }),
    });
    assert.equal(deniedResponse.status, 400);
    const denied = await deniedResponse.json();
    assert.equal(denied.errorCode, "PACKAGE_IMPORT_PERMISSION_CONFIRMATION_REQUIRED");

    const confirmResponse = await fetch(`${url}/api/packages/import/remote/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: GITHUB_URL,
        previewToken: preview.previewToken,
        approvedDangerous: ["inventory.destroy"],
      }),
    });
    assert.equal(confirmResponse.status, 200);
    const receipt = await confirmResponse.json();
    assert.equal(receipt.inactive, true);
    assert.equal(receipt.executionAttempted, false);
    assert.equal(receipt.remoteSource.kind, "github");

    const selfTestResponse = await fetch(`${url}/api/packages/import/remote/self-test`);
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

test("Slice 12.4 remains retained while Slice 12.6 owns Updates / Rollback verification", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const importer = readFileSync(new URL("../src/packages/importer.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.2"/);
  assert.match(html, /id="package-import-source"/);
  assert.match(html, /id="package-import-remote-preview"/);
  assert.match(html, /Slice 12\.4 one-click Link \/ GitHub Import test/);

  assert.match(app, /\/api\/packages\/import\/remote\/preview/);
  assert.match(app, /\/api\/packages\/import\/remote\/confirm/);
  assert.match(app, /remote-source-preview/);
  assert.match(app, /remote-stale-protection/);

  assert.match(server, /POST" && path === "\/api\/packages\/import\/remote\/preview"/);
  assert.match(server, /POST" && path === "\/api\/packages\/import\/remote\/confirm"/);
  assert.match(server, /GET" && path === "\/api\/packages\/import\/remote\/self-test"/);

  assert.match(importer, /linkImportSupported: true/);
  assert.match(importer, /githubImportSupported: true/);
  assert.match(importer, /remotePreviewRefetchOnConfirm: true/);
  assert.match(importer, /libraryManagementSupported: false/);
  assert.match(importer, /executionSupported: false/);
});
