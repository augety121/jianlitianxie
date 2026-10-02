"""Production quick-picker UI in Chromium with mocked Chrome messages.
Checks that the selected private value and confirmation stay visible together.
No extension installation, ATS page or private user data is used in this fixture.
"""
from pathlib import Path
from helpers.bundle_modules import bundle
import argparse, json, os, re, shutil, time
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--root', default=str(Path(__file__).resolve().parents[1]))
parser.add_argument('--output', default='test-results/picker-layout.json')
args = parser.parse_args()
ROOT = Path(args.root).resolve()
OUT = Path(args.output).resolve()
OUT.parent.mkdir(parents=True, exist_ok=True)
cases, errors = [], []
report = {'scope': 'production picker HTML/CSS/JS in isolated Chromium; mocked Chrome IPC, not installed MV3'}

def require(value, message):
    if not value:
        raise AssertionError(message)

try:
    with sync_playwright() as pw:
        opts = {'headless': True, 'args': ['--no-sandbox']}
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        if executable:
            opts['executable_path'] = executable
        browser = pw.chromium.launch(**opts)
        report['browser'] = browser.version
        ctx = browser.new_context(viewport={'width': 470, 'height': 650})
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        html = (ROOT / 'extension/quick-pick.html').read_text()
        # Isolated fixture only; the installed-extension test uses original CSP.
        html = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', html)
        html = re.sub(r'<link\b[^>]*>', '', html)
        html = re.sub(r'<meta\b[^>]*http-equiv=[^>]*>', '', html, flags=re.I)
        page.set_content(html)
        page.add_style_tag(path=str(ROOT / 'extension/quick-pick.css'))
        page.evaluate('''() => {
          window.__calls = [];
          const facts = Array.from({length: 48}, (_, i) => ({
            id: 'fixture-' + i, label: '测试字段 ' + i, section: '项目经历',
            entity: '虚构项目 ' + i, value: i === 0 ? 'SYNTHETIC_PREVIEW_VALUE' : 'LONG_SYNTHETIC_LINE\\n'.repeat(100)
          }));
          window.chrome = {runtime: {sendMessage: async message => {
            __calls.push(message);
            return {data: message.type === 'local-picker-read'
              ? {label: '待补填字段', section: '项目经历', origin: 'https://fixture.example.invalid', facts}
              : {verified: true}};
          }}};
        }''')
        page.add_script_tag(content=bundle(ROOT / 'extension/quick-pick.mjs'))
        expect(page.locator('#choices .choice')).to_have_count(40)

        def case(name, fn):
            started = time.monotonic()
            try:
                fn()
                require(not errors, 'uncaught UI error: ' + str(errors))
                cases.append({'name': name, 'status': 'passed', 'ms': round((time.monotonic()-started)*1000, 2)})
                print('PASS', name, flush=True)
            except Exception as error:
                cases.append({'name': name, 'status': 'failed', 'error': str(error)[:600]})
                raise

        def visible_pair():
            expect(page.locator('#preview')).to_be_visible()
            expect(page.locator('#apply')).to_be_enabled()
            value, action = page.locator('#value').bounding_box(), page.locator('#apply').bounding_box()
            require(value is not None and action is not None, 'missing preview or confirmation geometry')
            height = page.viewport_size['height']
            require(value['y'] >= 0 and value['y'] + value['height'] <= action['y'],
                    'chosen value is below or behind the confirmation button')
            require(action['y'] + action['height'] <= height, 'confirmation outside viewport')
            require(page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'horizontal overflow')

        def no_implicit_write():
            require(page.locator('#apply').is_disabled(), 'no-selection confirmation enabled')
            page.locator('.choice').first.click()
            expect(page.locator('#value')).to_have_text('SYNTHETIC_PREVIEW_VALUE')
            require(not page.evaluate('__calls.some(m => m.type === "local-picker-fill")'), 'selection wrote data')
            visible_pair()
        case('selection-preview-and-confirmation-visible-with-40-candidates', no_implicit_write)

        def scrolled_list():
            page.locator('.choice').last.click()
            visible_pair()
            require(page.locator('#value').evaluate('(e) => e.scrollHeight > e.clientHeight'), 'long value not independently scrollable')
        case('long-value-and-end-of-candidate-list-do-not-hide-confirmation', scrolled_list)

        def narrow():
            page.set_viewport_size({'width': 390, 'height': 580})
            visible_pair()
            page.screenshot(path=str(OUT.parent / 'picker-review-narrow.png'))
            page.set_viewport_size({'width': 470, 'height': 650})
            page.locator('.choice').first.click()
            visible_pair()
            page.screenshot(path=str(OUT.parent / 'picker-review-desktop.png'))
        case('390px-and-short-window-preserve-visible-preview', narrow)

        def finish_once():
            page.locator('#apply').click()
            expect(page.locator('#notice')).to_contain_text('回读通过')
            expect(page.locator('#preview')).to_be_hidden()
            expect(page.locator('#value')).to_have_text('')
            expect(page.locator('#choices .choice')).to_have_count(0)
            expect(page.locator('#apply')).to_be_hidden()
            require(page.evaluate('__calls.filter(m => m.type === "local-picker-fill").length') == 1, 'more than one write')
        case('explicit-single-confirmation-clears-preview-after-completion', finish_once)
        ctx.close()
        browser.close()
except Exception as error:
    report['error'] = str(error)[:1000]
    print('FAIL', str(error), flush=True)
finally:
    report.update(cases=cases, passed=sum(c['status']=='passed' for c in cases), failed=sum(c['status']=='failed' for c in cases))
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
if report.get('error') or report['failed']:
    raise SystemExit(1)
