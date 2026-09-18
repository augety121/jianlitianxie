"""Synthetic control DOM regression. No live recruiting site is contacted.
Run: python tests/browser-regression.py --isolated-dom
Requires Playwright; use CHROMIUM_PATH for a system Chromium or its installed browser.
This MCP-only branch intentionally does not include the unsynchronized local workspace.
No extension installation or permissions are represented as tested by this harness.
"""
from __future__ import annotations
import argparse
import contextlib
import functools
import http.server
import json
import os
import re
from pathlib import Path
import shutil
import tempfile
import threading
import time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--engine', type=Path, default=ROOT/'extension/engine.js')
parser.add_argument('--skip-workspace', action='store_true')
parser.add_argument('--isolated-dom', action='store_true', help='Run DOM fixtures in about:blank without navigation; does not test MV3')
parser.add_argument('--output', type=Path, default=ROOT/'test-results/browser-report.json')
args = parser.parse_args()
if args.isolated_dom: args.skip_workspace = True
args.output.parent.mkdir(parents=True, exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_port}'
results = []

def fact(label, value, id='fact', **extra):
    return dict(id=id, label=label, value=value, source='synthetic fixture', confirmed=True, **extra)

def require(condition, detail):
    if not condition: raise AssertionError(detail)

with sync_playwright() as pw:
    executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    launch = {'headless': True, 'args': ['--no-sandbox']}
    if executable: launch['executable_path'] = executable
    browser = pw.chromium.launch(**launch)
    version = browser.version
    fixture_context = browser.new_context()
    page = fixture_context.new_page()
    page.set_default_timeout(5000)
    module_source = '\n'.join((ROOT/'extension/core'/f).read_text() for f in ['performance.mjs','semantics.mjs','planner.mjs'])
    module_source = re.sub(r'^import .*?;\s*$', '', module_source, flags=re.M)
    module_source = module_source.replace('export {normalize};', '').replace('export ', '')
    module_source = module_source.replace('crypto.randomUUID()', 'String(++globalThis.__testId)')
    module_source = 'globalThis.__testId=0;\n' + module_source + '\nglobalThis.__testMakePlan=makePlan;'
    def load(html):
        global page
        if args.isolated_dom:
            page.close(); page=fixture_context.new_page();page.set_default_timeout(5000)
            page.set_content('<main id=fixture></main>');page.add_script_tag(content=module_source)
        else: page.goto(BASE+'/tests/browser-fixture.html')
        page.locator('#fixture').evaluate('(e, html) => e.innerHTML = html', html)
        page.add_script_tag(path=str(args.engine))
    def scan(): return page.evaluate('() => globalThis.__resumeFillEngine.scan()')
    def plan(facts, mappings=None):
        return page.evaluate("""async ({facts,mappings}) => {
          const snapshot = await globalThis.__resumeFillEngine.scan();
          const {makePlan} = globalThis.__testMakePlan ? {makePlan:globalThis.__testMakePlan} : await import('/extension/core/planner.mjs');
          const resolved = {};
          for (const [label, id] of Object.entries(mappings || {})) {
            const fields = snapshot.fields.filter(f => f.label === label);
            if (fields.length === 1) resolved[fields[0].id] = id;
          }
          return makePlan(snapshot, {facts}, resolved);
        }""", {'facts':facts,'mappings':mappings})
    def apply(p): return page.evaluate('(p) => globalThis.__resumeFillEngine.apply(p)', p)
    def case(name, fn):
        start=time.monotonic()
        try:
            fn();results.append({'name':name,'status':'passed','seconds':round(time.monotonic()-start,3)})
            print('PASS',name,f'{time.monotonic()-start:.2f}s',flush=True)
        except Exception as exc:
            results.append({'name':name,'status':'failed','error':str(exc)[:1800],'seconds':round(time.monotonic()-start,3)})
            print('FAIL',name,str(exc)[:300],flush=True)
    def secrets():
        load('<label>密码<input type=password value="PASSWORD_SENTINEL"></label><label>验证码<input autocomplete=one-time-code value="OTP_SENTINEL"></label><label>姓名<input></label>')
        data=json.dumps(scan());require('PASSWORD_SENTINEL' not in data and 'OTP_SENTINEL' not in data,'password/OTP leaked into scan')
    case('scan-never-reads-passwords-or-OTP',secrets)
    def native():
        load('<form><label>姓名<input id=name></label><label>邮箱<input id=email type=email></label><label>学校<input id=school value="原有内容"></label><label>同意声明<input id=consent type=checkbox></label><button id=submit>提交</button></form>')
        page.evaluate("() => {window.submits=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submits++}}")
        p=plan([fact('姓名','虚构甲'),fact('邮箱','candidate@example.invalid','email'),fact('学校','不能覆盖','school')]);r=apply(p)
        require(page.locator('#name').input_value()=='虚构甲','name not written');require(page.locator('#email').input_value()=='candidate@example.invalid','email not written')
        require(page.locator('#school').input_value()=='原有内容','existing value overwritten')
        require(not page.locator('#consent').is_checked() and page.evaluate('submits')==0,'consent/submit triggered')
        require(all(x['status']=='verified' for x in r['results']),'native readback failed')
    case('native-inputs-existing-values-and-consent',native)
    def textareas():
        load('<label>项目描述<textarea id=description></textarea></label><div contenteditable=true aria-label="岗位职责" id=editable></div>')
        p=plan([fact('项目描述','虚构项目\n第二行'),fact('岗位职责','只测试输入控件','role')]);r=apply(p)
        require(len(r['results'])==2 and all(x['status']=='verified' for x in r['results']),'textarea/contenteditable readback')
    case('textarea-and-contenteditable',textareas)
    def selects():
        load('<label>学历<select id=degree><option value="">请选择</option><option value=masters>硕士研究生</option></select></label><label>技能<select multiple id=skills><option value=js>JavaScript</option><option value=py>Python</option></select></label>')
        p=plan([fact('学历','硕士研究生'),fact('技能','["JavaScript","Python"]','skills')],{'技能':'skills'});r=apply(p)
        require(page.locator('#degree').input_value()=='masters','select value mapping')
        require(page.locator('#skills').evaluate('(e)=>Array.from(e.selectedOptions).length')==2,'multiple select failed')
        require(all(x['status']=='verified' for x in r['results']),'select readback failed')
    case('native-select-and-explicit-multiselect',selects)
    def radios():
        load('<fieldset><legend>性别</legend><label><input type=radio name=gender value=a>选项甲</label><label><input type=radio name=gender value=b>选项乙</label></fieldset>')
        r=apply(plan([fact('性别','选项乙')]))
        require(page.locator('input[value=b]').is_checked() and r['results'][0]['status']=='verified','native radio failed')
    case('native-radio-group',radios)
    def aria_radios():
        load('<div role=radiogroup aria-label="学历"><button type=button role=radio aria-checked=false>本科</button><button type=button role=radio aria-checked=false>硕士</button></div>')
        page.evaluate("() => document.querySelectorAll('[role=radio]').forEach(e=>e.onclick=()=>{document.querySelectorAll('[role=radio]').forEach(x=>x.setAttribute('aria-checked',String(x===e)))})")
        p=plan([fact('学历','硕士')]);r=apply(p)
        require(len(r['results'])==1 and r['results'][0]['status']=='verified','ARIA radiogroup unsupported')
    case('ARIA-radio-group',aria_radios)
    def hint_labels():
        load('<input id=generated1 autocomplete=name><input id=generated2 placeholder="请输入邮箱">')
        p=plan([fact('姓名','虚构甲'),fact('邮箱','candidate@example.invalid','email')]);r=apply(p)
        require(len(r['results'])==2 and all(x['status']=='verified' for x in r['results']),'autocomplete/placeholder labels unresolved')
    case('autocomplete-and-Chinese-placeholder-labels',hint_labels)
    def dates():
        load('<label>出生年月日<input id=birthday type=date></label><label>开始月份<input id=start type=month></label>')
        r=apply(plan([fact('出生日期','2024-02-29'),fact('开始月份','2023年9月','start')]))
        require(page.locator('#birthday').input_value()=='2024-02-29','native date precision dropped')
        require(page.locator('#start').input_value()=='2023-09','month normalization failed')
        require(all(x['status']=='verified' for x in r['results']),'date readback failed')
    case('native-date-month-and-leap-day',dates)
    def no_enter():
        load('<form><div class=fx-form-datetime><label>获得日期<input id=date placeholder="yyyy/mm/dd"></label></div><button>提交</button></form>')
        page.evaluate("() => {window.enterCount=0;window.submits=0;document.querySelector('form').addEventListener('keydown',e=>{if(e.key==='Enter')window.enterCount++});document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submits++}}")
        apply(plan([fact('获得日期','2024-02-29')]))
        require(page.evaluate('enterCount')==0 and page.evaluate('submits')==0,'synthetic Enter can trigger form submission')
    case('date-input-never-emits-Enter',no_enter)
    def readonly_calendar():
        load('<div class=ant-picker><input id=date readonly aria-label="获得日期" aria-controls=calendar></div><button type=button title="2024-02-29" id=outside>外部同名元素</button><div role=grid id=calendar hidden><button type=button title="2024-02-29" id=day>29</button></div>')
        page.evaluate("() => {document.querySelector('#date').onclick=()=>document.querySelector('#calendar').hidden=false;document.querySelector('#day').onclick=()=>document.querySelector('#date').value='2024-02-29';window.trap=0;document.querySelector('#outside').onclick=()=>window.trap++}")
        r=apply(plan([fact('获得日期','2024-02-29')]))
        require(page.locator('#date').input_value()=='2024-02-29' and page.evaluate('trap')==0,'calendar target was not scoped')
        require(r['results'][0]['status']=='verified','calendar readback')
    case('readonly-calendar-owned-popup-only',readonly_calendar)
    def calendar_trap():
        load('<form><div class=ant-picker><input id=date readonly aria-label="获得日期"></div><button id=trap title="2024-02-29">提交</button></form>')
        page.evaluate("() => {window.trap=0;document.querySelector('#trap').onclick=e=>{e.preventDefault();window.trap++}}")
        r=apply(plan([fact('获得日期','2024-02-29')]))
        require(page.evaluate('trap')==0,'calendar clicked a submit element outside its popup');require(r['results'][0]['status']=='needs-user','missing calendar must fail safely')
    case('unassociated-calendar-cannot-click-submit-trap',calendar_trap)
    def owned_dropdown():
        load('<input id=combo role=combobox aria-label="学历" aria-controls=owned readonly><div id=unrelated role=listbox><div role=option id=wrong>硕士</div></div><div id=owned role=listbox hidden><div role=option id=right>硕士</div></div>')
        page.evaluate("() => {window.wrong=0;document.querySelector('#combo').onclick=()=>document.querySelector('#owned').hidden=false;document.querySelector('#wrong').onclick=()=>window.wrong++;document.querySelector('#right').onclick=()=>document.querySelector('#combo').value='硕士'}")
        r=apply(plan([fact('学历','硕士')]))
        require(page.evaluate('wrong')==0 and r['results'][0]['status']=='verified','dropdown selected unrelated option')
    case('dropdown-ignores-same-label-in-other-popup',owned_dropdown)
    def shadow_dropdown():
        load('<div id=host></div>')
        page.evaluate("""() => {const r=document.querySelector('#host').attachShadow({mode:'open'});r.innerHTML='<input id=combo role=combobox aria-label="学历" aria-controls=owned readonly><div id=owned role=listbox hidden><div role=option>硕士</div></div>';r.querySelector('#combo').onclick=()=>r.querySelector('#owned').hidden=false;r.querySelector('[role=option]').onclick=()=>r.querySelector('#combo').value='硕士'}""")
        r=apply(plan([fact('学历','硕士')]))
        require(len(r['results'])==1 and r['results'][0]['status']=='verified','Shadow DOM dropdown not resolved')
    case('open-Shadow-DOM-dropdown',shadow_dropdown)
    def disabled_options():
        load('<label>学历<select><option value="">请选择</option><optgroup label=x disabled><option value=masters>硕士</option></optgroup></select></label>')
        p=plan([fact('学历','硕士')]);require(p['entries'][0]['status']=='missing','disabled optgroup option was considered writable')
    case('disabled-optgroup-is-not-a-candidate',disabled_options)
    def moved_node():
        load('<section id=first data-section="基本信息"><label>姓名<input id=name></label></section><section id=second data-section="基本信息"></section>')
        p=plan([fact('姓名','虚构甲')]);page.evaluate("() => document.querySelector('#second').append(document.querySelector('#name').parentElement)")
        r=apply(p);require(page.locator('#name').input_value()=='' and r['results'][0]['status']=='stale','input moved to another record was filled')
    case('moved-record-node-invalidates-plan',moved_node)
    def edited_value():
        load('<label>姓名<input id=name></label>');p=plan([fact('姓名','虚构甲')]);page.locator('#name').fill('本人刚修改')
        r=apply(p);require(page.locator('#name').input_value()=='本人刚修改' and r['results'][0]['status']=='stale','user edit was overwritten')
    case('user-edits-after-preview-are-preserved',edited_value)
    def forged_overwrite():
        load('<label>姓名<input id=name value="原有内容"></label>');p=plan([fact('姓名','虚构甲')]);p['entries'][0].update(status='ready',value='FORGED_OVERWRITE')
        r=apply(p);require(page.locator('#name').input_value()=='原有内容','engine trusted a forged overwrite plan')
        require(r['results'][0]['status']=='preserve','engine did not independently enforce empty-only')
    case('engine-enforces-empty-only-even-for-forged-plan',forged_overwrite)
    def navigation():
        load('<label>姓名<input id=name></label><label>邮箱<input id=email></label>')
        page.evaluate("() => document.querySelector('#name').addEventListener('input',()=>history.pushState({},'', '#other-application'))")
        p=plan([fact('姓名','虚构甲'),fact('邮箱','candidate@example.invalid','email')]);r=apply(p)
        require(page.locator('#email').input_value()=='' and r['results'][1]['status']=='stale','plan continued after SPA navigation')
    case('SPA-navigation-stops-remaining-fields',navigation)
    def delayed_rejection():
        load('<label>姓名<input id=name></label>')
        page.evaluate("() => document.querySelector('#name').addEventListener('input',()=>setTimeout(()=>document.querySelector('#name').value='',300))")
        r=apply(plan([fact('姓名','虚构甲')]))
        require(r['results'][0]['status']=='needs-user','reported success before delayed control rejection')
    case('delayed-control-rejection-is-detected',delayed_rejection)
    def cancellation():
        load('<label>姓名<input id=name></label><label>邮箱<input id=email></label>')
        page.evaluate("() => document.querySelector('#name').addEventListener('input',()=>globalThis.__resumeFillEngine.cancel?.())")
        r=apply(plan([fact('姓名','虚构甲'),fact('邮箱','candidate@example.invalid','email')]))
        require(page.locator('#email').input_value()=='' and r['results'][1]['status']=='cancelled','cancel did not stop remaining writes')
    case('cancellation-stops-remaining-fields',cancellation)
    def one_shot():
        load('<label>姓名<input></label>');p=plan([fact('姓名','虚构甲')]);apply(p)
        rejected=False
        try: apply(p)
        except Exception: rejected=True
        require(rejected,'consumed plan could be replayed')
    case('engine-plan-is-single-use',one_shot)
    def controlled_setter():
        load('<label>姓名<input id=name></label>')
        page.evaluate("""() => {const e=document.querySelector('#name'),d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');window.ownSetterCalls=0;window.inputEvents=0;Object.defineProperty(e,'value',{get(){return d.get.call(this)},set(v){window.ownSetterCalls++;d.set.call(this,v)}});e.addEventListener('input',()=>window.inputEvents++)}""")
        r=apply(plan([fact('姓名','虚构甲')]))
        require(page.evaluate('ownSetterCalls')==0 and page.evaluate('inputEvents')==1,'native setter/event contract broken')
        require(r['results'][0]['status']=='verified','controlled-input readback failed')
    case('native-setter-and-input-event-contract',controlled_setter)
    def disabled_fieldset():
        load('<fieldset disabled><label>姓名<input></label></fieldset>');require(len(scan()['fields'])==0,'fieldset-disabled child scanned as editable')
    case('disabled-fieldset-is-not-editable',disabled_fieldset)
    def cascading():
        load('<label>省份<select id=province><option value="">请选择</option><option value=p>虚构省</option></select></label><label>城市<select id=city><option value="">请选择</option></select></label>')
        page.evaluate("() => document.querySelector('#province').onchange=()=>document.querySelector('#city').innerHTML='<option value=\"\">请选择</option><option value=c>虚构市</option>'")
        facts=[fact('省份','虚构省'),fact('城市','虚构市','city')]
        apply(plan(facts));r=apply(plan(facts))
        require(page.locator('#city').input_value()=='c' and r['results'][0]['status']=='verified','dependent select re-scan failed')
    case('dependent-select-filled-after-explicit-rescan',cascading)
    def length_limit():
        load('<label>姓名<input maxlength=2></label>');p=plan([fact('姓名','超过两字')]);require(p['entries'][0]['status']=='missing','long value silently truncated')
    case('maxlength-fails-without-silent-truncation',length_limit)
    browser.close()


server.shutdown()
report={'chromium':version,'engine':args.engine.name,'scope':('isolated about:blank DOM; planner bundled for test; no MV3' if args.isolated_dom else 'local HTTP control fixtures; no MV3') + '; no real recruiting platform acceptance',
        'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'cases':results}
args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'report':str(args.output)},ensure_ascii=False),flush=True)
raise SystemExit(1 if report['failed'] else 0)
