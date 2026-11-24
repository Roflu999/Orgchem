"""Real-browser regressions for composed chemistry workflows and superseded actions."""
import argparse
import json
import os
from pathlib import Path
import traceback
import time
import urllib.request
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect


def generate(page, example='diol'):
    page.locator('#stereo-example').select_option(example)
    page.locator('#stereo-generate').click()
    expect(page.locator('#stereo-status')).to_contain_text('Stereoisomer results updated', timeout=20000)


def conformers(page, count=3):
    page.locator('#stereo-num-confs').fill(str(count))
    page.locator('#stereo-make-conformers').click()
    expect(page.locator('#stereo-status')).to_contain_text('Conformer sampling completed', timeout=30000)


def selected_state(page):
    return page.evaluate('''() => {
      const summary = m => ({id:m?.id, stereo:m?.stereoisomerId,
        selected:m?.selectedConformerId || m?.conformers?.[0]?.id || null,
        conformers:(m?.conformers || []).map(c => c.id)});
      return {workspace:summary(BondAtlas.state.selected),
        stereo:summary(StereoExplorer.selectedMolecule()),
        together:BondAtlas.state.together,mode:BondAtlas.state.mode};
    }''')


def compare_together_reselect(page):
    generate(page)
    expect(page.locator('.stereo-variant')).to_have_count(3)
    page.locator('.stereo-compare-check input').nth(0).check()
    page.locator('.stereo-compare-check input').nth(1).check()
    page.locator('#stereo-together').click()
    page.wait_for_function('() => BondAtlas.state.together && !BondAtlas.state.pendingScene', timeout=30000)
    assert page.evaluate('BondAtlas.state.sceneGeometries.length') == 2
    page.locator('.stereo-variant-select').nth(1).click()
    state = selected_state(page)
    assert state['workspace'] == state['stereo'], state
    assert state['workspace']['conformers'], 'Selecting a prepared comparison variant discarded its conformers'
    assert page.locator('#stereo-conformer').is_enabled(), state
    assert page.evaluate('BondAtlas.state.result.isomers.length') == 3


def together_superseded_by_projection(page):
    generate(page)
    conformers(page)
    page.evaluate('''() => {
      const original = ChemistryClient.job;
      window.__heldConformer = null;
      ChemistryClient.job = async function(operation,payload,options) {
        const result = await original(operation,payload,options);
        if(operation === 'conformers' && !window.__heldConformer) {
          await new Promise(resolve => { window.__heldConformer = resolve; });
        }
        return result;
      };
    }''')
    page.locator('#together-button').click()
    page.wait_for_function('() => typeof window.__heldConformer === "function"', timeout=20000)
    page.locator('#tab-fischer').click()
    expect(page.locator('#textbook-content img.linked-projection')).to_be_visible(timeout=20000)
    page.evaluate('window.__heldConformer()')
    # A later request is a barrier: any incorrectly continued scene preparation
    # gets time to finish without relying on a fixed sleep.
    page.evaluate('''async () => {
      await ChemistryClient.job('parse',{text:'CCO',format:'smiles'});
      for(let i=0;i<3;i++) await new Promise(resolve=>requestAnimationFrame(resolve));
    }''')
    page.wait_for_function('() => !BondAtlas.state.pendingScene', timeout=20000)
    state = selected_state(page)
    assert state['mode'] == 'fischer' and not state['together'], state


def torsion_conformer_roundtrip(page):
    page.locator('#stereo-input').fill('CCCC')
    page.locator('#stereo-generate').click()
    expect(page.locator('#stereo-status')).to_contain_text('Stereoisomer results updated', timeout=20000)
    conformers(page)
    page.locator('.stereo-projection-disclosure summary').click()
    bond = page.evaluate('BondAtlas.state.selected.bonds.find(b=>b.a===1 && b.b===2).id')
    page.locator('#stereo-bond').select_option(bond)
    page.locator('#stereo-project').click()
    expect(page.locator('#stereo-status')).to_contain_text('Linked projection updated', timeout=20000)
    expect(page.locator('#stereo-apply-torsion')).to_be_enabled()
    before = selected_state(page)
    page.locator('#stereo-dihedral').fill('65')
    page.locator('#stereo-apply-torsion').click()
    expect(page.locator('#stereo-status')).to_contain_text('Linked projection updated', timeout=20000)
    after = selected_state(page)
    assert after['workspace'] == after['stereo'], after
    assert after['workspace']['stereo'] == before['workspace']['stereo']
    assert after['workspace']['selected'] != before['workspace']['selected'], (before, after)
    page.locator('#export-format').select_option('json')
    page.locator('#preview-export').click()
    expect(page.locator('#export-dialog')).to_be_visible(timeout=20000)
    text = page.locator('#export-text').input_value()
    assert json.loads(text)['molecules'][0]['selectedConformerId'] == after['workspace']['selected']
    page.locator('#close-export').click()
    page.locator('#show-explorer').click()
    page.locator('#open-import').click()
    page.locator('#import-format').select_option('json')
    page.locator('#import-text').fill(text)
    page.locator('#apply-import').click()
    expect(page.locator('#import-dialog')).to_be_hidden(timeout=20000)
    imported = selected_state(page)
    assert imported['workspace'] == after['workspace'], (after, imported)
    assert imported['workspace'] == imported['stereo'], imported
    # Layer a coordinate-only builder edit onto the imported torsion state.
    page.locator('#edit-in-builder').click()
    expect(page.locator('#builder-open-viewer')).to_be_enabled(timeout=15000)
    page.locator('#builder-canvas [data-atom="0"]').press('ArrowRight')
    page.locator('#builder-open-viewer').click()
    expect(page.locator('#builder-panel')).to_be_hidden(timeout=20000)
    edited = selected_state(page)
    assert edited['workspace'] == after['workspace'], (after, edited)
    assert edited['workspace'] == edited['stereo'], edited
    provenance = page.evaluate('BondAtlas.state.selected.conformers.at(-1).torsion')
    assert provenance and provenance['requestedAngle'] == 65, provenance


