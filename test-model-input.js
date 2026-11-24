/* node test-model-input.js; pass --rdkit to also exercise the installed Python backend. */
'use strict';
const assert = require('node:assert/strict');
require('./chemistry.js');
require('./molecule-record.js');
const M = require('./model-input.js');

const mapped = {
  schema:'bond-atlas/3', stereoisomerId:'test-id', name:'Methanol', atoms:['C','O'], atomIds:['a1','a2'],
  bonds:[{a:0,b:1,order:1}], charges:[0,0], isotopes:[0,0], hydrogens:[3,1],
  stereo:{centers:[], bonds:[], unsupported:[]}, provenance:{toolkit:'RDKit'}, conformers:[]
};
// Deliberate synthetic frame to check XYZ distances, atom indices, and conformer selection, not chemistry.
const selected = {id:'b', method:'test', stereoVerification:{verified:true}, atoms:[
  {e:'C',atomId:'a1',x:1,y:1,z:1}, {e:'O',atomId:'a2',x:2,y:3,z:3}, {e:'H',atomId:'h1',x:3,y:5,z:5}
], bonds:[{a:1,b:0,order:1},{a:1,b:2,order:1}]};
const complete = {...mapped, conformers:[{...selected,id:'a',atoms:[]},selected], selectedConformerId:'b'};
function server(record = mapped, result = complete) {
  const calls = [];
  global.ChemistryClient = {available:true, ready:Promise.resolve(), capabilities:{opsinAvailable:true},
    parse:async (text, format, options) => {calls.push({text,format,options}); return {molecules:[record]};},
    job:async (op, payload, options) => {calls.push({op,payload,options}); return {molecule:result};}};
  return calls;
}

async function tests() {
  assert.equal(M.preview(' ethanol ').id, M.preview('SMILES: OCC').id);
  assert.equal(M.preview('NAME: dimethyl ether').id, M.preview('COC').id);
  assert.notEqual(M.preview('ethanol').id, M.preview('dimethyl ether').id);
  assert.equal(M.preview('3-methylhexan-2-ol').formula,'C7H16O');
  for (const input of ['',null,'SMILES: ', 'formula: C2H6O', 'C(C', 'CCO\nCOC', 'C[C@H](O)F', 'F/C=C/F', '(S)-butan-2-ol', 'c1ccccc1','[13CH3]CO']) assert.equal(M.preview(input), null, String(input));
  assert.equal((await M.resolve('C\nO')).reason,'invalid-input');
  const offline = await M.resolve('dimethyl ether');
  assert.equal(offline.record.id,M.preview('COC').id);
  assert.equal(offline.geometry,null); assert.equal(offline.reason,'offline');
  assert.equal((await M.resolve('F/C=C/F')).record,null);
  assert.equal(M.size(offline.record),null); assert.equal(M.bondLength(null,0,1),null);
  const calls = server();
  const model = await M.resolve('name: methanol');
  assert.equal(calls[0].text,M.preview('methanol').notation); assert.equal(calls[0].format,'smiles');
  assert.equal(calls[1].op,'conformers'); assert.equal(calls[1].payload.count,1); assert.equal(calls[1].payload.molecule,mapped);
  assert.equal(model.record.nameSource,M.preview('methanol').nameSource);
  assert.equal(model.geometry.conformer.id,model.record.selectedConformerId);
  assert.equal(model.reason,null); assert.equal(model.geometry.unit,'Å');
  assert.equal(M.size(model.geometry),6); assert.equal(M.bondLength(model.geometry,0,1),3);
  assert.equal(M.bondLength(model.geometry,1,0),3); assert.equal(M.bondLength(model.geometry,1,2),3);
  for (const pair of [[0,2],[1,1],[2,3],[-1,0],[1,'2']]) assert.equal(M.bondLength(model.geometry,...pair),null);
  assert.equal(M.size({...model.geometry,unit:'px'}),null);
  for (const text of ['[H]OC','C[C@H](O)F','N[C@@H](C)C(=O)O','F/C=C\\F','c1ccccc1','[13CH3]CO']) {
    const calls = server(); await M.resolve(text); assert.deepEqual([calls[0].text,calls[0].format],[text,'smiles']);
  }
  const named = server({...mapped,name:'(R)-butan-2-ol',nameSource:'OPSIN'});
  assert.equal((await M.resolve('(R)-butan-2-ol')).record.name,'(R)-butan-2-ol');
  assert.equal(named[0].format,'name');
  global.ChemistryClient.capabilities.opsinAvailable=false;
  assert.equal((await M.resolve('name: unsupported')).reason,'name-unavailable');
  for (const [change,reason] of [
    [{stereo:{...mapped.stereo,centers:[{specified:false}]}},'unspecified-stereo'],
    [{stereo:{...mapped.stereo,bonds:[{specified:false}]}},'unspecified-stereo'],
    [{stereo:{...mapped.stereo,unsupported:['Enhanced OR group']}},'unsupported-stereo'],
    [{bonds:[]},'disconnected']]) {
    const calls = server({...mapped,...change}); const r = await M.resolve('CO');
    assert.equal(r.reason,reason); assert.equal(r.geometry,null); assert.equal(r.record.schema,mapped.schema); assert.equal(calls.length,1);
  }
  for (const invalid of [{conformers:[]}, {stereoisomerId:'other'}, {selectedConformerId:'stale'}, {atomIds:['a2','a1']},
    {conformers:[{...selected,atoms:[{...selected.atoms[0],x:NaN},...selected.atoms.slice(1)]}]},
    {conformers:[{...selected,stereoVerification:{verified:false}}]}, {conformers:[{...selected,bonds:[{a:1,b:5}]}]}]) {
    server(mapped,{...complete,...invalid}); const r = await M.resolve('CO');
    assert.equal(r.geometry,null); assert.equal(r.reason,'no-conformer'); assert.equal(r.record.schema,mapped.schema);
  }
  server(); global.ChemistryClient.job = async () => {throw Error('Queue full');};
  assert.equal((await M.resolve('CO')).reason,'no-conformer');
  global.ChemistryClient.parse = async () => {throw Error('Failed to parse');};
  assert.equal((await M.resolve('SMILES: ????')).reason,'parse-failed');
  assert.equal((await M.resolve('C(C')).record,null);
  const before = new AbortController(); before.abort();
  await assert.rejects(M.resolve('O',{signal:before.signal}),{name:'AbortError'});
  const init = new AbortController(), calls2 = server(); global.ChemistryClient.ready = new Promise(()=>{});
  const waiting = M.resolve('CO',{signal:init.signal}); init.abort();
  await assert.rejects(waiting,{name:'AbortError'}); assert.equal(calls2.length,0);
  const mid = new AbortController(); server();
  let started; const jobStarted = new Promise(r=>{started=r;});
  global.ChemistryClient.job = (_op,_payload,{signal}) => {assert.equal(signal,mid.signal);started();return new Promise(()=>{});};
  const pending = M.resolve('CO',{signal:mid.signal}); await jobStarted; mid.abort();
  await assert.rejects(pending,{name:'AbortError'});
}

