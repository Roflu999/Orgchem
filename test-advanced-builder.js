'use strict';
// No browser or chemistry-server dependency: exercise mapped drafts and the async UI contract.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('./sketcher-model.js');
const Chem = require('./chemistry.js');
const Geometry = require('./geometry.js');
const Scene = require('./scene.js');
const Records = require('./molecule-record.js');
let checks = 0;
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function record(elements = ['C', 'O', 'H'], edges = [[0, 1, 1], [1, 2, 1]]) {
  const atoms = elements.slice(), atomIds = atoms.map((_, i) => 'a' + (i + 1));
  const bonds = edges.map(([a, b, order]) => ({ a, b, order, id:'b-' + atomIds[a] + '-' + atomIds[b], aromatic:false }));
  return { schema:'bond-atlas/3', id:'test-stereo', stereoisomerId:'test-stereo', connectivityId:'test-connectivity',
    name:'Mapped test structure', knownName:false, formula:'CH4O', notation:'CO', atoms, atomIds, bonds,
    charges:atoms.map(() => 0), isotopes:atoms.map((_, i) => i === 0 ? 13 : 0), hydrogens:atoms.map(e => e === 'C' ? 3 : 0), charge:0,
    metadata:{ mass:33.04, counts:{C:1,H:4,O:1}, dbe:0 }, tags:[], stability:{ reasons:[] },
    stereo:{centers:[{atomId:'a1',cip:'R'}],bonds:[]}, molblock:'test authoritative mapped source', warnings:[],
    conformers:[{id:'test-conformer',method:'supplied',atoms:[{e:'C',atomId:'a1',x:1,y:2,z:3}]}],selectedConformerId:'test-conformer',
    layouts:{skeletal:{atoms:atoms.map((e, i) => ({e,x:i,y:i % 2})),bonds:clone(bonds)}} };
}
function resultFor(snapshot, label = 'Latest mapped structure') {
  const r = record(snapshot.atoms.map(a => a.e), snapshot.bonds.map(b => [b.a, b.b, b.order]));
  r.atomIds = snapshot.atoms.map(a => a.id); r.isotopes = snapshot.atoms.map(a => a.isotope || 0); r.charges = snapshot.atoms.map(a => a.charge || 0);
  r.charge = r.charges.reduce((a, b) => a + b, 0); r.name = label; r.bonds = clone(snapshot.bonds);
  r.layouts.skeletal = { atoms:clone(snapshot.atoms), bonds:clone(snapshot.bonds) };
  return { molecules:[r], warnings:[] };
}
async function test(name, fn) { await fn(); checks++; console.log('PASS', name); }

