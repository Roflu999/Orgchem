/* Run with node test-systematic-name.js; no registry or network required. */
'use strict';
const assert = require('node:assert/strict');
const {generate} = require('./systematic-name.js');
const {readSmiles, enumerate} = require('./chemistry.js');

// Use only the SMILES reader to build fixtures, never the name dictionary.
function graph(smiles) {
  const {atoms, m} = readSmiles(smiles), bonds = [];
  m.forEach((row, a) => row.forEach((order, b) => { if (a < b && order) bonds.push({a, b, order}); }));
  return {atoms, bonds};
}
function reversed(g) {
  const ix = i => g.atoms.length - 1 - i;
  return {atoms: g.atoms.slice().reverse(), bonds: g.bonds.slice().reverse().map(({a,b,order}) => ({a: ix(b), b: ix(a), order}))};
}
const cases = [
  ['C', 'methane'], ['CCCCCCCCCCCC', 'dodecane'], ['CC(C)(C)C', '2,2-dimethylpropane'],
  ['CCC(CC)CCC', '3-ethylhexane'], // longest path goes through the written branch
  ['CCC(C(C)C)CC', '3-ethyl-2-methylpentane'], // most substituents among equal-length paths
  ['CC(C)CCCC(C)(C)C', '2,2,6-trimethylheptane'], // first differing locant, not the first only
  ['CC(C)CCCC(C)(C)CC', '2,6,6-trimethyloctane'], // smaller first locant, despite 3+3+7 < 2+6+6
  ['CC(C)(C)CCCC(C)C(C)C', '2,2,6,7-tetramethyloctane'], // 2,2,6,7 beats 2,3,7,7
  ['CC(C)CC(Cl)C', '2-chloro-4-methylpentane'], // alphabetical tie, chloro before methyl
  ['CC(C)(C)CC(CC)CCC', '4-ethyl-2,2-dimethylheptane'], // ignore multiplier for alphabetization
  ['CO', 'methanol'], ['OCC', 'ethanol'], ['CC(C)C(C)CO', '2,3-dimethylbutan-1-ol'],
  ['CCCC(CO)CCC', '2-propylpentan-1-ol'], // OH-bearing chain required, even when shorter
  ['CC(O)CCC(Cl)C', '5-chlorohexan-2-ol'],
  ['C=O', 'methanal'], ['CC(C)CC=O', '3-methylbutanal'], ['OC=O', 'methanoic acid'],
  ['OC(=O)C(Cl)(C)C', '2-chloro-2-methylpropanoic acid'],
  ['CC(=O)C', 'propanone'], ['CC(=O)CCC(C)C', '5-methylhexan-2-one'],
  ['C=C', 'ethene'], ['C=C(C)C', '2-methylpropene'], ['CC(C)CC=CC', '5-methylhex-2-ene'],
  ['C#CC(C)CC', '3-methylpent-1-yne'], ['CC#CC', 'but-2-yne'], ['C#C', 'ethyne'],
  ['ClC', 'chloromethane'], ['ClC(Cl)(Br)F', 'bromodichlorofluoromethane'], ['CCBr', 'bromoethane'],
  ['ClCC(C)C', '1-chloro-2-methylpropane'], ['CC(Br)CC(Cl)C', '2-bromo-4-chloropentane'],
];
for (const [s, name] of cases) {
  const g = graph(s), expected = {name, scope: 'connectivity-only'};
  const snapshot = JSON.stringify(g);
  assert.deepEqual(generate(g), expected, s);
  assert.deepEqual(generate(reversed(g)), expected, s + ' reversed');
  assert.equal(JSON.stringify(g), snapshot);
}

// Constitution is identical for either enantiomer, either E/Z assignment,
// and no assignment. Never claim to have named an individual stereoisomer.
for (const cip of ['R', 'S', null]) assert.deepEqual(generate({...graph('CC(O)CC'), stereo: {centers: [{atom: 1, cip}]}}), {name: 'butan-2-ol', scope: 'connectivity-only'});
for (const descriptor of ['E', 'Z', null]) assert.deepEqual(generate({...graph('CC=CC'), stereo: {bonds: [{descriptor}]}}), {name: 'but-2-ene', scope: 'connectivity-only'});

for (const s of ['C1CC1','CN','COC','CCOC=O','OC(=O)O','ClC=O','CC(=O)Cl','CC(O)CO','OCC=O','C=CCO','CC=C=C','CC#CC=CC','CCOO','C'.repeat(13),
  'CCCC(C(C)C)CCCC', // genuinely branched side chain on the preferred parent
  'CCCC(C=C)CCC', // longest chain excludes the double bond
]) assert.equal(generate(graph(s)), null, s);
for (const g of [null, {}, {atoms: [], bonds: []}, {atoms: ['C','C'], bonds: []}, {atoms: ['C','C','C','C'], bonds: [{a:0,b:1,order:1},{a:1,b:2,order:1},{a:2,b:0,order:1}]},
  {atoms:['C','C','C'], bonds: [{a:0,b:1,order:1},{a:1,b:0,order:1}]},
  {...graph('CC'), charges:[1,0]}, {...graph('CC'), isotopes:[0,13]}, {...graph('CC'), radicals:[1,0]},
  {...graph('CC'), hydrogens:[3,2]}, {...graph('CC'), hydrogens:[]}, {...graph('CC'), charges:[0]},
  ...[{a:0,b:0,order:1},{a:0,b:3,order:1},{a:0,b:1,order:4},{a:0,b:1,order:1,aromatic:true},null].map(b => ({atoms:['C','C'],bonds:[b]})),
]) assert.equal(generate(g), null, JSON.stringify(g));
assert.deepEqual(generate({...graph('CCO'), charges:[0,0,0], isotopes:[0,0,0], radicals:[0,0,0], hydrogens:[3,2,1]}), {name:'ethanol',scope:'connectivity-only'});
// All constitutional isomers of octane get distinct names without names in the input.
const octanes = enumerate('C8H18').isomers.map(({atoms,bonds}) => generate({atoms,bonds})?.name);
assert.equal(octanes.length, 18);
assert.ok(octanes.every(Boolean));
assert.equal(new Set(octanes).size, 18);
console.log('Systematic connectivity naming: parent selection, locants, stereo scope and rejection cases passed.');
