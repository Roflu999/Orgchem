'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const F = require('./workspace-file.js');
const state = {view:{mode:'3d',benzene:'cloud'},rows:[
  {id:7,input:'C[C@H](F)CC',visible:true,picked:true},
  {id:3,input:' [13CH3][O-] ',visible:false,picked:true},
  {id:9,input:'',visible:true,picked:false}]};
const decoded = F.parse(F.serialize(state));
assert.equal(decoded.format,'orgchem-workspace');assert.equal(decoded.version,1);
assert.deepEqual(decoded.view,state.view);assert.deepEqual(decoded.rows,state.rows);
assert.deepEqual(F.parse(F.serialize({view:state.view,rows:[]})).rows,[]);
const invalid = mutate => { const copy=structuredClone(decoded);mutate(copy);assert.throws(()=>F.parse(JSON.stringify(copy))); };
for (const mutate of [x=>x.version=2,x=>x.format='bond-atlas/3',x=>x.view.mode='webgl',x=>x.view.benzene='invalid',
  x=>x.rows=null,x=>x.rows=Array.from({length:9},(_,i)=>({...x.rows[0],id:i+1})),x=>x.rows[1].id=7,
  x=>x.rows[0].id=0,x=>x.rows[0].id=1.5,x=>x.rows[0].id=F.maxId+1,x=>x.rows[0].visible='false',
  x=>x.rows[0].picked=1,x=>delete x.rows[0].picked,x=>x.rows[0].input=['C'],x=>x.rows[0].input='C'.repeat(F.maxChars+1),
  x=>x.rows[0].input='CC\nC',x=>x.rows[0].input='\ud800',x=>x.rows[0].record={depiction:'<svg/>'},x=>delete x.rows[1].input]) invalid(mutate);
