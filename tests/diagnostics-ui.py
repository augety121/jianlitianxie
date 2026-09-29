"""Actual HTML/CSS/JS and real Node logger; Chrome messages are a test binding."""
from pathlib import Path
import json,subprocess,re,os,shutil,time
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
host=subprocess.Popen(['node','tests/helpers/diagnostics-host.mjs'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def rpc(m):
 host.stdin.write(json.dumps(m)+'\n');host.stdin.flush();line=host.stdout.readline()
 if not line:raise RuntimeError(host.stderr.read()[:300])
 return json.loads(line)
results=[]
def require(v,s):
 if not v:raise AssertionError(s)
with sync_playwright() as p:
 options={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 if exe:options['executable_path']=exe
 browser=p.chromium.launch(**options);page=browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.expose_function('__diagnosticHost',rpc)
 html=(ROOT/'extension/diagnostics.html').read_text();html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html);page.set_content(html);page.add_style_tag(path=str(ROOT/'extension/diagnostics.css'))
 page.evaluate("version=>{window.chrome={runtime:{getManifest:()=>({version}),sendMessage:m=>__diagnosticHost(m)}}}",json.loads((ROOT/'package.json').read_text())['version'])
 page.add_script_tag(content=bundle(ROOT/'extension/diagnostics.js'));page.wait_for_function("document.getElementById('notice').textContent.includes('就绪')")
 def case(name,fn):
  try:fn();require(not errors,str(errors));results.append({'name':name,'status':'passed'})
  except Exception as e:results.append({'name':name,'status':'failed','error':str(e)[:500]})
 def optin():
  require(page.locator('#captureState').inner_text()=='记录已停止','not opt in');page.locator('#start').click();page.wait_for_function("document.getElementById('captureState').textContent==='正在记录'");require(page.locator('#start').is_disabled(),'duplicate start allowed')
 case('opt-in-enables-bounded-session',optin)
 def timeline():
  rpc({'type':'fixture-run'});page.locator('#refresh').click();page.wait_for_function("Number(document.getElementById('count').textContent)>20")
  require('PRIVATE' not in page.locator('#events').inner_text(),'raw content leaked');require('INPUT_REJECTED' in page.locator('#events').inner_text(),'reason code missing');require(page.locator('.event').count()<=30,'page unbounded')
 case('production-events-and-actionable-codes',timeline)
 def filters():
  page.locator('#filter').select_option('problems');require(page.locator('.event').count()>0,'no problems');require(page.locator('.event[data-problem=false]').count()==0,'filter ignored');page.locator('#filter').select_option('all');page.locator('#trace').select_option(index=1);require(page.locator('.event').count()<10,'trace not filtered');page.locator('#trace').select_option('')
 case('trace-and-problem-filters',filters)
 def export():
  page.locator('#stop').click();page.wait_for_function("document.getElementById('captureState').textContent==='记录已停止'")
  with page.expect_download() as d:page.locator('#export').click()
  report=json.loads(Path(d.value.path()).read_text());require(report['events'],'empty export');require('PRIVATE' not in json.dumps(report),'unsafe export');require(all('at' not in e for e in report['events']),'absolute timestamp exported');require(page.locator('#jsonPreview').inner_text().startswith('{'),'preview missing')
 case('download-preview-safe-content-no-automatic-upload',export)
 def layout():
  page.locator('#previewBox').evaluate('(e)=>e.open=false');page.screenshot(path=str(OUT/'diagnostics-desktop.png'),full_page=True);page.set_viewport_size({'width':390,'height':844});require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'narrow overflow');page.screenshot(path=str(OUT/'diagnostics-mobile.png'),full_page=True)
 case('desktop-and-narrow-layout',layout)
 def clear():
  page.locator('#clear').click();page.wait_for_function("document.getElementById('count').textContent==='0'");require(page.locator('#captureState').inner_text()=='记录已停止','clear not stop');require('已清空' in page.locator('#jsonPreview').text_content(),'old preview remained: '+repr(page.locator('#jsonPreview').text_content()))
 case('clear-also-removes-export-preview',clear)
 report={'scope':'real Chromium interface, production Node logger/hooks; simulated Chrome IPC; no live website','browser':browser.version,'passed':sum(x['status']=='passed' for x in results),'failed':sum(x['status']=='failed' for x in results),'cases':results};browser.close()
host.stdin.close();host.wait(timeout=3);(OUT/'diagnostics-ui.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
if report['failed']:raise SystemExit(1)
