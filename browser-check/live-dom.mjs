// Live loopback DOM check, not a renderer or a sandbox for untrusted pages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Script } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

const port = process.argv[2] ?? '8000';
assert(/^\d+$/.test(port) && +port > 0 && +port <= 65535, 'Expected a loopback port (1-65535)');
const origin = `http://127.0.0.1:${+port}`;
const root = new URL('../', import.meta.url);
async function localFetch(path, options = {}) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, 'Only same-origin loopback requests are allowed');
  return fetch(url, { ...options, redirect: 'error', signal: options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
}
async function getText(path) {
  const r = await localFetch(path);
  assert.equal(r.status, 200, `${path}: HTTP ${r.status}`);
  return r.text();
}

const errors = [];
const consoleEvents = new VirtualConsole();
consoleEvents.on('jsdomError', e => errors.push(e.cause?.stack || e.message));
const dom = new JSDOM(await getText('/'), {url: origin, runScripts: 'outside-only',
  pretendToBeVisual: true, virtualConsole: consoleEvents});
const w = dom.window, doc = w.document;
try {
  // No automatic subresources or inline handlers. Use only scripts from this checkout;
  // compare every script to the served page/asset before evaluating any of them.
  const trusted = JSDOM.fragment(await readFile(new URL('bond-atlas.html', root), 'utf8'));
  const scripts = Array.from(trusted.querySelectorAll('script'));
  assert.deepEqual(Array.from(doc.scripts, s => s.getAttribute('src')), scripts.map(s => s.getAttribute('src')));
  const code = await Promise.all(scripts.map(async (s, i) => {
    const src = s.getAttribute('src');
    if (!src) {
      assert.equal(doc.scripts[i].textContent, s.textContent, 'Unexpected inline script');
      return [s.textContent, 'bond-atlas.html (inline)'];
    }
    const source = await readFile(new URL(src, root), 'utf8');
    assert.ok(await getText(src) === source, `Served ${src} differs from checkout`);
    return [source, src];
  }));
  // Node's fetch and AbortSignal.any require a signal from the Node realm.
  w.AbortController = AbortController;
  w.AbortSignal = AbortSignal;
  w.fetch = localFetch;
  w.matchMedia ??= query => Object.assign(new w.EventTarget(), {media: query, matches: query === '(min-width:1001px)'});
  w.ResizeObserver ??= class { observe() {} disconnect() {} };
  for (const [source, filename] of code) {
    // The renderer bundles its own worker. DOM checks don't start it or emulate WebGL.
    if (filename.startsWith('vendor/3dmol-')) continue;
    new Script(source, {filename}).runInContext(dom.getInternalVMContext());
  }
  const el = id => { const node = doc.getElementById(id); assert.ok(node, `Missing #${id}`); return node; };
  const select = (id, value) => {
    el(id).value = value;
    el(id).dispatchEvent(new w.Event('change', {bubbles: true}));
  };
  const until = async (test, description) => {
    const deadline = Date.now() + 30000;
    while (!test()) {
      assert.deepEqual(errors, [], 'DOM errors: ' + errors.join('\n'));
      assert.ok(Date.now() < deadline, `Timed out: ${description}`);
      await delay(50);
    }
  };
  await until(() => doc.querySelectorAll('.stereo-variant').length === 2, 'two real RDKit lactic-acid variants');
  assert.equal(el('show-stereo').getAttribute('aria-pressed'), 'true');
  console.log('PASS: startup loaded two stereoisomers from the local RDKit service');
  el('show-builder').click();
  assert.equal(el('builder-panel').hidden, false);
  select('builder-example', 'benzene');
  assert.match(el('builder-name').textContent, /benzene/i);
  assert.equal(doc.querySelectorAll('#builder-canvas .sketch-atom').length, 6);
  console.log('PASS: opened builder, selected benzene, found six atom nodes in its SVG');
  const original = el('preferences-button').textContent;
  select('language-select', 'ar');
  assert.equal(doc.documentElement.dir, 'rtl');
  assert.equal(doc.documentElement.lang, 'ar');
  assert.match(el('preferences-button').textContent, /\p{Script=Arabic}/u);
  select('language-select', 'en');
  assert.equal(doc.documentElement.dir, 'ltr');
  assert.equal(el('preferences-button').textContent, original);
  console.log('PASS: Arabic and English changed labels and document direction; DOM only, no pixels verified');
  select('builder-example','ethanol');
  const draft=w.MoleculeBuilder.getDraft(), oxygen=draft.atoms.findIndex(a=>a.e==='O');
  const pick=(index,key='Enter')=>doc.querySelector(`#builder-canvas [data-atom="${index}"]`).dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  pick(oxygen);el('builder-split').click();
  assert.equal(el('workspace').parentElement,el('builder-split-pane'));
  const model=w.BondAtlas.state.selected, inspected=w.BondAtlas.inspection;
  assert.deepEqual(Array.from(inspected.getSelection().atomIndices),[model.atoms.indexOf('O')]);
  const carbon=model.atoms.indexOf('C');inspected.toggleAtom(carbon,model);
  assert.equal(doc.querySelectorAll('.sketch-inspection-ring').length,2);
  pick(oxygen,'ArrowRight');assert.equal(el('split-stale').hidden,false);assert(el('workspace').inert);
  el('split-refresh').click();assert.equal(el('split-stale').hidden,true);assert(!el('workspace').inert);
  el('builder-split').click();assert.equal(el('workspace').parentElement,el('explorer-panel'));
  console.log('PASS: desktop split tracks canonical atom selections, blocks stale measurements and refreshes the same viewer');
  el('show-explorer').click();
  doc.querySelector('[data-formula="C2H6O"]').click();
  await until(() => !el('formula-reasoning').hidden && el('result-count').textContent === '2', 'two deduced structures');
  for (const index of [0,1,3]) {
    el('inspection-atom').selectedIndex = index;
    el('inspection-pick').click();
    if (index === 1) assert.match(el('inspection-value').textContent, /Distance: [\d.]+ Å/);
  }
  assert.match(el('inspection-value').textContent, /Angle: [\d.]+°/);
  assert.match(el('inspection-source').textContent, /Illustrative coordinates/);
  assert.deepEqual(Array.from(inspected.getSelection().atomIndices), [0,1,null]);
  select('language-select','de');
  assert.match(el('inspection-value').textContent, /Winkel: [\d,]+°/);
  assert.deepEqual(Array.from(inspected.getSelection().atomIndices), [0,1,null]);
  select('language-select','en');
  el('inspection-clear').click();
  assert.equal(el('inspection-value').textContent,'');
  console.log('PASS: atom controls measure illustrative geometry and unmapped H; live localization preserves the selection');
  el('formula-reasoning').querySelector('summary').click();
  assert.equal(el('formula-reasoning').querySelector('details').open, true);
  assert.match(el('reason-skeletons').textContent, /arrangements: 2/);
  select('group-filter', 'ether');
  assert.equal(el('result-count').textContent, '1');
  assert.match(el('formula-conclusion').textContent, /neutral model: 2/);
  select('input-mode', 'name');
  el('formula-input').value = '3-methylhexan-2-ol';
  el('search-form').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  await until(() => el('formula-reasoning').hidden && el('connectivity-name-value').textContent === '3-methylhexan-2-ol', 'systematic name round trip');
  assert.deepEqual(errors, [], 'DOM errors: ' + errors.join('\n'));
  console.log('PASS: formula deduction, filtered totals and systematic name round trip on the live site');
  if (w.ChemistryClient.capabilities?.opsinAvailable) {
    for (const label of ['R','S']) {
      const name = `(${label})-butan-2-ol`;
      el('formula-input').value = name;
      el('search-form').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
      await until(() => w.BondAtlas.state.result?.source === 'OPSIN' && w.BondAtlas.state.selected?.stereo.centers.some(c => c.cip === label), name);
      assert.equal(el('form-error').hidden, true);
    }
    console.log('PASS: OPSIN resolves both stereochemical names in the live name field, with distinct R and S assignments');
  } else if (process.env.REQUIRE_OPSIN === '1') throw Error('Local OPSIN engine unavailable');
} finally {
  w.close();
}
