/* node test-plate-chemistry.js */
'use strict';
const assert = require('node:assert/strict');
const Chem = require('./chemistry.js');
const engine = require('./plate-chemistry.js');
const graph = smiles => Chem.describe(Chem.readSmiles(smiles));
const material = (role,value) => typeof value==='string' ? {role,stockId:value} : {role,record:value};
const setup = (substrate,reagent,solvent,condition='ambient',catalyst) => ({condition,plates:[
  material('substrate',typeof substrate==='string' ? graph(substrate) : substrate), material('reagent',reagent),
  ...(solvent?[material('solvent',solvent)]:[]), ...(catalyst?[material('catalyst',catalyst)]:[])]});
const run = (...args) => engine.run(setup(...args));
const key = s => Chem.canonical(Chem.readSmiles(s.replace(/[/\\]/g,''))).key;
function products(result,expected) {
  assert.equal(result.ok,true,result.detail);
  assert.deepEqual(result.alternatives.map(a=>key(a.productSmiles)).sort(),expected.map(key).sort());
  for (const a of result.alternatives) {
    for (const k of ['label','productSmiles','sites','detail']) assert.ok(typeof a[k]==='string' && a[k].length,k);
    assert.ok(!a.productSmiles.includes('.'),'child must not smuggle in byproducts or solvent');
  }
  return result.alternatives.map(a=>a.productSmiles);
}
function reject(result,reason) {
  assert.equal(result.ok,false); assert.deepEqual(result.alternatives,[]); assert.ok(result.detail);
  if (reason) assert.equal(result.reason,reason,result.detail);
}
const reduce=(g,solvent='ethanol')=>run(g,'nabh4',solvent);
const h2=(g,condition='heat')=>run(g,'hydrogen',null,condition,'nickel');
for (const [s,p] of [['C=O','CO'],['CC=O','CCO'],['CC(=O)C','CC(O)C'],['CC(=O)CC(C)C','CC(O)CC(C)C']]) {
  products(reduce(s),[p]); products(reduce(s,'water'),[p]);
}
for (const s of ['C=C','CC(=O)O','CC(=O)OC','CC(=O)Cl','CC(=O)N','O=CC=C','CC(=O)COOC']) reject(reduce(s));
const di=setup('O=CCC(C)CCC=O','nabh4','ethanol'), before=JSON.stringify(di);
for (const p of products(engine.run(di),['OCCC(C)CCC=O','O=CCC(C)CCCO'])) products(reduce(p),['OCCC(C)CCCO']);
assert.equal(JSON.stringify(di),before,'a child must not mutate its parent plates');
const sym=reduce('O=CCCC=O'); products(sym,['OCCCC=O']); assert.match(sym.alternatives[0].sites,/ or /);
products(h2('CC(C)=CC'),['CCC(C)C']); products(h2('CCC#N','pressure'),['CCCN']);
for (const child of products(h2('C=CCCC(C)C=C'),['CCCCC(C)C=C','C=CCCC(C)CC'])) products(h2(child),['CCCCC(C)CC']);
products(h2('C=CCCC=C'),['CCCCC=C']);
for (const s of ['CC#C','C=CC=C','C=C=C','N#CCC=C','N#CC#N','CC=O','C1=CCCCC1','CC','C#N']) reject(h2(s));
reject(h2('CC#N','heat'),'condition'); reject(h2('C=C','ambient'),'condition');
reject(run('CC=C','hydrogen',null,'heat'),'catalyst'); reject(run('CC=C','hydrogen','water','heat','nickel'),'medium');
reject(run('CC=O','nabh4'),'medium'); reject(run('CC=O','nabh4','water','reflux'),'condition');
const oxidise=(s,condition)=>run(s,'dichromate','water',condition);
for (const [s,aldehyde,acid] of [['CO','C=O','O=CO'],['CCO','CC=O','CC(=O)O'],['CC(C)CO','CC(C)C=O','CC(C)C(=O)O']]) {
  const distil=oxidise(s,'distil'), reflux=oxidise(s,'reflux');
  const [child]=products(distil,[aldehyde]); products(reflux,[acid]);
  assert.match(distil.detail,/separating.*oxidation/i); assert.match(reflux.detail,/excess.*aldehyde.*acid/i);
  products(oxidise(child,'reflux'),[acid]); reject(oxidise(child,'distil'),'condition');
}
for (const condition of ['distil','reflux']) {
  products(oxidise('CC(O)CC',condition),['CC(=O)CC']);
  assert.match(oxidise('CC(O)(C)C',condition).detail,/tertiary.*no hydrogen/i);
  reject(oxidise('CC(O)(C)C',condition),'no-site'); reject(oxidise('CC(=O)C',condition),'no-site');
  for (const s of ['CC(=O)O','OC=CO','COC','CCCl','OCCO','OC1CCCCC1']) reject(oxidise(s,condition));
  for (const s of [null,'ethanol']) reject(run('CCO','dichromate',s,condition),'medium');
  reject(run('CCO','dichromate','water',condition,'nickel'),'catalyst');
}
for (const condition of ['ambient','heat','pressure','uv']) reject(oxidise('CCO',condition),'condition');
reject(run('CCBr','hydroxide','water','distil'),'condition');
const oxidation=setup('CC=O','dichromate','water','reflux'), saved=JSON.stringify(oxidation);
products(engine.run(oxidation),['CC(=O)O']); assert.equal(JSON.stringify(oxidation),saved);
products(run('BrCC','hydroxide','water','reflux'),['CCO']);
const elimination=run('CC(Br)CC','hydroxide','ethanol','heat');
const alkenes=products(elimination,['C=CCC','CC=CC','CC=CC']);
assert.equal(new Set(alkenes).size,3); assert.equal(alkenes.filter(x=>x.includes('/')).length,2);
// A parsed E/Z child can lose that assignment when its only C=C is reduced.
for (const smiles of alkenes.filter(s=>s.includes('/'))) {
  const g=graph('CC=CC'), {a,b}=g.bonds.find(b=>b.order===2);
  products(h2({...g,notation:smiles,stereo:{centers:[],bonds:[{a,b,descriptor:smiles.includes('\\')?'Z':'E',specified:true}]}}),['CCCC']);
}
reject(run('CCBr','hydroxide',null,'heat'),'medium'); reject(run('CCBr','hydroxide','ethanol','ambient'),'condition');
reject(run('CBr','hydroxide','ethanol','heat'),'no-site'); reject(run('CCF','hydroxide','water','heat'));
reject(run('CC(C)Br','hydroxide','water','heat'),'no-site');
products(run('CC(=O)Cl','water','water'),['CC(=O)O']); products(run('CCC(=O)Cl','ethanol'),['CCC(=O)OCC']);
reject(run('CC(=O)Cl','ethanol','water'),'medium'); reject(run('CC(=O)O','water'),'no-site');
products(run('C','chlorine',null,'uv'),['CCl']); reject(run('C','chlorine'), 'condition');
const stockMethane=setup('C','chlorine',null,'uv'); stockMethane.plates[0]=material('substrate','methane');
products(engine.run(stockMethane),['CCl']); reject(h2('C')); reject(reduce('C'));
for (const falseCatalyst of ['water','methane',graph('C'),{atoms:['O'],hydrogens:[2],bonds:[]}]) reject(run('C=C','hydrogen',null,'heat',falseCatalyst),'role');
// Identity comes from the structure, including attached H and formal charge, never a label or formula.
const water={atoms:['O'],hydrogens:[2],bonds:[],name:'not a reagent',formula:'CH4'};
products(run('CC(=O)Cl',water),['CC(=O)O']); products(run('CCBr','hydroxide',water,'heat'),['CCO']);
products(run('CCBr','hydroxide',graph('OCC'),'heat'),['C=C']);
reject(run('CCBr','hydroxide',{...graph('COC'),formula:'C2H6O',name:'ethanol'},'heat'),'identity');
reject(run('CC=O','nabh4',{...water,isotopes:[18]}),'identity');
products(run('CC=O',{atoms:['B','Na'],hydrogens:[4,0],charges:[-1,1],bonds:[]},water),['CCO']);
reject(run('CC=O',{atoms:['B','Na'],hydrogens:[4,0],charges:[0,0],bonds:[]},water),'identity');
reject(engine.run(null),'plates'); reject(engine.run({plates:[material('substrate','methane')]}),'plates');
for (const extra of [material('substrate',graph('CCO')),material('solvent','water'),material('reagent','chlorine')]) reject(engine.run({...di,plates:di.plates.concat(extra)}),'combination');
reject(engine.run({...di,plates:di.plates.map(p=>({...p,id:'same'}))}),'plates');
reject(engine.run({...di,plates:di.plates.map((p,i)=>i===0?{...p,stockId:'methane'}:p)}),'plates');
reject(engine.run({...di,condition:'invented'}),'condition'); reject(run('CC=O','nabh4','ethanol','ambient','nickel'),'catalyst');
for (const s of ['O=C1CCCCC1','CC(=O)C1=CC=CC=C1']) {
  reject(reduce(s),'mapped-carbonyl'); reject(run(s,'nabh4'),'medium'); reject(run(s,'nabh4','ethanol','heat'),'condition');
}
for (const s of ['O=C1OCCC1','OC(=O)C1CC1','O=C1CC(OO)CC1']) reject(reduce(s),'no-site');
const base=graph('CC=O');
for (const patch of [{radicals:[0,1,0]},{charges:[0,0,-1]},{isotopes:[0,0,18]},{hydrogens:[]},{notation:'[13C]C=O'},
  {stereo:{centers:[{atom:1,specified:true,cip:'R'}],bonds:[]}},{bonds:[base.bonds[0],base.bonds[0]]}]) reject(reduce({...base,...patch}),'outside-scope');
