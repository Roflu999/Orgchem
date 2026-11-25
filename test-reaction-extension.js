/* node test-reaction-extension.js */
'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {entries,run} = require('./reaction-extension.js');
const {preview} = require('./model-input.js');
const browser = vm.createContext({});
vm.runInContext('self = window = globalThis',browser);
for (const mod of ['chemistry','systematic-name','reaction-extension']) {
  vm.runInContext(fs.readFileSync(require.resolve('./'+mod+'.js'),'utf8'),browser);
}
const [iodo,diels] = ['iodoform-test','diels-alder'];
assert.deepEqual(entries.map(e => e.id),[iodo,diels]);
for (const e of entries) {
  for (const key of ['label','reagent','example','group','section']) assert.ok(e[key].trim());
  const g = preview(e.example), result = run(e.id,g);
  assert.equal(result.group,e.group);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.ReactionExtension.run(e.id,g))),result);
}
function reverse(g) {
  const rev = i => g.atoms.length-1-i;
  return {name:'misleading name',formula:'CH4',notation:'C',atoms:g.atoms.slice().reverse(),hydrogens:g.hydrogens.slice().reverse(),
    bonds:g.bonds.map(({a,b,order}) => ({a:rev(b),b:rev(a),order})).reverse()};
}
function record(s) { const g = preview('smiles:'+s); assert.ok(g,s); return g; }
for (const [smiles,substrate,ion,acidSmiles,alcohol] of [
  ['CCO','ethanol','methanoate','OC=O',true], ['CC=O','ethanal','methanoate','OC=O',false],
  ['CC(=O)C','propanone','ethanoate','CC(=O)O',false], ['CC(O)C','propan-2-ol','ethanoate','CC(=O)O',true],
  ['CCCC(=O)C','pentan-2-one','butanoate','CCCC(=O)O',false], ['CC(O)CC','butan-2-ol','propanoate','CCC(=O)O',true],
  ['CC(=O)C(C)C','3-methylbutan-2-one','2-methylpropanoate','CC(C)C(=O)O',false]
]) {
  for (const g of [record(smiles),reverse(record(smiles))]) {
    const original = structuredClone(g), result = run(iodo,g);
    assert.equal(result.productName,ion);
    assert.match(result.products,/yellow iodoform precipitate/i);
    assert.ok(result.products.includes(ion));
    // The offline reader does not accept ions. Check the charge explicitly, then
    // compare connectivity of the protonated reference and the reported product.
    assert.equal(result.productSmiles.match(/\[O-\]/g)?.length,1);
    const acid = record(result.productSmiles.replace('[O-]','O'));
    assert.equal(acid.id,record(acidSmiles).id);
    assert.equal(result.stages.length,alcohol ? 4 : 3);
    if (alcohol) assert.match(result.stages[0].scheme,/I2 \+ 2 OH- -> RCOCH3 \+ 2 I- \+ 2 H2O/);
    const net = result.stages.at(-1).scheme;
    const [,actualSub,I,OH,actualIon,iodide,water] = net.match(/^(.+) \+ (\d+) I2 \+ (\d+) OH- -> (.+) \+ CHI3\(s\) \+ (\d+) I- \+ (\d+) H2O$/);
    assert.equal(actualSub,substrate); assert.equal(actualIon,ion);
    assert.equal(+I,alcohol ? 4 : 3);
    assert.equal(2*I,3+(+iodide),'iodine balance');
    assert.equal(+OH,1+(+iodide),'charge balance');
    assert.equal(1+(+OH),2+(+water),'oxygen balance');
    const sumH = x => x.hydrogens.reduce((a,b) => a+b,0);
    assert.equal(sumH(g)+(+OH),sumH(acid)-1+1+2*water,'hydrogen balance');
    assert.equal(g.atoms.filter(x => x === 'C').length,acid.atoms.filter(x => x === 'C').length+1,'carbon balance');
    assert.deepEqual(g,original);
  }
}
// Valid, simple alcohol/carbonyl but no matching site (not a conclusion about other substrates).
for (const s of ['CO','C=O','CCCO','CCC=O','CCC(=O)CC','CCC(O)CC','CC(C)(C)O']) {
  assert.deepEqual(run(iodo,record(s)),{reason:'no-rule'},s);
}
for (const s of ['COC','CC(=O)O','CC(=O)OC','CC(=O)Cl','CC(O)CO','CC(=O)C=O','CC(=O)C=C','CC(=O)C1CC1','CCCCCCCCCCCC(=O)C']) {
  assert.deepEqual(run(iodo,record(s)),{reason:'unsupported'},s);
}
const diene = record('C=CC=C');
const da = run(diels,diene), product = record(da.productSmiles);
assert.deepEqual(run(diels,reverse(diene)),da);
assert.equal(da.productName,'cyclohexene');
assert.equal(product.id,record('C1CCC=CC1').id);
assert.equal(product.formula,'C6H10');
assert.ok(product.atoms.every(e => e === 'C'));
assert.equal(product.bonds.length,6);
assert.equal(product.bonds.filter(b => b.order === 2).length,1);
assert.equal(da.stages[1].scheme,'A=B pi -> A-F sigma; E=F pi -> E-D sigma; C=D pi -> B=C pi');
assert.match(da.stages[1].detail,/simultaneous.*concerted/);
assert.match(da.stages[2].scheme,/C4H6 \+ C2H4 -> C6H10/);
assert.match(da.stages[2].detail,/only this unsubstituted pair/i);
for (const s of ['C=C','C=C=CC','C#CCC','C1=CCC1','C=C(C)C=C','C=CCC=C','C=CC=O']) {
  assert.ok(run(diels,{...record(s),name:'buta-1,3-diene',formula:'C4H6',notation:'C=CC=C'}).reason,s);
}
for (const [id,g] of [[iodo,record('CCO')],[diels,diene]]) {
  const marked = g.atoms.map((_,i) => Number(i === 0));
  for (const bad of [null,42,{}, {...g,atoms:Array(g.atoms.length)}, {...g,hydrogens:[99]}, {...g,hydrogens:marked},
    {...g,bonds:[...g.bonds.slice(1),g.bonds[1]]}, {...g,bonds:[...g.bonds.slice(1),{a:1,b:1,order:1}]},
    {...g,bonds:[...g.bonds.slice(1),{a:0,b:99,order:1}]}, {...g,bonds:g.bonds.map(b => ({...b,aromatic:true}))},
    {...g,bonds:g.bonds.map(b => ({...b,stereo:'E'}))}, {...g,charges:marked}, {...g,charge:-1}, {...g,isotopes:marked},
    {...g,radicals:marked}, {...g,radicalElectrons:marked}, {...g,stereo:{}}, {...g,notation:'[13C]'}, {...g,schema:'unknown'},
    {atoms:['C','C','C','C','O'],hydrogens:[2,2,2,3,1],bonds:[[0,1],[1,2],[0,2],[3,4]].map(([a,b]) => ({a,b,order:1}))}]) {
    assert.deepEqual(run(id,bad),{reason:'unsupported'});
  }
}
assert.deepEqual(run('unknown',null),{reason:'no-rule'});
console.log('Reaction extension: products, atom/charge balances, concerted bookkeeping, browser API and input guards passed.');
