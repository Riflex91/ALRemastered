import assert from "node:assert/strict";
import { test } from "node:test";
import { getUserPaths } from "../src/platform/paths.ts";
import { getReleaseMetadata } from "../src/release/version-model.ts";

test("release metadata exposes the stable channel and current version", () => {
  const release = getReleaseMetadata();
  assert.equal(release.schemaVersion, 1);
  assert.equal(release.product, "ALRemastered");
  assert.equal(release.channel, "stable");
  assert.match(release.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
});

test("Windows user data is separate from the installation directory", () => {
  const paths = getUserPaths("win32", { LOCALAPPDATA: "C:\\Users\\Tester\\AppData\\Local" }, "C:\\Users\\Tester");
  assert.equal(paths.dataDir, "C:\\Users\\Tester\\AppData\\Local\\ALRemastered\\data");
  assert.equal(paths.logsDir, "C:\\Users\\Tester\\AppData\\Local\\ALRemastered\\logs");
});

test("Linux user data honors XDG directories", () => {
  const paths = getUserPaths(
    "linux",
    { XDG_CONFIG_HOME: "/tmp/config", XDG_DATA_HOME: "/tmp/data" },
    "/home/tester",
  );
  assert.equal(paths.configDir, "/tmp/config/ALRemastered");
  assert.equal(paths.dataDir, "/tmp/data/ALRemastered");
  assert.equal(paths.logsDir, "/tmp/data/ALRemastered/logs");
});
