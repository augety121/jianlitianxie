"""Installed production MV3 on a fictional Moka fixture. Not the user's browser."""
from pathlib import Path
import contextlib,json,os,shutil,tempfile,time,traceback
from playwright.sync_api import sync_playwright,expect
from helpers.moka_fixture import HTML,counts,facts,names
ROOT=Path(__file__).resolve().parents[1]
BASE='https://moka-test.example.invalid'
OUT=ROOT/'test-results/moka-mv3.json';OUT.parent.mkdir(exist_ok=True)
SOURCE='\n'.join('## '+f['section']+' | '+f['entity']+'\n'+f['label']+'：'+f['value'] for f in facts)+'\n## 项目经验 | excluded-fixture\n项目名称：虚构未选项目'
cases=[];report={};context=None;outside=[]
def require(ok,message):
 if not ok:raise AssertionError(message)
try:
 with tempfile.TemporaryDirectory(prefix='resume-moka-mv3-') as d,sync_playwright() as pw:
  tmp=Path(d);ext=tmp/'extension';shutil.copytree(ROOT/'extension',ext)
  manifest=json.loads((ext/'manifest.json').read_text(encoding='utf-8'));manifest['host_permissions'].append(BASE+'/*');(ext/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
  opts={'headless':True,'chromium_sandbox':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}'],'viewport':{'width':1300,'height':900}}
  if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
  else:opts['channel']='chromium'
  context=pw.chromium.launch_persistent_context(str(tmp/'browser'),**opts)
  def route(request):
   url=request.request.url
   if url.startswith(BASE+'/'):request.fulfill(status=200,content_type='text/html; charset=utf-8',body=HTML)
   elif url.startswith(('http://','https://')):outside.append(url);request.abort()
   else:request.continue_()
  context.route('**/*',route)
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
  origin='/'.join(worker.url.split('/')[:3]);report.update(version=manifest['version'],browser=context.browser.version)
  target=context.new_page();target.goto(BASE+'/apply')
  tab=worker.evaluate('async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id',BASE+'/apply')
  worker.evaluate('async t=>{await chrome.storage.session.set({["workspace-target-"+t.id]:t.origin});await chrome.storage.local.set({resumeSiteAccessV1:[{origin:t.origin,show:false,add:true,manualAdd:true}]})}',{'id':tab,'origin':BASE})
  manager=context.new_page();manager.goto(origin+'/local.html?tab='+str(tab))
  expect(manager.locator('#notice')).not_to_contain_text('正在读取本浏览器')
  manager.locator('#importFile').set_input_files({'name':'synthetic-moka.md','mimeType':'text/markdown','buffer':SOURCE.encode()})
  expect(manager.locator('.import-row')).to_have_count(len(facts)+1)
  manager.locator('#commitImport').click();expect(manager.locator('#savedCount')).to_have_text(str(len(facts)+1))
  manager.locator('summary').filter(has_text='选择本次填写的经历').click()
  manager.locator('#recordSelection label').filter(has_text='excluded-fixture').locator('input').uncheck()
  manager.locator('#saveRecordSelection').click();expect(manager.locator('#notice')).to_contain_text('已保存本次记录选择')
  manager.reload();expect(manager.locator('#recordSelection label').filter(has_text='excluded-fixture').locator('input')).not_to_be_checked()
  manager.locator('#returnTarget').click();target.bring_to_front();expect(target.locator('#resume-local-assistant')).to_be_visible()
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
  def button(label):
   buttons=[n for n in walk(assistant()) if n.get('nodeName')=='BUTTON']
   found=[n for n in buttons if text(n)==label]
   if not found:raise AssertionError('Missing '+label+'; buttons '+str([text(n) for n in buttons])+'; '+message())
   return found[0]
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
  wait_message('无需先点扫描');click('填写简历');wait_message('本次回读通过 65 项')
  require(target.evaluate('added')==counts,'wrong addition counts')
  require(not [p for p in context.pages if 'record-review.html' in p.url],'new empty records should not require 16 manual bindings')
  for domain,count in counts.items():
   require(target.locator('section[data-domain="'+domain+'"] input.identity').evaluate_all('(es)=>es.map(e=>e.value)')==['虚构'+domain+str(i) for i in range(count)],'identity order '+domain)
  require(target.evaluate('chosen')==35,'wrong select count')
  require(target.locator('#email').input_value()=='keep@example.invalid','changed original')
  log=manager.evaluate('()=>chrome.runtime.sendMessage({type:"local-logs"})')['data']
  require(log['schemaVersion']==4,'wrong log schema')
  task=next(r['taskId'] for r in log['records'] if r.get('outcome')=='running')
  for stage in ['task','add','scan','fill']:require(any(r['stage']==stage and r.get('taskId')==task for r in log['records']),'missing task stage '+stage)
  require(all('虚构' not in json.dumps(r,ensure_ascii=False) and BASE not in json.dumps(r) for r in log['records']),'personal values in receipts')
  require(any(f.get('recognition',{}).get('controlFamily')=='moka' for r in log['records'] for f in r['fields']),'lost Moka diagnostic family')
  inventory=next(r['addition']['inventory'] for r in log['records'] if r['stage']=='add')
  selected=next(x for x in inventory if x['domain']=='project')
  require(selected['availableRecords']==5 and selected['selectedRecords']==4,'selection diagnostics lost available/selected distinction')
  require('已有待核实' in str(log) or any(f.get('code')=='existing-unverified' for r in log['records'] for f in r['fields']),'preserved email must remain unverified')
  again=manager.evaluate('tab=>chrome.runtime.sendMessage({type:"local-resume-task",tabId:tab,reviewed:true})',tab)
  require(not again.get('error'),str(again));require(again['data']['expansion']['added']==0,'second task added records');require(again['data']['counts'].get('verified',0)==0,'second task rewrote values')
  require(target.evaluate('added')==counts,'repeat duplicated records');require(target.evaluate('submissions')==0,'submitted');require(not outside,'unexpected network')
  target.screenshot(path=str(ROOT/'test-results/moka-installed.png'))
  cases.append({'name':'18-records-65-values-automatic-order-task-logs-repeat','passed':True})
  target.set_viewport_size({'width':650,'height':500})
  primary=next(n for n in walk(assistant()) if n.get('nodeName')=='BUTTON' and 'primary' in dict(zip(n.get('attributes',[])[::2],n.get('attributes',[])[1::2])).get('class','').split())
  box=cdp.send('DOM.getBoxModel',{'backendNodeId':primary['backendNodeId']})['model']['border']
  require(min(box[1::2])>=0 and max(box[1::2])<=500,'primary action outside short viewport')
  target.screenshot(path=str(ROOT/'test-results/moka-short-viewport.png'))
  cases.append({'name':'650px-short-viewport-primary-visible','passed':True})
  target.set_viewport_size({'width':1300,'height':900})
  manager.on('dialog',lambda dialog:dialog.accept('虚构空白学习版') if dialog.type=='prompt' else dialog.accept())
  manager.locator('#newResume').click();expect(manager.locator('#savedCount')).to_have_text('0')
  manager.locator('#returnTarget').click();target.bring_to_front();wait_message('导入原简历')
  more=next(n for n in walk(assistant()) if n.get('nodeName')=='SUMMARY' and text(n)=='更多操作')
  box=cdp.send('DOM.getBoxModel',{'backendNodeId':more['backendNodeId']})['model']['border']
  target.mouse.click((box[0]+box[4])/2,(box[1]+box[5])/2)
  with context.expect_page() as new_page:click('读取本页已填内容，核对保存')
  learner=new_page.value;learner.wait_for_load_state();expect(learner.locator('.entity')).to_have_count(18)
  require(all(learner.locator('.entity').nth(i).input_value() for i in range(18)),'record identity draft not prefilled')
  before=manager.evaluate('tab=>chrome.runtime.sendMessage({type:"local-state",tabId:tab})',tab)['data']
  require(len(before['profile']['facts'])==0,'capture persisted before review')
  learner.locator('#save').click();expect(learner.locator('#notice')).to_contain_text('已新增保存')
  saved=manager.evaluate('tab=>chrome.runtime.sendMessage({type:"local-state",tabId:tab})',tab)['data']
  require(saved['readiness']['usable']==counts,'captured five-domain records unusable')
  require(target.evaluate('added')==counts and target.evaluate('chosen')==35,'capture modified source page')
  cases.append({'name':'empty-library-capture-18-records-once-per-card-explicit-save','passed':True})
except Exception as error:
 report['error']=traceback.format_exc()[-4000:];cases.append({'name':'installed-moka','passed':False});print('FAILED',report['error'],flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 report.update(scope='Installed MV3, fictional Moka DOM, pre-granted test origin and add permission; not in-app browser or authenticated ATS.',cases=cases,passed=sum(c['passed'] for c in cases),failed=sum(not c['passed'] for c in cases))
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True));raise SystemExit(bool(report['failed']))
