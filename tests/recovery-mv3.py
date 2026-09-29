"""Installed recovery flow: DOCX -> parser -> store -> button -> write -> independent readback.
Only synthetic localhost origin permission + toolbar grant are preauthorized in test copy.
No live recruiting account, no CSP changes, no page/CDP API used to perform the fill.
"""
from pathlib import Path
import contextlib, http.server, json, os, shutil, tempfile, threading, time
from playwright.sync_api import sync_playwright, expect
from helpers.recovery_fixture import make_form,SOURCE
import io,zipfile,html
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/recovery-mv3.json';OUT.parent.mkdir(exist_ok=True)
report={};cases=[];context=None
class Fixture(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  markup,_=make_form()
  self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(markup.encode())
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
  expected=make_form()[1]
  def upload():
   data=io.BytesIO()
   with zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+''.join('<w:p><w:r><w:t>'+html.escape(line)+'</w:t></w:r></w:p>' for line in SOURCE.splitlines())+'</w:body></w:document>')
   manager.locator('#importFile').set_input_files({'name':'synthetic-source-shaped.docx','mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':data.getvalue()})
   expect(manager.locator('#importPreview')).to_be_visible()
   require(manager.locator('.import-row').count()>40,'resume structure was not extracted')
   manager.locator('#commitImport').click();expect(manager.locator('#profileHealth')).to_contain_text('教育 2 段 · 项目 5 段 · 工作/实习 1 段')
   expect(manager.locator('#counts')).to_contain_text('可填 '+str(len(expected)))
   require(all(target.locator('#'+key).input_value()=='' for key in expected),'import/scan wrote without fill')
  step('real-DOCX-upload-parser-confirm-store-and-two-education-five-project-inventory',upload)
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
   click('填写简历')
   for id_,value in expected.items():expect(target.locator('#'+id_)).to_have_value(value,timeout=15000)
   end=time.monotonic()+10
   while time.monotonic()<end and '回读通过 '+str(len(expected))+' 项' not in text(assistant()):target.wait_for_timeout(80)
   require('回读通过 '+str(len(expected))+' 项' in text(assistant()),'verified count missing: '+text(assistant())[:500])
   for id_ in ['project0start','project0end','project3end','awardmonth','relative','relativecompany','relativephone','health','referral','level','listening','writing']:require(target.locator('#'+id_).input_value()=='','invented '+id_)
   require(target.locator('#language').input_value()=='英语','existing value modified');require(not target.locator('#consent').is_checked(),'consent clicked');require(target.evaluate('submissions')==0,'submitted')
   target.screenshot(path=str(ROOT/'test-results/recovery-installed.png'),full_page=False)
  step('actual-button-fills-40-source-supported-fields-and-independently-verifies-every-value',filled)
  def logs():
   r=manager.evaluate('()=>chrome.runtime.sendMessage({type:"local-logs"})');require(not r.get('error'),str(r));data=r.get('data',{})
   fills=[r for r in data.get('records',[]) if r.get('stage')=='fill'];require(fills,'fill receipt absent')
   require(fills[-1]['version']=='0.10.4' and fills[-1]['engineVersion']=='0.10.4','version lost after consuming plan')
   require(sum(f['status']=='verified' for f in fills[-1]['fields'])==len(expected),'receipt count disagrees with DOM')
   serialized=json.dumps(data,ensure_ascii=False)
   for value in ['recovery@example.invalid','示例学院甲','虚构技术有限公司','PRIVATE_SENTINEL',base]:require(value not in serialized,'private values in logs')
   require(not [u for u in network if u.startswith('http') and not u.startswith(base+'/')],'non-local networking')
  step('real-logs-record-actual-engine-version-and-readback-without-values-or-URLs',logs)
  def repair():
   manager.bring_to_front();manager.locator('[data-view=profile]').click()
   oldcount=int(manager.locator('#savedCount').inner_text())
   source='## 科研与项目经历\n### 旧片段演示记录\n项目背景：这段旧资料已经保存在本机。\n方案设计：只整理原句，核对后保存。'
   manager.locator('#importFile').set_input_files({'name':'stored-fragments.md','mimeType':'text/markdown','buffer':source.encode()})
   expect(manager.locator('.import-row')).to_have_count(2);manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text(str(oldcount+2))
   manager.locator('#repairStored').click();expect(manager.locator('.import-row')).to_have_count(1)
   expect(manager.locator('#savedCount')).to_have_text(str(oldcount+2))
   manager.screenshot(path=str(ROOT/'test-results/recovery-preview-installed.png'),full_page=False)
   manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text(str(oldcount+3))
   require(all(target.locator('#'+key).input_value()==value for key,value in expected.items()),'repair modified website without fill action')
  step('stored-fragment-repair-preview-requires-review-preserves-originals-and-does-not-write-page',repair)
except Exception as e:
 report['error']=str(e)[:1600];print('FAILED/UNAVAILABLE',str(e),flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 server.shutdown();server.server_close()
 report.update(scope='installed MV3 with actual runtime/storage/scripting/mouse and synthetic localhost source-shaped resume form; fixture permission and toolbar origin grant preauthorized; not actual SmartMore account or UI prompts',passed=sum(c['status']=='passed' for c in cases),failed=sum(c['status']=='failed' for c in cases),cases=cases)
 if report.get('error') and not report['failed']:report['unavailable']=True
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if report.get('error') or report['failed']:raise SystemExit(1)
