/** Synthetic test-only host. Real recorder and production hooks, simulated Chrome. */
import readline from 'node:readline';
import {readFile} from 'node:fs/promises';
const appVersion=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8')).version;
import {createDiagnosticHooks} from '../../extension/core/diagnostic-hooks.mjs';
const data={};const chrome={runtime:{id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p,getManifest:()=>({version:appVersion})},storage:{local:{async setAccessLevel(){},async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,structuredClone(v));}}}};
const hooks=createDiagnosticHooks(chrome),diag={id:chrome.runtime.id,url:chrome.runtime.getURL('diagnostics.html'),frameId:0,documentId:'diag'};
const work={...diag,url:chrome.runtime.getURL('workspace.html'),documentId:'workspace'};
for await (const line of readline.createInterface({input:process.stdin})) {
 try {const m=JSON.parse(line);let result;
  if(m.type==='fixture-run'){
    for(let i=0;i<4;i++)await hooks.observe({type:'workspace-scan'},work,async()=>({entries:[{id:'f1',status:'ready',label:'PRIVATE_NAME',value:'PRIVATE_VALUE',kind:'text'},{id:'f2',status:'missing',label:'PRIVATE',kind:'combobox'}]}));
    await hooks.observe({type:'workspace-fill'},work,async()=>({results:[{id:'f1',status:'verified'},{id:'f2',status:'invalid',reason:'PRIVATE_REASON'}]}));
    try{await hooks.observe({type:'workspace-fill'},work,async()=>{throw Error('本机服务超时 PRIVATE_ERROR');});}catch{}
    result={ok:true};
  }else result=await hooks.handle(m,diag);
  console.log(JSON.stringify({data:result}));
 }catch(e){console.log(JSON.stringify({error:e.message}));}
}
