"""Installed MV3, synthetic zero-card page, actual runtime/storage/DOM/mouse.
Reserved .invalid requests are fulfilled locally by Playwright; no HTTP listener.
Only the test origin is pre-granted and the initial toolbar grant is seeded.
Not an authenticated recruiting site or browser permission-dialog acceptance test.
"""
from pathlib import Path
import contextlib,json,os,shutil,tempfile,time
from playwright.sync_api import sync_playwright,expect
SOURCE='## 基本信息\n姓名：SYNTHETIC REVIEW PERSON\n邮箱：recovery@example.invalid\n## 自我描述\n自我评价：虚构简介\n## 项目经历\n### 恢复甲\n项目背景：虚构背景甲\n方案设计：虚构方案甲\n### 恢复乙\n项目背景：虚构背景乙\n方案设计：虚构方案乙'
EXPECTED={'person':'SYNTHETIC REVIEW PERSON','email':'recovery@example.invalid','summary':'虚构简介'}
BODIES={'恢复甲':'项目背景：虚构背景甲\n方案设计：虚构方案甲','恢复乙':'项目背景：虚构背景乙\n方案设计：虚构方案乙'}
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/readiness-mv3.json';OUT.parent.mkdir(exist_ok=True)
MARKUP=(ROOT/'tests/helpers/empty-record-fixture.html').read_text(encoding='utf-8')
BASE='https://readiness.example.invalid'
cases=[];report={};context=None;outside=[]
def require(ok,message):
 if not ok:raise AssertionError(message)
def step(name,fn):
 start=time.monotonic()
 try:fn();cases.append({'name':name,'status':'passed','ms':round((time.monotonic()-start)*1000)});print('PASS',name,flush=True)
 except Exception as e:cases.append({'name':name,'status':'failed','error':str(e)[:1600]});raise
