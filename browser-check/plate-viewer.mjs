// DOM controls and actual ModelStage adapter; only 3Dmol/WebGL are test doubles.
// Optional loopback port runs a real RDKit parse + conformer job through ChemistryClient.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as tick, setTimeout as delay} from 'node:timers/promises';
import {JSDOM} from 'jsdom';

const port = process.argv[2];
if (port && !/^\d{1,5}$/.test(port)) throw Error('Expected a loopback port');
const origin = 'http://127.0.0.1:'+(port || 8000);
const dom = new JSDOM('<main></main>', {url:origin,runScripts:'outside-only'}), w = dom.window;
const load = async file => w.eval(await readFile(new URL('../'+file,import.meta.url),'utf8'));
const host = w.document.querySelector('main'), viewers = [], jobs = [], parses = [];
const at = sel => host.querySelector(sel), status = () => at('[role=status]').textContent;
const btn = name => [...host.querySelectorAll('button')].find(b=>b.textContent===name);
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get:()=>480});
Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get:()=>320});
w.$3Dmol = {elementColors:{defaultColors:{}},createViewer(pane, opts) {
  assert.equal(opts.antialias,true); assert.equal(opts.orthographic,true); assert.equal(opts.rows,1);
  const canvas = w.document.createElement('canvas'); pane.append(canvas);
  const viewer = {models:[],styles:[],turns:[],fov:20,CAMERA_Z:150,view:[0,0,0,0,0,0,0,1,0,0],
    getRenderer:()=>({isLost:()=>viewer.lost,getCanvas:()=>canvas,getContext:()=>({getExtension:()=>({loseContext(){viewer.lost=true;}})})}),
    setProjection(){},removeAllModels(){this.models=[];}, addModel(){return {addAtoms:atoms=>this.models.push(atoms)};},
    getView(){return this.view;},setView(v){this.view=v;},setSlab(){},resize(){},render(){},
    setStyle(sel){this.styles.push({...sel});},rotate(d,axis){this.turns.push([d,axis]);},zoom(f){this.factor=f;}};
  viewers.push(viewer); return viewer;
}};
const mapped = {schema:'bond-atlas/3',id:'methanol',stereoisomerId:'methanol',atoms:['C','O'],atomIds:['a','b'],
  charges:[0,0],isotopes:[0,0],hydrogens:[3,1],bonds:[{a:0,b:1,order:1}],provenance:{toolkit:'RDKit'},
  stereo:{centers:[],bonds:[],unsupported:[]},depictions:{skeletal:'<svg xmlns="http://www.w3.org/2000/svg"><text>OH</text></svg>'}};
function complete(r) {return {...r,selectedConformerId:'sel',conformers:[{id:'sel',stereoVerification:{verified:true},
  atoms:r.atoms.map((e,i)=>({e,atomId:r.atomIds[i],x:i,y:i/2,z:i/3})),bonds:r.bonds}]};}
