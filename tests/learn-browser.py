"""Real DOM capture/anchor regressions plus actual review HTML/CSS/JS, synthetic data.
Capture is explicit read-on-demand; these fixtures do not represent live recruiting sites.
"""
from pathlib import Path
import json,os,re,shutil
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/learn-browser.json';OUT.parent.mkdir(exist_ok=True);cases=[]
ENGINE=Path(os.environ.get('ENGINE_UNDER_TEST',ROOT/'extension/engine.js'))
def require(v,m):
 if not v:raise AssertionError(m)
with sync_playwright() as p:
 opts={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 if exe:opts['executable_path']=exe
 browser=p.chromium.launch(**opts)
 def case(name,fn):
  page=browser.new_page(viewport={'width':1100,'height':850});page.set_default_timeout(5000)
  try:fn(page);cases.append({'name':name,'status':'passed'});print('PASS',name,flush=True)
  except Exception as e:cases.append({'name':name,'status':'failed','error':str(e)[:900]});print('FAIL',name,str(e),flush=True)
  finally:page.close()
 def init(page,markup):
  page.set_content('<meta charset="utf-8"><style>body{padding:24px;font:16px system-ui}label{display:block;margin:10px}input,textarea,select{display:block;padding:8px}</style>'+markup)
  page.add_script_tag(content=bundle(ROOT/'tests/helpers/oneclick-entry.mjs'));page.wait_for_function('!!__onePlan');page.add_script_tag(path=str(ENGINE))
 def employer(page):
  init(page,'<form><div><h2>实习经历</h2><div><label>企业名称<input id="company" value="SYNTHETIC COMPANY"></label><label>所在部门<input id="dept"></label></div></div></form>')
  facts=[{'id':'c','label':'公司名称','value':'SYNTHETIC COMPANY','section':'实习经历','entity':'实习A','confirmed':True,'source':'synthetic'},{'id':'d','label':'部门名称','value':'SYNTHETIC DEPARTMENT','section':'实习经历','entity':'实习A','confirmed':True,'source':'synthetic'}]
  data=page.evaluate('async facts=>{const s=await __resumeFillEngine.scan();return {snapshot:s,plan:__onePlan(s,{facts})}}',facts)
  require('SYNTHETIC COMPANY' in data['snapshot']['fields'][1]['anchors'],'enterprise-name anchor missing')
  require(data['plan']['entries'][1].get('value')=='SYNTHETIC DEPARTMENT','existing company did not resolve its own department')
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',data['plan']);require(page.locator('#dept').input_value()=='SYNTHETIC DEPARTMENT',str(r))
 case('enterprise-name-anchor-allows-matching-own-department-not-another-record',employer)
 markup='<form><section data-section="基本信息"><label>姓名<input id="name"></label><label>兴趣爱好<input id="hobby"></label><label>邮箱<input id="email" type="email"></label><label>已有内容<input id="old" value="OLD_VALUE"></label><label>密码<input id="secret" type="password"></label><label>验证码<input id="otp" autocomplete="one-time-code"></label><label>方向<select id="select"><option value="">请选择</option><option value="internal-3">SYNTHETIC LABEL</option></select></label></section></form>'
 def scan(page):return page.evaluate('async()=>{window.starting=await __resumeFillEngine.scan();return starting}')
 def capture(page):return page.evaluate('()=>__resumeFillEngine.capture({snapshotId:starting.id,url:location.href})')
 def changed(page):
  init(page,markup);scan(page);page.locator('#hobby').fill('SYNTHETIC HOBBY');page.locator('#email').fill('invalid');page.locator('#old').fill('NEW_OLD');page.locator('#secret').fill('SECRET_TEST');page.locator('#otp').fill('OTP_TEST');page.locator('#select').select_option('internal-3')
  r=capture(page);require({f['label'] for f in r['fields']}=={'兴趣爱好','方向'},str(r));require(next(f for f in r['fields'] if f['label']=='方向')['value']=='SYNTHETIC LABEL','saved internal option ID instead of label');require(r['omitted']==1,'invalid email should be excluded');require('SECRET_TEST' not in json.dumps(r),'secret captured')
 case('explicit-capture-only-blank-to-filled-valid-fields-and-human-option-label',changed)
 def auto(page):
  init(page,markup);s=scan(page)
  facts=[{'id':'n','label':'姓名','value':'PLUGIN_FILLED','source':'synthetic','confirmed':True}]
  plan=page.evaluate('a=>__onePlan(a.s,{facts:a.facts})',{'s':s,'facts':facts});page.evaluate('p=>__resumeFillEngine.apply(p)',plan);page.locator('#hobby').fill('USER_FILLED');r=capture(page)
  require(len(r['fields'])==1 and r['fields'][0]['value']=='USER_FILLED',str(r));require(page.locator('#name').input_value()=='PLUGIN_FILLED','capture modified page')
 case('plugin-attempted-fields-excluded-and-capture-does-not-write',auto)
 def reuse_on_next_form(page):
  init(page,markup);page.add_script_tag(content=bundle(ROOT/'tests/helpers/learn-entry.mjs'));page.wait_for_function('!!__mergeLearned')
  facts=[{'id':'n','label':'姓名','value':'KNOWN_USER','section':'基本信息','source':'synthetic','confirmed':True}]
  page.evaluate('async facts=>{window.reusableProfile={facts};const s=await __resumeFillEngine.scan();window.starting=s;await __resumeFillEngine.apply(__onePlan(s,reusableProfile));}',facts)
  require(page.locator('#hobby').input_value()=='','missing fact should be skipped')
  page.locator('#hobby').fill('MANUALLY_ADDED_HOBBY')
  captured=capture(page);require(len(captured['fields'])==1,'capture must only propose newly added hobby')
  learned=page.evaluate("captured=>{const p=__learningPreview(captured,reusableProfile,'https://jobs.example.invalid');const r=__mergeLearned(reusableProfile,p.items,[{id:p.items[0].id}],'https://jobs.example.invalid',true);reusableProfile={facts:r.facts};return {added:r.added.length};}",captured)
  require(learned['added']==1,'reviewed explicit reusable supplement not added')
  # A new visible form in the same fixture; not a claim of installed-browser persistence.
  page.locator('#name').fill('');page.locator('#hobby').fill('')
  report=page.evaluate('async()=>{const s=await __resumeFillEngine.scan();return __resumeFillEngine.apply(__onePlan(s,reusableProfile));}')
  require(page.locator('#hobby').input_value()=='MANUALLY_ADDED_HOBBY','subsequent form did not reuse manually added fact')
  require(page.locator('#name').input_value()=='KNOWN_USER','known name not retained in next plan')
  require(sum(x['status']=='verified' for x in report['results'])==2,str(report))
 case('real-DOM-skip-manual-entry-review-merge-next-form-reuses-without-reimport',reuse_on_next_form)
 def stale(page):
  init(page,markup);scan(page);page.locator('#hobby').fill('LATE');page.locator('#hobby').evaluate("e=>e.previousSibling.textContent='其他字段'");r=capture(page);require(r['fields']==[],'renamed field captured')
 case('renamed-label-after-scan-is-not-saved',stale)
 def replaced(page):
  init(page,markup);scan(page);page.locator('#hobby').evaluate("e=>{const n=e.cloneNode();n.value='NEW_NODE';e.replaceWith(n)}");require(capture(page)['fields']==[],'replacement node captured')
 case('replaced-node-is-not-captured-under-old-identity',replaced)
 def hidden(page):
  init(page,markup);scan(page);page.locator('#hobby').fill('HIDDEN');page.locator('#hobby').evaluate('e=>e.hidden=true');require(capture(page)['fields']==[],'hidden value captured')
 case('hidden-new-value-is-not-captured',hidden)
 def expired(page):
  init(page,markup);scan(page);page.locator('#hobby').fill('USER_FILLED');page.evaluate('()=>__resumeFillEngine.cancel()')
  require(page.evaluate("()=>{try{__resumeFillEngine.capture({snapshotId:starting.id,url:location.href});return false}catch{return true}}"),'cancelled capture accepted')
 case('cancel-invalidates-capture-without-monitoring-input',expired)
 def popup(page,width):
  html=(ROOT/'extension/learn-review.html').read_text();html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html);html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
  page.set_viewport_size({'width':width,'height':650});page.set_content(html);page.add_style_tag(path=str(ROOT/'extension/learn-review.css'))
  # CSP is intact in shipped page; this about:blank test loads scripts programmatically.
  page.evaluate("""()=>{window.calls=[];window.chrome={runtime:{sendMessage:async m=>{calls.push(m);if(m.type==='local-learn-read')return {data:{items:[{id:'h',label:'兴趣爱好',section:'基本信息',value:'SYNTHETIC LEARNED',entity:'',state:'new',recordRequired:false,sensitive:false},{id:'s',label:'家庭地址',section:'基本信息',value:'SENSITIVE_TEST',state:'new',recordRequired:false,sensitive:true}],omitted:0,origin:'https://jobs.example.invalid'}};return {data:{saved:1}};}}}}""")
  page.add_script_tag(content=bundle(ROOT/'extension/learn-review.mjs'));page.wait_for_selector('.item')
  require(page.locator('.item input[type=checkbox]:checked').count()==1,'sensitive default checked')
  require(page.locator('#save').bounding_box()['y']<650,'save offscreen');require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'horizontal overflow')
  require(not page.evaluate("calls.some(x=>x.type==='local-learn-save')"),'saved without review')
  page.screenshot(path=str(ROOT/f'test-results/learn-review-{width}.png'),full_page=True)
  page.locator('#save').click();page.wait_for_function("document.getElementById('notice').textContent.includes('已新增保存 1')")
  require(page.evaluate("calls.filter(x=>x.type==='local-learn-save').length===1 && calls.find(x=>x.type==='local-learn-save').selections.length===1"),'wrong confirmation scope')
  require(page.locator('.item').count()==0,'private preview not cleared')
 case('actual-review-UI-570px-explicit-save-private-preview-cleared',lambda pg:popup(pg,570))
 case('actual-review-UI-390px-sticky-confirmation-no-overflow',lambda pg:popup(pg,390))
 report={'scope':'real browser DOM/engine plus actual learning review UI; UI messages simulated, not installed acceptance','browser':browser.version,'passed':sum(c['status']=='passed' for c in cases),'failed':sum(c['status']=='failed' for c in cases),'cases':cases};browser.close()
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');raise SystemExit(bool(report['failed']))
