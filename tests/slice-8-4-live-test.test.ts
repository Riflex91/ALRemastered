import assert from "node:assert/strict";
import { test } from "node:test";
import { Slice84LiveTestService } from "../src/live-test/slice-8-4.ts";
import { Logger } from "../src/logging/logger.ts";

test("Slice 8.4 validates complete read-only explainability without Action Gateway dispatch", async () => {
  let requests = 7;
  const runtime = { status:"unloaded", activeTimers:0, activeEventListeners:0, logRecords:0, heartbeatSequence:0, message:"No script loaded." };
  const explanation:any = {
    status:"ready",
    strategy:{name:"Simple Farmer",active:false,runtimeStatus:"idle",configuredMonster:"goo"},
    selectionReason:"Read-only preview.",
    rejectedTargets:[],
    range:{attackRange:100,message:"No target."},
    cooldowns:{attackMs:0,hpMs:0,mpMs:0},
    movementTarget:{status:"none",message:"No movement target."},
    nextAction:{key:"start-template",label:"Start template",reason:"Not running."},
    blockers:["Simple Farmer Template is not running."],
    readOnly:true,gameplayMutation:false,rawSocketAccess:false,
    message:"Read-only.",
  };
  const service = new Slice84LiveTestService({
    logger:new Logger({component:"slice84-test"}),
    character:{state:()=>({status:"connected",characterId:"CH_A",characterName:"Hero",serverKey:"SR_EUII",message:"Connected."})} as any,
    runtime:{state:()=>structuredClone(runtime)} as any,
    gateway:{state:()=>({status:"ready",active:0,totalRequests:requests})} as any,
    explainability:{state:()=>structuredClone(explanation)} as any,
    clock:()=>new Date("2026-10-04T09:10:00.000Z"),
    idFactory:()=> "live84-test",
  });
  const result=await service.run();
  assert.equal(result.outcome,"passed");
  assert.deepEqual(result.steps.map((item)=>item.name),["explainability","isolation"]);
  assert.equal((result.steps[1].evidence as any).gatewayRequestsBefore,7);
  assert.equal((result.steps[1].evidence as any).gatewayRequestsAfter,7);
  assert.equal((result.steps[1].evidence as any).gameplayMutation,false);
});