// Use literal graphs for the extended range instead of the small offline importer's parser.
function chain(n,end,order) {
  const atoms=Array(n).fill('C'), bonds=Array.from({length:n-1},(_,i)=>({a:i,b:i+1,order:i===n-2?order:1}));
  atoms[n-1]=end; const hydrogens=atoms.map(e=>Chem.VAL[e]);
  for (const {a,b,order} of bonds) { hydrogens[a]-=order; hydrogens[b]-=order; }
  return {atoms,bonds,hydrogens};
}
for (const [out,atom] of [[reduce(chain(256,'O',2)),'O'],[h2(chain(256,'C',2)),'C'],[h2(chain(256,'N',3),'pressure'),'N'],[run(chain(256,'Br',1),'hydroxide','water','heat'),'O']]) {
  assert.ok(out.ok,out.detail); const s=out.alternatives[0].productSmiles;assert.equal(s.length,256);assert.ok(s.includes(atom));
}
for (const order of [1,2]) {
  const acid=oxidise(chain(255,'O',order),'reflux'); assert.ok(acid.ok,acid.detail);
  assert.equal(acid.alternatives[0].productSmiles.match(/[CO]/g).length,256);
  reject(oxidise(chain(256,'O',order),'reflux'),'outside-scope');
}
assert.ok(oxidise(chain(256,'O',1),'distil').ok);
reject(h2(chain(257,'C',2)),'outside-scope');
assert.ok(engine.stock.every(s=>s.roles.length && s.smiles));
console.log('Plate chemistry tests passed.');