async function rdkitTests() {
  const {spawnSync} = require('node:child_process');
  const {join} = require('node:path');
  function job(op,payload) {
    const code = 'import json,sys; from backend.chemistry_service import dispatch; print(json.dumps(dispatch(sys.argv[1], json.load(sys.stdin))))';
    const child = spawnSync(process.env.PYTHON || join(__dirname,'.venv/bin/python'), ['-c',code,op],
      {cwd:__dirname,input:JSON.stringify(payload),encoding:'utf8',timeout:30000});
    if (child.error || child.status !== 0) throw Error(String(child.error || child.stderr));
    return JSON.parse(child.stdout);
  }
  global.ChemistryClient = {available:true, ready:Promise.resolve(), capabilities:{opsinAvailable:false},
    job, parse:(text,format)=>job('parse',{text,format})};
  for (const text of ['ethanol','dimethyl ether','c1ccccc1','C[C@H](O)F','F/C=C/F','F/C=C\\F']) {
    const r = await M.resolve(text); assert.equal(r.reason,null,text);
    assert.equal(r.geometry.conformer.id,r.record.selectedConformerId);
    assert(M.size(r.geometry)>2,text);
    for (const {a,b} of r.geometry.bonds) {
      const length = M.bondLength(r.geometry,a,b); assert(length>0.8 && length<1.8,text+' bond: '+length);
    }
    if (text.includes('@')) assert.equal(r.record.stereo.centers[0].specified,true);
    if (text.startsWith('F/')) assert.equal(r.record.stereo.bonds[0].descriptor,text.includes('\\')?'Z':'E');
  }
  for (const text of ['CC(O)F','FC=CF']) {
    const r = await M.resolve(text); assert.equal(r.reason,'unspecified-stereo',text); assert.equal(r.geometry,null);
    assert(r.record.depictions.skeletal.includes('<svg'));
  }
}

tests().then(async () => {
  if (process.argv.includes('--rdkit')) await rdkitTests();
  console.log('Model input, stereo gates, cancellation and conformer measurements passed.');
}).catch(error => {console.error(error);process.exitCode=1;});
