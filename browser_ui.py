"""Keyboard, preferences, locale/RTL and chemistry-state integration checks.

These automated checks supplement, not certify, manual assistive-technology testing.
"""
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

LOCALES = ('en', 'es', 'fr', 'zh-Hans', 'ar', 'de')


def snapshot(page):
    return page.evaluate('''() => ({
      selected:BondAtlas.state.selected?.id,
      record:JSON.stringify(BondAtlas.state.result?.isomers),
      mode:BondAtlas.state.mode,together:BondAtlas.state.together,
      camera:BondAtlas.state.viewer?.getView(),
      draft:JSON.stringify(MoleculeBuilder.getDraft())
    })''')


def semantics(page):
    return page.evaluate('''() => {
      const visible = element => {
        if(element.checkVisibility && !element.checkVisibility({checkVisibilityCSS:true})) return false;
        for(let parent=element.parentElement;parent;parent=parent.parentElement) {
          if(parent.tagName==='DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false;
        }
        return !!(element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      };
      const controls = [...document.querySelectorAll('input,select,textarea')].filter(e=>visible(e) && e.type !== 'hidden');
      const unnamed = controls.filter(e=>!e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby'));
      const buttons = [...document.querySelectorAll('button')].filter(visible).filter(e=>!e.innerText.trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title);
      const ids = [...document.querySelectorAll('[id]')].map(e=>e.id);
      const missing = [...document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]')].flatMap(e=>['aria-labelledby','aria-describedby','aria-controls'].flatMap(a=>(e.getAttribute(a)||'').split(/\\s+/).filter(id=>id&&!document.getElementById(id)).map(id=>e.id+':'+id)));
      return {unnamed:unnamed.map(e=>e.id),buttons:buttons.map(e=>e.id),duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i),missing,main:document.querySelectorAll('main').length,overflow:document.documentElement.scrollWidth>innerWidth};
    }''')


def inspect_conformer(page):
    """Exercise actual WebGL picking, then build a measurement without a pointer."""
    page.locator('#model3d').scroll_into_view_if_needed()
    point = page.evaluate('''() => {
      const {viewer} = BondAtlas.state, atoms = viewer.getModel().selectedAtoms({});
      const points = viewer.modelToScreen(atoms).map(p => ({x:p.x-scrollX, y:p.y-scrollY}));
      const candidates = points.flatMap((p,i) => {
        if(atoms[i].elem==='H' || !document.elementFromPoint(p.x,p.y)?.closest('#model3d')) return [];
        const separation = Math.min(...points.filter((_,j)=>i!==j).map(q=>Math.hypot(p.x-q.x,p.y-q.y)));
        return [{...p,separation}];
      });
      return candidates.sort((a,b)=>b.separation-a.separation)[0];
    }''')
    page.mouse.click(point['x'],point['y'])
    expect(page.locator('#inspection-picks')).to_contain_text('Selected:')
    picked = page.evaluate('BondAtlas.inspection.getSelection().atomIndices')
    assert len(picked)==1 and picked[0] is not None, picked
    chooser, pick = page.locator('#inspection-atom'), page.locator('#inspection-pick')
    for i in [i for i in range(3) if i!=picked[0]][:2]:
        chooser.focus(); page.keyboard.press('Home')
        for _ in range(i): page.keyboard.press('ArrowDown')
        page.keyboard.press('Tab'); expect(pick).to_be_focused(); page.keyboard.press('Enter')
        length=len(page.evaluate('BondAtlas.inspection.getSelection().atomIndices'))
        expect(page.locator('#inspection-value')).to_contain_text('Distance:' if length==2 else 'Angle:')
    expect(page.locator('#inspection-source')).to_contain_text('selected conformer')
    page.locator('#inspection-clear').click()
    expect(page.locator('#inspection-picks')).to_have_text('No atoms selected.')
    page.locator('#atom-inspection summary').click()


