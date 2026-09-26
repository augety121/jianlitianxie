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
    html=(ROOT/'extension/workspace.html').read_text(encoding='utf-8');html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html)
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
    def scan(expected=3):
        select_view('fill');page.locator('#scan').click();page.wait_for_function("n=>document.querySelectorAll('.field-card').length===n",arg=expected)
    def responsive_capture(name):
        page.screenshot(path=str(ROOT/('test-results/'+name+'-desktop.png')),full_page=True)
        try:
            page.set_viewport_size({'width':390,'height':844});require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),name+' mobile horizontal overflow')
            page.screenshot(path=str(ROOT/('test-results/'+name+'-390px.png')),full_page=True)
        finally:page.set_viewport_size({'width':1320,'height':900})
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
        page.locator('.coverage-details summary').click()
        require('未计算' in page.locator('#coverage').inner_text(),'omissions misleadingly shown as zero')
        require(page.locator('.field-card button[aria-label^="定位 " ]').count()==3,'locate missing for scanned fields')
        page.locator('.field-card button').first.click();page.wait_for_function("document.getElementById('notice').textContent.includes('已在网页高亮')")
        data=rpc({'type':'inspect'})['data'];require(any(c.get('action')=='locate' for c in data['calls']),'locate did not reach document broker');require(data['values']=={},'locate changed field values')
        require(page.locator('.field-card input:checked').count()==2,'sensitive field auto-selected')
    case('preview-masks-values-sensitive-opt-in-and-honest-coverage',preview)
    def reveal_map():
        page.locator('#reveal').check();require('UI_SYNTHETIC_PERSON' in page.locator('#entries').inner_text(),'reveal failed')
        page.locator('button[aria-label="姓名 资料映射"]').click();require(page.locator('#mappingDialog').is_visible(),'lazy mapping dialog missing');require('UI_SYNTHETIC_PERSON' not in page.locator('#mappingChoices').inner_text(),'candidate value not masked');page.locator('#mappingChoices button').first.click();page.wait_for_function("document.getElementById('notice').textContent.includes('映射已更新')")
        require(page.locator('#fillSelected').is_disabled(),'mapping did not invalidate review')
    case('explicit-reveal-remapping-requires-fresh-review',reveal_map)
    def write():
        page.locator('.field-card input[type=checkbox]').nth(1).uncheck();page.locator('#reviewed').check();page.locator('#fillSelected').click();page.wait_for_function("document.getElementById('result').textContent.includes('回读通过 1')")
        data=rpc({'type':'inspect'})['data'];require(data['values']=={'f':'UI_SYNTHETIC_PERSON'},'unselected values written');require(not any(c.get('route') for c in data['calls']),'local fill contacted bridge')
        require(page.locator('#fillSelected').is_disabled(),'plan replay possible')
    case('only-selected-field-written-once-no-bridge',write)
    def imports():
        select_view('profile');page.locator('#importText').fill('技能：SYNTHETIC_DRAFT');page.locator('#parse').click();page.locator('#saveImport').click();page.wait_for_function("document.getElementById('notice').textContent.includes('已保存 1 条')")
        require(page.locator('#factList').inner_text().count('待核实')>=1,'import auto-confirmed');select_view('fill');page.locator('#scan').click();page.wait_for_function("document.getElementById('notice').textContent.includes('待核实')")
        select_view('profile');page.locator('#allFacts').click()
    case('text-import-remains-draft-until-user-verifies',imports)
    def import_differences():
        select_view('profile');count=page.locator('#factList .fact').count()
        page.locator('#importText').fill('技能：SYNTHETIC_DRAFT');page.locator('#parse').click();require('相同跳过 1' in page.locator('#importPreview').inner_text(),'identical import not skipped');require(page.locator('#saveImport').is_hidden(),'duplicate-only batch offered a save')
        require(page.locator('#factList .fact').count()==count,'duplicate import increased profile')
        page.locator('#importText').fill('技能：SYNTHETIC_UPDATED');page.locator('#parse').click();require('内容变化 1' in page.locator('#importPreview').inner_text(),'changed value preview missing')
        require(not page.locator('[data-replace-fact]').is_checked(),'update preselected without user review')
        responsive_capture('workspace-import-diff')
        page.locator('#saveImport').click();page.wait_for_function("document.getElementById('notice').textContent.includes('原资料保持不变')")
        original=rpc({'type':'workspace-read'})['data']['facts'];require(any(f['value']=='SYNTHETIC_DRAFT' for f in original),'unchecked update replaced old value')
        page.locator('[data-replace-fact]').check();page.locator('#saveImport').click();page.wait_for_function("document.getElementById('notice').textContent.includes('已保存 1 条')")
        updated=rpc({'type':'workspace-read'})['data']['facts'];require(any(f['value']=='SYNTHETIC_UPDATED' and not f['confirmed'] for f in updated),'selected update not saved as draft');require(page.locator('#factList .fact').count()==count,'update added a duplicate')
        page.locator('#allFacts').click()
    case('duplicate-import-and-opt-in-update-preview',import_differences)
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
    def group_bindings():
        page.locator('#password').fill('synthetic workspace passphrase');page.locator('#unlock').click();page.wait_for_function("document.getElementById('gate').hidden")
        select_view('profile');payload={'facts':[{'id':entity+'-'+str(i),'label':label,'value':value,'entity':entity,'section':'教育经历','source':'synthetic fixture','confirmed':False} for entity,values in [('masters',['学校甲','计算机']),('bachelor',['学校乙','通信'])] for i,(label,value) in enumerate(zip(['学校','专业'],values))]}
        page.locator('#importText').fill(json.dumps(payload,ensure_ascii=False));page.locator('#parse').click();page.locator('#saveImport').click();page.wait_for_function("document.getElementById('notice').textContent.includes('已保存 4 条')")
        page.locator('#confirmFacts').click();page.wait_for_function("document.getElementById('notice').textContent.includes('资料已加密保存')");page.locator('#allFacts').click();rpc({'type':'set-scenario','scenario':'education'});scan(4)
        require(page.locator('#groupBindings select').count()==2,'empty record bindings missing');require(page.locator('.state[data-status=ready]').count()==0,'empty records auto-guessed')
        for select in page.locator('#groupBindings select').all():
            require(select.is_enabled(),'completed scan left record binding disabled')
            require(set(select.locator('option').evaluate_all('(options)=>options.map(o=>o.value)'))=={'','bachelor','masters'},'confirmed education entities missing from binding choices')
        require(page.locator('#groupBindings button').first.is_enabled(),'completed scan left record locator disabled')
        page.locator('#groupBindings select').nth(0).select_option('bachelor');page.wait_for_function("document.querySelectorAll('.state[data-status=ready]').length===2")
        page.locator('#groupBindings select').nth(1).select_option('masters');page.wait_for_function("document.querySelectorAll('.state[data-status=ready]').length===4")
        require(page.locator('#fillSelected').is_disabled(),'binding did not require review')
        responsive_capture('workspace-record-binding')
        page.locator('#groupBindings button').first.click();page.wait_for_function("document.getElementById('notice').textContent.includes('已高亮该区块')")
        # Hold only the synthetic fill IPC to observe controls during an in-flight write.
        page.evaluate('''() => { const send=chrome.runtime.sendMessage; chrome.runtime.sendMessage=async m=>{if(m.type==='workspace-fill')await new Promise(resolve=>{window.__releaseFill=resolve});return send(m);}; }''')
        page.locator('#reviewed').check();page.locator('#fillSelected').click();page.wait_for_function("typeof window.__releaseFill==='function'")
        require(page.locator('#groupBindings select:disabled').count()==2,'record mapping could change during fill')
        require(page.locator('#groupBindings button:disabled').count()==2,'record locator remained active during fill')
        page.evaluate('window.__releaseFill()');page.wait_for_function("document.getElementById('result').textContent.includes('回读通过 4')")
        data=rpc({'type':'inspect'})['data'];require(data['values']=={'one-school':'学校乙','one-major':'通信','two-school':'学校甲','two-major':'计算机'},'records mixed or wrong fields written')
    case('bind-two-empty-records-once-each-and-verify-correspondence',group_bindings)
    def large_form_review():
        # Seed synthetic data through the real worker; this is not an import-parser test.
        current=rpc({'type':'workspace-read'})['data']
        facts=[{'id':'scale-'+str(i),'label':'测试字段'+str(i),'value':'SYNTHETIC-VALUE-'+str(i),'section':'基本信息','source':'synthetic scale fixture','confirmed':True} for i in range(240)]
        rpc({'type':'workspace-save','revision':current['revision'],'facts':facts});rpc({'type':'set-scenario','scenario':'scale'})
        page.locator('#lock').click();page.wait_for_function("!document.getElementById('gate').hidden")
        page.locator('#password').fill('synthetic workspace passphrase');page.locator('#unlock').click();page.wait_for_function("document.getElementById('gate').hidden")
        select_view('profile');require(page.locator('#factList .fact').count()==60,'profile DOM not bounded');page.locator('#factNext').click();require(page.locator('#factList').inner_text().startswith('测试字段60'),'profile paging incorrect')
        scan(30);require('240' in page.locator('#reviewRange').inner_text(),'truncated data mistaken for pagination');require('210' in page.locator('#selectedCount').inner_text(),'hidden selection not disclosed')
        require(page.locator('#entries select').count()==0,'eager per-field profile selectors')
        # Remove one field on page one, navigate, and show selected subset without resetting it.
        page.locator('.field-card input[type=checkbox]').first.uncheck();page.locator('#reviewNext').click();require(page.locator('.field-card').first.get_attribute('data-id')=='0:scale-30','review next page incorrect')
        page.locator('#fieldSearch').fill('测试字段0');require(page.locator('.field-card').count()==1,'search did not combine with page reset');require(not page.locator('.field-card input').is_checked(),'search reset selection')
        page.locator('#fieldSearch').fill('SYNTHETIC-VALUE');require(page.locator('.field-card').count()==0,'private values searched while hidden');page.locator('#fieldSearch').fill('')
        page.locator('button[aria-label="测试字段0 资料映射"]').click();require(page.locator('#mappingChoices button').count()==40,'mapping dialog not bounded');require('SYNTHETIC-VALUE' not in page.locator('#mappingChoices').inner_text(),'chooser exposes values without opt-in')
        page.locator('#mappingSearch').fill('测试字段239');require(page.locator('#mappingChoices button').count()==1,'mapping search missing');page.locator('#closeMapping').click();require(page.locator('#mappingChoices button').count()==0,'closed chooser retained contents')
        page.locator('#selectNone').click();require(page.locator('#fillSelected').is_disabled(),'empty global selection executable');page.locator('#filter').select_option('selected');require(page.locator('.field-card').count()==0,'selected filter incorrect')
        page.locator('#filter').select_option('all');responsive_capture('workspace-scaled-review-0.6.0')
        require(page.evaluate('document.querySelectorAll("#entries *").length')<650,'review node budget regressed')
    case('240-fields-bounded-review-search-selection-and-lazy-mapping',large_form_review)
    report={'scope':'real Chromium HTML/CSS/JS; real Node worker/vault/controller; mocked Chrome IPC, page executor and MCP bridge; stateful synthetic workflow','browser':browser.version,'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'cases':results}
    # Stop the mock IPC before closing its binding target; runtime teardown is covered separately.
    page.evaluate("async()=>{await chrome.runtime.sendMessage({type:'workspace-lock'});chrome.runtime.sendMessage=async()=>({data:{locked:true}})}")
    ctx.close();browser.close()
host.stdin.close();host.wait(timeout=5);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if report['failed']:raise SystemExit(1)
