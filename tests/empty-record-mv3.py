"""Installed MV3, synthetic zero-card page, actual runtime/storage/DOM/mouse.
Reserved .invalid requests are fulfilled locally by Playwright; no HTTP listener.
Only the test origin is pre-granted and the initial toolbar grant is seeded.
Not an authenticated recruiting site or browser permission-dialog acceptance test.
"""
from pathlib import Path
import contextlib,json,os,shutil,tempfile,time
from playwright.sync_api import sync_playwright,expect
from helpers.empty_record_profile import SOURCE,RECORDS,EXPECTED
EXPECTED=dict(EXPECTED)
for domain,section,prefix in [("education","教育经历","education"),("project","项目经历","project")]:
 for i,record in enumerate(r for r in RECORDS if r[0]==section):
  keys={"学校":"name","专业":"major","入学时间":"start","毕业时间":"end","项目名称":"name","项目描述":"body"}
  for label,value in record[2]:EXPECTED[prefix+str(i)+keys[label]]=value
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/empty-record-mv3.json';OUT.parent.mkdir(exist_ok=True)
MARKUP=(ROOT/'tests/helpers/empty-record-fixture.html').read_text(encoding='utf-8')
BASE='https://empty-resume.example.invalid'
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
   manager.locator('#importFile').set_input_files({'name':'synthetic-bold-records.md','mimeType':'text/markdown','buffer':SOURCE.encode()})
   expect(manager.locator('.import-row')).to_have_count(24)
   manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text('24')
   expect(manager.locator('#profileHealth')).to_contain_text('教育 2 段 · 实习/工作 1 段 · 项目 5 段')
   require(target.locator('#person').input_value()=='','import or scan wrote without consent')
   require(target.evaluate('added')=={'education':0,'work':0,'project':0},'import added cards')
   manager.locator('#returnTarget').click();target.bring_to_front();expect(target.locator('#resume-local-assistant')).to_be_visible()
  step('actual-bold-MD-import-retains-24-facts-and-two-education-one-work-five-projects',imported)
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
  def before_permission():
   wait_message('无需先点扫描');click('填写简历');wait_message('回读通过 3 项')
   for key in ['person','email','summary']:require(target.locator('#'+key).input_value()==EXPECTED[key],'missing '+key)
   require(target.evaluate('added')=={'education':0,'work':0,'project':0},'cards created before add opt-in')
   node=button('按简历顺序添加经历并填写');attrs=dict(zip(node.get('attributes',[])[::2],node.get('attributes',[])[1::2]))
   require('hidden' not in attrs and 'disabled' not in attrs,'in-page add consent is not available')
   obj=cdp.send('DOM.resolveNode',{'backendNodeId':node['backendNodeId']})['object']['objectId']
   cdp.send('Runtime.callFunctionOn',{'objectId':obj,'functionDeclaration':'function(){this.click()}'});target.wait_for_timeout(100)
   require(target.evaluate('added')=={'education':0,'work':0,'project':0},'script click authorized addition')
   target.screenshot(path=str(ROOT/'test-results/empty-record-consent-installed.png'))
  step('name-error-label-fills-and-inline-add-consent-does-not-enable-itself',before_permission)
  def add_and_fill():
   click('按简历顺序添加经历并填写');wait_message('回读通过 21 项')
   require(target.evaluate('added')=={'education':2,'work':1,'project':5},'zero-card expansion count mismatch')
   require(not any('record-review.html' in p.url for p in context.pages),'new empty records prompted unnecessarily')
   for key,value in EXPECTED.items():require(target.locator('#'+key).input_value()==value,'independent value mismatch '+key)
   require(target.locator('#phone').input_value()=='KEEP_EXISTING','overwrote phone')
   for key in ['password','relative','languageLevel']:require(target.locator('#'+key).input_value()=='','invented or protected value '+key)
   require(target.locator('#consent').is_checked(),'changed existing consent')
   require(target.evaluate('submissions===0 && navAdds===0'),'submitted or clicked navigation')
   target.bring_to_front();wait_message('回读通过 21 项')
   target.screenshot(path=str(ROOT/'test-results/empty-record-filled-installed.png'))
  step('one-inline-permission-creates-eight-cards-and-automatically-fills-21-record-fields',add_and_fill)
  def repeat_and_logs():
   manager.evaluate('tab=>chrome.runtime.sendMessage({type:"local-resume-task",tabId:tab,reviewed:true})',tab);wait_message('没有可自动补全')
   require(target.evaluate('added')=={'education':2,'work':1,'project':5},'repeat task duplicated records')
   for key,value in EXPECTED.items():require(target.locator('#'+key).input_value()==value,'repeat changed '+key)
   response=manager.evaluate('()=>chrome.runtime.sendMessage({type:"local-logs"})')
   require(not response.get('error'),'log export failed');data=response['data']
   additions=[r.get('addition',{}) for r in data['records'] if r['stage']=='add']
   require(any(a.get('decision')=='consent-required' and not a['enabled'] for a in additions),'missing consent-stage diagnosis')
   require(any(a.get('added')==8 and a.get('attempted')==8 for a in additions),'missing actual additions')
   require(any(a.get('decision')=='checked' and all(x['code']=='satisfied' for x in a['inventory'] if x['target']) for a in additions),'missing repeat no-op diagnosis')
   serialized=json.dumps(data,ensure_ascii=False)
   for value in ['SYNTHETIC PERSON','empty@example.invalid','测试大学甲','虚构项目4',BASE]:require(value not in serialized,'private content in logs')
   prefs=worker.evaluate('()=>chrome.storage.local.get("resumeSiteAccessV1")')['resumeSiteAccessV1']
   require(prefs==[{'origin':BASE,'show':False,'add':True,'manualAdd':True}],'add consent granted unrelated access')
   require(worker.evaluate('()=>chrome.scripting.getRegisteredContentScripts()')==[],'add opt-in registered persistent access')
  step('repeat-click-never-duplicates-cards-and-receipts-explain-each-addition-decision',repeat_and_logs)
  def preserved():
   state=manager.evaluate('()=>chrome.runtime.sendMessage({type:"local-state"})')['data']
   require(len(state['profile']['facts'])==24,'filling mutated saved source')
   require(not outside,'unexpected external HTTP/MCP request')
  step('source-library-not-mutated-and-observed-network-has-no-external-requests',preserved)
  report['scope']='Real installed MV3 with locally fulfilled reserved .invalid page, synthetic MD and zero cards; test origin and initial toolbar grant preauthorized. No real ATS, permission dialog or user login.'
except Exception as error:
 report['error']=str(error)[:2200];print('FAILED',str(error),flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 report.update(passed=sum(c['status']=='passed' for c in cases),failed=sum(c['status']=='failed' for c in cases),cases=cases)
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if report.get('error') or report['failed']:raise SystemExit(1)
