import {createLocalWorkflow} from '../../extension/local-worker.mjs';
export function memory(data={}){return {data,access:[],async setAccessLevel(v){this.access.push(v.accessLevel);},async get(k){return k===null?structuredClone(data):{[k]:structuredClone(data[k])};},async set(v){Object.assign(data,structuredClone(v));}};}
export function localHarness(){
 const local=memory(),session=memory(),calls=[],values={};let workflow;
 const url='https://jobs.example.invalid/apply',runtime={id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p};
 const sender={id:runtime.id,frameId:0,url:runtime.getURL('local.html'),documentId:'local-document',tab:{id:71}};
 let scenario='basic',currentUrl=url;
 const chrome={runtime,storage:{local,session},tabs:{get:async()=>({id:11,url:currentUrl}),create:async x=>{calls.push({open:x.url});},update:async()=>{}},permissions:{contains:async()=>true},webNavigation:{getAllFrames:async()=>[]},scripting:{executeScript:async command=>{
  if(command.files)return [{frameId:0,documentId:'target-document'}];
  const [action,arg]=command.args||[];calls.push({action,arg});
  let result;
  if(action==='scan'){
    const fields=scenario==='scale'?Array.from({length:240},(_,i)=>({id:'n'+i,label:'测试字段'+i,type:'text',value:''})):scenario==='education'?['a','b'].flatMap(group=>[{id:group+'school',label:'学校',section:'教育经历',groupId:group,groupLabel:'教育经历',type:'text',value:''},{id:group+'major',label:'专业',section:'教育经历',groupId:group,groupLabel:'教育经历',type:'text',value:''}]):[{id:'name',label:'姓名',type:'text',section:'基本信息',value:values.name||''},{id:'email',label:'邮箱',type:'email',value:values.email||''},{id:'gender',label:'性别',type:'text',value:values.gender||''}];
    result={id:crypto.randomUUID(),url:currentUrl,fields,coverage:{fields:fields.length,excluded:{hidden:1,readonly:0,disabled:0},frames:0}};
  }else if(action==='apply'){for(const e of arg.entries)values[e.fieldId]=e.value;result={results:arg.entries.map(e=>({fieldId:e.fieldId,status:'verified'}))};}
  else result=action==='locate'?{located:true}:{cancelled:true};
  return [{frameId:0,documentId:'target-document',result}];
 }}};
 let external=false,mode='local';const options={externalBusy:()=>external,mode:async()=>mode,switchLocal:async()=>{mode='local';},openAdvanced:async()=>calls.push({advanced:true})};
 workflow=createLocalWorkflow(chrome,options);
 const api=(type,data={},s=sender)=>workflow.request({type:'local-'+type,...data},s);
 return {chrome,local,session,calls,values,sender,api,async attach(){await workflow.open({id:11,url});},restart(){workflow=createLocalWorkflow(chrome,options);},setScenario(s){scenario=s;},setUrl(u){currentUrl=u;},setExternal(v){external=v;},setMode(v){mode=v;},get workflow(){return workflow;}};
}
export async function importText(h,text){const preview=await h.api('preview',{text});const p=await h.api('commit',{previewId:preview.id,ids:preview.items.filter(x=>x.status==='new').map(x=>x.fact.id),reviewed:true,acceptPlaintext:true});return {preview,profile:p};}
