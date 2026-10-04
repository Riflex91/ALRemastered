import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CoreRuntime } from "../src/core/app.ts";
import { DashboardServer } from "../src/dashboard/server.ts";
import { Logger } from "../src/logging/logger.ts";

function explanation(){
 return {
  status:"ready",
  strategy:{name:"Simple Farmer",active:false,runtimeStatus:"idle",configuredMonster:"goo"},
  currentTarget:{id:"goo",name:"Goo",type:"goo",distance:42,attackRange:100,inRange:true},
  selectionReason:"Nearest visible goo without another target.",
  rejectedTargets:[{id:"bee",name:"Bee",type:"bee",distance:20,reason:"Different monster type (bee)."}],
  range:{attackRange:100,targetDistance:42,inRange:true,message:"Target is in range."},
  cooldowns:{attackMs:0,hpMs:0,mpMs:0},
  movementTarget:{status:"none",message:"No current movement target."},
  nextAction:{key:"start-template",label:"Start template",reason:"Template is not running."},
  blockers:["Simple Farmer Template is not running."],
  readOnly:true,gameplayMutation:false,rawSocketAccess:false,
  message:"Read-only explainability.",
 };
}

test("dashboard retains Slice 8.4 explainability and its historical verification harness", async () => {
 const html=readFileSync(new URL("../dashboard/index.html",import.meta.url),"utf8");
 const script=readFileSync(new URL("../dashboard/app.js",import.meta.url),"utf8");
 assert.match(html, /Why is the bot doing this\?/);
 for(const text of ["Current target","Selection reason","Rejected targets","Range","Cooldowns","Movement target","Next action","Strategy","Blockers"]){
   assert.match(html,new RegExp(text));
 }
 assert.match(html,/data-verification-test="8\.4" hidden/);
 assert.match(html,/id="start-slice-8-4-live-test"/);
 assert.match(script,/\/api\/explainability/);
 assert.match(script,/\/api\/live-test\/slice-8-4\/start/);

 const runtime=new CoreRuntime(); runtime.start();
 const dashboard=new DashboardServer({
   logger:new Logger({component:"slice84-dashboard-test"}),runtime,
   explainabilityService:{state:()=>explanation()} as any,
   slice84LiveTestService:{
     state:()=>({status:"idle",message:"Ready."}),
     run:async()=>({testId:"live84-dashboard",slice:"8.4",outcome:"passed",startedAt:"2026-10-04T09:10:00Z",completedAt:"2026-10-04T09:10:01Z",message:"passed",steps:[]}),
   } as any,
   host:"127.0.0.1",port:0,
 });
 const url=await dashboard.start();
 try{
   const state=await fetch(`${url}/api/explainability`);
   assert.equal(state.status,200);
   const payload=await state.json();
   assert.equal(payload.readOnly,true);
   assert.equal(payload.currentTarget.id,"goo");
   const live=await fetch(`${url}/api/live-test/slice-8-4/start`,{method:"POST"});
   assert.equal(live.status,200);
   const report=await live.json();
   assert.equal(report.result.outcome,"passed");
   assert.match(report.reportText,/ALRemastered Slice 8\.4 one-click explainability test/);
 } finally {
   await dashboard.stop(); runtime.stop();
 }
});
