/* node test-reaction-oxidation.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {entries,run} = require('./reaction-oxidation.js');
const {preview} = require('./model-input.js');
const browser = vm.createContext({});
vm.runInContext('window = globalThis', browser);
for (const mod of ['systematic-name','chemistry','reaction-oxidation']) {
  vm.runInContext(fs.readFileSync(require.resolve('./'+mod+'.js'),'utf8'),browser);
}
const [aldehyde,acid,ketone] = ['oxidation-aldehyde','oxidation-acid','oxidation-ketone'];
assert.deepEqual(entries.map(e => e.id),[aldehyde,acid,ketone]);
assert.equal(new Set(entries.map(e => e.reagent)).size,1); // One chooser reagent, two primary outcomes.
for (const entry of entries) {
  for (const field of ['label','section','group','reagent','example']) assert.ok(entry[field].trim());
  assert.equal(run(entry.id,preview(entry.example)).group,entry.group);
}
function reverse(g) {
  const rev = i => g.atoms.length-1-i;
  return {name:'ignore input name',notation:'CC',atoms:g.atoms.slice().reverse(),hydrogens:g.hydrogens.slice().reverse(),
    bonds:g.bonds.map(b => ({a:rev(b.b),b:rev(b.a),order:b.order})).reverse()};
}
for (const [id,s,substrate,name,smiles] of [
  [aldehyde,'CCO','ethanol','ethanal','CC=O'],
  [acid,'CCO','ethanol','ethanoic acid','CC(=O)O'],
  [aldehyde,'CC(C)CO','2-methylpropan-1-ol','2-methylpropanal','CC(C)C=O'],
  [acid,'CC(C)CO','2-methylpropan-1-ol','2-methylpropanoic acid','CC(C)C(=O)O'],
  [ketone,'CC(O)C','propan-2-ol','propanone','CC(=O)C'],
  [ketone,'CCC(O)CC','pentan-3-ol','pentan-3-one','CCC(=O)CC'],
  [ketone,'CC(C)C(O)CC','2-methylpentan-3-ol','2-methylpentan-3-one','CC(C)C(=O)CC'],
  [aldehyde,'CO','methanol','methanal','C=O'],
  [acid,'CO','methanol','methanoic acid','OC=O']
]) {
  const g = preview(s), original = structuredClone(g), result = run(id,g);
  assert.equal(result.products,name+' + water');
  assert.equal(result.productName,name);
  assert.equal(preview(result.productSmiles)?.id,preview(smiles).id);
  assert.equal(result.stages.length,1);
  const [net] = result.stages;
  assert.match(net.title,/net/i);
  assert.equal(net.scheme,`${substrate} + ${id === acid ? '2[O]' : '[O]'} → ${name} + H2O`);
  assert.match(net.detail,id === acid ? /reflux.*excess oxidant/i : id === aldehyde ? /distillation/i : /carbonyl/i);
  assert.deepEqual(run(id,reverse(g)),result);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.ReactionOxidation.run(id,g))),result);
  assert.deepEqual(g,original);
}
for (const id of [aldehyde,acid,ketone]) {
  assert.deepEqual(run(id,preview('CC(C)(C)O')),{reason:'tertiary-alcohol'});
  for (const s of ['CC','COC','OCCO','OC1CCCC1','OC(C=C)C','OC#CC','OCCCl','OCC=O','CC(=O)O','CCCCCCCCCCCCCO']) {
    const g = preview('smiles:'+s);
    assert.ok(g,s);
    assert.deepEqual(run(id,g),{reason:'unsupported'},s);
  }
}
assert.deepEqual(run(ketone,preview('CCCO')),{reason:'no-rule'});
for (const id of [aldehyde,acid]) assert.deepEqual(run(id,preview('CC(O)CC')),{reason:'no-rule'});
assert.deepEqual(run('unknown',null),{reason:'no-rule'});
const g = preview('CCO');
for (const bad of [null, {}, {...g,hydrogens:[]}, {...g,hydrogens:[99,0,1]}, {...g,charges:[0,1,0]},
  {...g,charge:-1}, {...g,isotopes:[13,0,0]}, {...g,radicals:[1,0,0]}, {...g,radicalElectrons:[0,0,1]},
  {...g,notation:'[2H]OCC'}, {...g,stereo:{centers:[{specified:true}],bonds:[]}},
  {...g,bonds:[g.bonds[0],g.bonds[0]]}, {...g,bonds:[g.bonds[0],{a:0,b:6,order:1}]},
  {...g,bonds:g.bonds.map(b => ({...b,aromatic:true}))},
  {atoms:['C','C','C','C','O'],hydrogens:[2,2,2,3,1],bonds:[[0,1],[1,2],[2,0],[3,4]].map(([a,b]) => ({a,b,order:1}))}
]) assert.deepEqual(run(aldehyde,bad),{reason:'unsupported'});
console.log('Oxidation: three net pathways, graph-derived names and structures, and refusal cases passed.');
