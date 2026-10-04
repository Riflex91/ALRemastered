import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { ControlModeService } from "../src/control/modes.ts";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 10.3 exposes control modes and routes verification actions through the gateway", async () => {
  const runtime = new CoreRuntime({ heartbeatIntervalMs: 50 });
  runtime.start();
  const logger = new Logger({ component: "slice-10-3-control-modes-test" });
  const control = new ControlModeService();
  const gateway = new ActionGateway({
    logger,
    controlPolicy: control,
  });
  const dashboard = new DashboardServer({
    logger,
    runtime,
    controlModeService: control,
    actionGateway: gateway,
    host: "127.0.0.1",
    port: 0,
  });
  const url = await dashboard.start();

  try {
    const initial = await (await fetch(`${url}/api/control-mode`)).json();
    assert.equal(initial.mode, "automatic");
    assert.equal(initial.userActionsAllowed, true);
    assert.equal(initial.scriptActionsAllowed, true);
    assert.equal(initial.systemActionsAllowed, true);

    const assistResponse = await fetch(`${url}/api/control-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "assist" }),
    });
    assert.equal(assistResponse.status, 200);
    const assist = await assistResponse.json();
    assert.equal(assist.mode, "assist");
    assert.equal(assist.scriptActionsAllowed, false);
    assert.equal(assist.systemActionsAllowed, true);

    const scriptProbe = await fetch(`${url}/api/control-mode/verification-probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: "script" }),
    });
    assert.equal(scriptProbe.status, 400);
    const blocked = await scriptProbe.json();
    assert.equal(blocked.outcome, "error");
    assert.equal(blocked.error.code, "CONTROL_MODE_SCRIPT_BLOCKED");

    const userProbe = await fetch(`${url}/api/control-mode/verification-probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: "dashboard" }),
    });
    assert.equal(userProbe.status, 200);
    const user = await userProbe.json();
    assert.equal(user.outcome, "success");
    assert.equal(user.origin, "dashboard");
    assert.match(user.requestId, /^act-/);
    assert.equal(user.result.gameplayMutation, false);

    await fetch(`${url}/api/control-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
    const systemProbe = await fetch(`${url}/api/control-mode/verification-probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: "system" }),
    });
    assert.equal(systemProbe.status, 400);
    const blockedSystem = await systemProbe.json();
    assert.equal(blockedSystem.error.code, "CONTROL_MODE_SYSTEM_BLOCKED");
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});

test("Slice 10.3 is the single current verification and keeps earlier harnesses hidden", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/dashboard/server.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

  assert.match(html, /data-current-verification-slice="12\.3"/);
  assert.match(html, /data-verification-test="10\.2" hidden/);
  assert.match(html, /data-verification-test="10\.3" hidden/);
  assert.match(html, /id="control-mode"/);
  assert.match(html, />Automatic<\/option>/);
  assert.match(html, />Assist<\/option>/);
  assert.match(html, />Manual<\/option>/);
  assert.match(html, /id="start-slice-10-3-live-test"/);

  assert.match(app, /setControlMode/);
  assert.match(app, /automatic-policy/);
  assert.match(app, /assist-policy/);
  assert.match(app, /manual-policy/);
  assert.match(app, /user-actions-through-gateway/);
  assert.match(app, /mode-restored/);
  assert.match(app, /Gameplay mutation: false/);
  assert.match(app, /User Script touched: false/);

  assert.match(server, /GET" && path === "\/api\/control-mode"/);
  assert.match(server, /POST" && path === "\/api\/control-mode"/);
  assert.match(server, /control-mode\.verification-probe/);
  assert.match(server, /origin,/);
  assert.match(main, /new ControlModeService/);
  assert.match(main, /controlPolicy: controlModeService/);
});
