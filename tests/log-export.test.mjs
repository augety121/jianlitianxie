import test from 'node:test';
import assert from 'node:assert/strict';
import {exportReceipts} from '../extension/core/local-receipts.mjs';
import {logPreview,logBlob} from '../extension/core/log-export.mjs';
const report=()=>exportReceipts({records:Array.from({length:80},(_,i)=>({at:i+1,seq:i+1,stage:'scan',ok:true,total:300,reason:'none',fields:Array.from({length:300},(_,j)=>({index:j+1,status:'missing',code:'no-label-match',semantic:'unknown',privateValue:'DO_NOT_EXPORT'}))}))},{includeExplanations:false});
test('maximum retained logs have bounded preview and complete compact download with UI turns',async()=>{
 const data=report(),preview=logPreview(data);assert(preview.length<12000);assert.equal(JSON.parse(preview).fieldCount,24000);
 let turns=0,ticks=0;const timer=setInterval(()=>ticks++,0);
 try{
  const blob=await logBlob(data,{yieldTurn:async()=>{turns++;await new Promise(r=>setTimeout(r,0));}}),text=await blob.text(),parsed=JSON.parse(text);
  assert.equal(turns,80);assert(ticks>1);assert.equal(parsed.records.length,80);assert(parsed.records.every(r=>r.fields.length===300));assert(!text.includes('DO_NOT_EXPORT'));assert(!text.includes('diagnosis'));assert(!('enabled' in parsed));
 }finally{clearInterval(timer);}
});
test('closing export cancels before constructing a downloadable file',async()=>{
 const controller=new AbortController();let turns=0;
 await assert.rejects(logBlob(report(),{signal:controller.signal,yieldTurn:async()=>{turns++;controller.abort();}}),{name:'AbortError'});assert.equal(turns,1);
});