def builder_edit_undo_conformer(page):
    generate(page, 'lactic')
    conformers(page)
    ids = page.locator('#stereo-conformer').evaluate('(select)=>Array.from(select.options,o=>o.value)')
    page.locator('#stereo-conformer').select_option(ids[1])
    coordinates = page.evaluate('BondAtlas.geometry3D(BondAtlas.state.selected).atoms.map(a=>[a.x,a.y,a.z])')
    conformers(page, 1)
    assert page.evaluate('BondAtlas.geometry3D(BondAtlas.state.selected).atoms.map(a=>[a.x,a.y,a.z])') == coordinates
    assert len(selected_state(page)['workspace']['conformers']) == 1
    original = selected_state(page)
    page.locator('#edit-in-builder').click()
    expect(page.locator('#builder-open-viewer')).to_be_enabled(timeout=15000)
    # Change the hydroxyl oxygen's charge using the actual editor controls.
    page.locator('#builder-canvas [data-atom="2"]').press('Enter')
    page.locator('#builder-charge').select_option('-1')
    expect(page.locator('#builder-open-viewer')).to_be_enabled(timeout=15000)
    page.locator('#builder-undo').click()
    expect(page.locator('#builder-open-viewer')).to_be_enabled(timeout=15000)
    page.locator('#builder-open-viewer').click()
    expect(page.locator('#builder-panel')).to_be_hidden(timeout=15000)
    restored = selected_state(page)
    assert restored['workspace'] == original['workspace'], (original, restored)
    assert restored['workspace'] == restored['stereo'], restored
    # Reopen, repeat the chemical edit, and commit it: no old 3D geometry may survive.
    page.locator('#edit-in-builder').click()
    expect(page.locator('#builder-open-viewer')).to_be_enabled(timeout=15000)
    page.locator('#builder-canvas [data-atom="2"]').press('Enter')
    page.locator('#builder-charge').select_option('-1')
    expect(page.locator('#builder-open-viewer')).to_be_enabled(timeout=15000)
    page.locator('#builder-open-viewer').click()
    expect(page.locator('#builder-panel')).to_be_hidden(timeout=15000)
    edited = selected_state(page)
    assert not edited['workspace']['conformers'], edited
    assert edited['workspace'] == edited['stereo'], edited
    assert page.evaluate('BondAtlas.state.selected.charge') == -1
    assert edited['mode'] != '3d', edited


