"""Optional Playwright UI smoke test. No browser dependency in the game itself.

python -m pip install playwright && python -m playwright install chromium
python tests/browser_smoke.py --offline --output /tmp/white-route-qa

Offline mode loads the real ES modules from local strings, changes only their
asset/import addresses, and injects the local JSON response. It does NOT exercise
HTTP loading (covered by server.test.js). It respects browser navigation policies.
A controlled RAF clock skips intermediate drawings but not simulation or UI code.
Use --url http://127.0.0.1:5173 for normal HTTP loading instead of --offline.
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--offline', action='store_true')
parser.add_argument('--url', default='http://127.0.0.1:5173')
parser.add_argument('--chromium', default=None)
parser.add_argument('--output', default='test-results')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
results = []
errors = []
CLOCK = """(()=>{
  window.__qaFrames=[];window.__qaTime=1000;window.__qaSkip=false;
  window.requestAnimationFrame=callback=>(window.__qaFrames.push(callback),window.__qaFrames.length);
  window.__qaAdvance=count=>{for(let i=0;i<count;i++){
    const callback=window.__qaFrames.shift();if(!callback)throw new Error('Missing animation frame');
    window.__qaSkip=i<count-1;window.__qaTime+=100;callback(window.__qaTime);
  }window.__qaSkip=false;};
})()"""

def check(condition, name):
    assert condition, name
    results.append(name)
    print('PASS:', name, flush=True)

def load(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    if args.offline:
        page.evaluate(CLOCK)
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        html = re.sub(r'<script type="module"[^>]*></script>', '', html)
        html = html.replace('<link rel="stylesheet" href="./styles.css">', '<style>' + (ROOT / 'styles.css').read_text(encoding='utf-8') + '</style>')
        page.set_content(html)
        sources = {name: (ROOT / 'src' / name).read_text(encoding='utf-8') for name in ['simulation.js', 'renderer.js', 'input.js', 'audio.js', 'main.js']}
        page.evaluate("""async ({sources,config})=>{
          const urls={};
          for(const name of ['simulation.js','renderer.js','input.js','audio.js','main.js']){
            let code=sources[name];
            for(const [dep,url]of Object.entries(urls))code=code.replaceAll("'./"+dep+"'",JSON.stringify(url));
            if(name==='main.js')code=code.replace("fetch(new URL('../data/coast.json',import.meta.url))",'Promise.resolve(new Response('+JSON.stringify(config)+',{status:200}))');
            urls[name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
          }
          const {Renderer}=await import(urls['renderer.js']);const draw=Renderer.prototype.render;
          Renderer.prototype.render=function(...params){if(!window.__qaSkip)return draw.apply(this,params);};
          await import(urls['main.js']);
        }""", {'sources': sources, 'config': (ROOT / 'data/coast.json').read_text(encoding='utf-8')})
    else:
        page.add_init_script(CLOCK)
        # This mode leaves renderer execution unchanged; full runs are slower.
        page.goto(args.url)
    page.wait_for_function('window.whiteRoute !== undefined', timeout=10000)
    advance(page, 1)

def advance(page, count):
    page.evaluate('(count)=>window.__qaAdvance(count)', count)

def state(page):
    return page.evaluate('whiteRoute.snapshot()')

def until(page, predicate, limit=2500):
    for _ in range(limit):
        if predicate(state(page)):
            return
        advance(page, 10)
    raise AssertionError('State predicate not reached')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    load(page)
    diagnostics = page.evaluate('whiteRoute.diagnostics()')
    check(page.locator('#start').is_enabled() and diagnostics['vertices'] > 1000, 'app initializes with a rendered 3D scene')
    page.screenshot(path=str(output / 'desktop-start.png'))
    page.click('#start')
    page.keyboard.down('d'); advance(page, 4); page.keyboard.up('d')
    check(state(page)['x'] > 1, 'keyboard steering changes continuous position')
    page.click('#pause'); before = state(page)['tick']; advance(page, 5)
    check(state(page)['tick'] == before and state(page)['phase'] == 'paused', 'pause freezes the simulation clock')
    page.locator('#large').check(); page.locator('#contrast').check()
    check('large-hud' in page.locator('body').get_attribute('class'), 'accessibility settings apply in the pause dialog')
    page.click('#resume'); x = state(page)['x']
    page.keyboard.down('a'); advance(page, 5); page.keyboard.up('a')
    check(state(page)['x'] < x, 'keyboard works immediately after resuming')
    page.click('#sound'); x = state(page)['x']; page.keyboard.down('d'); advance(page, 4); page.keyboard.up('d')
    check(state(page)['x'] > x, 'sound button does not steal gameplay keyboard focus')
    page.click('#pause'); page.click('#restart')
    check(state(page)['phase'] == 'running' and state(page)['tick'] == 0, 'restart starts a clean run without loading the page')
    page.keyboard.down('w'); advance(page, 116)
    while state(page)['distance'] < 326: advance(page, 1)
    page.keyboard.press('Space'); advance(page, 2)
    check(state(page)['jumpPhase'] == 'air' and state(page)['y'] > 0, 'jump input produces an airborne character')
    page.screenshot(path=str(output / 'desktop-driving.png'))
    until(page, lambda s: s['distance'] > 950)
    check(page.locator('#fork').is_visible(), 'route choices are shown before the selection gate')
    page.click('[data-route="fast"]'); advance(page, 1)
    check(state(page)['route'] == 'fast' and state(page)['length'] == 3000, 'route button commits a real shorter course')
    advance(page, 2500); page.keyboard.up('w')
    check(state(page)['phase'] == 'won' and page.locator('#result').is_visible(), 'start to finish to results works through normal input')
    page.screenshot(path=str(output / 'desktop-result.png'))
    record = page.evaluate('whiteRoute.exportReplay()')
    page.click('#retry'); page.keyboard.down('d'); advance(page, 3); page.keyboard.up('d')
    check(state(page)['x'] > 0 and state(page)['supplies'] == 0, 'retry clears progress and restores keyboard input')
    before = state(page)['tick']; page.evaluate("window.dispatchEvent(new Event('blur'))"); advance(page, 3)
    check(state(page)['phase'] == 'paused' and state(page)['tick'] == before, 'focus loss automatically pauses and preserves progress')
    page.click('#restart'); page.keyboard.down('s')
    advance(page, 2500); page.keyboard.up('s')
    check(state(page)['phase'] == 'lost', 'slow run reaches the time-out result screen')
    page.click('#home')
    page.locator('#replay-file').set_input_files({'name': 'run.json', 'mimeType': 'application/json', 'buffer': json.dumps(record).encode()})
    page.wait_for_timeout(200)
    page.wait_for_function('whiteRoute.snapshot().phase === "running"',timeout=5000)
    advance(page, 1500)
    check('정확히 일치' in page.locator('#result-description').text_content(), 'imported replay reproduces the recorded final result')
    page.click('#home')
    page.locator('#replay-file').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{invalid'})
    page.wait_for_timeout(100)
    check(page.locator('#notice').is_visible() and state(page)['phase'] == 'ready', 'malformed replay is rejected without breaking the app')

    mobile = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    load(mobile); mobile.screenshot(path=str(output / 'mobile-start.png'))
    box = mobile.locator('#start').bounding_box()
    check(box['y'] >= 0 and box['y'] + box['height'] < 844, 'mobile start button fits the viewport')
    mobile.click('#start'); advance(mobile, 1)
    mobile.screenshot(path=str(output / 'mobile-driving.png'))
    check(mobile.locator('#touch-controls').is_visible(), 'touch control panel is visible on a phone viewport')
    cdp = mobile.context.new_cdp_session(mobile)
    positions = []
    for index, selector in enumerate(['[data-control="right"]', '[data-control="throttle"]']):
        b = mobile.locator(selector).bounding_box()
        positions.append({'x': b['x'] + b['width'] / 2, 'y': b['y'] + b['height'] / 2, 'id': index})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': positions})
    advance(mobile, 6)
    check(state(mobile)['x'] > 1 and state(mobile)['speed'] > 18, 'simultaneous touch steering and acceleration work')
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
    advance(mobile, 15)
    check(abs(state(mobile)['vx']) < .05 and state(mobile)['speed'] == 18, 'touch cancellation clears held controls')
    check(not errors, 'no uncaught JavaScript page errors')
    report = {'mode': 'offline-module-harness' if args.offline else 'http', 'renderer': diagnostics['renderer'], 'checks_passed': len(results), 'checks': results, 'page_errors': errors,
              'limitations': ['Software fallback does not validate WebGL shader execution.', 'Synthetic input is not a human readability or real-device performance test.', 'Offline harness does not exercise HTTP module loading or persistent browser storage.']}
    (output / 'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    browser.close()
