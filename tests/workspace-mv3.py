"""Installed MV3 regression on synthetic localhost pages only.
Uses temporary profile and extension copy. Adds ONLY fixture host + webNavigation to
that copy, and seeds the toolbar's origin grant. Does not verify browser prompts,
real toolbar clicks, store packaging or real recruiting sites. No policy bypass.
Requires full Playwright Chromium, not chromium-headless-shell.
"""
from pathlib import Path
import contextlib,http.server,json,os,shutil,subprocess,tempfile,threading,time,sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/workspace-mv3.json';OUT.parent.mkdir(exist_ok=True)
NAME='MV3_SYNTHETIC_PERSON';EMAIL='mv3@example.invalid';results=[];report={};bridge=None;context=None
class Fixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path=='/form':
            body='''<!doctype html><meta charset="utf-8"><h1>虚构申请表</h1><form id="application"><label>姓名<input id="name"></label><label>邮箱<input id="email" type="email"></label><label>密码<input type="password" id="secret"></label><button>提交</button></form><iframe src="/child" title="教育信息"></iframe><script>window.submitted=0;application.onsubmit=e=>{e.preventDefault();submitted++;};</script>'''
        elif self.path=='/child':body='<!doctype html><meta charset="utf-8"><label>学校<input id="school"></label>'
        else:self.send_error(404);return
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body.encode())
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
def require(v,msg):
    if not v:raise AssertionError(msg)
def step(name,fn):
    start=time.monotonic()
    try:fn();results.append({'name':name,'status':'passed','ms':(time.monotonic()-start)*1000});print('PASS',name,flush=True)
    except Exception as e:results.append({'name':name,'status':'failed','error':str(e)[:700]});raise
