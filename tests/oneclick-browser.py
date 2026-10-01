"""Screenshot-derived layout fixtures, not the real Hotjob DOM/site.
Real Chromium, production planner/engine/page assistant. Only Chrome IPC is mocked.
Trusted button input comes from the mouse; no removal of isTrusted or CSP guardrails.
"""
from pathlib import Path
import json,os,shutil,time,sys
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/oneclick-browser.json';OUT.parent.mkdir(exist_ok=True);cases=[]
def fact(i,label,value,section='基本信息',entity=''):return dict(id=i,label=label,value=value,section=section,entity=entity,source='synthetic',confirmed=True)
facts=[fact('s1','学校','示例大学甲','教育经历','本科学习'),fact('m1','专业','示例专业甲','教育经历','本科学习'),fact('s2','学校','示例大学乙','教育经历','硕士学习'),fact('m2','专业','示例专业乙','教育经历','硕士学习')]
html='''<aside><a>项目经历</a><a>教育经历</a></aside><form id="app"><div id="education"><div class="title"><h2>教育经历 <small>必填</small></h2></div><div class="inputs"><label>学校<input id="school" value="示例大学乙"></label><label>专业<input id="major"></label></div></div><div id="projects"><div><h2>项目经历</h2></div><div><label>项目名称<input id="project" value="示例项目"></label><label>项目介绍<textarea id="description"></textarea></label></div></div><button>提交</button></form>'''
def require(v,msg):
 if not v:raise AssertionError(msg)
