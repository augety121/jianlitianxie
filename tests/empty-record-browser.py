"""Read-only fixture setup and production DOM operations on about:blank.
No HTTP server, logged-in browser, extension install or personal profile involved.
This layer verifies zero-card recognition; installed flows are tested separately.
"""
from pathlib import Path
import json,os,shutil
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];cases=[]
BODY=(ROOT/'tests/helpers/empty-record-fixture.html').read_text(encoding='utf-8')
def check(ok,message):
 if not ok:raise AssertionError(message)
with sync_playwright() as pw:
 opts={'headless':True}
 exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
 if exe:opts['executable_path']=exe
 browser=pw.chromium.launch(**opts)
 def run(name,fn):
  page=browser.new_page(viewport={'width':1300,'height':900})
  try:
   page.set_content(BODY)
   page.evaluate("()=>{if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')}")
   page.add_script_tag(content=bundle(ROOT/'tests/helpers/oneclick-entry.mjs'))
   page.add_script_tag(content=bundle(ROOT/'tests/helpers/empty-record-entry.mjs'))
   page.add_script_tag(path=str(ROOT/'extension/engine.js'))
   page.add_script_tag(path=str(ROOT/'extension/vendor/repeat-plan/validate.js'))
   page.add_script_tag(path=str(ROOT/'extension/repeat-controller.js'))
   fn(page);check(page.evaluate('submissions===0 && navAdds===0'),'unrelated control clicked')
   cases.append({'name':name,'passed':True});print('PASS',name,flush=True)
  except Exception as e:cases.append({'name':name,'passed':False,'error':str(e)[:1800]});print('FAIL',name,str(e),flush=True)
  finally:page.close()
 def empty_then_add(page):
  targets={'education':2,'work':1,'project':5}
  before=page.evaluate('t=>__resumeRepeatController.inspect(t)',targets)
  check(len(before['candidates'])==3,str(before));check(all(x['current']==0 for x in before['candidates']),'not an empty start')
  check(page.evaluate('added')=={'education':0,'work':0,'project':0},'inspection added records')
  result=page.evaluate('t=>__resumeRepeatController.expand({targets:t,reviewed:true,url:location.href,expiresAt:Date.now()+20000})',targets)
  check(result['complete'] and result['added']==8,str(result))
  check(page.evaluate('added')==targets,'wrong section counts')
  check(page.locator('#phone').input_value()=='KEEP_EXISTING','existing field changed')
  again=page.evaluate('t=>__resumeRepeatController.expand({targets:t,reviewed:true,url:location.href,expiresAt:Date.now()+20000})',targets)
  check(again['added']==0 and again['complete'],str(again))
  page.screenshot(path=str(ROOT/'test-results/empty-record-created.png'))
 run('plain-div-sections-start-at-zero-and-add-two-education-one-work-five-projects-once',empty_then_add)
 def permission(page):
  result=page.evaluate('async()=>{try{await __resumeRepeatController.expand({targets:{education:2},reviewed:false,url:location.href,expiresAt:Date.now()+10000});return false}catch{return true}}')
  check(result,'unapproved expansion allowed');check(page.evaluate('added.education')==0,'wrote before consent')
 run('expansion-refuses-absent-confirmation',permission)
 def no_source(page):
  result=page.evaluate('()=>__resumeRepeatController.inspect({education:0,work:0,project:0})')
  check(result['candidates']==[] and all(x['code']=='no-source-records' for x in result['inventory']),str(result))
 run('visible-add-links-with-no-source-records-are-reported-not-clicked',no_source)
 def ambiguous(page):
  page.locator('#education .headingX').evaluate("e=>{const n=e.querySelector('.addX').cloneNode(true);e.append(n)}")
  result=page.evaluate('()=>__resumeRepeatController.inspect({education:2,work:0,project:0})')
  check(not any(c['domain']=='education' for c in result['candidates']),'ambiguous add link selected')
 run('competing-add-controls-never-choose-the-first-link',ambiguous)
 def flat(page):
  page.locator('.blockX').evaluate_all('nodes=>nodes.forEach(n=>n.replaceWith(...n.childNodes))')
  empty_then_add(page)
 run('flat-header-and-record-siblings-stay-bounded-to-their-own-sections',flat)
 def validation_label(page):
  facts=[{'id':'n','label':'姓名','value':'SYNTHETIC PERSON','section':'基本信息','confirmed':True},{'id':'e','label':'邮箱','value':'label@example.invalid','section':'基本信息','confirmed':True}]
  plan=page.evaluate('async facts=>{const s=await __resumeFillEngine.scan();return __onePlan(s,{facts})}',facts)
  check(sum(e['status']=='ready' for e in plan['entries'])==2,str([(e['label'],e['status']) for e in plan['entries']]))
  result=page.evaluate('p=>__resumeFillEngine.apply(p)',plan)
  check(sum(x['status']=='verified' for x in result['results'])==2,str(result))
  check(page.locator('#person').input_value()=='SYNTHETIC PERSON','name not filled')
  check(page.locator('#email').input_value()=='label@example.invalid','email not filled')
  check(page.locator('#relative').input_value()=='','personal name entered as relative')
  check(page.locator('#consent').is_checked(),'existing consent modified')
 run('validation-message-is-not-part-of-name-and-clearing-it-does-not-stale-readback',validation_label)
 def direct_titles(page):
  page.locator('.headingX > span:first-child').evaluate_all('nodes=>nodes.forEach(n=>n.replaceWith(document.createTextNode(n.textContent)))')
  empty_then_add(page)
 run('plain-text-headings-next-to-add-spans-are-not-missed',direct_titles)
 def source_to_form(page):
  records=[('基本信息','',[('姓名','SYNTHETIC PERSON'),('默认邮箱','empty@example.invalid')]),('教育经历','硕士记录',[('学校','测试大学甲'),('专业','电子工程'),('入学时间','2024-09'),('毕业时间','2027-07')]),('教育经历','本科记录',[('学校','测试大学乙'),('专业','软件工程'),('入学时间','2020-09'),('毕业时间','2024-07')]),('实习经历','实习记录',[('公司名称','测试公司'),('部门名称','测试部门'),('职位名称','开发实习生')])]
  records += [('项目经历','项目'+str(i),[('项目名称','虚构项目'+str(i)),('项目描述',f'项目背景：这是第{i}段虚构内容。\n设计方案：不得与其他记录混淆。')]) for i in range(5)]
  records += [('自我描述','',[('自我评价','仅用于本机合成测试。')])]
  source='\n\n'.join('## '+section+('\n### '+entity if entity else '')+'\n\n'+'\n\n'.join('**'+key+'**\n\n'+value for key,value in values) for section,entity,values in records)
  choices={'education':['本科记录','硕士记录'],'work':['实习记录'],'project':['项目'+str(i) for i in range(5)]}
  plan=page.evaluate('''async ({source,choices})=>{
    const facts=__emptyRecordTest.readLocalImport(source).facts.map(f=>({...f,confirmed:true}));
    const targets=__emptyRecordTest.recordTargets(facts,'null');
    const expanded=await __resumeRepeatController.expand({targets,reviewed:true,url:location.href,expiresAt:Date.now()+20000});
    if(expanded.added!==8||!expanded.complete)throw Error('expansion failed '+JSON.stringify(expanded));
    const snapshot=await __resumeFillEngine.scan(),groups=__emptyRecordTest.entityGroups(snapshot,facts),bindings={},seen={};
    for(const group of groups){if(!choices[group.scope])continue;const i=seen[group.scope]||0;seen[group.scope]=i+1;const entity=choices[group.scope][i];if(!entity||!group.candidates.some(c=>c.entity===entity))throw Error('unrecognized group '+group.scope);bindings[group.id]=entity;}
    if(seen.education!==2||seen.work!==1||seen.project!==5)throw Error('incorrect group boundaries '+JSON.stringify(seen));
    return __emptyRecordTest.makePlan(snapshot,{facts},{},bindings);
  }''',{'source':source,'choices':choices})
  expected={'person':'SYNTHETIC PERSON','email':'empty@example.invalid','summary':'仅用于本机合成测试。','work0name':'测试公司','work0department':'测试部门','work0role':'开发实习生'}
  for i,school,major,start,end in [(0,'测试大学乙','软件工程','2020-09','2024-07'),(1,'测试大学甲','电子工程','2024-09','2027-07')]:
   for key,value in [('name',school),('major',major),('start',start),('end',end)]:expected[f'education{i}'+key]=value
  for i in range(5):expected[f'project{i}name']='虚构项目'+str(i);expected[f'project{i}body']=f'项目背景：这是第{i}段虚构内容。\n设计方案：不得与其他记录混淆。'
  check(sum(e['status']=='ready' for e in plan['entries'])==len(expected),str([(e['label'],e['section'],e['status']) for e in plan['entries']]))
  result=page.evaluate('p=>__resumeFillEngine.apply(p)',plan)
  check(sum(e['status']=='verified' for e in result['results'])==len(expected),str(result))
  for field,value in expected.items():check(page.locator('#'+field).input_value()==value,'incorrect independent field '+field)
  for field in ['password','relative','languageLevel']:check(page.locator('#'+field).input_value()=='','unprovided value written '+field)
  check(page.locator('#phone').input_value()=='KEEP_EXISTING','existing phone changed')
  check(page.locator('#consent').is_checked(),'user consent changed')
  page.screenshot(path=str(ROOT/'test-results/empty-record-filled.png'))
 run('bold-source-to-zero-card-addition-and-explicit-record-map-fills-all-24-independent-values',source_to_form)
 report={'scope':'real Chromium about:blank, production DOM engine and repeat controller, synthetic empty sections; not installed extension or live ATS','browser':browser.version,'passed':sum(c['passed'] for c in cases),'failed':sum(not c['passed'] for c in cases),'cases':cases}
 browser.close()
OUT=ROOT/'test-results/empty-record-browser.json';OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if report['failed']:raise SystemExit(1)
