/* node test-reaction-addition.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Chem = require('./chemistry.js');
const {entries,run} = require('./reaction-addition.js');
const record = s => Chem.describe(Chem.readSmiles(s));
const check = (id,s) => run(id,record(s));

// Both exports must work. The browser module needs neither a toolkit nor a DOM.
const browser = {window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('./reaction-addition.js'),'utf8'),browser);
assert.deepEqual(JSON.parse(JSON.stringify(browser.window.ReactionAddition.entries)),entries);
assert.equal(browser.window.ReactionAddition.run('alkene-hbr',record('C=C')).products,'CH3CH2Br');
assert.equal(new Set(entries.map(e => e.id)).size,9);
for (const e of entries) {
  for (const key of ['id','label','reagent','example','group','section']) assert.ok(typeof e[key] === 'string' && e[key].trim());
  const r = check(e.id,e.example);
  assert.equal(r.group,e.group,e.id);
  assert.ok(r.products && r.stages.length && r.productSmiles,e.id);
  for (const stage of r.stages) {
    assert.ok(stage.title && stage.detail,e.id);
    assert.match(stage.scheme,/\S → \S/,e.id);
  }
}

// Preserve the product constitution, not just its formula. In each case repeat
// the rule with reversed indices, edge directions and misleading identity fields.
function match(id,smiles,expected,display) {
  const g = record(smiles), snapshot = structuredClone(g);
  const r = run(id,g);
  assert.equal(r.reason,undefined,`${id} on ${smiles}: ${r.reason}`);
  if (expected.includes('S')) assert.equal(r.productSmiles,expected); // Sulfur is outside the offline parser.
  else assert.equal(record(r.productSmiles).id,record(expected).id,`${smiles} -> ${r.productSmiles}`);
  if (display) assert.equal(r.products,display);
  const rev = i => g.atoms.length-i-1;
  const reversed = {atoms:g.atoms.slice().reverse(),hydrogens:g.hydrogens.slice().reverse(),
    bonds:g.bonds.map(({a,b,order}) => ({a:rev(b),b:rev(a),order})).reverse(),
    name:'ethane', id:'false-id', tags:['unrelated'], formula:'CH4', notation:'C'};
  assert.deepEqual(run(id,reversed),r,`${id} on reversed ${smiles}`);
  assert.deepEqual(g,snapshot);
  return r;
}
for (const row of [
  ['alkene-hbr','C=C','CCBr','CH3CH2Br'],
  ['alkene-hbr','CCCC=C','CCCC(Br)C','CH3CH(Br)CH2CH2CH3'],
  ['alkene-hbr','C=C(C)C','CC(C)(C)Br'],
  ['alkene-hbr','CCC=CCC','CCC(Br)CCC'],
  ['alkene-br2','CC=CCC','CC(Br)C(Br)CC','CH3CH(Br)CH(Br)CH2CH3'],
  ['alkene-br2','C=C(C)C','BrCC(Br)(C)C'],
  ['alkene-h2so4','C=C','CCOS(=O)(=O)O','CH3CH2OS(=O)(=O)OH'],
  ['alkene-h2so4','CC=C','CC(OS(=O)(=O)O)C','CH3CH(OS(=O)(=O)OH)CH3'],
  ['alkene-h2so4-hydrolysis','CCCC=C','CCCC(O)C','CH3CH(OH)CH2CH2CH3'],
  ['alkene-hydration','CC=CC','CC(O)CC'],
  ['alkene-hydration','C=C(C)C','CC(C)(C)O'],
  ['haloalkane-elimination','CCBr','C=C','CH2=CH2 + H2O + Br-'],
  ['haloalkane-elimination','CC(C)(C)Cl','C=C(C)C'],
  ['haloalkane-elimination','CC(C)CCI','CC(C)C=C','CH2=CHCH(CH3)CH3 + H2O + I-'],
  ['alcohol-dehydration','CCO','C=C','CH2=CH2 + H2O'],
  ['alcohol-dehydration','CCC(O)CC','CC=CCC'],
  ['alcohol-dehydration','CC(C)(C)O','C=C(C)C'],
  ['carbonyl-hydride','C=O','CO','CH3OH'],
  ['carbonyl-hydride','CC(C)C=O','CC(C)CO','CH3CH(CH3)CH2OH'],
  ['carbonyl-hydride','CCC(=O)C','CCC(O)C','CH3CH(OH)CH2CH3'],
  ['carbonyl-cyanide','C=O','N#CCO'],
  ['carbonyl-cyanide','CC=O','CC(O)C#N','CH3CH(OH)C≡N'],
  ['carbonyl-cyanide','CCC(=O)C','CCC(O)(C)C#N']
]) match(...row);

// Distinguish charged intermediates from concerted changes; do not suggest
// making free hydride or a primary carbocation as an isolable intermediate.
const stages = (id,s) => check(id,s).stages;
assert.match(stages('alkene-hbr','CC=C')[0].scheme,/\[CH\+\].*Br-/);
assert.match(stages('alkene-br2','C=C')[0].scheme,/\[Br\+\]1/);
assert.match(stages('alkene-br2','CC=CC')[1].detail,/anti addition/);
assert.match(stages('alkene-hydration','CC=C')[1].scheme,/\[OH2\+\]/);
assert.match(stages('alkene-h2so4-hydrolysis','C=C')[2].scheme,/CH3CH2OH \+ H2SO4$/);
const e2 = stages('haloalkane-elimination','CC(C)(C)Br');
assert.equal(e2.length,1); assert.match(e2[0].detail,/substitution competes/i);
const primary = stages('alcohol-dehydration','CCCO'), secondary = stages('alcohol-dehydration','CC(O)C');
assert.equal(primary.length,2); assert.match(primary[1].detail,/concerted/);
assert.equal(secondary.length,3); assert.match(secondary[1].scheme,/\[CH\+\]/);
for (const id of ['carbonyl-cyanide','carbonyl-hydride']) {
  const [s,t] = stages(id,'CC=O');
  assert.match(s.scheme,/\[O-\]/); assert.match(s.detail,/pi pair/);
  assert.match(t.scheme,id === 'carbonyl-hydride' ? /H2O → .*OH-/ : /HCN → .*CN-/);
}

for (const [id,reason,inputs] of [
  ['alkene-hbr','no-rule',['CC','CCO','C#C','CC=O']],
  ['alkene-hbr','ambiguous',['CC=CCC','C=CC=C','C=CC(C)C']],
  ['alkene-hydration','unsupported',['C=CO','C1=CCCC1']],
  ['haloalkane-elimination','no-rule',['CC','CCl','ClC(=O)C','CC(C)(C)CBr']],
  ['haloalkane-elimination','unsupported',['CCF','ClCCO']],
  ['haloalkane-elimination','ambiguous',['CCC(Br)C','ClCCBr']],
  ['alcohol-dehydration','ambiguous',['CC(O)CC','OCCO']],
  ['alcohol-dehydration','no-rule',['CO','COC','CC(=O)O']],
  ['carbonyl-hydride','no-rule',['CCO','CC(=O)O','CC(=O)N','CC(=O)OC','CC(=O)Cl']],
  ['carbonyl-cyanide','ambiguous',['CC(=O)C(=O)C']],
  ['carbonyl-cyanide','unsupported',['C=CC=O','O=C1CCCCC1']]
]) for (const s of inputs) assert.deepEqual(check(id,s),{reason},id+' '+s);

const g = record('C=C');
assert.deepEqual(run('unknown',g),{reason:'no-rule'});
assert.deepEqual(run('alkene-hbr',null),{reason:'unsupported'});
for (const patch of [{atoms:['C',null]}, {charge:1}, {charges:[0,1]}, {isotopes:[12,0]}, {radicals:[0,1]},
  {radicalElectrons:[0]}, {hydrogens:[1,2]}, {notation:'[13CH2]=C'}, {notation:'C/C=C/C'},
  {stereo:{centers:[],bonds:[{specified:true}],unsupported:[]}}, {bonds:[null]}, {bonds:[...g.bonds,...g.bonds]},
  {bonds:[{a:0,b:2,order:2}]}, {bonds:[{a:0,b:0,order:2}]}, {bonds:[{...g.bonds[0],aromatic:true}]},
  {bonds:[],hydrogens:[4,4]}]) assert.deepEqual(run('alkene-hbr',{...g,...patch}),{reason:'unsupported'});
assert.deepEqual(run('alkene-hbr',{...g,schema:'bond-atlas/3',charges:[0,0],radicals:[0,0],isotopes:[0,0],
  stereo:{centers:[],bonds:[],unsupported:[]}}),run('alkene-hbr',g));
console.log('Reaction addition: 9 catalogue entries, mechanism stages, product connectivity and refusals passed.');