assert.throws(()=>F.parse('{'));assert.throws(()=>F.parse(' '.repeat(F.maxBytes+1)));
assert.throws(()=>F.parse(JSON.stringify(decoded).replace('"version":1','"__proto__":{},"version":1')));
const largest = {view:state.view,rows:Array.from({length:F.maxRows},(_,i)=>({id:i+1,input:'乙'.repeat(F.maxChars),visible:true,picked:false}))};
assert.deepEqual(F.parse(F.serialize(largest)).rows,largest.rows);
console.log('PASS workspace v1 round-trip, size limits, schema and row validation');
const catalogs = {};
for (const file of ['atlas-locales.js','atlas-shell-locales.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),'utf8'), catalogs);
for (const code of ['en','es','fr','zh-Hans','ar','de']) {
  for (const suffix of ['title','open','download','save','help','downloaded','saved','cancelled','opened','saveError','openError'])
    assert(catalogs.AtlasLocales[code]['workspaceFile.'+suffix],code+' '+suffix);
}

(async()=>{
  let reads=0;
  for (const size of [0,-1,NaN,1.5,F.maxBytes+1]) await assert.rejects(F.read({size,text(){reads++;}}));
  assert.equal(reads,0);
  const largeText=F.serialize(largest), exactLimit=largeText+' '.repeat(F.maxBytes-Buffer.byteLength(largeText));
  assert.deepEqual((await F.read(new Blob([exactLimit]))).rows,largest.rows);
  // A declared size and JS string length can both be within the limit even if UTF-8 is not.
  assert(exactLimit.length+1<F.maxBytes);
  await assert.rejects(F.read({size:F.maxBytes,text:()=>exactLimit+' '}),/size/);
  assert.deepEqual(await F.read(new Blob([F.serialize(state)])),decoded);

  const callbacks=new Map(),els=new Map(),installed=[];let download=null,saved=null,revoked=false;
  function node(id){return {id,files:[],hidden:false,addEventListener:(type,fn)=>callbacks.set(id+':'+type,fn),click(){callbacks.get(id+':click')?.();}};}
  for(const id of ['download','open','save','input','status'])els.set('desk-file-'+id,node('desk-file-'+id));
  const doc={getElementById:id=>els.get(id),body:{append(){}},createElement:()=>({click(){download=this.download;},remove(){}})};
  const context={Blob,document:doc,isSecureContext:true,AtlasI18n:{t:key=>key,bindText:(el,key)=>el.textContent=key},
    setTimeout:fn=>fn(),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{revoked=true;}},
    showSaveFilePicker:async opts=>{assert.equal(opts.suggestedName,F.filename);return {createWritable:async()=>({write:async b=>saved=await b.text(),close:async()=>{}})};}};
  context.window=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'workspace-file.js'),'utf8'),context);
  let revision=0;
  context.WorkspaceFile.attach(()=>state,doc=>installed.push(JSON.parse(JSON.stringify(doc))),()=>revision);
  const click=id=>callbacks.get('desk-file-'+id+':click')(),status=()=>els.get('desk-file-status').textContent;
  const choose=async file=>{els.get('desk-file-input').files=[file];await callbacks.get('desk-file-input:change')();};
  click('download');assert.equal(status(),'workspaceFile.downloaded');assert.equal(download,F.filename);assert(revoked);
  await click('save');assert.equal(status(),'workspaceFile.saved');assert.equal(saved,F.serialize(state));
  context.showSaveFilePicker=async()=>{throw Object.assign(Error(),{name:'AbortError'});};
  await click('save');assert.equal(status(),'workspaceFile.cancelled');
  for(const failed of ['write','close']){
    let aborted=false;const fail=async()=>{throw Object.assign(Error(),{name:'AbortError'});};
    context.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{},[failed]:fail,abort:async()=>{aborted=true;}})});
    await click('save');assert(aborted);assert.equal(status(),'workspaceFile.saveError');
  }
  let finish;const stale=choose({size:12,text:()=>new Promise(resolve=>finish=resolve)});
  await choose(new Blob(['invalid']));finish(F.serialize(state));await stale;
  assert.equal(installed.length,0);assert.equal(status(),'workspaceFile.openError');
  await choose(new Blob([saved]));assert.equal(status(),'workspaceFile.opened');assert.deepEqual(installed,[decoded]);
  for(const [supersede,late] of [[()=>revision++,saved],[()=>revision++,'bad'],[()=>click('open'),saved]]){
    const old=choose({size:12,text:()=>new Promise(resolve=>finish=resolve)});
    supersede();finish(late);await old;
    assert.deepEqual(installed,[decoded]);assert.equal(status(),'workspaceFile.opened');
  }
  console.log('PASS bounded reads, stale/invalid input ignored, downloads, native save/cancel/failure and open');
  if(process.argv.includes('--desk'))await deskChecks();
})().catch(error=>{console.error(error);process.exitCode=1;});

