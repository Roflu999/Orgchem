'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const F = require('./workspace-file.js'), history = require('./plate-history.js');
const bench = {serial:4,plates:[{id:'4',role:'substrate',label:'ethanol',smiles:'CCO',stockId:'',medium:'',catalyst:'',history:null}],left:'4',right:'',condition:'heat'};
const state = {bench,view:{mode:'3d',benzene:'cloud'},rows:[
  {id:7,input:'C[C@H](F)CC',visible:true,picked:true},
  {id:3,input:' [13CH3][O-] ',visible:false,picked:true},
  {id:9,input:'',visible:true,picked:false}]};
const decoded = F.parse(F.serialize(state));
assert.equal(decoded.format,'orgchem-workspace');assert.equal(decoded.version,2);
assert.deepEqual(decoded.view,state.view);assert.deepEqual(decoded.rows,state.rows);assert.deepEqual(decoded.bench,bench);
const legacy = {format:'orgchem-workspace',version:1,view:state.view,rows:state.rows};
assert.deepEqual(F.parse(JSON.stringify(legacy)),{...legacy,version:2,bench:history.empty()});
assert.deepEqual(F.parse(F.serialize({view:state.view,rows:[]})),{...decoded,rows:[],bench:history.empty()});
assert.throws(()=>F.parse(JSON.stringify({...legacy,bench}))); // No v2 fields in v1.
assert.throws(()=>F.serialize({...state,bench:null}));
const invalid = mutate => { const copy=structuredClone(decoded);mutate(copy);assert.throws(()=>F.parse(JSON.stringify(copy))); };
for (const mutate of [x=>x.version=3,x=>delete x.bench,x=>x.bench=null,x=>x.bench.left='999',x=>x.bench.plates[0].history={},
  x=>x.bench.plates[0].record={depiction:'<svg/>'},x=>x.format='bond-atlas/3',x=>x.view.mode='webgl',x=>x.view.benzene='invalid',
  x=>x.rows=null,x=>x.rows=Array.from({length:9},(_,i)=>({...x.rows[0],id:i+1})),x=>x.rows[1].id=7,
  x=>x.rows[0].id=0,x=>x.rows[0].id=1.5,x=>x.rows[0].id=F.maxId+1,x=>x.rows[0].visible='false',
  x=>x.rows[0].picked=1,x=>delete x.rows[0].picked,x=>x.rows[0].input=['C'],x=>x.rows[0].input='C'.repeat(F.maxChars+1),
  x=>x.rows[0].input='CC\nC',x=>x.rows[0].input='\ud800',x=>x.rows[0].record={depiction:'<svg/>'},x=>delete x.rows[1].input]) invalid(mutate);
