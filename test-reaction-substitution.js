/* node test-reaction-substitution.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('./chemistry.js');
const {preview} = require('./model-input.js');
const {entries,run} = require('./reaction-substitution.js');
const browser = {window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('./reaction-substitution.js'),'utf8'),browser);
assert.equal(browser.window.ReactionSubstitution.entries.length,13);
assert.equal(new Set(entries.map(e => e.id)).size,13);
const react = (id,s) => run(id,preview(s));

// Test an independent substrate for each entry, not just its catalog example.
const cases = [
  ['halo-cyanide','CCCCl','CH3CH2CH2C≡N + Cl-','CCCC#N'],
  ['halo-ammonia','CCCI','CH3CH2CH2NH2 + NH4+ + I-','CCCN'],
  ['halo-methylamine','CCl','CH3NHCH3 + CH3NH3+ + Cl-','CNC'],
  ['halo-dimethylamine','CBr','CH3N(CH3)2 + (CH3)2NH2+ + Br-','CN(C)C'],
  ['halo-trimethylamine','CI','CH3[N+](CH3)3 + I-','C[N+](C)(C)C'],
  ['acyl-water','CCC(=O)Cl','CH3CH2C(=O)OH + HCl','CCC(=O)O'],
  ['acyl-ethanol','CC(C)C(=O)Cl','CH3CH(CH3)C(=O)OCH2CH3 + HCl','CC(C)C(=O)OCC'],
  ['acyl-ammonia','CCC(=O)Cl','CH3CH2C(=O)NH2 + NH4+ + Cl-','CCC(=O)N'],
  ['acyl-methylamine','CCCC(=O)Cl','CH3CH2CH2C(=O)NHCH3 + CH3NH3+ + Cl-','CCCC(=O)NC'],
  ['anhydride-water','CCC(=O)OC(=O)CC','2 CH3CH2C(=O)OH','CCC(=O)O'],
  ['anhydride-ethanol','CCC(=O)OC(=O)CC','CH3CH2C(=O)OCH2CH3 + CH3CH2C(=O)OH','CCC(=O)OCC'],
  ['anhydride-ammonia','CCC(=O)OC(=O)CC','CH3CH2C(=O)NH2 + CH3CH2C(=O)OH','CCC(=O)N'],
  ['anhydride-methylamine','CCC(=O)OC(=O)CC','CH3CH2C(=O)NHCH3 + CH3CH2C(=O)OH','CCC(=O)NC']
];
function reverse(g) {
  const index = i => g.atoms.length-1-i;
  return {atoms:g.atoms.slice().reverse(), hydrogens:g.hydrogens.slice().reverse(),
    bonds:g.bonds.map(b => ({a:index(b.b),b:index(b.a),order:b.order})).reverse()};
}
for (const [id,s,products,productSmiles] of cases) {
  const entry = entries.find(e => e.id === id);
  for (const key of ['label','group','reagent','section','example']) assert.ok(entry[key]?.trim());
  assert.ok(react(id,entry.example).products);
  const g = preview(s), original = structuredClone(g);
  const result = run(id,g), {stages} = result;
  assert.equal(result.products,products,id);
  assert.equal(result.productSmiles,productSmiles,id);
  assert.equal(result.group,entry.group);
  assert.deepEqual(g,original);
  assert.deepEqual(run(id,reverse(g)),result,id);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.window.ReactionSubstitution.run(id,g))),result);
  assert.ok(stages.every(s => s.title && s.detail && s.scheme.includes(' → ')));
  if (id.startsWith('halo-')) {
    const noTransfer = ['halo-cyanide','halo-trimethylamine'].includes(id);
    assert.equal(stages.length,noTransfer ? 1 : 2);
    if (!noTransfer) assert.match(stages[0].scheme,/\[NH\d?\+\]/);
    if (noTransfer) continue;
  } else {
    assert.equal(stages.length,3);
    assert.match(stages[0].scheme,/C\(O-\).*\[(?:N|O)H\d?\+\]/);
    assert.match(stages[1].scheme,id.startsWith('acyl-') ? /Cl-$/ : /C\(=O\)O-$/);
  }
  assert.equal(stages.at(-1).title,'Proton transfer');
}
const branched = react('halo-cyanide','CC(C)CCBr');
assert.equal(branched.products,'CH3CH(CH3)CH2CH2C≡N + Br-');
assert.equal(branched.productSmiles,'CC(C)CCC#N');
const mixed = preview('CCCC(=O)OC(=O)C');
assert.equal(run('anhydride-water',mixed).products,'CH3C(=O)OH + CH3CH2CH2C(=O)OH');
assert.deepEqual(run('anhydride-water',reverse(mixed)),run('anhydride-water',mixed));
for (const key of ['ammonia','ethanol','methylamine']) assert.deepEqual(run('anhydride-'+key,mixed),{reason:'ambiguous'});
for (const [id,s,reason] of [
  ['halo-ammonia','CC(=O)Cl','no-rule'], ['acyl-ethanol','CCCCl','no-rule'],
  ['acyl-water','CC(=O)OC(=O)C','no-rule'], ['anhydride-water','CC(=O)Cl','no-rule'],
  ['anhydride-ammonia','CC(=O)OCC','no-rule'], ['acyl-ammonia','CC(=O)O','no-rule'],
  ['acyl-ethanol','CC(=O)Br','no-rule'], ['halo-water','CCBr','no-rule'],
  ['halo-cyanide','CC(Br)C','hindered'], ['halo-ammonia','CC(C)(C)CBr','hindered'],
  ['halo-methylamine','BrCCCCl','ambiguous'], ['acyl-water','ClCCC(=O)Cl','ambiguous'],
  ['halo-cyanide','C=CCl','unsupported'], ['halo-cyanide','CCF','unsupported'],
  ['acyl-ammonia','OCC(=O)Cl','unsupported'], ['anhydride-ammonia','O=C1CCC(=O)O1','unsupported']
]) assert.deepEqual(react(id,s),{reason},`${id}: ${s}`);
const g = preview('CCBr');
for (const bad of [null, {}, {...g,charges:[1,0,0]}, {...g,hydrogens:[]}, {...g,bonds:g.bonds.concat(g.bonds)},
  {...g,atoms:[...g.atoms,'C'],hydrogens:[...g.hydrogens,4]}, {...g,stereo:{centers:[{specified:true}]}}]) {
  assert.deepEqual(run('halo-cyanide',bad),{reason:'unsupported'});
}
console.log('Substitution: all 13 mechanisms, product identities, proton transfers and refusal cases passed.');