// With the existing browser-check dependencies installed: node test-workspace-file.js --desk
async function deskChecks(){
  const {JSDOM}=require('./browser-check/node_modules/jsdom');
  const source=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
  const dom=new JSDOM(source('bond-atlas.html'),{runScripts:'outside-only',url:'http://localhost/',pretendToBeVisual:true});
  try {
    const w=dom.window, d=w.document, el=id=>d.getElementById(id);
    w.matchMedia=()=>Object.assign(new w.EventTarget(),{matches:false});
    w.ResizeObserver=class {observe(){} disconnect(){}};w.fetch=async()=>({ok:false});
    for(const script of d.scripts){const src=script.getAttribute('src');if(!src?.startsWith('vendor/'))w.eval(src?source(src):script.textContent);}
    const rows=()=>Array.from(el('desk-rows').children), field=r=>r.querySelector('.row-head > input');
    const current=()=>({view:{mode:el('desk-3d').getAttribute('aria-pressed')==='true'?'3d':'2d',benzene:el('desk-benz').value},
      rows:rows().map(r=>({id:Number(r.querySelector('.row-number').textContent),input:field(r).value,
        visible:r.dataset.visible==='true',picked:r.querySelector('[type=checkbox]').checked}))});
    const change=(id,value)=>{el(id).value=value;el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
    const click=id=>el(id).click(), tick=()=>new Promise(resolve=>setImmediate(resolve));
    const choose=file=>{const picker=el('desk-file-input');Object.defineProperty(picker,'files',{configurable:true,value:[file]});picker.dispatchEvent(new w.Event('change',{bubbles:true}));};
    const restore={view:{mode:'3d',benzene:'cloud'},rows:[{id:F.maxId,input:' benzene ',visible:false,picked:true},{id:1,input:'',visible:true,picked:false}]};
    const fileText=F.serialize(restore);
    function startRead(){let finish;choose({size:fileText.length,text:()=>new Promise(resolve=>finish=resolve)});return async(text=fileText)=>{finish(text);await tick();};}
    click('desk-starter-chain');const original=current(), initialRows=rows();
    await startRead()();assert.deepEqual(current(),restore);assert(el('desk-all').indeterminate);
    click('desk-undo');assert.deepEqual(rows(),initialRows);assert.deepEqual(current(),original);
    await startRead()('{');assert.deepEqual(current(),original);assert(!el('desk-redo').disabled);
    click('desk-redo');assert.deepEqual(current(),restore);
    click('desk-add');assert(![1,F.maxId].includes(current().rows.at(-1).id));
    click('desk-undo');click('desk-undo');assert.deepEqual(current(),original);
    for(const intervene of [()=>click('desk-starter-oxygen'),()=>click('desk-undo'),()=>click('desk-redo'),
      ()=>rows()[0].querySelector('[type=checkbox]').click(),()=>change('desk-benz','electrons'),
      ()=>{const f=field(rows()[0]);f.value='benzene';f.dispatchEvent(new w.Event('input',{bubbles:true}));},
      ()=>{click('show-builder');click('show-models');}]){
      const finish=startRead();intervene();const expected=current(),status=el('desk-file-status').textContent;
      await finish();assert.deepEqual(current(),expected,'delayed open replaced newer desk interaction');assert.equal(el('desk-file-status').textContent,status);
    }
    // A render failure partway through installation must not consume the redo branch.
    click('desk-starter-chain');click('desk-undo');
    const beforeFailure=current(), previousRows=rows(), matches=w.BenzeneView.matches;
    try {
      w.BenzeneView.matches=()=>{w.BenzeneView.matches=matches;throw Error('render failed');};
      await startRead()(F.serialize(original));
    } finally {w.BenzeneView.matches=matches;}
    assert.deepEqual(current(),beforeFailure);assert.deepEqual(rows(),previousRows);assert(!el('desk-redo').disabled);
    assert.equal(el('desk-file-status').textContent,w.AtlasI18n.t('workspaceFile.openError'));
    click('desk-redo');
    // A pending calculation belongs to its row, even if an imported row reuses an ID.
    const jobs=[];w.ModelInput.resolve=(_value,{signal})=>new Promise(resolve=>jobs.push({signal,resolve}));
    const waitJob=async i=>{const end=Date.now()+3000;while(!jobs[i]){assert(Date.now()<end,'row job did not start');await new Promise(r=>setTimeout(r,10));}return jobs[i];};
    const pendingRow=rows()[0], f=field(pendingRow);f.value='unresolved workspace row';f.dispatchEvent(new w.Event('input',{bubbles:true}));
    const first=await waitJob(0);await startRead()();assert(first.signal.aborted);assert.deepEqual(current(),restore);
    click('desk-undo');assert.equal(rows()[0],pendingRow);const restarted=await waitJob(1);
    first.resolve({record:w.ModelInput.preview('ethanol'),geometry:null,reason:'no-conformer'});await tick();assert.equal(pendingRow.querySelector('.row-formula').textContent,'');
    click('desk-redo');assert(restarted.signal.aborted);restarted.resolve({record:null,geometry:null,reason:'parse-failed'});await tick();assert.deepEqual(current(),restore);
    console.log('PASS desk file restore, view/selection/history, ID collisions, rollback, pending row cancellation and intervening desk actions');
  } finally {dom.window.close();}
}
