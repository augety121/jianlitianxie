import {mappingCandidates} from './core/review-model.mjs';
import {restricted} from './core/planner.mjs';
import {normalizeProfile, normalizeFact, planImport, mergeImport} from './core/profile.mjs';
import {openVault} from './core/vault.mjs';
import {readLocalImport} from './core/local-import.mjs';
import {FrameBroker} from './core/frame-broker.mjs';
import {WorkspaceRun} from './core/workspace-run.mjs';
import {trustedWorkspace, secret, secureTarget} from './core/workspace-policy.mjs';
import {pageSummary} from './core/page-summary.mjs';
import {LocalReceipts, receiptReason, exportReceipts} from './core/local-receipts.mjs';

export const LOCAL_PROFILE_KEY='resumePlainLocalV1';
/** New no-passphrase path. It never imports the bridge API or silently decrypts a vault. */
export function createLocalWorkflow(chrome,{externalBusy=()=>false,mode=async()=> 'local',switchLocal=async()=>{},openAdvanced=async()=>{}}={}) {
  const storage=chrome.storage.local,ready=Promise.all([storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
  let profile={schemaVersion:1,revision:0,facts:[]},accepted=false,active=false,epoch=0,preview=null,activeOwner=null;
  const pickers=new Map();
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
    const url=chrome.runtime.getURL('local.html')+'?tab='+tab.id,key='local-manager-'+tab.id;
    const known=(await chrome.storage.session.get(key))[key];
    if(Number.isSafeInteger(known)){
      try{const manager=await chrome.tabs.get(known);
        if(manager.url?.split('&')[0]===url)return await chrome.tabs.update(known,{active:true,url:url+'&refresh='+Date.now()});
      }catch{}
    }
    const created=await chrome.tabs.create({url});
    if(Number.isSafeInteger(created?.id))await chrome.storage.session.set({[key]:created.id});
    return created;
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
    const fields=outcomes.map((e,i)=>({index:order.get(e.id)||i+1,status:e.status,code:e.reasonCode}));
    const problematic=fields.filter(e=>!['verified','preserve','ready'].includes(e.status)),normal=fields.filter(e=>['verified','preserve','ready'].includes(e.status));
    logs.add({stage,ok:!error,reason:error?receiptReason(error):'none',ms:Math.round(performance.now()-start),total:fields.length||data?.items?.length||data?.facts?.length||0,
      fields:[...problematic,...normal].slice(0,300),omitted:Math.max(0,fields.length-300),performance:stage==='fill'?{apply:data?.performance}:data?.performance});
  }
  async function perform(m,own){
    const type=m.type;
    if(type==='local-stop') {epoch++;preview=null;const result=await run.stop();logs.add({stage:'stop',ok:true,reason:'none',ms:0,total:0});return result;}
    if(type==='local-state'){
      await ready;if(!active)await refresh();
      const old=(await storage.get('resumeVaultV1')).resumeVaultV1;
      let target='';try{target=new URL((await attached(m.tabId)).url).origin;}catch{}
      let targetTitle='';try{targetTitle=String((await attached(m.tabId)).title||'').slice(0,160);}catch{}
      return {target,targetTitle,profile:structuredClone(profile),accepted,busy:active,encryptedExists:!!old,mode:await mode(),logging:(await storage.get('resumeLocalReceiptsEnabled')).resumeLocalReceiptsEnabled!==false};
    }
    if(type==='local-logs'){await ready;const data=await logs.read();return {...exportReceipts(data),enabled:data.enabled};}
    if(type==='local-log-settings'){await ready;await logs.settings(m.enabled,m.clear===true);return {ok:true};}
    // Acquire synchronously before any asynchronous permission/storage check.
    if(active||externalBusy())throw Error('另一项任务正在执行，请先停止并等待回读');
    active=true;activeOwner=own;const generation=epoch,start=performance.now();let data,stage,sourceEntries=[];
    const alive=()=>{if(generation!==epoch)throw Error('操作已取消，请重新扫描');};
    try {
      await ready;await refresh();alive();
      if(type==='local-return'){await attached(m.tabId);alive();await attachButton(m.tabId);await chrome.tabs.update(m.tabId,{active:true});return {returned:true};}
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
      if(type==='local-picker-open'){
        const j=run.current(own,m.planId);
        const f=j.frames[0],entry=f?.plan.entries.find(e=>`0:${e.fieldId}`===m.id);
        if(!entry||f.frameId!==0||entry.status==='preserve'||entry.multiple||entry.kind==='repeat-group'||restricted({type:entry.kind,label:entry.label}))throw Error('这个控件需要在网页手动处理，不向其发送资料');
        if(j.tabId!==m.tabId||j.url!==m.url||f.documentId!==m.documentId)throw Error('目标文档已变化，请重新点击填写简历');
        for(const [key,t] of pickers)if(t.expires<=Date.now())pickers.delete(key);
        if(pickers.size>=4)throw Error('请先完成已打开的补填小窗');
        const id=crypto.randomUUID(),ticket={id,owner:own,planId:j.id,fieldId:m.id,tabId:j.tabId,documentId:f.documentId,url:j.url,expires:Math.min(j.expiresAt,Date.now()+120000),pickerTab:null,pickerDocument:null,claimed:false};
        pickers.set(id,ticket);
        try{
          const win=await chrome.windows.create({url:chrome.runtime.getURL('quick-pick.html')+'?ticket='+id,type:'popup',width:470,height:650,focused:true});
          alive();run.current(own,m.planId);
          const tab=win.tabs?.[0];if(!Number.isSafeInteger(tab?.id))throw Error('资料小窗未建立，请重新尝试');
          ticket.pickerTab=tab.id;return {opened:true};
        }catch(e){pickers.delete(id);throw e;}
      }
      if(type==='local-picker-read'||type==='local-picker-fill'){
        const t=pickers.get(m.ticket);
        if(!t||t.claimed||t.expires<=Date.now()||t.owner!==own)throw Error('这次补填已过期或结束，请在申请页重新检查缺项');
        const j=run.current(own,t.planId),f=j.frames[0];
        if(j.tabId!==t.tabId||j.url!==t.url||f?.documentId!==t.documentId||(await attached(t.tabId)).url!==t.url)throw Error('目标页面已改变，未填写');
        alive();run.current(own,t.planId);
        const raw=f.plan.entries.find(e=>`0:${e.fieldId}`===t.fieldId);
        if(!raw||raw.status==='preserve'||raw.multiple||raw.kind==='repeat-group'||restricted({type:raw.kind,label:raw.label}))throw Error('目标不是允许补填的空白字段');
        const entry={...raw,origin:new URL(j.url).origin};
        const bound=f.entityBindings?.[raw.groupId]||'';
        const choices=mappingCandidates(entry,j.facts,'',bound).filter(c=>!secret(c.fact.label));
        if(type==='local-picker-read')return {label:entry.label,section:entry.section||'',origin:entry.origin,expiresAt:t.expires,
          facts:choices.map(({fact,exact})=>({id:fact.id,label:fact.label,section:fact.section,entity:fact.entity,value:fact.value,exact}))};
        if(m.reviewed!==true||!choices.some(c=>c.fact.id===m.factId))throw Error('请选择本次候选资料并核对后确认');
        const updated=run.remap(own,{planId:t.planId,id:t.fieldId,factId:m.factId});t.planId=updated.id;
        const chosen=updated.entries.find(e=>e.id===t.fieldId);
        if(chosen?.status!=='ready')throw Error(chosen?.reason||'所选资料不符合这个控件的要求');
        stage='fill';sourceEntries=updated.entries;t.claimed=true;
        await chrome.tabs.update(t.tabId,{active:true});alive();run.current(own,t.planId);
        data=await run.apply(own,{planId:t.planId,ids:[t.fieldId],reviewed:true});
        const result={verified:data.results[0]?.status==='verified',status:data.results[0]?.status||'needs-user',submitted:false};
        pickers.delete(t.id);
        // Only a bounded status receipt goes back to the page, never picker candidates or values.
        await chrome.scripting.executeScript({target:{tabId:t.tabId,documentIds:[t.documentId]},func:r=>globalThis.__resumeLocalAssistant?.finished(r),args:[result]}).catch(()=>{});
        return result;
      }
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
    finally{if(stage)record(stage,start,data,null,sourceEntries);active=false;activeOwner=null;}
  }
  async function request(m,sender){
    if(!trustedWorkspace(sender,chrome.runtime,'local.html'))throw Error('只有本地填写页可以访问资料');
    if(m.type.startsWith('local-picker-'))throw Error('请在申请页打开补填小窗');
    return perform(m,owner(sender));
  }
  async function pickerRequest(m,sender){
    if(!trustedWorkspace(sender,chrome.runtime,'quick-pick.html')||typeof sender.documentId!=='string')throw Error('只有补填小窗可以读取候选资料');
    if(!['local-picker-read','local-picker-fill','local-picker-close'].includes(m.type))throw Error('小窗操作无效');
    const t=pickers.get(m.ticket);
    if(t&&!t.pickerTab)throw Error('资料小窗正在打开，请稍后重试');
    if(!t||t.expires<=Date.now()||t.claimed||sender.tab?.id!==t.pickerTab)throw Error('补填授权已过期或不属于这个窗口');
    if(t.pickerDocument&&t.pickerDocument!==sender.documentId)throw Error('补填窗口已变化，请重新打开');
    t.pickerDocument=sender.documentId;
    if(m.type==='local-picker-close'){pickers.delete(t.id);return {closed:true};}
    return perform(m,t.owner);
  }
  async function attachButton(tabId){
    await attached(tabId);
    await chrome.scripting.executeScript({target:{tabId},files:['page-assistant.js']});
  }
  async function launch(tab){
    await ready;secureTarget(tab.url);
    await chrome.storage.session.set({['workspace-target-'+tab.id]:new URL(tab.url).origin});
    await attachButton(tab.id);
    await refresh();
    if(!accepted||!profile.facts.length)return open(tab);
    return {attached:true};
  }
  async function reattach(tab){
    if(await mode()!=='local')return;
    const grant=(await chrome.storage.session.get('workspace-target-'+tab.id))['workspace-target-'+tab.id];
    if(grant===new URL(tab.url).origin)await attachButton(tab.id);
  }
  async function pageRequest(m,sender){
    // Content script capabilities are NOT the trusted management-page capabilities.
    if(sender.id!==chrome.runtime.id||sender.frameId!==0||!Number.isSafeInteger(sender.tab?.id)||
       typeof sender.documentId!=='string'||!sender.documentId||
       sender.documentLifecycle&&sender.documentLifecycle!=='active')throw Error('页面身份无效');
    secureTarget(sender.url);
    const tabId=sender.tab.id,tab=await attached(tabId);
    if(tab.url!==sender.url)throw Error('页面已经变化，请在当前申请页重新点击插件');
    const own='page:'+sender.documentId;
    const checkDocument=()=>{
      const j=run.current(own,m.planId);
      if(j.tabId!==tabId||j.url!==sender.url||j.frames[0]?.documentId!==sender.documentId)throw Error('目标文档已变化，请重新扫描');
      return j;
    };
    if(m.type==='page-local-manage'){
      await open(tab);return {opened:true};
    }
    if(m.type==='page-local-status'){
      await ready;if(!active)await refresh();
      return {hasProfile:accepted&&profile.facts.length>0,mode:await mode(),busy:active};
    }
    if(m.type==='page-local-scan'){
      const p=await perform({type:'local-scan',tabId},own);
      if(run.job?.frames[0]?.documentId!==sender.documentId||run.job?.url!==sender.url){await run.stop();throw Error('扫描时文档改变，请重扫');}
      return pageSummary(p);
    }
    if(m.type==='page-local-pick'){
      checkDocument();
      return perform({type:'local-picker-open',planId:m.planId,id:m.id,tabId,url:sender.url,documentId:sender.documentId},own);
    }
    if(m.type==='page-local-locate'){
      checkDocument();return perform({type:'local-locate',planId:m.planId,id:m.id},own);
    }
    if(m.type==='page-local-fill'){
      if(m.reviewed!==true)throw Error('请本人点击确认填写');
      checkDocument();
      const approved=pageSummary(run.preview()).quick.map(e=>e.id);
      if(!approved.length)throw Error('没有可安全直接填写的普通字段，请打开工作台处理');
      const result=await perform({type:'local-fill',planId:m.planId,ids:approved,reviewed:true},own);
      const counts={};for(const r of result.results)counts[r.status]=(counts[r.status]||0)+1;
      return {counts,submitted:false};
    }
    if(m.type==='page-local-stop'){
      const j=run.running||run.job;
      if(active&&activeOwner!==own||j&&(j.owner!==own||j.tabId!==tabId))throw Error('另一个工作台正在操作，未停止其他任务');
      return perform({type:'local-stop'},own);
    }
    throw Error('页面入口不允许读取或修改完整资料');
  }
  async function navigated(id){if(run.job?.tabId===id||run.running?.tabId===id){epoch++;await run.stop();}}
  return {request,pageRequest,pickerRequest,open,launch,reattach,navigated,get busy(){return active||run.busy;}};
}
