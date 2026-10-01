"""Production DOM tests with synthetic unmarked navigation and generic ARIA labels."""
from pathlib import Path
import json,os,shutil,subprocess
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];(ROOT/'test-results').mkdir(exist_ok=True)
BODY=(ROOT/'tests/helpers/empty-record-fixture.html').read_text(encoding='utf-8');cases=[]
BASELINE=os.environ.get('READINESS_BASELINE','')
def code(path):
 return subprocess.check_output(['git','show',BASELINE+':'+path],cwd=ROOT).decode() if BASELINE else (ROOT/path).read_text(encoding='utf-8')
def require(ok,message):
 if not ok:raise AssertionError(message)
with sync_playwright() as pw:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'):opts['executable_path']=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 browser=pw.chromium.launch(**opts)
 def run(name,fn):
  page=browser.new_page(viewport={'width':1300,'height':900})
  try:
   page.set_content(BODY)
   page.evaluate("()=>{if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')}")
   page.add_script_tag(content=bundle(ROOT/'tests/helpers/oneclick-entry.mjs'))
   for path in ['extension/engine.js','extension/vendor/repeat-plan/validate.js','extension/repeat-controller.js']:page.add_script_tag(content=code(path))
   fn(page);require(page.evaluate('submissions===0 && navAdds===0'),'unrelated action')
   cases.append({'name':name,'passed':True});print('PASS',name,flush=True)
  except Exception as e:cases.append({'name':name,'passed':False,'error':str(e)[:1600]});print('FAIL',name,str(e),flush=True)
  finally:page.close()
 def nav(page,before=False):
  page.evaluate("before=>{document.querySelector('aside').remove();const toc=document.createElement('div');toc.className='unmarkedToc';toc.style.cssText='position:fixed;right:12px;top:12px;background:white';for(const name of ['教育背景','实习经历','项目经验']){const span=document.createElement('div');span.textContent=name;toc.append(span)};document.body[before?'prepend':'append'](toc)}",before)
  t={'education':2,'work':1,'project':5}
  r=page.evaluate('t=>__resumeRepeatController.inspect(t)',t);require(len(r['candidates'])==3,str(r))
  r=page.evaluate('t=>__resumeRepeatController.expand({targets:t,reviewed:true,url:location.href,expiresAt:Date.now()+20000})',t)
  require(r['complete'] and r['added']==8,str(r));require(page.evaluate('added')==t,'wrong counts')
  r=page.evaluate('t=>__resumeRepeatController.expand({targets:t,reviewed:true,url:location.href,expiresAt:Date.now()+20000})',t)
  require(r['added']==0 and r['complete'],'repeat duplicated cards')
 run('unmarked-toc-after-form-does-not-conflict-with-real-add-section',lambda p:nav(p))
 run('unmarked-toc-before-form-does-not-conflict-with-real-add-section',lambda p:nav(p,True))
 def competing(page):
  page.locator('#education').evaluate("e=>{const c=e.cloneNode(true);c.id='secondEducation';e.after(c)}")
  r=page.evaluate('()=>__resumeRepeatController.inspect({education:2,work:0,project:0})')
  require(not any(c['domain']=='education' for c in r['candidates']),'picked one of two real regions')
  require(any(x['domain']=='education' and x['code']=='section-ambiguous' for x in r['inventory']),'missing ambiguity evidence')
 run('two-real-add-sections-still-block-instead-of-choosing-first',competing)
 def generic(page):
  page.locator('#email').evaluate("e=>{const row=document.createElement('div');row.innerHTML='<span class=field-label>邮箱</span>';const parent=e.parentElement;row.append(e);e.setAttribute('aria-label','请输入');parent.replaceWith(row)}")
  facts=[{'id':'mail','label':'邮箱','value':'synthetic@example.invalid','confirmed':True,'section':'基本信息'}]
  p=page.evaluate('async facts=>__onePlan(await __resumeFillEngine.scan(),{facts})',facts)
  require(sum(e['status']=='ready' for e in p['entries'])==1,'explicit email label not recognized')
  r=page.evaluate('p=>__resumeFillEngine.apply(p)',p);require(sum(e['status']=='verified' for e in r['results'])==1,str(r))
  require(page.locator('#email').input_value()=='synthetic@example.invalid','email not actually filled')
 run('generic-aria-prompt-yields-to-explicit-local-label',generic)
 report={'scope':'Synthetic about:blank production DOM, not installed extension or live recruiting account','baseline':BASELINE or None,'browser':browser.version,'passed':sum(c['passed'] for c in cases),'failed':sum(not c['passed'] for c in cases),'cases':cases};browser.close()
(ROOT/('test-results/readiness-browser-baseline.json' if BASELINE else 'test-results/readiness-browser.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if report['failed']:raise SystemExit(1)