def choose_language(page, locale):
    page.locator('#language-select').select_option(locale)
    expect(page.locator('html')).to_have_attribute('lang', locale)
    expect(page.locator('html')).to_have_attribute('dir', 'rtl' if locale == 'ar' else 'ltr')
    page.evaluate('async () => { await document.fonts.ready; await new Promise(resolve=>requestAnimationFrame(resolve)); }')


def preferences(page, **values):
    page.locator('#preferences-button').click()
    expect(page.locator('#preferences-dialog')).to_be_visible()
    for name, value in values.items():
        locator = page.locator({'theme':'#preference-theme','text':'#preference-text-size','contrast':'#preference-contrast','motion':'#preference-motion'}[name])
        if isinstance(value, bool):
            locator.set_checked(value)
        else:
            locator.select_option(value)
    page.locator('#close-preferences').click()
    expect(page.locator('#preferences-dialog')).to_be_hidden()
    expect(page.locator('#preferences-button')).to_be_focused()


def workspace_file_round_trip(page):
    """Use a browser download as the input file, not a prebuilt fixture."""
    page.get_by_role('button', name='Move an oxygen', exact=True).click()
    rows = page.locator('#desk-rows > li')
    expect(rows).to_have_count(2)
    rows.nth(1).get_by_role('button', name='Hide', exact=True).click()
    fields = rows.locator('.row-head > input')
    values = fields.evaluate_all('(inputs) => inputs.map(i => i.value)')
    page.locator('#desk-files > summary').click()
    with page.expect_download() as event:
        page.locator('#desk-file-download').click()
    download = event.value
    assert download.suggested_filename.endswith('.orgchem.json')
    data = download.path().read_bytes()
    assert [r['input'] for r in json.loads(data)['rows']] == values
    page.locator('#desk-add').click()
    file_input = page.locator('#desk-file-input')
    file_input.set_input_files({'name': 'workspace.orgchem.json', 'mimeType': 'application/json', 'buffer': data})
    expect(rows).to_have_count(2)
    assert fields.evaluate_all('(inputs) => inputs.map(i => i.value)') == values
    expect(rows.nth(1)).to_have_attribute('data-visible', 'false')
    expect(rows.nth(0).get_by_role('checkbox')).to_be_checked()
    page.locator('#desk-undo').click()
    expect(rows).to_have_count(3)
    page.locator('#desk-redo').click()
    expect(rows).to_have_count(2)
    print('PASS: browser workspace file download, reopen, hidden row, selection and undo/redo', flush=True)


def student_walkthrough(page, captures=None):
    """Protect the first phone-sized lesson without depending on a pixel-perfect theme."""
    page.locator('#show-builder').click()
    page.locator('#builder-example').select_option('ethanol')
    tools = page.locator('#drawing-tools summary')
    expect(page.locator('#builder-element-C')).to_be_hidden()
    tools.press('Enter')
    expect(page.locator('#builder-element-C')).to_be_visible()
    tools.press('Enter')
    expect(page.locator('#sketch-identity')).to_contain_text('Ethanol')
    canvas_top = page.locator('#builder-canvas').bounding_box()['y']
    title_top = page.locator('#builder-title').bounding_box()['y']
    assert canvas_top - title_top < 510, 'Phone tools crowd the molecule off screen'
    draft = page.evaluate('JSON.stringify(MoleculeBuilder.getDraft())')
    if captures:
        page.locator('#builder-title').evaluate("e=>e.scrollIntoView({block:'start'})")
        page.screenshot(path=str(captures / 'student-phone-builder.png'))
    q = page.locator('#sketch-guide')
    expect(q.locator('dl')).to_be_hidden()
    q.locator('summary').press('Enter')
    expect(q.locator('dl')).to_be_visible()
    if captures:
        q.screenshot(path=str(captures / 'sketch-guide.png'))
    choose_language(page, 'ar')
    expect(q.locator('dl')).to_be_visible()
    assert not semantics(page)['overflow']
    assert page.evaluate('JSON.stringify(MoleculeBuilder.getDraft())') == draft
    choose_language(page, 'en')
    print('PASS phone canvas, keyboard drawing tools, atom identity and localized sketch guide', flush=True)


