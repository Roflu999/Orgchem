import assert from 'node:assert/strict';

export async function checkPlates({w, el, select, until}, filesOnly=false) {
  el('plate-lab').open = true;
  const cards = () => Array.from(el('plate-rack').children);
  const status = () => el('plate-status').textContent;
  function checkLabels() {
    for(const control of el('plate-lab').querySelectorAll('select,input,button')){
      const name=control.getAttribute('aria-label') || [...control.labels||[]].map(l=>l.textContent).join(' ') || (control.tagName==='BUTTON' && control.textContent);
      assert(name && name.trim(),`Unlabelled ${control.tagName} ${control.id}`);
    }
    const labels=cards().flatMap(c=>Array.from(c.querySelectorAll('button'),b=>b.getAttribute('aria-label')));
    assert.equal(new Set(labels).size,labels.length,'Each rack action must identify its plate');
  }
  async function example(index) {
    const n=cards().length; select('plate-starter',String(index)); el('plate-load').click();
    await until(()=>cards().length===n+2 || !el('plate-load').disabled,'load a worked pair');
    assert.equal(cards().length,n+2,status());
    const parents=cards().slice(-2).map(c=>c.textContent); el('plate-preview').click();
    await until(()=>!el('plate-preview').disabled,'look up pathways');
    assert.equal(el('plate-outcomes').hidden,false,status());
    return parents;
  }
  async function collect() {
    const n=cards().length; el('plate-collect').click();
    await until(()=>cards().length===n+1 || !el('plate-collect').disabled,'collect a verified product');
    assert.equal(cards().length,n+1,status()); return cards().at(-1);
  }
  if(filesOnly){
    // Collect two branches from the *same* parents, then reopen a real downloaded file.
    await example(8);await collect();select('plate-condition','reflux');el('plate-preview').click();await collect();
    const origin=w.ReactionPlates.capture();assert.equal(origin.plates.length,4);
    for(const [index,condition] of [[2,'distil'],[3,'reflux']]){
      const product=origin.plates[index];assert.equal(product.history.condition,condition);
      assert.deepEqual([...product.history.parents.map(p=>p.id)],['1','2']);
      cards()[index].querySelector('[aria-controls^="plate-comparison-"]').click();
      await until(()=>cards()[index].querySelectorAll('img').length===2,'two 2D structures in the product card');
      const comparison=cards()[index].querySelector('.plate-comparison');
      const captions=[...comparison.querySelectorAll('figcaption')].map(el=>el.textContent);
      assert.match(captions[0],/Starting moleculeEthanolC₂H₆O/);
      assert.match(captions[1],condition==='distil'?/EthanalC₂H₄O/:/Ethanoic acid \(acetic acid\)C₂H₄O₂/);
      const setup=comparison.querySelector('.plate-comparison-setup').textContent;
      assert.match(setup,/acidified potassium dichromate/i);
      assert.match(setup,condition==='distil'?/distillation/i:/reflux.*excess oxidant/i);
      if(condition==='distil') assert.doesNotMatch(setup,/reflux|excess oxidant/i);
    }
    let blob;w.URL.createObjectURL=file=>{blob=file;return 'blob:local-test';};w.URL.revokeObjectURL=()=>{};
    const prevent=e=>{if(e.target.closest('a[download]'))e.preventDefault();};
    const choose=async parts=>{const picker=el('desk-file-input');Object.defineProperty(picker,'files',{configurable:true,value:[new w.File(parts,'bench.orgchem.json')]});picker.dispatchEvent(new w.Event('change'));};
    el('plate-files').click();assert(el('desk-files').open);
    w.document.addEventListener('click',prevent);el('desk-file-download').click();w.document.removeEventListener('click',prevent);assert(blob?.size>0);
    const legacy={format:'orgchem-workspace',version:1,rows:[],view:{mode:'2d',benzene:'kekuleA'}};
    await choose([JSON.stringify(legacy)]);await until(()=>!cards().length,'open a legacy model-only file');
    await choose([blob]);await until(()=>cards().length===4,'reopen the local bench file');assert.deepEqual(w.ReactionPlates.capture(),origin);
    el('desk-undo').click();assert.equal(cards().length,0);el('desk-redo').click();assert.deepEqual(w.ReactionPlates.capture(),origin);
    el('show-reagents').click();cards()[0].querySelector('[aria-label^="Remove"]').click();
    const orphan=cards().at(-1);assert.match(orphan.textContent,/P1 \+ P2/);orphan.querySelector('[aria-controls^="plate-comparison-"]').click();
    await until(()=>orphan.querySelectorAll('img').length===2,'compare after removing the source plate');
    console.log('PASS: two ethanol branches, retained sources, 2D comparisons, combined local file, legacy open and undo/redo');
    return;
  }
  const parents=await example(0);cards()[0].querySelector('button').click();
  assert.match(el('plate-view').textContent,/Hydrogen deficiency: 1 DBE \(2 H atoms/i);el('plate-close-view').click();
  const child=await collect(); assert.deepEqual(cards().slice(0,2).map(c=>c.textContent),parents);
  assert.match(child.textContent,/P1 \+ P2/); assert.match(el('plate-explanation').textContent,/hydride/i);
  child.querySelector('button').click(); assert(!el('plate-inspector').hidden);assert(el('plate-view').querySelector('img'));
  assert.match(el('plate-view').textContent,/Hydrogen deficiency: 0 DBE/);checkLabels();
  let zoom=Array.from(el('plate-view').querySelectorAll('button')).find(b=>b.textContent==='Zoom in');zoom.click();
  assert.equal(el('plate-view').querySelector('.plate-viewer-stage').style.width,'135%');el('plate-close-view').click();
  for(const [i,pattern] of [[1,/alkene hydrogenation/i],[2,/elimination/i],[3,/substitution/i],[4,/nitrile reduction/i],[5,/hydrolysis/i],[6,/radical/i],[7,/borohydride reduction/i]]) {
    await example(i); assert.match(status(),pattern);
    if(i===2) {assert.equal(el('plate-branch').options.length,3); select('plate-branch','1');assert.match((await collect()).textContent,/elimination/i);}
    if(i===7) assert.match((await collect()).textContent,/cyclohexanol|OC1CCCCC1/i);
  }
  for(const [i,condition,product] of [[8,'distil',/ethanal|acetaldehyde|CC=O/i],[9,'reflux',/ethanoic acid|acetic acid|CC\(=O\)O/i]]){
    await example(i);assert.equal(el('plate-condition').value,condition);assert.match((await collect()).textContent,product);
  }
  select('plate-condition','heat');el('plate-preview').click();assert(el('plate-outcomes').hidden);assert.match(status(),/distillation|reflux/i);
  await example(7);
  const unchanged=cards().length; select('plate-condition','uv'); el('plate-preview').click();
  assert(el('plate-outcomes').hidden); assert.match(status(),/temperature/i); assert.equal(cards().length,unchanged);
  // A new custom substrate, two reductions at different sites, then reuse the first product.
  select('plate-stock','custom');el('plate-input').value='CC(=O)CCC(=O)CC';select('plate-role','substrate');el('plate-create').click();
  await until(()=>cards().length===unchanged+1,'custom substrate plate');
  const substrate=cards().at(-1).dataset.plate; select('plate-stock','nabh4'); select('plate-medium','ethanol');el('plate-create').click();
  await until(()=>cards().length===unchanged+2,'ethanolic reducing plate');const reagent=cards().at(-1).dataset.plate;
  select('plate-left',substrate); select('plate-right',reagent);select('plate-condition','ambient');el('plate-preview').click();
  assert.equal(el('plate-branch').options.length,2,status());const first=await collect();
  select('plate-left',first.dataset.plate);el('plate-preview').click();assert.equal(el('plate-branch').options.length,1,status());await collect();
  select('plate-right',first.dataset.plate);assert(el('plate-preview').disabled);assert(el('plate-outcomes').hidden);
  // Typing formula shortcuts must create stock water or methane, not an invented organic graph.
  select('plate-stock','custom');select('plate-medium','');el('plate-input').value='H2O';select('plate-role','reagent');el('plate-create').click();
  await until(()=>cards().at(-1).textContent.includes('Water'),'typed water plate');
  el('plate-input').value='CH4';select('plate-role','substrate');el('plate-create').click();await until(()=>cards().at(-1).textContent.includes('Methane'),'typed methane plate');
  // Two stock plates can prepare a reagent before it is paired with a substrate.
  async function addStock(id){select('plate-stock',id);const n=cards().length;el('plate-create').click();await until(()=>cards().length===n+1,'stock '+id);return cards().at(-1).dataset.plate;}
  const hydrogen=await addStock('hydrogen'),nickel=await addStock('nickel');select('plate-left',hydrogen);select('plate-right',nickel);select('plate-condition','ambient');el('plate-preview').click();
  assert.match(el('plate-collect').textContent,/prepared plate/i);const prep=await collect();assert.match(prep.textContent,/Nickel catalyst/);
  select('plate-left',cards().find(c=>c.firstElementChild.textContent.endsWith('· propene')).dataset.plate);select('plate-right',prep.dataset.plate);select('plate-condition','heat');el('plate-preview').click();assert.match(status(),/alkene hydrogenation/i);
  select('plate-stock','custom');
  // A late parse cannot put a new plate in a bench the learner has left.
  const original=w.ReactionInput.parse, n=cards().length;let release, signal;
  w.ReactionInput.parse=(_text,opts)=>new Promise(resolve=>{signal=opts.signal;release=resolve;});
  try {el('plate-input').value='CC';el('plate-create').click();assert(signal);el('show-models').click();assert(signal.aborted);release(w.ModelInput.preview('CC'));await Promise.resolve();await Promise.resolve();assert.equal(cards().length,n);}
  finally {w.ReactionInput.parse=original;}
  el('show-reagents').click();el('plate-lab').open=false;
  const input=el('rx-substrate');input.value='C'.repeat(70)+'O';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  await until(()=>!el('rx-run').disabled || /Matched to this molecule/.test(el('rx-reagent').innerHTML),'large parent parsed and matched');
  select('rx-reagent','Acidified potassium dichromate(VI)');select('rx-setup','distil');el('rx-run').click();assert(!el('rx-result').hidden,el('rx-empty').textContent);assert(!el('rx-use-product').disabled);
  assert.match(el('rx-formula-note').textContent,/0 DBE/);el('rx-map-details').open=true;
  await until(()=>el('rx-map-caption').textContent.includes('of 71 parent atoms'),'local mapped site');
  assert(el('rx-site-map').querySelectorAll('text').length<12); assert(el('rx-site-map').querySelector('[stroke-dasharray]'));
  el('rx-map-toggle').click();assert.match(el('rx-map-caption').textContent,/Whole molecule: 71/);
  el('rx-map-toggle').click();assert.match(el('rx-map-caption').textContent,/Site detail/);el('rx-map-details').open=false;
  console.log('PASS: local and whole-parent map for a 71-atom substrate with live DBE and chainable aldehyde');
  console.log('PASS: all ten CIE plate examples with real records, chosen branches, parent retention, chained products, zoom, stock roles and cancellation');
}
