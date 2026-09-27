"""Installed page-button workflow on fictional localhost, normal extension CSP unchanged.
Only the test origin is pre-granted; toolbar origin authorization is seeded. Closed
Shadow DOM is inspected via test CDP, but buttons are activated with actual mouse input.
Not a live ATS test, real toolbar click or permission-prompt acceptance test.
"""
from pathlib import Path
import contextlib,http.server,json,os,shutil,tempfile,threading,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/page-entry-mv3.json';OUT.parent.mkdir(exist_ok=True)
NAME='FICTIONAL_PAGE_USER';EMAIL='fictional@example.invalid';context=None;report={};cases=[]
class Fixture(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/unmatched':
   fields=''.join(f'<label>已有字段{i}<input value="测试内容"></label>' for i in range(13))+''.join(f'<label>未知字段{i}<input></label>' for i in range(6))+'<label>附件<input type="file"></label>'
  else:fields='<label>姓名<input id="name" autocomplete="name"></label><label>邮箱<input type="email" id="email"></label><label>性别<input id="gender"></label><label>密码<input type="password" id="secret"></label>'
  body=f'''<!doctype html><meta charset="utf-8"><title>虚构申请页 · 测试</title><style>body{{font:16px system-ui;padding:40px;background:#f5f7fa}}form{{background:white;padding:24px;width:560px;max-width:70%;border-radius:14px}}label{{display:block;margin:12px 0}}input{{display:block;padding:10px;max-width:90%}}h1{{font-size:25px}}</style><h1>虚构招聘申请表</h1><p>仅用于安装后的填写回归，不发送申请。</p><form id="app">{fields}<button>提交（测试）</button></form><script>window.submitted=0;app.onsubmit=e=>{{e.preventDefault();submitted++;}};</script>'''
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body.encode())
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
def require(x,m):
 if not x:raise AssertionError(m)
def step(name,fn):
 start=time.monotonic()
 try:fn();cases.append({'name':name,'status':'passed','ms':round((time.monotonic()-start)*1000)});print('PASS',name,flush=True)
 except Exception as e:cases.append({'name':name,'status':'failed','error':str(e)[:1000]});raise
