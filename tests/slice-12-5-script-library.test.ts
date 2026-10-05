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
import { ScriptPackageImporter } from "../src/packages/importer.ts";
import {
  ScriptPackageLibrary,
  ScriptPackageLibraryError,
} from "../src/packages/library.ts";
import type { ScriptRuntimeState } from "../src/script/runtime.ts";

function fixture(version: string, monster = "goo"): ScriptPackageDocument {
  return createScriptPackage({
    manifest: {
      id: "org.example.script-library",
      name: "Script Library Fixture",
      version,
      author: { name: "Example Author" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.78" },
        adventureLand: { channel: "live" },
      },
      permissions: ["movement"],
      scripts: [{ path: "scripts/main.js", entry: true }],
      configSchema: { path: "config.schema.json" },
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": "log('Script Library fixture remains unexecuted.');\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: {
          monster: { type: "string", default: monster },
          range: { type: "number", default: 120 },
        },
        required: ["monster"],
        additionalProperties: false,
      }),
      "README.md": "# Script Library Fixture\n\nImported package used for library verification.\n",
    },
  });
}

function importFixture(root: string, document: ScriptPackageDocument): void {
  const importer = new ScriptPackageImporter(
    root,
    undefined,
    () => new Date("2026-10-04T18:00:00.000Z"),
  );
  const preview = importer.preview(document);
  const receipt = importer.importPackage({
    packageDocument: document,
    previewToken: preview.previewToken,
  });
  assert.equal(receipt.inactive, true);
  assert.equal(receipt.executionAttempted, false);
}

function fakeRuntimeState(): ScriptRuntimeState {
  return {
    status: "running",
    scriptName: "User Script",
    loadedAt: "2026-10-04T18:00:00.000Z",
    startedAt: "2026-10-04T18:00:00.000Z",
    runId: "user-script-run",
    activeTimers: 1,
    activeEventListeners: 0,
    logRecords: 0,
    heartbeatSequence: 1,
    lastHeartbeatAt: "2026-10-04T18:00:00.000Z",
    message: "User Script is running.",
  };
}

