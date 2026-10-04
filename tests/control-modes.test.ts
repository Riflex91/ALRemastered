import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionGateway } from "../src/action/gateway.ts";
import { ControlModeService } from "../src/control/modes.ts";
import { Logger } from "../src/logging/logger.ts";

test("control modes expose Automatic, Assist, and Manual policy", () => {
  const control = new ControlModeService();

  assert.deepEqual(control.state(), {
    schemaVersion: 1,
    mode: "automatic",
    label: "Automatic",
    userActionsAllowed: true,
    scriptActionsAllowed: true,
    systemActionsAllowed: true,
    message:
      "Automatic mode allows script, system, and explicit user actions through the Action Gateway.",
  });

  assert.equal(control.setMode("assist").mode, "assist");
  assert.equal(control.authorize("dashboard", "character.move").allowed, true);
  assert.equal(control.authorize("system", "character.move").allowed, true);
  assert.equal(control.authorize("script", "character.move").allowed, false);
  assert.equal(
    control.authorize("script", "character.move").code,
    "CONTROL_MODE_SCRIPT_BLOCKED",
  );

  assert.equal(control.setMode("manual").mode, "manual");
  assert.equal(control.authorize("dashboard", "character.move").allowed, true);
  assert.equal(control.authorize("script", "character.move").allowed, false);
  assert.equal(control.authorize("system", "character.move").allowed, false);
  assert.equal(
    control.authorize("system", "character.move").code,
    "CONTROL_MODE_SYSTEM_BLOCKED",
  );
});

test("Action Gateway blocks disallowed origins before execution", async () => {
  const control = new ControlModeService("assist");
  const gateway = new ActionGateway({
    logger: new Logger({ component: "control-mode-gateway-test" }),
    controlPolicy: control,
    idFactory: (() => {
      let id = 0;
      return () => `act-control-${++id}`;
    })(),
  });
  let executions = 0;

  const blockedScript = await gateway.run({
    action: "character.attack",
    origin: "script",
    input: {},
    execute: () => {
      executions += 1;
      return { ok: true };
    },
  });
  assert.equal(blockedScript.outcome, "error");
  assert.equal(blockedScript.error?.code, "CONTROL_MODE_SCRIPT_BLOCKED");
  assert.equal(executions, 0);

  const userAction = await gateway.run({
    action: "character.attack",
    origin: "dashboard",
    input: {},
    execute: () => {
      executions += 1;
      return { ok: true };
    },
  });
  assert.equal(userAction.outcome, "success");
  assert.equal(userAction.origin, "dashboard");
  assert.equal(executions, 1);

  control.setMode("manual");
  const blockedSystem = await gateway.run({
    action: "character.respawn",
    origin: "system",
    input: {},
    execute: () => {
      executions += 1;
      return { ok: true };
    },
  });
  assert.equal(blockedSystem.outcome, "error");
  assert.equal(blockedSystem.error?.code, "CONTROL_MODE_SYSTEM_BLOCKED");
  assert.equal(executions, 1);
  assert.equal(gateway.state().totalRequests, 3);
});
