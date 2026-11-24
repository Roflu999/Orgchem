/* node test-reaction-rules.js */
'use strict';
const assert = require('node:assert/strict');
require('./chemistry.js');
require('./geometry.js');
const {preview} = require('./model-input.js');
const {analyze} = require('./reaction-rules.js');
const run = (s, reagent='hydroxide') => analyze(preview(s), reagent);
const key = ({a,b,order}) => `${Math.min(a,b)}:${Math.max(a,b)}:${order}`;
const edge = (a,b) => key({a,b,order:1});

function check(record,kind) {
  const snapshot = structuredClone(record);
  const result = analyze(record,'hydroxide');
  assert.equal(result.kind,kind);
  assert.deepEqual(record,snapshot);
  assert.deepEqual(analyze(record,'hydroxide'),result);
  assert.deepEqual(analyze(record,'water'),{reason:'no-rule'});
  const {atoms,bondsBefore,bondsAfter,arrows,site,reagentAtom,leavingAtom} = result;
  const acid = kind === 'acid-base', n = record.atoms.length;
  assert.equal(atoms.length,n+(acid ? 2 : 1));
  assert.deepEqual(atoms.slice(0,n).map(a => a.e),record.atoms);
  assert.deepEqual(atoms.slice(n).map(a => a.e),acid ? ['H','O'] : ['O']);
  assert.equal(atoms[site].e,acid ? 'H' : 'C');
  assert.ok(acid ? atoms[leavingAtom].e === 'O' : ['Cl','Br','I'].includes(atoms[leavingAtom].e));
  assert.equal(atoms[reagentAtom].e,'O');
  assert.equal(atoms[reagentAtom].h,1);
  assert.equal(atoms[reagentAtom].chargeBefore,-1);
  assert.equal(atoms[leavingAtom].chargeAfter,-1);
  assert.equal(atoms.filter(a => a.e === 'H').length + atoms.reduce((sum,a) => sum+a.h,0),
    1+record.hydrogens.reduce((a,b) => a+b,0));
  for (const [stage,bonds] of [['Before',bondsBefore],['After',bondsAfter]]) {
    const q = 'charge'+stage;
    assert.equal(atoms.reduce((s,a) => s+a[q],0),-1);
    const used = atoms.map(a => a.h);
    const valid = i => Number.isInteger(i) && i >= 0 && i < atoms.length;
    assert.equal(new Set(bonds.map(key)).size,bonds.length);
    for (const {a,b,order} of bonds) {
      assert.ok(valid(a) && valid(b) && a !== b && [1,2].includes(order));
      used[a] += order; used[b] += order;
    }
    atoms.forEach((a,i) => {
      assert.ok([0,-1].includes(a[q]));
      assert.equal(used[i],({C:4,O:2,H:1,Cl:1,Br:1,I:1})[a.e]+a[q]);
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
      for (const b of atoms.slice(0,i)) assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>0.65,'distinct positions');
    });
  }
  const before = bondsBefore.map(key), after = bondsAfter.map(key);
  assert.deepEqual(before.filter(k => !after.includes(k)),[edge(leavingAtom,site)]);
  assert.deepEqual(after.filter(k => !before.includes(k)),[edge(site,reagentAtom)]);
  assert.deepEqual(before.slice(0,record.bonds.length),record.bonds.map(key));
  assert.deepEqual(arrows,[{from:[reagentAtom],to:[site]}, {from:[site,leavingAtom],to:[leavingAtom]}]);
  // Check that the attacking pair approaches opposite the breaking bond.
  const a = atoms[site], b = atoms[leavingAtom], c = atoms[reagentAtom];
  const cos = ((b.x-a.x)*(c.x-a.x)+(b.y-a.y)*(c.y-a.y))/
    (Math.hypot(b.x-a.x,b.y-a.y)*Math.hypot(c.x-a.x,c.y-a.y));
  assert.ok(cos < -0.99);
}

for (const [kind,inputs] of [
  ['acid-base',['formic acid','[H]OC(=O)C','acetic acid','propanoic acid','CCCCCC(=O)O',
    'CC(C)C(=O)O','CC(C)(C)C(=O)O']],
  ['sn2',['CCl','CBr','CI','CCCl','1-bromopropane','BrCCCCC','CC(C)CCCBr','ICCCCCCC']]
]) for (const text of inputs) {
  const record = preview(text);
  check(record,kind);
  // Reverse graph indexing, atom and bond directions. No tags, names or notation.
  const reverse = i => record.atoms.length-i-1;
  check({atoms:record.atoms.slice().reverse(),hydrogens:record.hydrogens.slice().reverse(),
    bonds:record.bonds.map(b => ({a:reverse(b.b),b:reverse(b.a),order:b.order})).reverse()},kind);
}

for (const [reason,inputs] of [
  ['no-rule',['CC','ethanol','CC(=O)OC','CC(=O)N','C1=CC=CC=C1O']],
  ['unsupported',['CF','C=CBr','C#CCl','C1=CC=CC=C1Br','ClC1CC1','C=CCCl','ClCCO',
    'CC(O)C(=O)O','CCC(C)C(=O)O','CCC(C)CCCCl','C1CC1C(=O)O','C=CC(=O)O',
    'CCCCCCCCCCCCBr','ClOC','FC(F)(F)C(=O)O']],
  ['hindered',['CC(Br)C','CC(Cl)(C)C','CC(C)CCl','CC(C)(C)CBr']],
  ['ambiguous',['ClCCBr','ClCCl','O=C(O)CC(=O)O','ClCCC(=O)O']]
]) for (const text of inputs) assert.deepEqual(run(text),{reason},text);

// The actual desk parser must preserve restrictions; never strip these to get a match.
for (const raw of ['[13CH3]Br','C[C@H](F)CCBr','F/C=C/CCBr','(R)-2-methylbutanoic acid',
  'CC(=O)[O-]','[CH2]Br','C(C','CC.Br','formula: C2H5Br']) {
  assert.equal(preview(raw),null,raw);
  assert.deepEqual(run(raw),{reason:'invalid'},raw);
}
const g = preview('CBr');
const changed = (patch,reason) => assert.deepEqual(analyze({...g,...patch},'hydroxide'),{reason});
for (const patch of [{hydrogens:[]},{hydrogens:[1,0]},{hydrogens:[3,-1]},
  {isotopes:'x'},{charges:[0]},{atoms:[undefined,'Br']}, {bonds:[null]},
  {bonds:[{a:0,b:2,order:1}]},{bonds:[{a:1,b:1,order:1}]},{bonds:[...g.bonds,...g.bonds]},
  {bonds:[{a:0,b:1,order:1.5}]}]) changed(patch,'invalid');
for (const patch of [{charges:[1,-1]},{isotopes:[13,0]},{radicalElectrons:[1,0]},
  {stereo:{centers:[{specified:true}]}},{bonds:[{...g.bonds[0],stereo:'wedge'}]},
  {schema:'bond-atlas/3'}, {notation:'[13CH3]Br'}, {atoms:['C','Br','C'],hydrogens:[3,0,4]}]) changed(patch,'unsupported');
assert.deepEqual(analyze(null,'hydroxide'),{reason:'invalid'});
assert.deepEqual(analyze(g,'not-a-reagent'),{reason:'invalid'});
console.log('Reaction rules: matching, refusal, layout and electron/atom balance passed.');
