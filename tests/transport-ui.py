"""Actual Chromium UI + mocked Chrome/bridge/executor. NOT installed-extension acceptance."""
from pathlib import Path
import json, os, re, shutil, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/transport-ui.json'; OUT.parent.mkdir(parents=True,exist_ok=True)
results=[]
def require(value,message):
    if not value: raise AssertionError(message)
SHIM=r"""() => {
 const original=Element.prototype.attachShadow;
 Element.prototype.attachShadow=function(options){const root=original.call(this,options);if(this.id==='resume-companion-local')window.testRoot=root;return root;};
 const state=window.testState={calls:[],waits:[],revision:1,active:0,maxActive:0,fillMode:'success',entries:5,transport:2};
 function wake(){state.revision++;const waits=state.waits.splice(0);for(const done of waits)done();}
 function pendingWait(signal){return new Promise((resolve,reject)=>{
  state.active++;state.maxActive=Math.max(state.maxActive,state.active);
  let done=false;const finish=()=>{if(done)return;done=true;state.active--;signal?.removeEventListener('abort',finish);const i=state.waits.indexOf(finish);if(i>=0)state.waits.splice(i,1);resolve({revision:state.revision});};
  state.waits.push(finish);signal?.addEventListener('abort',finish,{once:true});if(signal?.aborted)finish();
 });}
 function plan(){return state.plan={id:'p'+state.revision,snapshotId:'s'+state.revision,url:'https://jobs.example.invalid/form',limitations:['虚构测试，不是官网验收'],entries:Array.from({length:state.entries},(_,i)=>({fieldId:'f'+i,label:'测试字段'+i,section:'基本信息',kind:'text',status:'ready',reason:'虚构资料',value:i===0?'<img src=x onerror=alert(1)>':'SYNTHETIC-'+i}))};}
 function fill(ids){
  state.lastSelection=ids;
  const report={results:ids.map(fieldId=>({fieldId,status:'verified'})),submitted:false,saved:false,performance:{durationMs:500}};
  if(state.fillMode==='failure')throw Error('synthetic write failure');
  if(state.fillMode==='pending')return new Promise(resolve=>state.endFill=()=>resolve({...report,results:report.results.map((r,i)=>({...r,status:i?'cancelled':'verified'}))}));
  return report;
 }
 const runtime={id:'synthetic-extension',getURL:x=>x,sendMessage:async m=>{
  state.calls.push(m);let data;
  try{
   if(m.type==='resume-poll')data={revision:state.revision,commands:[],selected:true,profileCount:state.entries};
   else if(m.type==='resume-events')data=await pendingWait();
   else if(m.type==='resume-stop-poll'){wake();data={ok:true};}
   else if(m.type==='resume-scan'){wake();data=plan();}
   else if(m.type==='resume-fill')data=await fill(m.fieldIds);
   else if(m.type==='resume-cancel'){state.endFill?.();data={ok:true};}
   else data={ok:true};return {data};
  }catch(e){return {error:e.message};}
 }};
 window.chrome={runtime,storage:{local:{get:async()=>({resumeMode:'mcp'}),set:async()=>{},remove:async()=>{}},session:{remove:async()=>{}}},
  tabs:{get:async()=>({url:'https://jobs.example.invalid/form'})},scripting:{executeScript:async command=>{
   if(command.files)return [];
   const [action,arg]=command.args;state.calls.push({engine:action});
   if(action==='scan')return [{result:{id:'s'+state.revision,url:'https://jobs.example.invalid/form',fields:[],limitations:[]}}];
   if(action==='apply')return [{result:await fill(arg.entries.filter(x=>x.status==='ready').map(x=>x.fieldId))}];
   if(action==='cancel'){state.endFill?.();return [{result:{cancelled:true}}];}
  }}};
 window.fetch=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;state.calls.push({path,body});let data;
  if(path==='/status')data={version:'0.3.2',transport:state.transport};
  else if(path==='/profile')data={facts:[]};
  else if(path==='/poll')data={revision:state.revision,commands:[],selected:true,profileCount:state.entries};
  else if(path==='/events')data=await pendingWait(options.signal);
  else if(path==='/snapshot'){wake();data={plan:plan()};}
  else if(path==='/begin')data={plan:{...state.plan,expiresAt:Date.now()+300000,entries:state.plan.entries.map(e=>({...e,status:body.fieldIds.includes(e.fieldId)?'ready':'skipped'}))}};
  else if(path==='/cancel'){state.endFill?.();data={ok:true};}
  else data={ok:true};return {ok:true,json:async()=>data};
 };
}"""
with sync_playwright() as pw:
    opts={'headless':True,'args':['--no-sandbox']}
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    if executable: opts['executable_path']=executable
    browser=pw.chromium.launch(**opts); context=browser.new_context(viewport={'width':1120,'height':780}); page=None; errors=[]
    def load(kind):
        global page, errors
        if page: page.close()
        page=context.new_page(); page.set_default_timeout(5000); errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        if kind=='widget': page.set_content('<h1>虚构网申页面</h1>')
        else:
            html=(ROOT/'extension/panel.html').read_text()
            html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html)
            html=re.sub(r'<link\b[^>]*>','',html)
            page.set_content(html);page.add_style_tag(path=str(ROOT/'extension/panel.css'))
        page.evaluate(SHIM);page.add_script_tag(path=str(ROOT/'extension/poll-loop.js'))
        source=(ROOT/f'extension/{kind if kind=="widget" else "panel"}.js').read_text()
        if kind=='panel':
            source=source.replace("import {withDeadline} from './core/execution-deadline.mjs';",(ROOT/'extension/core/execution-deadline.mjs').read_text().replace('export ',''))
        page.add_script_tag(content=source)
    def shadow_click(selector):
        rect=page.evaluate("s=>{const e=testRoot.querySelector(s);e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}",selector)
        page.mouse.click(rect['x'],rect['y'])
    def scan_widget():
        shadow_click('.scan-launch');page.wait_for_function("testRoot.querySelectorAll('.row').length===testState.entries")
    def connect_panel():
        page.locator('#token').fill('SYNTHETIC-PAIRING-CODE');page.locator('#connect').click()
        page.wait_for_function("testState.active===1")
    def case(name,fn):
        start=time.monotonic()
        try:
            fn();require(not errors,'uncaught UI error: '+str(errors));results.append({'name':name,'status':'passed','seconds':time.monotonic()-start});print('PASS',name,flush=True)
        except Exception as error:
            results.append({'name':name,'status':'failed','error':str(error)[:1000]});print('FAIL',name,str(error),flush=True)
    def render_many():
        load('widget');page.evaluate('testState.entries=160');scan_widget()
        require(page.evaluate("testRoot.querySelectorAll('.row img').length===0"),'untrusted value became HTML')
        shadow_click('.select-none');require(page.evaluate("testRoot.querySelector('.fill').disabled"),'empty selection allowed')
        shadow_click('.select-all');require(page.evaluate("!testRoot.querySelector('.fill').disabled"),'select all did not restore selection')
    case('widget-160-rows-safe-text-and-selection-controls',render_many)
    def selected_only():
        load('widget');scan_widget();shadow_click('input[data-field=f0]');shadow_click('.fill')
        page.wait_for_function('testState.lastSelection?.length===4')
        require(page.evaluate("!testState.lastSelection.includes('f0')"),'unchecked field sent')
        require(page.evaluate("testRoot.querySelector('.status').textContent.includes('回读通过 4')"),'result summary missing')
    case('widget-sends-only-selected-fields-and-displays-readback',selected_only)
    def stop_fill():
        load('widget');page.evaluate("testState.fillMode='pending'");scan_widget();shadow_click('.fill');page.wait_for_function('!!testState.endFill');shadow_click('.stop')
        page.wait_for_function("testRoot.querySelector('.fill').disabled && testRoot.querySelector('.status').textContent.includes('回读通过 1')")
        require(page.evaluate("testState.calls.filter(x=>x.type==='resume-cancel').length===1"),'cancel duplicated')
    case('widget-stop-preserves-already-written-results',stop_fill)
    def failure_once():
        load('widget');page.evaluate("testState.fillMode='failure'");scan_widget();shadow_click('.fill');page.wait_for_timeout(1200)
        require(page.evaluate("testState.calls.filter(x=>x.type==='resume-fill').length===1"),'write retried')
        require(page.evaluate("testRoot.querySelector('.status').textContent.includes('未自动重试')"),'failure recovery guidance missing')
    case('widget-failure-is-not-automatically-replayed',failure_once)
    def close_reopen():
        load('widget');shadow_click('.launch .fab:nth-child(2)');page.wait_for_function('testState.active===1')
        for _ in range(4):
            shadow_click('.close');shadow_click('.launch .fab:nth-child(2)');page.wait_for_function('testState.active===1')
        require(page.evaluate('testState.maxActive===1'),'overlapping notification consumers')
        shadow_click('.close');page.wait_for_function('testState.active===0')
    case('widget-close-reopen-cleans-notification-subscription',close_reopen)
    def keep_while_codex():
        load('widget');shadow_click('.launch .fab:nth-child(2)');page.wait_for_function('testState.active===1')
        page.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_timeout(100)
        require(page.evaluate('testState.active===1'),'switching to Codex disconnected the open drawer')
        shadow_click('.close');page.wait_for_function('testState.active===0')
    case('open-drawer-does-not-disconnect-on-simulated-tab-visibility-change',keep_while_codex)

    def panel_batch():
        load('panel');connect_panel();page.locator('#scan').click();page.wait_for_function("document.querySelectorAll('#table input').length===5")
        page.locator('#table input').first.uncheck();page.locator('#approve').click();page.wait_for_function("document.querySelector('#result').textContent.includes('回读通过 4')")
        require(page.evaluate("testState.calls.filter(x=>x.path==='/snapshot').length===1 && !testState.calls.some(x=>x.path==='/plan')"),'extra scan/plan HTTP roundtrip')
        require(page.evaluate("testState.calls.filter(x=>x.path==='/begin').length===1 && testState.calls.filter(x=>x.engine==='apply').length===1"),'begin or execute duplicated')
        require(page.evaluate("!testState.lastSelection.includes('f0')"),'panel ignored selection')
    case('panel-combined-scan-and-server-approved-selection',panel_batch)
    def panel_stop():
        load('panel');connect_panel();page.evaluate("testState.fillMode='pending'");page.locator('#scan').click();page.locator('#approve').click();page.wait_for_function('!!testState.endFill');page.locator('#cancelFill').click();page.wait_for_timeout(100)
        require(page.evaluate("testState.calls.some(x=>x.engine==='cancel') && testState.calls.some(x=>x.path==='/cancel')"),'cancel not sent')
        require(page.locator('#approve').is_disabled(),'old plan remained executable')
    case('panel-stop-race-does-not-dereference-cleared-plan',panel_stop)
    def panel_mobile():
        load('panel');page.set_viewport_size({'width':390,'height':844});connect_panel();page.locator('#scan').click();page.wait_for_function("document.querySelectorAll('#table input').length===5")
        require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'page overflows mobile viewport')
        page.screenshot(path=str(ROOT/'test-results/transport-panel-narrow.png'),full_page=True)
        page.set_viewport_size({'width':1120,'height':780})
    case('panel-new-controls-wrap-at-390px',panel_mobile)
    def version_check():
        load('panel');page.evaluate('testState.transport=1');page.locator('#token').fill('SYNTHETIC');page.locator('#connect').click()
        page.wait_for_function("document.querySelector('#status').dataset.state==='error'")
        require('0.3.2' in page.locator('#status').inner_text(),'old bridge warning missing')
        require(page.evaluate('testState.active===0'),'old bridge entered event loop')
    case('panel-detects-old-bridge-without-hot-polling',version_check)
    report={'scope':'real Chromium UI; mocked Chrome APIs, bridge and webpage executor; not installed MV3','browser':browser.version,'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'cases':results}
    browser.close()
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if report['failed']: raise SystemExit(1)
