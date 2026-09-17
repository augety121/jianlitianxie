import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import readline from 'node:readline';
test('MCP handshake, authenticated local UI, consent and redaction',{timeout:15000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'resume-bridge-test-'));
 const p=spawn(process.execPath,['bridge/server.mjs'],{env:{...process.env,RESUME_DATA_DIR:dir,RESUME_BRIDGE_PORT:19329},stdio:['pipe','pipe','pipe']});
 const answers=new Map();let id=0;readline.createInterface({input:p.stdout}).on('line',line=>{const r=JSON.parse(line);answers.get(r.id)?.(r);});
 const rpc=(method,params={})=>new Promise(resolve=>{const n=++id;answers.set(n,resolve);p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');});
 try{
 await new Promise((resolve,reject)=>{p.stderr.once('data',resolve);p.once('error',reject);p.once('exit',code=>reject(Error('bridge exited '+code)));});
 const token=(await fs.readFile(path.join(dir,'bridge-token.txt'),'utf8')).trim();
 const request=(url,data,origin='chrome-extension://'+'a'.repeat(32),auth=token)=>fetch('http://127.0.0.1:19329'+url,{method:data?'POST':'GET',headers:{Origin:origin,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 assert.equal((await rpc('initialize')).result.serverInfo.name,'jianlitianxie');
 const list=(await rpc('tools/list')).result.tools;assert.ok(!list.some(x=>/submit|execute|eval/.test(x.name)));
 assert.equal((await request('/profile',null,'https://evil.test')).status,403);
 assert.equal((await request('/profile',null,undefined,'wrong')).status,401);
 const noOrigin=auth=>fetch('http://127.0.0.1:19329/status',{headers:{Authorization:'Bearer '+auth}});
 assert.equal((await noOrigin(token)).status,200);
 assert.equal((await noOrigin('wrong')).status,401);
 assert.equal((await request('/mcp',{method:'tools/call',params:{name:'profile_catalog'}},undefined,'wrong')).status,401);
 assert.equal((await request('/mcp',{method:'tools/call',params:{name:'eval'}})).status,400);
 const httpCatalog=await (await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'profile_catalog',arguments:{}}})).json();
 assert.deepEqual(JSON.parse(httpCatalog.result.content[0].text),{facts:[]});
 const proxy=spawn(process.execPath,['bridge/server.mjs'],{env:{...process.env,RESUME_DATA_DIR:dir,RESUME_BRIDGE_PORT:19329},stdio:['pipe','pipe','pipe']});
 try{
  const line=readline.createInterface({input:proxy.stdout});
  const response=new Promise((resolve,reject)=>{line.once('line',s=>resolve(JSON.parse(s)));proxy.once('error',reject);proxy.once('exit',()=>reject(Error('proxy exited')));});
  proxy.stdin.write(JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'profile_catalog',arguments:{}}})+'\n');
  assert.deepEqual(JSON.parse((await response).result.content[0].text),{facts:[]});
 }finally{proxy.stdin.end();await new Promise(r=>proxy.once('exit',r));}
 assert.equal((await request('/status',null,'null')).status,403);
 await request('/profile',{facts:[{id:'n',label:'姓名',value:'PRIVATE_VALUE',confirmed:true}]});
 const catalog=await rpc('tools/call',{name:'profile_catalog'});assert.ok(!JSON.stringify(catalog).includes('PRIVATE_VALUE'));
 assert.equal((await rpc('tools/call',{name:'profile_read_approved'})).result.isError,true);
 await request('/share',{ids:['n']});assert.ok(JSON.stringify(await rpc('tools/call',{name:'profile_read_approved'})).includes('PRIVATE_VALUE'));
 assert.equal((await rpc('tools/call',{name:'profile_read_approved'})).result.isError,true);
 await request('/snapshot',{snapshot:{id:'s',url:'https://example.test/form',fields:[{id:'f',label:'姓名',type:'text',value:''}]}});
 assert.equal((await rpc('tools/call',{name:'form_context'})).result.isError,true);
 await request('/snapshot',{snapshot:{id:'s',shareWithCodex:true,url:'https://example.test/form',fields:[{id:'f',label:'姓名',type:'text',value:''}]}});
 assert.ok(JSON.stringify(await rpc('tools/call',{name:'form_context'})).includes('PRIVATE_VALUE'));
 const plan=await rpc('tools/call',{name:'form_plan'});assert.ok(!JSON.stringify(plan).includes('PRIVATE_VALUE'));
 const pid=JSON.parse(plan.result.content[0].text).id;
 const req=await rpc('tools/call',{name:'form_request_fill',arguments:{planId:pid}});assert.match(req.result.content[0].text,/needs-user-approval/);
 const poll=await (await request('/poll')).json();assert.equal(poll.commands[0].type,'review');
 assert.equal((await request('/result',{planId:pid,results:[]})).status,400);
 assert.equal((await request('/begin',{planId:pid})).status,200);
 assert.equal((await request('/plan',{})).status,400);
 assert.equal((await rpc('tools/call',{name:'form_plan'})).result.isError,true);
 assert.equal((await request('/result',{planId:pid,results:[{fieldId:'f',status:'verified'}]})).status,200);
 const memory=JSON.parse(await fs.readFile(path.join(dir,'experience.json'),'utf8'));assert.deepEqual(Object.values(memory),['n']);
 assert.equal((await request('/begin',{planId:pid})).status,400);
 // Codex owns the local profile and hands one prepared batch to the extension.
 const callTool=(name,args={})=>rpc('tools/call',{name,arguments:args});
 await request('/snapshot',{snapshot:{id:'s2',owner:'tab-A',shareWithCodex:true,url:'https://example.test/form',fields:[{id:'f',label:'姓名',type:'text',value:''},{id:'intro',label:'自我评价',type:'textarea',value:'',maxLength:30}]}});
 assert.equal((await callTool('profile_upsert',{facts:[{id:'n',label:'姓名',value:'UPDATED_PRIVATE',source:'本人确认',confirmed:true}]})).result.isError,undefined);
 assert.ok(JSON.stringify(await callTool('profile_search',{query:'姓名'})).includes('UPDATED_PRIVATE'));
 await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify({pages:[{document:'示例.pdf',page:1,text:'教育经历 历史记录'}]}));
 assert.ok(JSON.stringify(await callTool('source_search',{query:'教育经历'})).includes('示例.pdf'));
 assert.equal((await callTool('form_prepare',{snapshotId:'old'})).result.isError,true);
 const prepared=await callTool('form_prepare',{snapshotId:'s2',mappings:{f:'n'},answers:[{fieldId:'intro',text:'虚构测试描述',factIds:['n']}]});
 assert.equal(prepared.result.isError,undefined);const pid2=JSON.parse(prepared.result.content[0].text).id;
 assert.equal((await callTool('form_fill',{planId:pid2})).result.isError,undefined);
 assert.deepEqual((await (await request('/poll?owner=tab-B')).json()).commands,[]);
 const commands=(await (await request('/poll?owner=tab-A')).json()).commands;
 assert.equal(commands[0].type,'fill');assert.deepEqual(commands[0].fieldIds,['f','intro']);
 const localPlan=await (await request('/plan')).json();assert.equal(localPlan.entries[1].factId,undefined);
 assert.equal((await request('/begin',{planId:pid2})).status,200);
 await request('/result',{planId:pid2,results:[{fieldId:'intro',status:'verified'}]});
 assert.ok(!JSON.stringify(JSON.parse(await fs.readFile(path.join(dir,'experience.json'),'utf8'))).includes('自我评价'));
 await request('/snapshot',{snapshot:{id:'s3',shareWithCodex:false,url:'https://example.test/form',fields:[]}});
 assert.equal((await callTool('profile_upsert',{facts:[]})).result.isError,true);
 assert.equal((await callTool('source_search',{query:'教育经历'})).result.isError,true);

 }finally{p.stdin.end();await new Promise(r=>p.once('exit',r));await fs.rm(dir,{recursive:true,force:true});}
});