def plate_workspace(page):
    """Trace two oxidations using the keyboard, including a broken and restored route."""
    def key(selector):
        page.locator(selector).press('Enter')

    route = page.locator('#plate-rack > [data-plate="5"] details.plate-route')
    summary = route.locator(':scope > summary')
    steps = route.locator('ol.plate-route-steps > li')
    missing = 'Earlier steps are unavailable for this plate.'

    def inspect_trace(partial=False):
        expect(summary).to_have_text('Trace route')
        expect(route).not_to_have_attribute('open', '')
        summary.press('Enter')
        expect(summary).to_be_focused()
        expect(steps).to_have_count(1 if partial else 2)
        if not partial:
            expect(steps.first).to_contain_text(re.compile(r'P1\b.*ethanol.*P3\b.*ethanal', re.I | re.S))
        expect(steps.last).to_contain_text(re.compile(r'P3\b.*ethanal.*P5\b.*ethanoic acid', re.I | re.S))
        if partial:
            expect(route.get_by_text(missing, exact=True)).to_be_visible()
        else:
            expect(route.get_by_text(missing, exact=True)).to_have_count(0)
        assert steps.evaluate_all('(nodes) => nodes.every(n => n.scrollWidth <= n.clientWidth + 1)'), 'Route step text overflows'
        assert not semantics(page)['overflow']
        summary.press('Space')
        expect(steps.last).to_be_hidden()
        expect(summary).to_be_focused()

    key('#show-reagents')
    key('#plate-lab > summary')
    page.locator('#plate-starter').select_option('8')
    key('#plate-load')
    cards = page.locator('#plate-rack > li')
    expect(cards).to_have_count(2)
    for i, condition in enumerate(('distil', 'reflux')):
        page.locator('#plate-condition').select_option(condition)
        key('#plate-preview')
        key('#plate-collect')
        expect(cards).to_have_count(i + 3)
        card = cards.nth(i + 2)
        card.get_by_role('button', name=re.compile('Compare with starting molecule')).press('Enter')
        expect(card.locator('.plate-comparison img')).to_have_count(2)
        card.locator('.plate-comparison summary').press('Enter')
        expect(card.locator('.plate-comparison details p')).to_be_visible()
        assert not semantics(page)['overflow']
    page.locator('#plate-left').select_option('3')
    key('#plate-preview')
    key('#plate-collect')
    expect(cards).to_have_count(5)
    inspect_trace()
    summary.press('Enter')
    expect(steps.last).to_be_visible()
    key('#plate-lab > summary')
    expect(route).not_to_have_attribute('open', '')
    key('#plate-lab > summary')
    key('#plate-files')
    expect(page.locator('#desk-files > summary')).to_be_focused()
    with page.expect_download() as event:
        key('#desk-file-download')
    download = event.value
    data = download.path().read_bytes()
    assert [p['history']['condition'] for p in json.loads(data)['bench']['plates'][2:]] == ['distil', 'reflux', 'reflux']
    file = {'name': download.suggested_filename, 'mimeType': 'application/json', 'buffer': data}
    page.reload(wait_until='domcontentloaded')
    expect(cards).to_have_count(0)
    page.locator('#desk-file-input').set_input_files(file)
    expect(cards).to_have_count(5)
    key('#show-reagents')
    key('#plate-lab > summary')
    for j in (2, 3):
        card = cards.nth(j)
        expect(card).to_contain_text('P1 + P2')
        card.get_by_role('button', name=re.compile('Compare with starting molecule')).press('Enter')
        expect(card.locator('.plate-comparison img')).to_have_count(2)
    inspect_trace()
    cards.nth(2).get_by_role('button', name=re.compile('^Remove P3')).press('Enter')
    expect(cards).to_have_count(4)
    inspect_trace(partial=True)
    key('#plate-files')
    page.locator('#desk-file-input').set_input_files(file)
    expect(cards).to_have_count(5)
    key('#show-reagents')
    inspect_trace()
    for control, partial in [('undo', True), ('redo', False)]:
        key('#plate-files')
        key('#desk-' + control)
        expect(cards).to_have_count(4 if partial else 5)
        key('#show-reagents')
        inspect_trace(partial)
    print(f'PASS keyboard plate comparisons, oxidation trace, file reload, removal and undo/redo at {page.viewport_size["width"]}px', flush=True)


