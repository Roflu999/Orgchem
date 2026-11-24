'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const M = require('./sketcher-model.js');
const {create, key} = require('./draft-recovery.js');
const unfinished = {atoms:[{e:'H',x:12,y:-4},{e:'O',x:70,y:40}], bonds:[]};
const mapped = M.checked({engine:'rdkit', atoms:[{e:'Na',id:'s1',charge:1,isotope:23,x:500,y:24},{e:'Cl',id:'s2',charge:-1,x:32,y:20}], bonds:[], sourceRecord:{schema:'bond-atlas/3',stereoisomerId:'salt',atoms:['Na','Cl'],atomIds:['s1','s2'],hydrogens:[0,0],isotopes:[23,0],charges:[1,-1],bonds:[],molblock:'authoritative mapped source',stereo:{centers:[]},selectedConformerId:'original'}});
function browser() {
  const data = new Map([['bond-atlas.preferences.v1','untouched']]);
  const storage = {getItem:k=>data.get(k) ?? null, setItem:(k,v)=>data.set(k,v), removeItem:k=>data.delete(k)};
  function open() {
    let state;
    const api = create(()=>storage, value=>{state=value;});
    return {api,get state(){return state;}};
  }
  return {open, data, storage};
}

test('no persistence before consent; a pending copy survives startup and edits until explicitly restored', () => {
  const {open,data} = browser(), a=open();
  a.api.changed(unfinished); assert.equal(data.has(key), false);
  a.api.enable({...unfinished, inputText:'private search', history:[mapped]});
  assert.deepEqual(JSON.parse(data.get(key)), {version:1,draft:unfinished});
  const b=open(); assert.ok(b.state.pending);
  b.api.changed(M.empty(), true); b.api.changed(mapped);
  assert.deepEqual(JSON.parse(data.get(key)).draft,unfinished);
  let restored; b.api.restore(d=>{restored=d; b.api.changed(d);});
  assert.deepEqual(restored,unfinished); assert.equal(b.state.pending,false);
  b.api.changed(mapped);
  const c=open(); c.api.restore(d=>assert.deepEqual(d,mapped));
  c.api.disable(); c.api.changed(unfinished); assert.equal(data.has(key),false);
  assert.deepEqual([...data], [['bond-atlas.preferences.v1','untouched']]);
});

test('discard and clear keep consent but never resurrect stale or default drawings', () => {
  const {open,data}=browser(); open().api.enable(mapped);
  const b=open(); b.api.discard(); assert.equal(b.state.pending,false);
  b.api.changed(unfinished,true); assert.deepEqual(JSON.parse(data.get(key)),{version:1,draft:null});
  b.api.changed(mapped); b.api.changed(M.empty('rdkit')); assert.equal(open().state.pending,false);
});

test('cross-tab deletion and competing offers are respected even before the storage event', () => {
  const {open,data}=browser(), a=open(); a.api.enable(unfinished);
  const b=open(); b.api.disable(); a.api.changed(mapped); assert.equal(data.has(key),false);
  b.api.enable(mapped); a.api.refresh(); assert.ok(a.state.pending);
  b.api.changed(unfinished); a.api.discard(); assert.ok(a.state.pending);
  a.api.restore(d=>assert.deepEqual(d,unfinished));
});

test('malformed, oversized, unmapped or unknown versions never reach the editor', () => {
  const {open,data}=browser();
  for (const raw of ['not JSON', 'x'.repeat(1024*1024+1), JSON.stringify({version:2,draft:unfinished}), ...[
    {atoms:[{e:'X',x:0,y:0}],bonds:[]}, {...unfinished,bonds:[{a:0,b:10,order:1}]}, {...mapped,engine:'other'},
    {...mapped, atoms:[{e:'C',x:0,y:0}]}, {...mapped,sourceRecord:{schema:'bond-atlas/3',atomIds:[1]}}
  ].map(draft=>JSON.stringify({version:1,draft}))]) {
    data.set(key,raw); const page=open(); assert.equal(page.state.status,'invalid');
    page.api.restore(()=>assert.fail('unexpected restore')); page.api.changed(mapped); assert.equal(data.get(key),raw);
    page.api.discard(); assert.equal(data.has(key),false);
  }
});

test('blocked reads, quota and deletion failures never interrupt edits or claim data was erased', () => {
  let state; const api=create(()=>{throw Error('blocked');},s=>{state=s;});
  api.changed(mapped); assert.equal(state.status,'unavailable');
  const {open,data,storage}=browser(), a=open(); a.api.enable(unfinished);
  storage.setItem=()=>{throw Error('quota');}; a.api.changed(mapped); assert.equal(a.state.status,'notSaved');
  assert.deepEqual(JSON.parse(data.get(key)).draft,unfinished);
  const remove=storage.removeItem; storage.removeItem=()=>{throw Error('blocked');};
  a.api.disable(); assert.equal(a.state.status,'notRemoved'); assert.equal(a.state.enabled,false);
  storage.removeItem=remove; a.api.discard(); assert.equal(data.has(key),false);
});