// A deliberately small DOM double: enough for real sketcher-ui.js handlers, not a UI reimplementation.
function browser(client) {
  const ids = new Map(), timers = new Map(), requests = [], loads = [], views = [], stereoLoads = []; let timerId = 0;
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.attributes = {}; this.style = {setProperty(){}}; this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.textContent = ''; }
    set id(id) { this._id = id; ids.set(id, this); } get id() { return this._id; }
    get options() { return this.children.filter(c => c.tagName === 'option'); }
    append(...children) { children.forEach(c => { c.parent = this; this.children.push(c); }); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, event = {}) { const e = {target:this,preventDefault(){},...event}; for (const fn of this.listeners[type] || []) fn(e); }
    matches(selector) { return selector.split(',').some(s => s.trim() === this.tagName || (s.startsWith('[data-') && this.attributes[s.slice(1, -1)] !== undefined)); }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    querySelector() { return null; }
    getBoundingClientRect() { return {left:0,top:0,right:700,bottom:445,width:700,height:445}; }
    focus() {} setPointerCapture() {} remove() {}
  }
  const document = {activeElement:null,body:new Element('body'),getElementById(id){if (!ids.has(id)) {const n = new Element('div'); n.id = id;} return ids.get(id);},
    createElement:tag => new Element(tag),createElementNS:(_, tag) => new Element(tag),createTextNode:text => ({textContent:text}),querySelectorAll:() => []};
  const app = {state:{mode:'3d',selected:null},geometry2D:iso => Geometry.layout2D(iso,false),stopRotation(){},showView(view){views.push(view);},
    loadStructures(records){loads.push(records);},setMode(){},setElectrons(){},setTogether(){}};
  const window = {MoleculeSketcher:M,BondAtlas:app,ChemistryClient:client || {ready:Promise.resolve(),available:true,job(operation,payload,options){return new Promise((resolve,reject) => requests.push({operation,payload,options,resolve,reject}));}},
    MoleculeRecords:Records,MoleculeScene:Scene,StereoExplorer:{setMolecules(records,options){stereoLoads.push({records,options});}}};
  const context = vm.createContext({window,document,Chem,MoleculeGeometry:Geometry,AbortController,ResizeObserver:class{observe(){}},
    setTimeout(fn){const id = ++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},requestAnimationFrame:fn => fn()});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'sketcher-ui.js'),'utf8'),context,{filename:'sketcher-ui.js'});
  const settle = async () => {for(let i=0;i<10;i++)await Promise.resolve();};
  return {api:window.MoleculeBuilder,window,app,document,requests,loads,views,stereoLoads,$:id=>document.getElementById(id),settle,
    async tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());await settle();},
    async finish(request, label){request.resolve(resultFor(request.payload.draft,label));await settle();},
    selectAtom(i){const atom = new Element('g');atom.setAttribute('data-atom',i);document.getElementById('builder-canvas').emit('keydown',{target:atom,key:'Enter'});},
    change(id,value){const el=document.getElementById(id);el.value=String(value);el.emit('change');},
    moveAtom(i,key='ArrowRight'){const atom = new Element('g');atom.setAttribute('data-atom',i);document.getElementById('builder-canvas').emit('keydown',{target:atom,key});}
  };
}

