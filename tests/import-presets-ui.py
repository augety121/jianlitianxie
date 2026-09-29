"""Real Chromium file input, ZIP inflation/XML, UI and Node encrypted store.
Chrome messaging/page executor/clipboard replaced by test doubles; MV3 runs separately.
"""
from pathlib import Path
import base64,json,os,shutil,re,subprocess,time
from playwright.sync_api import sync_playwright,expect
from helpers.bundle_modules import bundle
from helpers.docx_fixture import docx_bytes,NS
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/import-presets-ui.json';OUT.parent.mkdir(exist_ok=True)
host=subprocess.Popen(['node','tests/helpers/workspace-host.mjs'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
def rpc(data):
    host.stdin.write(json.dumps(data)+'\n');host.stdin.flush();line=host.stdout.readline()
    if not line:raise RuntimeError('synthetic worker exited')
    return json.loads(line)
def require(value,message):
    if not value:raise AssertionError(message)
results=[];report={}
try:
  with sync_playwright() as p:
    opts={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    if exe:opts['executable_path']=exe
    browser=p.chromium.launch(**opts);ctx=browser.new_context(viewport={'width':1360,'height':920});page=ctx.new_page();page.set_default_timeout(6000)
    errors=[];network=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:network.append(r.url) if r.url.startswith(('http:','https:')) else None);page.on('dialog',lambda d:d.accept());page.expose_function('__workspaceHost',rpc)
    html=(ROOT/'extension/workspace.html').read_text();html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html);html=html.replace('icons/icon48.png','data:image/png;base64,'+base64.b64encode((ROOT/'extension/icons/icon48.png').read_bytes()).decode())
    page.set_content(html);page.add_style_tag(path=str(ROOT/'extension/workspace.css'))
    page.evaluate('''() => {
      if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));return [...b].map(n=>n.toString(16).padStart(2,'0')).join('');};
      window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{__copied.push(text);}}});
      window.chrome={runtime:{sendMessage:m=>__workspaceHost({...m,...(m.tabId===0?{tabId:11}:{})})},permissions:{request:async()=>true}};
    }''')
    page.add_script_tag(content=bundle(ROOT/'extension/workspace.js'));expect(page.locator('#notice')).to_contain_text('就绪')
    page.add_script_tag(content=bundle(ROOT/'tests/helpers/import-entry.mjs'));page.wait_for_function('!!window.__importFixture')
    def case(name,fn):
        start=time.monotonic()
        try:fn();require(not errors,str(errors));results.append({'name':name,'status':'passed','ms':1000*(time.monotonic()-start)});print('PASS',name,flush=True)
        except Exception as e:results.append({'name':name,'status':'failed','error':str(e)[:900]});print('FAIL',name,str(e),flush=True)
    def view(name):page.locator('[data-view='+name+']').click()
    def create():
        page.locator('#password').fill('synthetic import private passphrase');page.locator('#repeatPassword').fill('synthetic import private passphrase');page.locator('#unlock').click();expect(page.locator('#gate')).to_be_hidden()
    case('new-user-can-create-vault-and-navigate-directly-to-import',create)
    def file_import():
        view('import');page.locator('#importFile').set_input_files({'name':'test-resume.docx','mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':docx_bytes(['姓名：IMPORT_SYNTHETIC','邮箱：import@example.invalid','A project paragraph without a field label.'])})
        expect(page.locator('#importFileStatus')).to_contain_text('DOCX文字已提取');require(page.locator('#importMode').input_value()=='document','DOCX did not choose guided mode')
        page.locator('#parse').click();expect(page.locator('#unmappedCount')).to_contain_text('1 段');require(page.locator('#importPreview .import-row').count()==2,'explicit pair count differs');require(rpc({'type':'workspace-read'})['data']['facts']==[],'import persisted before consent')
        page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(ROOT/'test-results/import-review-0.7.0.png'),full_page=True)
        page.locator('#saveImport').click();expect(page.locator('#notice')).to_contain_text('已保存 2 条');require(all(not f['confirmed'] for f in rpc({'type':'workspace-read'})['data']['facts']),'DOCX facts auto-confirmed')
        require('A project paragraph' in page.locator('#importText').input_value(),'unclassified original discarded');page.locator('#confirmFacts').click();expect(page.locator('#factCount')).to_have_text('2')
    case('DOCX-file-to-drafts-preserves-unclassified-paragraphs-and-needs-confirmation',file_import)
    def classify():
        view('import');page.locator('#classifyBlock').click();expect(page.locator('#editor')).to_be_visible();require('A project paragraph' in page.locator('#factValue').input_value(),'missing block');require(page.locator('#factLabel').input_value()=='','invented label')
        page.locator('#factLabel').fill('项目描述');page.locator('#factSection').fill('项目经历');page.locator('#factEntity').fill('SYNTHETIC_PROJECT');page.locator('#factForm button[type=submit]').click();expect(page.locator('#editor')).to_be_hidden();expect(page.locator('#unmappedPanel')).to_be_hidden()
        require(len(rpc({'type':'workspace-read'})['data']['facts'])==3,'classified draft not saved');require(not rpc({'type':'workspace-read'})['data']['facts'][-1]['confirmed'],'manual classification auto-confirmed')
    case('unclassified-block-opens-explicit-label-and-experience-editor',classify)
    def kits():
        view('fill');page.locator('#saveSelection').click();page.locator('#presetName').fill('通用联系资料');page.locator('#presetSave').click();expect(page.locator('#presetDialog')).to_be_hidden();expect(page.locator('#presetSelect option')).to_have_count(2)
        view('profile');page.locator('#noFacts').click();page.locator('.fact input[type=checkbox]').first.check();view('fill');page.locator('#saveSelection').click();page.locator('#presetName').fill('仅姓名方案');page.locator('#presetSave').click();expect(page.locator('#presetDialog')).to_be_hidden();expect(page.locator('#presetSelect option')).to_have_count(3)
        data=rpc({'type':'workspace-read'})['data'];require(len(data['presets'])==2,'schemes not persisted');storage=json.dumps(rpc({'type':'inspect'})['data']['storage'],ensure_ascii=False);require('通用联系资料' not in storage and 'IMPORT_SYNTHETIC' not in storage,'scheme/profile plaintext persisted')
        page.locator('#presetSelect').select_option(data['presets'][0]['id']);page.locator('#scan').click();expect(page.locator('.field-card')).to_have_count(3);page.locator('#reviewed').check();require(page.locator('#fillSelected').is_enabled(),'review unavailable')
        page.locator('#presetSelect').select_option(data['presets'][1]['id']);expect(page.locator('.field-card')).to_have_count(0);require(page.locator('#fillSelected').is_disabled(),'scheme switch retained stale authorization');page.locator('#scan').click();expect(page.locator('.state[data-status=ready]')).to_have_count(1)
        page.locator('#reviewed').check();page.locator('#fillSelected').click();expect(page.locator('#result')).to_contain_text('回读通过 1');require(rpc({'type':'inspect'})['data']['values']=={'f':'IMPORT_SYNTHETIC'},'scheme wrote unselected facts')
    case('encrypted-role-kits-switch-selection-invalidate-plan-and-fill-only-selected-facts',kits)
    def clip():
        view('profile');page.locator('.fact button').filter(has_text='复制内容').first.click();expect(page.locator('#notice')).to_contain_text('已复制一条');require(page.evaluate('__copied')==['IMPORT_SYNTHETIC'],'copied wrong or multiple values')
        require(page.locator('.fact button').filter(has_text='复制内容').last.is_disabled(),'draft has copy privilege');require(not any(c.get('route') for c in rpc({'type':'inspect'})['data']['calls']),'local workflow contacted MCP')
    case('unsupported-page-copy-fallback-is-one-item-opt-in-without-bridge',clip)
    def lock_read():
        view('import');page.evaluate('''() => { const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name==='delayed.docx')return new Promise(resolve=>{window.__finishImport=async()=>resolve(await original.call(this));});return original.call(this);}; }''')
        page.locator('#importFile').set_input_files({'name':'delayed.docx','mimeType':'application/octet-stream','buffer':docx_bytes(['姓名：MUST_NOT_REAPPEAR'])});page.wait_for_function('typeof __finishImport==="function"');page.locator('#lock').click();expect(page.locator('#gate')).to_be_visible();page.evaluate('__finishImport()');page.wait_for_timeout(120)
        require(page.locator('#importText').input_value()=='','late file result revived plaintext');require(page.locator('#presetSelect option').count()==1,'scheme names remain after lock')
        page.locator('#password').fill('synthetic import private passphrase');page.locator('#unlock').click();expect(page.locator('#gate')).to_be_hidden();require(page.locator('#presetSelect option').count()==3,'persisted encrypted kits lost on unlock')
    case('lock-during-file-read-discards-late-plaintext-and-restores-only-encrypted-kits',lock_read)
    def malformed():
        before=rpc({'type':'workspace-read'})['data'];view('import');page.locator('#importFile').set_input_files({'name':'broken.docx','mimeType':'application/octet-stream','buffer':b'not a DOCX'});expect(page.locator('#notice')).to_have_attribute('data-error','true');require(rpc({'type':'workspace-read'})['data']==before,'bad file changed library')
    case('malformed-file-never-overwrites-library',malformed)
    def xml_cases():
        body='<w:p><w:r><w:t>姓名</w:t></w:r><w:r><w:t>：Split</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>学校</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Academy</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:del><w:r><w:delText>DELETED_PRIVATE</w:delText></w:r></w:del><w:r><w:rPr><w:vanish/></w:rPr><w:t>HIDDEN_PRIVATE</w:t></w:r><w:r><w:t>&lt;img src="https://example.invalid/" onerror="evil()"&gt;</w:t></w:r></w:p>'
        binary=docx_bytes(body=body);r=page.evaluate('async encoded=>{const b=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));return __importFixture.extractDocx(b)}',base64.b64encode(binary).decode())
        require('姓名：Split' in r['text'] and '学校\tAcademy' in r['text'],'paragraph/table extraction incorrect');require('DELETED_PRIVATE' not in r['text'] and 'HIDDEN_PRIVATE' not in r['text'],'revision/hidden text leaked');require('<img' in r['text'],'visible markup text modified');require(not network,'document triggered external requests')
        bad=['<!DOCTYPE a [<!ENTITY x SYSTEM "https://example.invalid/">]><a/>','<w:document xmlns:w="bad"><w:body/></w:document>','<broken','<w:document xmlns:w="'+NS+'"><w:body/></w:document>']
        for xml in bad:require(page.evaluate('xml=>{try{__importFixture.wordXMLToText(xml);return false;}catch{return true;}}',xml),'unsafe/malformed XML accepted')
    case('actual-browser-XML-split-runs-tables-hidden-revisions-DTD-and-no-network',xml_cases)
    def screenshots():
        view('fill');rpc({'type':'reset-page'});data=rpc({'type':'workspace-read'})['data'];page.locator('#presetSelect').select_option(data['presets'][0]['id']);page.locator('#scan').click();expect(page.locator('.field-card')).to_have_count(3);page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(ROOT/'test-results/workspace-desktop-0.7.0.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844});require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'mobile overflow');page.screenshot(path=str(ROOT/'test-results/workspace-mobile-0.7.0.png'),full_page=True)
        view('import');require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'import page overflow');page.set_viewport_size({'width':1360,'height':920})
    case('new-profile-kit-and-import-views-fit-desktop-and-390px',screenshots)
    report={'browser':browser.version,'scope':'real Chromium file inputs/DOCX parser/UI and real Node encrypted store; mocked Chrome IPC/page executor/clipboard; synthetic data only','networkRequests':len(network)}
    page.evaluate("async()=>{await chrome.runtime.sendMessage({type:'workspace-lock'});chrome.runtime.sendMessage=async()=>({data:{locked:true}})}");ctx.close();browser.close()
finally:
    host.stdin.close();host.wait(timeout=5)
    report.update(passed=sum(x['status']=='passed' for x in results),failed=sum(x['status']=='failed' for x in results),cases=results);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if report['failed']:raise SystemExit(1)
