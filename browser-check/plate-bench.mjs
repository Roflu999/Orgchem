import assert from 'node:assert/strict';

export async function checkPlates({w, el, select, until, downloadWorkspace}, filesOnly=false) {
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
    // P4 is the direct acid; P5 is the same molecule made via P3. Put reagent P2 first.
    select('plate-left','2');select('plate-right','3');el('plate-preview').click();await collect();
    const origin=w.ReactionPlates.capture();assert.equal(origin.plates.length,5);
    const missing='Earlier steps are unavailable for this plate.';
    const endpoint=()=>el('plate-rack').querySelector('[data-plate="5"]');
    const disclosure=()=>endpoint().querySelector('details.plate-route');
    async function inspectTrace(partial=false){
      const route=disclosure();assert(route && !route.open,'A rebuilt product starts with a collapsed route');
      const summary=route.querySelector(':scope > summary');assert.equal(summary.textContent,'Trace route');summary.click();
      const steps=()=>[...route.querySelectorAll('ol.plate-route-steps > li')];
      await until(()=>steps().length>0,'open the native trace disclosure');
      const expected=partial?[origin.plates[4]]:[origin.plates[2],origin.plates[4]];
      assert.equal(steps().length,expected.length);
      for(const [i,product] of expected.entries()){
        const h=product.history, substrate=h.parents.find(p=>p.role==='substrate'), reagent=h.parents.find(p=>p.role==='reagent');
        const text=steps()[i].textContent;
        const before=`P${substrate.id} · ${substrate.label}`,after=`P${product.id} · ${product.label}`;
        assert(text.includes(before) && text.indexOf(after)>text.indexOf(before),text);
        assert(text.includes(reagent.label) && text.includes(h.branch.label),text);
        assert.match(text,h.condition==='distil'?/distillation/i:/reflux/i);
      }
      if(partial){
        assert([...route.querySelectorAll('*')].some(e=>e.textContent.trim()===missing),'Exact missing-history notice');
        assert.doesNotMatch(route.textContent,/\bP1\b|distillation/i,'Do not invent the missing reaction');
      } else assert(!route.textContent.includes(missing));
    }
    assert(cards().slice(0,2).every(c=>!c.querySelector('.plate-route')),'No route for uncollected plates');
    const saved=downloadWorkspace(), savedText=await saved.text();
    let edits=0;const countEdit=()=>{edits++;};w.document.addEventListener('plate-bench-change',countEdit);
    await inspectTrace();
    async function inspectFork(id,other){
      const panel=el('plate-rack').querySelector(`[data-plate="${id}"] .plate-forks`);
      panel.querySelector('summary').click();
      const picker=panel.querySelector('select');picker.value=String(other);picker.dispatchEvent(new w.Event('change'));
      await until(()=>panel.querySelectorAll('img').length===2,'compare organic endpoints');
      assert.match(panel.textContent,/Shared starting plate: P1 · ethanol/i);
      const captions=[...panel.querySelectorAll('figcaption')].map(n=>n.textContent);
      for(const [i,plate] of [id,other].entries()) {
        assert(captions[i].includes(`P${plate} ·`));assert.match(captions[i],plate===3?/distillation/i:/reflux/i);
      }
      assert(!panel.querySelector('.plate-comparison-explanation').open);
      panel.querySelector('summary').click();await until(()=>!panel.querySelector('figure'),'close both endpoint drawings');
    }
    await inspectFork(3,4);await inspectFork(4,3);
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
    assert.equal(await downloadWorkspace().text(),savedText,'Inspecting a trace and comparison must not alter the saved workspace');
    el('plate-files').click();assert(el('desk-files').open);assert(!disclosure().open,'Leaving the bench collapses its trace');
    assert.equal(edits,0,'Read-only disclosures must not emit a bench edit');w.document.removeEventListener('plate-bench-change',countEdit);
    const choose=parts=>{const picker=el('desk-file-input');Object.defineProperty(picker,'files',{configurable:true,value:[new w.File(parts,'bench.orgchem.json')]});picker.dispatchEvent(new w.Event('change'));};
    const legacy={format:'orgchem-workspace',version:1,rows:[],view:{mode:'2d',benzene:'kekuleA'}};
    choose([JSON.stringify(legacy)]);await until(()=>!cards().length,'open a legacy model-only file');
    choose([saved]);await until(()=>cards().length===5,'reopen the local bench file');assert.deepEqual(w.ReactionPlates.capture(),origin);
    el('desk-undo').click();assert.equal(cards().length,0);el('desk-redo').click();assert.deepEqual(w.ReactionPlates.capture(),origin);
    el('show-reagents').click();await inspectTrace();
    cards()[2].querySelector('[aria-label^="Remove"]').click();await inspectTrace(true);
    const orphan=endpoint();orphan.querySelector('[aria-controls^="plate-comparison-"]').click();
    await until(()=>orphan.querySelectorAll('.plate-comparison img').length===2,'compare from retained parent snapshots');
    const short=w.ReactionPlates.capture();
    el('plate-files').click();choose([saved]);await until(()=>cards().length===5,'restore intermediate from file');
    el('show-reagents').click();await inspectTrace();
    el('plate-files').click();el('desk-undo').click();assert.deepEqual(w.ReactionPlates.capture(),short);
    el('show-reagents').click();await inspectTrace(true);
    el('plate-files').click();el('desk-redo').click();assert.deepEqual(w.ReactionPlates.capture(),origin);
    el('show-reagents').click();await inspectTrace();
    console.log('PASS: chronological oxidation trace, unchanged serialized workspace, removed intermediate, saved snapshot comparison, legacy open and combined file undo/redo');
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
  assert(!prep.querySelector('.plate-route'),'Prepared reagents are not organic endpoints');
  select('plate-left',cards().find(c=>c.firstElementChild.textContent.endsWith('· propene')).dataset.plate);select('plate-right',prep.dataset.plate);select('plate-condition','heat');el('plate-preview').click();assert.match(status(),/alkene hydrogenation/i);
  const hydrogenated=await collect(), route=hydrogenated.querySelector('details.plate-route');route.querySelector('summary').click();
  await until(()=>route.querySelector('ol.plate-route-steps > li'),'trace with a prepared reagent');
  const steps=route.querySelectorAll('ol.plate-route-steps > li');assert.equal(steps.length,1,'Do not turn reagent preparation into an organic reaction step');
  const prepDetails=steps[0].querySelector('details');assert(prepDetails && !prepDetails.open);
  prepDetails.querySelector('summary').click();
  for(const id of [hydrogen,nickel])assert(prepDetails.textContent.includes(`P${id} ·`),'Preparation details identify both original stocks');
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
