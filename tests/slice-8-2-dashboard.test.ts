import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

test("dashboard exposes the six-stage English Setup Wizard and Slice 8.2 one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const text of ["Account", "Character", "Server", "Task / Template", "Configuration", "Start"]) {
    assert.match(html, new RegExp(text.replace("/", "\\/")));
  }
  for (const id of [
    "setup-wizard",
    "setup-wizard-character",
    "setup-wizard-server",
    "setup-wizard-task-template",
    "setup-wizard-start",
    "start-slice-8-2-live-test",
    "slice-8-2-live-test-status",
    "copy-slice-8-2-live-test-result",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(script, /\/api\/setup-wizard/);
  assert.match(script, /\/api\/setup-wizard\/start/);
  assert.match(script, /\/api\/live-test\/slice-8-2\/start/);

  const wizardState = {
    status:"ready",
    message:"Setup Wizard is ready.",
    accountConnected:true,
    accountUserId:"U1",
    selectionReady:true,
    selectedServerKey:"SR_EUII",
    characters:[{id:"CH1",name:"Primary",type:"merchant",level:50,online:false}],
    servers:[{key:"SR_EUII",name:"II",region:"EU",players:40}],
    taskTemplates:[{id:"connect-only",label:"Connect only",description:"No automation.",requiresPrimary:false}],
    steps:[
      {number:1,id:"account",label:"Account"},{number:2,id:"character",label:"Character"},
      {number:3,id:"server",label:"Server"},{number:4,id:"task-template",label:"Task / Template"},
      {number:5,id:"configuration",label:"Configuration"},{number:6,id:"start",label:"Start"},
    ],
  };
  const calls:any[]=[];
  const runtime = new CoreRuntime();
  runtime.start();
  const dashboard = new DashboardServer({
    logger:new Logger({component:"slice82-dashboard-test"}),
    runtime,
    setupWizardService:{
      state:()=>structuredClone(wizardState),
      start:async(input:any)=>{
        calls.push(input);
        return {
          status:"started", characterId:"CH1", characterName:"Primary", serverKey:"SR_EUII",
          sessionRole:"primary", taskTemplateId:"connect-only", startedSession:true, taskStarted:false,
          message:"Setup complete.", card:{connectionStatus:"connected"},
        };
      },
    } as any,
    slice82LiveTestService:{
      state:()=>({status:"idle",message:"Slice 8.2 Setup Wizard test is ready."}),
      run:async()=>({
        testId:"live82-dashboard",slice:"8.2",outcome:"passed",
        startedAt:"2026-10-04T08:30:00.000Z",completedAt:"2026-10-04T08:30:01.000Z",
        message:"Slice 8.2 passed.",steps:[],
      }),
    } as any,
    host:"127.0.0.1",port:0,
  });
  const url=await dashboard.start();
  try {
    const stateResponse=await fetch(`${url}/api/setup-wizard`);
    assert.equal(stateResponse.status,200);
    assert.equal((await stateResponse.json()).steps.length,6);

    const startResponse=await fetch(`${url}/api/setup-wizard/start`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({characterId:"CH1",serverKey:"SR_EUII",taskTemplateId:"connect-only",configuration:{}}),
    });
    assert.equal(startResponse.status,200);
    assert.equal((await startResponse.json()).status,"started");
    assert.equal(calls.length,1);

    const live=await fetch(`${url}/api/live-test/slice-8-2/start`,{method:"POST"});
    assert.equal(live.status,200);
    const payload=await live.json();
    assert.equal(payload.result.outcome,"passed");
    assert.match(payload.reportText,/ALRemastered Slice 8\.2 one-click Setup Wizard test/);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
