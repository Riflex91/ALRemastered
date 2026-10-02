import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Logger } from "../src/logging/logger.ts";
import type { UpdateManifest } from "../src/update/model.ts";
import { UpdatePreferenceStore } from "../src/update/preferences.ts";
import { dashboardUpdateInstallerArguments } from "../src/update/installer-launcher.ts";
import { UpdateService, downloadAndVerify } from "../src/update/service.ts";

function assetFor(data: Buffer, sha256 = createHash("sha256").update(data).digest("hex")) {
  return {
    platform: "win32" as const,
    arch: "x64" as const,
    fileName: "ALRemastered-Windows-x64-Setup.exe",
    url: "https://github.com/Riflex91/ALRemastered/releases/download/v0.1.0-alpha.5/ALRemastered-Windows-x64-Setup.exe",
    sha256,
    sizeBytes: data.length,
  };
}

function manifestFor(data: Buffer): UpdateManifest {
  return {
    schemaVersion: 1,
    product: "ALRemastered",
    channel: "stable",
    version: "0.1.0-alpha.5",
    publishedAt: "2026-10-02T14:00:00.000Z",
    releaseNotesUrl: "https://github.com/Riflex91/ALRemastered/releases/tag/v0.1.0-alpha.5",
    assets: [assetFor(data)],
  };
}

test("download errors are surfaced", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-download-"));
  try {
    const destination = join(root, "payload.bin");
    const asset = assetFor(Buffer.from("expected"));
    const fakeFetch = async () => new Response("failure", { status: 500 });
    await assert.rejects(
      downloadAndVerify(asset, destination, fakeFetch as typeof fetch),
      /HTTP 500/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("integrity failures reject mismatched data", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-download-"));
  try {
    const destination = join(root, "payload.bin");
    const expected = Buffer.from("expected");
    const actual = Buffer.from("expectEd");
    const asset = assetFor(expected);
    const fakeFetch = async () => new Response(actual, { status: 200 });
    await assert.rejects(
      downloadAndVerify(asset, destination, fakeFetch as typeof fetch),
      /integrity verification failed/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("successful update verifies data and schedules installation", async () => {
  const root = mkdtempSync(join(tmpdir(), "alr-update-download-"));
  try {
    const data = Buffer.from("verified-update-payload");
    const manifest = manifestFor(data);
    let scheduledPath = "";
    let callbackCalled = false;
    const fakeFetch = async () => new Response(data, { status: 200 });

    const service = new UpdateService({
      currentVersion: "0.1.0-alpha.4",
      logger: new Logger({ component: "update-test" }),
      source: { latestManifest: async () => manifest },
      preferences: new UpdatePreferenceStore(join(root, "preferences.json")),
      updatesDir: join(root, "updates"),
      platform: "win32",
      arch: "x64",
      fetchImpl: fakeFetch as typeof fetch,
      scheduleInstaller: (path) => { scheduledPath = path; },
      onInstallScheduled: () => { callbackCalled = true; },
    });

    assert.equal((await service.checkNow()).status, "available");
    const state = await service.installUpdate();

    assert.equal(state.status, "installing");
    assert.equal(state.progressPercent, 100);
    assert.equal(callbackCalled, true);
    assert.equal(existsSync(scheduledPath), true);
    assert.deepEqual(readFileSync(scheduledPath), data);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("dashboard update installer arguments enable unattended restart without opening a new dashboard", () => {
  assert.deepEqual(
    dashboardUpdateInstallerArguments("win32"),
    ["/S", "/ALRUPDATE=1"],
  );
  assert.deepEqual(
    dashboardUpdateInstallerArguments("linux"),
    ["--yes", "--no-desktop", "--restart"],
  );
  assert.deepEqual(dashboardUpdateInstallerArguments("darwin"), []);
});
