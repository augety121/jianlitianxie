"""Installed local-first extension on synthetic localhost. No MCP, real DOM readback.
A temporary copy receives only the fixture origin; a toolbar-origin grant is seeded.
Browser UI permission prompts and actual recruiting sites are NOT tested.
"""
from pathlib import Path
import contextlib,http.server,json,os,shutil,tempfile,threading,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/local-first-mv3.json';OUT.parent.mkdir(exist_ok=True)
NAME='INSTALLED_LOCAL_PERSON';EMAIL='installed@example.invalid';report={};results=[];context=None
class Fixture(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers()
  self.wfile.write('''<!doctype html><meta charset="utf-8"><h1>虚构申请页</h1><form id="app"><label>姓名<input id="name"></label><label>邮箱<input id="email" type="email"></label><label>性别<input id="gender"></label><label>密码<input id="password" type="password"></label><input aria-label="隐藏电话" hidden><button>提交</button></form><script>window.submissions=0;app.onsubmit=e=>{e.preventDefault();submissions++;};</script>'''.encode())
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
def require(v,m):
 if not v:raise AssertionError(m)
def step(name,fn):
 start=time.monotonic()
 try:fn();results.append({'name':name,'status':'passed','ms':(time.monotonic()-start)*1000});print('PASS',name,flush=True)
 except Exception as e:results.append({'name':name,'status':'failed','error':str(e)[:1000]});raise
try:
 with tempfile.TemporaryDirectory(prefix='local-first-mv3-') as d,sync_playwright() as p:
  tmp=Path(d);ext=tmp/'extension';shutil.copytree(ROOT/'extension',ext)
  m=json.loads((ext/'manifest.json').read_text());m['host_permissions'].append(base+'/*');(ext/'manifest.json').write_text(json.dumps(m))
  opts={'headless':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox'],'viewport':{'width':1280,'height':1000}}
  if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
  else:opts['channel']='chromium'
  requests=[];errors=[];worker=None;target=None;page=None;origin='';tab_id=None
  def launch():
   global context,worker,target,page,origin,tab_id
   context=p.chromium.launch_persistent_context(str(tmp/'browser'),**opts)
   context.on('request',lambda r:requests.append(r.url))
   worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
   origin='/'.join(worker.url.split('/')[:3])
   for old in list(context.pages):old.close()
   target=context.new_page();target.goto(base+'/form')
   tab_id=worker.evaluate('''async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id''',base+'/form')
   worker.evaluate('''async a=>chrome.storage.session.set({['workspace-target-'+a.id]:a.origin})''',{'id':tab_id,'origin':base})
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
   page.goto(origin+'/local.html?tab='+str(tab_id));expect(page.locator('#notice')).not_to_contain_text('正在读取本浏览器')
  launch();report['browser']=context.browser.version if context.browser else 'persistent Chromium'
  def import_and_scan():
   require(page.locator('input[type=password]:visible').count()==0,'mandatory password shown')
   page.locator('#importFile').set_input_files({'name':'synthetic.md','mimeType':'text/markdown','buffer':f'## 基本信息\n- **姓名**：{NAME}\n邮箱：{EMAIL}\n性别：测试选项'.encode()})
   expect(page.locator('.import-row')).to_have_count(3);page.locator('#commitImport').click();expect(page.locator('#savedCount')).to_have_text('3');expect(page.locator('.field')).to_have_count(3)
   require(page.locator('.field input:checked').count()==2,'sensitive selection not opt-in')
  step('real-MD-import-one-confirm-and-automatic-local-scan',import_and_scan)
  def fill():
   page.locator('#fillSelected').click();expect(page.locator('#result')).to_contain_text('回读通过 2')
   require(target.locator('#name').input_value()==NAME,'wrong name destination');require(target.locator('#email').input_value()==EMAIL,'wrong email destination');require(target.locator('#gender').input_value()=='','unselected sensitive field written');require(target.locator('#password').input_value()=='','password input touched');require(target.evaluate('submissions')==0,'submitted')
  step('actual-extension-fill-independent-DOM-check-no-submit',fill)
  def log_export():
   page.locator('[data-view=logs]').click();expect(page.locator('.log')).to_have_count(4);page.locator('#exportLogs').click();expect(page.locator('#logDialog')).to_be_visible();expect(page.locator('#downloadLogs')).to_be_enabled()
   with page.expect_download() as dl: page.locator('#downloadLogs').click()
   text=Path(dl.value.path()).read_text(encoding='utf-8');parsed=json.loads(text)
   for private in [NAME,EMAIL,base,'Bearer']:require(private not in text,'private content in logs')
   require(any(r['stage']=='fill' and any(f['status']=='verified' for f in r['fields']) for r in parsed['records']),'missing actual fill receipt')
   scan=next(r for r in parsed['records'] if r['stage']=='scan');filled=next(r for r in parsed['records'] if r['stage']=='fill')
   require(scan['performance']['scan']['durationMs']>=0 and scan['performance']['match']['durationMs']>=0,'real scan/match timings missing')
   require(filled['performance']['apply']['verificationWaitMs']>=490 and filled['performance']['apply']['readbackChecks']==2,'real readback metrics missing')
  step('automatic-private-content-free-receipts-from-real-fill',log_export)
  def boundaries():
   r=worker.evaluate('''async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:async()=>{let storageReadable=false;try{await chrome.storage.local.get(null);storageReadable=true;}catch{} const answer=await chrome.runtime.sendMessage({type:'local-state'});return {storageReadable,rejected:!!answer.error};}}))[0].result''',tab_id)
   require(not r['storageReadable'] and r['rejected'],'webpage read local profile')
  step('real-content-script-denied-trusted-local-storage-and-API',boundaries)
  def restart():
   context.close();launch();expect(page.locator('#savedCount')).to_have_text('3');expect(page.locator('.field')).to_have_count(3);require(page.locator('input[type=password]:visible').count()==0,'password requested after browser restart')
   stored=worker.evaluate('()=>chrome.storage.local.get("resumePlainLocalV1")');require(stored['resumePlainLocalV1']['profile']['facts'][0]['value']==NAME,'browser persistence lost')
  step('full-browser-restart-reuses-local-profile-without-password',restart)
  def invalid_input():
   page.locator('[data-view=profile]').click();page.locator('#profileSearch').fill('邮箱');page.locator('.fact button').click();page.locator('#editValue').fill('not-an-email');page.locator('#editForm button[type=submit]').click();expect(page.locator('#editDialog')).to_be_hidden();page.locator('[data-view=fill]').click();page.locator('#scan').click();expect(page.locator('.field')).to_have_count(3);page.locator('#fillSelected').click();expect(page.locator('#result')).to_contain_text('未提交')
   require(target.locator('#email').input_value()=='','invalid email was written');require(target.evaluate('submissions')==0,'submitted on invalid input');page.locator('[data-view=logs]').click();page.locator('#exportLogs').click();expect(page.locator('#logDialog')).to_be_visible();expect(page.locator('#downloadLogs')).to_be_enabled();text=page.locator('#logPreview').text_content();require('invalid' in text,'field rejection not logged');require('not-an-email' not in text,'raw value logged');page.locator('[data-close=logDialog]').click()
  step('native-rejection-is-logged-without-leaking-value-or-retrying',invalid_input)
  def screenshot():
   page.locator('[data-view=fill]').click();page.locator('#scan').click();expect(page.locator('.field')).to_have_count(3);page.locator('#showValues').uncheck();page.screenshot(path=str(ROOT/'test-results/local-first-installed.png'),full_page=True)
  step('installed-interface-renders-under-unchanged-CSP',screenshot)
  def late_label():
   target.locator('#name').fill('')
   target.evaluate("()=>{document.querySelector('#name').oninput=()=>setTimeout(()=>document.querySelector('#name').parentElement.firstChild.nodeValue='其他字段',80);}")
   page.locator('#scan').click();expect(page.locator('.field')).to_have_count(3);page.locator('#fillSelected').click();expect(page.locator('#result')).to_contain_text('回读通过 0')
   require(target.locator('#name').input_value()==NAME,'fixture must first receive value');require(target.evaluate('submissions')==0,'unexpected submit')
  step('installed-late-label-change-is-not-reported-as-success',late_label)
  def offline():
   external=[u for u in requests if not u.startswith((base+'/',origin+'/', 'data:','blob:'))]
   require(not external,'unexpected external or MCP request: '+str(external[:3]));require(not errors,str(errors))
  step('no-MCP-or-external-request-in-observed-local-flow',offline)
  report['scope']='real installed extension/storage/scripting/DOM; temporary fixture-origin permission and toolbar-origin grant; browser permission prompt, toolbar click and real recruiting sites not tested'
except Exception as e:report['error']=str(e)[:1600];print('FAILED/UNAVAILABLE',str(e),flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 server.shutdown();server.server_close();report.update(passed=sum(r['status']=='passed' for r in results),failed=sum(r['status']=='failed' for r in results),cases=results)
 if report.get('error') and not report['failed']:report['unavailable']=True
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if report.get('error') or report['failed']:raise SystemExit(1)
