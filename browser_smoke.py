"""Drive the real local website. Requires explicitly installed Playwright/Chromium."""
import argparse
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--url', default='http://127.0.0.1:8000')
    args.add_argument('--browser-library-root', help='Optional isolated native-library root for minimal Linux environments.')
    args.add_argument('--disable-browser-sandbox', action='store_true', help='Only use with explicit authorization for an isolated local test browser.')
    args.add_argument('--screenshots', default='/tmp/bond-atlas-browser')
    options = args.parse_args()
    if options.disable_browser_sandbox and urlparse(options.url).hostname not in ('localhost','127.0.0.1','::1'):
        raise SystemExit('Unsandboxed test browsers are restricted to the authorized local test site.')
    out = Path(options.screenshots)
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as p:
        environment = dict(os.environ)
        if options.browser_library_root:
            prefix=Path(options.browser_library_root)
            environment['LD_LIBRARY_PATH']=str(prefix/'usr/lib')+':'+str(prefix/'lib')
            environment['FONTCONFIG_PATH']=str(prefix/'etc/fonts')
            fontconfig=out/'fontconfig.xml'
            fontconfig.write_text('<fontconfig><dir>'+str(prefix/'usr/share/fonts')+'</dir><cachedir>'+str(out/'font-cache')+'</cachedir><alias><family>sans-serif</family><prefer><family>Liberation Sans</family></prefer></alias><alias><family>serif</family><prefer><family>Liberation Serif</family></prefer></alias><alias><family>monospace</family><prefer><family>Liberation Mono</family></prefer></alias></fontconfig>')
            environment['FONTCONFIG_FILE']=str(fontconfig)
        browser = p.chromium.launch(chromium_sandbox=not options.disable_browser_sandbox, args=['--disable-dev-shm-usage'], env=environment)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, color_scheme='light')
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(options.url, wait_until='domcontentloaded', timeout=90000)
        rows = page.locator('#desk-rows .desk-row')
        rows.first.get_by_role('textbox').fill('ethane')
        rows.first.get_by_role('button', name='Duplicate').click()
        rows.nth(1).get_by_role('textbox').fill('hexane')
        page.locator('#desk-3d').click()
        expect(page.locator('#desk-status')).to_have_text('Models shown: 2', timeout=30000)
        expect(page.locator('#desk-3d')).to_have_attribute('aria-pressed','true')
        expect(page.locator('#desk-stage canvas')).to_be_visible()
        for row in (rows.first, rows.nth(1)):
            row.locator('summary').click()
            expect(row.locator('output')).to_contain_text('Å')
        lengths=[float(r.locator('.row-measures p').inner_text().split(': ')[1].split(' ')[0]) for r in (rows.first, rows.nth(1))]
        assert lengths[1] > lengths[0], lengths
        page.screenshot(path=str(out/'common-scale-models.png'))
        page.locator('#show-stereo').click()
        expect(page.locator('#stereo-generate')).to_be_enabled(timeout=15000)
        page.screenshot(path=str(out/'desktop-start.png'), full_page=True)
        page.locator('#stereo-example').select_option('lactic')
        page.locator('#stereo-generate').click()
        expect(page.locator('.stereo-variant')).to_have_count(2, timeout=20000)
        expect(page.locator('#stereo-status')).to_contain_text('Stereoisomer results updated', timeout=20000)
        page.locator('#stereo-num-confs').fill('4')
        page.locator('#stereo-make-conformers').click()
        expect(page.locator('#stereo-status')).to_contain_text('Conformer sampling completed', timeout=30000)
        expect(page.locator('#stereo-conformer option')).not_to_have_count(1)
        page.screenshot(path=str(out/'desktop-stereo.png'), full_page=True)
        print('Conformers:', page.locator('#stereo-conformer option').count())
        print('Viewer mode:',page.evaluate('BondAtlas.state.mode'))
        print('WebGL fallback:',page.evaluate('BondAtlas.state.renderFailed'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Desktop page overflow'
        # Browser-side use of the typed public API exercises the same selected records.
        page.locator('#tab-fischer').click()
        expect(page.locator('#textbook-content img.linked-projection')).to_be_visible(timeout=20000)
        page.screenshot(path=str(out/'desktop-fischer.png'),full_page=True)
        mobile = browser.new_page(viewport={'width':390,'height':844},color_scheme='dark',is_mobile=True,has_touch=True)
        mobile.on('pageerror',lambda e: errors.append(str(e)))
        mobile.goto(options.url,wait_until='domcontentloaded',timeout=90000)
        mobile.locator('#show-stereo').click()
        expect(mobile.locator('#stereo-generate')).to_be_enabled(timeout=15000)
        mobile.locator('#stereo-example').select_option('diol')
        mobile.locator('#stereo-generate').click()
        expect(mobile.locator('.stereo-variant')).to_have_count(3,timeout=20000)
        mobile.screenshot(path=str(out/'phone-dark.png'),full_page=True)
        mobile.locator('#workspace').scroll_into_view_if_needed()
        mobile.screenshot(path=str(out/'phone-viewer-dark.png'))
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Phone page overflow'
        print('Phone width:',mobile.evaluate('document.documentElement.scrollWidth'))
        browser.close()
    assert not errors, '\n'.join(errors)
    print('PASS live browser stereo enumeration / conformer flow, no page errors')


if __name__=='__main__':
    main()
