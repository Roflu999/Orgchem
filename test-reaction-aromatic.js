/* node test-reaction-aromatic.js */
'use strict';
const assert = require('node:assert/strict');
const Chem = require('./chemistry.js');
const api = require('./reaction-aromatic.js');
const {entries,run} = api;
const describe = s => Chem.describe(Chem.readSmiles(s));
const rc = 'radical-chlorination', nit = 'benzene-nitration', ac = 'friedel-crafts-acylation';

assert.equal(globalThis.ReactionAromatic, api);
assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
for (const entry of entries) {
  for (const key of ['id','label','reagent','example','group','section']) assert.ok(typeof entry[key] === 'string' && entry[key]);
  const g = describe(entry.example), before = structuredClone(g), result = run(entry.id,g);
  assert.equal(result.group,entry.group);
  assert.ok(result.stages.length >= 3);
  for (const s of result.stages) {
    assert.ok(s.title && s.detail);
    assert.match(s.scheme,/->/);
  }
  assert.deepEqual(before,g);
  const rev = i => g.atoms.length-i-1;
  // Reverse numbering and endpoints, and drop all presentation/identity fields.
  assert.deepEqual(run(entry.id,{atoms:[...g.atoms].reverse(),hydrogens:[...g.hydrogens].reverse(),
    bonds:g.bonds.map(b => ({a:rev(b.b),b:rev(b.a),order:b.order})).reverse()}), result);
}

for (const [s,name,smiles,radical,dimer] of [
  ['C','chloromethane','CCl','CH3','CH3CH3'],
  ['CC','chloroethane','CCCl','CH3CH2','CH3CH2CH2CH3'],
  ['CC(C)(C)C','1-chloro-2,2-dimethylpropane','ClCC(C)(C)C','(CH3)3CCH2','(CH3)3CCH2CH2C(CH3)3']
]) {
  const {products,productSmiles,stages} = run(rc,describe(s));
  assert.ok(products.includes(name));
  assert.match(products,/further substitution/i);
  assert.equal(describe(productSmiles).id,describe(smiles).id);
  assert.deepEqual(stages.map(st => st.title.split(':')[0]),['Initiation','Propagation','Propagation','Termination']);
  const r = radical+'•';
  assert.match(stages[0].detail,/fishhooks/);
  assert.ok(stages[1].scheme.endsWith('HCl + '+r));
  assert.equal(stages[2].scheme,`${r} + Cl-Cl -> ${radical}Cl + Cl•`);
  assert.ok(stages[3].scheme.endsWith(`${r} + ${r} -> ${dimer}`));
}

const ring = describe('C1=CC=CC=C1');
const nr = run(nit,ring), ar = run(ac,ring);
assert.match(nr.products,/nitrobenzene.*water/i);
assert.equal(nr.productSmiles,'O=[N+]([O-])C1=CC=CC=C1');
assert.match(ar.products,/phenylethanone.*hydrogen chloride/i);
assert.equal(describe(ar.productSmiles).id,describe('C1=CC=CC=C1C(=O)C').id);
for (const [result,ion,intermediate,regenerated] of [
  [nr,'O=N+=O','[C6H6(NO2)]+','H2SO4'], [ar,'CH3-C+=O','[C6H6(COCH3)]+','AlCl3']
]) {
  const schemes = result.stages.map(s => s.scheme);
  assert.ok(schemes.slice(0,-2).some(s => s.includes(ion)));
  assert.ok(schemes.at(-2).endsWith(intermediate));
  assert.ok(schemes.at(-1).startsWith(intermediate));
  assert.ok(schemes.at(-1).includes(regenerated));
  assert.match(result.stages.at(-1).detail,/C-H pair.*aromaticity/);
}

for (const s of ['CCC','CCCC','CC(C)C','CCC(C)(C)C']) assert.deepEqual(run(rc,describe(s)),{reason:'ambiguous'});
for (const s of ['C1CC1','C=C','CCCl','CCO','C1=CC=CC=C1']) assert.deepEqual(run(rc,describe(s)),{reason:'no-rule'});
for (const id of [nit,ac]) for (const s of ['CC','C1CCCCC1','C1=CCCC=C1','C#CCCC#C','CC1=CC=CC=C1','N1=CC=CC=C1']) {
  const g = {...describe(s),name:'Benzene',notation:ring.notation,id:ring.id,formula:ring.formula,tags:ring.tags};
  assert.deepEqual(run(id,g),{reason:'no-rule'});
}
// Each fragment is a valid alkane, but the record is not a single molecule.
assert.deepEqual(run(rc,{atoms:['C','C'],hydrogens:[4,4],bonds:[]}),{reason:'unsupported'});
for (const patch of [{hydrogens:[]},{hydrogens:[2,1,1,1,1,1]},{charges:[0,1,0,0,0,0]},
  {isotopes:[13,0,0,0,0,0]},{radicalElectrons:[1,0,0,0,0,0]},{stereo:{}},
  {bonds:[...ring.bonds,ring.bonds[0]]},{bonds:[null]},{bonds:[{a:0,b:6,order:1}]},
  {bonds:[{a:0,b:0,order:1}]},{bonds:[{a:0,b:1,order:1.5}]},{schema:'bond-atlas/3'}]) {
  assert.deepEqual(run(nit,{...ring,...patch}),{reason:'unsupported'});
}
assert.deepEqual(run(nit,null),{reason:'unsupported'});
assert.deepEqual(run('unknown',ring),{reason:'no-rule'});
console.log('Aromatic and radical substitution: products, mechanisms, graph matching and refusals passed.');
