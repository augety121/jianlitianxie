"""Installed extension with production runtime, import, matching and custom-control execution.
Only synthetic localhost origin permission + toolbar grant are preauthorized in test copy.
No live recruiting account, no CSP changes, no page/CDP API used to perform the fill.
"""
from pathlib import Path
import contextlib, http.server, json, os, shutil, tempfile, threading, time
from playwright.sync_api import sync_playwright, expect
from helpers.recognition_fixture import STYLE, edu_plain, SCRIPT
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/recognition-repair-mv3.json';OUT.parent.mkdir(exist_ok=True)
report={};cases=[];context=None
class Fixture(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  body='<section data-section="基本信息"><label>邮箱<input id="email" type="email"></label><label>推荐码<input id="referral"></label></section>'+edu_plain()+'<input type="password" value="PRIVATE_SENTINEL"><input type="checkbox" id="consent"><button type="submit">提交</button>'
  html='<meta charset="utf-8"><title>虚构组件回归</title><style>'+STYLE+'</style><form>'+body+'</form><script>('+SCRIPT+')()</script>'
  self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(html.encode())
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
def require(x,msg):
 if not x:raise AssertionError(msg)
def step(name,fn):
 t=time.monotonic()
 try:fn();cases.append({'name':name,'status':'passed','ms':round((time.monotonic()-t)*1000)});print('PASS',name,flush=True)
 except Exception as e:cases.append({'name':name,'status':'failed','error':str(e)[:1000]});raise
try:
 with tempfile.TemporaryDirectory(prefix='recognition-installed-') as d,sync_playwright() as p:
  tmp=Path(d);ext=tmp/'extension';shutil.copytree(ROOT/'extension',ext)
  manifest=json.loads((ext/'manifest.json').read_text());manifest['host_permissions'].append(base+'/*');(ext/'manifest.json').write_text(json.dumps(manifest))
  opts={'headless':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox'],'viewport':{'width':1450,'height':950}}
  if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
  else:opts['channel']='chromium'
  context=p.chromium.launch_persistent_context(str(tmp/'profile'),**opts)
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
  origin='/'.join(worker.url.split('/')[:3]);report['browser']=context.browser.version if context.browser else 'Chromium'
  network=[];context.on('request',lambda r:network.append(r.url))
  target=context.new_page();target.goto(base+'/apply');tab=worker.evaluate('async u=>(await chrome.tabs.query({})).find(t=>t.url===u).id',base+'/apply')
  worker.evaluate('async a=>chrome.storage.session.set({["workspace-target-"+a.id]:a.origin})',{'id':tab,'origin':base})
  manager=context.new_page();manager.goto(origin+'/local.html?tab='+str(tab));expect(manager.locator('#notice')).not_to_contain_text('正在读取本浏览器')
  source='## 基本信息\n|字段|内容|备注|\n|---|---|---|\n|邮箱|candidate@example.invalid|本人确认|\n## 教育背景\n|学校名称|专业|学历|\n|---|---|---|\n|示例学院甲|电子工程|硕士|\n|示例学院乙|软件工程|本科|'
  def upload():
   manager.locator('#importFile').set_input_files({'name':'synthetic-multicolumn.md','mimeType':'text/markdown','buffer':source.encode()});expect(manager.locator('.import-row')).to_have_count(7)
   manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text('7')
   expect(manager.locator('.field')).to_have_count(10) # email,referral,7 education,consent
   require(target.locator('#email').input_value()=='','import/scan wrote without fill')
  step('actual-file-upload-multicolumn-table-import-and-local-persistence',upload)
  def open_page():
   manager.locator('#returnTarget').click();expect(target.locator('#resume-local-assistant')).to_be_visible();target.bring_to_front()
  step('real-workbench-attaches-on-page-button',open_page)
  cdp=context.new_cdp_session(target)
  def walk(n):
   yield n
   for k in ['children','shadowRoots']:
    for c in n.get(k,[]):yield from walk(c)
  def assistant():
   doc=cdp.send('DOM.getDocument',{'depth':-1,'pierce':True})['root'];return next(n for n in walk(doc) if dict(zip(n.get('attributes',[])[::2],n.get('attributes',[])[1::2])).get('id')=='resume-local-assistant')
  def text(n):return ''.join(c.get('nodeValue','') for c in walk(n) if c.get('nodeType')==3)
  def click(label):
   n=next(n for n in walk(assistant()) if n.get('nodeName')=='BUTTON' and text(n)==label);r=cdp.send('DOM.getBoxModel',{'backendNodeId':n['backendNodeId']})['model']['border'];target.mouse.click((r[0]+r[4])/2,(r[1]+r[5])/2)
  def filled():
   click('填写简历');expect(target.locator('#email')).to_have_value('candidate@example.invalid')
   expect(target.locator('#major').locator('xpath=../..').locator('.uiSelect_value_a')).to_have_text('电子工程')
   end=time.monotonic()+10
   while time.monotonic()<end and '回读通过 2 项' not in text(assistant()):target.wait_for_timeout(80)
   require('回读通过 2 项' in text(assistant()),'no actual verified receipt: '+text(assistant())[:700])
   require(target.locator('#major').input_value()=='','search editor should remain empty after selection')
   require(target.locator('#school').locator('xpath=../..').locator('.uiSelect_value_a').inner_text()=='示例学院甲','existing school changed')
   require(target.locator('#date0').locator('xpath=../..').locator('.uiSelect_value_a').inner_text()=='2024','existing date changed')
   require(target.locator('#referral').input_value()=='','invented missing referral');require(not target.locator('#consent').is_checked(),'consent clicked');require(target.evaluate('submissions')==0,'submitted')
   target.screenshot(path=str(ROOT/'test-results/recognition-repair-installed.png'),full_page=True)
  step('actual-mouse-one-click-fills-email-and-correct-major-retaining-selected-school-dates',filled)
  def logs():
   r=manager.evaluate('()=>chrome.runtime.sendMessage({type:"local-logs"})');require(not r.get('error'),str(r));data=r.get('data',{})
   scans=[r for r in data.get('records',[]) if r.get('stage')=='scan'];fills=[r for r in data.get('records',[]) if r.get('stage')=='fill']
   require(scans and fills,'scan/fill logs absent');require(scans[-1]['version']=='0.10.4','wrong product version')
   require(any(f.get('recognition',{}).get('selectedDisplay') for r in scans for f in r.get('fields',[])),'selected-display evidence not logged')
   serialized=json.dumps(data,ensure_ascii=False)
   for value in ['candidate@example.invalid','示例学院甲','电子工程','PRIVATE_SENTINEL',base]:require(value not in serialized,'private data in receipts')
   require(not [u for u in network if u.startswith('http') and not u.startswith(base+'/')],'non-local networking')
  step('automatic-logs-report-real-version-and-component-evidence-without-private-values',logs)
  def repeat():
   before=target.evaluate('window.writes||0');click('填写简历');target.wait_for_timeout(900)
   require(target.evaluate('window.writes||0')==before,'second click rewrote chosen values')
   require(target.locator('#email').input_value()=='candidate@example.invalid','saved email changed')
  step('repeat-click-preserves-existing-values-instead-of-replaying-writes',repeat)
except Exception as e:
 report['error']=str(e)[:1600];print('FAILED/UNAVAILABLE',str(e),flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 server.shutdown();server.server_close()
 report.update(scope='installed MV3 with actual runtime/storage/scripting/mouse and synthetic localhost CSS-module selects; fixture permission and toolbar origin grant preauthorized; not actual SmartMore account or UI prompts',passed=sum(c['status']=='passed' for c in cases),failed=sum(c['status']=='failed' for c in cases),cases=cases)
 if report.get('error') and not report['failed']:report['unavailable']=True
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if report.get('error') or report['failed']:raise SystemExit(1)
