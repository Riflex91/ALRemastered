import assert from "node:assert/strict";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DiagnosticsService } from "../src/diagnostics/service.ts";
import { Logger } from "../src/logging/logger.ts";

test("diagnostics turns artificial failures into understandable sanitized error cards", () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({
    component: "diagnostics-test",
    clock: () => new Date("2026-10-02T16:00:00.000Z"),
  });
  const diagnostics = new DiagnosticsService(logger, () => runtime.health(), {
    clock: () => new Date("2026-10-02T16:01:00.000Z"),
  });

  diagnostics.registerComponent("core", () => ({
    name: "core",
    status: "healthy",
    message: "Core runtime is running.",
  }));
  diagnostics.registerComponent("updater", () => ({
    name: "updater",
    status: "degraded",
    message: "Updater reported an error. Open Recent errors for details.",
  }));

  logger.error(
    "Update check failed.",
    new Error("Authorization: Bearer hidden-token"),
    { password: "hidden-password", endpoint: "GitHub Releases" },
  );
  logger.error(
    "Dashboard request failed.",
    new Error("Synthetic dashboard failure"),
    { route: "/api/test" },
  );
  logger.fatal(
    "Synthetic internal failure.",
    new Error("Synthetic stack detail"),
    { requestId: "diagnostic-request-1" },
  );

  try {
    const snapshot = diagnostics.snapshot();
    assert.equal(snapshot.sanitized, true);
    assert.equal(snapshot.recentErrors.length, 3);
    assert.equal(snapshot.components.find((component) => component.name === "core")?.status, "healthy");
    assert.equal(snapshot.components.find((component) => component.name === "updater")?.status, "degraded");

    assert.match(snapshot.recentErrors[0].summary, /could not check for updates/i);
    assert.match(snapshot.recentErrors[1].summary, /dashboard request failed/i);
    assert.match(snapshot.recentErrors[2].summary, /reported an error/i);

    const technical = snapshot.recentErrors[0].technical;
    assert.equal(technical.message, "Update check failed.");
    assert.equal(technical.context?.password, "[REDACTED]");
    assert.match(technical.error?.stack ?? "", /\[REDACTED\]/);

    const serialized = JSON.stringify(snapshot);
    assert.doesNotMatch(serialized, /hidden-token|hidden-password/);

    const diagnosticPackage = diagnostics.package();
    assert.equal(diagnosticPackage.sanitized, true);
    assert.match(diagnosticPackage.fileName, /^ALRemastered-diagnostics-/);
    assert.match(diagnosticPackage.content, /ALRemasteredDiagnosticPackage/);
    assert.doesNotMatch(diagnosticPackage.content, /hidden-token|hidden-password/);
    assert.match(diagnosticPackage.content, /Synthetic dashboard failure/);
  } finally {
    diagnostics.dispose();
    runtime.stop();
  }
});

test("diagnostics reports unavailable component health providers without crashing", () => {
  const runtime = new CoreRuntime();
  runtime.start();
  const logger = new Logger({ component: "diagnostics-test" });
  const diagnostics = new DiagnosticsService(logger, () => runtime.health());

  diagnostics.registerComponent("broken-component", () => {
    throw new Error("health probe failed");
  });

  try {
    const component = diagnostics.componentHealth().find((entry) => entry.name === "broken-component");
    assert.equal(component?.status, "unavailable");
    assert.equal(component?.message, "Health information is unavailable.");
  } finally {
    diagnostics.dispose();
    runtime.stop();
  }
});
