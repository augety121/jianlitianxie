import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
export async function startBridge() {
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'resume-transport-test-'));
 const child=spawn(process.execPath,['bridge/server.mjs'],{env:{...process.env,RESUME_DATA_DIR:dir,RESUME_BRIDGE_PORT:String(port)},stdio:['pipe','pipe','pipe']});
 const pending=new Map();let seq=0;
 const output=readline.createInterface({input:child.stdout});
 output.on('line',line=>{const result=JSON.parse(line),p=pending.get(result.id);if(p){clearTimeout(p.timer);pending.delete(result.id);p.resolve(result);}});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('bridge startup timeout')),5000);child.stderr.on('data',chunk=>{if(String(chunk).includes('bridge listening')){clearTimeout(timer);resolve();}});child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('bridge exited during startup'));});});
 const token=(await fs.readFile(path.join(dir,'bridge-token.txt'),'utf8')).trim(),base=`http://127.0.0.1:${port}`;
 const request=(route,data,options={})=>fetch(base+route,{method:data===undefined?'GET':'POST',headers:{Origin:'chrome-extension://'+'a'.repeat(32),Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),...options});
 const json=async(route,data,options)=>{const r=await request(route,data,options);const value=await r.json();if(!r.ok)throw Error(value.error||String(r.status));return value;};
 const rpc=(name,args={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('RPC timeout'));},8000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');});
 const tool=async(name,args)=>{const r=(await rpc(name,args)).result;if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);};
 const snapshot=(owner='A',id=crypto.randomUUID())=>({id,owner,shareWithCodex:true,url:'https://jobs.example.invalid/form',fields:[{id:'f',label:'姓名',type:'text',value:''},{id:'email',label:'邮箱',type:'text',value:''}]});
 const setup=async(owner='A')=>{
  await json('/profile',{facts:[{id:'name',label:'姓名',value:'SYNTHETIC_PERSON',source:'synthetic',confirmed:true},{id:'email',label:'邮箱',value:'candidate@example.invalid',source:'synthetic',confirmed:true}]});
  return (await json('/snapshot',{snapshot:snapshot(owner),prepare:true})).plan;
 };
 return {request,json,rpc,tool,snapshot,setup,dir,port,base,token,async close(){
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'));}pending.clear();
  const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();
  const timer=setTimeout(()=>child.kill(),2000);await exited;clearTimeout(timer);output.close();await fs.rm(dir,{recursive:true,force:true});
 }};
}