try {
  for (const file of ['chemistry.js','molecule-record.js','geometry.js','model-input.js','viewer-lifecycle.js','model-stage.js','plate-viewer.js']) await load(file);
  w.ChemistryClient = {available:true,ready:Promise.resolve(),
    parse:async(text,format)=>{parses.push([text,format]);return {molecules:[mapped]};},
    job:async(op,payload,opts)=>{jobs.push({op,payload,opts});return {molecule:complete(mapped)};}};
  const viewer = w.PlateViewer.mount(host);
  viewer.show(mapped,'Methanol',{atomId:'b',label:'OH'});
  assert.equal(jobs.length+viewers.length,0); assert(at('img')); assert(btn('Rotate').hidden);
  const pick = i => {const s=at('.plate-viewer-focus select');s.value=String(i);s.dispatchEvent(new w.Event('change'));};
  assert.equal(at('label').control,at('select'));assert.equal(at('select').value,'1');
  assert.match(at('img').alt,/Connectivity around O2: C1–O2 \(single\)/);assert.match(status(),/stereochemistry are not shown/);
  btn('Zoom in').click(); assert.equal(at('.plate-viewer-stage').style.width,'135%');
  btn('Fit').click(); assert.equal(at('.plate-viewer-stage').style.width,'100%');assert.equal(at('select').value,'');
  assert(decodeURIComponent(at('img').src).endsWith(mapped.depictions.skeletal));pick(1);
  btn('Show 3D').click(); await tick();
  assert.equal(jobs.length,1);assert.equal(jobs[0].op,'conformers'); assert.deepEqual(jobs[0].payload.molecule.atomIds,mapped.atomIds);assert(!('depictions' in jobs[0].payload.molecule));
  assert.equal(parses.length,0); assert.match(status(),/O2 \(OH\)/); const gl=viewers.at(-1);
  assert(gl.styles.some(s=>s.index===1)); assert.equal(gl.models[0].length,2);
  btn('Rotate').click(); at('.plate-viewer-viewport').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp'}));
  assert.deepEqual(gl.turns,[[20,'y'],[-15,'x']]); btn('Zoom in').click(); assert(gl.factor>1); btn('Zoom out').click();assert(gl.factor<1);
  at('canvas').dispatchEvent(new w.Event('webglcontextlost',{cancelable:true})); assert.match(status(),/renderer/); assert(at('img')); assert(gl.lost);
  btn('Show 3D').click();await tick();assert.equal(jobs.length,1,'reuse verified result on graphics retry');
  viewer.show(w.ModelInput.preview('methanol'),'legacy',{atom:1});btn('Show 3D').click();await tick();
  assert.equal(parses.length,1);assert.equal(parses[0][1],'smiles');assert.match(status(),/no atom is marked/);
  assert(!viewers.at(-1).styles.some(s=>'index' in s));
  viewer.show({...mapped,stereo:{...mapped.stereo,centers:[{specified:false}]}},'Unknown stereo');
  assert(btn('Show 3D').disabled); assert.match(status(),/stereochemistry open/);assert(at('img'));
  const chain=n=>({...mapped,atoms:Array(n).fill('C'),atomIds:Array.from({length:n},(_,i)=>'a'+i),
    charges:Array(n).fill(0),isotopes:Array(n).fill(0),hydrogens:Array(n).fill(2),bonds:Array.from({length:n-1},(_,i)=>({a:i,b:i+1,order:1}))});
  const large=complete(chain(256));
  viewer.show(large,'At service limit',{atomId:'a255'});assert(!btn('Show 3D').disabled);
  assert.match(at('img').alt,/Connectivity around C256: C255–C256/);assert(!at('img').alt.includes('C254'));
  assert.equal(at('select').length,257);btn('Show 3D').click();await tick();
  const model=viewers.at(-1),xyz=model.models[0],fullJobs=jobs.length, depth=model.view[3];
  assert.equal(xyz.length,256);assert.deepEqual(Array.from(model.styles.at(-3).index),[255,254]);
  viewer.show(large,'At service limit',{atomId:'a0',label:'First carbon'});
  assert.equal(viewers.at(-1),model);assert.equal(model.models[0],xyz);assert.equal(jobs.length,fullJobs);
  assert.match(status(),/C1 \(First carbon\)/);assert.equal(model.styles.at(-1).index,0);
  assert(Math.abs(model.view[0]+(xyz[0].x+xyz[1].x)/2)<1e-8); // camera framed around the new site
  btn('Fit').click();assert.equal(at('select').value,'');assert(model.view[3]<depth);assert(!('index' in model.styles.at(-1)));
  pick(128);assert.equal(model.styles.at(-1).index,128);btn('Show 2D').click();assert.match(at('img').alt,/Connectivity around C129/);
  viewer.show(chain(257),'Over service limit');assert(btn('Show 3D').disabled);assert.match(status(),/256 base atoms/);
  const crowded=complete(chain(24)), state=crowded.conformers[0];state.bonds=state.bonds.slice();
  for(let i=0;i<26;i++){state.atoms.push({e:'H',atomId:'h'+i,x:i,y:1,z:3});state.bonds.push({a:i%24,b:i+24,order:1});}
  const priorJobs=jobs.length;
  viewer.show(crowded,'Crowded',{atom:10});btn('Show 3D').click();await tick();assert.match(status(),/hydrogens are hidden/);
  assert.equal(jobs.length,priorJobs,'keep the supplied selected conformer without regenerating it');
  assert.equal(viewers.at(-1).models[0].length,24);assert.equal(state.atoms.length,50);
  w.ChemistryClient.job=async()=>({molecule:{...complete(mapped),atomIds:['b','a']}});
  viewer.show({...mapped},'Different mapping',{atom:1});btn('Show 3D').click();await tick();
  assert.match(status(),/No verified 3D coordinates/);assert(at('img'));assert(!at('canvas'));
  let deferred, signal;
  w.ChemistryClient.job=(_op,_payload,opts)=>{signal=opts.signal;return new Promise(r=>{deferred=r;});};
  for (const action of ['switch','cancel','clear','dispose']) {
    viewer.show({...mapped},'Pending'); btn('Show 3D').click(); await tick();assert(!signal.aborted);
    if(action==='switch') viewer.show(complete(mapped),'Other');
    else if(action==='cancel') btn('Cancel 3D').click(); else viewer[action]();
    assert(signal.aborted);const before=host.textContent;
    deferred({molecule:complete(mapped)}); await tick(); assert.equal(host.textContent,before);
  }
  viewer.show(mapped,'Must not resurrect');assert(!host.children.length);
  console.log('PASS lazy loading, mapped sites, zoom, rotation, large/stereo fallback, context loss and cancellation');

  if (port) {
    w.AbortController=AbortController;w.AbortSignal=AbortSignal;
    let conformerBytes=0;
    w.fetch=(path,opts)=>{
      const u=new URL(path,origin);assert.equal(u.origin,origin);
      if (opts?.body && JSON.parse(opts.body).operation==='conformers') conformerBytes=Buffer.byteLength(opts.body);
      return fetch(u,{...opts,redirect:'error'});
    };
    await load('chemistry-client.js');await w.ChemistryClient.ready;assert(w.ChemistryClient.available);
    const {molecules:[record]}=await w.ChemistryClient.parse('C[C@H](O)F','smiles');
    const live = w.PlateViewer.mount(host);live.show(record,'Specified alcohol',{atom:1});btn('Show 3D').click();
    for(let i=0;i<200 && btn('Cancel 3D');i++)await delay(125);
    assert(btn('Show 2D'),status());const atoms=viewers.at(-1).models[0];assert(atoms.length>4);assert(atoms.some(a=>Math.abs(a.z)>0.01));
    assert.match(status(),/site atom: C2/); console.log('PASS same-origin RDKit job produced verified XYZ, '+atoms.length+' atoms; stage passed them to renderer');
    // Compact, branched aromatic C66H54: 66 BASE atoms, not a count inflated by generated H.
    const arm='c2cc(-c3ccc(C)cc3)cc(-c3ccc(C)cc3)c2', aromatic=`c1(-${arm})cc(-${arm})cc(-${arm})c1`;
    const {molecules:[large]}=await w.ChemistryClient.parse(aromatic,'smiles');assert.equal(large.atoms.length,66);
    const fullBytes=Buffer.byteLength(JSON.stringify(large));conformerBytes=0;
    live.show(large,'Branched aromatic',{atom:65});assert(!btn('Show 3D').disabled);const start=performance.now();btn('Show 3D').click();
    for(let i=0;i<400 && btn('Cancel 3D');i++)await delay(125);
    assert(btn('Show 2D'),status());assert.match(status(),/site atom: C66/);assert.match(status(),/hydrogens are hidden/);
    const model=viewers.at(-1).models[0];assert.equal(model.length,66);assert(model.some(a=>Math.abs(a.z)>.05));
    assert(conformerBytes>0 && conformerBytes<fullBytes/4 && conformerBytes<w.ChemistryClient.capabilities.limits.inputBytes);
    console.log(`PASS C66H54: 66 mapped atoms to renderer; ${conformerBytes} B conformer request vs ${fullBytes} B parsed record; ${((performance.now()-start)/1000).toFixed(2)} s including polling`);
    live.dispose();
  }
} finally {dom.window.close();}
