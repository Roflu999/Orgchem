// Offline DOM integration: real desk rows, sketch validation, history, and translations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const source = path => readFile(new URL(path, root), 'utf8');
const dom = new JSDOM(await source('bond-atlas.html'), { runScripts:'outside-only', url:'http://localhost/', pretendToBeVisual:true });
const w=dom.window, doc=w.document, el=id=>doc.getElementById(id);
try {
  w.matchMedia=q=>Object.assign(new w.EventTarget(), {media:q, matches:false});
  w.ResizeObserver=class { observe(){} disconnect(){} };
  w.fetch=async()=>({ok:false});
  for(const script of doc.scripts){
    const src=script.getAttribute('src');
    if(!src?.startsWith('vendor/'))w.eval(src?await source(src):script.textContent);
  }
  const rows=()=>Array.from(el('desk-rows').children), field=r=>r.querySelector('.row-head > input');
  const start=row=>Array.from(row.querySelectorAll('button')).find(b=>b.textContent==='Edit atoms').click();
  const compare=el('desk-compare'), note=el(compare.getAttribute('aria-describedby'));
  const editExample=()=>{const s=el('builder-example');s.value='acetone';s.dispatchEvent(new w.Event('change'));};
  const [original]=rows(), raw=field(original).value;
  el('desk-add').click();const trailing=rows()[1];
  const pick=r=>r.querySelector('input[type="checkbox"]'), selected=()=>rows().filter(r=>pick(r).checked);
  pick(trailing).click();Array.from(original.querySelectorAll('button')).find(b=>b.textContent==='Hide').click();
  assert.equal(original.dataset.visible,'false');assert.deepEqual(selected(),[trailing]);
  start(original);assert(compare.disabled);assert.match(note.textContent,/Change the structure/);
  editExample();assert(!compare.disabled);
  w.AtlasI18n.setLocale('ar');assert.match(note.textContent,/\p{Script=Arabic}/u);assert.match(compare.textContent,/\p{Script=Arabic}/u);
  w.AtlasI18n.setLocale('en');const edited=w.MoleculeBuilder.getDeskNotation();compare.click();
  const added=rows()[1];assert.deepEqual(rows(),[original,added,trailing]);
  assert.equal(field(original).value,raw);assert.equal(field(added).value,edited);assert.equal(doc.activeElement,field(added));
  assert(el('desk-edit-actions').hidden);assert.equal(doc.querySelectorAll('#desk-stage img').length,2);
  assert.deepEqual(selected(),[original,added]);assert.equal(original.dataset.visible,'true');assert.equal(added.dataset.visible,'true');
  el('desk-undo').click();assert.deepEqual(rows(),[original,trailing]);assert.deepEqual(selected(),[trailing]);assert.equal(original.dataset.visible,'false');
  el('desk-redo').click();assert.deepEqual(rows(),[original,added,trailing]);assert.equal(field(original).value,raw);
  assert.deepEqual(selected(),[original,added]);assert.equal(original.dataset.visible,'true');assert.equal(added.dataset.visible,'true');

  start(original);el('builder-clear').click();assert(compare.disabled);assert.match(note.textContent,/empty sketch/);
  assert(!el('desk-apply').disabled);assert.match(el('desk-apply').textContent,/Remove/);
  el('builder-undo').click();el('builder-advanced').click();assert(compare.disabled&&el('desk-apply').disabled);assert.match(note.textContent,/validation/);
  el('desk-discard').click();assert.deepEqual(rows(),[original,added,trailing]);
  // Desk work is temporary: do not replace the independent sketch or its recovery checkpoint.
  el('show-builder').click();editExample();el('builder-clear').click();
  el('draft-recovery-enable').click();const backup=w.localStorage.getItem(w.AtlasDraftRecovery.key);
  el('show-models').click();start(original);assert(el('builder-undo').disabled,'a fresh row must not undo into another sketch');
  editExample();assert.equal(w.localStorage.getItem(w.AtlasDraftRecovery.key),backup);
  el('builder-to-skeletal').click();assert.equal(w.BondAtlas.state.labView,'explorer');
  el('edit-in-builder').click();assert(!el('desk-edit-actions').hidden,'viewer round-trip must retain the row target');
  el('show-reagents').click();el('show-builder').click();assert(!el('desk-edit-actions').hidden);
  el('show-models').click();start(added);assert(el('builder-undo').disabled);el('desk-discard').click();
  start(original);assert.equal(w.MoleculeBuilder.getDeskNotation(),edited,'resume its pending edit, not the original input');
  el('desk-discard').click();el('show-builder').click();assert.equal(w.MoleculeBuilder.getDeskNotation(),'');
  el('builder-undo').click();assert.equal(w.MoleculeBuilder.getDeskNotation(),edited);el('show-models').click();
  for(let i=rows().length;i<8;i++)el('desk-add').click();
  start(original);editExample();assert(compare.disabled);assert.match(note.textContent,/8 rows/);
  compare.click();assert(!el('desk-edit-actions').hidden);assert(!el('desk-apply').disabled);
  el('desk-apply').click();assert.equal(rows().length,8);assert.equal(field(original).value,edited);
  el('desk-undo').click();assert.equal(field(original).value,raw);
  el('show-builder').click();assert(el('desk-edit-actions').hidden);
  // A converted preview belongs to its navigation action; resolving an aborted service job must not open it.
  el('show-models').click();el('desk-starter-mirror').click();const [left,right]=rows();
  const mirror=w.ComparisonMirrors.S.record, api=w.MoleculeBuilder, jobs=[];
  const oldJob=w.ChemistryClient.job;
  w.ChemistryClient.job=(op,payload,{signal})=>new Promise(resolve=>jobs.push({op,payload,signal,resolve}));
  const until=async predicate=>{const end=Date.now()+3000;while(!predicate()){assert(Date.now()<end,'timed out waiting for validation');await new Promise(r=>setTimeout(r,10));}};
  try {
    start(left);assert(el('desk-apply').disabled&&compare.disabled);await until(()=>jobs.length>0);
    jobs.at(-1).resolve({molecules:[mirror]});await until(()=>!el('desk-apply').disabled);
    assert(compare.disabled);assert.equal(api.getDeskNotation(),field(left).value);
    for(const view of ['reagents','stereo','explorer','models']){
      const count=jobs.length, pending=api.openViewer('skeletal');await until(()=>jobs.length>count);
      const request=jobs.at(-1), prev=w.BondAtlas.state.selected;
      el('show-'+view).click();assert(request.signal.aborted,'conversion survived navigation to '+view);
      request.resolve({molecules:[mirror]});await pending;
      assert.equal(w.BondAtlas.state.labView,view);assert.equal(w.BondAtlas.state.selected,prev);
      if(view==='models')start(left);else el('show-builder').click();
    }
    // A validated stereochemical change is not a connectivity-only duplicate.
    api.loadStructure(w.ComparisonMirrors.R.record);assert(compare.disabled);await until(()=>jobs.at(-1).payload.draft.sourceRecord?.notation===field(right).value);
    jobs.at(-1).resolve({molecules:[w.ComparisonMirrors.R.record]});await until(()=>!compare.disabled);
    compare.click();assert.deepEqual(rows().map(r=>field(r).value),[mirror.notation,field(right).value,field(right).value]);
  } finally {w.ChemistryClient.job=oldJob;}
  // A canonical formula preview can fold [H]; the row editor must retain it as an editable vertex.
  const f=field(left);f.value='smiles: [H]OC';f.dispatchEvent(new w.Event('input'));start(left);
  const atoms=api.getDraft().atoms;assert.equal(atoms.length,3);const carbon=atoms.findIndex(a=>a.e==='C');
  el('builder-move').click();doc.querySelector(`#builder-canvas [data-atom="${carbon}"]`).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  el('builder-grow').click();assert.match(api.getDeskNotation(),/\[H\]/);el('desk-apply').click();
  start(left);assert.equal(api.getDraft().atoms.length,4);assert.equal(api.getDraft().atoms.filter(a=>a.e==='H').length,1);el('desk-discard').click();
  console.log('PASS: isolated/resumable row edits, independent sketch recovery, stereo comparison, explicit H round-trip, stale navigation cancellation, undo/redo, keyboard focus, locale switching, and capacity');
} finally { dom.window.close(); }
