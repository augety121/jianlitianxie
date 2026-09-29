"""Synthetic real-DOM group bindings and stale-record guards; no sites or submission."""
import json, os, re, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
modules = '\n'.join((ROOT/'extension/core'/f).read_text(encoding='utf-8') for f in ['performance.mjs','semantics.mjs','entity-binding.mjs','text-variants.mjs','planner.mjs'])
modules = re.sub(r'^import .*?;\s*$', '', modules, flags=re.M).replace('export {normalize};','').replace('export ','').replace('crypto.randomUUID()', "'fixture-'+String(++globalThis.__testId)")
modules = 'globalThis.__testId=0;\n'+modules+'\nglobalThis.__makePlan=makePlan;globalThis.__groups=entityGroups;'
facts=[dict(id=entity+'-'+key,label=label,value=value,entity=entity,section='教育经历',confirmed=True,source='synthetic')
       for entity,values in [('硕士甲',['测试甲大学','计算机','2024-09']),('本科乙',['测试乙大学','通信','2020-09'])]
       for key,label,value in zip(['school','major','start'],['学校','专业','开始月份'],values)]
html='<section data-section="教育经历"><h2>教育经历</h2>'+''.join('<div class="education-item" id="'+rec+'"><label>学校<input class="school"></label><label>专业<input class="major"></label><label>开始月份<input type="month" class="start"></label></div>' for rec in ['one','two'])+'</section>'
results=[]
with sync_playwright() as pw:
    options=dict(headless=True,args=['--no-sandbox'])
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    if executable: options['executable_path']=executable
    browser=pw.chromium.launch(**options)
    def case(name,change=None):
        page=browser.new_page(viewport=dict(width=1200,height=800))
        try:
            page.set_content('<style>input{min-height:24px;margin:8px}.education-item{padding:10px}</style>'+html)
            page.add_script_tag(content=modules);page.add_script_tag(path=str(ROOT/'extension/engine.js'))
            data=page.evaluate('''async facts=>{
                const s=await __resumeFillEngine.scan();const groups=__groups(s,facts);
                const bindings=Object.fromEntries(groups.map((g,i)=>[g.id,i?'硕士甲':'本科乙']));
                const p=__makePlan(s,{facts},{},bindings);globalThis.oldScan=s;
                return {plan:p,groups};
            }''',facts)
            assert len(data['groups'])==2 and all(g['bindable'] for g in data['groups'])
            assert all(e['status']=='ready' for e in data['plan']['entries'])
            if change:page.evaluate(change)
            else:
                located=page.evaluate("s=>__resumeFillEngine.locate({snapshotId:s.id,url:s.url,fieldId:s.fields[0].id})",page.evaluate('oldScan'))
                assert located['located'] and page.locator('#one .school').input_value()==''
            report=page.evaluate('p=>__resumeFillEngine.apply(p)',data['plan'])
            if change:
                assert any(r['status']=='stale' for r in report['results']),report
                assert page.locator('#one .school').input_value()==''
            else:
                assert all(r['status']=='verified' for r in report['results']),report
                assert page.locator('#one .school').input_value()=='测试乙大学'
                assert page.locator('#two .major').input_value()=='计算机'
                new=page.evaluate('async()=>{const s=await __resumeFillEngine.scan();return {old:oldScan.fields[0].groupId,current:s.fields[0].groupId}}')
                assert new['old']!=new['current']
            results.append(dict(name=name,status='passed'));print('PASS',name,flush=True)
        except Exception as e:
            results.append(dict(name=name,status='failed',error=str(e)));print('FAIL',name,str(e),flush=True)
        finally:page.close()
    case('bind-two-empty-records-and-independent-readback')
    case('reordered-records-reject-old-bindings',"document.querySelector('section').append(document.querySelector('#one'))")
    case('added-field-invalidates-bound-record',"document.querySelector('#one').insertAdjacentHTML('beforeend','<label>学位<input></label>')")
    case('replaced-field-invalidates-bound-record',"document.querySelector('#one .major').replaceWith(document.querySelector('#one .major').cloneNode())")
    browser.close()
out=ROOT/'test-results/entity-binding-browser.json';out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(dict(scope='synthetic real Chromium DOM; not installed MV3 or live recruiting site',cases=results),ensure_ascii=False,indent=2),encoding='utf-8')
raise SystemExit(any(r['status']=='failed' for r in results))