(async()=>{
  await test('workspace navigation reuses the host viewer without resetting its camera',()=>{
    const b=browser();let resets=0;b.app.setMode=()=>{resets++;};
    b.$('show-explorer').emit('click');assert.equal(b.views.at(-1),'explorer');
    assert.equal(resets,0,'showView already handles visibility; navigation must not recreate the scene');
    delete b.app.showView;b.$('show-explorer').emit('click');
    assert.equal(resets,1,'The standalone legacy host still needs its visibility refresh');
  });
  await test('explicit toolkit mode retains mapped source, isotopes, charges, explicit H and stereo without mutation',()=>{
    const source=record();source.charges[1]=-1;
    const before=JSON.stringify(source),d=M.fromStructure(freeze(source));
    assert.equal(d.engine,'rdkit');assert.deepEqual(d.atoms.map(a=>a.id),source.atomIds);assert.deepEqual(d.atoms.map(a=>a.charge),source.charges);
    assert.deepEqual(d.atoms.map(a=>a.isotope),source.isotopes);assert.equal(d.atoms[2].e,'H');assert.equal(d.bonds[0].id,source.bonds[0].id);
    assert.deepEqual(d.sourceRecord,source);assert.notEqual(d.sourceRecord,source);assert.equal(JSON.stringify(source),before);
    const moved=M.moveAtom(freeze(d),0,999,18);assert.deepEqual(moved.sourceRecord,source);assert.deepEqual(moved.atoms.map(a=>a.id),d.atoms.map(a=>a.id));
    moved.sourceRecord.conformers[0].atoms[0].x=100;assert.equal(d.sourceRecord.conformers[0].atoms[0].x,1);
    assert.equal(M.analyze(d).valid,false);assert.match(M.analyze(d).message,/asynchronous RDKit/);
  });
  await test('toolkit immutable edits preserve surviving IDs, and added/deleted atoms and bonds never reuse identities',()=>{
    const d=freeze(M.fromStructure(record())),original=JSON.stringify(d);
    const changed=M.setCharge(M.setElement(d,1,'S'),1,-2);assert.equal(changed.atoms[1].id,d.atoms[1].id);assert.equal(changed.atoms[0].isotope,13);
    const higher=M.setBond(changed,1,0,3);assert.equal(higher.bonds[0].id,d.bonds[0].id);
    const removed=M.removeAtom(d,0);assert.deepEqual(removed.bonds,[{a:0,b:1,order:1,id:d.bonds[1].id}]);assert.equal(removed.atoms[1].e,'H');
    const added=M.addAtom(removed,'Na',0,0);assert(!d.atoms.some(a=>a.id===added.atoms[2].id));
    const replaced=M.setBond(M.removeBond(d,0,1),0,1,1);assert.notEqual(replaced.bonds.at(-1).id,d.bonds[0].id);
    assert.equal(JSON.stringify(d),original);assert.deepEqual(changed.sourceRecord,d.sourceRecord);
  });
  await test('elastic drag moves bonded neighbors, leaves other fragments still, and preserves mapped chemistry',()=>{
    const d=freeze(M.fromStructure(record(['C','O','Cl'],[[0,1,1]])));
    const moved=M.elasticDrag(d,[0],50,12);
    assert.equal(moved.atoms[0].x,d.atoms[0].x+50);
    assert.notDeepEqual(moved.atoms[1],d.atoms[1]);assert.deepEqual(moved.atoms[2],d.atoms[2]);
    assert.equal(M.chemicalSignature(moved),M.chemicalSignature(d));
  });
  await test('free and idealized Move constrain drawing angles only; tidy is not a persistent lock',()=>{
    for(const [name,target] of [['Propane',120],['But-1-yne',180]]){
      const b=browser(); b.api.showBuilder(Chem.resolveName(name));
      const original=b.api.getDraft(), neighbors=i=>original.bonds.filter(e=>e.a===i||e.b===i).map(e=>e.a===i?e.b:e.a);
      const end=original.atoms.findIndex((_,i)=>neighbors(i).length===1&&(target===120||original.bonds.some(e=>(e.a===i||e.b===i)&&e.order===3)));
      const [pivot]=neighbors(end),ref=neighbors(pivot).find(i=>i!==end);
      const angle=()=>{const atoms=b.api.getDraft().atoms,p=atoms[pivot],a=atoms[end],v=atoms[ref];return Math.abs(Math.atan2((a.x-p.x)*(v.y-p.y)-(a.y-p.y)*(v.x-p.x),(a.x-p.x)*(v.x-p.x)+(a.y-p.y)*(v.y-p.y)))*180/Math.PI;};
      b.moveAtom(end,'ArrowUp');assert(Math.abs(angle()-target)>0.01,'free move does not snap');
      b.change('builder-angle-mode','ideal');b.moveAtom(end,'ArrowDown');assert(Math.abs(angle()-target)<1e-7);
      assert.deepEqual(b.api.getDraft().bonds,original.bonds);
      b.change('builder-angle-mode','free'); b.$('builder-ideal').emit('click'); b.moveAtom(end,'ArrowUp');assert(Math.abs(angle()-target)>0.01);
    }
  });
  await test('2D to 3D and back keeps the elastic drawing and its Undo entry',async()=>{
    const b=browser();b.api.showBuilder(Chem.resolveName('Ethanol'));const before=b.api.getDraft();
    b.$('builder-elastic').emit('click');b.moveAtom(0);const edited=b.api.getDraft();
    const [model]=await b.api.openViewer();b.app.state.selected=model;b.$('edit-in-builder').emit('click');
    assert.deepEqual(b.api.getDraft(),edited);b.$('builder-undo').emit('click');assert.deepEqual(b.api.getDraft(),before);
  });
  await test('eligible mapped sketches without coordinates request exactly one 3D state',async()=>{
    const b=browser();b.api.showBuilder(record());await b.tick();await b.finish(b.requests[0]);
    const opening=b.api.openViewer();await b.settle();const parse=b.requests.at(-1),reply=resultFor(parse.payload.draft);
    const model=reply.molecules[0];model.conformers=[];model.stereo.centers=[];parse.resolve(reply);await b.settle();
    const generate=b.requests.at(-1);assert.equal(generate.operation,'conformers');assert.equal(generate.payload.numConfs,1);
    generate.resolve({molecule:{...model,conformers:record().conformers}});await opening;
    assert.equal(b.loads.length,1);assert(Records.geometry(b.loads[0][0]));
  });
  await test('periodic elements and signed charges use shape validation, not the legacy valence gate',()=>{
    let d=M.empty('rdkit');for(const e of ['S','P','B','Si','Na','Cl','H','Og'])d=M.addAtom(d,e,0,0);
    d=M.setCharge(d,4,1);d=M.setCharge(d,5,-1);assert.equal(d.atoms[5].charge,-1);
    for(let i=1;i<=6;i++)d=M.setBond(d,0,i,1);assert.equal(d.bonds.length,6);
    assert.throws(()=>M.setCharge(d,0,-17),/charge/);assert.throws(()=>M.setCharge(d,0,0.5),/charge/);assert.throws(()=>M.addAtom(d,'Xx',0,0),/element/);
    assert.throws(()=>M.checked({...d,atoms:d.atoms.map((a,i)=>({...a,isotope:i?0:401}))}),/Isotope/);
    assert.throws(()=>M.checked({...d,atoms:d.atoms.map(a=>({...a,id:'duplicate'}))}),/Duplicate atom/);
    assert.throws(()=>M.checked({...d,bonds:d.bonds.map(b=>({...b,id:'duplicate'}))}),/Duplicate bond/);
    assert.throws(()=>M.addAtom(M.empty(),'S',0,0),/element/);
    let legacy=M.addAtom(M.empty(),'C',1,2);const advanced=M.toAdvanced(legacy);assert.equal(legacy.engine,undefined);assert.equal(advanced.engine,'rdkit');assert.equal(advanced.atoms[0].charge,0);
  });
  await test('chemical signatures ignore XY but include source, charge, isotope, identity, connectivity and bond order',()=>{
    const d=M.fromStructure(record()),sig=M.chemicalSignature(d);
    assert.equal(M.chemicalSignature(M.moveAtom(d,1,-9,90)),sig);
    for(const changed of [M.setCharge(d,0,1),M.setElement(d,0,'Si'),M.setBond(d,0,1,2),M.removeAtom(d,2)])assert.notEqual(M.chemicalSignature(changed),sig);
    const isotope=clone(d);isotope.atoms[0].isotope=12;assert.notEqual(M.chemicalSignature(isotope),sig);
    const source=clone(d);source.sourceRecord.selectedConformerId='different';assert.notEqual(M.chemicalSignature(source),sig);
  });
  await test('neutral legacy UI stays offline and disconnected imported salts remain one authoritative entity',async()=>{
    const b=browser();b.api.showBuilder(Chem.resolveName('Ethanol'));await b.tick();assert.equal(b.requests.length,0);assert.equal(b.$('builder-name').textContent,'Ethanol');
    const salt=record(['Na','Cl'],[]);salt.charges=[1,-1];b.api.showBuilder(salt);assert.equal(b.$('builder-formula').textContent,'—');assert.equal(b.$('builder-panel').attributes['aria-busy'],'true');
    await b.tick();assert.equal(b.requests.length,1);assert.equal(b.requests[0].operation,'parse');assert.equal(b.requests[0].payload.draft.atoms.length,2);
    await b.finish(b.requests[0],'Sodium chloride');assert.equal(b.$('builder-name').textContent,'Sodium chloride');assert.equal(b.$('builder-component').children.length,1);assert(b.$('builder-open-all').hidden);assert(b.$('builder-ideal').disabled);
    assert.equal(b.api.getDraft().sourceRecord.stereoisomerId,salt.stereoisomerId);assert(b.views.includes('builder'));
  });
  await test('analysis debounces, cancels and ignores out-of-order errors/results without overwriting draft/source JSON',async()=>{
    const b=browser();b.api.loadStructure(record());await b.tick();const first=b.requests[0];
    b.selectAtom(0);b.change('builder-replace-element','Si');b.change('builder-charge',1);const expected=JSON.stringify(b.api.getDraft());
    assert(first.options.signal.aborted);assert.equal(b.$('builder-formula').textContent,'—');assert(b.$('builder-open-viewer').disabled);
    await b.tick();assert.equal(b.requests.length,2);const second=b.requests[1];
    const response=resultFor(second.payload.draft,'New graph');response.molecules[0].warnings=['Stereo assignments invalidated near chemical edits: a1'];second.resolve(response);await b.settle();await b.finish(first,'STALE GRAPH');
    assert.equal(b.$('builder-name').textContent,'New graph');assert.match(b.$('builder-recognition').textContent,/Stereo assignments invalidated/);assert.equal(JSON.stringify(b.api.getDraft()),expected);
    b.change('builder-charge',2);await b.tick();const third=b.requests[2];b.change('builder-charge',3);await b.tick();third.reject(Error('STALE ERROR'));await b.settle();
    assert(!b.$('builder-message').textContent.includes('STALE ERROR'));await b.finish(b.requests[3],'Newest graph');assert.equal(b.$('builder-name').textContent,'Newest graph');
  });
  await test('moving uses the chemical cache, but opening always parses latest coordinates and syncs mapped records',async()=>{
    const b=browser();b.api.showBuilder(record());await b.tick();await b.finish(b.requests[0]);const original=b.api.getDraft();
    b.moveAtom(0);await b.tick();assert.equal(b.requests.length,1);const moved=b.api.getDraft();assert.notEqual(moved.atoms[0].x,original.atoms[0].x);
    const opening=b.api.openViewer();await b.settle();assert.equal(b.requests.length,2);const request=b.requests[1];assert.equal(request.payload.draft.atoms[0].x,moved.atoms[0].x);
    await b.finish(request,'Viewer graph');await opening;assert.equal(b.loads.length,1);assert.equal(b.loads[0][0].schema,'bond-atlas/3');assert.equal(b.stereoLoads.length,1);assert.equal(b.stereoLoads[0].options.sync,false);assert.equal(b.views.at(-1),'explorer');
    assert.equal(JSON.stringify(b.api.getDraft().sourceRecord),JSON.stringify(original.sourceRecord));
  });
  await test('viewer parses cancelled by graph or layout edits cannot navigate or replace a newer draft',async()=>{
    const b=browser();b.api.loadStructure(record());await b.tick();await b.finish(b.requests[0]);
    const opening=b.api.openViewer();await b.settle();const request=b.requests[1];b.moveAtom(0);const expected=JSON.stringify(b.api.getDraft());assert(request.options.signal.aborted);
    await b.finish(request);await opening;assert.equal(b.loads.length,0);assert.equal(JSON.stringify(b.api.getDraft()),expected);
  });
  await test('signed ion and isotope labels do not portray anions as carbocations; new element/charge tools promote drafts',async()=>{
    const b=browser();b.api.loadStructure(record(['Cl'],[]));b.selectAtom(0);b.change('builder-charge',-2);await b.tick();await b.finish(b.requests[0]);
    assert(b.$('builder-formula').textContent.endsWith('²⁻'));assert(!b.$('builder-recognition').textContent.includes('Classical C'));
    const texts=[];function visit(n){if(n.tagName==='text')texts.push(n.textContent);for(const c of n.children||[])visit(c);}visit(b.$('builder-canvas'));assert(texts.includes('¹³Cl²⁻'));
    b.api.loadStructure(Chem.resolveName('Methane'));b.selectAtom(0);b.change('builder-replace-element','P');assert.equal(b.api.getDraft().engine,'rdkit');
    b.api.loadStructure(Chem.resolveName('Methane'));b.selectAtom(0);b.change('builder-charge',1);assert.equal(b.api.getDraft().engine,'rdkit');
    assert(b.$('builder-more-elements').options.some(o=>o.value==='S'));assert(b.$('builder-charge').options.some(o=>o.value==='-1'));
  });
  await test('backend failures and unavailability stay explicit, with no silent neutral fallback',async()=>{
    const b=browser({ready:Promise.resolve(),available:false,job(){throw Error('The RDKit chemistry server is unavailable.');}});
    b.api.loadStructure(record());await b.tick();assert.match(b.$('builder-recognition').textContent,/server is unavailable/);assert(b.$('builder-open-viewer').disabled);assert.equal(b.$('builder-formula').textContent,'—');assert.equal(b.api.getDraft().engine,'rdkit');
    const c=browser();c.api.loadStructure(record());await c.tick();c.requests[0].reject(Error('Explicit valence error from RDKit'));await c.settle();assert.match(c.$('builder-message').textContent,/Explicit valence/);assert.equal(c.$('builder-panel').attributes['aria-busy'],'false');
  });
  console.log('\n'+checks+' advanced builder test groups passed. Mock DOM/transport tests do not cover browser rendering or live RDKit.');
})().catch(error=>{console.error(error);process.exitCode=1;});
