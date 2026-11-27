// Live loopback DOM check, not a renderer or a sandbox for untrusted pages.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Script } from 'node:vm';
import { checkPlates } from './plate-bench.mjs';
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
try { await runChecks(); } finally {
  dom.window.close();
}

async function runChecks(){
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
  // jsdom has no download manager. Exercise the real serializer and capture its Blob.
  function downloadWorkspace(){
    let saved;
    w.URL.createObjectURL=blob=>{saved=blob;return 'blob:'+origin+'/workspace';};w.URL.revokeObjectURL=()=>{};
    const prevent=e=>{if(e.target.closest('a[download]'))e.preventDefault();};
    doc.addEventListener('click',prevent);
    try {el('desk-file-download').click();} finally {doc.removeEventListener('click',prevent);}
    assert(saved?.size>0,'Workspace download must provide a nonempty file');return saved;
  }
  if(process.argv[3]==='--plate-files'){
    el('show-reagents').click();await checkPlates({w,el,select,until,downloadWorkspace},true);assert.deepEqual(errors,[]);return;
  }
  assert.equal(el('show-models').getAttribute('aria-pressed'),'true');
  const rows=()=>[...doc.querySelectorAll('#desk-rows > li')];
  const type=(row,value)=>{const f=row.querySelector('input');f.value=value;f.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const action=(row,name)=>[...row.querySelectorAll('button')].find(b=>b.textContent===name).click();
  const images=()=>doc.querySelectorAll('#desk-stage img').length;
  // Benzene views must never mutate the graph or change which mechanisms match.
  const firstRow=rows()[0], source=firstRow.querySelector('input').value;
  type(firstRow,'benzene');assert(!el('desk-benz-wrap').hidden);
  for(const mode of ['kekuleA','kekuleB','electrons','cloud']){
    select('desk-benz',mode);assert(decodeURIComponent(doc.querySelector('#desk-stage img').src).includes(`data-benzene-mode="${mode}"`));
    assert.equal(firstRow.querySelector('.row-formula').textContent,'C₆H₆');
  }
  const benzeneImage=doc.querySelector('#desk-stage img');select('language-select','ar');
  assert(benzeneImage.alt.includes(w.AtlasI18n.t('benz.cloud')),'translate the current benzene mode without replacing the image');
  select('language-select','en');
  el('desk-undo').click();assert.equal(firstRow.querySelector('input').value,source);assert(el('desk-benz-wrap').hidden);
  el('show-reagents').click();assert(!el('reaction-panel').hidden);assert(el('model-desk').hidden);assert(el('explorer-panel').hidden);
  await checkPlates({w,el,select,until});
  const examples=Array.from(doc.querySelectorAll('#rx-catalog-list button'));
  for(const example of examples){example.click();assert(!el('rx-result').hidden,example.dataset.example);assert(el('rx-products').textContent.trim());
    for(let i=0;!el('rx-next').disabled&&i<15;i++){el('rx-next').click();assert(el('rx-equation').textContent.trim());}
    assert(el('rx-next').disabled&&el('rx-step-title').textContent==='Products',example.dataset.example);
  }
  const exampleById=id=>examples.find(b=>b.dataset.example===id);
  exampleById('hydroxide-sn2').click();assert.match(el('rx-products').textContent,/ethanol/i);
  select('rx-setup','ethanolic');assert(el('rx-result').hidden);assert.equal(el('rx-products').textContent,'');
  el('rx-run').click();assert.equal(el('rx-path').value,'haloalkane-elimination');assert.match(el('rx-products').textContent,/CH2=CH2/);
  select('rx-setup','aqueous');el('rx-run').click();el('rx-use-product').click();assert(el('rx-result').hidden);
  select('rx-reagent','Acidified potassium dichromate(VI)');assert(el('rx-run').disabled);select('rx-setup','distil');el('rx-run').click();assert.match(el('rx-products').textContent,/ethanal/i);
  select('rx-setup','reflux');el('rx-run').click();assert.match(el('rx-products').textContent,/ethanoic acid/i);
  el('rx-substrate').value='CC(C)(O)C';el('rx-substrate').dispatchEvent(new w.Event('input',{bubbles:true}));el('rx-run').click();assert(el('rx-result').hidden);assert.match(el('rx-empty').textContent,/no hydrogen/i);
  exampleById('radical-chlorination').click();select('rx-setup','dark');el('rx-run').click();assert(el('rx-result').hidden);assert.match(el('rx-empty').textContent,/no radical chain/i);
  console.log('PASS: switching conditions, chaining substitution into oxidation, and unsupported tertiary/dark setups');
  // Reading lists narrow examples without mutating an active experiment.
  el('rx-try-elimination').click();const alkeneNames=Array.from(el('rx-outcome').options,o=>o.textContent);
  assert.equal(alkeneNames.length,3);assert(alkeneNames.some(s=>s.includes('(E)-but-2-ene')));assert(alkeneNames.some(s=>s.includes('(Z)-but-2-ene')));
  select('rx-outcome','1');const beforeSwitch=el('rx-products').textContent;
  el('rx-map-details').open=true;await until(()=>el('rx-site-map').querySelectorAll('circle.rx-mark').length===3,'marked alpha, beta and leaving atom');
  for(const course of w.ReactionGuide.courses){select('rx-course',course.id);
    assert.deepEqual(Array.from(el('rx-catalog-list').querySelectorAll('button'),b=>b.dataset.example).sort(),Array.from(course.entries).sort());
    assert.equal(el('rx-products').textContent,beforeSwitch);assert(el('rx-reference').href.startsWith('https://'));}
  assert(!el('rx-challenges').hidden);assert.equal(el('rx-problems').querySelectorAll('article').length,w.ReactionGuide.challenges.length);
  for(const article of el('rx-problems').querySelectorAll('article')){article.querySelector('button').click();assert(!el('rx-result').hidden);assert(el('rx-reasoning').textContent.trim());}
  select('rx-course','all');el('rx-try-oxidation').click();assert.equal(el('rx-outcome').options.length,2);
  const oxFirst=el('rx-products').textContent;select('rx-outcome','1');assert.notEqual(el('rx-products').textContent,oxFirst);
  el('rx-use-product').click();assert(el('rx-result').hidden);el('rx-run').click();assert(!el('rx-result').hidden,'remaining primary OH must still react');
  el('rx-substrate').value='CC=CCC';el('rx-substrate').dispatchEvent(new w.Event('input',{bubbles:true}));select('rx-reagent','Hydrogen bromide');select('rx-setup','room');el('rx-run').click();
  assert.equal(el('rx-outcome').options.length,2);const regio=el('rx-products').textContent;select('rx-outcome','1');assert.notEqual(el('rx-products').textContent,regio);
  console.log('PASS: course-specific lesson lists, Olympiad problems, site maps, E/Z branches, sequential site selection and addition regioisomers');
  const nitrate=Array.from(el('rx-catalog-list').querySelectorAll('button')).find(b=>b.dataset.example==='benzene-nitration');nitrate.click();select('rx-benz','cloud');
  assert(decodeURIComponent(el('rx-structure').querySelector('img').src).includes('data-benzene-mode="cloud"'));
  for(let i=0;i<3;i++)el('rx-next').click();assert(el('rx-benz-wrap').hidden);assert.deepEqual(errors,[]);assert.equal(el('rx-svg').querySelectorAll('[data-electrons="2"]').length,2,el('rx-heading').textContent+' / '+el('rx-step-title').textContent+' / '+el('rx-svg').innerHTML.slice(0,200));
  el('rx-substrate').value='N[C@@H](C)C(=O)O';el('rx-substrate').dispatchEvent(new w.Event('input',{bubbles:true}));assert(el('rx-result').hidden);assert.equal(el('rx-products').textContent,'');
  el('show-models').click();assert(el('reaction-panel').hidden);console.log('PASS: all '+examples.length+' reagent examples, exam electron flow, benzene modes and unsupported-input clearing');
  const undo=el('desk-undo'),redo=el('desk-redo');
  const shortcut=(node,key,shiftKey=false)=>node.dispatchEvent(new w.KeyboardEvent('keydown',{key,ctrlKey:true,shiftKey,bubbles:true,cancelable:true}));
  assert(undo.disabled&& !redo.disabled);assert.equal(images(),1);
  action(rows()[0],'Duplicate');const copy=rows()[1];assert.equal(images(),2);
  assert(shortcut(copy.querySelector('input'),'z'),'leave native text undo alone');
  assert(!shortcut(el('desk-all'),'z'));assert.equal(rows().length,1);assert(undo.disabled);assert.equal(doc.activeElement,redo);
  assert(!shortcut(redo,'z',true));assert.equal(rows()[1],copy);assert.equal(images(),2);
  type(copy,'dime');type(copy,'dimethyl ether');undo.click();assert.equal(copy.querySelector('input').value,'ethanol');
  redo.click();assert.equal(copy.querySelector('input').value,'dimethyl ether');undo.click();
  type(rows()[1],'dimethyl ether');assert.equal(images(),2);assert.equal(rows()[1].querySelector('.row-formula').textContent,'C₂H₆O');
  action(rows()[0],'Hide');assert.equal(images(),1);action(rows()[0],'Show');assert.equal(images(),2);
  // No WebGL in jsdom: a real conformer must still be measured, and the scene must fall back explicitly.
  el('desk-3d').click();await until(()=>el('desk-status').textContent.includes('3D rendering unavailable'),'explicit WebGL fallback');
  assert.equal(el('desk-2d').getAttribute('aria-pressed'),'true');assert.equal(images(),2);
  const measured=rows().find(row=>!row.querySelector('details').hidden);assert(measured);
  assert.match(measured.querySelector('output').textContent,/Å/);
  action(rows()[1],'Remove');el('desk-add').click();type(rows()[1],'C/C=C/C');
  await until(()=>!rows()[1].querySelector('details').hidden,'assigned alkene in a second independent row');
  assert.equal(images(),2);assert.equal(doc.querySelectorAll('#desk-stage button, #desk-stage input, #desk-stage select').length,0);
  type(rows()[1],'');assert.equal(images(),1);assert(rows()[1].querySelector('details').hidden);
  const originalResolve=w.ModelInput.resolve,held=[];
  w.ModelInput.resolve=(value,{signal})=>new Promise(resolve=>held.push({value,signal,resolve}));
  try {
    type(rows()[1],'C/C=C/C');
    // Use an uncached stereo string: an earlier completed record may be reused.
    type(rows()[1],'C/C=C/Br');await until(()=>held.length===1,'start an editable row calculation');
    type(rows()[1],'ethane');assert(held[0].signal.aborted);
    held[0].resolve({record:w.ModelInput.preview('hexane'),geometry:null,reason:'no-conformer'});
    await delay(0);assert.equal(rows()[1].querySelector('.row-formula').textContent,'C₂H₆');
    assert(rows()[1].querySelector('details').hidden);
  } finally {w.ModelInput.resolve=originalResolve;}
  console.log('PASS: editable comparison rows, immediate sketches, duplicate/hide/remove, real conformer lengths, model-only canvas and graceful WebGL fallback');
  // Remove a non-contiguous batch, including a hidden row and one with pending work.
  const checkRow=r=>r.querySelector('input[type=checkbox]').click();
  el('desk-add').click();const before=rows();action(before[0],'Hide');
  const pending=[];w.ModelInput.resolve=(value,{signal})=>new Promise(resolve=>pending.push({signal,resolve}));
  try {
    type(before[2],'C/C=C/F');await until(()=>pending.length===1,'pending row for removal');
    checkRow(before[0]);checkRow(before[2]);assert(el('desk-all').indeterminate);
    el('desk-remove-picked').click();assert.deepEqual(rows(),[before[1]]);assert(pending[0].signal.aborted);
    pending[0].resolve({record:w.ModelInput.preview('propane'),reason:'no-conformer'});await delay(0);assert.equal(images(),1);
    el('desk-undo').click();assert.deepEqual(rows(),before);assert.equal(before[0].dataset.visible,'false');
    await until(()=>pending.length===2,'restart restored row');redo.click();assert.deepEqual(rows(),[before[1]]);assert(pending[1].signal.aborted);
    pending[1].resolve({record:w.ModelInput.preview('hexane'),reason:'no-conformer'});await delay(0);undo.click();assert.deepEqual(rows(),before);
    type(before[2],'butane');assert.equal(images(),2);assert(redo.disabled,'new edit must discard redo branch');
  } finally {w.ModelInput.resolve=originalResolve;}
  el('desk-all').click();el('desk-remove-picked').click();assert.equal(rows().length,0);assert.equal(images(),0);
  el('desk-undo').click();assert.deepEqual(rows(),before);
  const atomKey=(i,key)=>doc.querySelector(`#builder-canvas [data-atom="${i}"]`).dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true}));
  const chooseEnds=()=>{const d=w.MoleculeBuilder.getDraft();const degree=d.atoms.map(()=>0);for(const {a,b} of d.bonds){degree[a]++;degree[b]++;}el('builder-select-atoms').click();degree.forEach((n,i)=>{if(n===1)atomKey(i,' ');});el('builder-delete').click();};
  action(before[2],'Edit atoms');chooseEnds();assert.equal(w.MoleculeBuilder.getDraft().atoms.length,2);
  el('builder-undo').click();assert.equal(w.MoleculeBuilder.getDraft().atoms.length,4);
  chooseEnds();el('desk-discard').click();assert.equal(before[2].querySelector('.row-formula').textContent,'C₄H₁₀');
  action(before[2],'Edit atoms');chooseEnds();el('desk-apply').click();assert.deepEqual(rows(),before);
  assert.equal(before[2].querySelector('.row-formula').textContent,'C₂H₆');assert.equal(before[0].dataset.visible,'false');
  assert(before[2].querySelector('details').hidden,'old measurements must not follow an edit');
  undo.click();assert.equal(before[2].querySelector('input').value,'butane');redo.click();assert.equal(before[2].querySelector('.row-formula').textContent,'C₂H₆');
  action(before[2],'Edit atoms');el('builder-select-atoms').click();atomKey(0,' ');atomKey(1,' ');el('builder-delete').click();
  assert.equal(el('desk-apply').textContent,'Remove molecule '+before[2].querySelector('.row-number').textContent.replace(/^0/,''));
  el('desk-apply').click();assert.deepEqual(rows(),before.slice(0,2));el('desk-undo').click();assert.deepEqual(rows(),before);
  type(before[2],'C[C@H](F)CCC');await until(()=>!before[2].querySelector('details').hidden,'mapped chiral input');
  action(before[2],'Edit atoms');const mapped=w.MoleculeBuilder.getDraft();
  const neighbours=i=>mapped.bonds.filter(b=>b.a===i||b.b===i).map(b=>b.a===i?b.b:b.a);
  const end=mapped.atoms.findIndex((a,i)=>a.e==='C'&&neighbours(i).length===1&&neighbours(neighbours(i)[0]).length===2);
  assert(end>=0);el('builder-select-atoms').click();atomKey(end,' ');el('builder-delete').click();
  await until(()=>!el('desk-apply').disabled,'validated edited stereochemistry');el('desk-apply').click();
  assert.match(before[2].querySelector('.row-head > input').value,/@/);await until(()=>!before[2].querySelector('details').hidden,'new conformer after deletion');
  assert.equal(before[2].querySelector('.row-formula').textContent,'C₄H₉F');
  // At capacity, undo the later additions before undoing a deletion; no rows are lost or overwritten.
  el('desk-2d').click();assert.equal(el('desk-status').textContent,'Models shown: 2');
  if (!el('desk-all').checked) el('desk-all').click();
  el('desk-remove-picked').click();assert.equal(el('desk-status').textContent,'No models to display');
  for(let i=0;i<8;i++)el('desk-add').click();assert(el('desk-add').disabled);
  for(let i=0;i<9;i++)undo.click();assert.deepEqual(rows(),before);
  for(let i=0;i<9;i++)redo.click();assert.equal(rows().length,8);assert(el('desk-add').disabled);
  console.log('PASS: bounded-list undo/redo, pending cancellation on redo, text shortcut isolation, per-row atom edits and validated chiral conformers');
  // Follow the same path a visitor takes, including a real FileReader round-trip.
  for (const starter of ['oxygen','chain','mirror']) {
    el('desk-starter-'+starter).click();
    assert.equal(rows().length,2);assert(rows().every(r=>r.querySelector('input[type=checkbox]').checked));
    assert(!el('desk-comparison-note').hidden && !el('desk-comparison-note').open);
    assert.equal(images(),2);
    for(const image of doc.querySelectorAll('#desk-stage img')) assert.match(decodeURIComponent(image.src), /data-comparison-focus/);
    el('desk-comparison-note').querySelector('summary').click();assert(el('desk-comparison-why').textContent.trim());
  }
  // A recognized pair remains comparable in 2D even when neither 3D conformer exists.
  // Exercise actual desk scheduling/selection, not just a direct call to the stage.
  const comparisonStatus=el('desk-comparison-status'), grid=doc.querySelector('#desk-stage .model-stage-2d');
  w.ModelInput.resolve=async text=>({record:w.ModelComparisons.mirrorPreview(text),geometry:null,reason:'no-conformer'});
  try {
    el('desk-3d').click();
    await until(()=>rows().every(r=>!r.querySelector('.row-actions button:last-child').hidden),'both mirror rows lack 3D coordinates');
    assert.equal(el('desk-3d').getAttribute('aria-pressed'),'true');assert.equal(images(),0);
    assert.equal(grid.style.display,'none','do not leave an empty 2D stage active in 3D mode');
    assert.equal(comparisonStatus.textContent,w.AtlasI18n.t('compare.noGeometry'));
    select('language-select','ar');assert.match(comparisonStatus.textContent,/\p{Script=Arabic}/u);
    el('desk-2d').click();assert.equal(images(),2);
    for(const label of doc.querySelectorAll('#desk-stage figcaption'))assert.match(label.textContent,/\p{Script=Arabic}/u);
    const pick=rows()[1].querySelector('input[type=checkbox]');pick.click();assert(el('desk-comparison-note').hidden);
    assert(![...grid.querySelectorAll('img')].some(img=>decodeURIComponent(img.src).includes('data-comparison-focus')));
    pick.click();assert.equal(grid.querySelectorAll('figcaption').length,2);
    select('language-select','en');assert.equal(comparisonStatus.textContent,w.AtlasI18n.t('compare.legend2d'));
  } finally {w.ModelInput.resolve=originalResolve;}
  const saved=downloadWorkspace();el('desk-starter-oxygen').click();
  Object.defineProperty(el('desk-file-input'),'files',{configurable:true,value:[new w.File([saved],'workspace.orgchem.json',{type:'application/json'})]});
  el('desk-file-input').dispatchEvent(new w.Event('change'));
  await until(()=>rows().every(r=>r.querySelector('.row-head > input').value.includes('@')),'restore the saved mirror pair');
  assert(!el('desk-comparison-note').hidden);assert(rows().every(r=>r.querySelector('input[type=checkbox]').checked));
  undo.click();assert(!rows()[0].querySelector('.row-head > input').value.includes('@'));
  console.log('PASS: all three curated highlights, on-demand explanations and local workspace file round-trip with undo');
  el('show-stereo').click();
  await until(() => doc.querySelectorAll('.stereo-variant').length === 2, 'two real RDKit lactic-acid variants');
  assert.equal(el('show-stereo').getAttribute('aria-pressed'), 'true');
  console.log('PASS: opening the stereo workspace loaded two stereoisomers from the local RDKit service');
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
  el('builder-move').click();pick(oxygen);el('builder-split').click();
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
  const dialog=el('import-dialog');dialog.showModal??=()=>{dialog.open=true;};dialog.close??=()=>{dialog.open=false;};
  el('open-import').click();el('import-format').value='auto';el('import-text').value='[nH]1cccc1';el('apply-import').click();
  await until(()=>!dialog.open,'import bracket SMILES via RDKit');
  assert.equal(w.BondAtlas.state.selected.formula,'C4H5N');
  w.BondAtlas.setMode('formula');select('group-filter','ester');assert.equal(w.BondAtlas.state.selected,null);
  assert.equal(w.StereoExplorer.selectedMolecule(),null,'empty result filter must clear linked stereo selection');
  assert(el('stereo-use-current').disabled && el('stereo-detail').hidden);
  select('language-select','de');select('group-filter','all');
  assert.equal(w.StereoExplorer.selectedMolecule().id,w.BondAtlas.state.selected.id);
  assert(!el('stereo-use-current').disabled);assert.deepEqual(errors,[]);
  console.log('PASS: bracket SMILES import, empty filter clears linked controls, and reselection after locale change');
  // Preparing coordinates is a view action, not a new search. Exercise the chemistry jobs without a GPU.
  const app=w.BondAtlas, oldRenderFailed=app.state.renderFailed;
  el('open-import').click();el('import-format').value='smiles';el('import-text').value='CCO\nCCCO\nCOC';el('apply-import').click();
  await until(()=>!dialog.open,'import a mixed collection');
  try {
    app.state.renderFailed=false;select('group-filter','alcohol');assert.equal(app.state.filtered.length,2);
    const originalJob=w.ChemistryClient.job;let release,signal;
    try {
      w.ChemistryClient.job=(_op,_payload,opts)=>{signal=opts.signal;return new Promise((_,reject)=>{release=reject;});};
      const pendingComparison=app.setTogether(true);select('group-filter','all');assert(signal.aborted);
      release(Error('late failure from old filter'));await pendingComparison;assert(el('form-error').hidden);
    } finally {w.ChemistryClient.job=originalJob;}
    select('group-filter','alcohol');await app.setTogether(true);assert.equal(app.state.result.isomers.length,3,'Together must not discard filtered-out molecules');
    assert.equal(el('group-filter').value,'alcohol');assert.equal(app.state.filtered.length,2);
    assert(app.state.filtered.every(r=>w.MoleculeRecords.geometry(r)));
    select('group-filter','all');assert.equal(app.state.filtered.length,3);
    assert.deepEqual(errors,[]);
  } finally {app.state.renderFailed=oldRenderFailed;}
  console.log('PASS: Together prepares real conformers without replacing the collection or filter');
}
