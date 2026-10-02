"""Installed review of a large fictional profile; no user browser or personal data."""
from pathlib import Path
import contextlib,json,os,shutil,tempfile,traceback
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/import-review-mv3.json';OUT.parent.mkdir(exist_ok=True)
report={};cases=[];context=None
def require(ok,message):
 if not ok:raise AssertionError(message)
def fact(id,label,value,section='基本信息',entity=''):
 return dict(id=id,label=label,value=value,section=section,entity=entity,source='synthetic fixture',confirmed=False)
def upload(page,rows):
 page.locator('#importFile').set_input_files({'name':'fictional-review.json','mimeType':'application/json','buffer':json.dumps({'facts':rows},ensure_ascii=False).encode()})
 expect(page.locator('.import-row')).to_have_count(len(rows))
try:
 with tempfile.TemporaryDirectory(prefix='resume-import-review-') as d,sync_playwright() as pw:
  ext=Path(d)/'extension';shutil.copytree(ROOT/'extension',ext)
  opts={'headless':True,'chromium_sandbox':True,'args':[f'--disable-extensions-except={ext}',f'--load-extension={ext}'],'viewport':{'width':1250,'height':900}}
  if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
  else:opts['channel']='chromium'
  context=pw.chromium.launch_persistent_context(str(Path(d)/'browser'),**opts)
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
  origin='/'.join(worker.url.split('/')[:3]);page=context.new_page();page.goto(origin+'/local.html')
  expect(page.locator('#notice')).not_to_contain_text('正在读取本浏览器')
  rows=[fact('basic'+str(i),'自定义基本项'+str(i),'虚构值') for i in range(9)]
  for section,label,count in [('教育经历','学校',2),('工作经历','公司名称',1),('项目经历','项目名称',5),('语言能力','语言类型',1),('获奖经历','获奖名称',17)]:
   for i in range(count):
    entity=section+str(i);offset=len(rows)
    rows.extend(fact('f'+str(offset+j),label if j==0 else '补充资料'+str(j),entity if j==0 else '虚构正文'+str(j),section,entity) for j in range(10))
  upload(page,rows)
  expect(page.locator('.import-group')).to_have_count(27)
  expect(page.get_by_label('本组所属经历',exact=True)).to_have_count(26)
  require(not worker.evaluate('async()=>!!(await chrome.storage.local.get("resumeLocalLibraryV1")).resumeLocalLibraryV1'),'preview persisted before review')
  group=page.locator('.import-group').filter(has=page.locator('summary').filter(has_text='项目经历 · 项目经历0'))
  group.locator('summary').click();group.get_by_label('本组所属经历',exact=True).fill('修改后的虚构项目')
  group=page.locator('.import-group').filter(has=page.locator('summary').filter(has_text='修改后的虚构项目'))
  expect(group.locator('summary')).to_contain_text('修改后的虚构项目')
  expect(group.get_by_label('所属经历',exact=True)).to_have_count(0)
  page.set_viewport_size({'width':390,'height':844})
  group.locator('summary').scroll_into_view_if_needed()
  require(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'grouped review overflows 390px')
  page.screenshot(path=str(ROOT/'test-results/import-review-mobile.png'))
  page.set_viewport_size({'width':1250,'height':900});page.locator('#commitImport').click()
  expect(page.locator('#savedCount')).to_have_text('269')
  saved=page.evaluate('async()=> (await chrome.runtime.sendMessage({type:"local-state"})).data.profile')
  require(sum(f['entity']=='修改后的虚构项目' for f in saved['facts'])==10,'shared identity failed to update all fields')
  cases.append({'name':'269-facts-26-records-one-identity-per-card-no-save-before-review-390px','passed':True})
  page.locator('summary').filter(has_text='选择本次填写的经历').click()
  page.locator('#recordSelection label').filter(has_text='获奖经历16').locator('input').uncheck()
  page.locator('#saveRecordSelection').click();expect(page.locator('#notice')).to_contain_text('已保存本次记录选择')
  old=next(f for f in saved['facts'] if f['label']=='项目名称' and f['entity']=='修改后的虚构项目')
  replacement={**old,'value':'更新后的虚构项目名称'}
  added=fact('new-extra','新增说明','新增内容','项目经历','修改后的虚构项目')
  newrecord=fact('new-record','项目名称','新项目','项目经历','新项目')
  upload(page,[replacement,added,newrecord])
  group=page.locator('.import-group').filter(has=page.locator('summary').filter(has_text='修改后的虚构项目'))
  expect(group.locator('summary')).to_contain_text('2 条 · 已选 1')
  group.get_by_role('button',name='取消本组选择',exact=True).click()
  group.get_by_role('button',name='勾选本组新增项',exact=True).click()
  require(not group.get_by_label('导入 项目名称',exact=True).is_checked(),'bulk new selection silently accepted replacement')
  group.get_by_label('导入 项目名称',exact=True).check()
  expect(group.locator('summary')).to_contain_text('2 条 · 已选 2')
  page.locator('#commitImport').click();expect(page.locator('#savedCount')).to_have_text('271')
  page.reload();expect(page.locator('#savedCount')).to_have_text('271')
  page.locator('summary').filter(has_text='选择本次填写的经历').click()
  expect(page.locator('#recordSelection label').filter(has_text='修改后的虚构项目').locator('input')).to_be_checked()
  expect(page.locator('#recordSelection label').filter(has_text='获奖经历16').locator('input')).not_to_be_checked()
  expect(page.locator('#recordSelection label').filter(has_text='新项目').locator('input')).not_to_be_checked()
  expect(page.locator('#recordSelection .help')).to_contain_text('已选 25 / 27')
  page.screenshot(path=str(ROOT/'test-results/import-review-installed.png'))
  cases.append({'name':'reviewed-replacement-retains-selection-reload-and-new-record-stays-unselected','passed':True})
  report.update(version=json.loads((ext/'manifest.json').read_text(encoding='utf-8'))['version'],browser=context.browser.version)
except Exception:
 report['error']=traceback.format_exc()[-4000:];cases.append({'name':'installed-import-review','passed':False});print(report['error'],flush=True)
finally:
 if context:
  with contextlib.suppress(Exception):context.close()
 report.update(scope='Isolated sandboxed MV3 with fictional 269-fact profile; not user Edge/IAB.',cases=cases,passed=sum(c['passed'] for c in cases),failed=sum(not c['passed'] for c in cases))
 OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True));raise SystemExit(bool(report['failed']))
