"""Source -> production parser -> matching -> engine -> independent expected DOM.
Synthetic fixture only; not a logged-in recruiting site or installed-extension test.
"""
from pathlib import Path
import json,os,shutil,time
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
from helpers.recovery_fixture import make_form,SOURCE
ROOT=Path(__file__).resolve().parents[1];cases=[]
def require(v,msg):
 if not v:raise AssertionError(msg)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
 def load():
  page=browser.new_page(viewport={'width':1440,'height':960});body,expected=make_form();page.set_content(body)
  page.evaluate('''()=>{if(!crypto.randomUUID)crypto.randomUUID=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('')}''')
  page.add_script_tag(content=bundle(ROOT/'tests/helpers/recovery-entry.mjs'));page.wait_for_function('!!globalThis.__recovery');page.add_script_tag(path=str(ROOT/'extension/engine.js'));return page,expected
 def case(name,fn):
  try:fn();cases.append({'name':name,'passed':True});print('PASS',name,flush=True)
  except Exception as e:cases.append({'name':name,'passed':False,'error':str(e)[:1200]});print('FAIL',name,str(e),flush=True)
 def fill():
  page,expected=load()
  plan=page.evaluate('''async ({text,names})=>{
    const facts=__recovery.parseResumeText(text).facts.map(f=>({...f,confirmed:true})),s=await __resumeFillEngine.scan();
    const bindings=__recovery.resolveRecords(s,facts).bindings;
    const ids=[...new Set(s.fields.filter(f=>/教育|项目/.test(f.section)).map(f=>f.groupId))];
    if(ids.length!==names.length)throw Error('Wrong observed record count');
    // Emulate explicit collective choices from the independently authored fixture.
    ids.forEach((id,i)=>{const matches=facts.filter(f=>['学校','项目名称'].includes(f.label)&&f.value===names[i]);
      if(matches.length!==1)throw Error('Missing explicit fixture record');bindings[id]=matches[0].entity;});
    return __recovery.makePlan(s,{facts},{},bindings);
   }''',{'text':SOURCE,'names':[expected['edu'+str(i)+'name'] for i in range(2)]+[expected['project'+str(i)+'name'] for i in range(5)]})
  ready=[e for e in plan['entries'] if e['status']=='ready'];require(len(ready)==len(expected),'wrong plan: '+str([(e['label'],e['section'],e['status'],e.get('reasonCode')) for e in plan['entries']]))
  result=page.evaluate('p=>__resumeFillEngine.apply(p)',plan);require(sum(e['status']=='verified' for e in result['results'])==len(expected),'execution: '+str(result))
  for id_,value in expected.items():require(page.locator('#'+id_).input_value()==value,'independent actual value differs: '+id_)
  for id_ in ['project0start','project0end','project3end','awardmonth','relative','relativecompany','relativephone','health','referral','level','listening','writing']:require(page.locator('#'+id_).input_value()=='','invented '+id_)
  require(page.locator('#language').input_value()=='英语','existing language overwritten');require(not page.locator('#consent').is_checked(),'consent clicked');require(page.evaluate('submissions')==0,'submitted')
  require(page.locator('[type=password]').input_value()=='PRIVATE_SENTINEL','password modified')
  page.screenshot(path=str(ROOT/'test-results/recovery-form.png'),full_page=True);cases.append({'name':'independent-field-count','passed':True,'fields':len(expected)});page.close()
 case('numbered-projects-and-split-education-actually-fill-their-own-records',fill)
 def family():
  page,_=load();s=page.evaluate('()=>__resumeFillEngine.scan()');f=[x for x in s['fields'] if x['label'] in ['姓名','工作单位','联系电话']];require(len(f)==3 and all('家庭情况' in x['section'] for x in f),'plain family heading not recognized');page.close()
 case('plain-family-heading-not-treated-as-personal-information',family)
 def stop():
  page,expected=load();page.locator('#email').evaluate("e=>e.addEventListener('input',()=>e.value='')")
  plan=page.evaluate('''async ({text,names})=>{
    const facts=__recovery.parseResumeText(text).facts.map(f=>({...f,confirmed:true})),s=await __resumeFillEngine.scan();
    const bindings=__recovery.resolveRecords(s,facts).bindings;
    const ids=[...new Set(s.fields.filter(f=>/教育|项目/.test(f.section)).map(f=>f.groupId))];
    if(ids.length!==names.length)throw Error('Wrong observed record count');
    // Emulate explicit collective choices from the independently authored fixture.
    ids.forEach((id,i)=>{const matches=facts.filter(f=>['学校','项目名称'].includes(f.label)&&f.value===names[i]);
      if(matches.length!==1)throw Error('Missing explicit fixture record');bindings[id]=matches[0].entity;});
    return __recovery.makePlan(s,{facts},{},bindings);
   }''',{'text':SOURCE,'names':[expected['edu'+str(i)+'name'] for i in range(2)]+[expected['project'+str(i)+'name'] for i in range(5)]})
  result=page.evaluate('p=>__resumeFillEngine.apply(p)',plan)
  require(result['results'][0]['status']=='needs-user','write rejection not detected: '+str(result['results'][:5]));require(all(r['status']=='not-attempted' for r in result['results'][1:]),'unsafe writes after rejection')
  require(all(page.locator('#'+id_).input_value()=='' for id_ in expected),'subsequent values written after abort');page.close()
 case('write-rejection-stops-with-not-attempted-rather-than-false-missing-or-success',stop)
 report={'scope':'real Chromium, production import/parser/resolver/engine; synthetic source and plain DOM, no authenticated website','browser':browser.version,'passed':sum(c['passed'] for c in cases),'failed':sum(not c['passed'] for c in cases),'cases':cases};browser.close()
out=ROOT/'test-results/recovery-browser.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if report['failed']:raise SystemExit(1)
