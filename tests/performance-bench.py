"""Matched, alternating LOCAL DOM benchmark; never a live-site or agent benchmark.
Requires --baseline-root pointing to a frozen 0.4.0 checkout / delivered source.
Both arms run the same fixtures and independent verifier. Every attempt is retained.
"""
from __future__ import annotations
import argparse, hashlib, importlib.metadata, json, math, os, platform, re, shutil, statistics, time
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--baseline-root',type=Path,default=ROOT/'tests/baseline/0.4.0');p.add_argument('--candidate-root',type=Path,default=ROOT);p.add_argument('--pairs',type=int,default=6);p.add_argument('--fixture',choices=['large-native-160','async-combobox-8','shadow-records-48']);p.add_argument('--output',type=Path,default=ROOT/'test-results/performance-matched.json');args=p.parse_args()
if not 1<=args.pairs<=20:p.error('--pairs must be 1..20')
args.output.parent.mkdir(parents=True,exist_ok=True)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def sources(root):
 files=['extension/engine.js','extension/core/semantics.mjs','extension/core/planner.mjs']
 if (root/'extension/core/performance.mjs').exists():files.insert(1,'extension/core/performance.mjs')
 module='\n'.join((root/f).read_text() for f in files if not f.endswith('engine.js'))
 module=re.sub(r'^import .*?;\s*$','',module,flags=re.M).replace('export {normalize};','').replace('export ','')
 module=module.replace('crypto.randomUUID()',"'bench-'+String(++globalThis.__benchId)")
 return dict(engine=(root/files[0]).read_text(),module='globalThis.__benchId=0;\n'+module+'\nglobalThis.__makePlan=makePlan;',hashes={f:digest(root/f) for f in files})
def make_fact(label,value,id,**kw):return dict(id=id,label=label,value=value,source='synthetic benchmark',confirmed=True,**kw)
def fixture(name):
 facts=[];expected=[];html='<aside id=clock>0</aside><form id=application>';setup=''
 if name=='large-native-160':
  for i in range(160):
   html+=f'<div class=form-item><label for=f{i}>字段{i}</label><input id=f{i}></div>'
   facts.append(make_fact(f'字段{i}',f'SYNTHETIC-{i}',f'fact-{i}'));expected.append(dict(id=f'f{i}',value=f'SYNTHETIC-{i}'))
 elif name=='async-combobox-8':
  for i in range(8):
   html+=f'<div class=form-item><label for=f{i}>选项{i}</label><input id=f{i} role=combobox readonly aria-controls=m{i}><div id=m{i} role=listbox hidden></div></div>'
   facts.append(make_fact(f'选项{i}',f'OPTION-{i}',f'fact-{i}'));expected.append(dict(id=f'f{i}',value=f'OPTION-{i}'))
  setup="""() => {for(let i=0;i<8;i++){const input=document.getElementById('f'+i),menu=document.getElementById('m'+i);input.onclick=()=>{menu.hidden=false;setTimeout(()=>{menu.replaceChildren();const o=document.createElement('button');o.type='button';o.setAttribute('role','option');o.textContent='OPTION-'+i;o.onclick=()=>{input.value='OPTION-'+i;menu.hidden=true};menu.append(o)},75)}}let tick=0;setInterval(()=>document.getElementById('clock').textContent=String(++tick),15)}"""
 elif name=='shadow-records-48':
  html+='<div id=host></div>';inner=''
  for group in range(6):
   entity=f'SCHOOL-{group}';inner+=f'<section data-section="教育经历" data-entity="{entity}"><label>学校<input value="{entity}"></label>'
   for i in range(8):
    id=f'f{group}-{i}';value=f'RECORD-{group}-{i}';inner+=f'<label>字段{i}<input id={id}></label>'
    facts.append(make_fact(f'字段{i}',value,id,entity=entity,section='教育经历'));expected.append(dict(id=id,value=value,shadow=True))
   inner+='</section>'
  setup='() => document.getElementById("host").attachShadow({mode:"open"}).innerHTML='+json.dumps(inner)
 else:raise ValueError(name)
 html+='<label>密码<input id=password type=password value="DO-NOT-READ"></label><label><input id=consent type=checkbox>同意声明</label><button id=submit>提交</button></form>'
 return html,facts,expected,setup
