import {normalizeProfile, normalizeFact, planImport, mergeImport} from './core/profile.mjs';
import {openVault} from './core/vault.mjs';
import {readLocalImport} from './core/local-import.mjs';
import {FrameBroker} from './core/frame-broker.mjs';
import {WorkspaceRun} from './core/workspace-run.mjs';
import {trustedWorkspace, secret, secureTarget} from './core/workspace-policy.mjs';
import {LocalReceipts, receiptReason, exportReceipts} from './core/local-receipts.mjs';

export const LOCAL_PROFILE_KEY='resumePlainLocalV1';
/** New no-passphrase path. It never imports the bridge API or silently decrypts a vault. */
export function createLocalWorkflow(chrome,{externalBusy=()=>false,mode=async()=> 'local',switchLocal=async()=>{},openAdvanced=async()=>{}}={}) {
  const storage=chrome.storage.local,ready=Promise.all([storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
  let profile={schemaVersion:1,revision:0,facts:[]},accepted=false,active=false,epoch=0,preview=null;
  const holder={get unlocked(){return accepted;},read(){if(!accepted)throw Error('请先导入并确认本地保存');return structuredClone(profile);}};
  const broker=new FrameBroker(chrome),run=new WorkspaceRun(holder,broker),logs=new LocalReceipts(storage);
  async function refresh(){
    const value=(await storage.get(LOCAL_PROFILE_KEY))[LOCAL_PROFILE_KEY];
    if(value==null){accepted=false;profile={schemaVersion:1,revision:0,facts:[]};return;}
    if(value.version!==1||value.storage!=='plain-local'||value.accepted!==true)throw Error('本地资料格式异常，请保留备份，不会使用旧缓存');
    const next=normalizeProfile(value.profile);profile=next;accepted=true;
  }
  async function persist(facts,revision,consent){
    if(revision!==profile.revision)throw Error('资料已改变，请重新预览');
    if(!accepted&&consent!==true)throw Error('请确认免口令资料将在本浏览器未加密保存');
    const next=normalizeProfile({facts,revision:revision+1});
    if(next.facts.some(f=>secret(f.label)))throw Error('此资料区不保存密码、验证码或密钥');
    await storage.set({[LOCAL_PROFILE_KEY]:{version:1,storage:'plain-local',accepted:true,profile:next}});
    profile=next;accepted=true;preview=null;await run.stop();return structuredClone(profile);
  }
  function owner(sender){if(typeof sender.documentId!=='string'||!sender.documentId)throw Error('无法确认工作台文档，请从工具栏重新打开');return sender.documentId;}
  async function attached(tabId){
    const tab=await broker.tab(tabId),key='workspace-target-'+tabId;
    if((await chrome.storage.session.get(key))[key]!==new URL(tab.url).origin)throw Error('请在具体网申页点击工具栏，以授权当前来源');
    return tab;
  }
  async function open(tab){
    await ready;secureTarget(tab.url);
    await chrome.storage.session.set({['workspace-target-'+tab.id]:new URL(tab.url).origin});
    return chrome.tabs.create({url:chrome.runtime.getURL('local.html')+'?tab='+tab.id});
  }
  function draft(own,parsed){
    preview={id:crypto.randomUUID(),owner:own,revision:profile.revision,expires:Date.now()+600000,facts:parsed.facts};
    const safeIds=new Set(mergeImport([],parsed.facts).addedIds);
    const items=planImport(profile.facts,parsed.facts).map(x=>!safeIds.has(x.fact.id)&&x.status!=='duplicate'?{...x,status:'conflict',reason:'同一字段的文件内容互相矛盾，请修正'}:x);
    return {id:preview.id,revision:preview.revision,items,skipped:parsed.skipped};
  }
  function record(stage,start,data,error,sourceEntries=[]){
    const entries=data?.entries||[],outcomes=data?.results||entries;
    const order=new Map(sourceEntries.map((e,i)=>[e.id,i+1]));
    const fields=outcomes.map((e,i)=>({index:order.get(e.id)||i+1,status:e.status}));
    const problematic=fields.filter(e=>!['verified','preserve','ready'].includes(e.status)),normal=fields.filter(e=>['verified','preserve','ready'].includes(e.status));
    logs.add({stage,ok:!error,reason:error?receiptReason(error):'none',ms:Math.round(performance.now()-start),total:fields.length||data?.items?.length||data?.facts?.length||0,
      fields:[...problematic,...normal].slice(0,300),omitted:Math.max(0,fields.length-300),performance:stage==='fill'?{apply:data?.performance}:data?.performance});
  }
  async function request(m,sender){
    if(!trustedWorkspace(sender,chrome.runtime,'local.html'))throw Error('只有本地填写页可以访问资料');
    const own=owner(sender),type=m.type;
    if(type==='local-stop') {epoch++;preview=null;const result=await run.stop();logs.add({stage:'stop',ok:true,reason:'none',ms:0,total:0});return result;}
    if(type==='local-state'){
      await ready;if(!active)await refresh();
      const old=(await storage.get('resumeVaultV1')).resumeVaultV1;
      let target='';try{target=new URL((await attached(m.tabId)).url).origin;}catch{}
      return {target,profile:structuredClone(profile),accepted,busy:active,encryptedExists:!!old,mode:await mode(),logging:(await storage.get('resumeLocalReceiptsEnabled')).resumeLocalReceiptsEnabled!==false};
    }
    if(type==='local-logs'){await ready;const data=await logs.read();return {...exportReceipts(data),enabled:data.enabled};}
    if(type==='local-log-settings'){await ready;await logs.settings(m.enabled,m.clear===true);return {ok:true};}
    // Acquire synchronously before any asynchronous permission/storage check.
    if(active||externalBusy())throw Error('另一项任务正在执行，请先停止并等待回读');
    active=true;const generation=epoch,start=performance.now();let data,stage,sourceEntries=[];
    const alive=()=>{if(generation!==epoch)throw Error('操作已取消，请重新扫描');};
    try {
      await ready;await refresh();alive();
      if(type==='local-preview'){stage='preview';data=draft(own,readLocalImport(m.text));return data;}
      if(type==='local-encrypted-preview'){
        stage='preview';
        const envelope=(await storage.get('resumeVaultV1')).resumeVaultV1;if(!envelope)throw Error('没有旧加密资料');
        const opened=await openVault(envelope,m.password);alive();
        data=draft(own,{facts:opened.profile.facts.map(f=>({...f,id:crypto.randomUUID(),confirmed:false})),skipped:[]});return data;
      }
      if(type==='local-commit'){
        stage='import';const p=preview;
        if(!p||p.owner!==own||p.id!==m.previewId||p.revision!==profile.revision||Date.now()>p.expires)throw Error('导入预览已失效，请重新读取文件');
        if(m.reviewed!==true||!Array.isArray(m.ids)||!m.ids.length||new Set(m.ids).size!==m.ids.length)throw Error('请核对并选择本次要保存的资料');
        const items=planImport(profile.facts,p.facts),allowed=new Set(items.filter(x=>['new','change'].includes(x.status)).map(x=>x.fact.id));
        if(m.ids.some(id=>!allowed.has(id)))throw Error('所选条目不属于当前可导入范围');
        // Withhold every key whose incoming file contains contradictory values.
        const merged=mergeImport(profile.facts,p.facts,items.filter(x=>x.status==='change'&&m.ids.includes(x.fact.id)).map(x=>x.fact.id));
        const ids=new Set(merged.addedIds.filter(id=>m.ids.includes(id))),oldIds=new Set(profile.facts.map(f=>f.id));alive();
        if(!ids.size)throw Error('所选条目重复或互相矛盾，请修正后重新预览');
        data=await persist(merged.facts.filter(f=>oldIds.has(f.id)||ids.has(f.id)).map(f=>ids.has(f.id)?{...f,confirmed:true}:f),p.revision,m.acceptPlaintext);return data;
      }
      if(type==='local-edit'){
        if(m.reviewed!==true)throw Error('请核对这条资料');
        const fact=normalizeFact(m.fact);if(!profile.facts.some(f=>f.id===fact.id))throw Error('资料已变化');
        data=await persist(profile.facts.map(f=>f.id===fact.id?{...fact,confirmed:true,conflict:false}:f),m.revision,false);return data;
      }
      if(type==='local-erase'){
        if(m.confirm!==true)throw Error('请确认只删除免口令资料');stage='erase';epoch++;preview=null;await run.stop();
        return persist([],m.revision,true);
      }
      if(type==='local-switch'){await switchLocal();alive();return {mode:'local'};}
      if(type==='local-advanced'){await run.stop();preview=null;await openAdvanced(m.tabId);return {ok:true};}
      if((await mode())!=='local')throw Error('原MCP模式仍开启，请先切回本地');alive();
      if(type==='local-scan'){
        stage='scan';await attached(m.tabId);alive();
        const ids=profile.facts.filter(f=>f.confirmed&&!f.conflict&&!secret(f.label)).map(f=>f.id);
        if(!ids.length)throw Error('请先导入并核对资料');
        data=await run.scan(own,{tabId:m.tabId,factIds:ids,includeFrames:m.includeFrames===true});alive();return data;
      }
      if(type==='local-map'){stage='map';data=run.remap(own,m);return data;}
      if(type==='local-bind'){stage='bind';data=run.bindEntity(own,m);return data;}
      if(type==='local-locate')return await run.locate(own,m);
      if(type==='local-fill'){
        stage='fill';run.current(own,m.planId);sourceEntries=run.job.frames.flatMap(f=>f.plan.entries.map(e=>({...e,id:`${f.frameId}:${e.fieldId}`})));
        data=await run.apply(own,m);return data;
      }
      throw Error('不支持的操作');
    } catch(error){if(stage)record(stage,start,null,error,sourceEntries);stage=null;throw error;}
    finally{if(stage)record(stage,start,data,null,sourceEntries);active=false;}
  }
  async function navigated(id){if(run.job?.tabId===id||run.running?.tabId===id){epoch++;await run.stop();}}
  return {request,open,navigated,get busy(){return active||run.busy;}};
}
