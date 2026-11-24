'use strict';
const assert=require('node:assert/strict'),C=require('./chemistry.js'),M=require('./sketcher-model.js'),S=require('./scene.js'),G=require('./geometry.js'),P=require('./projections.js'),T=require('./isomer-types.js'),O=require('./orbitals.js');
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}const iso=s=>C.describe(C.readSmiles(s));
function draft(s){const g=iso(s);return M.fromStructure(g,G.layout2D(g,false));}
function joined(a,b){const n=a.atoms.length;return {atoms:[...a.atoms,...b.atoms.map(v=>({...v,x:v.x+1000}))],bonds:[...a.bonds,...b.bonds.map(v=>({...v,a:v.a+n,b:v.b+n}))]};}
test('separate scene components retain individual names and formulas',()=>{
 const r=S.analyze(joined(draft('CCO'),draft('C1=CC=CC=C1')));assert(r.valid);assert.equal(r.components.length,2);assert.deepEqual(r.components.map(c=>c.structure.formula).sort(),['C2H6O','C6H6']);assert.equal(r.hydrogens.reduce((s,h)=>s+h,0),12);
});
test('unfinished component stays visible and does not invalidate another identity silently',()=>{
 const d=M.addAtom(draft('CCO'),'H',300,300),r=S.analyze(d);assert.equal(r.valid,false);assert.equal(r.components.length,2);assert(r.components[0].valid);assert(!r.components[1].valid);
});
test('carbon +1 consumes one valence and never identifies as methane',()=>{
 let d=M.addAtom(M.empty(),'C',0,0);d=M.setCharge(d,0,1);const r=S.analyze(d),g=r.components[0].structure;
 assert(r.valid);assert.equal(g.formula,'CH3');assert.equal(g.charge,1);assert.equal(g.name,'Methyl carbocation');assert.equal(g.notation,'[CH3+]');assert.deepEqual(g.hydrogens,[3]);assert.deepEqual(g.charges,[1]);assert(g.visualizationOnly);assert(!M.analyze(d).valid);assert.throws(()=>C.readSmiles(g.notation));
});
test('carbocation replacement is immutable and overvalent edits are rejected',()=>{
 const d=draft('CC(C)(C)C'),center=d.atoms.findIndex((a,i)=>d.bonds.filter(b=>b.a===i||b.b===i).length===4),before=JSON.stringify(d);
 assert.throws(()=>M.setCharge(d,center,1),/valence/);assert.equal(JSON.stringify(d),before);assert.throws(()=>M.setCharge(d,0,-1));assert.throws(()=>M.setCharge(d,0,NaN));
 const oxygen=d.atoms.length;const o=M.addAtom(d,'O',0,0);assert.throws(()=>M.setCharge(o,oxygen,1),/carbon/);
});
test('explicit H and charge survive layout roundtrip and carbon charge removal',()=>{
 let d=M.addAtom(M.empty(),'C',0,0);d=M.setCharge(d,0,1);d=M.addAtom(d,'H',20,0);d=M.setBond(d,0,1,1);
 const g=S.analyze(d).components[0].structure;assert.equal(g.formula,'CH3');assert.deepEqual(S.analyze(d).hydrogens,[2,0]);
 const restored=M.fromStructure(g,G.layout2D(g,false));assert.equal(restored.atoms[0].charge,1);assert.equal(S.analyze(restored).components[0].structure.formula,'CH3');
 assert.equal(S.analyze(M.setCharge(restored,0,0)).components[0].structure.formula,'CH4');
});
test('tert-butyl cation has C4H9+ and no carbon lone pair',()=>{
 let d=draft('CC(C)C'),i=d.atoms.findIndex((_,i)=>d.bonds.filter(b=>b.a===i||b.b===i).length===3);d=M.setCharge(d,i,1);const g=S.analyze(d).components[0].structure;
 assert.equal(g.formula,'C4H9');assert.equal(g.charge,1);assert.equal(g.name,'tert-Butyl carbocation');assert.equal(O.lonePairs(g,G.layout3D(g)).length,0);
});
test('idealized methyl carbocation geometry is approximately trigonal planar',()=>{
 const g=S.analyze(M.setCharge(M.addAtom(M.empty(),'C',0,0),0,1)).components[0].structure,geo=G.layout3D(g),c=geo.atoms[0];
 const vectors=geo.atoms.slice(1).map(a=>[a.x-c.x,a.y-c.y,a.z-c.z]);for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const u=vectors[i],v=vectors[j],a=Math.acos(u.reduce((s,x,k)=>s+x*v[k],0)/Math.hypot(...u)/Math.hypot(...v))*180/Math.PI;assert(Math.abs(a-120)<8,'angle '+a);}
});
test('Fischer local projection gives four substituents without assigning stereochemistry',()=>{
 const g=C.resolveName('butan-2-ol'),centers=P.fischerCenters(g);assert(centers.length);const p=P.fischer(g,centers.find(i=>g.bonds.some(b=>(b.a===i&&g.atoms[b.b]==='O')||(b.b===i&&g.atoms[b.a]==='O'))));assert.equal(p.arms.length,4);assert(p.arms.some(a=>a.label==='OH'));assert(p.arms.some(a=>a.label==='H'));assert.match(p.note,/not an inferred R\/S/);
});
test('Fischer rejects sp2 and cyclic centers rather than inventing projections',()=>{
 assert.deepEqual(P.fischerCenters(C.resolveName('benzene')),[]);assert.throws(()=>P.fischer(C.resolveName('benzene')));assert.deepEqual(P.fischerCenters(iso('C1CCCCC1')),[]);
});
test('Newman views give three groups per tetrahedral center and reverse correctly',()=>{
 const g=C.resolveName('ethanol'),p=P.newman(g),q=P.newman(g,p.bond,true);assert.equal(p.frontGroups.length,3);assert.equal(p.backGroups.length,3);assert.equal(p.front,q.back);assert.equal(p.back,q.front);assert([...p.frontGroups,...p.backGroups].some(v=>v.label==='OH'));
});
test('Newman excludes multiple and cyclic bonds',()=>{
 assert.deepEqual(P.newmanBonds(C.resolveName('benzene')),[]);assert.deepEqual(P.newmanBonds(iso('C1CCCCC1')),[]);assert.deepEqual(P.newmanBonds(iso('C=C')),[]);assert.throws(()=>P.newman(iso('C#C')));
});
test('condensed formulas group hydrogens and do not hide ring closures',()=>{
 assert.equal(P.condensed(C.resolveName('ethanol')),'CH3CH2OH');assert.equal(P.condensed(C.resolveName('benzene')),null);assert.match(P.condensed(iso('CC#C')),/≡/);
});
test('isomer relationships distinguish functional, positional, chain and ring-chain cases',()=>{
 const ethanol=C.resolveName('ethanol');assert.equal(T.relationship(C.resolveName('methoxymethane'),ethanol),'Functional-group isomer');assert.equal(T.relationship(ethanol,ethanol),'Reference structure');
 assert.equal(T.relationship(C.resolveName('butan-2-ol'),C.resolveName('butan-1-ol')),'Positional / connectivity isomer');
 assert.equal(T.relationship(C.resolveName('2-methylpropane'),C.resolveName('butane')),'Chain / skeletal isomer');assert.equal(T.relationship(iso('C1CCC1'),iso('C=CCC')),'Ring–chain isomer');assert.equal(T.relationship(C.resolveName('methanol'),ethanol),'Different formula / charge');
});
test('skeleton classification is invariant under reordered carbon graphs',()=>{
 const a=iso('CC(C)CC'),b=iso('CCC(C)C');assert.equal(T.skeleton(a),T.skeleton(b));
});
console.log('\n'+count+' learning / scene test groups passed. Browser/WebGL visual interaction is not covered by the test suite.');
