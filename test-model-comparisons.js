/* Offline selection, atom order, stereo and translated guidance; no browser or service. */
'use strict';
const assert=require('node:assert/strict');
global.Chem=require('./chemistry.js');require('./molecule-record.js');require('./comparison-mirrors.js');
const C=require('./model-comparisons.js'), input=require('./model-input.js');
require('./atlas-locales.js');require('./comparison-locales.js');const I=require('./atlas-i18n.js');
const preview=s=>C.mirrorPreview(s)||input.preview(s);
function reverse(r){
  const mapped=i=>r.atoms.length-1-i,reversed={...r,atoms:r.atoms.slice().reverse(),hydrogens:r.hydrogens.slice().reverse(),bonds:r.bonds.map(b=>({...b,a:mapped(b.a),b:mapped(b.b)}))};
  for(const key of ['charges','isotopes','radicals','atomIds'])if(r[key])reversed[key]=r[key].slice().reverse();
  if(r.stereo)reversed.stereo={...r.stereo,centers:r.stereo.centers.map(c=>({...c,atom:mapped(c.atom)}))};
  return reversed;
}
for(const {inputs,id,sides} of C.starters){
  const records=inputs.map(preview), unchanged=JSON.stringify(records);
  for(const pair of [records,records.map(reverse)]){
    const match=C.match(...pair);assert.equal(match.id,id);assert.deepEqual(match.marks.map(m=>m.side),sides);
    assert.deepEqual(C.match(pair[1],pair[0]).marks,match.marks.slice().reverse());
    assert.equal(C.match(pair[0],pair[0]),null);
    for(const [i,{atom,side}] of match.marks.entries()){
      const r=pair[i],n=r.bonds.filter(b=>b.a===atom||b.b===atom).length;
      if(id==='mirror'){
        assert.equal(r.stereo.centers[0].atom,atom);assert.equal(r.stereo.centers[0].cip,side);
        const svg=C.mirrorDrawing(match.marks[i],'#111','#438');assert.match(svg,/data-comparison-focus="center"/);assert.match(svg,/bond-0 atom-1 atom-0/);
      }else{
        assert.equal(r.atoms[atom],id==='chain'?'C':'O');assert.equal(n,{ethanol:1,ether:2,pentane:2,branched:3}[side]);
        const xs=r.atoms.map((_,k)=>k*10),ys=xs.map(()=>3);
        const overlay=C.schematicMarks(match.marks[i],r,xs,ys,'#348');assert(overlay.includes(`cx="${xs[atom]}" cy="3"`));
      }
    }
  }
  assert.equal(JSON.stringify(records),unchanged);
  assert.equal(C.match(records[0],null),null);
}
const [s,r]=C.starters[2].inputs.map(preview);
assert.notEqual(s.depictions.skeletal,r.depictions.skeletal);assert.equal(s.mirrorStereoisomerId,r.stereoisomerId);
assert.equal(C.mirrorPreview('smiles: '+s.notation),s);
assert.equal(C.mirrorPreview('CC(O)C(=O)O'),null);
assert.equal(C.match(preview('CC(O)C(=O)O'),r),null);
assert.equal(C.identify({...s,stereo:{centers:[{atom:1,specified:false,cip:'?'}]}}),null);
for(const k of ['isotopes','charges','radicals'])assert.equal(C.identify({...s,[k]:[1,0,0,0,0,0]}),null);
assert.equal(C.identify(preview('CC(C)(C)C')),null); // other C5H12 skeleton
assert.equal(C.match(preview('ethanol'),preview('pentane')),null);
assert.equal(C.identify({...preview('ethanol'),hydrogens:[0,0,0]}),null);
assert.equal(C.match(preview('OCC'),preview('C(OC)')).id,'oxygen');
// 3D guidance counts the selected pair, not unrelated visible models with geometry.
const nodes=new Map(),node=()=>({addEventListener(){},replaceChildren(...items){this.children=items;}});
global.document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
const synchronize=C.controls(()=>{}), status=nodes.get('desk-comparison-status');
const pair=[{id:7,pick:{checked:true},visible:true,result:{record:s}}, {id:4,pick:{checked:true},visible:true,result:{record:r}},
  {id:9,pick:{checked:false},visible:true,result:{record:preview('ethanol'),geometry:{}}}];
assert.equal(synchronize(pair,'3d').size,2);assert.equal(status.textContent,I.t('compare.noGeometry'));
pair[1].result.geometry={};synchronize(pair,'3d');assert.equal(status.textContent,I.t('compare.oneGeometry',{n:4}));
assert.match(status.textContent,/row 4/);pair[0].result.geometry={};synchronize(pair,'3d');assert.equal(status.textContent,I.t('compare.legend3d'));
pair[1].visible=false;assert.equal(synchronize(pair,'3d').size,0);assert.equal(status.textContent,I.t('compare.select'));
delete global.document;
const compareKeys=Object.keys(global.AtlasLocales.en).filter(k=>k.startsWith('compare.'));
for(const {code} of I.supportedLocales){
  I.setLocale(code);
  for(const k of compareKeys)assert.ok(global.AtlasLocales[code][k]?.trim(),code+': '+k);
  for(const s of C.starters)for(const k of [s.id,...s.sides,'why.'+s.id])assert.notEqual(I.t('compare.'+k),'compare.'+k);
  assert(!I.t('compare.row',{n:1,detail:'test'}).includes('{'));
}
console.log('Curated comparisons: reordered graph matches, exact marked atoms, offline mirror stereo, unsupported states and six locales passed.');
