"""Real Chromium synthetic CSS-module controls, not a logged-in vendor page.
Uses production parser/planner/record resolver/engine; independent DOM readback.
Run --engine path for baseline engine without modifying production tests.
"""
from pathlib import Path
import argparse, json, os, shutil, time
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--engine',default=str(ROOT/'extension/engine.js'));ap.add_argument('--output',default='test-results/recognition-repair.json');args=ap.parse_args()
results=[]
from helpers.recognition_fixture import STYLE, select, edu, edu_plain, SCRIPT
with sync_playwright() as p:
 opts={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 if exe:opts['executable_path']=exe
 browser=p.chromium.launch(**opts)
 def load(body):
  page=browser.new_page(viewport={'width':1360,'height':900});page.set_content('<meta charset="utf-8"><style>'+STYLE+'</style><form>'+body+'<input type="password" value="PRIVATE_SENTINEL"><button type="submit">提交</button></form>');page.evaluate('''() => {if(!crypto.randomUUID)crypto.randomUUID=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');}''');page.add_script_tag(content=bundle(ROOT/'tests/helpers/recognition-entry.mjs'));page.wait_for_function('!!globalThis.__repair');page.add_script_tag(path=args.engine);page.evaluate(SCRIPT);return page
 def check(name, fn):
  start=time.monotonic()
  try:fn();results.append({'name':name,'passed':True,'ms':round((time.monotonic()-start)*1000,2)});print('PASS',name,flush=True)
  except Exception as e:results.append({'name':name,'passed':False,'error':str(e)[:600]});print('FAIL',name,str(e),flush=True)
 def needed(v,msg):
  if not v:raise AssertionError(msg)
 def selected():
  page=load(edu());s=page.evaluate('()=>__resumeFillEngine.scan()');school=next((f for f in s['fields'] if f['label']=='学校名称'),{})
  needed(school.get('type')=='custom-select','selected school not recognized as logical select: '+str([(f['label'],f['type']) for f in s['fields']]))
  needed(school.get('value')=='示例学院甲','selected display lost; blank search is not blank field');needed('示例学院甲' in school['anchors'],'display value not available as record anchor');page.close()
 check('CSS-module-selected-display-is-not-a-field-label-or-empty-value',selected)
 def dates():
  page=load(edu());s=page.evaluate('()=>__resumeFillEngine.scan()');fs=[f for f in s['fields'] if f.get('datePart')]
  needed([(f['dateLabel'],f['datePart'],f['value']) for f in fs]==[('开始时间','year','2024'),('开始时间','month','9'),('结束时间','year','2028'),('结束时间','month','6')],'就读时间 range not recognized: '+str([(f['label'],f.get('datePart')) for f in s['fields']]))
  captured=page.evaluate('s=>__resumeFillEngine.capture({snapshotId:s.id,url:s.url,includeExisting:true})',s)
  needed(any(f['label']=='开始时间' and f['value']=='2024-09' for f in captured['fields']),'split date capture not joined');page.close()
 check('four-selected-year-month-controls-under-就读时间',dates)
 def fill():
  page=load(edu_plain());s=page.evaluate('()=>__resumeFillEngine.scan()');facts=[{'id':'s','label':'学校名称','value':'示例学院甲','section':'教育经历','entity':'硕士记录','confirmed':True,'source':'synthetic'},{'id':'m','label':'专业','value':'电子工程','section':'教育经历','entity':'硕士记录','confirmed':True,'source':'synthetic'},{'id':'other','label':'专业','value':'软件工程','section':'教育经历','entity':'本科记录','confirmed':True,'source':'synthetic'}]
  plan=page.evaluate('a=>{const b=__repair.resolveRecords(a.s,a.f).bindings;return __repair.makePlan(a.s,{facts:a.f},{},b)}',{'s':s,'f':facts});ready=[e for e in plan['entries'] if e['status']=='ready'];needed(len(ready)==1 and ready[0]['label']=='专业名称','matching did not resolve school to correct major')
  report=page.evaluate('p=>__resumeFillEngine.apply(p)',plan);needed(report['results'][0]['status']=='verified','click/write/readback failed: '+str(report))
  needed(page.locator('#major').locator('xpath=../..').locator('span').first.inner_text()=='电子工程','DOM differs');needed(page.locator('#school').locator('xpath=../..').locator('span').first.inner_text()=='示例学院甲','existing value changed');needed(page.evaluate('submissions')==0,'submitted');needed(page.locator('[type=password]').input_value()=='PRIVATE_SENTINEL','secret changed');page.close()
 check('existing-school-binds-correct-record-and-blank-major-is-written',fill)
 def menu_search():
  page=load('<label>姓名<input id="person"></label><div role="listbox"><input placeholder="搜索"><div role="option">测试候选</div></div>');s=page.evaluate('()=>__resumeFillEngine.scan()');needed(len(s['fields'])==1,'dropdown search was scanned as resume data');page.close()
 check('dropdown-search-and-options-are-not-independent-resume-fields',menu_search)
 def query():
  page=load(select('major','',label='专业名称'));page.locator('#major').fill('临时搜索');s=page.evaluate('()=>__resumeFillEngine.scan()');needed(s['fields'][0]['value']=='','uncommitted search query treated as selected value');page.close()
 check('uncommitted-select-search-query-does-not-become-a-fact',query)
 def conflict():
  page=load('<label>正常字段<input id="ordinary"></label><div class="select-help">旁边说明</div>');s=page.evaluate('()=>__resumeFillEngine.scan()');needed(s['fields'][0]['type']=='text','ordinary field promoted to select');page.close()
 check('ordinary-input-with-nearby-select-word-remains-native',conflict)
 def neighboring_label():
  page=load('<label>独立字段<input id="first"></label><input id="opaque_field_5"><label for="first">原字段标签</label><input id="another_opaque">');snap=page.evaluate('()=>__resumeFillEngine.scan()')
  by_id={f['label']:f for f in snap['fields']};needed('opaque_field_5' in by_id and 'another_opaque' in by_id,'preceding labels were stolen from neighboring controls');needed(by_id['opaque_field_5']['recognition']['labelSource']=='attribute','unknown field given false label evidence');page.close()
 check('preceding-label-owned-by-another-control-is-not-reused',neighboring_label)
 def padded_dates():
  page=load(edu(years=('2024','09','','')))
  # All choices belong to the currently opened component; no guessing absent dates.
  page.evaluate("document.querySelector('#date3').closest('.uiSelect_root_a').dataset.options=JSON.stringify(['06月','09月'])")
  snap=page.evaluate('()=>__resumeFillEngine.scan()')
  facts=[{'id':'s','label':'学校','value':'示例学院甲','section':'教育经历','entity':'一段','confirmed':True}, {'id':'end','label':'毕业时间','value':'2028-06','section':'教育经历','entity':'一段','confirmed':True}]
  plan=page.evaluate('a=>__repair.makePlan(a.s,{facts:a.f},{},__repair.resolveRecords(a.s,a.f).bindings)',{'s':snap,'f':facts})
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',plan)
  needed(sum(x['status']=='verified' for x in r['results'])==2,'zero-padded/suffixed date did not fill: '+str(r))
  needed(page.locator('#date3').locator('xpath=../..').locator('span').first.inner_text()=='06月','month option/readback mismatch');page.close()
 check('custom-date-options-accept-zero-padding-and-explicit-year-month-suffix',padded_dates)
 def disabled():
  page=load(select('major',label='专业名称'));snap=page.evaluate('()=>__resumeFillEngine.scan()')
  plan=page.evaluate('s=>__repair.makePlan(s,{facts:[{id:"m",label:"专业",value:"电子工程",confirmed:true}]})',snap)
  page.evaluate("document.querySelector('.uiSelect_root_a').setAttribute('aria-disabled','true')")
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',plan);needed(all(x['status']!='verified' for x in r['results']),'disabled wrapper written');needed(page.evaluate('window.writes||0')==0,'disabled click');page.close()
 check('disabled-logical-select-cannot-be-written-through-enabled-search-editor',disabled)
 def overlay():
  page=load(select('major',label='专业名称'));snap=page.evaluate('()=>__resumeFillEngine.scan()');plan=page.evaluate('s=>__repair.makePlan(s,{facts:[{id:"m",label:"专业",value:"电子工程",confirmed:true}]})',snap)
  page.evaluate("()=>{let d=document.createElement('div');d.style='position:fixed;inset:0;background:white;z-index:99999';document.body.append(d)}")
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',plan);needed(all(x['status']!='verified' for x in r['results']),'overlay was bypassed');needed(page.evaluate('window.writes||0')==0,'overlay click');page.close()
 check('logical-select-root-still-enforces-real-hit-testing',overlay)
 def multiple():
  page=load(select('major','电子工程',label='专业名称'));page.evaluate("()=>{const w=document.querySelector('.uiSelect_root_a'),n=document.createElement('span');n.className='uiSelect_value_a';n.textContent='软件工程';w.prepend(n)}")
  snap=page.evaluate('()=>__resumeFillEngine.scan()');needed(snap['fields'][0]['value']==['软件工程','电子工程'],'multiple display values treated as blank')
  plan=page.evaluate('s=>__repair.makePlan(s,{facts:[{id:"m",label:"专业",value:"电子工程",confirmed:true}]})',snap);needed(plan['entries'][0]['status']=='preserve','ambiguous values overwritten')
  cap=page.evaluate('s=>__resumeFillEngine.capture({snapshotId:s.id,url:s.url,includeExisting:true})',snap);needed(len(cap['fields'])==0,'multiple values coerced to a scalar fact');page.close()
 check('multiple-visible-values-are-preserved-not-assumed-empty',multiple)
 def parser():
  page=load('');src='## 教育经历\n| 学校名称 | 专业 | 学历 | 入学时间 | 毕业时间 |\n|---|---|---|---|---|\n|示例学院甲|电子工程|硕士|2024-09|2028-06|\n## 联系方式\n| 字段 | 内容 | 备注 |\n|---|---|---|\n| 邮箱 | candidate@example.invalid | 本人核对 |'
  d=page.evaluate('s=>__repair.readLocalImport(s)',src);needed(len(d['facts'])==6,'explicit tables lost fields: '+str(len(d['facts'])));needed(all(not f['confirmed'] for f in d['facts']),'import self-authorized');needed(any(f['label']=='邮箱' and f['value']=='candidate@example.invalid' for f in d['facts']),'email not parsed');page.close()
 check('explicit-record-table-and-three-column-field-table-import',parser)
 report={'scope':'synthetic CSS-module form, actual Chromium/production engine/parser/planner; not authenticated SmartMore/Moka','browser':browser.version,'engine':Path(args.engine).name,'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'cases':results};browser.close()
out=ROOT/args.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if report['failed']:raise SystemExit(1)
