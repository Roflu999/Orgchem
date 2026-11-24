'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('./chemistry.js');
const F = require('./formats.js');
const G = require('./geometry.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS', name); }
const same = (a,b) => assert.equal(a,b);
function permute(g, order) { return { atoms: order.map(i=>g.atoms[i]),m:order.map(i=>order.map(j=>g.m[i][j])) }; }
for (const [formula,expected] of [['C2H6O',2],['C3H8O',3],['C4H10O',7],['C4H9Br',4],['C4H8',5],['C3H6O',9],['C6H14',5],['C8H18',18],['C9H20',35],['C10H22',75],['C11H24',159],['C12H26',355]]) {
  test(formula+' exhaustive count and SMILES round trips',()=>{
    const result=C.enumerate(formula);same(result.isomers.length,expected);same(result.complete,true);
    const ids=new Set();
    result.isomers.forEach((g,i)=>{same(C.canonical(C.readSmiles(g.notation)).key,g.id);same(C.formulaOf(C.readSmiles(g.notation)),formula);assert(!ids.has(g.id));ids.add(g.id);if(i)assert(result.isomers[i-1].stability.score<=g.stability.score);});
  });
}
test('formula worker reports the actual valence search, independently of molecule names',()=>{
  const results=[],ctx=vm.createContext({});ctx.self=ctx;
  const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),ctx,{filename:file});
  ctx.importScripts=(...files)=>files.forEach(load);ctx.postMessage=msg=>{if(msg.result)results.push(msg.result);};
  load('chemistry-worker.js');
  for(const formula of ['C2H6O','C4H6','C8H18'])ctx.onmessage({data:{request:1,parsed:{formula}}});
  const [oxygen,unsaturated,octanes]=results;
  assert.deepEqual(JSON.parse(JSON.stringify(oxygen.deduction)),{hydrogenLimit:6,skeletons:2,layers:[]});
  same(unsaturated.deduction.hydrogenLimit,10);same(unsaturated.deduction.skeletons,2);
  assert.deepEqual(Array.from(unsaturated.deduction.layers),[5,9]);same(unsaturated.isomers.length,9);
  same(octanes.isomers.length,18);assert(octanes.isomers.every(m=>!m.name.startsWith('Structural isomer')));
});
test('functional groups preserve correct classifications',()=>{
  same(C.enumerate('C4H10O').isomers.filter(g=>g.tags.includes('alcohol')).length,4);
  const isomers=C.enumerate('C4H9Br').isomers;
  same(isomers.filter(g=>g.tags.includes('primary-halogenoalkane')).length,2);
  same(isomers.filter(g=>g.tags.includes('secondary-halogenoalkane')).length,1);
  same(isomers.filter(g=>g.tags.includes('tertiary-halogenoalkane')).length,1);
});
test('double and triple bonds are separate, preserved graph edges',()=>{
  const isomers=C.enumerate('C4H6').isomers;
  assert(isomers.some(g=>g.bonds.some(b=>b.order===3)));
  assert(isomers.some(g=>g.bonds.filter(b=>b.order===2).length===2));
  same(C.resolveName('but-1-yne').formula,'C4H6');
});
test('reactive and strained candidates remain present, sorted lower',()=>{
  const isomers=C.enumerate('C3H6O').isomers;
  const acetone=isomers.findIndex(g=>g.name==='Propanone'),enol=isomers.findIndex(g=>g.name==='Prop-1-en-1-ol'),epoxide=isomers.findIndex(g=>g.name==='2-Methyloxirane');
  assert(acetone>=0&&enol>acetone&&epoxide>acetone);
  const peroxide=C.describe(C.readSmiles('COOC'));assert(peroxide.stability.score>=45);assert(peroxide.stability.reasons.some(r=>r.includes('O–O')));
  const ringTriple=C.describe(C.readSmiles('C1#CCCCC1'));assert(ringTriple.stability.score>=85);
});
test('canonization is invariant to atom order, including rings',()=>{
  for(const s of ['CC(C)(C)C','CC1=CCC1','C1=CC=CC=C1','C1CC2CCC1C2','CC(=O)OC']){
    const g=C.readSmiles(s),expected=C.canonical(g).key;
    for(let k=0;k<g.atoms.length;k++){const order=g.atoms.map((_,i)=>(i+k)%g.atoms.length);same(C.canonical(permute(g,order)).key,expected);same(C.canonical(permute(g,order.reverse())).key,expected);}
  }
});
test('larger structures can be viewed without promising an exhaustive search',()=>{
  const g=C.describe(C.readSmiles('C'.repeat(64)));same(g.atoms.length,64);same(g.formula,'C64H130');
  assert.throws(()=>C.enumerate(g.formula),/12 heavy atoms/);
  assert.throws(()=>C.readSmiles('C'.repeat(65)),/64/);
});
test('input modes, aliases, prefixes, subscripts and auto-detection',()=>{
  same(F.parseEntry('C₁₀H₂₂').parsed.formula,'C10H22');
  same(F.parseEntry('acetone').isomers[0].name,'Propanone');
  same(F.parseEntry('isopropyl alcohol').isomers[0].formula,'C3H8O');
  same(F.parseEntry('smiles: CCC#C').isomers[0].formula,'C4H6');
  same(F.parseEntry('CCO').isomers[0].name,'Ethanol');
  same(F.parseEntry('CO').isomers[0].name,'Methanol');
  same(F.parseEntry('C1CCCCC1').isomers[0].formula,'C6H12');
  assert.throws(()=>F.parseEntry('unknown compound','name'),/offline name map/);
});
test('malformed or unsupported SMILES is rejected explicitly',()=>{
  for(const s of ['C(','C1CC','C=','C()C','C(C))','C11','C1C1','[CH3]','C.C','c1ccccc1','C/C=C/C','C[C@H](O)C','[NH4+]','[13CH4]','C$C','CCCCCCCCC#CCCCCC#'])assert.throws(()=>C.readSmiles(s),s);
  same(C.formulaOf(C.readSmiles('[CH3]O')),'CH4O');
  same(C.formulaOf(C.readSmiles('[H]OC')),'CH4O');
  same(C.formulaOf(C.readSmiles('C%12CCCCC%12')),'C6H12');
});
test('MOL, multi-record SDF, JSON and SMILES round-trip all bond orders',()=>{
  const records=['CCO','CCC#C','CC=O','C1=CC=CC=C1'].map(s=>C.describe(C.readSmiles(s)));
  for(const iso of records){const mol=F.writeMol(iso,G.layout3D(iso),'3D');same(F.readMol(mol).id,iso.id);same(F.parseData(F.writeJSON([iso]),'json').isomers[0].id,iso.id);}
  const sdf=F.writeSDF(records,g=>G.layout2D(g,false),'2D');
  assert.deepEqual(F.parseData(sdf,'sdf').isomers.map(g=>g.id).sort(),records.map(g=>g.id).sort());
  assert.deepEqual(F.parseData(F.writeSMILES(records),'smiles').isomers.map(g=>g.id).sort(),records.map(g=>g.id).sort());
});
test('imports reject invalid valence, annotations, truncation and mismatched formulas',()=>{
  const valid=C.resolveName('Ethanol'),mol=F.writeMol(valid,G.layout3D(valid));
  assert.throws(()=>F.readMol(mol.replace('M  END','M  CHG  1   1   1\nM  END')),/Unsupported MOL/);
  assert.throws(()=>F.readMol(mol.replace('V2000','V3000')),/V2000/);
  assert.throws(()=>F.readMol(mol.slice(0,70)));
  assert.throws(()=>F.parseData(JSON.stringify({atoms:['C','O'],bonds:[{a:0,b:1,order:3}]}),'json'),/valence/);
  assert.throws(()=>F.parseData(JSON.stringify({atoms:['C'],bonds:[],formula:'C2H6'}),'json'),/formula/);
  assert.throws(()=>F.parseData(JSON.stringify({atoms:['C'],bonds:[],hydrogens:[3]}),'json'),/hydrogen/);
  assert.throws(()=>F.parseData(JSON.stringify({atoms:['C'],bonds:[],charge:1}),'json'),/Charged/);
  assert.throws(()=>F.parseData(JSON.stringify({atoms:['toString'],bonds:[]}),'json'),/Supported elements/);
  assert.throws(()=>F.parseData('x'.repeat(F.MAX_BYTES+1)));
});
test('triple-bond centers are linear in 2D and approximate 3D coordinates are finite',()=>{
  const iso=C.resolveName('But-1-yne'),flat=G.layout2D(iso,false),adj=iso.atoms.map(()=>[]);
  iso.bonds.forEach(b=>{adj[b.a].push(b.b);adj[b.b].push(b.a);});
  const triple=iso.bonds.find(b=>b.order===3);
  for(const center of [triple.a,triple.b])if(adj[center].length===2){const [i,j]=adj[center],a=flat.atoms[i],b=flat.atoms[center],c=flat.atoms[j],dot=(a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y),den=Math.hypot(a.x-b.x,a.y-b.y)*Math.hypot(c.x-b.x,c.y-b.y);assert(Math.abs(dot/den+1)<1e-9);}
  const space=G.layout3D(iso);same(space.atoms.length,10);assert(space.atoms.every(a=>[a.x,a.y,a.z].every(Number.isFinite)));
  const xyz=F.writeXYZ(iso,space);same(Number(xyz.split('\n')[0]),10);
});
test('opening pose separates an end-on bond without changing the conformer or bond order',()=>{
  const g={atoms:[{e:'C',x:0,y:0,z:4},{e:'N',x:0,y:0,z:5.2}],bonds:[{a:0,b:1,order:3}]};
  const before=JSON.stringify(g),pose=G.openingPose(g),[x,y]=pose.map(a=>a*Math.PI/180);
  // After yaw about Y then pitch about X, measure the visible fraction of the bond.
  assert(Math.hypot(Math.sin(y),Math.sin(x)*Math.cos(y))>.95);
  const shifted={...g,atoms:g.atoms.map(a=>({...a,x:a.x-12,y:a.y+3,z:a.z+8}))};
  assert.deepEqual(G.openingPose(shifted),pose);assert.deepEqual(G.openingPose(g),pose);
  assert.equal(JSON.stringify(g),before);assert(G.openingPose({atoms:[g.atoms[0]],bonds:[]}).every(Number.isFinite));
});
test('app and worker scripts parse, and local script files exist',()=>{
  const html=fs.readFileSync(path.join(__dirname,'bond-atlas.html'),'utf8');
  const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
  inline.forEach(source=>new vm.Script(source));
  for(const file of ['chemistry.js','geometry.js','formats.js','chemistry-worker.js','interchange-ui.js','sketcher-model.js','sketcher-ui.js','scene.js','orbitals.js','projections.js','isomer-types.js','textbook-ui.js'])new vm.Script(fs.readFileSync(path.join(__dirname,file),'utf8'),{filename:file});
  for(const match of html.matchAll(/<script src="([^\"]+)"/g))if(!match[1].startsWith('https:'))assert(fs.existsSync(path.join(__dirname,match[1])));
});
console.log('\n'+checks+' chemistry regression groups passed.');
require('./test-builder.js');
require('./test-orbitals.js');
require('./test-learning.js');
