"""Component strategy acceptance on an isolated about:blank rendering fixture.
Only two fictional fields; existing target/identity/visibility regressions run separately.
Not a third-party extension execution or a live ATS acceptance test.
"""
from pathlib import Path
import json,os,time
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
from helpers.component_fixture import markup,FACTS
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/component-adapters-browser.json';OUT.parent.mkdir(exist_ok=True)
cases=[]
def require(ok,message):
 if not ok:raise AssertionError(message)
with sync_playwright() as pw:
 opts={'headless':True,'chromium_sandbox':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 browser=pw.chromium.launch(**opts)
 def case(kind,existing=False,**extra):
  page=browser.new_page(viewport={'width':1100,'height':800});started=time.monotonic();name=kind+('-preserve' if existing else '-write')
  try:
   page.set_content(markup(kind,existing=existing,**extra))
   page.add_script_tag(content=bundle(ROOT/'tests/helpers/oneclick-entry.mjs'))
   page.add_script_tag(path=os.environ.get('ENGINE_UNDER_TEST',str(ROOT/'extension/engine.js')))
   observed=page.evaluate('async facts=>{const snapshot=await __resumeFillEngine.scan();return {snapshot,plan:__onePlan(snapshot,{facts})}}',FACTS)
   require(len(observed['snapshot']['fields'])==2,'logical field count changed')
   major=next(e for e in observed['plan']['entries'] if e['label']=='专业')
   require(major['status']==('preserve' if existing else 'ready'),'field did not match: '+str(major))
   result=page.evaluate('plan=>__resumeFillEngine.apply(plan)',observed['plan'])
   require(sum(x['status']=='verified' for x in result['results'])==(1 if existing else 2),'readback '+str(result))
   displayed=page.locator('.trigger').inner_text() if kind!='element' else page.locator('#editor').input_value()
   require('示例专业甲' in displayed,'actual committed value missing')
   require(page.locator('#email').input_value()=='adapter@example.invalid','independent email missing')
   require(page.evaluate('counts.chosen')==(0 if existing else 1),'unexpected number of choices')
   if existing:require(page.evaluate('counts.opened')==0,'existing select was reopened')
   if extra.get('search') and not existing:require(page.evaluate('counts.searches')==1,'search stage missing')
   second=page.evaluate('async facts=>{const snapshot=await __resumeFillEngine.scan();return __onePlan(snapshot,{facts})}',FACTS)
   require(all(e['status']=='preserve' for e in second['entries']),'second scan lost committed values')
   cases.append({'name':name,'passed':True,'ms':round((time.monotonic()-started)*1000)})
   if kind=='phoenix' and not existing:page.screenshot(path=str(ROOT/'test-results/component-phoenix.png'))
   print('PASS',name,flush=True)
  except Exception as error:
   cases.append({'name':name,'passed':False,'error':str(error)[:2200]});print('FAIL',name,str(error),flush=True)
  finally:page.close()
 for kind in ['moka','phoenix','ant','ant-legacy','element','ivu','react','atsx']:
  case(kind,search=kind in ['moka','ant','atsx'])
 case('moka',existing=True)
 case('phoenix',existing=True)
 case('element',existing=True)
 browser_version=browser.version;browser.close()
report={'scope':'Real sandboxed Chromium, original input discovery and guard checks, independently authored component renderings; not authenticated ATS or vendor plugin runtime','browser':browser_version,'passed':sum(c['passed'] for c in cases),'failed':sum(not c['passed'] for c in cases),'cases':cases}
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if report['failed']:raise SystemExit(1)