with sync_playwright() as pw:
 opts={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 if exe:opts['executable_path']=exe
 browser=pw.chromium.launch(**opts)
 def case(name,markup,fn):
  if '--layout-only' in sys.argv and len(cases)>=11:return
  page=browser.new_page(viewport={'width':1280,'height':900});page.set_default_timeout(5000)
  try:
   content='<meta charset="utf-8"><style>body{font:16px system-ui;background:#f5f7fa;padding:32px}form{width:700px;background:white;padding:24px;border-radius:15px}input,textarea{display:block;padding:10px;margin:6px 0 14px}aside{display:none}label{display:block}h2{font-size:21px}</style>'+markup
   if '--layout-only' in sys.argv:page.set_content(content)
   else:
    page.route('https://fixture.invalid/**',lambda route:route.fulfill(body=content,content_type='text/html'));page.goto('https://fixture.invalid/form')
   page.evaluate("()=>{globalThis.submitted=0;document.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();submitted++})}")
   page.add_script_tag(content=bundle(ROOT/'tests/helpers/oneclick-entry.mjs'));page.wait_for_function('!!__onePlan');page.add_script_tag(path=os.environ.get('ENGINE_UNDER_TEST',str(ROOT/'extension/engine.js')))
   fn(page);require(page.evaluate('submitted')==0,'submitted form');cases.append({'name':name,'status':'passed'});print('PASS',name,flush=True)
  except Exception as e:cases.append({'name':name,'status':'failed','error':str(e)[:900]});print('FAIL',name,str(e),flush=True)
  finally:page.close()
 def make(page,profile):return page.evaluate('async facts=>{const s=await __resumeFillEngine.scan();return {snapshot:s,plan:__onePlan(s,{facts})}}',profile)
 def layout(page):
  data=make(page,facts+[fact('p','项目名称','示例项目','项目经历','项目A'),fact('d','项目描述','SYNTHETIC DESCRIPTION','项目经历','项目A')]);by={f['label']:f for f in data['snapshot']['fields']}
  require(by['专业']['section']=='教育经历',str(by));require(by['项目介绍']['section']=='项目经历',str(by))
  entries={e['label']:e for e in data['plan']['entries']};require(entries['专业']['value']=='示例专业乙',str(entries));require(entries['项目介绍']['value']=='SYNTHETIC DESCRIPTION',str(entries))
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',data['plan']);require(page.locator('#major').input_value()=='示例专业乙',str(r));require(page.locator('#description').input_value()=='SYNTHETIC DESCRIPTION',str(r));require(page.locator('#school').input_value()=='示例大学乙','overwrote school')
 case('plain-div-two-column-titles-and-exact-school-anchor-fill-correct-record',html,layout)
 def rename(page):
  data=make(page,facts);page.locator('#education h2').evaluate("n=>n.textContent='项目经历'");r=page.evaluate('p=>__resumeFillEngine.apply(p)',data['plan']);require(page.locator('#major').input_value()=='','scope changed but wrote');require(any(x['status']=='stale' for x in r['results']),str(r))
 case('changed-layout-title-invalidates-old-authorization',html,rename)
 def nav(page):
  s=page.evaluate('()=>__resumeFillEngine.scan()');require(s['fields'][0]['section']=='','navigation used as field scope')
 case('navigation-label-is-not-an-input-section','<nav><h2>教育经历</h2></nav><form><label>专业<input></label></form>',nav)
 def competing(page):
  s=page.evaluate('()=>__resumeFillEngine.scan()');require(not any(x['section'] for x in s['fields']),'competing headings guessed a scope')
 case('competing-unwrapped-headings-are-not-guessed','<form><h2>教育经历</h2><label>专业<input></label><h2>项目经历</h2><label>项目介绍<textarea></textarea></label></form>',competing)
 def same_school(page):
  fs=[dict(f, value='同一学校') if f['label']=='学校' else f for f in facts];page.locator('#school').fill('同一学校');data=make(page,fs);require(next(e for e in data['plan']['entries'] if e['label']=='专业')['status']=='missing','guessed same-school degree')
 case('same-school-different-degree-remains-unresolved',html,same_school)
 def bind(page):
  data=make(page,facts);a=next(f for f in data['snapshot']['fields'] if f['label']=='专业');require(bool(a.get('groupId')),'div-based record not bindable')
 case('plain-div-record-produces-a-real-document-group',html,bind)
 local_markup='<aside id="clock">0</aside><form><div id="record"><h2 id="title">基本信息</h2><div><label>姓名<input id="name"></label><label>邮箱<input id="email"></label></div></div></form>'
 local_facts=[fact('n','姓名','SYNTHETIC'),fact('e','邮箱','candidate@example.invalid')]
 def changed_during_write(page,mutation):
  data=make(page,local_facts)
  page.evaluate("code=>{document.getElementById('name').addEventListener('change',()=>{new Function(code)()},{once:true})}",mutation)
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',data['plan']);require(page.locator('#email').input_value()=='','stale layout cache wrote next field');require(any(x['status']=='stale' for x in r['results']),str(r))
 case('layout-cache-invalidates-synchronous-title-character-change',local_markup,lambda p:changed_during_write(p,"document.getElementById('title').firstChild.data='教育经历'"))
 case('layout-cache-invalidates-new-competing-title',local_markup,lambda p:changed_during_write(p,"const n=document.createElement('h2');n.textContent='项目经历';document.getElementById('record').append(n)"))
 case('layout-cache-rechecks-heading-visibility-live',local_markup,lambda p:changed_during_write(p,"document.getElementById('title').hidden=true"))
 case('layout-cache-rechecks-heading-navigation-role-live',local_markup,lambda p:changed_during_write(p,"document.getElementById('title').setAttribute('role','navigation')"))
 def unrelated(page):
  data=make(page,local_facts);page.evaluate("()=>document.getElementById('name').addEventListener('change',()=>document.getElementById('clock').textContent='1',{once:true})")
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',data['plan']);require(page.locator('#email').input_value()=='candidate@example.invalid',str(r));require(r['performance'].get('observersCreated')==r['performance'].get('observersClosed'),'scope observers leaked')
 case('layout-cache-allows-unrelated-clock-update-and-closes-observers',local_markup,unrelated)
 basic='<h1>虚构申请表 · 本地填写演示</h1><form><label>姓名<input id="name"></label><label>邮箱<input id="email" type="email"></label><label>性别<input id="gender"></label><label>密码<input id="secret" type="password"></label><button>保存（测试不提交）</button></form>'
 basics=[fact('n','姓名','SYNTHETIC CANDIDATE'),fact('e','邮箱','candidate@example.invalid'),fact('g','性别','示例项')]
 def load_assistant(page,profile=basics):
  page.evaluate('''facts=>{
   const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){const r=original.call(this,o);if(this.id==='resume-local-assistant')window.testRoot=r;return r;};
   window.testCalls=[];window.scanDelay=0;window.testEngineApplications=0;let plan,generation=0;
   window.chrome={runtime:{sendMessage:async m=>{testCalls.push(m.type);try{
    if(m.type==='page-local-status')return {data:{hasProfile:true,mode:'local'}};
    if(m.type==='page-local-run'){
      if(m.reviewed!==true)throw Error('Review required');const epoch=generation;
      if(scanDelay)await new Promise(r=>setTimeout(r,scanDelay));if(epoch!==generation)throw Error('Cancelled');
      const s=await __resumeFillEngine.scan();plan=__onePlan(s,{facts});
      const summary=__oneSummary({...plan,expiresAt:Date.now()+300000,entries:plan.entries.map(e=>({...e,id:e.fieldId,frameId:0}))});
      if(!summary.quick.length)return {data:{outcome:'no-eligible-fields',summary,counts:{},submitted:false}};
      if(epoch!==generation)throw Error('Cancelled');const ids=new Set(summary.quick.map(e=>e.id));
      testEngineApplications++;const r=await __resumeFillEngine.apply({...plan,entries:plan.entries.filter(e=>ids.has(e.fieldId))});
      const counts={};for(const e of r.results)counts[e.status]=(counts[e.status]||0)+1;
      return {data:{outcome:r.results.every(e=>e.status==='verified')?'completed':'partial',summary,counts,submitted:false}};
    }
    if(m.type==='page-local-scan'){if(scanDelay)await new Promise(r=>setTimeout(r,scanDelay));const s=await __resumeFillEngine.scan();plan=__onePlan(s,{facts});return {data:__oneSummary({...plan,expiresAt:Date.now()+300000,entries:plan.entries.map(e=>({...e,id:e.fieldId,frameId:0}))})};}
    if(m.type==='page-local-fill'){const ids=new Set(__oneSummary({...plan,entries:plan.entries.map(e=>({...e,id:e.fieldId,frameId:0}))}).quick.map(e=>e.id));const r=await __resumeFillEngine.apply({...plan,entries:plan.entries.filter(e=>ids.has(e.fieldId))});const counts={};for(const e of r.results)counts[e.status]=(counts[e.status]||0)+1;return {data:{counts}};}
    if(m.type==='page-local-stop'){generation++;__resumeFillEngine.cancel();return {data:{stopping:true}};}
    return {data:{opened:true}};
   }catch(e){return {error:e.message}}}}};
  }''',profile)
  page.add_script_tag(path=str(ROOT/'extension/page-assistant.js'));page.wait_for_function("testRoot.querySelector('.message').textContent.includes('无需先点扫描')")
 def click(page,label):
  box=page.evaluate('''label=>{const n=[...testRoot.querySelectorAll('button')].find(n=>n.textContent===label&&n.getClientRects().length);const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}''',label);page.mouse.click(box['x'],box['y'])
 def oneclick(page):
  load_assistant(page);require(page.evaluate("testRoot.querySelector('.primary').textContent==='填写简历'"),'no primary')
  click(page,'填写简历');page.wait_for_function("testRoot.querySelector('.message').textContent.includes('回读通过 2')")
  require(page.locator('#name').input_value()=='SYNTHETIC CANDIDATE','name not filled');require(page.locator('#email').input_value()=='candidate@example.invalid','email not filled');require(page.locator('#gender').input_value()=='' and page.locator('#secret').input_value()=='','sensitive write')
  require(page.evaluate("testCalls.filter(x=>x==='page-local-run').length===1 && testEngineApplications===1 && !testCalls.includes('page-local-manage')"),'wrong action route')
  page.screenshot(path=str(ROOT/'test-results/oneclick-desktop.png'))
  page.set_viewport_size({'width':390,'height':844});require(page.evaluate("testRoot.querySelector('.panel').getBoundingClientRect().width<=innerWidth"),'overflow')
  page.screenshot(path=str(ROOT/'test-results/oneclick-mobile.png'))
 case('one-trusted-click-scans-and-fills-without-management-tab',basic,oneclick)
 def synthetic(page):
  load_assistant(page);page.evaluate("testRoot.querySelector('.primary').click()");page.wait_for_timeout(100);require(page.locator('#name').input_value()=='','synthetic click wrote');require(page.evaluate("!testCalls.includes('page-local-scan')&&!testCalls.includes('page-local-run')"),'synthetic click started a task')
 case('script-generated-click-cannot-start-oneclick-fill',basic,synthetic)
 def collapsed(page):
  load_assistant(page);click(page,'收起');click(page,'填写简历');page.wait_for_function("testRoot.querySelector('.message').textContent.includes('回读通过 2')");require(page.locator('#name').input_value()=='SYNTHETIC CANDIDATE','collapsed button not functional')
 case('collapsed-pill-is-a-real-fill-button-not-just-an-opener',basic,collapsed)
 unmatched='<form>'+''.join(f'<label>已有{i}<input value="既有内容"></label>' for i in range(13))+''.join(f'<label>缺项{i}<input></label>' for i in range(6))+'<label>附件<input type="file"></label></form>'
 def zero(page):
  load_assistant(page);click(page,'填写简历');page.wait_for_function("testRoot.querySelector('.message').textContent.includes('没有可自动补全')")
  require(page.evaluate("testRoot.querySelector('.primary').getClientRects().length>0&&!testRoot.querySelector('.primary').disabled"),'fill disappeared')
  require(page.evaluate("testRoot.querySelectorAll('.problem').length===7"),'missing fields not explained inline');require(page.evaluate("!testCalls.includes('page-local-fill')&&!testCalls.includes('page-local-manage')"),'zero matched jumped or wrote');require(page.evaluate("!testRoot.querySelector('details').open"),'missing details must start collapsed');
  box=page.evaluate("()=>{const r=testRoot.querySelector('summary').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}")
  page.mouse.click(box['x'],box['y']);require(page.evaluate("testRoot.querySelector('details').open"),'details cannot be opened');click(page,'补填这项');require(page.evaluate("testCalls.includes('page-local-pick')"),'no inline remedy')
  page.screenshot(path=str(ROOT/'test-results/oneclick-zero-match.png'))
 case('zero-matches-keeps-fill-button-and-shows-remedies-without-auto-navigation',unmatched,zero)
 def inspect(page):
  load_assistant(page);click(page,'仅检查缺项');page.wait_for_function("testRoot.querySelector('.counts').textContent.includes('扫描')");require(page.locator('#name').input_value()=='' and page.evaluate("!testCalls.includes('page-local-fill')"),'inspection filled')
 case('optional-inspection-never-authorizes-writing',basic,inspect)
 def cancel(page):
  load_assistant(page);page.evaluate('scanDelay=400');click(page,'填写简历');click(page,'停止');page.wait_for_timeout(600);require(page.locator('#name').input_value()=='' and page.evaluate("testEngineApplications===0"),'stop between scan and fill lost')
 case('stop-during-scan-cancels-the-rest-of-oneclick',basic,cancel)
 report=dict(scope=('layout-only: page assistant UI excluded; about:blank real DOM' if '--layout-only' in sys.argv else 'synthetic screenshot-derived layout and real page-assistant UI/engine/planner; mocked Chrome IPC, not live ATS'),browser=browser.version,passed=sum(c['status']=='passed' for c in cases),failed=sum(c['status']=='failed' for c in cases),cases=cases);browser.close()
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');raise SystemExit(bool(report['failed']))