test("Slice 12.5 self-test verifies My Scripts, imported versions, state, configuration and cleanup", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-library-self-test-"));
  try {
    const library = new ScriptPackageLibrary({
      rootDir: root,
      runtimeState: fakeRuntimeState,
    });
    const result = library.runSelfTest();
    assert.equal(result.status, "ready");
    assert.equal(result.checks.myScriptsVisible, true);
    assert.equal(result.checks.importedVisible, true);
    assert.equal(result.checks.versionsVisible, true);
    assert.equal(result.checks.inactiveByDefault, true);
    assert.equal(result.checks.configurationVisible, true);
    assert.equal(result.checks.configurationPersisted, true);
    assert.equal(result.checks.oneActiveVersion, true);
    assert.equal(result.checks.activationNoExecution, true);
    assert.equal(result.checks.laterSliceBoundaries, true);
    assert.equal(result.checks.cleanup, true);
    assert.equal(existsSync(join(root, ".slice-12-5-verification")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.5 persists one active imported version and configuration without execution", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-library-persist-"));
  try {
    importFixture(root, fixture("1.0.0"));
    importFixture(root, fixture("1.1.0", "bee"));

    const library = new ScriptPackageLibrary({
      rootDir: root,
      runtimeState: fakeRuntimeState,
      now: () => new Date("2026-10-04T18:10:00.000Z"),
    });

    const initial = library.snapshot();
    assert.equal(initial.myScripts[0]?.name, "User Script");
    assert.equal(initial.myScripts[0]?.active, true);
    assert.equal(initial.imported.length, 1);
    assert.equal(initial.imported[0]?.versions.length, 2);
    assert.equal(initial.imported[0]?.activeVersion, undefined);
    assert.equal(initial.imported[0]?.versions.every((entry) => !entry.active), true);

    library.setConfiguration({
      packageId: "org.example.script-library",
      version: "1.0.0",
      configuration: { monster: "crab", range: 180 },
    });
    library.setActive({
      packageId: "org.example.script-library",
      version: "1.0.0",
      active: true,
    });
    library.setActive({
      packageId: "org.example.script-library",
      version: "1.1.0",
      active: true,
    });

    const reloaded = new ScriptPackageLibrary({
      rootDir: root,
      runtimeState: fakeRuntimeState,
    }).snapshot();
    const imported = reloaded.imported[0]!;
    const v1 = imported.versions.find((entry) => entry.version === "1.0.0")!;
    const v2 = imported.versions.find((entry) => entry.version === "1.1.0")!;

    assert.equal(imported.activeVersion, "1.1.0");
    assert.equal(v1.active, false);
    assert.equal(v2.active, true);
    assert.deepEqual(v1.configuration, { monster: "crab", range: 180 });
    assert.equal(v1.executionAttempted, false);
    assert.equal(v2.executionAttempted, false);
    assert.equal(reloaded.executionSupported, false);
    assert.equal(reloaded.activationExecutesPackage, false);
    assert.equal(reloaded.updatesSupported, false);
    assert.equal(reloaded.rollbackSupported, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.5 validates package configuration against the declared Config Schema", () => {
  const root = mkdtempSync(join(tmpdir(), "alr-library-config-"));
  try {
    importFixture(root, fixture("1.0.0"));
    const library = new ScriptPackageLibrary({ rootDir: root });

    assert.throws(
      () => library.setConfiguration({
        packageId: "org.example.script-library",
        version: "1.0.0",
        configuration: { monster: "goo", undeclared: true },
      }),
      (error: unknown) =>
        error instanceof ScriptPackageLibraryError &&
        error.code === "PACKAGE_LIBRARY_CONFIGURATION_INVALID",
    );
    assert.throws(
      () => library.setConfiguration({
        packageId: "org.example.script-library",
        version: "1.0.0",
        configuration: { monster: 42 },
      }),
      (error: unknown) =>
        error instanceof ScriptPackageLibraryError &&
        error.code === "PACKAGE_LIBRARY_CONFIGURATION_INVALID",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slice 12.5 dashboard API exposes library state and persistent metadata changes", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-library-api-"));
  importFixture(root, fixture("1.0.0"));
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const library = new ScriptPackageLibrary({
    rootDir: root,
    runtimeState: fakeRuntimeState,
  });
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-12-5-library-test" }),
    runtime,
    scriptPackageLibrary: library,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const descriptorResponse = await fetch(`${url}/api/packages/library/descriptor`);
    assert.equal(descriptorResponse.status, 200);
    const descriptor = await descriptorResponse.json();
    assert.equal(descriptor.activeStateSupported, true);
    assert.equal(descriptor.configurationSupported, true);
    assert.equal(descriptor.activationExecutesPackage, false);
    assert.equal(descriptor.executionSupported, false);
    assert.equal(descriptor.updatesSupported, false);
    assert.equal(descriptor.rollbackSupported, false);

    const listResponse = await fetch(`${url}/api/packages/library`);
    assert.equal(listResponse.status, 200);
    const initial = await listResponse.json();
    assert.equal(initial.myScripts[0]?.name, "User Script");
    assert.equal(initial.imported[0]?.versions[0]?.active, false);

    const configResponse = await fetch(`${url}/api/packages/library/configuration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: "org.example.script-library",
        version: "1.0.0",
        configuration: { monster: "bee", range: 140 },
      }),
    });
    assert.equal(configResponse.status, 200);

    const activeResponse = await fetch(`${url}/api/packages/library/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageId: "org.example.script-library",
        version: "1.0.0",
        active: true,
      }),
    });
    assert.equal(activeResponse.status, 200);
    const active = await activeResponse.json();
    assert.equal(active.imported[0]?.activeVersion, "1.0.0");
    assert.equal(active.imported[0]?.versions[0]?.executionAttempted, false);

    const selfTestResponse = await fetch(`${url}/api/packages/library/self-test`);
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

test("Slice 12.5 remains retained while Slice 12.6 owns Updates / Rollback verification", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const library = readFileSync(new URL("../src/packages/library.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.2"/);
  assert.match(html, /id="package-library-panel"/);
  assert.match(html, /id="package-library-my-scripts"/);
  assert.match(html, /id="package-library-imported"/);
  assert.match(html, /Slice 12\.5 one-click Script Library test/);

  assert.match(app, /\/api\/packages\/library/);
  assert.match(app, /\/api\/packages\/library\/active/);
  assert.match(app, /\/api\/packages\/library\/configuration/);
  assert.match(app, /my-scripts-visible/);
  assert.match(app, /active-version-persisted/);
  assert.match(app, /activation-no-execution/);
  assert.match(app, /updates-rollback-deferred/);

  assert.match(server, /GET" && path === "\/api\/packages\/library"/);
  assert.match(server, /POST" && path === "\/api\/packages\/library\/active"/);
  assert.match(server, /POST" && path === "\/api\/packages\/library\/configuration"/);
  assert.match(server, /GET" && path === "\/api\/packages\/library\/self-test"/);

  assert.match(library, /activeStateSupported: true/);
  assert.match(library, /configurationSupported: true/);
  assert.match(library, /activationExecutesPackage: false/);
  assert.match(library, /executionSupported: false/);
  assert.match(library, /updatesSupported: false/);
  assert.match(library, /rollbackSupported: false/);
});
