import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

function configState() {
  return {
    status: "ready",
    selectedTemplateId: "simple-farmer",
    templates: [{
      id: "simple-farmer",
      label: "Simple Farmer Template",
      description: "Configure without code.",
      status: "ready",
      configured: false,
      fields: [
        { key: "monster", label: "Monster", type: "select", description: "Monster.", required: true, options: [{value:"goo",label:"goo"}] },
        { key: "hpThresholdPercent", label: "HP threshold %", type: "number", description: "HP.", required: true, min:1,max:99,step:1 },
        { key: "mpThresholdPercent", label: "MP threshold %", type: "number", description: "MP.", required: true, min:1,max:99,step:1 },
        { key: "loot", label: "Loot", type: "boolean", description: "Loot.", required: true },
        { key: "respawn", label: "Respawn", type: "boolean", description: "Respawn.", required: true },
      ],
      values: { monster:"goo", hpThresholdPercent:50, mpThresholdPercent:30, loot:true, respawn:true },
      runtimeStatus: "idle",
      message: "Ready.",
    }],
    normalSettingsRequireCodeChanges: false,
    gameplayMutation: false,
    rawSocketAccess: false,
    message: "Ready.",
  };
}

test("dashboard exposes generic Template Configuration UI and Slice 8.3 one-click test", async () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");
  for (const id of [
    "template-config-panel",
    "template-config-template",
    "template-config-fields",
    "template-config-save",
    "template-config-reset",
    "template-config-start",
    "template-config-stop",
    "start-slice-8-3-live-test",
    "slice-8-3-live-test-status",
    "copy-slice-8-3-live-test-result",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Template Configuration/);
  assert.match(html, /without editing script code/i);
  assert.match(script, /\/api\/template-config/);
  assert.match(script, /\/api\/live-test\/slice-8-3\/start/);
  assert.match(script, /data-template-config-key/);

  const calls:any[]=[];
  const runtime = new CoreRuntime();
  runtime.start();
  const dashboard = new DashboardServer({
    logger:new Logger({component:"slice83-dashboard-test"}),
    runtime,
    templateConfigurationService:{
      state:()=>configState(),
      save:(id:string,values:any)=>{calls.push(["save",id,values]);return configState();},
      reset:(id:string)=>{calls.push(["reset",id]);return configState();},
      start:async(id:string)=>{calls.push(["start",id]);return configState();},
      stop:async(id:string)=>{calls.push(["stop",id]);return configState();},
    } as any,
    slice83LiveTestService:{
      state:()=>({status:"idle",message:"Slice 8.3 Template Configuration test is ready."}),
      run:async()=>({
        testId:"live83-dashboard",slice:"8.3",outcome:"passed",
        startedAt:"2026-10-04T09:00:00.000Z",completedAt:"2026-10-04T09:00:01.000Z",
        message:"Slice 8.3 passed.",steps:[],
      }),
    } as any,
    host:"127.0.0.1",port:0,
  });
  const url=await dashboard.start();
  try {
    const stateResponse=await fetch(`${url}/api/template-config`);
    assert.equal(stateResponse.status,200);
    assert.equal((await stateResponse.json()).normalSettingsRequireCodeChanges,false);

    const save=await fetch(`${url}/api/template-config/save`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({templateId:"simple-farmer",values:{monster:"goo",hpThresholdPercent:50,mpThresholdPercent:30,loot:true,respawn:true}}),
    });
    assert.equal(save.status,200);

    for (const action of ["reset","start","stop"]) {
      const response=await fetch(`${url}/api/template-config/${action}`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({templateId:"simple-farmer"}),
      });
      assert.equal(response.status,200);
    }
    assert.deepEqual(calls.map((item)=>item[0]),["save","reset","start","stop"]);

    const live=await fetch(`${url}/api/live-test/slice-8-3/start`,{method:"POST"});
    assert.equal(live.status,200);
    const payload=await live.json();
    assert.equal(payload.result.outcome,"passed");
    assert.match(payload.reportText,/ALRemastered Slice 8\.3 one-click Template Configuration test/);
  } finally {
    await dashboard.stop();
    runtime.stop();
  }
});