try:
 with tempfile.TemporaryDirectory(prefix='page-entry-test-') as d,sync_playwright() as p:
  tmp=Path(d);ext=tmp/'extension';shutil.copytree(ROOT/'extension',ext)
  manifest=json.loads((ext/'manifest.json').read_text());manifest['host_permissions'].append(base+'/*');(ext/'manifest.json').write_text(json.dumps(manifest))
  opts={'headless':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox'],'viewport':{'width':1280,'height':900}}
  if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
  else:opts['channel']='chromium'
  context=p.chromium.launch_persistent_context(str(tmp/'profile'),**opts);requests=[];context.on('request',lambda r:requests.append(r.url))
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
  origin='/'.join(worker.url.split('/')[:3]);report['browser']=context.browser.version if context.browser else 'Chromium'
  target=context.new_page();target.goto(base+'/apply')
  tab=worker.evaluate('async u=>(await chrome.tabs.query({})).find(t=>t.url===u).id',base+'/apply')
  worker.evaluate('async a=>chrome.storage.session.set({["workspace-target-"+a.id]:a.origin})',{'id':tab,'origin':base})
  manager=context.new_page();manager.goto(origin+'/local.html?tab='+str(tab));expect(manager.locator('#notice')).not_to_contain_text('正在读取本浏览器')
  source=f'## 一、基本信息\n| 字段 | 信息 |\n| --- | --- |\n| 姓名 | {NAME} |\n| 邮箱 | {EMAIL} |\n| 性别 | 测试项 |'
  def import_profile():
   manager.locator('#importFile').set_input_files({'name':'test.md','mimeType':'text/markdown','buffer':source.encode()});expect(manager.locator('.import-row')).to_have_count(3)
   manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text('3');expect(manager.locator('.field')).to_have_count(3)
   expect(manager.locator('#targetSummary')).to_contain_text('虚构申请页')
  step('real-common-MD-table-import-preserves-identity-fields-and-target-title',import_profile)
  def duplicate():
   manager.locator('[data-view=profile]').click();manager.locator('#importFile').set_input_files({'name':'again.md','mimeType':'text/markdown','buffer':source.encode()})
   expect(manager.locator('#importNextMessage')).to_contain_text('已保存');require(manager.locator('#commitImport').is_disabled(),'duplicate import can rewrite data')
   manager.locator('#continueSaved').click();expect(manager.locator('[data-section=fill]')).to_be_visible()
  step('all-duplicate-import-has-working-continue-to-fill-button',duplicate)
  def return_to_page():
   manager.locator('#returnTarget').click();expect(target.locator('#resume-local-assistant')).to_be_visible()
   require(target.evaluate('document.getElementById("resume-local-assistant").shadowRoot===null'),'closed shadow root changed')
  step('return-target-actually-attaches-on-page-entry-without-new-permissions',return_to_page)
  cdp=context.new_cdp_session(target)
  def walk(n):
   yield n
   for key in ['children','shadowRoots']:
    for child in n.get(key,[]):yield from walk(child)
  def dom():return cdp.send('DOM.getDocument',{'depth':-1,'pierce':True})['root']
  def assistant():
   return next(n for n in walk(dom()) if dict(zip(n.get('attributes',[])[::2],n.get('attributes',[])[1::2])).get('id')=='resume-local-assistant')
  def text(n):return ''.join(x.get('nodeValue','') for x in walk(n) if x.get('nodeType')==3)
  def wait_text(expected,timeout=8):
   until=time.monotonic()+timeout
   while time.monotonic()<until:
    if expected in text(assistant()):return
    target.wait_for_timeout(80)
   raise AssertionError('assistant missing expected text: '+expected+'; '+text(assistant())[:600])
  def button(name):return next(n for n in walk(assistant()) if n.get('nodeName')=='BUTTON' and text(n)==name)
  def click(name):
   b=button(name);box=cdp.send('DOM.getBoxModel',{'backendNodeId':b['backendNodeId']})['model']['border'];target.mouse.click((box[0]+box[4])/2,(box[1]+box[5])/2)
  def scan():
   wait_text('点击“扫描本页”');click('扫描本页');wait_text('确认填写上面 2 项')
   visible=text(assistant());require(NAME not in visible and EMAIL not in visible,'page UI received private values before authorization')
   require(target.locator('#name').input_value()=='','scan wrote data')
  step('actual-mouse-scan-produces-ordinary-field-list-without-profile-values',scan)
  def untrusted_click():
   b=button('确认填写上面 2 项');obj=cdp.send('DOM.resolveNode',{'backendNodeId':b['backendNodeId']})['object']['objectId']
   cdp.send('Runtime.callFunctionOn',{'objectId':obj,'functionDeclaration':'function(){this.click()}'});target.wait_for_timeout(150)
   require(target.locator('#name').input_value()=='','synthetic DOM click triggered fill')
  step('synthetic-DOM-click-cannot-authorize-filling',untrusted_click)
  def fill():
   click('确认填写上面 2 项');wait_text('回读通过 2 项')
   require(target.locator('#name').input_value()==NAME,'name value missing');require(target.locator('#email').input_value()==EMAIL,'email value missing')
   require(target.locator('#gender').input_value()=='' and target.locator('#secret').input_value()=='','unselected sensitive data written');require(target.evaluate('submitted')==0,'form submitted')
   target.screenshot(path=str(ROOT/'test-results/page-entry-installed.png'))
  step('actual-in-page-confirmation-fills-correct-fields-once-without-submit',fill)
  def no_match():
   target.goto(base+'/unmatched');expect(target.locator('#resume-local-assistant')).to_be_visible();wait_text('点击“扫描本页”');click('扫描本页');wait_text('未匹配 6')
   t=text(assistant());require('保留 13' in t and '人工 1' in t and '没有可直接填写' in t,'zero-match reason hidden')
   require(target.evaluate('submitted')==0,'zero-match submitted')
  step('same-origin-navigation-reattaches-and-zero-ready-is-explained-not-retried',no_match)
  def logs():
   data=worker.evaluate('()=>chrome.storage.local.get("resumeLocalReceiptsV1")');raw=json.dumps(data,ensure_ascii=False)
   require(NAME not in raw and EMAIL not in raw and base not in raw,'private data in receipts')
   rows=data['resumeLocalReceiptsV1'];require(any(r['stage']=='fill' and any(f['status']=='verified' for f in r['fields']) for r in rows),'page fill missing log')
   require(any(f.get('code')=='no-label-match' for r in rows for f in r['fields']),'fixed unmatched code not logged')
  step('page-fill-and-unmatched-receipts-record-no-profile-or-URL',logs)
  def offline():require(not [u for u in requests if not u.startswith((base+'/',origin+'/','data:','blob:'))],'external or MCP request observed')
  step('local-page-workflow-makes-no-observed-external-or-MCP-requests',offline)
  report['scope']='Real installed extension/runtime/storage/scripting/closed Shadow DOM; test CDP inspects elements and sends mouse input; only localhost permission and initial toolbar grant seeded. No real ATS, toolbar click or permission-prompt test.'
except Exception as e:report['error']=str(e)[:1600];print('FAILED/UNAVAILABLE',str(e),flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 server.shutdown();server.server_close();report.update(passed=sum(c['status']=='passed' for c in cases),failed=sum(c['status']=='failed' for c in cases),cases=cases)
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if report.get('error') or report['failed']:raise SystemExit(1)