try:
  with tempfile.TemporaryDirectory(prefix='resume-mv3-') as directory,sync_playwright() as p:
    root=Path(directory);ext=root/'extension';shutil.copytree(ROOT/'extension',ext)
    m=json.loads((ext/'manifest.json').read_text());m['host_permissions'].append(base+'/*');m['permissions'].append('webNavigation');(ext/'manifest.json').write_text(json.dumps(m))
    opts={'headless':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox'],'viewport':{'width':1200,'height':850}}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    else:opts['channel']='chromium'
    context=p.chromium.launch_persistent_context(str(root/'browser'),**opts)
    worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
    extension_origin='/'.join(worker.url.split('/')[:3]);report['browser']=context.browser.version if context.browser else 'persistent Chromium'
    target=context.new_page();target.goto(base+'/form');target.wait_for_selector('#name')
    tab_id=worker.evaluate('''async url=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.url===url)?.id}''',base+'/form');require(tab_id is not None,'fixture browser tab missing')
    worker.evaluate('''async args=>{await chrome.storage.session.set({['workspace-target-'+args.id]:args.origin})}''',{'id':tab_id,'origin':base})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.goto(extension_origin+'/workspace.html?tab='+str(tab_id));page.wait_for_function("document.getElementById('notice').textContent.includes('就绪')")
    def create_import():
        page.locator('#password').fill('synthetic mv3 private passphrase');page.locator('#repeatPassword').fill('synthetic mv3 private passphrase');page.locator('#unlock').click();page.wait_for_function("document.getElementById('gate').hidden")
        page.locator('[data-view=profile]').click();page.locator('#importFile').set_input_files({'name':'synthetic.txt','mimeType':'text/plain','buffer':f'姓名：{NAME}\n邮箱：{EMAIL}'.encode()});page.locator('#parse').click();page.locator('#saveImport').click();page.wait_for_function("document.getElementById('notice').textContent.includes('仍为待核实')")
        page.locator('#confirmFacts').click();page.wait_for_function("document.getElementById('factCount').textContent==='2'")
        raw=worker.evaluate('()=>chrome.storage.local.get(null)');require(NAME not in json.dumps(raw),'plaintext stored');require('synthetic mv3 private passphrase' not in json.dumps(raw),'password stored')
    step('installed-worker-create-import-confirm-and-ciphertext-storage',create_import)
    def scan_main():
        page.locator('[data-view=fill]').click();page.locator('#scan').click();page.wait_for_function("document.querySelectorAll('.field-card').length===2")
        require(page.locator('#fillSelected').is_disabled(),'review missing');page.locator('#reviewed').check();page.locator('#fillSelected').click();page.wait_for_function("document.getElementById('result').textContent.includes('回读通过 2')")
        require(target.locator('#name').input_value()==NAME,'name not retained');require(target.locator('#email').input_value()==EMAIL,'email not retained');require(target.evaluate('submitted')==0,'submitted');require(target.locator('#secret').input_value()=='','password changed')
    step('real-runtime-messaging-document-target-and-independent-DOM-readback',scan_main)
    def boundaries():
        result=worker.evaluate('''async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:async()=>{
          let accessible=false;try{await chrome.storage.local.get(null);accessible=true;}catch{}
          const reply=await chrome.runtime.sendMessage({type:'workspace-read'});return {accessible,rejected:!!reply?.error};
        }}))[0].result''',tab_id)
        require(not result['accessible'],'page content script can read trusted storage');require(result['rejected'],'page impersonated workspace')
    step('installed-content-script-cannot-read-vault-or-impersonate-workspace',boundaries)
    def children():
        page.locator('#includeFrames').check();page.locator('#scan').click();page.wait_for_function("document.querySelectorAll('.field-card').length===3")
        cards=page.locator('.field-card');child=cards.filter(has_text='嵌入文档');require(child.count()==1,'same-origin child inventory');require(child.locator('input[type=checkbox]').is_disabled(),'child write was exposed');require(target.frame_locator('iframe').locator('#school').input_value()=='','child overwritten')
    step('real-same-origin-frame-enumeration-read-only-child-plan',children)
    def start_mcp():
        global bridge
        data=root/'private';data.mkdir();bridge=subprocess.Popen(['node','bridge/server.mjs'],cwd=ROOT,env={**os.environ,'RESUME_DATA_DIR':str(data),'RESUME_BRIDGE_PORT':'19327'},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        # The process must bind its own temporary instance; never use an existing service.
        deadline=time.monotonic()+8;ready=threading.Event();logs=[]
        def consume():
            for line in bridge.stderr:
                logs.append(line)
                if 'bridge listening' in line:ready.set()
        threading.Thread(target=consume,daemon=True).start();require(ready.wait(8),'test bridge could not acquire its port')
        token=(data/'bridge-token.txt').read_text().strip();page.locator('[data-view=security]').click();page.locator('#pairToken').fill(token);page.locator('#pairBridge').click();page.wait_for_function("document.getElementById('pairStatus').textContent.includes('已配对')");page.locator('[data-view=fill]').click()
        target.locator('#name').fill('');target.locator('#email').fill('');page.locator('#includeFrames').uncheck();page.locator('#scan').click();page.wait_for_function("document.querySelectorAll('.field-card').length===2")
        page.locator('#shareConsent').check();page.locator('#share').click();page.wait_for_function("document.getElementById('notice').textContent.includes('临时分享给 MCP')")
    step('real-local-vault-to-loopback-MCP-explicit-session-grant',start_mcp)
    seq=0
    def rpc(name,arguments={}):
        global seq
        seq+=1;bridge.stdin.write(json.dumps({'jsonrpc':'2.0','id':seq,'method':'tools/call','params':{'name':name,'arguments':arguments}})+'\n');bridge.stdin.flush()
        output={}
        def read():
            try:output.update(json.loads(bridge.stdout.readline()))
            except Exception as e:output['error']=str(e)
        thread=threading.Thread(target=read,daemon=True);thread.start();thread.join(8)
        require(not thread.is_alive(),'MCP tool timeout');require('result' in output,'invalid MCP reply');r=output['result'];require(not r.get('isError'),str(r.get('content')));return json.loads(r['content'][0]['text'])
    def mcp_fill():
        current=rpc('form_context');require({f['value'] for f in current['facts']}=={NAME,EMAIL},'MCP did not receive selected facts')
        rpc('form_fill',{'planId':current['plan']['id']});target.wait_for_function('expected=>document.getElementById("name").value===expected',arg=NAME)
        target.wait_for_timeout(800);require(target.locator('#email').input_value()==EMAIL,'MCP email mismatch');require(target.evaluate('submitted')==0,'MCP submitted')
        r=rpc('form_result');require(r.get('state')=='completed','MCP result not completed')
        page.locator('[data-view=security]').click();page.locator('#revoke').click();page.wait_for_function("document.getElementById('notice').textContent.includes('已撤销')")
        files=''.join(f.read_text() for f in (root/'private').iterdir() if f.is_file());require(NAME not in files and EMAIL not in files,'temporary session persisted plaintext')
    step('stdio-MCP-to-actual-extension-fill-and-revoke-without-profile-persistence',mcp_fill)
    step('no-uncaught-extension-UI-errors',lambda:require(not errors,str(errors)))
    report['temporary_test_overrides']=['fixture loopback host permission','webNavigation preconsent','toolbar origin grant seeded for fixture tab'];report['scope']='installed MV3, real Chrome storage/messages/scripting, same-origin localhost fixture and real Node stdio/HTTP bridge; browser prompts/toolbar click and live platforms NOT tested'
except Exception as e:
    report['error']=str(e)[:1600];print('FAILED/UNAVAILABLE',str(e),flush=True)
finally:
    if context:
        with contextlib.suppress(Exception):context.close()
    if bridge:
        with contextlib.suppress(Exception):bridge.stdin.close();bridge.wait(timeout=3)
        if bridge.poll() is None:bridge.kill()
    server.shutdown();server.server_close()
    report.update(passed=sum(r['status']=='passed' for r in results),failed=sum(r['status']=='failed' for r in results),cases=results)
    if report.get('error') and not report['failed']:report['unavailable']=True
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if report.get('error') or report['failed']:raise SystemExit(1)
