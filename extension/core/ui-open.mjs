import {trustedWorkspace} from './workspace-policy.mjs';
import {preflightError} from './preflight.mjs';
/** A browser tab ID is not proof of presentation. Only a trusted page can ack it. */
export class TrustedUiOpens {
 constructor(chrome,{onState=()=>{},timeout=3000}={}){this.chrome=chrome;this.onState=onState;this.timeout=timeout;this.pending=new Map();}
 async open({url,view,create,target,onRevoke=()=>{}}){
  const id=crypto.randomUUID(),u=new URL(url);u.searchParams.set('uiRequest',id);
  const request={id,view,page:u.pathname.slice(1),url:u.href,target,tabId:null,early:null,timer:null,onRevoke};this.pending.set(id,request);
  this.onState({view,state:'requested',operationId:id,target});
  try{
   const result=await create(u.href);request.tabId=result?.tabs?.[0]?.id??result?.id;
   if(request.early)this.ready({requestId:id},request.early);
   if(this.pending.has(id)){
    request.timer=setTimeout(()=>{if(this.pending.delete(id)){onRevoke();this.onState({view,state:'timeout',operationId:id,target});}},this.timeout);
    request.timer.unref?.();
   }
   return {...result,requested:true,opened:!this.pending.has(id),uiRequest:id};
  }catch(error){this.pending.delete(id);onRevoke();this.onState({view,state:'denied',operationId:id,target});throw preflightError('host-ui-denied','浏览器未能打开扩展核对界面。表单保持当前状态；请从工具栏打开资料页查看兼容说明。');}
 }
 ready(message,sender){
  const request=this.pending.get(message.requestId);
  if(!request||!trustedWorkspace(sender,this.chrome.runtime,request.page)||typeof sender.documentId!=='string'||new URL(sender.url).searchParams.get('uiRequest')!==request.id)throw Error('界面打开请求已失效或来源不正确');
  if(!request.tabId){request.early=sender;return {pending:true};}
  if(sender.tab?.id!==request.tabId)throw Error('界面回执不属于创建的标签页');
  clearTimeout(request.timer);this.pending.delete(request.id);this.onState({view:request.view,state:'ready',operationId:request.id,target:request.target});return {ready:true};
 }
 cancel(){for(const r of this.pending.values()){clearTimeout(r.timer);r.onRevoke();}this.pending.clear();}
}
