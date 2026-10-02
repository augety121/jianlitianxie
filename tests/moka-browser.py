"""Independent fictional Moka-shaped controls. Never the authenticated site.
Five record domains, 18 cards, selected-display readback and repeat idempotency.
"""
from pathlib import Path
import json,os,time,traceback
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/moka-browser.json';OUT.parent.mkdir(exist_ok=True)
from helpers.moka_fixture import HTML,counts,facts,names
cases=[]
with sync_playwright() as pw:
 opts={'headless':True,'chromium_sandbox':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 browser=pw.chromium.launch(**opts);page=browser.new_page(viewport={'width':1200,'height':900})
 try:
  page.set_content(HTML)
  page.add_script_tag(content=bundle(ROOT/'tests/helpers/oneclick-entry.mjs'))
  page.add_script_tag(content=bundle(ROOT/'tests/helpers/empty-record-entry.mjs'))
  page.add_script_tag(path=os.environ.get('ENGINE_UNDER_TEST',str(ROOT/'extension/engine.js')))
  page.add_script_tag(path=str(ROOT/'extension/vendor/repeat-plan/validate.js'));page.add_script_tag(path=str(ROOT/'extension/repeat-controller.js'))
  start=time.monotonic()
  result=page.evaluate('targets=>__resumeRepeatController.expand({targets,reviewed:true,url:location.href,expiresAt:Date.now()+120000})',counts)
  assert result['complete'] and result['added']==18,result
  assert page.evaluate('added')==counts
  cases.append({'name':'five-domains-18-cards','passed':True})
  payload=page.evaluate('async facts=>{const s=await __resumeFillEngine.scan(),groups=__emptyRecordTest.entityGroups(s,facts),bindings={};const used=new Set();for(const g of groups){const c=g.candidates.find(c=>!used.has(c.entity));if(c){bindings[g.id]=c.entity;used.add(c.entity)}}const plan=__emptyRecordTest.makePlan(s,{facts},{},bindings);return {plan,snapshot:s}}',facts)
  fields=payload['snapshot']['fields'];plan=payload['plan']
  assert len({f['groupId'] for f in fields if f.get('section') in [x[0] for x in names.values()]})==18
  assert not [e for e in plan['entries'] if e['status'] not in ['ready','preserve']],plan
  result=page.evaluate('p=>__resumeFillEngine.apply(p)',plan)
  assert all(r['status'] in ['verified','preserve'] for r in result['results']),[(r,next((e for e in plan['entries'] if e['fieldId']==r['fieldId']),None)) for r in result['results'] if r['status'] not in ['verified','preserve','not-attempted']][:2]
  assert page.locator('#email').input_value()=='keep@example.invalid'
  assert page.evaluate('chosen')==35
  for domain,count in counts.items():
   assert page.locator('section[data-domain="'+domain+'"] input.identity').evaluate_all('(es)=>es.map(e=>e.value)')==['虚构'+domain+str(i) for i in range(count)]
  again=page.evaluate('targets=>__resumeRepeatController.expand({targets,reviewed:true,url:location.href,expiresAt:Date.now()+120000})',counts)
  assert again['complete'] and again['added']==0,again
  read=page.evaluate('()=>__resumeFillEngine.scan()')
  assert all(f.get('value') for f in read['fields']),read
  cases.append({'name':'bound-fill-display-readback-and-idempotency','passed':True,'ms':round((time.monotonic()-start)*1000)})
  page.screenshot(path=str(ROOT/'test-results/moka-synthetic.png'))
  page.evaluate('''()=>{const section=document.querySelector('[data-domain="award"]'),button=section.querySelector('button'),original=button.onclick;button.onclick=()=>{original();section.querySelector('.sd-Input-display-value-x').textContent='2025';}}''')
  changed=page.evaluate('targets=>__resumeRepeatController.expand({targets,reviewed:true,url:location.href,expiresAt:Date.now()+120000})',{**counts,'award':12})
  assert changed['uncertain'] and changed['attempted']==1,changed
  assert page.evaluate('added.award')==11
  cases.append({'name':'addition-stops-when-existing-selected-display-changes','passed':True})
 except Exception as e:cases.append({'name':'moka-fixture','passed':False,'error':traceback.format_exc()[-4000:]})
 finally:browser.close()
report={'scope':'synthetic Chromium DOM, not authenticated Moka or in-app MV3','cases':cases,'passed':sum(c['passed'] for c in cases),'failed':sum(not c['passed'] for c in cases)}
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=True));raise SystemExit(bool(report['failed']))
