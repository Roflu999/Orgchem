"""Additional real-browser checks for linked projections, editing and file round trips."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--browser-library-root')
    parser.add_argument('--disable-browser-sandbox',action='store_true')
    args=parser.parse_args()
    if args.disable_browser_sandbox and urlparse(args.url).hostname not in ('localhost','127.0.0.1','::1'):
        raise SystemExit('Unsandboxed test browsers are restricted to the explicitly authorized local test site.')
    env=dict(os.environ)
    if args.browser_library_root:
        root=Path(args.browser_library_root)
        env['LD_LIBRARY_PATH']=str(root/'usr/lib')+':'+str(root/'lib')
        env['FONTCONFIG_FILE']='/tmp/bond-atlas-browser/fontconfig.xml'
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(chromium_sandbox=not args.disable_browser_sandbox,args=['--disable-dev-shm-usage'],env=env)
        page=browser.new_page(viewport={'width':1440,'height':1000},color_scheme='light')
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if 'framebuffer is incomplete' in m.text.lower() else None)
        page.goto(args.url,wait_until='domcontentloaded',timeout=20000)
        page.locator('#show-stereo').click()
        def wait_projection():
            try:expect(page.locator('#textbook-content img.linked-projection')).to_be_visible(timeout=20000)
            except Exception:
                print('Projection diagnostic:',page.locator('#textbook-content').inner_text(),page.locator('#textbook-note').inner_text(),flush=True)
                page.screenshot(path='/tmp/bond-atlas-browser/projection-failure.png',full_page=True)
                raise
        expect(page.locator('#stereo-generate')).to_be_enabled(timeout=10000)
        page.locator('#stereo-example').select_option('lactic');page.locator('#stereo-generate').click()
        expect(page.locator('#stereo-status')).to_contain_text('Stereoisomer results updated',timeout=15000)
        page.locator('#stereo-num-confs').fill('3');page.locator('#stereo-make-conformers').click()
        expect(page.locator('#stereo-status')).to_contain_text('Conformer sampling completed',timeout=20000)
        ids=page.locator('#stereo-conformer').evaluate('(s)=>Array.from(s.options).map(o=>o.value)')
        assert len(ids)>1
        page.locator('#stereo-conformer').select_option(ids[1])
        original=page.evaluate('()=>({stereo:BondAtlas.state.selected.stereoisomerId,conformer:BondAtlas.state.selected.selectedConformerId})')
        page.locator('#tab-newman').click()
        wait_projection()
        page.locator('#tab-fischer').click()
        wait_projection()
        print('PASS real linked Fischer / Newman views')
        page.locator('#edit-in-builder').click()
        expect(page.locator('#builder-panel')).to_be_visible()
        assert page.evaluate('()=>MoleculeBuilder.getDraft().engine')=='rdkit'
        atom=page.locator('#builder-canvas [data-atom="0"] circle').first.bounding_box()
        x,y=atom['x']+atom['width']/2,atom['y']+atom['height']/2
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+20,y+10,steps=5);page.mouse.up()
        page.locator('#builder-open-viewer').click()
        expect(page.locator('#builder-panel')).to_be_hidden(timeout=15000)
        state=page.evaluate('()=>({stereo:BondAtlas.state.selected.stereoisomerId,conformer:BondAtlas.state.selected.selectedConformerId})')
        assert state==original,(state,original)
        print('PASS assigned builder coordinate edit retains stereoisomer and selected conformer')
        page.locator('#export-format').select_option('json');page.locator('#preview-export').click()
        expect(page.locator('#export-dialog')).to_be_visible(timeout=15000)
        text=page.locator('#export-text').input_value();saved=json.loads(text)
        assert saved['molecules'][0]['selectedConformerId']==original['conformer']
        page.locator('#close-export').click()
        page.locator('#show-explorer').click()
        page.locator('#open-import').click()
        page.locator('#import-format').select_option('json');page.locator('#import-text').fill(text);page.locator('#apply-import').click()
        try:expect(page.locator('#import-dialog')).to_be_hidden(timeout=20000)
        except Exception:
            print('Import diagnostic:',page.locator('#import-error').inner_text(),'PROGRESS:',page.locator('#import-progress').inner_text(),'BUTTON:',page.locator('#apply-import').is_enabled(),flush=True)
            page.screenshot(path='/tmp/bond-atlas-browser/import-failure.png',full_page=True)
            raise
        state=page.evaluate('()=>({stereo:BondAtlas.state.selected.stereoisomerId,conformer:BondAtlas.state.selected.selectedConformerId})')
        assert state==original,(state,original)
        print('PASS v3 JSON export/import preserves selected conformer and configuration')
        page.locator('#show-stereo').click();page.locator('#stereo-input').fill('c1ccccc1');page.locator('#stereo-generate').click()
        expect(page.locator('#stereo-status')).to_contain_text('Stereoisomer results updated',timeout=15000)
        expect(page.locator('.stereo-variant')).to_have_count(1)
        page.locator('#stereo-num-confs').fill('1');page.locator('#stereo-make-conformers').click()
        expect(page.locator('#stereo-status')).to_contain_text('Conformer sampling completed',timeout=15000)
        page.locator('#tab-3d').click();page.locator('#cloud-button').click()
        assert page.evaluate('()=>BondAtlas.state.electronShapes.length')==2
        assert page.evaluate('()=>BondAtlas.state.electronShapes.every(s=>s.opacity>=.8)')
        page.locator('#model-stage').screenshot(path='/tmp/bond-atlas-browser/benzene-clouds.png')
        print('PASS benzene π-cloud meshes in real WebGL')
        atoms=page.evaluate('()=>BondAtlas.geometry3D(BondAtlas.state.selected).atoms')
        bohr=.529177210903
        rows=['Synthetic integration-test grid; NOT experimental density','Single scalar test surface',str(len(atoms))+' -8 -8 -8','2 16 0 0','2 0 16 0','2 0 0 16']
        atomic={'C':6,'H':1}
        rows.extend(str(atomic[a['e']])+' 0 '+' '.join(str(a[k]/bohr) for k in ('x','y','z')) for a in atoms)
        rows.append('0 1 1 1 1 1 1 1')
        page.locator('#quantum-grid-panel summary').click()
        page.locator('#quantum-grid-file').set_input_files({'name':'synthetic-test.cube','mimeType':'text/plain','buffer':'\n'.join(rows).encode()})
        expect(page.locator('#quantum-grid-status')).to_contain_text('Loaded',timeout=10000)
        page.locator('#quantum-grid-show').click()
        expect(page.locator('#quantum-grid-status')).to_contain_text('Showing supplied density',timeout=10000)
        page.locator('#quantum-grid-clear').click()
        print('PASS supplied CUBE alignment validation and actual volumetric renderer')
        assert not errors,errors
        browser.close()
    print('PASS browser integration checks; no JavaScript page errors')


if __name__=='__main__':main()
