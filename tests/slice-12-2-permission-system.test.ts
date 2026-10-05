import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";
import {
  ScriptPackageFormatError,
  createScriptPackage,
} from "../src/packages/format.ts";
import {
  DANGEROUS_SCRIPT_PACKAGE_PERMISSIONS,
  SCRIPT_PACKAGE_PERMISSIONS,
  ScriptPackagePermissionError,
  authorizeScriptPackagePermission,
  createScriptPackagePermissionGrant,
  runScriptPackagePermissionSelfTest,
  scriptPackagePermissionDescriptor,
} from "../src/packages/permissions.ts";

test("Slice 12.2 exposes all canonical permissions and dangerous permissions default to denied", () => {
  assert.deepEqual(SCRIPT_PACKAGE_PERMISSIONS, [
    "combat",
    "movement",
    "inventory.read",
    "inventory.use",
    "inventory.sell",
    "inventory.destroy",
    "trade",
    "gold.send",
    "item.send",
    "bank",
    "merchant",
    "character.communication",
    "storage",
    "network.external",
  ]);

  const descriptor = scriptPackagePermissionDescriptor();
  assert.equal(descriptor.defaultPolicy, "deny");
  assert.equal(descriptor.permissionCount, 14);
  assert.equal(descriptor.dangerousDefaultAllowed, false);
  assert.equal(descriptor.dangerousRequireExplicitApproval, true);
  assert.equal(descriptor.undeclaredAllowed, false);
  assert.equal(descriptor.unknownAllowed, false);
  assert.equal(descriptor.importSupported, false);
  assert.equal(descriptor.executionSupported, false);
  assert.deepEqual(descriptor.dangerousPermissions, DANGEROUS_SCRIPT_PACKAGE_PERMISSIONS);
});

test("Slice 12.2 allows declared safe permissions but requires explicit dangerous approval", () => {
  const grant = createScriptPackagePermissionGrant({
    declared: ["combat", "movement", "inventory.destroy", "gold.send"],
  });
  assert.equal(authorizeScriptPackagePermission(grant, "combat").allowed, true);
  assert.equal(authorizeScriptPackagePermission(grant, "movement").allowed, true);

  const destroy = authorizeScriptPackagePermission(grant, "inventory.destroy");
  assert.equal(destroy.allowed, false);
  assert.equal(destroy.code, "PACKAGE_PERMISSION_REQUIRES_CONFIRMATION");

  const approved = createScriptPackagePermissionGrant({
    declared: ["inventory.destroy", "gold.send"],
    approvedDangerous: ["inventory.destroy", "gold.send"],
  });
  assert.equal(authorizeScriptPackagePermission(approved, "inventory.destroy").allowed, true);
  assert.equal(authorizeScriptPackagePermission(approved, "gold.send").allowed, true);
});

test("Slice 12.2 denies undeclared and unknown permissions", () => {
  const grant = createScriptPackagePermissionGrant({ declared: ["movement"] });
  const undeclared = authorizeScriptPackagePermission(grant, "combat");
  assert.equal(undeclared.allowed, false);
  assert.equal(undeclared.code, "PACKAGE_PERMISSION_NOT_DECLARED");

  const unknown = authorizeScriptPackagePermission(grant, "filesystem.write");
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.code, "PACKAGE_PERMISSION_UNKNOWN");
});

test("Slice 12.2 rejects invalid dangerous approvals and unsupported manifest permissions", () => {
  assert.throws(
    () => createScriptPackagePermissionGrant({
      declared: ["movement"],
      approvedDangerous: ["movement"],
    }),
    (error: unknown) =>
      error instanceof ScriptPackagePermissionError &&
      error.code === "PACKAGE_PERMISSION_APPROVAL_INVALID",
  );

  assert.throws(
    () => createScriptPackage({
      manifest: {
        id: "org.example.bad-permission",
        name: "Bad Permission",
        version: "1.0.0",
        author: { name: "Test" },
        compatibility: {
          alremastered: { minVersion: "0.1.0-alpha.75" },
          adventureLand: { channel: "live" },
        },
        permissions: ["filesystem.write"],
        scripts: [{ path: "scripts/main.js", entry: true }],
        configSchema: { path: "config.schema.json" },
        readme: { path: "README.md" },
      },
      files: {
        "scripts/main.js": "log('fixture');\n",
        "config.schema.json": "{}",
        "README.md": "# Test\n",
      },
    }),
    (error: unknown) =>
      error instanceof ScriptPackageFormatError &&
      error.code === "PACKAGE_PERMISSIONS_INVALID",
  );
});

test("Slice 12.2 self-test proves default denial and explicit dangerous grants", () => {
  const selfTest = runScriptPackagePermissionSelfTest();
  assert.equal(selfTest.status, "ready");
  assert.equal(selfTest.checks.canonicalPermissions, true);
  assert.equal(selfTest.checks.safeDeclaredAllowed, true);
  assert.equal(selfTest.checks.dangerousDefaultDenied, true);
  assert.equal(selfTest.checks.dangerousExplicitApprovalAllowed, true);
  assert.equal(selfTest.checks.undeclaredDenied, true);
  assert.equal(selfTest.checks.unknownDenied, true);
  assert.equal(selfTest.checks.importAttempted, false);
  assert.equal(selfTest.checks.executionAttempted, false);
  assert.equal(selfTest.checks.gameplayMutation, false);
});

test("Slice 12.2 exposes GET-only permission diagnostics", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const dashboard = new DashboardServer({
    logger: new Logger({ component: "slice-12-2-permission-test" }),
    runtime,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const descriptorResponse = await fetch(`${url}/api/packages/permissions`);
    assert.equal(descriptorResponse.status, 200);
    const descriptor = await descriptorResponse.json();
    assert.equal(descriptor.permissionCount, 14);
    assert.equal(descriptor.dangerousDefaultAllowed, false);

    const selfTestResponse = await fetch(`${url}/api/packages/permissions/self-test`);
    assert.equal(selfTestResponse.status, 200);
    const selfTest = await selfTestResponse.json();
    assert.equal(selfTest.status, "ready");
    assert.equal(selfTest.checks.dangerousDefaultDenied, true);

    const mutationAttempt = await fetch(`${url}/api/packages/permissions`, { method: "POST" });
    assert.equal(mutationAttempt.status, 405);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 12.2 remains retained while Slice 12.4 is the current verification", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const permissions = readFileSync(new URL("../src/packages/permissions.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="14\.2"/);
  assert.match(html, /data-verification-test="12\.1" hidden/);
  assert.match(html, /data-verification-test="12\.2" hidden/);
  assert.match(html, /Slice 12\.2 one-click Permission System test/);

  assert.match(app, /canonical-permission-registry/);
  assert.match(app, /dangerous-default-denied/);
  assert.match(app, /dangerous-explicit-approval/);
  assert.match(app, /undeclared-denied/);
  assert.match(app, /unknown-denied/);
  assert.match(app, /Package import attempted: false/);
  assert.match(app, /Package execution attempted: false/);

  assert.match(server, /GET" && path === "\/api\/packages\/permissions"/);
  assert.match(server, /GET" && path === "\/api\/packages\/permissions\/self-test"/);
  assert.doesNotMatch(server, /POST" && path === "\/api\/packages\/permissions/);

  assert.match(permissions, /defaultPolicy: "deny"/);
  assert.match(permissions, /dangerousDefaultAllowed: false/);
  assert.match(permissions, /dangerousRequireExplicitApproval: true/);
  assert.match(permissions, /importSupported: false/);
  assert.match(permissions, /executionSupported: false/);
});
