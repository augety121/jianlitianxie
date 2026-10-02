"""Real UI + Node workflow; mocked Chrome storage/scripting. Installed testing is separate."""
from pathlib import Path
import re,json,subprocess,os,shutil,time,base64
from playwright.sync_api import sync_playwright,expect
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/local-first-ui.json';OUT.parent.mkdir(exist_ok=True)
host=subprocess.Popen(['node','tests/helpers/local-host.mjs'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def rpc(m):
 host.stdin.write(json.dumps(m)+'\n');host.stdin.flush();line=host.stdout.readline()
 if not line:raise RuntimeError('test host closed')
 return json.loads(line)
def require(v,m):
 if not v:raise AssertionError(m)
results=[];errors=[];page=None
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1280,'height':960},accept_downloads=True)
 html=(ROOT/'extension/local.html').read_text();html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html);html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
 html=html.replace('icons/icon48.png','data:image/png;base64,'+base64.b64encode((ROOT/'extension/icons/icon48.png').read_bytes()).decode())
 def load():
  global page
  page=ctx.new_page();page.set_default_timeout(7000);page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.expose_function('__localHost',rpc);page.set_content(html);page.add_style_tag(path=str(ROOT/'extension/local.css'))
  page.evaluate("window.URLSearchParams=class extends URLSearchParams { get(k){return k==='tab'?'11':super.get(k)} };window.chrome={runtime:{sendMessage:m=>__localHost(m),getManifest:()=>({version:'0.8.1'})}}")
  page.add_script_tag(content=bundle(ROOT/'extension/local.js'))
  expect(page.locator('#notice')).not_to_contain_text('正在读取本浏览器')
 def step(name,fn):
  start=time.monotonic()
  try:fn();require(not errors,str(errors));results.append({'name':name,'status':'passed','ms':(time.monotonic()-start)*1000});print('PASS',name,flush=True)
  except Exception as e:results.append({'name':name,'status':'failed','error':str(e)[:1200]});print('FAIL',name,str(e),flush=True);raise
 try:
  load()
  step('first-use-shows-import-without-password-or-MCP',lambda:(expect(page.locator('[data-section=profile]')).to_be_visible(),require(not page.locator('input[type=password]:visible').count(),'password gate shown'),require('未加密' in page.locator('body').inner_text(),'storage warning absent')))
  def import_md():
   page.locator('#importFile').set_input_files({'name':'test.md','mimeType':'text/markdown','buffer':'## 基本信息\n姓名：LOCAL_UI_PERSON\n邮箱：local@example.invalid\n性别：测试选项\n没有字段的介绍段落'.encode()})
   expect(page.locator('#importPreview')).to_be_visible();expect(page.locator('.import-row')).to_have_count(3);expect(page.locator('#skippedCount')).to_contain_text('1 行')
   require('LOCAL_UI_PERSON' not in json.dumps(rpc({'type':'inspect'})['data']['storage']),'file persisted before confirmation')
   page.locator('#commitImport').click();expect(page.locator('#savedCount')).to_have_text('3');expect(page.locator('.field')).to_have_count(3)
   require(page.locator('.field input:checked').count()==2,'sensitive auto-selected');require(page.locator('#fillSelected').is_enabled(),'extra review gate retained')
  step('MD-file-preview-one-confirm-save-auto-scan-and-sensitive-opt-in',import_md)
  def fill():
   page.locator('#fillSelected').click();expect(page.locator('#result')).to_contain_text('回读通过 2');require(rpc({'type':'inspect'})['data']['values']=={'name':'LOCAL_UI_PERSON','email':'local@example.invalid'},'incorrect selected destinations')
  step('single-reviewed-fill-click-only-selected-fields',fill)
  def logs():
   page.locator('[data-view=logs]').click();expect(page.locator('.log').first).to_be_visible()
   receipts=rpc({'type':'local-logs'})['data']['records']
   require({'preview','import','scan','fill'}.issubset({r['stage'] for r in receipts}),'missing actual operation stages')
   require(any(f['status']=='verified' for r in receipts for f in r['fields']),'missing actual verified receipt')
   page.locator('#exportLogs').click();expect(page.locator('#logDialog')).to_be_visible();expect(page.locator('#downloadLogs')).to_be_enabled();data=page.locator('#logPreview').text_content()
   for private in ['LOCAL_UI_PERSON','local@example.invalid','https://']:require(private not in data,'private value in logs')
   require('verified' in data,'no real completion receipt');page.locator('[data-close=logDialog]').click()
  step('automatic-actual-operation-receipts-no-personal-content',logs)
  def reopen():
   page.close();rpc({'type':'restart'});load();expect(page.locator('#savedCount')).to_have_text('3');expect(page.locator('.field')).to_have_count(3)
   require(page.locator('input[type=password]:visible').count()==0,'asked for password after reopen');require(page.locator('.field input:checked').count()==0,'existing values overwritten or sensitive auto-selected')
  step('reopen-after-worker-reconstruction-restores-profile-no-password',reopen)
  def duplicate_navigation():
   page.locator('[data-view=profile]').click()
   page.locator('#importFile').set_input_files({'name':'same.md','mimeType':'text/markdown','buffer':'## 一、基本信息\n| 字段 | 信息 |\n| --- | --- |\n| 姓名 | LOCAL_UI_PERSON |\n| 邮箱 | local@example.invalid |\n| 性别 | 测试选项 |'.encode()})
   expect(page.locator('#importNextMessage')).to_contain_text('已保存');require(page.locator('#commitImport').is_disabled(),'duplicates should not be rewritten');require(page.locator('#continueSaved').is_enabled(),'all-duplicate import has no next action')
   page.locator('#continueSaved').click();expect(page.locator('[data-section=fill]')).to_be_visible();expect(page.locator('.field')).to_have_count(3)
  step('all-duplicate-MD-import-has-visible-route-back-to-filling',duplicate_navigation)
  def zero_match():
   rpc({'type':'scenario','scenario':'unmatched'});page.locator('#scan').click();expect(page.locator('.field')).to_have_count(20)
   expect(page.locator('#matchAdvice')).to_contain_text('6 项未唯一匹配，1 项需人工处理，13 项已有内容');require(page.locator('#fillSelected').is_disabled(),'zero-match plan executable')
   expect(page.locator('#returnTarget')).to_be_enabled()
   rpc({'type':'scenario','scenario':'basic'});rpc({'type':'reset-page'})
  step('reported-20-field-zero-match-shape-has-clear-explanation-and-return-action',zero_match)
  def mapping():
   rpc({'type':'reset-page'});page.locator('#scan').click();expect(page.locator('.field')).to_have_count(3);page.locator('[aria-label="姓名 资料映射"]').click();expect(page.locator('#mappingDialog')).to_be_visible();page.locator('#mappingChoices button').first.click();expect(page.locator('#mappingDialog')).to_be_hidden()
   require(page.locator('#fillSelected').is_enabled(),'mapping leaves unusable workflow')
  step('on-demand-field-mapping-preserved',mapping)
  def edit():
   page.locator('[data-view=profile]').click();page.locator('.fact button').first.click();page.locator('#editValue').fill('LOCAL_UPDATED');page.locator('#editForm button[type=submit]').click();expect(page.locator('#editDialog')).to_be_hidden();page.locator('[data-view=fill]').click();require(page.locator('#fillSelected').is_disabled(),'edit did not invalidate old plan');page.locator('#scan').click();expect(page.locator('.field')).to_have_count(3)
  step('edit-one-fact-invalidates-old-plan-without-reimport',edit)
  def layout():
   page.locator('#showValues').uncheck();page.screenshot(path=str(ROOT/'test-results/local-first-desktop.png'),full_page=True)
   page.set_viewport_size({'width':390,'height':844});require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'390px overflow');page.screenshot(path=str(ROOT/'test-results/local-first-mobile.png'),full_page=True);page.set_viewport_size({'width':1280,'height':960})
  step('desktop-and-390px-layout',layout)
  def log_toggle():
   page.locator('[data-view=logs]').click();expect(page.locator('.log').first).to_be_visible();page.locator('#autoLogs').uncheck();page.locator('#clearLogs').click();expect(page.locator('.log')).to_have_count(0);page.locator('[data-view=fill]').click();page.locator('#scan').click();expect(page.locator('.field')).to_have_count(3);page.locator('[data-view=logs]').click();expect(page.locator('.log')).to_have_count(0)
  step('automatic-logs-can-be-disabled-and-cleared',log_toggle)
  def records():
   rpc({'type':'scenario','scenario':'education'});rpc({'type':'reset-page'})
   page.locator('[data-view=profile]').click()
   payload={'facts':[{'label':label,'value':value,'section':'教育经历','entity':entity} for entity,school,major in [('MASTER_RECORD','FICTIONAL_MASTER_SCHOOL','AI'),('BACHELOR_RECORD','FICTIONAL_BACHELOR_SCHOOL','Engineering')] for label,value in [('学校',school),('专业',major)]]}
   page.locator('#importFile').set_input_files({'name':'records.json','mimeType':'application/json','buffer':json.dumps(payload).encode()})
   expect(page.locator('.import-row')).to_have_count(4);page.locator('#commitImport').click();expect(page.locator('.group select')).to_have_count(2)
   # Both blank records are genuinely ambiguous: require the user's choices.
   expect(page.locator('.field input:checked')).to_have_count(0)
   expect(page.locator('.group select').nth(0)).to_have_value('');expect(page.locator('.group select').nth(1)).to_have_value('')
   page.locator('.group select').nth(0).select_option('BACHELOR_RECORD');expect(page.locator('.field input:checked')).to_have_count(2)
   page.locator('.group select').nth(1).select_option('MASTER_RECORD');expect(page.locator('.field input:checked')).to_have_count(4)
   page.locator('#fillSelected').click();expect(page.locator('#result')).to_contain_text('回读通过 4')
   values=rpc({'type':'inspect'})['data']['values'];require(values['aschool']=='FICTIONAL_BACHELOR_SCHOOL' and values['bschool']=='FICTIONAL_MASTER_SCHOOL','record binding followed import order instead of explicit choice')
  step('JSON-import-and-explicit-whole-record-binding-keep-two-degrees-separate',records)
  def stress_logs():
   rpc({'type':'seed-max-logs'});page.locator('[data-view=logs]').click();expect(page.locator('.log')).to_have_count(10)
   require(page.locator('#logs pre').count()==0,'collapsed details rendered eagerly');require('undefined' not in page.locator('#logs').inner_text(),'unknown learn label')
   page.locator('.log summary').first.click();expect(page.locator('#logs pre')).to_have_count(1)
   page.locator('#exportLogs').click();expect(page.locator('#downloadLogs')).to_be_enabled()
   preview=page.locator('#logPreview').text_content();require(len(preview)<12000,'preview rendered full report');require(json.loads(preview)['fieldCount']==24000,'preview count incorrect')
   page.evaluate("window.logTicks=0;window.logTimer=setInterval(()=>window.logTicks++,0)")
   with page.expect_download() as download:page.locator('#downloadLogs').click()
   text=Path(download.value.path()).read_text(encoding='utf-8');data=json.loads(text)
   require(len(data['records'])==80 and sum(len(r['fields']) for r in data['records'])==24000,'download truncated');require(page.evaluate('logTicks')>5,'UI event loop starved');page.evaluate('clearInterval(logTimer)')
   downloads=[];page.on('download',lambda d:downloads.append(d))
   page.locator('#exportLogs').click();expect(page.locator('#downloadLogs')).to_be_enabled();page.locator('#downloadLogs').click();page.locator('[data-close=logDialog]').click();expect(page.locator('#logDialog')).to_be_hidden()
   page.wait_for_timeout(450);require(not downloads,'cancelled export downloaded anyway')
  step('maximum-log-buffer-lazy-details-bounded-preview-complete-download-and-cancel',stress_logs)
  def erase():
   page.locator('[data-view=profile]').click();page.locator('#eraseProfile').click();expect(page.locator('#savedCount')).to_have_text('0');page.close();rpc({'type':'restart'});load();expect(page.locator('#savedCount')).to_have_text('0')
  step('explicit-delete-persists-without-touching-encrypted-mode',erase)
 finally:
  report={'scope':'real about:blank Chromium UI and real Node workflow/import/receipt modules; query parameters, Chrome APIs and DOM executor mocked; no navigation or installed-extension assertion','browser':browser.version,'passed':sum(x['status']=='passed' for x in results),'failed':sum(x['status']=='failed' for x in results),'cases':results}
  if page:
   try:page.evaluate('window.chrome.runtime.sendMessage=async()=>({data:{}})')
   except Exception:pass
  ctx.close();browser.close();OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
host.stdin.close();host.wait(timeout=3)
if report['failed']:raise SystemExit(1)
