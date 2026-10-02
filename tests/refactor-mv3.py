"""Installed local refactor: synthetic records, real storage/messages/UI/DOM.
Only localhost host permission and initial toolbar-origin grant are preauthorized.
This is NOT an authenticated Dameng or a browser permission-dialog acceptance test.
"""
from pathlib import Path
import contextlib,http.server,json,os,shutil,tempfile,threading,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/refactor-mv3.json';OUT.parent.mkdir(exist_ok=True)
F="""<!doctype html><meta charset="utf-8"><title>虚构达梦结构验收页</title><style>
body{font:15px/1.6 system-ui;margin:25px;background:#f5f7fb}form{max-width:770px;background:white;padding:20px}fieldset{border:1px solid #dde3ef;margin:10px 0;padding:18px}label{display:block;margin:7px 0}input,textarea{padding:8px;width:75%;border:1px solid #ccd5e6}textarea{height:70px}.ant-select{position:relative;border:1px solid #ccd5e6;width:75%;height:42px}.ant-select-selector{padding:7px;cursor:pointer}.ant-select input{position:absolute;width:1px;left:1px;top:1px;opacity:1;padding:0;border:0}.ant-select-dropdown{position:fixed;background:white;border:1px solid #bbc8d5;z-index:1000;min-width:210px}.ant-select-item-option{padding:10px;cursor:pointer}
</style><h1>虚构资料与多经历填写回归</h1><form id="application"><section><h2>个人信息</h2><label>姓名<input id="person" value="保留原姓名"></label><label>邮箱<input id="email" type="email"></label><label>密码<input type="password" id="password"></label></section><section id="education"><h2>教育背景</h2><div id="eduRows"></div><button type="button" id="addEdu">+ 添加</button></section><section id="project"><h2>项目经历</h2><div id="projectRows"></div><button type="button" id="addProject">+ 添加</button></section><section><h2>语言能力</h2><label>语言类型<input id="language"></label><label>听说<input id="listening"></label></section><section><h2>家庭情况</h2><label>姓名<input id="familyName"></label><label>联系电话<input id="familyPhone"></label></section><section><h2>其他</h2><label>推荐码<input id="referral"></label><label>个人健康情况<input id="health"></label><label>附件<input type="file" id="attachment"></label></section><button type="submit">提交</button></form>
<script>
window.submissions=0;window.added={education:0,project:0};window.searches=[];
application.onsubmit=e=>{e.preventDefault();submissions++};
function select(id,label){return `<label>${label}<div class="ant-select"><div class="ant-select-selector"><span class="ant-select-selection-placeholder">请选择</span></div><input id="${id}" role="combobox" aria-controls="${id}-menu" autocomplete="off"></div></label>`;}
function card(kind,index){const f=document.createElement('fieldset');f.dataset.resumeRecord=kind;f.dataset.index=index;
 f.innerHTML=kind==='education'?select('school'+index,'学校名称')+`<label>专业<input id="major${index}"></label><label>入学时间<input type="month" id="start${index}"></label><label>毕业时间<input type="month" id="end${index}"></label>`:`<label>项目名称<input id="project${index}"></label><label>项目描述<textarea id="desc${index}"></textarea></label>`;return f;}
eduRows.append(card('education',0));projectRows.append(card('project',0));
addEdu.onclick=()=>{const n=eduRows.querySelectorAll('fieldset').length;eduRows.append(card('education',n));added.education++};
addProject.onclick=()=>{const n=projectRows.querySelectorAll('fieldset').length;projectRows.append(card('project',n));added.project++};
document.addEventListener('click',e=>{const wrap=e.target.closest('.ant-select');if(!wrap||e.target.closest('[role=option]'))return;const input=wrap.querySelector('input');let menu=document.getElementById(input.id+'-menu');if(!menu){menu=document.createElement('div');menu.id=input.id+'-menu';menu.className='ant-select-dropdown';menu.setAttribute('role','listbox');document.body.append(menu)}const b=wrap.getBoundingClientRect();menu.style.left=b.left+'px';menu.style.top=b.bottom+'px';menu.hidden=false;input.setAttribute('aria-expanded','true')});
document.addEventListener('input',e=>{const input=e.target;if(!input.matches('.ant-select input'))return;searches.push(input.value);const requested=input.value;setTimeout(()=>{if(input.value!==requested)return;const menu=document.getElementById(input.id+'-menu');if(!menu)return;menu.replaceChildren();if(!['示例甲大学','示例乙大学'].includes(requested))return;const option=document.createElement('div');option.setAttribute('role','option');option.className='ant-select-item-option';option.textContent=requested;option.onclick=()=>{const selector=input.closest('.ant-select').querySelector('.ant-select-selector');selector.replaceChildren();const value=document.createElement('span');value.className='ant-select-selection-item';value.textContent=requested;selector.append(value);input.value='';input.setAttribute('aria-expanded','false');menu.hidden=true;};menu.append(option)},70)});
</script>"""
PROFILE="""## 基本信息
姓名：虚构当前姓名
邮箱：refactor@example.invalid
## 教育经历 | 硕士记录
学校：示例甲大学
专业：电子工程
入学时间：2024-09
毕业时间：2027-06
## 教育经历 | 本科记录
学校：示例乙大学
专业：软件工程
入学时间：2020-09
毕业时间：2024-06
## 项目经历 | 项目甲
项目名称：虚构项目甲
项目描述：这是虚构项目甲的完整描述，只用于浏览器自动化测试。
## 项目经历 | 项目乙
项目名称：虚构项目乙
项目描述：这是虚构项目乙的完整描述，不得填到项目甲的记录。
## 语言能力
语言类型：英语
"""
class Fixture(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(F.encode())
 def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
cases=[];report={};context=None

def require(v,message):
 if not v:raise AssertionError(message)
def step(name,fn):
 start=time.monotonic()
 try:fn();cases.append({'name':name,'status':'passed','ms':round((time.monotonic()-start)*1000)});print('PASS',name,flush=True)
 except Exception as e:cases.append({'name':name,'status':'failed','error':str(e)[:1400]});raise
try:
 with tempfile.TemporaryDirectory(prefix='refactor-install-') as d,sync_playwright() as pw:
  tmp=Path(d);ext=tmp/'extension';shutil.copytree(ROOT/'extension',ext)
  manifest=json.loads((ext/'manifest.json').read_text());manifest['host_permissions'].append(base+'/*');(ext/'manifest.json').write_text(json.dumps(manifest))
  opts={'headless':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}','--no-sandbox'],'viewport':{'width':1280,'height':900}}
  if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
  else:opts['channel']='chromium'
  context=pw.chromium.launch_persistent_context(str(tmp/'browser'),**opts);requests=[];context.on('request',lambda r:requests.append(r.url))
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
  origin='/'.join(worker.url.split('/')[:3]);report['browser']=context.browser.version if context.browser else 'Chromium';report['version']=manifest['version']
  target=context.new_page();target.goto(base+'/apply')
  tab=worker.evaluate('async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id',base+'/apply')
  worker.evaluate('async p=>chrome.storage.session.set({["workspace-target-"+p.tab]:p.origin})',{'tab':tab,'origin':base})
  manager=context.new_page();manager.goto(origin+'/local.html?tab='+str(tab));expect(manager.locator('#notice')).not_to_contain_text('正在读取本浏览器')
  promptAnswer='第二份独立简历';manager.on('dialog',lambda dialog:dialog.accept(promptAnswer) if dialog.type=='prompt' else dialog.accept())
  def prepare():
   manager.locator('#importFile').set_input_files({'name':'fictional.md','mimeType':'text/markdown','buffer':PROFILE.encode()});expect(manager.locator('.import-row')).to_have_count(15)
   manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text('15');expect(manager.locator('#activeResume option')).to_have_count(1)
   manager.locator('.site-options summary').click();manager.locator('#siteShow').check();manager.locator('#siteAdd').check();manager.locator('#saveSite').click();expect(manager.locator('#siteState')).to_contain_text('已允许')
   registered=worker.evaluate('()=>chrome.scripting.getRegisteredContentScripts()');require(any(x['matches']==[base+'/*'] and x['js']==['page-assistant.js'] for x in registered),'origin-specific registration missing')
   manager.locator('#returnTarget').click();target.bring_to_front();expect(target.locator('#resume-local-assistant')).to_be_visible()
  step('real-import-and-explicit-origin-opt-in-without-cloud-or-extra-permissions',prepare)
  cdp=context.new_cdp_session(target)
  def walk(n):
   yield n
   for k in ['children','shadowRoots']:
    for x in n.get(k,[]):yield from walk(x)
  def assistant():
   root=cdp.send('DOM.getDocument',{'depth':-1,'pierce':True})['root']
   return next(x for x in walk(root) if dict(zip(x.get('attributes',[])[::2],x.get('attributes',[])[1::2])).get('id')=='resume-local-assistant')
  def text(n):return ''.join(x.get('nodeValue','') for x in walk(n) if x.get('nodeType')==3)
  def click(label):
   target.bring_to_front();btn=next(x for x in walk(assistant()) if x.get('nodeName')=='BUTTON' and text(x)==label);box=cdp.send('DOM.getBoxModel',{'backendNodeId':btn['backendNodeId']})['model']['border'];target.mouse.click((box[0]+box[4])/2,(box[1]+box[5])/2)
  def wait_text(label,timeout=12):
   until=time.monotonic()+timeout
   while time.monotonic()<until:
    if label in text(assistant()):return
    target.wait_for_timeout(80)
   raise AssertionError('Expected page feedback '+label+'; actual '+text(assistant())[:900])
  def review_navigation():
   for mode in ['reload-review','navigate-target','close-review']:
    target.goto(base+'/'+mode);expect(target.locator('#resume-local-assistant')).to_be_visible();wait_text('无需先点扫描')
    with context.expect_page() as opened:click('填写简历')
    review=opened.value;expect(review.locator('.record')).to_have_count(4)
    # Confirmed independent fields now fill before the aggregate record review.
    require(target.locator('#email').input_value()=='refactor@example.invalid','independent field blocked by unbound records')
    baseline=target.locator('input,textarea').evaluate_all('es=>es.map(e=>[e.id,e.value,e.checked])')
    if mode=='reload-review':
     review.reload();expect(review.locator('#state')).to_contain_text('失效');require(review.locator('#continue').is_disabled(),'reloaded review can execute')
    elif mode=='navigate-target':
     target.goto(base+'/changed-target');baseline=target.locator('input,textarea').evaluate_all('es=>es.map(e=>[e.id,e.value,e.checked])');review.bring_to_front();review.locator('#continue').click();expect(review.locator('#state')).to_contain_text('失效')
    review.close();target.bring_to_front()
    require(target.locator('input,textarea').evaluate_all('es=>es.map(e=>[e.id,e.value,e.checked])')==baseline,'revoked popup changed fields after revocation')
    require(target.evaluate('submissions')==0,'revoked review submitted')
   target.goto(base+'/apply');expect(target.locator('#resume-local-assistant')).to_be_visible()
  step('installed-review-reload-target-navigation-and-close-revoke-without-writing',review_navigation)
  def fill():
   wait_text('无需先点扫描')
   with context.expect_page() as opened:click('填写简历')
   review=opened.value
   try:expect(review.locator('.record')).to_have_count(4,timeout=15000)
   except Exception:
    print('REVIEW_ERROR',review.locator('#state').inner_text(),flush=True);raise
   require('/record-review.html?' in review.url,'not trusted record review')
   require(target.evaluate('added')=={'education':1,'project':1},'wrong number of cards added')
   require(target.locator('#email').input_value()=='refactor@example.invalid','independent email was not filled before review')
   require(target.locator('#project0').input_value()=='' and target.locator('#project1').input_value()=='','ambiguous records written before confirmation')
   # Deliberately reverse all records; one confirmation, not per-field mapping.
   choices=['本科记录','硕士记录','项目乙','项目甲']
   for i,v in enumerate(choices):review.locator('select[data-group]').nth(i).select_option(v)
   review.locator('#continue').click()
   try:expect(review.locator('#state')).to_contain_text('回读通过 14 项',timeout=30000)
   except Exception:
    # This file creates only synthetic data. Keep enough evidence to diagnose CI-only failures.
    report['failure_receipts']=worker.evaluate('()=>chrome.storage.local.get("resumeLocalReceiptsV1")')
    report['failure_fields']=target.locator('input,textarea').evaluate_all('nodes=>nodes.map(n=>({id:n.id,value:n.value}))')
    report['failure_viewport']=target.evaluate('()=>({width:innerWidth,height:innerHeight,visibility:document.visibilityState,scrollY})')
    report['failure_selected']=target.locator('.ant-select-selection-item').all_text_contents()
    target.screenshot(path=str(ROOT/'test-results/refactor-installed-failure.png'))
    raise
   require(target.locator('#email').input_value()=='refactor@example.invalid','email missing')
   for i,school,major,start,end in [(0,'示例乙大学','软件工程','2020-09','2024-06'),(1,'示例甲大学','电子工程','2024-09','2027-06')]:
    require(target.locator('#school'+str(i)).locator('xpath=..').locator('.ant-select-selection-item').inner_text()==school,'wrong school')
    for prefix,value in [('major',major),('start',start),('end',end)]:require(target.locator('#'+prefix+str(i)).input_value()==value,prefix+' in wrong record')
   require(target.locator('#project0').input_value()=='虚构项目乙' and target.locator('#desc0').input_value().startswith('这是虚构项目乙'),'project mixup')
   require(target.locator('#project1').input_value()=='虚构项目甲' and target.locator('#desc1').input_value().startswith('这是虚构项目甲'),'project mixup')
   require(target.locator('#language').input_value()=='英语','language missing');require(target.evaluate('searches')==['示例乙大学','示例甲大学'],'search-based option selection was not used')
   review.close();target.bring_to_front();wait_text('回读通过 14 项');target.screenshot(path=str(ROOT/'test-results/refactor-installed.png'))
  step('one-click-adds-exact-cards-one-record-confirmation-fills-14-correct-fields',fill)
  def boundaries():
   for key in ['password','familyName','familyPhone','referral','health','listening']:require(target.locator('#'+key).input_value()=='','unprovided or restricted value written: '+key)
   require(target.locator('#person').input_value()=='保留原姓名','existing value overwritten');require(target.evaluate('submissions')==0,'submitted');require(target.locator('#attachment').input_value()=='','attachment uploaded')
   click('填写简历');wait_text('已有内容与简历不同');require(target.evaluate('added')=={'education':1,'project':1},'repeat click added duplicate cards')
   stored=worker.evaluate('()=>chrome.storage.local.get("resumeLocalReceiptsV1")')['resumeLocalReceiptsV1']
   events=[r for r in stored if r.get('stage')=='task'];require(any(r.get('outcome')=='partial' for r in events),'unresolved fields must report partial');require(not any(r.get('outcome')=='completed' for r in events),'unresolved fields incorrectly reported complete');require(any(r.get('outcome')=='no-eligible-fields' for r in events),'zero-plan terminal missing')
   exported=json.dumps(stored,ensure_ascii=False)
   for value in ['refactor@example.invalid','示例甲大学','虚构项目乙','保留原姓名',base]:require(value not in exported,'log leaked private value')
  step('no-overwrite-no-extra-facts-no-submit-no-duplicate-records-and-safe-task-logs',boundaries)
  def versions():
   manager.bring_to_front();manager.locator('#reload').click() if manager.locator('#reload').count() else manager.reload()
   expect(manager.locator('#activeResume option')).to_have_count(1);first=manager.locator('#activeResume').input_value()
   manager.locator('#copyResume').click();expect(manager.locator('#activeResume option')).to_have_count(2);second=manager.locator('#activeResume').input_value();require(first!=second,'version not cloned')
   # Clearing affects only this version; the original remains independently selectable.
   manager.locator('[data-view=profile]').click();manager.locator('#eraseProfile').click();expect(manager.locator('#savedCount')).to_have_text('0')
   manager.locator('#activeResume').select_option(first);expect(manager.locator('#savedCount')).to_have_text('15')
   with manager.expect_download() as exported:manager.locator('#backupResumes').click()
   backup=Path(exported.value.path()).read_text();require(json.loads(backup)['kind']=='jianlitianxie-local-library','wrong backup')
   manager.locator('#libraryBackupFile').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup.encode()});expect(manager.locator('#activeResume option')).to_have_count(2)
   manager.screenshot(path=str(ROOT/'test-results/refactor-manager.png'),full_page=True)
   manager.set_viewport_size({'width':390,'height':844});require(manager.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'narrow manager overflow');manager.set_viewport_size({'width':1280,'height':900})
  step('actual-version-copy-clear-isolation-full-backup-restore-and-narrow-UI',versions)
  def restart():
   global context
   context.close();context=pw.chromium.launch_persistent_context(str(tmp/'browser'),**opts)
   worker2=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
   fresh=context.new_page();fresh.goto(base+'/restart')
   try:expect(fresh.locator('#resume-local-assistant')).to_be_visible(timeout=10000)
   except Exception:
    # Synthetic fixture metadata only; do not repair permissions or reattach in the test.
    print('RESTART_METADATA',worker2.evaluate('async o=>({preferences:await chrome.storage.local.get("resumeSiteAccessV1"),scripts:await chrome.scripting.getRegisteredContentScripts(),allowed:await chrome.permissions.contains({origins:[o+"/*"]})})',base),flush=True);raise
   state=worker2.evaluate('()=>chrome.storage.local.get("resumeLocalLibraryV1")')['resumeLocalLibraryV1']
   require(len(state['resumes'])==2,'versions lost across browser restart');require(any(len(x['profile']['facts'])==15 for x in state['resumes']),'facts lost')
   require(fresh.locator('#email').input_value()=='','auto appearance caused unrequested filling')
  step('browser-restart-restores-versions-and-site-entry-without-password-or-auto-fill',restart)
  step('observed-page-traffic-stays-local',lambda:require(all(u.startswith((base+'/',origin+'/','data:','blob:')) for u in requests),'unexpected external or MCP request'))
  report['scope']='Final-source installed MV3, synthetic localhost form and actual UI. Pre-granted test origin and seeded initial toolbar grant; no authenticated Dameng/Tata comparison.'
except Exception as e:
 report['error']=str(e)[:2500];print('FAILED',str(e),flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 server.shutdown();server.server_close();report.update(passed=sum(x['status']=='passed' for x in cases),failed=sum(x['status']=='failed' for x in cases),cases=cases)
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if report.get('error') or report['failed']:raise SystemExit(1)
