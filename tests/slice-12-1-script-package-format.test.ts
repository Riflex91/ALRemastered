import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  SCRIPT_PACKAGE_FILE_EXTENSION,
  SCRIPT_PACKAGE_FORMAT,
  SCRIPT_PACKAGE_HASH_ALGORITHM,
  SCRIPT_PACKAGE_SCHEMA_VERSION,
  ScriptPackageFormatError,
  createScriptPackage,
  runScriptPackageFormatSelfTest,
  scriptPackageFormatDescriptor,
  validateScriptPackage,
} from "../src/packages/format.ts";

function fixtureInput() {
  return {
    manifest: {
      id: "org.example.farmer",
      name: "Example Farmer",
      version: "1.2.3",
      author: { name: "Example Author", url: "https://example.com" },
      compatibility: {
        alremastered: { minVersion: "0.1.0-alpha.74" },
        adventureLand: { channel: "live" as const, dataVersion: 17478 },
      },
      permissions: ["movement", "combat"],
      scripts: [
        { path: "scripts/main.js", entry: true },
        { path: "scripts/helpers.js", entry: false },
      ],
      configSchema: { path: "config.schema.json" },
      readme: { path: "README.md" },
    },
    files: {
      "scripts/main.js": "log('fixture');\n",
      "scripts/helpers.js": "function helper() { return true; }\n",
      "config.schema.json": JSON.stringify({
        type: "object",
        properties: { monster: { type: "string" } },
      }),
      "README.md": "# Example Farmer\n",
    },
  };
}

test("Slice 12.1 creates and validates a deterministic hash-backed script package", () => {
  const packageDocument = createScriptPackage(fixtureInput());
  const inspection = validateScriptPackage(packageDocument);

  assert.equal(packageDocument.format, SCRIPT_PACKAGE_FORMAT);
  assert.equal(packageDocument.schemaVersion, SCRIPT_PACKAGE_SCHEMA_VERSION);
  assert.equal(packageDocument.hashes.algorithm, SCRIPT_PACKAGE_HASH_ALGORITHM);
  assert.equal(packageDocument.hashes.manifest.length, 64);
  assert.equal(Object.keys(packageDocument.hashes.files).length, 4);

  assert.equal(inspection.valid, true);
  assert.equal(inspection.packageId, "org.example.farmer");
  assert.equal(inspection.version, "1.2.3");
  assert.equal(inspection.author, "Example Author");
  assert.equal(inspection.scriptCount, 2);
  assert.equal(inspection.entryScript, "scripts/main.js");
  assert.equal(inspection.configSchemaPath, "config.schema.json");
  assert.equal(inspection.readmePath, "README.md");
  assert.deepEqual(inspection.permissions, ["movement", "combat"]);
  assert.equal(inspection.permissionEnforcement, false);
  assert.equal(inspection.importAttempted, false);
  assert.equal(inspection.executionAttempted, false);
});

test("Slice 12.1 rejects changed package content when SHA-256 no longer matches", () => {
  const packageDocument = structuredClone(createScriptPackage(fixtureInput()));
  packageDocument.files["scripts/main.js"] += "// modified\n";

  assert.throws(
    () => validateScriptPackage(packageDocument),
    (error: unknown) =>
      error instanceof ScriptPackageFormatError &&
      error.code === "PACKAGE_HASH_MISMATCH",
  );
});

test("Slice 12.1 rejects unsafe package paths before hashing", () => {
  const fixture = fixtureInput();
  fixture.manifest.scripts[0] = { path: "../escape.js", entry: true };

  assert.throws(
    () => createScriptPackage(fixture),
    (error: unknown) =>
      error instanceof ScriptPackageFormatError &&
      error.code === "PACKAGE_PATH_INVALID",
  );
});

test("Slice 12.1 descriptor and self-test cover every roadmap package-format field", () => {
  const descriptor = scriptPackageFormatDescriptor();
  const selfTest = runScriptPackageFormatSelfTest();

  assert.equal(descriptor.status, "ready");
  assert.equal(descriptor.fileExtension, SCRIPT_PACKAGE_FILE_EXTENSION);
  assert.equal(descriptor.permissionDeclarationsOnly, true);
  assert.equal(descriptor.permissionEnforcement, false);
  assert.equal(descriptor.importSupported, false);
  assert.equal(descriptor.executionSupported, false);
  for (const field of [
    "id",
    "name",
    "version",
    "author",
    "compatibility",
    "permissions",
    "scripts",
    "configSchema",
    "readme",
  ]) {
    assert.equal(descriptor.requiredManifestFields.includes(field), true);
  }

  assert.equal(selfTest.status, "ready");
  assert.equal(selfTest.checks.manifest, true);
  assert.equal(selfTest.checks.scripts, true);
  assert.equal(selfTest.checks.configSchema, true);
  assert.equal(selfTest.checks.readme, true);
  assert.equal(selfTest.checks.version, true);
  assert.equal(selfTest.checks.author, true);
  assert.equal(selfTest.checks.compatibility, true);
  assert.equal(selfTest.checks.permissionsDeclared, true);
  assert.equal(selfTest.checks.sha256, true);
  assert.equal(selfTest.checks.tamperRejected, true);
  assert.equal(selfTest.checks.tamperErrorCode, "PACKAGE_HASH_MISMATCH");
  assert.equal(selfTest.checks.permissionEnforcement, false);
  assert.equal(selfTest.checks.importAttempted, false);
  assert.equal(selfTest.checks.executionAttempted, false);
});

test("Slice 12.1 exposes only read-only package-format endpoints", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-12-1-package-format-test" }),
    runtime,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const descriptorResponse = await fetch(`${url}/api/packages/format`);
    assert.equal(descriptorResponse.status, 200);
    const descriptor = await descriptorResponse.json();
    assert.equal(descriptor.format, SCRIPT_PACKAGE_FORMAT);
    assert.equal(descriptor.importSupported, false);
    assert.equal(descriptor.executionSupported, false);

    const selfTestResponse = await fetch(`${url}/api/packages/format/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");
    assert.equal(selfTest.checks.tamperRejected, true);

    const mutationAttempt = await fetch(`${url}/api/packages/format`, { method: "POST" });
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 12.1 is the single current verification and retains later-slice boundaries", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const format = readFileSync(new URL("../src/packages/format.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="12\.3"/);
  assert.match(html, /data-verification-test="11\.4" hidden/);
  assert.match(html, /data-verification-test="12\.1" hidden/);
  assert.match(html, /Slice 12\.1 one-click Script Package format test/);

  assert.match(app, /\/api\/packages\/format/);
  assert.match(app, /package-format-descriptor/);
  assert.match(app, /manifest-required-fields/);
  assert.match(app, /sha256-integrity/);
  assert.match(app, /tamper-rejected/);
  assert.match(app, /declaration-only-no-import-execution/);
  assert.match(app, /Package import attempted: false/);
  assert.match(app, /Package execution attempted: false/);

  assert.match(server, /GET" && path === "\/api\/packages\/format"/);
  assert.match(server, /GET" && path === "\/api\/packages\/format\/self-test"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/packages\/format/);

  assert.match(format, /SCRIPT_PACKAGE_FORMAT = "alremastered-script-package"/);
  assert.match(format, /SCRIPT_PACKAGE_FILE_EXTENSION = "\.alrpkg"/);
  assert.match(format, /SCRIPT_PACKAGE_HASH_ALGORITHM = "sha256"/);
  assert.match(format, /permissionEnforcement: false/);
  assert.match(format, /importSupported: false/);
  assert.match(format, /executionSupported: false/);
});