INSTRUMENT="""() => {
 const count={documentQueries:0,elementQueries:0,shadowQueries:0,clonedNodes:0,layoutReads:0};window.__counts=count;
 for(const [proto,name,key] of [[Document.prototype,'querySelectorAll','documentQueries'],[Element.prototype,'querySelectorAll','elementQueries'],[DocumentFragment.prototype,'querySelectorAll','shadowQueries'],[Node.prototype,'cloneNode','clonedNodes'],[Element.prototype,'getBoundingClientRect','layoutReads'],[Element.prototype,'getClientRects','layoutReads']]){
  const original=proto[name];proto[name]=function(...args){count[key]++;return original.apply(this,args)};
 }
 window.__submitted=0;document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.__submitted++});
}"""
RUN="""async facts => {
 const start=performance.now();const snapshot=await __resumeFillEngine.scan();const scanned=performance.now();
 const plan=__makePlan(snapshot,{facts});const matched=performance.now();const result=await __resumeFillEngine.apply(plan);const finished=performance.now();
 return {totalMs:finished-start,scanMs:scanned-start,matchMs:matched-scanned,applyMs:finished-matched,
  fields:snapshot.fields.length,ready:plan.entries.filter(e=>e.status==='ready').length,
  reportedVerified:result.results.filter(r=>r.status==='verified').length,
  forbiddenDataAbsent:!JSON.stringify(snapshot).includes('DO-NOT-READ'),
  domCalls:{...__counts},metrics:{scan:snapshot.performance||{},match:plan.performance?.match||{},apply:result.performance||{}}};
}"""
CHECK="""expected => {
 const correct=expected.every(x=>{const root=x.shadow?document.querySelector('#host').shadowRoot:document;return root.getElementById(x.id)?.value===x.value});
 return {correct,checked:expected.length,consentUntouched:!document.querySelector('#consent').checked,passwordUntouched:document.querySelector('#password').value==='DO-NOT-READ',noSubmit:window.__submitted===0};
}"""
def percentile(values,q):
 values=sorted(values);pos=(len(values)-1)*q;low=math.floor(pos);high=math.ceil(pos);return values[low]+(values[high]-values[low])*(pos-low)
fixtures=[args.fixture] if args.fixture else ['large-native-160','async-combobox-8','shadow-records-48'];arms={'baseline':sources(args.baseline_root),'candidate':sources(args.candidate_root)};attempts=[]
report={'schemaVersion':1,'createdAt':datetime.now(timezone.utc).isoformat(),'scope':'synthetic local DOM; not installed MV3, AI-agent, network or real recruiting website benchmark','timing':'one page evaluate: scan + matching + apply including readback wait; excludes browser/page setup, fixture initialization, and independent verification 100 ms after timed return','pairsPerFixture':args.pairs,'viewport':{'width':1120,'height':780},'modelsUsed':[],'externalNetworkUsed':False,'testSourceSha256':digest(Path(__file__)),'sourceHashes':{k:v['hashes'] for k,v in arms.items()},'environment':{'python':platform.python_version(),'platform':platform.platform(),'playwright':importlib.metadata.version('playwright')},'attempts':attempts}
with sync_playwright() as pw:
 opts=dict(headless=True,args=['--no-sandbox']);executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 if executable:opts['executable_path']=executable
 browser=pw.chromium.launch(**opts);report['environment']['browser']=browser.version;context=browser.new_context(viewport=report['viewport'])
 for name in fixtures:
  for pair in range(args.pairs):
   order=['baseline','candidate'] if pair%2==0 else ['candidate','baseline']
   for arm in order:
    page=context.new_page();page.set_default_timeout(5000);entry={'fixture':name,'pair':pair+1,'arm':arm,'orderInPair':order.index(arm)+1};wall=time.monotonic()
    try:
     html,facts,expected,setup=fixture(name)
     page.set_content('<style>body{margin:16px}label{display:inline-block}input{height:24px}button{min-height:24px}.form-item{margin:4px 0}</style>'+html)
     page.add_script_tag(content=arms[arm]['module']);page.add_script_tag(content=arms[arm]['engine'])
     if setup:page.evaluate(setup)
     page.evaluate(INSTRUMENT);entry.update(page.evaluate(RUN,facts));page.wait_for_timeout(100)
     entry['independent']=page.evaluate(CHECK,expected)
     entry['verified']=all(v for k,v in entry['independent'].items() if k!='checked') and entry['forbiddenDataAbsent'] and entry['reportedVerified']==len(expected)
    except Exception as e:entry.update(verified=False,error=str(e)[:1600])
    finally:
     entry['attemptWallMsIncludingSetup']=(time.monotonic()-wall)*1000;attempts.append(entry);page.close()
     print(name,pair+1,arm,'PASS' if entry['verified'] else 'FAIL',round(entry.get('totalMs',0),1),flush=True)
     args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2))
 browser.close()
summary=[]
for name in fixtures:
 row={'fixture':name};all_ok=True
 for arm in arms:
  data=[a for a in attempts if a['fixture']==name and a['arm']==arm];values=[a['totalMs'] for a in data if 'totalMs' in a];all_ok=all_ok and all(a['verified'] for a in data)
  row[arm]={'attempted':len(data),'verified':sum(a['verified'] for a in data),'medianMs':statistics.median(values) if values else None,'p95Ms':percentile(values,.95) if values else None}
  for key in ['scanMs','matchMs','applyMs']:
   samples=[a[key] for a in data if key in a];row[arm][key]=statistics.median(samples) if samples else None
  queries=[sum(a.get('domCalls',{}).get(k,0) for k in ['documentQueries','elementQueries','shadowQueries']) for a in data];row[arm]['medianQuerySelectorAllCalls']=statistics.median(queries)
 row['allAttemptsVerified']=all_ok
 row['medianReductionPercent']=(1-row['candidate']['medianMs']/row['baseline']['medianMs'])*100 if all_ok and row['baseline']['medianMs'] else None
 summary.append(row)
report['summary']=summary;report['allAttemptsVerified']=all(a['verified'] for a in attempts);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2));raise SystemExit(not report['allAttemptsVerified'])
