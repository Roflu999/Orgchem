'use strict';
// node test-plate-history.js [--bench] (DOM checks use browser-check's jsdom).
const assert=require('node:assert/strict');
const H=require('./plate-history.js');
const parent={id:'1',label:'propanone',role:'substrate',stockId:'',smiles:'CC(=O)C',medium:'',catalyst:''};
const reagent={id:'2',label:'Sodium borohydride',role:'reagent',stockId:'nabh4',smiles:'[Na+].[BH4-]',medium:'water',catalyst:''};
const product={...parent,id:'3',label:'propan-2-ol',smiles:'CC(O)C',history:{
  parents:[reagent,parent],pathway:'carbonyl-hydride',label:'Borohydride reduction',condition:'ambient',branch:{index:0,label:'Alcohol: CC(O)C',sites:'C2=O3'}}};
const bench={plates:[{...reagent,history:null},product],serial:7,left:'3',right:'2',condition:'reflux'};
assert.deepEqual(H.validate(H.empty()),H.empty());
assert.deepEqual(H.validate(bench),bench);
const copy=H.validate(bench); copy.plates[1].history.parents[0].medium='ethanol';
assert.equal(reagent.medium,'water'); assert.equal(product.history.parents[0].medium,'water');
for(const mutate of [b=>b.plates[0].record={}, b=>b.plates[0].extra=1, b=>b.plates[1].history.branch.index=-1,
  b=>b.plates[1].history.parents[0].medium='ethanol', b=>b.plates[1].history.parents[1].id='3',
  b=>b.plates[1].history.parents[1].history=null, b=>b.plates[1].history.parents.push(parent),
  b=>b.plates[1].history.pathway='not-a-rule', b=>b.plates[1].history.condition='pressure cooker',
  b=>b.plates[0].smiles='CCC',b=>b.plates[0].stockId='__proto__', b=>b.plates[1].medium='nickel',
  b=>b.plates[1].catalyst='nickel',b=>b.plates[1].label='abc\n',b=>b.plates[1].id='03',b=>b.plates.push(product),
  b=>b.plates=Array(49).fill(product),b=>b.plates[1].smiles='C'.repeat(3994),b=>b.serial=2,b=>b.serial=Infinity,
  b=>b.left='1',b=>b.right='',b=>b.condition='',b=>b.extra={},b=>b.plates[1].history.parents[1].id='1\n']) {
  const invalid=structuredClone(bench); mutate(invalid); assert.throws(()=>H.validate(invalid));
}
assert.deepEqual(H.validate({...bench,right:'3'}),{...bench,right:'3'});
assert.deepEqual(H.validate({...H.empty(),serial:7,condition:'uv'}),{...H.empty(),serial:7,condition:'uv'});
console.log('PASS bounded plate validation, detached snapshots, parent consistency and saved selections');

async function domChecks(){
  const {JSDOM}=require('./browser-check/node_modules/jsdom');
  const fs=require('node:fs'),path=require('node:path'),Chem=require('./chemistry.js');
  const source=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
  const dom=new JSDOM(source('bond-atlas.html'),{runScripts:'outside-only'}),w=dom.window,d=w.document;
  try {
    const el=id=>d.getElementById('plate-'+id),click=id=>el(id).click(),tick=()=>new Promise(resolve=>setImmediate(resolve));
    const select=(id,val)=>{el(id).value=val;el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
    const cards=()=>Array.from(el('rack').children), action=(card,text)=>Array.from(card.querySelectorAll('button')).find(b=>b.textContent===text);
    const parse=async raw=>Chem.describe(Chem.readSmiles(raw.replace(/^smiles:/,'')));
    let shown,cleared=0,changes=0;w.ReactionInput={parse};w.PlateChemistry=require('./plate-chemistry.js');
    w.PlateComparison={show(...args){shown=args;},clear(){cleared++;}};
    for(const file of ['plate-history.js','reaction-plates.js'])w.eval(source(file));
    const api=w.ReactionPlates, capture=()=>JSON.parse(JSON.stringify(api.capture()));
    d.addEventListener('plate-bench-change',()=>changes++);
    assert.deepEqual(capture(),H.empty());api.setActive(true);
    el('input').value='O=CCC(C)CCC=O';click('create');await tick();
    select('stock','nabh4');select('medium','water');click('create');await tick();
    assert.equal(cards().length,2);select('left','2');select('right','1');click('preview');
    assert.equal(el('branch').options.length,2);click('collect');await tick();
    select('branch','1');click('collect');await tick();
    const full=capture(),[a,b]=full.plates.slice(2);assert.notEqual(a.smiles,b.smiles);
    assert.deepEqual([a.history.branch.index,b.history.branch.index],[0,1]);assert.equal(b.history.condition,'ambient');
    assert.deepEqual(b.history.parents.map(s=>s.id),['2','1']);assert(!a.history.parents.some(s=>'history' in s));
    action(cards()[0],'Remove').click();select('right','2');select('condition','heat');
    const saved=capture();assert.equal(saved.left,saved.right);assert.equal(saved.plates.length,3);
    assert.equal(saved.plates[2].history.parents[1].smiles,full.plates[0].smiles);assert.equal(saved.condition,'heat');
    action(cards()[2],'Compare with starting molecule').click();
    assert(cards()[2].contains(shown[0]));assert.equal(shown[1].smiles,full.plates[0].smiles);
    assert.equal(shown[2].smiles,b.smiles);assert.equal(typeof shown[3],'string');
    api.setActive(false);assert.equal(cleared,1);const undo=api.checkpoint(),initialChanges=changes;
    (await api.prepare(H.empty()))();assert.deepEqual(capture(),H.empty());
    const calls=[];w.ReactionInput.parse=async raw=>{calls.push(raw);return parse(raw);};
    const commit=await api.prepare(saved);assert.deepEqual(capture(),H.empty());
    assert.equal(calls.length,3,'two products and their deleted substrate parsed once each');
    commit();assert.deepEqual(capture(),saved);assert(el('preview').disabled);
    assert.equal(changes,initialChanges,'restore does not masquerade as a user edit');
    w.ReactionInput.parse=async raw=>{if(raw==='smiles:'+b.smiles)throw Error('parse failed');return parse(raw);};
    await assert.rejects(api.prepare(full),/parse failed/);assert.deepEqual(capture(),saved);
    let current=true,count=0;w.ReactionInput.parse=async raw=>{current=false;count++;return parse(raw);};
    await assert.rejects(api.prepare(full,{isCurrent:()=>current}),e=>e.name==='AbortError');assert.equal(count,1);
    assert.deepEqual(capture(),saved);(await api.prepare(H.empty()))();undo();assert.deepEqual(capture(),saved);
    assert.equal(count,1,'checkpoint restoration must not reparse');
    // Reagent preparations get the same provenance, but not an organic-product comparison.
    (await api.prepare(H.empty()))();api.setActive(true);select('medium','');select('stock','hydrogen');click('create');await tick();
    select('stock','nickel');click('create');await tick();click('preview');click('collect');
    const prepared=capture().plates[2];assert.equal(prepared.history.pathway,'reagent-preparation');assert.equal(prepared.catalyst,'nickel');
    assert(!action(cards()[2],'Compare with starting molecule'));assert.equal(api.capture().serial,3);
    console.log('PASS plate DOM: branches, preparation, comparison after removal, staged restore, stale cancellation and undo');
  } finally {w.close();}
}
if(process.argv.includes('--bench')) domChecks().catch(e=>{console.error(e);process.exitCode=1;});
