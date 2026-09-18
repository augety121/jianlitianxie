"""Target-scoped guards and event-wait regressions in a real DOM, with synthetic data.
Not an installed MV3 test. Does not change browser policies or contact recruiting sites.
"""
from __future__ import annotations
import argparse, json, os, re, shutil, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT/'test-results/performance-guards.json');args=p.parse_args();args.output.parent.mkdir(parents=True,exist_ok=True)
modules='\n'.join((ROOT/'extension/core'/f).read_text() for f in ['performance.mjs','semantics.mjs','planner.mjs'])
modules=re.sub(r'^import .*?;\s*$', '', modules, flags=re.M).replace('export {normalize};','').replace('export ','').replace('crypto.randomUUID()',"'test-'+String(++globalThis.__testId)")
modules='globalThis.__testId=0;\n'+modules+'\nglobalThis.__testMakePlan=makePlan;'
results=[]
def require(value,reason):
 if not value:raise AssertionError(reason)
def fact(label,value,id='fact',**extra):return dict(id=id,label=label,value=value,source='synthetic',confirmed=True,**extra)
with sync_playwright() as pw:
 options=dict(headless=True,args=['--no-sandbox'])
 executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 if executable:options['executable_path']=executable
 browser=pw.chromium.launch(**options);ctx=browser.new_context(viewport=dict(width=1120,height=780));page=None
 def load(html,js=''):
  global page
  if page:page.close()
  page=ctx.new_page();page.set_default_timeout(5000);page.set_content('<style>body{margin:20px}input{min-height:24px}</style>'+html)
  page.add_script_tag(content=modules);page.add_script_tag(path=str(ROOT/'extension/engine.js'))
  if js:page.evaluate(js)
 def plan(facts):
  return page.evaluate('async facts=>{const s=await __resumeFillEngine.scan();return __testMakePlan(s,{facts})}',facts)
 def apply(p):return page.evaluate('p=>__resumeFillEngine.apply(p)',p)
 def checked(report):
  m=report.get('performance',{})
  require(m.get('observersCreated',0)==m.get('observersClosed',0),'event observers leaked')
 def case(name,fn):
  start=time.monotonic()
  try:fn();results.append(dict(name=name,status='passed',seconds=round(time.monotonic()-start,3)));print('PASS',name,flush=True)
  except Exception as e:results.append(dict(name=name,status='failed',error=str(e)[:1200]));print('FAIL',name,str(e)[:400],flush=True)
 def cache():
  n=100;load('<form>'+''.join(f'<label>字段{i}<input id=f{i}></label>' for i in range(n))+'</form>')
  p=plan([fact('字段'+str(i),'SYNTHETIC-'+str(i),'id-'+str(i)) for i in range(n)])
  m=p['performance']['scan'];require(m['anchorComputations']==1,'anchors rescanned per input');require(m['labelComputations']<=n+2,'labels were not memoized');require(m['rootWalks']==1,'scan repeated root traversal')
  r=apply(p);require(len(r['results'])==n and all(e['status']=='verified' for e in r['results']),'large plan did not verify')
  require(page.evaluate("Array.from(document.querySelectorAll('input')).every((e,i)=>e.value==='SYNTHETIC-'+i)"),'independent native-value check failed');checked(r)
 case('scan-local-cache-and-independent-native-readback',cache)
 def overlay():
  load('<label>姓名<input id=name></label><div style="position:fixed;inset:0;background:white;z-index:9999"></div>')
  r=apply(plan([fact('姓名','SYNTHETIC')]))
  require(page.locator('#name').input_value()=='' and r['results'][0]['status']=='needs-user','filled through overlay');checked(r)
 case('overlay-blocks-programmatic-input',overlay)
 def form_change():
  load('<form action=/first><label>姓名<input id=name></label></form>');p=plan([fact('姓名','SYNTHETIC')]);page.evaluate("document.querySelector('form').action='/different'")
  r=apply(p);require(r['results'][0]['status']=='stale' and page.locator('#name').input_value()=='','changed form target accepted')
 case('changed-form-action-invalidates-only-target-plan',form_change)
 def anchor_change():
  load('<section data-section="教育经历"><label>学校<input id=school value="SCHOOL-A"></label><label>专业<input id=major></label></section>')
  p=plan([fact('专业','SYNTHETIC','major',section='教育经历',entity='SCHOOL-A')]);page.evaluate("document.querySelector('#school').value='SCHOOL-B'");r=apply(p)
  require(r['results'][0]['status']=='stale' and page.locator('#major').input_value()=='','changed record anchor accepted')
 case('same-node-record-anchor-change-is-stale',anchor_change)
 def option_change():
  load('<label>学历<select id=degree><option value="">请选择</option><option value=x>硕士</option></select></label>');p=plan([fact('学历','硕士')]);page.evaluate("document.querySelector('option[value=x]').textContent='本科'")
  r=apply(p);require(page.locator('#degree').input_value()=='' and r['results'][0]['status']=='stale','relabelled native option was filled')
 case('same-value-relabelled-native-option-is-stale',option_change)
 def radio_change():
  load('<fieldset><legend>学历</legend><label><input type=radio name=d value=a>本科</label><label id=masters><input type=radio name=d value=b>硕士</label></fieldset>')
  p=plan([fact('学历','硕士')]);page.evaluate("document.querySelector('#masters').lastChild.textContent='不相干选项'")
  r=apply(p);require(page.locator('input:checked').count()==0 and r['results'][0]['status']=='stale','relabelled radio option accepted')
 case('changed-radio-label-is-stale',radio_change)
 def radio_added():
  load('<fieldset><legend>学历</legend><label><input type=radio name=d value=a>本科</label><label><input type=radio name=d value=b>硕士</label></fieldset>');p=plan([fact('学历','硕士')])
  page.evaluate("document.querySelector('fieldset').insertAdjacentHTML('beforeend','<label><input type=radio name=d value=c checked>本人新选择</label>')")
  r=apply(p);require(page.locator('input:checked').get_attribute('value')=='c' and r['results'][0]['status']=='stale','new selected radio was overwritten')
 case('new-radio-member-invalidates-old-group',radio_added)
 combo='<input id=combo role=combobox aria-label="学历" readonly aria-controls=menu><div id=menu role=listbox hidden></div>'
 setup="""() => {document.querySelector('#combo').onclick=()=>{document.querySelector('#menu').hidden=false;setTimeout(()=>{document.querySelector('#menu').innerHTML='<button type=button role=option>硕士</button>';document.querySelector('[role=option]').onclick=()=>document.querySelector('#combo').value='硕士'},75)}}"""
 def arrival():
  load('<aside id=clock>0</aside>'+combo,setup)
  page.evaluate("() => {let n=0;setInterval(()=>document.querySelector('#clock').textContent=String(++n),10)}")
  r=apply(plan([fact('学历','硕士')]))
  require(page.locator('#combo').input_value()=='硕士' and r['results'][0]['status']=='verified','unrelated clock invalidated target');require(r['performance']['mutationSignals']>0,'arrival did not use events');checked(r)
 case('event-arrival-with-unrelated-continuous-mutations',arrival)
 def property_fallback():
  load('<style id=hide>.later{display:none}</style>'+combo,"""() => {document.querySelector('#menu').innerHTML='<button type=button role=option class=later>硕士</button>';document.querySelector('#combo').onclick=()=>{document.querySelector('#menu').hidden=false;setTimeout(()=>document.querySelector('#hide').sheet.deleteRule(0),75)};document.querySelector('[role=option]').onclick=()=>document.querySelector('#combo').value='硕士'}""")
  r=apply(plan([fact('学历','硕士')]))
  require(page.locator('#combo').input_value()=='硕士','CSSOM-only appearance missed');require(r['performance']['fallbackPolls']>0,'fallback unused');checked(r)
 case('bounded-fallback-catches-CSSOM-only-appearance',property_fallback)
 def replacement():
  load(combo,"""() => {document.querySelector('#combo').onclick=()=>{setTimeout(()=>document.querySelector('#combo').replaceWith(document.querySelector('#combo').cloneNode(true)),10);setTimeout(()=>{document.querySelector('#menu').hidden=false;document.querySelector('#menu').innerHTML='<button type=button role=option>硕士</button>';document.querySelector('[role=option]').onclick=()=>document.querySelector('#combo').value='WRONG'},75)}}""")
  r=apply(plan([fact('学历','硕士')]))
  require(page.locator('#combo').input_value()=='' and r['results'][0]['status']=='needs-user','replaced target filled');checked(r)
 case('replacement-during-event-wait-stops-input',replacement)
 def cancellation():
  load(combo,"() => document.querySelector('#combo').onclick=()=>setTimeout(()=>__resumeFillEngine.cancel(),20)")
  r=apply(plan([fact('学历','硕士')]))
  require(page.locator('#combo').input_value()=='' and r['performance']['durationMs']<800,'cancel waited for full deadline');checked(r)
 case('cancellation-cleans-event-wait-immediately',cancellation)
 def timeout():
  load(combo);r=apply(plan([fact('学历','硕士')]))
  require(r['results'][0]['status']=='needs-user' and r['performance']['durationMs']<2400,'unbounded missing-popup wait');checked(r)
 case('timeout-cleans-observers-and-does-not-write',timeout)
 def duplicate_arrival():
  load(combo,"""() => {document.querySelector('#combo').onclick=()=>{const m=document.querySelector('#menu');m.hidden=false;m.innerHTML='<button type=button role=option>硕士</button>';m.onclick=()=>document.querySelector('#combo').value='WRONG';setTimeout(()=>m.insertAdjacentHTML('beforeend','<button type=button role=option>硕士</button>'),15)}}""")
  r=apply(plan([fact('学历','硕士')]))
  require(page.locator('#combo').input_value()=='' and r['results'][0]['status']=='needs-user','clicked incomplete popup before duplicate arrival');checked(r)
 case('brief-settle-prevents-selection-from-incomplete-popup',duplicate_arrival)
 def new_binding():
  load('<input id=combo role=combobox aria-label="学历" readonly>',"""() => {document.querySelector('#combo').onclick=()=>{document.querySelector('#combo').setAttribute('aria-controls','dynamic');document.body.insertAdjacentHTML('beforeend','<div id=dynamic role=listbox><button type=button role=option>硕士</button></div>');document.querySelector('[role=option]').onclick=()=>document.querySelector('#combo').value='硕士'}}""")
  r=apply(plan([fact('学历','硕士')]));require(r['results'][0]['status']=='verified' and page.locator('#combo').input_value()=='硕士','first popup ownership assignment was rejected');checked(r)
 case('new-popup-ownership-is-allowed-with-current-target-guard',new_binding)
 def uncertain():
  load('<label>姓名<input id=name></label><label>邮箱<input id=email></label>');p=plan([fact('姓名','SYNTHETIC'),fact('邮箱','candidate@example.invalid','email')])
  page.evaluate("""() => {const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');window.setCount=0;Object.defineProperty(HTMLInputElement.prototype,'value',{...d,set(v){window.setCount++;d.set.call(this,v);if(this.id==='name')throw Error('synthetic post-write interruption')}})}""")
  r=apply(p);require(page.locator('#name').input_value()=='SYNTHETIC','fault injection did not mutate');require(page.locator('#email').input_value()=='' and r['results'][1]['status']=='not-attempted','uncertain mutation did not stop later writes');require(page.evaluate('setCount')==1,'mutation retried');checked(r)
 case('uncertain-native-write-stops-batch-without-retry',uncertain)
 def unchanged_semantics():
  load('<label id=lab>姓名<input id=name></label><aside id=extra></aside>');p=plan([fact('姓名','SYNTHETIC')]);page.evaluate("document.querySelector('#extra').textContent='unrelated update'")
  r=apply(p);require(page.locator('#name').input_value()=='SYNTHETIC' and r['results'][0]['status']=='verified','unrelated update invalidated valid input')
 case('unrelated-update-does-not-expire-valid-plan',unchanged_semantics)
 report=dict(scope='real Chromium DOM; synthetic controls; not installed MV3 or live recruiting sites',browser=browser.version,passed=sum(x['status']=='passed' for x in results),failed=sum(x['status']=='failed' for x in results),cases=results)
 browser.close()
args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:report[k] for k in ['passed','failed']}))
raise SystemExit(bool(report['failed']))