def reaction_phone(page, captures=None):
    page.set_viewport_size({'width': 390, 'height': 844})
    preferences(page, text='large')
    page.locator('#show-reagents').click()
    page.locator('#rx-substrate').fill('C' * 70 + 'O')
    expect(page.locator('#rx-formula-note')).to_contain_text('C70H142O', timeout=30000)
    page.locator('#rx-inspect-details > summary').click()
    panel = page.locator('#rx-inspect-view')
    picker = panel.get_by_role('combobox', name='Focus on')
    picker.focus()
    picker.press('End')
    expect(panel.locator('img')).to_have_attribute('alt', re.compile(r'Connectivity around O71'))
    fit = panel.get_by_role('button', name='Fit', exact=True)
    for control in (picker, fit):
        control.scroll_into_view_if_needed()
        box = control.bounding_box()
        assert box and box['x'] >= -1 and box['x'] + box['width'] <= 391, box
    assert not semantics(page)['overflow'], 'Page overflows the phone viewport'
    if captures:
        panel.screenshot(path=str(captures / 'reaction-phone-site.png'))
    fit.click()
    expect(picker).to_have_value('')
    print('PASS phone-width large-text reaction inspector, 71-atom site focus and Fit', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--reaction-phone', action='store_true', help='Run only the phone-width large molecule inspector check.')
    parser.add_argument('--plate-workspace', action='store_true', help='Compare, save and reopen reaction plates at desktop and phone widths.')
    parser.add_argument('--browser-library-root')
    parser.add_argument('--disable-browser-sandbox', action='store_true')
    parser.add_argument('--screenshots', default='/tmp/bond-atlas-ui')
    parser.add_argument('--capture',action='store_true',help='Capture optional full-page visual references; functional checks do not require compositor snapshots.')
    args = parser.parse_args()
    if args.disable_browser_sandbox and urlparse(args.url).hostname not in ('localhost','127.0.0.1','::1'):
        raise SystemExit('Unsandboxed test browsers are restricted to the authorized local test site.')
    out = Path(args.screenshots)
    out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    if args.browser_library_root:
        root = Path(args.browser_library_root)
        env['LD_LIBRARY_PATH'] = str(root/'usr/lib') + ':' + str(root/'lib')
        env['FONTCONFIG_FILE'] = '/tmp/bond-atlas-browser/fontconfig.xml'
    errors, jobs = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(chromium_sandbox=not args.disable_browser_sandbox,args=['--disable-dev-shm-usage'],env=env)
        context = browser.new_context(viewport={'width':1440,'height':1050}, color_scheme='light')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console',lambda message: errors.append(message.text) if 'framebuffer is incomplete' in message.text.lower() or 'invalid_framebuffer' in message.text.lower() else None)
        page.on('request', lambda request: jobs.append(request.url) if request.method=='POST' and '/api/v1/jobs' in request.url else None)
        try:
            page.goto(args.url,wait_until='domcontentloaded',timeout=30000)
            if args.plate_workspace:
                for width in (1280, 390):
                    page.set_viewport_size({'width':width,'height':844})
                    page.goto(args.url, wait_until='domcontentloaded')
                    plate_workspace(page)
                assert not errors, errors
                return
            if args.reaction_phone:
                reaction_phone(page, out if args.capture else None)
                assert not errors, errors
                return
            opener = page.locator('#about-button')
            opener.focus()
            page.keyboard.press('Enter')
            expect(page.locator('#help-step')).to_be_focused()
            page.locator('#help-next').click()
            step = page.locator('#help-step').inner_text()
            page.keyboard.press('Escape')
            expect(opener).to_be_focused()
            page.keyboard.press('Enter')
            expect(page.locator('#help-step')).to_have_text(step)
            page.locator('#help-index').click()
            page.locator('#help-topic').select_option('trace-route')
            expect(page.locator('#help-since')).to_have_text('v3.6.0')
            page.locator('#help-start').click()
            expect(page.locator('#help-prev')).to_be_disabled()
            page.locator('#help-guide button[type="submit"]').click()
            expect(opener).to_be_focused()
            workspace_file_round_trip(page)
            page.locator('#show-stereo').click()
            expect(page.locator('#language-select option')).to_have_count(6)
            expect(page.locator('.stereo-variant')).to_have_count(2,timeout=20000)
            expect(page.locator('#stereo-make-conformers')).to_be_enabled()
            page.locator('#stereo-num-confs').fill('3')
            page.locator('#stereo-make-conformers').click()
            expect(page.locator('#stereo-status')).to_contain_text('Conformer sampling completed',timeout=30000)
            inspect_conformer(page)
            print('PASS clickable 3D atoms and keyboard distance/angle measurements', flush=True)
            page.locator('#together-button').click()
            page.wait_for_function('() => BondAtlas.state.together && !BondAtlas.state.pendingScene',timeout=30000)
            page.locator('#model3d').focus()
            before_camera=page.evaluate('BondAtlas.state.viewer.getView()')
            page.keyboard.press('ArrowRight')
            assert page.evaluate('BondAtlas.state.viewer.getView()') != before_camera
            page.keyboard.press('+')
            resize_stats=page.evaluate('''() => {
              const viewer=BondAtlas.state.viewer;viewer.resize();
              const before=ViewerLifecycle.getStats(viewer),renderer=viewer.getRenderer();
              for(let i=0;i<40;i++)renderer.setSize(viewer.getWidth(),viewer.getHeight());
              const after=ViewerLifecycle.getStats(viewer);
              return {before,after};
            }''')
            assert resize_stats['after']['applied']==resize_stats['before']['applied'],resize_stats
            assert resize_stats['after']['skipped']-resize_stats['before']['skipped']>=40,resize_stats
            print('PASS repeated same-size resizes reuse live WebGL framebuffer resources',flush=True)
            original = snapshot(page)
            job_count = len(jobs)
            for locale in LOCALES:
                choose_language(page,locale)
                assert snapshot(page) == original, (locale,snapshot(page),original)
                assert len(jobs)==job_count, 'Changing language submitted a chemistry job'
                assert page.evaluate('getComputedStyle(document.querySelector("#model3d")).direction') == 'ltr'
                checks=semantics(page)
                assert checks=={'unnamed':[],'buttons':[],'duplicates':[],'missing':[],'main':1,'overflow':False}, (locale,checks)
                assert not page.evaluate('''() => /\\b(?:shell|prefs|viewer|explorer)\\.[A-Za-z]/.test(document.body.innerText)'''), locale
                if args.capture: page.screenshot(path=str(out/(locale+'-desktop.png')),full_page=True,timeout=10000)
            loaded_fonts=page.evaluate('Array.from(document.fonts).filter(face=>face.status==="loaded").map(face=>face.family.replaceAll(String.fromCharCode(34),""))')
            assert 'Atlas Arabic' in loaded_fonts and 'Atlas Han' in loaded_fonts, loaded_fonts
            print('PASS six locales preserve molecules, camera and Together scene without submitting jobs',flush=True)
            page.locator('#show-explorer').click()
            page.locator('#show-stereo').click()
            page.evaluate('async () => { await new Promise(resolve=>requestAnimationFrame(resolve)); await new Promise(resolve=>requestAnimationFrame(resolve)); }')
            assert snapshot(page)==original,'Workspace navigation changed the selected scene or custom camera'
            print('PASS workspace navigation preserves the custom camera and Together scene',flush=True)
            # RTL changes visual tab navigation, never the molecule/canvas coordinate system.
            choose_language(page,'ar')
            page.locator('#tab-3d').focus();page.keyboard.press('ArrowLeft')
            expect(page.locator('#tab-skeletal')).to_be_focused()
            page.keyboard.press('Home');expect(page.locator('#tab-3d')).to_be_focused()
            choose_language(page,'en')
            page.locator('#rotate-button').click()
            assert page.evaluate('BondAtlas.state.rotating')
            preferences(page, theme='dark',contrast=True,motion=True,text='xlarge')
            assert not page.evaluate('BondAtlas.state.rotating')
            expect(page.locator('#rotate-button')).to_be_disabled()
            assert page.evaluate('getComputedStyle(document.querySelector(".spinner")).animationName')=='none'
            assert page.evaluate('parseFloat(getComputedStyle(document.documentElement).fontSize)')>=20
            preferences(page,theme='light',contrast=False,text='normal')
            page.locator('#preferences-button').click()
            for _ in range(12):
                page.keyboard.press('Tab')
                assert page.evaluate('!!document.activeElement.closest("#preferences-dialog")'),'Dialog focus escaped'
            page.keyboard.press('Escape')
            expect(page.locator('#preferences-dialog')).to_be_hidden()
            expect(page.locator('#preferences-button')).to_be_focused()
            stored=page.evaluate('JSON.parse(localStorage.getItem("bond-atlas.preferences.v1"))')
            assert set(stored)=={'language','theme','textSize','contrast','reduceMotion'},stored
            print('PASS RTL tabs, keyboard camera, dialog focus, larger text, contrast and reduced motion',flush=True)
            # Delay an actual conformer result, switch languages, then permit its
            # original calculation to commit without cancellation/reinitialization.
            page.evaluate('''() => {
              window.__originalUIJob=ChemistryClient.job;
              ChemistryClient.job=async function(operation,payload,options){
                const result=await window.__originalUIJob(operation,payload,options);
                if(operation==='conformers') await new Promise(resolve=>window.__releaseUIJob=resolve);
                return result;
              };
            }''')
            page.locator('#stereo-num-confs').fill('2');page.locator('#stereo-make-conformers').click()
            expect(page.locator('#stereo-explorer')).to_have_attribute('aria-busy','true')
            page.wait_for_function('() => typeof window.__releaseUIJob === "function"',timeout=30000)
            pending_record=page.evaluate('JSON.stringify(BondAtlas.state.selected)')
            choose_language(page,'es')
            assert page.evaluate('JSON.stringify(BondAtlas.state.selected)')==pending_record
            expect(page.locator('#stereo-explorer')).to_have_attribute('aria-busy','true')
            page.evaluate('window.__releaseUIJob()')
            expect(page.locator('#stereo-explorer')).to_have_attribute('aria-busy','false',timeout=30000)
            assert not page.locator('#stereo-error').is_visible()
            page.evaluate('() => { ChemistryClient.job=window.__originalUIJob; }')
            choose_language(page,'en')
            print('PASS a real pending chemistry result survives locale switching and commits normally',flush=True)
            # The same selected record survives locale changes while editing a draft.
            page.locator('#edit-in-builder').click()
            expect(page.locator('#builder-open-viewer')).to_be_enabled(timeout=20000)
            atom=page.locator('#builder-canvas [data-atom="0"]')
            atom.press('ArrowRight')
            draft=page.evaluate('JSON.stringify(MoleculeBuilder.getDraft())')
            page.evaluate('window.__focusedAtom=document.activeElement; AtlasPreferences.set("language","fr")')
            assert page.evaluate('document.activeElement===window.__focusedAtom')
            assert page.evaluate('JSON.stringify(MoleculeBuilder.getDraft())')==draft
            expect(page.locator('#builder-undo')).to_be_enabled()
            page.locator('#builder-undo').click()
            assert page.evaluate('JSON.stringify(MoleculeBuilder.getDraft())')!=draft
            print('PASS locale switching retains builder draft, focus, selection and Undo',flush=True)
            page.locator('#show-stereo').click()
            page.set_viewport_size({'width':390,'height':844})
            preferences(page,text='normal')
            student_walkthrough(page,out if args.capture else None)
            page.locator('#show-stereo').click()
            for locale in LOCALES:
                choose_language(page,locale)
                preferences(page,theme='dark' if locale in ('ar','de','zh-Hans') else 'light',text='large')
                checks=semantics(page)
                assert not checks['overflow'],(locale,checks)
                if args.capture: page.screenshot(path=str(out/(locale+'-phone.png')),full_page=True,timeout=10000)
            page.set_viewport_size({'width':720,'height':650})
            preferences(page,text='xlarge',contrast=True)
            assert not semantics(page)['overflow'],'200% viewport reflow with enlarged text overflowed'
            print('PASS six phone locales, Arabic/CJK font loading and enlarged-text reflow',flush=True)
            # Stored preferences, not chemistry, survive a new page in the same context.
            persisted = context.new_page();persisted.goto(args.url,wait_until='domcontentloaded')
            expect(persisted.locator('#language-select')).to_have_value('de')
            expect(persisted.locator('html')).to_have_attribute('data-text-size','xlarge')
            persisted.close()
            blocked = browser.new_context(viewport={'width':390,'height':844})
            blocked.add_init_script('Object.defineProperty(window,"localStorage",{get(){throw new Error("Blocked storage")}})')
            blocked.route('**/*',lambda route:route.continue_() if route.request.url.startswith(args.url) else route.abort())
            fallback=blocked.new_page();fallback.on('pageerror',lambda error:errors.append(str(error)))
            fallback.goto(args.url,wait_until='domcontentloaded')
            expect(fallback.locator('#language-select')).to_have_value('en')
            fallback.locator('#language-select').select_option('ar')
            expect(fallback.locator('html')).to_have_attribute('dir','rtl')
            fallback.evaluate('async () => { await document.fonts.ready; }')
            assert fallback.evaluate('Array.from(document.fonts).some(face=>face.status==="loaded" && face.family.includes("Atlas Arabic"))')
            blocked.close()
            choose_language(page,'en')
            page.locator('#show-explorer').click()
            page.locator('#input-mode').select_option('smiles')
            page.locator('#formula-input').fill('N#CCC1CC(O)CC1')
            page.locator('#find-button').click()
            expect(page.locator('#notes-groups')).to_contain_text('Nitrile')
            expect(page.locator('#notes-hbond')).to_contain_text('donor sites: 1; acceptor sites: 2')
            page.locator('#structure-notes summary').click()
            expect(page.locator('#notes-sites')).to_contain_text('≡')
            expect(page.locator('#notes-topology')).to_contain_text('Independent rings: 1')
            page.locator('[data-formula="C2H6O"]').click()
            expect(page.locator('#formula-conclusion')).to_contain_text('neutral model: 2')
            page.locator('#formula-reasoning summary').focus();page.keyboard.press('Enter')
            expect(page.locator('#reason-skeletons')).to_be_visible()
            expect(page.locator('#reason-skeletons')).to_contain_text('arrangements: 2')
            expect(page.locator('#reason-layers')).to_contain_text('no rings')
            page.locator('#formula-reasoning a').focus();page.keyboard.press('Enter')
            expect(page.locator('#isomer-list')).to_be_focused()
            expect(page.locator('#notes-limits')).to_contain_text('selected candidate')
            page.locator('#group-filter').select_option('ether')
            expect(page.locator('#notes-hbond')).to_contain_text('No O–H or N–H bond')
            expect(page.locator('#notes-sites')).to_be_empty()
            print('PASS structure notes explain a new graph and update for formula candidates',flush=True)
            assert not errors,errors
            print('PASS preference persistence and unavailable-storage fallback; no page errors',flush=True)
        except Exception:
            print('UI diagnostics:',json.dumps({'errors':errors,'semantics':semantics(page)},ensure_ascii=False),flush=True)
            page.screenshot(path=str(out/'ui-failure.png'),full_page=True)
            raise
        finally:
            context.close();browser.close()
    print('PASS UI accessibility/localization integration checks',flush=True)


if __name__=='__main__':
    main()