try:
 with tempfile.TemporaryDirectory(prefix='resume-empty-mv3-') as d,sync_playwright() as pw:
  tmp=Path(d);ext=tmp/'extension';shutil.copytree(ROOT/'extension',ext)
  manifest=json.loads((ext/'manifest.json').read_text(encoding='utf-8'))
  manifest['host_permissions'].append(BASE+'/*');(ext/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
  opts={'headless':True,'chromium_sandbox':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}'],'viewport':{'width':1300,'height':900}}
  if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
  else:opts['channel']='chromium'
  context=pw.chromium.launch_persistent_context(str(tmp/'browser'),**opts)
  def route(request):
   url=request.request.url
   if url.startswith(BASE+'/'):request.fulfill(status=200,content_type='text/html; charset=utf-8',body=MARKUP)
   elif url.startswith(('http://','https://')):outside.append(url);request.abort()
   else:request.continue_()
  context.route('**/*',route)
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
  origin='/'.join(worker.url.split('/')[:3]);report.update(version=manifest['version'],browser=context.browser.version)
  target=context.new_page();target.goto(BASE+'/apply')
  tab=worker.evaluate('async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id',BASE+'/apply')
  worker.evaluate('async t=>chrome.storage.session.set({["workspace-target-"+t.id]:t.origin})',{'id':tab,'origin':BASE})
  manager=context.new_page();manager.goto(origin+'/local.html?tab='+str(tab))
  expect(manager.locator('#notice')).not_to_contain_text('正在读取本浏览器')
  def imported():
   expect(manager.locator('#advanced')).not_to_be_visible()
   manager.locator('#importFile').set_input_files({'name':'synthetic-legacy-fragments.md','mimeType':'text/markdown','buffer':SOURCE.encode()})
   expect(manager.locator('.import-row')).to_have_count(7)
   manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text('7')
   expect(manager.locator('#profileHealth')).to_contain_text('项目 0 段')
   expect(manager.locator('#profileHealth')).to_contain_text('2 段旧资料可整理')
   require(target.locator('#person').input_value()=='','import wrote without consent')
   target.evaluate("()=>{const a=document.querySelector('aside');a.replaceWith(Object.assign(document.createElement('div'),{innerHTML:'<div>教育背景</div><div>实习经历</div><div>项目经验</div>'}))}")
   manager.locator('#returnTarget').click();target.bring_to_front();expect(target.locator('#resume-local-assistant')).to_be_visible()
  step('import-seven-legacy-facts-reports-zero-usable-and-two-recoverable-projects',imported)
  cdp=context.new_cdp_session(target)
  arguments=cdp.send('Browser.getBrowserCommandLine')['arguments']
  require('--no-sandbox' not in arguments,'new installation test must retain Chromium sandbox')
  report['chromiumSandboxRequested']=True
  def walk(node):
   yield node
   for key in ['children','shadowRoots']:
    for child in node.get(key,[]):yield from walk(child)
  def assistant():
   dom=cdp.send('DOM.getDocument',{'depth':-1,'pierce':True})['root']
   return next(n for n in walk(dom) if dict(zip(n.get('attributes',[])[::2],n.get('attributes',[])[1::2])).get('id')=='resume-local-assistant')
  def text(node):return ''.join(n.get('nodeValue','') for n in walk(node) if n.get('nodeType')==3)
  def message():
   node=next(n for n in walk(assistant()) if 'message' in dict(zip(n.get('attributes',[])[::2],n.get('attributes',[])[1::2])).get('class','').split())
   return text(node)
  def button(label):return next(n for n in walk(assistant()) if n.get('nodeName')=='BUTTON' and text(n)==label)
  def click(label):
   target.bring_to_front();b=button(label)
   cdp.send('DOM.scrollIntoViewIfNeeded',{'backendNodeId':b['backendNodeId']})
   box=cdp.send('DOM.getBoxModel',{'backendNodeId':b['backendNodeId']})['model']['border']
   target.mouse.click((box[0]+box[4])/2,(box[1]+box[5])/2)
  def wait_message(value):
   until=time.monotonic()+15
   while time.monotonic()<until:
    if value in message():return
    target.wait_for_timeout(80)
   raise AssertionError('Expected '+value+'; actual '+message())
  def first_fill():
   wait_message('无需先点扫描')
   require(target.locator('#person').input_value()=='','recovery suggestion wrote the form')
   require(target.evaluate('added')=={'education':0,'work':0,'project':0},'invented records before review')
   b=button('整理已有资料');attrs=dict(zip(b.get('attributes',[])[::2],b.get('attributes',[])[1::2]))
   require('hidden' not in attrs and 'disabled' not in attrs,'recovery entry absent after partial fill')
   more=next(n for n in walk(assistant()) if n.get('nodeName')=='DETAILS' and 'more-tools' in dict(zip(n.get('attributes',[])[::2],n.get('attributes',[])[1::2])).get('class',''))
   require('open' not in more.get('attributes',[]),'secondary tools unexpectedly expanded')
   target.screenshot(path=str(ROOT/'test-results/readiness-repair-entry.png'))
  step('recoverable-profile-offers-primary-recovery-without-writing',first_fill)
  def repair_saved():
   global repairPage
   before=worker.evaluate('()=>chrome.storage.local.get("resumeLocalLibraryV1")')
   click('整理已有资料');until=time.monotonic()+15;repairPage=None
   while time.monotonic()<until:
    repairPage=next((p for p in context.pages if 'view=repair' in p.url),None)
    if repairPage:break
    target.wait_for_timeout(80)
   require(repairPage is not None,'repair manager did not open')
   expect(repairPage.locator('.import-row')).to_have_count(4)
   require(worker.evaluate('()=>chrome.storage.local.get("resumeLocalLibraryV1")')==before,'opening repair silently persisted values')
   expect(repairPage.locator('#notice')).to_contain_text('旧片段保留')
   repairPage.screenshot(path=str(ROOT/'test-results/readiness-review.png'))
   repairPage.locator('#commitImport').click();expect(repairPage.locator('#savedCount')).to_have_text('11')
   expect(repairPage.locator('#profileHealth')).to_contain_text('项目 2 段')
   state=repairPage.evaluate('()=>chrome.runtime.sendMessage({type:"local-state"})')['data']
   facts=state['profile']['facts'];descriptions=[f for f in facts if f['label']=='项目描述']
   require(len(descriptions)==2,'wrong recovered field count')
   require(all(BODIES[f['entity']]==f['value'] for f in descriptions),'rewrote source paragraphs')
   require(sum(f['label'] in ['项目背景','方案设计'] for f in facts)==4,'originals removed')
   require({f['value'] for f in facts if f['label']=='项目名称'}==set(BODIES),'name did not come from existing explicit entity')
   require(not any(f['label'] in ['开始时间','结束时间'] for f in facts),'invented date')
   target.bring_to_front();wait_message('回读通过 3 项')
  step('page-recovery-opens-two-drafts-and-only-explicit-save-adds-canonical-descriptions',repair_saved)
  def add_and_fill():
   attrs=dict(zip(button('按简历顺序添加经历并填写').get('attributes',[])[::2],button('按简历顺序添加经历并填写').get('attributes',[])[1::2]))
   require('hidden' not in attrs and 'disabled' not in attrs,'add consent is not available after reviewed recovery')
   click('按简历顺序添加经历并填写');wait_message('回读通过 4 项')
   require(target.evaluate('added')=={'education':0,'work':0,'project':2},'did not add exact two projects')
   for i,key in enumerate(['恢复甲','恢复乙']):
    require(target.locator('#project'+str(i)+'body').input_value()==BODIES[key],'wrong source-order description')
    require(target.locator('#project'+str(i)+'name').input_value()==key,'wrong reviewed project name')
   target.screenshot(path=str(ROOT/'test-results/readiness-completed.png'))
  step('unmarked-navigation-does-not-block-two-additions-and-exact-reviewed-descriptions',add_and_fill)
  def repeat_and_feedback():
   repairPage.evaluate('tab=>chrome.runtime.sendMessage({type:"local-resume-task",tabId:tab,reviewed:true})',tab)
   require(target.evaluate('added')=={'education':0,'work':0,'project':2},'repeat duplicated records')
   for key,value in EXPECTED.items():require(target.locator('#'+key).input_value()==value,'changed base content')
   for key in ['password','relative','languageLevel']:require(target.locator('#'+key).input_value()=='','invented restricted/missing value')
   require(target.evaluate('submissions===0 && navAdds===0'),'submitted or clicked navigation')
   # Expand secondary tools with a real mouse gesture, not DOM click().
   more=next(n for n in walk(assistant()) if n.get('nodeName')=='DETAILS' and 'more-tools' in dict(zip(n.get('attributes',[])[::2],n.get('attributes',[])[1::2])).get('class',''))
   summary=next(n for n in walk(more) if n.get('nodeName')=='SUMMARY')
   box=cdp.send('DOM.getBoxModel',{'backendNodeId':summary['backendNodeId']})['model']['border'];target.mouse.click((box[0]+box[4])/2,(box[1]+box[5])/2)
   click('导出问题日志');until=time.monotonic()+15;logsPage=None
   while time.monotonic()<until:
    logsPage=next((p for p in context.pages if 'view=logs' in p.url),None)
    if logsPage:break
    target.wait_for_timeout(80)
   require(logsPage is not None,'feedback navigation missing')
   expect(logsPage.locator('[data-section=logs]')).to_be_visible()
   data=logsPage.evaluate('()=>chrome.runtime.sendMessage({type:"local-logs"})')['data']
   serialized=json.dumps(data,ensure_ascii=False)
   for value in ['SYNTHETIC REVIEW PERSON','recovery@example.invalid','虚构背景甲','恢复乙',BASE]:require(value not in serialized,'private content in export')
   additions=[r.get('addition',{}) for r in data['records'] if r['stage']=='add']
   require(any(a.get('added')==2 for a in additions),'missing actual add receipt')
   require(not outside,'unexpected external network')
   state=logsPage.evaluate('()=>chrome.runtime.sendMessage({type:"local-state"})')['data'];require(len(state['profile']['facts'])==11,'filling changed source facts')
  step('repeat-is-idempotent-and-page-feedback-retains-redacted-diagnostics',repeat_and_feedback)
  report['scope']='Real installed MV3, explicit Chromium sandbox; local reserved .invalid page and synthetic fragments. Initial test origin/tool permission pregranted. No logged-in ATS, real application submission or vendor speed comparison.'
except Exception as error:
 report['error']=str(error)[:2200];print('FAILED',str(error),flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 report.update(passed=sum(c['status']=='passed' for c in cases),failed=sum(c['status']=='failed' for c in cases),cases=cases)
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if report.get('error') or report['failed']:raise SystemExit(1)