assert.throws(()=>F.parse('{'));assert.throws(()=>F.parse(' '.repeat(F.maxBytes+1)));
assert.throws(()=>F.parse(JSON.stringify(decoded).replace('"version":2','"__proto__":{},"version":2')));
const largest = {view:state.view,rows:Array.from({length:F.maxRows},(_,i)=>({id:i+1,input:'乙'.repeat(F.maxChars),visible:true,picked:false}))};
assert.deepEqual(F.parse(F.serialize(largest)).rows,largest.rows);
console.log('PASS combined workspace round-trip, v1 migration, strict row and bench validation');
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

  const callbacks=new Map(),els=new Map(),installed=[];let download=null,downloadData,saved=null,downloadCount=0,revoked=false;
  function node(id){return {id,files:[],hidden:false,addEventListener:(type,fn)=>callbacks.set(id+':'+type,fn),click(){callbacks.get(id+':click')?.();}};}
  for(const id of ['download','open','save','input','status'])els.set('desk-file-'+id,node('desk-file-'+id));
  const doc={getElementById:id=>els.get(id),body:{append(){}},createElement:()=>({click(){download=this.download;++downloadCount;},remove(){}})};
  const context={Blob,PlateHistory:history,document:doc,isSecureContext:true,AtlasI18n:{t:key=>key,bindText:(el,key)=>el.textContent=key},
    setTimeout:fn=>fn(),URL:{createObjectURL:b=>{downloadData=b;return 'blob:test';},revokeObjectURL:()=>{revoked=true;}},
    showSaveFilePicker:async opts=>{assert.equal(opts.suggestedName,F.filename);return {createWritable:async()=>({write:async b=>saved=await b.text(),close:async()=>{}})};}};
  context.window=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'workspace-file.js'),'utf8'),context);
  let revision=0;
  const apply=doc=>{installed.push(JSON.parse(JSON.stringify(doc)));revision++;};
  let installer=apply;
  const attach=()=>context.WorkspaceFile.attach(()=>state,(...args)=>installer(...args),()=>revision);
  attach();assert.equal(els.get('desk-file-save').hidden,false);
  const click=id=>callbacks.get('desk-file-'+id+':click')(),status=()=>els.get('desk-file-status').textContent;
  const choose=async file=>{els.get('desk-file-input').files=[file];await callbacks.get('desk-file-input:change')();};
  click('download');assert.equal(status(),'workspaceFile.downloaded');assert.equal(download,F.filename);assert(revoked);assert.equal(await downloadData.text(),F.serialize(state));
  await click('save');assert.equal(status(),'workspaceFile.saved');assert.equal(saved,F.serialize(state));
  context.showSaveFilePicker=async()=>{throw Object.assign(Error(),{name:'AbortError'});};
  await click('save');assert.equal(status(),'workspaceFile.cancelled');assert.equal(downloadCount,1,'cancel must not download');
  for(const failed of ['write','close']){
    let aborted=false;const fail=async()=>{throw Object.assign(Error(),{name:'AbortError'});};
    context.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{},[failed]:fail,abort:async()=>{aborted=true;}})});
    await click('save');assert(aborted);assert.equal(status(),'workspaceFile.saveError');
  }
  // A slow disk write must not overlap a second save or mask a later open failure.
  const writing=deferred(),close=deferred();let pickCount=0;
  context.showSaveFilePicker=async()=>{pickCount++;return {createWritable:async()=>({write:async()=>{},close:()=>{writing.resolve();return close.promise;}})};};
  const slowSave=click('save');await writing.promise;
  const duplicateSave=click('save');await choose(new Blob(['bad']));close.resolve();await Promise.all([slowSave,duplicateSave]);
  assert.equal(pickCount,1,'only one save can own the writer at a time');
  assert.equal(status(),'workspaceFile.openError','late save masked the newer file error');
  assert.equal(els.get('desk-file-save').disabled,false);
  let finish;const stale=choose({size:12,text:()=>new Promise(resolve=>finish=resolve)});
  await choose(new Blob(['invalid']));finish(F.serialize(state));await stale;
  assert.equal(installed.length,0);assert.equal(status(),'workspaceFile.openError');
  await choose(new Blob([saved]));assert.equal(status(),'workspaceFile.opened');assert.deepEqual(installed,[decoded]);
  for(const [supersede,late] of [[()=>revision++,saved],[()=>revision++,'bad'],[()=>click('open'),saved]]){
    const old=choose({size:12,text:()=>new Promise(resolve=>finish=resolve)});
    supersede();finish(late);await old;
    assert.deepEqual(installed,[decoded]);assert.equal(status(),'workspaceFile.opened');
  }
  // Start an async installation and pause either side of the synchronous commit.
  function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
  function staging({lateError=false,afterCommit=false}={}){
    const reached=deferred(),resume=deferred();
    installer=async(doc,current,commit)=>{
      const applyIfCurrent=()=>commit(()=>apply(doc));
      if (afterCommit) applyIfCurrent();
      reached.resolve(current);await resume.promise;
      if(lateError) throw Error('Could not prepare workspace');
      if(!afterCommit) return applyIfCurrent();
    };
    return {ready:reached.promise,resume:resume.resolve,done:choose(new Blob([saved]))};
  }
  const cancelled=()=>callbacks.get('desk-file-input:cancel')();
  for(const [supersede,lateError] of [[()=>revision++,false],[cancelled,false],[()=>click('open'),true],
    [()=>choose(new Blob(['bad'])),false],[()=>choose(null),true]]){
    const stage=staging({lateError}),current=await stage.ready;
    assert(current());await supersede();assert(!current());
    const lastStatus=status();stage.resume();await stage.done;
    assert.deepEqual(installed,[decoded]);assert.equal(status(),lastStatus);
  }
  const complete=staging();await complete.ready;complete.resume();await complete.done;
  assert.equal(status(),'workspaceFile.opened');assert.deepEqual(installed,[decoded,decoded]);
  const later=staging({afterCommit:true});assert((await later.ready)());
  await choose(new Blob(['bad']));later.resume();await later.done;
  assert.equal(installed.length,3);assert.equal(status(),'workspaceFile.openError');
  const failure=staging({lateError:true});await failure.ready;failure.resume();await failure.done;
  assert.equal(installed.length,3);assert.equal(status(),'workspaceFile.openError');
  // Even an otherwise valid desk must not be passed to install with a malformed bench.
  await choose(new Blob([JSON.stringify({...decoded,bench:{}})]));assert.equal(installed.length,3);
  installer=apply;await choose(new Blob([JSON.stringify(legacy)]));
  assert.deepEqual(installed.at(-1),{...legacy,version:2,bench:history.empty()});
  for (const config of [{isSecureContext:false},{isSecureContext:true,showSaveFilePicker:undefined}]){
    Object.assign(context,config);attach();assert.equal(els.get('desk-file-save').hidden,true);
    assert.equal(els.get('desk-file-download').hidden,false);click('download');assert.equal(status(),'workspaceFile.downloaded');
  }
  console.log('PASS bounded reads, atomic staging, stale/cancelled imports, explicit downloads and native save');
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
    // A tab copied with a name (e.g. from a spreadsheet) must not strand an
    // otherwise usable model and its entire plate rack in an unsavable desk.
    const pasted=field(rows()[0]);pasted.value='\tethanol\t';pasted.setSelectionRange(2,5);
    pasted.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(pasted.value,' ethanol ');assert.deepEqual([pasted.selectionStart,pasted.selectionEnd],[2,5]);
    assert(rows()[0].querySelector('.row-formula').textContent);
    assert.deepEqual(F.parse(F.serialize({...current(),bench})).rows,current().rows);
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
    // Stock plates need no structure lookup. Import a nonempty bench and undo/redo the whole file.
    const stockBench={...bench,plates:[{...bench.plates[0],smiles:'O',role:'reagent',stockId:'water',label:'Water'}]};
    const rack=()=>JSON.parse(JSON.stringify(w.ReactionPlates.capture()));
    const priorBench=rack(),priorDesk=current();
    await startRead()(F.serialize({...original,bench:stockBench}));
    assert.deepEqual(rack(),stockBench);assert.deepEqual(current(),original);
    assert.equal(el('desk-file-status').textContent,w.AtlasI18n.t('workspaceFile.opened'));
    click('desk-undo');assert.deepEqual(rack(),priorBench);assert.deepEqual(current(),priorDesk);
    click('desk-redo');assert.deepEqual(rack(),stockBench);assert.deepEqual(current(),original);
    // Validation and async structure preparation both run before either half is committed.
    await startRead()(JSON.stringify({...decoded,bench:{...stockBench,right:'999'}}));
    assert.deepEqual(rack(),stockBench);assert.deepEqual(current(),original);
    w.ReactionInput.parse=async()=>{throw Error('Structure unavailable');};
    await startRead()(F.serialize({...restore,bench}));assert.deepEqual(rack(),stockBench);assert.deepEqual(current(),original);
    assert.equal(el('desk-file-status').textContent,w.AtlasI18n.t('workspaceFile.openError'));
    let parseStarted=false,resumeParse;
    w.ReactionInput.parse=()=>{parseStarted=true;return new Promise(resolve=>resumeParse=resolve);};
    await startRead()(F.serialize({...restore,bench}));assert(parseStarted);
    change('plate-condition','ambient');const editedBench=rack(),lastStatus=el('desk-file-status').textContent;
    resumeParse(w.ModelInput.preview('ethanol'));await tick();
    assert.deepEqual(rack(),editedBench);assert.deepEqual(current(),original);assert.equal(el('desk-file-status').textContent,lastStatus);
    await startRead()(JSON.stringify(legacy));assert.deepEqual(rack(),history.empty());
    assert.deepEqual(current(),{view:legacy.view,rows:legacy.rows});
    click('desk-undo');assert.deepEqual(rack(),editedBench);assert.deepEqual(current(),original);
    console.log('PASS desk restore, row cancellation, combined rack undo/redo, v1 migration and atomic failure');
  } finally {dom.window.close();}
}
