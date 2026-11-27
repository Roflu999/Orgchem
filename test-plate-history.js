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

// Model two successive collections and an independent repeat of each. Every
// assertion refers to recorded IDs, including when labels and SMILES coincide.
{
  const ethanol={...parent,label:'ethanol',smiles:'CCO'};
  const stock=require('./plate-chemistry.js').stock.find(s=>s.id==='dichromate');
  const oxidant={...reagent,label:stock.label,smiles:stock.smiles,stockId:stock.id};
  const collect=(id,substrate,pathway,condition,label,smiles)=>({...substrate,id,label,smiles,history:{
    parents:[oxidant,substrate],pathway,label:pathway,condition,branch:{index:0,label,sites:''}}});
  const aldehyde=collect('3',ethanol,'oxidation-aldehyde','distil','ethanal','CC=O');
  const {history,...intermediate}=aldehyde;
  const acid=collect('4',intermediate,'aldehyde-oxidation','reflux','ethanoic acid','CC(=O)O');
  const repeat={...aldehyde,id:'5'}, sibling={...acid,id:'6'};
  const direct=collect('7',ethanol,'oxidation-acid','reflux','ethanoic acid','CC(=O)O');
  const reduced=collect('9',intermediate,'carbonyl-hydride','ambient','ethanol','CCO');
  reduced.history.parents=[intermediate,{...reagent,id:'8'}];
  const live=H.validate({plates:[{...ethanol,history:null},{...oxidant,history:null},aldehyde,acid,repeat,sibling,direct,reduced],
    serial:9,left:'1',right:'2',condition:'ambient'}).plates;
  const rack=new Map(live.map(p=>[p.id,p])), before=JSON.stringify(live);
  const route=id=>H.traceRoute(rack,id);
  const edges=id=>route(id).steps.map(s=>[s.substrate.id,s.product.id,s.reagent.id,s.history.condition]);
  assert.deepEqual(edges('4'),[['1','3','2','distil'],['3','4','2','reflux']]);
  assert.equal(route('4').missingEarlier,false);
  assert.equal(route('4').steps[0].product,live[3].history.parents[1],'intermediate identity comes from the child snapshot');
  assert.deepEqual(route('1').steps,[]); assert.deepEqual(route('2').steps,[]);
  const fork=(a,b)=>H.routeFork(rack,a,b);
  const compare=(a,b,shared,ai,bi)=>{
    const left=route(a).steps[ai], right=route(b).steps[bi], result=fork(a,b);
    assert.equal(result.shared.id,shared);
    assert.deepEqual(result,{shared:left.substrate,left:{fork:left,endpoint:rack.get(a)},right:{fork:right,endpoint:rack.get(b)}});
    assert.equal(result.left.endpoint,rack.get(a)); assert.equal(result.right.endpoint,rack.get(b));
  };
  compare('4','7','1',0,0); compare('7','4','1',0,0); // Same acid; distinct first steps.
  compare('4','9','3',1,1); // Both P1 and P3 occur on both routes.
  for (const [a,b] of [['4','4'],['4','3'],['3','4'],['4','6'],['3','5'],['1','4'],['2','4'],['99','4']])
    assert.equal(fork(a,b),null,`no fork between P${a} and P${b}`);
  rack.delete('2'); assert.equal(route('4').missingEarlier,false,'missing reagent does not interrupt substrate lineage');
  rack.delete('3');
  for(const id of ['4','6']) {
    assert.equal(route(id).missingEarlier,true);
    assert.deepEqual(edges(id),[['3',id,'2','reflux']],'do not substitute the identical live P5');
  }
  compare('4','9','3',0,0); // Both child snapshots still prove the fork at deleted P3.
  assert.equal(fork('4','7'),null,'do not bridge missing P3 via the identical live P5');
  assert.deepEqual(edges('5'),[['1','5','2','distil']]);
  assert.equal(JSON.stringify(live),before,'reading a route must not mutate any saved plate');
  console.log('PASS chronological route, reversed parents, repeated collections and deleted snapshots');
}

// Isolate each recorded choice. Neither the reagent plate number nor free-text
// labels establish a new reaction; a substrate plate number establishes lineage.
{
  function compareWith(change) {
    const other=structuredClone(product); other.id='6';
    const [reg,sub]=other.history.parents; reg.id='4'; reg.label='Second batch';
    change(other.history,reg,sub);
    const live=H.validate({...bench,plates:[product,other],left:'3',right:'6'}).plates;
    return H.routeFork(new Map(live.map(p=>[p.id,p])),'3','6');
  }
  assert.equal(compareWith(h=>{h.parents.reverse();}),null,'equivalent reagent setup prepared independently');
  assert.equal(compareWith((h,r,s)=>{s.id='5'; h.condition='heat';}),null,'identical substrates with distinct IDs are unrelated');
  for (const [field,change] of [
    ['reagent',(h,r)=>{r.stockId='hydroxide'; r.smiles='[Na+].[OH-]';}],
    ['medium',(h,r)=>{r.medium='ethanol';}], ['catalyst',(h,r)=>{r.catalyst='nickel';}],
    ['condition',h=>{h.condition='heat';}], ['pathway',h=>{h.pathway='aldehyde-oxidation';}],
    ['branch',h=>{h.branch.index=1;}], ['site',h=>{h.branch.sites='C5=O6';}]
  ]) assert.equal(compareWith(change)?.shared.id,'1',`${field} alone distinguishes the saved choices`);
  console.log('PASS route forks: latest shared ID, retained snapshots, endpoint order and distinct recorded choices');
}

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
    assert(!el('rack').querySelector('.plate-route'),'no organic route on a reagent preparation');
    w.ReactionInput.parse=parse;select('stock','custom');el('input').value='CC=C';click('create');await tick();
    select('left','3');select('right','4');select('condition','heat');click('preview');click('collect');await tick();
    const panel=cards()[4].querySelector('.plate-route'), unopened=capture(), edits=changes;
    assert(!panel.open);const opened=new Promise(resolve=>panel.addEventListener('toggle',resolve,{once:true}));
    panel.open=true;await opened;
    const steps=panel.querySelectorAll('ol > li');assert.equal(steps.length,1);
    const details=steps[0].querySelector('details');assert(!details.open);
    assert.match(details.textContent,/Reagent preparation: P1 · Hydrogen \+ P2 · Nickel/);
    assert.match(details.textContent,/Nickel catalyst|catalyst: Nickel/);
    assert.deepEqual(capture(),unopened);assert.equal(changes,edits);
    select('left','1');select('right','1');action(cards()[3],'Remove').click();
    assert.equal(el('right').value,'1');assert(el('preview').disabled,'Unrelated removal must not change a same-plate setup');
    select('left','1');select('right','2');action(cards()[0],'Remove').click();
    assert.equal(el('right').value,'2','Removing the first plate preserves the second');assert.notEqual(el('left').value,'2');
    select('stock','water');select('medium','ethanol');select('role','solvent');
    assert(el('medium').disabled);assert.equal(el('medium').value,'');click('create');await tick();
    assert.equal(capture().plates.at(-1).role,'solvent');
    api.setActive(false);
    console.log('PASS plate DOM: branches, reagent preparation in route details, comparison after removal, staged restore, cancellation and undo');
  } finally {w.close();}
}
if(process.argv.includes('--bench')) domChecks().catch(e=>{console.error(e);process.exitCode=1;});
