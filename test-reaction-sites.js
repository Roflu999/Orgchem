/* node test-reaction-sites.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Chem = require('./chemistry.js');
const {enumerate,shouldOverride,maxAtoms} = require('./reaction-sites.js');
const E2='haloalkane-elimination', SN2='hydroxide-sn2', DRY='alcohol-dehydration';
const ALD='oxidation-aldehyde', ACID='oxidation-acid', KET='oxidation-ketone';

// Unlike Chem.describe, this fixture keeps the original atom order in the SMILES.
function parent(s) {
  const {atoms,m}=Chem.readSmiles(s), bonds=[];
  m.forEach((row,a) => row.forEach((order,b) => { if (a < b && order) bonds.push({a,b,order}); }));
  return {atoms,bonds,hydrogens:m.map((row,i) => Chem.VAL[atoms[i]]-row.reduce((a,b)=>a+b,0))};
}
const constitution = s => Chem.canonical(Chem.readSmiles(s.replace(/[/\\]/g,''))).key;
const go = (id,s) => enumerate(id,parent(s));
function check(id,s,expected) {
  const g=parent(s), snapshot=structuredClone(g), out=enumerate(id,g);
  assert.deepEqual(out.map(a=>constitution(a.productSmiles)).sort(),expected.map(constitution).sort(),id+' '+s);
  for (const a of out) {
    for (const k of ['label','sites','products','productSmiles','group']) assert.equal(typeof a[k],'string');
    assert.ok(a.stages.length && a.siteChoices.length);
    assert.match(a.stages[0].scheme,/\S → \S/); assert.match(a.stages[0].detail,/No yield/);
    for (const site of a.siteChoices) {
      assert.equal(g.atoms[site.carbon-1],'C');
      for (const k of Object.keys(site).filter(k=>k !== 'carbon')) {
        const x=site[k]-1, c=site.carbon-1;
        assert.ok(g.bonds.some(({a,b})=>(a===x && b===c)||(b===x && a===c)));
        assert.match(a.sites,new RegExp(g.atoms[x]+site[k]+'(?!\\d)'));
      }
    }
  }
  assert.deepEqual(g,snapshot,'parent must not change');
  return out;
}
const bromobutane=check(E2,'CC(Br)CC',['C=CCC','C/C=C/C','C/C=C\\C']);
assert.deepEqual(bromobutane.map(a=>[a.stereo,a.productSmiles,a.siteChoices]),[
  ['not applicable','C=CCC',[{carbon:2,leavingAtom:3,betaCarbon:1}]],
  ['E','C/C=C/C',[{carbon:2,leavingAtom:3,betaCarbon:4}]],
  ['Z','C/C=C\\C',[{carbon:2,leavingAtom:3,betaCarbon:4}]]]);
assert.match(bromobutane[0].products,/H2O \+ Br-/);
const symmetric=check(E2,'CC(C)(C)Cl',['C=C(C)C']);
assert.deepEqual(symmetric[0].siteChoices.map(s=>s.betaCarbon),[1,3,4]);
assert.match(symmetric[0].sites,/Equivalent/);
check(E2,'ClCCBr',['C=CBr','C=CCl']);
check(E2,'CC(Br)(Br)C',['C=C(Br)C']).forEach(a=>assert.equal(a.siteChoices.length,4));
check(E2,'CC(C)(Br)CC',['C=C(C)CC','CC(C)=CC']); // Identical methyl arms rule out E/Z.
const tris=check(E2,'CC(Cl)(F)CC',['C=C(F)CC','CC(F)=CC','CC(F)=CC']);
assert.deepEqual(tris.map(a=>a.stereo),['not applicable','E','Z']);
for (const a of tris.slice(1)) assert.match(a.productSmiles,/[/\\].*[/\\]/);
const unresolved=check(E2,'CC(Cl)(CC)CC',['C=C(CC)CC','CC=C(C)CC']).find(a=>a.stereo==='E/Z unresolved');
assert.equal(unresolved.siteChoices.length,2); assert.match(unresolved.stages[0].detail,/Both E and Z/);
assert.doesNotMatch(unresolved.productSmiles,/[/\\]/);
for (const s of ['CCl','CCF','CC(C)(C)CBr']) assert.deepEqual(go(E2,s),[]);
const dry=check(DRY,'CCC(O)CC',['CC=CCC','CC=CCC']);
assert.ok(dry.every(a=>a.siteChoices.length===2 && /rearrangements/.test(a.stages[0].detail)));
check(DRY,'OCCO',['C=CO']).forEach(a=>assert.equal(a.siteChoices.length,2));
assert.deepEqual(go(DRY,'CO'),[]);
const disub=check(SN2,'ClCC(C)CCBr',['OCC(C)CCBr','ClCC(C)CCO']);
assert.ok(disub.every(a=>a.unassignedCenters && /R\/S/.test(a.stages[0].detail)));
const disym=check(SN2,'BrCCBr',['OCCBr']);
assert.deepEqual(disym[0].siteChoices,[{carbon:2,leavingAtom:1},{carbon:3,leavingAtom:4}]);
check(SN2,'CBr',['CO']); check(SN2,'OCCCl',['OCCO']); check(SN2,'CC(C)(C)CBr',['CC(C)(C)CO']);
assert.match(go(SN2,'CCBr')[0].products,/ \+ Br-$/);
for (const s of ['CC(Br)C','CCF','COCCl','CC(C)(C)Br']) assert.deepEqual(go(SN2,s),[]);
for (const [id,expected] of [[ALD,['O=CC(O)CCO','OCC(O)CC=O']],
  [ACID,['OC(=O)C(O)CCO','OCC(O)CC(=O)O']],[KET,['OCC(=O)CCO']]]) check(id,'OCC(O)CCO',expected);
const diol=check(ACID,'OCCO',['OC(=O)CO']);
assert.deepEqual(diol[0].siteChoices,[{carbon:2,oxygen:1},{carbon:3,oxygen:4}]);
assert.match(diol[0].stages[0].scheme,/2\[O\]/);
check(KET,'CC(O)C(O)C',['CC(=O)C(O)C']).forEach(a=>assert.equal(a.siteChoices.length,2));
check(ALD,'CO',['C=O']); check(ACID,'CO',['OC=O']);
check(ALD,'NCC(O)CO',['NCC(O)C=O']); check(ALD,'ClCCO',['ClCC=O']);
for (const s of ['CC(C)(C)O','COC','OC(O)C']) for (const id of [ALD,ACID,KET]) assert.deepEqual(go(id,s),[]);

// Each first-step product becomes a fresh parent with its own atom numbering.
for (const [id,ends] of [[ACID,'OC(=O)C(C)CC(=O)O'],[ALD,'O=CC(C)CC=O']]) {
  const first=go(id,'OCC(C)CCO');
  assert.equal(first.length,2);
  for (const a of first) {
    const [second]=check(id,a.productSmiles,[ends]);
    assert.equal(second.siteChoices.length,1);
    assert.deepEqual(go(id,second.productSmiles),[]);
  }
}
const [allyl]=check(E2,'ClCCCO',['C=CCO']);
check(ALD,allyl.productSmiles,['C=CC=O']);
check(SN2,'CC(=O)CCl',['CC(=O)CO']);
check(E2,'C=CCC(Cl)C',['C=CC=CC','C=CC=CC','C=CCC=C']);
for (const s of ['C=CO','CC(=O)O','CC=CO']) for (const id of [ALD,ACID,KET,DRY]) assert.deepEqual(go(id,s),[]);
for (const s of ['C=CCl','CC=C(Br)C','CC(=O)Cl']) for (const id of [SN2,E2]) assert.deepEqual(go(id,s),[]);
assert.deepEqual(go(E2,'C=CCCl'),[]); // Unsaturated beta C cannot be used to make an allene.
assert.deepEqual(go(SN2,'N=CCCBr'),[]); assert.deepEqual(go(SN2,'C=C=CCCBr'),[]);
const unsat=parent('CC=CCO'), spec={a:1,b:2,specified:false,descriptor:null};
const [spectator]=enumerate(ALD,{...unsat,stereo:{centers:[],bonds:[spec]}});
assert.equal(spectator.stereo,'E/Z unresolved'); assert.match(spectator.stages[0].detail,/retained C=C/);
assert.doesNotMatch(spectator.productSmiles,/[/\\\\]/); assert.equal(constitution(spectator.productSmiles),constitution('CC=CC=O'));
for (const bad of [{...spec,specified:true},{...spec,descriptor:'E'},{...spec,cisTrans:'cis'},{...spec,b:3}]) {
  assert.deepEqual(enumerate(ALD,{...unsat,stereo:{centers:[],bonds:[bad]}}),[]);
}
assert.deepEqual(enumerate(ALD,{...unsat,notation:'C/C=C/CO'}),[]);
const twoAlkenes=check(E2,'CC=CCCC(Cl)CC',['CC=CCC=CCC','CC=CCCC=CC']);
assert.ok(twoAlkenes.every(a=>a.stereo==='E/Z unresolved' && !/[/\\\\]/.test(a.productSmiles)));

// Constitution, relative configuration and site identities must survive a parent
// permutation, even when record.notation is missing or is not in that atom order.
for (const [id,s] of [[E2,'CC(Cl)(F)CC'],[E2,'CC(C)(C)Cl'],[ACID,'BrCC(O)CCO'],[SN2,'BrCCBr']]) {
  const g=parent(s), n=g.atoms.length, forward=enumerate(id,g);
  const reversed=enumerate(id,{atoms:g.atoms.slice().reverse(),hydrogens:g.hydrogens.slice().reverse(),notation:'C',
    bonds:g.bonds.map(({a,b,order}) => ({a:n-1-b,b:n-1-a,order})).reverse()});
  assert.deepEqual(forward.map(a=>a.productSmiles),reversed.map(a=>a.productSmiles));
  for (let i=0;i<forward.length;i++) {
    const choices=reversed[i].siteChoices.map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,n+1-v])));
    assert.deepEqual(new Set(choices.map(s=>JSON.stringify(s))),new Set(forward[i].siteChoices.map(s=>JSON.stringify(s))));
  }
}
const mixed='ClC'+'C(O)C'.repeat(14)+'CBr'; // 46 atoms, 14 distinguishable alcohols.
assert.equal(go(KET,mixed).length,14); assert.equal(go(SN2,mixed).length,2);
// Exercise the RDKit record shape directly: these are larger than the offline parser.
function alcohol(n,branches=[]) {
  const atoms=Array(n-1).fill('C').concat('O'), bonds=atoms.slice(1).map((_,i)=>({a:i,b:i+1,order:1}));
  for (const c of branches) bonds.push({a:c,b:atoms.push('O')-1,order:1});
  const hydrogens=atoms.map(el=>Chem.VAL[el]);
  for (const {a,b} of bonds) {hydrogens[a]--;hydrogens[b]--;}
  return {atoms,bonds,hydrogens};
}
assert.equal(maxAtoms,256);
assert.equal(enumerate(ACID,alcohol(maxAtoms-1))[0].productSmiles.match(/[CO]/g).length,maxAtoms);
assert.deepEqual(enumerate(ACID,alcohol(maxAtoms)),[]); // Adding oxygen must not create an unloadable 257-atom product.
assert.equal(enumerate(ALD,alcohol(maxAtoms))[0].productSmiles.match(/[CO]/g).length,maxAtoms);
assert.deepEqual(enumerate(ALD,alcohol(maxAtoms+1)),[]);
const large=alcohol(220,[19,77,101,180]), oxidized=enumerate(KET,large);
assert.equal(oxidized.length,4);
assert.deepEqual(oxidized.map(r=>r.siteChoices[0].carbon).sort((a,b)=>a-b),[20,78,102,181]);
const flip=i=>large.atoms.length-1-i;
const reverseLarge={atoms:large.atoms.slice().reverse(),hydrogens:large.hydrogens.slice().reverse(),
  bonds:large.bonds.map(({a,b,order})=>({a:flip(b),b:flip(a),order})).reverse()};
assert.deepEqual(enumerate(KET,reverseLarge).map(r=>r.productSmiles),oxidized.map(r=>r.productSmiles));
assert.ok(oxidized.every(r=>r.unassignedCenters && !/[@/\\]/.test(r.productSmiles)));
assert.deepEqual(enumerate(KET,{...large,stereo:{centers:[{atom:19,specified:true,cip:'R'}],bonds:[]}}),[]);
const ok=parent('CCBr'), badBonds=(...bonds)=>({...ok,bonds});
for (const bad of [null,{},[],parent('C1CC1Br'),parent('C=CBr'),parent('C#CCBr'),{...ok,hydrogens:[3,3,0]},
  {...ok,atoms:['C',null,'Br']},{...ok,atoms:['C','C','S']},{...ok,atoms:['C','C','H']},{...ok,hydrogens:[3,-1,0]},
  {...ok,charges:[,0,0]},{...ok,radicals:[0,1,0]},{...ok,radicalElectrons:[0,1,0]},{...ok,isotopes:[0,0,81]},
  {...ok,charge:1},{...ok,notation:'C[C@H](Br)F'},{...ok,notation:'[13CH3]CBr'},{...ok,notation:'x'.repeat(2000)},
  {...ok,stereo:{centers:[{specified:true}],bonds:[]}},{...ok,stereo:{centers:{},bonds:[]}},
  {...ok,stereo:{centers:[],bonds:[],unsupported:['axial']}},{...ok,bonds:Array(10000)},
  badBonds(null,ok.bonds[1]),badBonds(ok.bonds[0],ok.bonds[0]),badBonds({...ok.bonds[0],a:0,b:0},ok.bonds[1]),
  badBonds({...ok.bonds[0],a:-1},ok.bonds[1]),badBonds({...ok.bonds[0],aromatic:true},ok.bonds[1]),
  badBonds({...ok.bonds[0],direction:'up'},ok.bonds[1]),badBonds({...ok.bonds[0],order:1.5},ok.bonds[1]),
  // Triangle plus isolated bromomethane has n-1 bonds but is not a tree.
  {atoms:['C','C','C','C','Br'],hydrogens:[2,2,2,3,0],bonds:[[0,1],[1,2],[2,0],[3,4]].map(([a,b])=>({a,b,order:1}))}])
  assert.deepEqual(enumerate(SN2,bad),[]);
assert.deepEqual(enumerate('toString',ok),[]);
assert.equal(enumerate(SN2,{...ok,stereo:{centers:[],bonds:[],unsupported:[]}}).length,1);
assert.equal(shouldOverride({},[]),false); assert.equal(shouldOverride({},go(SN2,'CCBr')),false);
assert.equal(shouldOverride({reason:'unsupported'},go(SN2,'CCBr')),true);
assert.equal(shouldOverride({},bromobutane),true); assert.equal(shouldOverride({},diol),true);
const browser={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('./reaction-sites.js'),'utf8'),browser);
assert.deepEqual(JSON.parse(JSON.stringify(browser.window.ReactionSites.enumerate(E2,parent('CC(Br)CC')))),bromobutane);
console.log('Reaction site tests passed.');
