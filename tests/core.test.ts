import assert from "node:assert/strict";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { getAppVersion } from "../src/version.ts";

test("package version is semantic prerelease", () => {
  assert.match(getAppVersion(), /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
});

test("core runtime starts and stops deterministically", () => {
  const runtime = new CoreRuntime();
  assert.equal(runtime.status, "idle");

  runtime.start();
  assert.equal(runtime.status, "running");

  const health = runtime.health();
  assert.equal(health.application, "ALRemastered");
  assert.equal(health.version, getAppVersion());
  assert.equal(health.status, "running");
  assert.ok(health.startedAt.length > 0);

  runtime.stop();
  assert.equal(runtime.status, "stopped");
});


test("core heartbeat advances only while the runtime is running", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 25 });
  runtime.start();
  const first = runtime.health();
  await new Promise((resolve) => setTimeout(resolve, 70));
  const second = runtime.health();
  assert.ok(second.heartbeatSequence > first.heartbeatSequence);
  assert.ok(second.lastHeartbeatAt);
  runtime.stop();
  const stopped = runtime.health();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(runtime.health().heartbeatSequence, stopped.heartbeatSequence);
});
