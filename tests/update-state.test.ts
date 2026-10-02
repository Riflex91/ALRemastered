import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import { automaticUpdateInstallerArguments } from "../src/update/installer-launcher.ts";
import type { UpdateManifest } from "../src/update/model.ts";
import { UpdatePreferenceStore } from "../src/update/preferences.ts";
import { UpdateService } from "../src/update/service.ts";
import { compareVersions, isNewerVersion } from "../src/update/version.ts";

function makeManifest(version: string): UpdateManifest {
  const data = Buffer.from("update");
  return {
    schemaVersion: 1,
    product: "ALRemastered",
    channel: "stable",
    version,
    publishedAt: "2026-10-02T14:00:00.000Z",
    releaseNotesUrl: `https://github.com/Riflex91/ALRemastered/releases/tag/v${version}`,
    assets: [{
      platform: "win32",
      arch: "x64",
      fileName: "ALRemastered-Windows-x64-Setup.exe",
      url: "https://github.com/Riflex91/ALRemastered/releases/download/v0.1.0/ALRemastered-Windows-x64-Setup.exe",
      sha256: createHash("sha256").update(data).digest("hex"),
      sizeBytes: data.length,
    }],
  };
}

function makeService(root: string, sourceRef: { manifest: UpdateManifest | null }, now?: () => Date) {
  return new UpdateService({
    currentVersion: "0.1.0-alpha.4",
    logger: new Logger({ component: "update-test" }),
    source: { latestManifest: async () => sourceRef.manifest },
    preferences: new UpdatePreferenceStore(join(root, "update-preferences.json")),
    updatesDir: join(root, "updates"),
    platform: "win32",
    arch: "x64",
    now,
    scheduleInstaller: () => undefined,
  });
}

test("semantic version comparison handles prerelease progression", () => {
  assert.equal(compareVersions("0.1.0-alpha.4", "0.1.0-alpha.5"), -1);
  assert.equal(compareVersions("0.1.0-alpha.10", "0.1.0-alpha.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.equal(isNewerVersion("0.1.0-alpha.5", "0.1.0-alpha.4"), true);
});

test("no newer release reports up to date", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-"));
  try {
    const service = makeService(root, { manifest: null });
    assert.equal((await service.checkNow(true)).status, "upToDate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skip applies only to the exact version", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-"));
  try {
    const source = { manifest: makeManifest("0.1.0-alpha.5") };
    const service = makeService(root, source);
    assert.equal((await service.checkNow()).status, "available");
    assert.equal(service.skipVersion().status, "deferred");
    assert.equal((await service.checkNow()).status, "deferred");

    source.manifest = makeManifest("0.1.0-alpha.6");
    assert.equal((await service.checkNow()).status, "available");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("remind tomorrow suppresses the same version for 24 hours", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-"));
  try {
    const source = { manifest: makeManifest("0.1.0-alpha.5") };
    let now = Date.parse("2026-10-02T12:00:00.000Z");
    const service = makeService(root, source, () => new Date(now));

    await service.checkNow();
    service.remindTomorrow();

    now += 23 * 60 * 60 * 1000;
    assert.equal((await service.checkNow()).status, "deferred");

    now += 2 * 60 * 60 * 1000;
    assert.equal((await service.checkNow()).status, "available");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a newer version overrides a snoozed older version", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-"));
  try {
    const source = { manifest: makeManifest("0.1.0-alpha.5") };
    const service = makeService(root, source);
    await service.checkNow();
    service.remindTomorrow();

    source.manifest = makeManifest("0.1.0-alpha.6");
    assert.equal((await service.checkNow()).status, "available");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("dashboard updates use silent automatic installer arguments", () => {
  assert.deepEqual(
    automaticUpdateInstallerArguments("win32"),
    ["/S", "/ALRUPDATE=1"],
  );
  assert.deepEqual(
    automaticUpdateInstallerArguments("linux"),
    ["--yes", "--no-desktop", "--restart"],
  );
});