def grid_replacement_and_conformer_switch(page):
    generate(page, 'lactic')
    conformers(page)
    atoms = page.evaluate('BondAtlas.geometry3D(BondAtlas.state.selected).atoms')
    numbers = {'C':6, 'H':1, 'O':8}
    bohr = .529177210903
    rows = ['Synthetic browser regression, NOT experimental density', 'Single scalar teaching test',
            str(len(atoms)) + ' -8 -8 -8', '2 16 0 0', '2 0 16 0', '2 0 0 16']
    rows.extend(str(numbers[a['e']]) + ' 0 ' + ' '.join(str(a[k] / bohr) for k in ('x','y','z')) for a in atoms)
    rows.append('0 1 1 1 1 1 1 1')
    cube = '\n'.join(rows).encode()
    page.locator('#quantum-grid-panel summary').click()
    upload = page.locator('#quantum-grid-file')
    upload.set_input_files({'name':'matching.cube','mimeType':'text/plain','buffer':cube})
    expect(page.locator('#quantum-grid-status')).to_contain_text('Loaded')
    page.locator('#quantum-grid-show').click()
    expect(page.locator('#quantum-grid-status')).to_contain_text('Showing supplied density')
    assert page.evaluate('BondAtlas.state.viewer.shapes.filter(Boolean).length') == 1
    upload.set_input_files({'name':'invalid.cube','mimeType':'text/plain','buffer':b'invalid'})
    expect(page.locator('#quantum-grid-status')).to_contain_text('incomplete')
    assert page.evaluate('BondAtlas.state.viewer.shapes.filter(Boolean).length') == 0, 'Previous density remained visible after a rejected replacement'
    # A superseded slow file read must not reinstate an older dataset.
    page.evaluate('''() => {
      const original = File.prototype.text;
      File.prototype.text = async function() {
        const text = await original.call(this);
        if(this.name === 'slow.cube') await new Promise(resolve=>window.__releaseGridRead=resolve);
        return text;
      };
    }''')
    upload.set_input_files({'name':'slow.cube','mimeType':'text/plain','buffer':cube})
    page.wait_for_function('() => typeof window.__releaseGridRead === "function"')
    upload.set_input_files({'name':'newer-invalid.cube','mimeType':'text/plain','buffer':b'invalid'})
    expect(page.locator('#quantum-grid-status')).to_contain_text('incomplete')
    page.evaluate('''async () => {
      window.__releaseGridRead();
      await new Promise(resolve=>requestAnimationFrame(resolve));
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }''')
    expect(page.locator('#quantum-grid-status')).to_contain_text('incomplete')
    page.locator('#quantum-grid-show').click()
    expect(page.locator('#quantum-grid-status')).to_contain_text('Choose a valid CUBE')
    upload.set_input_files({'name':'restored.cube','mimeType':'text/plain','buffer':cube})
    expect(page.locator('#quantum-grid-status')).to_contain_text('Loaded')
    page.locator('#quantum-grid-show').click()
    expect(page.locator('#quantum-grid-status')).to_contain_text('Showing supplied density')
    ids = page.locator('#stereo-conformer').evaluate('(select)=>Array.from(select.options,o=>o.value)')
    page.locator('#stereo-conformer').select_option(ids[1])
    expect(page.locator('#quantum-grid-status')).to_contain_text('Grid removed because')
    assert page.evaluate('BondAtlas.state.viewer.shapes.filter(Boolean).length') == 0
    page.locator('#quantum-grid-show').click()
    expect(page.locator('#quantum-grid-status')).to_contain_text('do not align')
    assert page.evaluate('BondAtlas.state.viewer.shapes.filter(Boolean).length') == 0


def import_file_read_superseded_by_paste(page):
    page.locator('#show-explorer').click()
    page.locator('#open-import').click()
    page.evaluate('''() => {
      const original = File.prototype.text;
      File.prototype.text = async function() {
        const text = await original.call(this);
        if(this.name === 'older.smi') await new Promise(resolve=>window.__releaseMoleculeRead=resolve);
        return text;
      };
    }''')
    page.locator('#file-input').set_input_files({'name':'older.smi','mimeType':'text/plain','buffer':b'CCO'})
    page.wait_for_function('() => typeof window.__releaseMoleculeRead === "function"')
    page.locator('#import-format').select_option('smiles')
    page.locator('#import-text').fill('CCN')
    page.evaluate('''async () => {
      window.__releaseMoleculeRead();
      await new Promise(resolve=>requestAnimationFrame(resolve));
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }''')
    expect(page.locator('#import-text')).to_have_value('CCN')
    expect(page.locator('#apply-import')).to_be_enabled()
    page.locator('#apply-import').click()
    expect(page.locator('#import-dialog')).to_be_hidden(timeout=20000)
    assert page.evaluate('BondAtlas.state.selected.formula') == 'C2H7N'
    assert selected_state(page)['workspace'] == selected_state(page)['stereo']


def duplicate_sources_together(page):
    generate(page, 'lactic')
    page.locator('#export-format').select_option('json')
    page.locator('#preview-export').click()
    expect(page.locator('#export-dialog')).to_be_visible(timeout=20000)
    data = json.loads(page.locator('#export-text').input_value())
    data['molecules'] = [data['molecules'][0], data['molecules'][0]]
    page.locator('#close-export').click()
    page.locator('#show-explorer').click()
    page.locator('#open-import').click()
    page.locator('#import-format').select_option('json')
    page.locator('#import-text').fill(json.dumps(data))
    page.locator('#apply-import').click()
    expect(page.locator('#import-dialog')).to_be_hidden(timeout=20000)
    before = page.evaluate('BondAtlas.state.result.isomers.map(m=>m.id)')
    assert len(before) == len(set(before)) == 2, before
    page.locator('#show-stereo').click()
    conformers(page, 1)
    page.locator('#together-button').click()
    page.wait_for_function('() => BondAtlas.state.together && !BondAtlas.state.pendingScene', timeout=30000)
    after = page.evaluate('BondAtlas.state.result.isomers.map(m=>m.id)')
    assert after == before, (before, after)
    page.locator('.stereo-variant-select').nth(1).click()
    state = selected_state(page)
    assert state['workspace']['id'] == before[1], state
    assert state['workspace'] == state['stereo'], state
    assert state['workspace']['conformers'], state


