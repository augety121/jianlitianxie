import {secureTarget} from './workspace-policy.mjs';
export const SITE_ACCESS_KEY='resumeSiteAccessV1';
export function canonicalOrigin(value) {
  const url=secureTarget(value);
  if (url.origin !== value || url.hostname.includes('*')) throw Error('必须指定准确的网站来源，不接受路径或通配符');
  return url.origin;
}
async function scriptId(origin) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(origin));
  return 'resume-local-'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}
/** Site settings are metadata only, not a profile-to-web bridge. */
export class SiteAccess {
  constructor(chrome) { this.chrome=chrome; this.tail=Promise.resolve(); }
  enqueue(fn) { const next=this.tail.then(fn); this.tail=next.catch(()=>{}); return next; }
  set(origin,show,add) { return this.enqueue(()=>this.setCurrent(origin,show,add)); }
  async syncScript(origin,show) {
    const id=await scriptId(origin),scripting=this.chrome.scripting;
    const installed=await scripting.getRegisteredContentScripts({ids:[id]});
    if(show){
      if(!await this.chrome.permissions.contains({origins:[origin+'/*']}))throw Error('此网站权限已撤销');
      const spec={id,matches:[origin+'/*'],js:['page-assistant.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true};
      if(!installed.length)await scripting.registerContentScripts([spec]);
      else if(Object.keys(spec).some(k=>JSON.stringify(installed[0][k])!==JSON.stringify(spec[k])))await scripting.updateContentScripts([spec]);
    }else if(installed.length)await scripting.unregisterContentScripts({ids:[id]});
  }
  restore() {
    return this.enqueue(async()=>{
      const raw=(await this.chrome.storage.local.get(SITE_ACCESS_KEY))[SITE_ACCESS_KEY];
      const restored=[];
      for(const item of (Array.isArray(raw)?raw:[]).slice(0,100)){
        try{
          const origin=canonicalOrigin(item?.origin);
          const allowed=item.show===true&&await this.chrome.permissions.contains({origins:[origin+'/*']});
          await this.syncScript(origin,allowed);
          if(allowed)restored.push(origin);
        }catch { /* Malformed preferences or revoked permissions never grant access. */ }
      }
      return restored;
    });
  }
  async get(origin) {
    canonicalOrigin(origin);
    const raw=(await this.chrome.storage.local.get(SITE_ACCESS_KEY))[SITE_ACCESS_KEY];
    const entry=Array.isArray(raw)?raw.find(x=>x.origin===origin):null;
    return {origin,show:entry?.show===true,add:entry?.show===true&&entry?.add===true};
  }
  async allowed(origin) {
    const pref=await this.get(origin);
    return pref.show && !!await this.chrome.permissions.contains({origins:[origin+'/*']});
  }
  async setCurrent(origin, show, add) {
    canonicalOrigin(origin);
    if(typeof show!=='boolean'||typeof add!=='boolean')throw Error('网站设置格式无效');
    if(show&&!await this.chrome.permissions.contains({origins:[origin+'/*']}))throw Error('请先通过浏览器授权这个网站');
    const raw=(await this.chrome.storage.local.get(SITE_ACCESS_KEY))[SITE_ACCESS_KEY];
    const rows=(Array.isArray(raw)?raw:[]).filter(x=>x.origin!==origin).map(x=>({origin:x.origin,show:x.show===true,add:x.add===true}));
    if(rows.length>=100)throw Error('网站设置已达100项，请先关闭不再使用的网站');
    await this.syncScript(origin,show);
    await this.chrome.storage.local.set({[SITE_ACCESS_KEY]:[...rows,{origin,show,add:show&&add}]});
    return this.get(origin);
  }
}
