"""Real Chromium UI; real Node worker/vault; mocked Chrome IPC, bridge and executor.
Stateful synthetic workflow, not installed-extension acceptance or a live site test.
"""
from pathlib import Path
import os,shutil,subprocess,json,time,re,sys,base64
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/workspace-ui.json';OUT.parent.mkdir(exist_ok=True)
host=subprocess.Popen(['node','tests/helpers/workspace-host.mjs'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
def rpc(data):
    host.stdin.write(json.dumps(data)+'\n');host.stdin.flush()
    line=host.stdout.readline()
    if not line: raise RuntimeError('workspace host exited: '+host.stderr.read()[:500])
    return json.loads(line)
def require(v,msg):
    if not v:raise AssertionError(msg)
results=[];errors=[];backup=None
with sync_playwright() as pw:
    options={'headless':True,'args':['--no-sandbox']}
    exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    if exe:options['executable_path']=exe
    browser=pw.chromium.launch(**options);ctx=browser.new_context(viewport={'width':1320,'height':900},accept_downloads=True);page=ctx.new_page();page.set_default_timeout(7000)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.expose_function('__workspaceHost',rpc)
    html=(ROOT/'extension/workspace.html').read_text();html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html)
    html=html.replace('icons/icon48.png','data:image/png;base64,'+base64.b64encode((ROOT/'extension/icons/icon48.png').read_bytes()).decode())
    page.set_content(html);page.add_style_tag(path=str(ROOT/'extension/workspace.css'))
    page.evaluate('''() => {
      if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};
      window.chrome={runtime:{sendMessage:m=>__workspaceHost({...m,...(m.tabId===0?{tabId:11}:{})})},permissions:{request:async()=>true}};
    }''')
    page.add_script_tag(content=bundle(ROOT/'extension/workspace.js'));page.wait_for_function("document.getElementById('notice').textContent.includes('就绪')")
    def case(name,fn):
        begin=time.monotonic()
        try:
            fn();require(not errors,'uncaught '+str(errors));require(not page.evaluate('globalThis.__bundleError'),'module initialization failed')
            results.append({'name':name,'status':'passed','ms':(time.monotonic()-begin)*1000});print('PASS',name,flush=True)
        except Exception as e:
            results.append({'name':name,'status':'failed','error':str(e)[:700]});print('FAIL',name,str(e),flush=True)
    def select_view(name):page.locator('[data-view='+name+']').click()
    def add(label,value):
        select_view('profile');page.locator('#add').click();page.locator('#factLabel').fill(label);page.locator('#factValue').fill(value);page.locator('#factConfirmed').check();page.locator('#factForm button[type=submit]').click();page.wait_for_function("!document.getElementById('editor').open")
    def scan():
        select_view('fill');page.locator('#scan').click();page.wait_for_function("document.querySelectorAll('.field-card').length===3")
    def create():
        page.locator('#password').fill('synthetic workspace passphrase');page.locator('#repeatPassword').fill('synthetic workspace passphrase');page.locator('#unlock').click();page.wait_for_function("document.getElementById('gate').hidden")
        require(page.locator('#password').input_value()=='','password remains in input')
    case('create-vault-using-real-node-webcrypto',create)
    def editing():
        add('姓名','UI_SYNTHETIC_PERSON');add('邮箱','ui@example.invalid');add('性别','测试选项');page.locator('#allFacts').click()
        data=rpc({'type':'inspect'})['data'];require('UI_SYNTHETIC_PERSON' not in json.dumps(data['storage']),'plaintext persisted');require(len(data['calls'])==0,'local edit contacted bridge')
    case('edit-confirm-and-ciphertext-only-persistence',editing)
    def preview():
        scan();require(page.locator('#fillSelected').is_disabled(),'missing review gate')
        require('UI_SYNTHETIC_PERSON' not in page.locator('#entries').inner_text(),'values unmasked by default')
        require('未计算' in page.locator('#coverage').inner_text(),'omissions misleadingly shown as zero')
        require(page.locator('.field-card button').count()==0,'unsupported locate exposed')
        require(page.locator('.field-card input:checked').count()==2,'sensitive field auto-selected')
    case('preview-masks-values-sensitive-opt-in-and-honest-coverage',preview)
    def reveal_map():
        page.locator('#reveal').check();require('UI_SYNTHETIC_PERSON' in page.locator('#entries').inner_text(),'reveal failed')
        name=page.locator('select[aria-label="姓名 资料映射"]');name.select_option('');page.wait_for_function("document.getElementById('notice').textContent.includes('映射已更新')")
        require(page.locator('#fillSelected').is_disabled(),'mapping did not invalidate review')
    case('explicit-reveal-remapping-requires-fresh-review',reveal_map)
    def write():
        page.locator('.field-card input[type=checkbox]').nth(1).uncheck();page.locator('#reviewed').check();page.locator('#fillSelected').click();page.wait_for_function("document.getElementById('result').textContent.includes('回读通过 1')")
        data=rpc({'type':'inspect'})['data'];require(data['values']=={'f':'UI_SYNTHETIC_PERSON'},'unselected values written');require(not any(c.get('route') for c in data['calls']),'local fill contacted bridge')
        require(page.locator('#fillSelected').is_disabled(),'plan replay possible')
    case('only-selected-field-written-once-no-bridge',write)
    def imports():
        select_view('profile');page.locator('#importText').fill('技能：SYNTHETIC_DRAFT');page.locator('#parse').click();page.locator('#saveImport').click();page.wait_for_function("document.getElementById('notice').textContent.includes('仍为待核实')")
        require(page.locator('#factList').inner_text().count('待核实')>=1,'import auto-confirmed');select_view('fill');page.locator('#scan').click();page.wait_for_function("document.getElementById('notice').textContent.includes('待核实')")
        select_view('profile');page.locator('#allFacts').click()
    case('text-import-remains-draft-until-user-verifies',imports)
    def layout():
        rpc({'type':'reset-page'});scan();page.locator('#reveal').uncheck();page.screenshot(path=str(ROOT/'test-results/workspace-desktop-0.4.3.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844});require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'mobile horizontal overflow');page.screenshot(path=str(ROOT/'test-results/workspace-mobile-0.4.3.png'),full_page=True);page.set_viewport_size({'width':1320,'height':900})
    case('desktop-and-390px-layout-no-root-overflow',layout)
    def export():
        global backup
        select_view('security')
        with page.expect_download() as d:page.locator('#backup').click()
        backup=json.loads(Path(d.value.path()).read_text());require('UI_SYNTHETIC_PERSON' not in json.dumps(backup),'backup plaintext');require(backup['kind']=='jianlitianxie-encrypted-vault','wrong backup')
    case('export-authenticated-ciphertext-backup',export)
    def locking():
        page.locator('#lock').click();page.wait_for_function("!document.getElementById('gate').hidden")
        require(page.locator('#factList').inner_text()=='','facts not cleared');require(page.locator('#result').inner_text()=='','result not cleared');require(page.locator('#importText').input_value()=='','draft not cleared')
        page.locator('#password').fill('wrong synthetic passphrase');page.locator('#unlock').click();page.wait_for_function("document.getElementById('notice').textContent.includes('口令错误')")
        page.locator('#password').fill('synthetic workspace passphrase');page.locator('#unlock').click();page.wait_for_function("document.getElementById('gate').hidden")
    case('lock-clears-private-ui-and-wrong-password-does-not-open',locking)
    def sharing():
        select_view('profile');page.locator('#allFacts').click();rpc({'type':'reset-page'});scan();page.locator('#share').click();page.wait_for_function("document.getElementById('notice').textContent.includes('勾选本次')")
        require(not any(c.get('route')=='/session' for c in rpc({'type':'inspect'})['data']['calls']),'shared before consent')
        page.locator('#shareConsent').check();page.locator('#share').click();page.wait_for_function("document.getElementById('notice').textContent.includes('临时分享给 MCP')")
        require('MCP 模式' in page.locator('#modeBadge').inner_text(),'mode not switched');require(page.locator('#entries').inner_text()=='','private plan retained after share')
        grants=[c for c in rpc({'type':'inspect'})['data']['calls'] if c.get('route')=='/session'];require(len(grants)==1 and len(grants[0]['data']['facts'])==3,'wrong grant scope')
    case('MCP-explicit-consent-selected-facts-and-local-lock',sharing)
    def revoke():
        select_view('security');page.locator('#revoke').click();page.wait_for_function("document.getElementById('notice').textContent.includes('已撤销')")
        require(any(c.get('route','').startswith('/session/end') for c in rpc({'type':'inspect'})['data']['calls']),'revoke not sent');page.locator('#localMode').click();page.wait_for_function("document.getElementById('modeBadge').textContent.includes('本地处理')")
    case('explicit-revoke-and-return-to-local',revoke)
    report={'scope':'real Chromium HTML/CSS/JS; real Node worker/vault/controller; mocked Chrome IPC, page executor and MCP bridge; stateful synthetic workflow','browser':browser.version,'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'cases':results}
    # Stop the mock IPC before closing its binding target; runtime teardown is covered separately.
    page.evaluate("async()=>{await chrome.runtime.sendMessage({type:'workspace-lock'});chrome.runtime.sendMessage=async()=>({data:{locked:true}})}")
    ctx.close();browser.close()
host.stdin.close();host.wait(timeout=5);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if report['failed']:raise SystemExit(1)
