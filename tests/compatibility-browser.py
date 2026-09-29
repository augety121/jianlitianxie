"""Synthetic real Chromium controls. Independent DOM readback; no live-site claim."""
from pathlib import Path
import json, os, shutil, time
from playwright.sync_api import sync_playwright
from helpers.bundle_modules import bundle
ROOT=Path(__file__).resolve().parents[1];results=[]

def fact(label,value,section='基本信息',entity=''):
    return dict(id=f'fact-{len(label)}-{abs(hash((label,section,entity)))}',label=label,value=value,section=section,entity=entity,source='synthetic test',confirmed=True)
with sync_playwright() as p:
    opts=dict(headless=True,args=['--no-sandbox'])
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    if executable:opts['executable_path']=executable
    browser=p.chromium.launch(**opts)
    def case(name,html,fn):
        page=browser.new_page(viewport=dict(width=1200,height=900))
        try:
            page.set_content('<style>input,select,textarea{margin:6px;min-height:25px}fieldset{padding:12px}[contenteditable]{min-height:35px;border:1px solid}</style>'+html)
            page.add_script_tag(content=bundle(ROOT/'tests/helpers/compatibility-entry.mjs'))
            page.wait_for_function('!!globalThis.__compatPlanner')
            page.add_script_tag(path=str(ROOT/'extension/engine.js'))
            fn(page);results.append(dict(name=name,status='passed'));print('PASS',name,flush=True)
        except Exception as e:results.append(dict(name=name,status='failed',error=str(e)[:1200]));print('FAIL',name,str(e),flush=True)
        finally:page.close()
    def plan(page,facts,bindings=False):
        return page.evaluate('''async args=>{const s=await __resumeFillEngine.scan();const bindings=args.bind?Object.fromEntries(__compatGroups(s,args.facts).map(g=>[g.id,args.facts[0].entity])):{};return {snapshot:s,plan:__compatPlanner(s,{facts:args.facts},{},bindings)}}''',dict(facts=facts,bind=bindings))
    def apply(page,data):return page.evaluate('p=>__resumeFillEngine.apply(p)',data['plan'])
    def all_verified(report):assert all(x['status']=='verified' for x in report['results']),report
    def radio(page):
        data=plan(page,[fact('性别','测试选项乙')]);assert data['snapshot']['fields'][0]['label']=='性别';all_verified(apply(page,data));assert page.locator('#b').is_checked()
    case('radio-uses-local-form-label-not-parent-section-legend','<fieldset><legend>基本信息</legend><div class="ant-form-item"><label>性别</label><label><input type="radio" name="sex" value="a">测试选项甲</label><label><input type="radio" name="sex" value="b" id="b">测试选项乙</label></div></fieldset>',radio)
    for attr in ['contenteditable','contenteditable="plaintext-only"']:
        def rich(page):
            data=plan(page,[fact('项目描述','SYNTHETIC PROJECT')]);all_verified(apply(page,data));assert page.locator('#rich').inner_text()=='SYNTHETIC PROJECT'
        case('rich-text-'+attr,'<div id="rich" '+attr+' role="textbox" aria-label="项目描述"></div>',rich)
    def privacy(page):
        data=plan(page,[fact('姓名','PERSON')]);s=data['snapshot'];assert s['coverage']['excluded']['hidden']==3,s;assert s['coverage']['excluded']['secret']==2,s
        assert 'PRIVATE_' not in json.dumps(s);assert len(s['fields'])==1;all_verified(apply(page,data));assert page.locator('#real').input_value()=='PERSON'
    case('hidden-transparent-and-OTP-values-not-in-snapshot','<label>姓名<input id="real"></label><div style="opacity:0"><label>姓名<input value="PRIVATE_OPACITY"></label></div><input type="hidden" value="PRIVATE_HIDDEN"><div aria-hidden="true"><label>姓名<input value="PRIVATE_ARIA"></label></div><input type="text" autocomplete="section-login one-time-code" value="PRIVATE_OTP"><input type="text" autocomplete="new-password" value="PRIVATE_PASS">',privacy)
    for kind,attributes,bad,good in [('number','min="1" max="5" step="0.5"','9','3.5'),('number','min="0" step="2"','3','4'),('email','','broken-mail','test@example.invalid'),('url','','not-a-url','https://example.invalid/'),('text','pattern="[A-Z]{3}"','wrong','ABC'),('date','min="2024-01-01" max="2026-12-31"','2020-02-03','2025-03-04')]:
        def constraint(page,kind=kind,bad=bad,good=good):
            data=plan(page,[fact('测试字段',bad)]);r=apply(page,data);assert r['results'][0]['status']=='invalid',r;assert page.locator('#target').input_value()=='';assert page.evaluate('window.inputCount')==0
            data=plan(page,[fact('测试字段',good)]);all_verified(apply(page,data));assert page.locator('#target').input_value()==good;assert page.evaluate('window.inputCount')==1
        case('native-preflight-'+kind+'-'+attributes,'<label>测试字段<input id="target" type="'+kind+'" '+attributes+'></label><script>window.inputCount=0;target.oninput=()=>inputCount++;</script>',constraint)
    def contacts(page):
        data=plan(page,[fact('手机号码','00000000001'),fact('紧急联系人电话','00000000002','紧急联系人')]);all_verified(apply(page,data));assert page.locator('#personal').input_value()=='00000000001';assert page.locator('#emergency').input_value()=='00000000002'
    case('English-emergency-contact-does-not-reuse-personal-phone','<section data-section="Personal information"><label>Phone number<input id="personal"></label></section><section data-section="Emergency contact"><label>Phone number<input id="emergency"></label></section>',contacts)
    def dates(page):
        data=plan(page,[fact('学校','SYNTHETIC UNIVERSITY','教育经历','record-a'),fact('开始月份','2020-09','教育经历','record-a'),fact('结束月份','2024-06','教育经历','record-a')],True);all_verified(apply(page,data));assert page.locator('#start').input_value()=='2020-09';assert page.locator('#end').input_value()=='2024-06'
    case('English-education-periods-use-explicit-record-binding','<section data-section="Education"><h2>Education</h2><label>University name<input></label><label>Start date<input type="month" id="start"></label><label>End date<input type="month" id="end"></label></section>',dates)
    def cap(page):
        s=page.evaluate('()=>__resumeFillEngine.scan()');assert len(s['fields'])==1000;assert s['coverage']['excluded']['truncated']==205,s['coverage']
    case('field-cap-is-reported-instead-of-hidden',''.join(f'<input aria-label="测试字段{i}">' for i in range(1205)),cap)
    def readonly(page):
        s=page.evaluate('()=>__resumeFillEngine.scan()');assert s['coverage']['excluded']['disabled']==1;assert s['coverage']['excluded']['readonly']==1;assert s['coverage']['excluded']['hidden']==1
        page.locator('summary').click();s=page.evaluate('()=>__resumeFillEngine.scan()');assert len(s['fields'])==1;assert s['fields'][0]['label']=='姓名'
    case('disabled-readonly-and-collapsed-inventory-requires-explicit-expansion','<input disabled aria-label="停用"><input readonly aria-label="只读"><details><summary>展开</summary><label>姓名<input></label></details>',readonly)
    def late(page):
        data=plan(page,[fact('城市','SYNTHETIC CITY')]);data['plan']['expiresAt']=int(time.time()*1000)+120
        r=apply(page,data);assert r['results'][0]['status']!='verified';assert page.locator('#city').input_value()==''
    case('deadline-during-suggestion-arrival-never-clicks-late-option','<label>城市<input id="city" role="combobox" readonly aria-controls="choices"></label><div role="listbox" id="choices" hidden></div><script>city.onclick=()=>setTimeout(()=>{choices.hidden=false;choices.innerHTML=\'<div role="option" onclick="city.value=this.textContent">SYNTHETIC CITY</div>\';},300);</script>',late)
    version=browser.version;browser.close()
out=ROOT/'test-results/compatibility-0.6.0.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(dict(scope='synthetic real Chromium controls, not live recruiting websites',browser=version,passed=sum(x['status']=='passed' for x in results),failed=sum(x['status']=='failed' for x in results),cases=results),ensure_ascii=False,indent=2)+'\n')
raise SystemExit(any(x['status']=='failed' for x in results))
