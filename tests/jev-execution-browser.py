"""Actual synthetic DOM: scoped reuse, mutations, readback semantics and no replays.
Not live-platform acceptance. Tests execute the production engine and planner.
"""
from pathlib import Path
import json,os,shutil,time
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/jev-execution.json';OUT.parent.mkdir(exist_ok=True);cases=[]
def require(value,message):
    if not value:raise AssertionError(message)
def fact(label,value,id):return {'id':id,'label':label,'value':value,'source':'synthetic','confirmed':True}
with sync_playwright() as pw:
    options={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    if exe:options['executable_path']=exe
    browser=pw.chromium.launch(**options)
    def run_case(name,html,fn):
        if os.environ.get('CASE_FILTER') and not name.startswith(os.environ['CASE_FILTER']):return
        page=browser.new_page(viewport={'width':1200,'height':900});page.set_default_timeout(6000);started=time.monotonic()
        try:
            page.set_content('<style>input{min-height:24px;margin:3px}fieldset{padding:10px}label{display:block}</style><form id=application>'+html+'<button id=submit>提交</button></form>')
            page.evaluate("()=>{window.submissions=0;application.onsubmit=e=>{e.preventDefault();submissions++};}")
            page.add_script_tag(content=bundle(ROOT/'tests/helpers/compatibility-entry.mjs'));page.wait_for_function('!!globalThis.__compatPlanner')
            page.add_script_tag(path=os.environ.get('ENGINE_UNDER_TEST',str(ROOT/'extension/engine.js')));fn(page)
            require(page.evaluate('submissions')==0,'must never submit')
            cases.append({'name':name,'status':'passed','ms':(time.monotonic()-started)*1000});print('PASS',name,flush=True)
        except Exception as e:cases.append({'name':name,'status':'failed','error':str(e)[:1400]});print('FAIL',name,str(e),flush=True)
        finally:page.close()
    def plan(page,facts=None):
        facts=facts or [fact('字段甲','VALUE_A','a'),fact('字段乙','VALUE_B','b')]
        return page.evaluate('''async facts=>{const s=await __resumeFillEngine.scan();return __compatPlanner(s,{facts})}''',facts)
    def apply(page,p):
        r=page.evaluate('p=>__resumeFillEngine.apply(p)',p)
        m=r['performance'];require(m.get('observersCreated',0)==m.get('observersClosed',0),'observer leaked');return r
    two='<fieldset id=record><label id=la>字段甲<input id=a></label><label id=lb>字段乙<input id=b></label><div id=extra></div></fieldset>'
    def unchanged(page):
        facts=[fact('字段'+str(i),'VALUE_'+str(i),'x'+str(i)) for i in range(160)]
        r=apply(page,plan(page,facts));require(all(x['status']=='verified' for x in r['results']),'unmodified record did not verify')
        require(page.evaluate("Array.from(document.querySelectorAll('input')).every((e,i)=>e.value==='VALUE_'+i)"),'independent value mismatch')
        m=r['performance'];require(m.get('recordShapeQueries')==1,'unchanged record rewalked');require(m.get('recordShapeCacheHits',0)>=159,'cache unused');require(m.get('readbackChecks')==160,'readback not linear/exhaustive');require(m.get('verificationWaitMs',0)>=490,'verification wait shortened')
    run_case('stable-160-field-record-reuses-membership-and-still-verifies-every-value','<fieldset>'+''.join(f'<label>字段{i}<input></label>' for i in range(160))+'</fieldset>',unchanged)
    def mutate(page,script):
        p=plan(page);page.evaluate("()=>{"+script+";}");r=apply(page,p);require(page.locator('#b').input_value()=='','changed target received value');require(r['results'][1]['status']!='verified','changed target reported verified')
        return r
    run_case('synchronous-added-input-invalidates-cache-before-next-field',two,lambda page:mutate(page,"a.oninput=()=>extra.append(document.createElement('input'))"))
    run_case('role-membership-change-invalidates-cache-before-next-field',two,lambda page:mutate(page,"a.oninput=()=>extra.setAttribute('role','combobox')"))
    run_case('contenteditable-membership-change-invalidates-cache-before-next-field',two,lambda page:mutate(page,"a.oninput=()=>extra.setAttribute('contenteditable','plaintext-only')"))
    run_case('class-membership-change-invalidates-cache-before-next-field',two,lambda page:mutate(page,"a.oninput=()=>extra.className='x-combo'"))
    def character(page):
        r=mutate(page,"a.oninput=()=>lb.firstChild.nodeValue='其他个人信息'");require(r['results'][1]['status']=='stale','renamed field not stale')
    run_case('characterData-label-change-is-not-hidden-by-structural-reuse',two,character)
    def prop(page):
        p=plan(page);page.evaluate("()=>{a.oninput=()=>b.value='USER_ENTERED';}");r=apply(page,p);require(page.locator('#b').input_value()=='USER_ENTERED','property-only prior value overwritten');require(r['results'][1]['status']=='stale','oldValue not checked')
    run_case('property-only-value-change-does-not-need-mutation-observer',two,prop)
    def late_label(page):
        p=plan(page);page.evaluate("()=>{a.oninput=()=>setTimeout(()=>la.firstChild.nodeValue='其他字段',80);}");r=apply(page,p)
        require(page.locator('#a').input_value()=='VALUE_A','fixture not written');require(r['results'][0]['status']=='needs-user','late label change incorrectly verified')
    run_case('final-readback-rechecks-label-not-just-retained-value',two,late_label)
    def late_order(page):
        p=plan(page);page.evaluate("()=>{a.oninput=()=>setTimeout(()=>application.append(document.querySelector('#r1')),80);}");r=apply(page,p);require(all(x['status']=='needs-user' for x in r['results']),'reordered records incorrectly verified')
    run_case('final-readback-rechecks-record-position','<fieldset id=r1><label>字段甲<input id=a></label></fieldset><fieldset id=r2><label>字段乙<input id=b></label></fieldset>',late_order)
    def reject(page):
        p=plan(page);page.evaluate("()=>{a.oninput=()=>a.value='';}");r=apply(page,p);require(page.locator('#b').input_value()=='','continued after rejected write');require(r['results'][1]['status']=='not-attempted','not-attempted missing')
    run_case('synchronous-value-rejection-stops-the-remaining-batch',two,reject)
    def invalid(page):
        p=plan(page);page.evaluate("()=>{a.oninput=()=>a.setCustomValidity('synthetic rejection');}");r=apply(page,p);require(r['results'][0]['status']=='invalid' and r['results'][1]['status']=='not-attempted','invalid native write did not stop')
    run_case('synchronous-native-custom-validity-stops-the-remaining-batch',two,invalid)
    def cancel(page):
        p=plan(page);page.evaluate('()=>{a.oninput=()=>__resumeFillEngine.cancel();}');r=apply(page,p);require(page.locator('#b').input_value()=='' and r['results'][1]['status']=='cancelled','cancel lost')
    run_case('cancel-after-first-write-never-writes-second-field',two,cancel)
    def duplicate(page):
        p=plan(page);p['entries'].append(p['entries'][0]);r=page.evaluate('async p=>{try{await __resumeFillEngine.apply(p);return false}catch{return true}}',p);require(r and page.locator('#a').input_value()=='' and page.locator('#b').input_value()=='','duplicate plan performed a write')
    run_case('duplicate-plan-entries-fail-before-any-write',two,duplicate)
    def fallback(page):
        page.evaluate("Object.defineProperty(window,'scheduler',{value:undefined,configurable:true})");facts=[fact('字段'+str(i),'V'+str(i),'x'+str(i)) for i in range(16)];r=apply(page,plan(page,facts));require(all(x['status']=='verified' for x in r['results']),'fallback failed');require(r['performance'].get('timerYields',0)>=2,'fallback untested')
    run_case('older-browser-timer-fallback-preserves-batch-results','<fieldset>'+''.join(f'<label>字段{i}<input></label>' for i in range(16))+'</fieldset>',fallback)
    def shadow(page):
        page.evaluate("host.attachShadow({mode:'open'}).innerHTML='<fieldset><label>字段甲<input id=a></label><label>字段乙<input id=b></label><div id=extra></div></fieldset>'")
        p=plan(page);page.evaluate("()=>{const root=host.shadowRoot;root.querySelector('#a').oninput=()=>root.querySelector('#extra').setAttribute('role','combobox')}");r=apply(page,p);require(page.locator('#host #b').input_value()=='' and r['results'][1]['status']=='stale','shadow structural mutation missed')
    run_case('open-shadow-root-structural-changes-invalidate-cache','<div id=host></div>',shadow)
    def unrelated(page):
        p=plan(page);page.evaluate("()=>{let n=0;setInterval(()=>clock.textContent=String(n++),10)}");r=apply(page,p);require(all(x['status']=='verified' for x in r['results']),'unrelated updates stopped valid fill');require(r['performance'].get('recordShapeQueries')==1,'unrelated clock invalidated structural scope')
    run_case('unrelated-clock-does-not-expire-record-cache','<aside id=clock></aside>'+two,unrelated)
    report={'scope':'actual Chromium synthetic DOM + production engine/planner, not live ATS or installed MV3','browser':browser.version,'passed':sum(c['status']=='passed' for c in cases),'failed':sum(c['status']=='failed' for c in cases),'cases':cases}
    browser.close()
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
raise SystemExit(bool(report['failed']))