CASES = {
    'duplicate-sources-together': duplicate_sources_together,
    'import-file-read-superseded-by-paste': import_file_read_superseded_by_paste,
    'grid-replacement-and-conformer-switch': grid_replacement_and_conformer_switch,
    'builder-edit-undo-conformer': builder_edit_undo_conformer,
    'compare-together-reselect': compare_together_reselect,
    'together-superseded-by-projection': together_superseded_by_projection,
    'torsion-conformer-roundtrip': torsion_conformer_roundtrip,
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--browser-library-root')
    parser.add_argument('--disable-browser-sandbox', action='store_true')
    parser.add_argument('--screenshots', default='/tmp/bond-atlas-layered')
    parser.add_argument('--case', action='append', choices=CASES)
    parser.add_argument('--repeat', type=int, choices=range(1, 11), default=1)
    parser.add_argument('--mobile', action='store_true', help='Run the same composed workflows at phone width in dark mode.')
    args = parser.parse_args()
    if args.disable_browser_sandbox and urlparse(args.url).hostname not in ('localhost', '127.0.0.1', '::1'):
        raise SystemExit('Unsandboxed test browsers are restricted to the authorized local test site.')
    out = Path(args.screenshots)
    out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    if args.browser_library_root:
        root = Path(args.browser_library_root)
        env['LD_LIBRARY_PATH'] = str(root / 'usr/lib') + ':' + str(root / 'lib')
        env['FONTCONFIG_FILE'] = '/tmp/bond-atlas-browser/fontconfig.xml'
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(chromium_sandbox=not args.disable_browser_sandbox,
                                   args=['--disable-dev-shm-usage'], env=env)
        try:
            for run in range(args.repeat):
                for name in args.case or CASES:
                    page = browser.new_page(viewport={'width':390,'height':844} if args.mobile else {'width':1440,'height':1000},
                                            color_scheme='dark' if args.mobile else 'light',
                                            is_mobile=args.mobile, has_touch=args.mobile)
                    errors,submitted = [],[]
                    started=time.monotonic()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    def remember_job(response):
                        if response.request.method=='POST' and response.url.endswith('/api/v1/jobs') and response.status==202:
                            try:
                                data=response.json();submitted.append({'id':data['id'],'operation':data['operation']})
                            except Exception:
                                pass
                    page.on('response',remember_job)
                    try:
                        page.goto(args.url, wait_until='domcontentloaded', timeout=20000)
                        page.locator('#show-stereo').click()
                        expect(page.locator('#stereo-generate')).to_be_enabled(timeout=15000)
                        CASES[name](page)
                        assert not errors, errors
                        state = selected_state(page)
                        assert state['workspace'] == state['stereo'], state
                        identities = page.evaluate('BondAtlas.state.result.isomers.map(m=>m.id)')
                        assert len(identities) == len(set(identities)), identities
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal page overflow'
                        page.screenshot(path=str(out / (name + ('-mobile' if args.mobile else '') + '.png')), full_page=True)
                        print('PASS', name, 'round', run + 1, 'seconds',round(time.monotonic()-started,2),flush=True)
                    except Exception as error:
                        failures.append((name, str(error)))
                        print('FAIL', name, 'round', run + 1, str(error), flush=True)
                        traceback.print_exc()
                        # Diagnose the server independently of a stalled renderer.
                        for item in submitted[-3:]:
                            try:
                                with urllib.request.urlopen(args.url+'/api/v1/jobs/'+item['id'],timeout=3) as response:
                                    job=json.load(response)
                                print('JOB',item['operation'],job['status'],job.get('error'),flush=True)
                            except Exception as diagnostic:
                                print('JOB diagnostic unavailable:',type(diagnostic).__name__,flush=True)
                        try:
                            print('BUILDER',page.locator('#builder-message').inner_text(timeout=3000),'STEREO',page.locator('#stereo-error').inner_text(timeout=3000),flush=True)
                            page.screenshot(path=str(out / (name + '-failure.png')), full_page=True,timeout=5000)
                        except Exception:
                            pass
                    finally:
                        page.close()
        finally:
            browser.close()
    if failures:
        raise SystemExit(str(len(failures)) + ' layered browser case(s) failed')
    print('PASS all layered browser workflows', flush=True)


if __name__ == '__main__':
    main()
