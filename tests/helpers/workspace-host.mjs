/** Test-only IPC: real worker/vault/run with mocked Chrome and webpage executor. */
import readline from 'node:readline';
import {createWorkspace} from '../../extension/workspace-worker.mjs';
const local={},session={},calls=[],values={};
const store=data=>({async setAccessLevel(){},async get(k){return {[k]:structuredClone(data[k])};},async set(v){Object.assign(data,structuredClone(v));}});
const url='https://jobs.example.invalid/form';
const chrome={storage:{local:store(local),session:store(session)},runtime:{id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p},
 tabs:{get:async()=>({id:11,url}),create:async()=>{},update:async()=>{}},
 permissions:{contains:async()=>true},webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:'doc',url}]},
 scripting:{executeScript:async command=>{
  if(command.files)return [{frameId:0,documentId:'doc'}];
  const [action,arg]=command.args||[];
  if(action==='scan')return [{frameId:0,documentId:'doc',result:{id:crypto.randomUUID(),url,coverage:{fields:3},fields:[{id:'f',label:'姓名',section:'基本信息',type:'text',value:values.f||'',required:true},{id:'e',label:'邮箱',type:'email',value:values.e||''},{id:'s',label:'性别',type:'text',value:values.s||''}]}}];
  if(action==='apply'){calls.push({action,argument:arg});for(const e of arg.entries)values[e.fieldId]=e.value;return [{frameId:0,documentId:'doc',result:{results:arg.entries.map(e=>({fieldId:e.fieldId,status:'verified'}))}}];}
  return [{frameId:0,documentId:'doc',result:{cancelled:true}}];
 }} };
const workspace=createWorkspace(chrome,{api:async(route,data)=>{calls.push({route,data});return {expiresAt:Date.now()+300000,revoked:true,count:data?.facts?.length};},inject:async()=>{},legacyBusy:()=>false});
const sender={id:chrome.runtime.id,url:chrome.runtime.getURL('workspace.html')+'?tab=11',frameId:0,documentId:'trusted-workspace',tab:{id:33}};
await workspace.open({id:11,url});
for await(const line of readline.createInterface({input:process.stdin})){
 let input;
 try{
  input=JSON.parse(line);let data;
  if(input.type==='inspect')data={storage:local,calls,values};
  else if(input.type==='reset-page'){for(const k in values)delete values[k];data={ok:true};}
  else data=await workspace.request(input,sender);
  console.log(JSON.stringify({data}));
 }catch(e){console.log(JSON.stringify({error:e.message}));}
}
