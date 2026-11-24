'use strict';
// Local-only tiny DOM/transport tests. No browser, server, translation API or dependencies.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const catalogSource=fs.readFileSync(path.join(__dirname,'atlas-locales.js'),'utf8');
const engineSource=fs.readFileSync(path.join(__dirname,'atlas-i18n.js'),'utf8');
let groups=0;
async function test(name,fn){await fn();groups++;console.log('PASS',name);}
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function tinyDOM(){
  let document;
  class Element{
    constructor(tag,nodeType=1){this.tagName=tag.toLowerCase();this.nodeType=nodeType;this.children=[];this.parentElement=null;this._attributes=new Map();this.listeners={};this.dataset={};this.style={setProperty(){}};this.hidden=false;this.disabled=false;this.checked=false;this._text='';this._value=undefined;this.files=[];}
    get attributes(){return [...this._attributes].map(([name,value])=>({name,value}));}
    setAttribute(k,v){this._attributes.set(k,String(v));if(k==='value')this._value=String(v);if(k==='class')this.className=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
    getAttribute(k){return this._attributes.get(k)??null;}
    get id(){return this.getAttribute('id')||'';}set id(v){this.setAttribute('id',v);}
    get value(){return this._value??(this.tagName==='select'?this.options[0]?.value:'')??'';}set value(v){this._value=String(v);}
    get options(){return this.children.filter(c=>c.tagName==='option');}
    get firstChild(){return this.children[0]||null;}
    get childNodes(){return this.children;}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this.children.forEach(c=>c.parentElement=null);this.children=[];this._text=String(v??'');}
    get isConnected(){return this===document.documentElement||!!this.parentElement?.isConnected;}
    append(...nodes){nodes.forEach(n=>{if(typeof n!=='object')n=document.createTextNode(String(n));n.remove();n.parentElement=this;this.children.push(n);});}
    replaceChildren(...nodes){this.children.forEach(c=>c.parentElement=null);this.children=[];this._text='';this.append(...nodes);}
    remove(){if(this.parentElement){const p=this.parentElement;p.children=p.children.filter(n=>n!==this);this.parentElement=null;}}
    replaceWith(node){if(this.parentElement){const p=this.parentElement,i=p.children.indexOf(this);node.remove();p.children[i]=node;node.parentElement=p;this.parentElement=null;}}
    matches(selector){return selector.split(',').some(part=>{const s=part.trim();if(s==='*')return this.nodeType===1;if(s[0]==='#')return this.id===s.slice(1);if(s[0]==='.')return (this.className||'').split(/\s+/).includes(s.slice(1));const m=/^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(s);return m?this._attributes.has(m[1])&&(m[2]===undefined||this.getAttribute(m[1])===m[2]):this.tagName===s;});}
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    querySelectorAll(selector){const found=[];const walk=n=>n.children.forEach(c=>{if(c.matches(selector))found.push(c);walk(c);});walk(this);return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    addEventListener(type,fn,options){(this.listeners[type]||=[]).push({fn,once:options?.once});}
    async emit(type,event={}){const e={target:this,preventDefault(){},...event};const listeners=[...(this.listeners[type]||[])];for(const entry of listeners){await entry.fn(e);if(entry.once)this.listeners[type]=this.listeners[type].filter(x=>x!==entry);}}
    focus(){document.activeElement=this;}
    select(){this.selectedText=true;}
    reportValidity(){return true;}
    setPointerCapture(){}
    getBoundingClientRect(){return {left:0,top:0,right:700,bottom:445,width:700,height:445};}
    showModal(){this.open=true;}close(){this.open=false;}
    set innerHTML(html){
      this.replaceChildren();const stack=[this],voids=new Set(['input','img','br','hr','meta','link']);
      for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
        if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
        if(token.startsWith('<')){const tag=/^<([\w-]+)/.exec(token)?.[1];if(!tag)continue;const el=document.createElement(tag);const attrs=token.slice(tag.length+1,-1);for(const a of attrs.matchAll(/([^\s=]+)(?:="([^"]*)"|='([^']*)'|=([^\s]+))?/g)){el.setAttribute(a[1],a[2]??a[3]??a[4]??'');if(a[1]==='disabled')el.disabled=true;if(a[1]==='hidden')el.hidden=true;}
          stack.at(-1).append(el);if(!voids.has(tag)&&!token.endsWith('/>'))stack.push(el);
        }else stack.at(-1).append(document.createTextNode(token));
      }
    }
  }
  const listeners={};
  document={activeElement:null,events:[],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createTextNode:text=>{const n=new Element('#text',3);n._text=String(text);return n;},querySelectorAll:s=>document.documentElement.querySelectorAll(s),addEventListener(type,fn){(listeners[type]||=[]).push(fn);},dispatchEvent(event){document.events.push(event);for(const fn of listeners[event.type]||[])fn(event);return true;},getElementById(id){let node=document.documentElement.querySelector('#'+id);if(!node){node=new Element('div');node.id=id;document.body.append(node);}return node;}};
  document.documentElement=new Element('html');document.body=new Element('body');document.documentElement.append(document.body);
  return {document,Element};
}
function environment(extra={}){
  const dom=tinyDOM(),timers=new Map();let timerId=0;
  const context=vm.createContext({...dom,console,AbortController,CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>fn(),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),...extra});
  context.window=context;context.globalThis=context;
  const run=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});
  vm.runInContext(catalogSource,context,{filename:'atlas-locales.js'});vm.runInContext(engineSource,context,{filename:'atlas-i18n.js'});
  return {context,document:dom.document,$:id=>dom.document.getElementById(id),run,I:context.AtlasI18n,timers,async tick(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());await settle();}};
}
function record(id='test-stereo'){
  return {schema:'bond-atlas/3',id,stereoisomerId:id,connectivityId:'test-connectivity',name:'Mapped test structure',knownName:false,formula:'CH4O',notation:'CO',atoms:['C','O'],atomIds:['a1','a2'],bonds:[{a:0,b:1,order:1,id:'b-a1-a2',aromatic:false}],charges:[0,0],isotopes:[13,0],hydrogens:[3,1],charge:0,metadata:{mass:33.04,counts:{C:1,H:4,O:1},dbe:0},tags:[],stability:{reasons:[]},stereo:{centers:[{atomId:'a1',atom:0,cip:'R',specified:true}],bonds:[]},molblock:'authoritative mapped source',warnings:[],conformers:[],layouts:{skeletal:{atoms:[{e:'C',x:0,y:0},{e:'O',x:1,y:0}],bonds:[{a:0,b:1,order:1}]}}};
}
(async()=>{
  await test('six extensible catalogs have complete nonempty key and interpolation parity',()=>{
    const e=environment(),catalogs=e.context.AtlasLocales,keys=Object.keys(catalogs.en).sort();assert(keys.length>300);
    assert.deepEqual(Object.keys(catalogs).sort(),['ar','de','en','es','fr','zh-Hans'].sort());
    for(const code of Object.keys(catalogs)){assert.deepEqual(Object.keys(catalogs[code]).sort(),keys);for(const key of keys){assert.equal(typeof catalogs[code][key],'string',code+' '+key);assert(catalogs[code][key].length>0);const params=s=>[...s.matchAll(/\{([\w.-]+)\}/g)].map(m=>m[1]).sort();assert.deepEqual(params(catalogs[code][key]),params(catalogs.en[key]),code+' '+key);}}
    for(const code of Object.keys(catalogs))Object.assign(catalogs[code],{'test.extension':code});e.I.setLocale('fr');assert.equal(e.I.t('test.extension'),'fr');assert(Object.isFrozen(e.I));assert(Object.isFrozen(e.I.supportedLocales));
  });
  await test('lookup, interpolation, missing keys, English fallback and unsupported locales',()=>{
    const e=environment(),I=e.I;assert.equal(I.locale,'en');assert.equal(I.t('stereo.title'),'Possible stereoisomers');assert.equal(I.t('missing',{},'Explicit fallback'),'Explicit fallback');assert.equal(I.t('missing'),'missing');
    e.context.AtlasLocales.en['test.onlyEnglish']='English {value} {missing}';e.context.AtlasLocales.en['test.empty']='';
    I.setLocale('es');assert.equal(I.t('test.onlyEnglish',{value:'<img src=x>'}),'English <img src=x> {missing}');assert.equal(I.t('test.empty',{},'not empty'),'');assert.equal(I.t('missing',{x:7},'{x} fallback'),'7 fallback');assert.equal(I.t('stereo.recordsLoaded',()=>({count:3})),'3 registros moleculares cargados.');
    const events=e.document.events.length;assert.equal(I.setLocale('invalid'),'es');assert.equal(e.document.events.length,events);I.setLocale('es');assert.equal(e.document.events.length,events);assert.equal(I.supportedLocales.find(x=>x.code==='ar').dir,'rtl');
  });
  await test('explicit leaf and attribute bindings preserve controls focus handlers and scientific data',()=>{
    const e=environment(),d=e.document,I=e.I,label=d.createElement('label'),caption=d.createElement('span'),input=d.createElement('input'),button=d.createElement('button'),notation=d.createElement('code');
    caption.setAttribute('data-i18n','stereo.input');caption.textContent='Structure input';input.setAttribute('data-i18n-placeholder','stereo.placeholder');input.setAttribute('placeholder','English placeholder');input.setAttribute('data-i18n-aria-label','stereo.input');input.value='C[C@H](O)C(=O)O';input.checked=true;input.disabled=true;input.selectionStart=4;
    button.setAttribute('data-i18n-title','common.compare');button.setAttribute('title','Compare');button.setAttribute('data-i18n-alt','stereo.title');notation.textContent='C6H6 · [NH4+] · R/S · a1 → a2';notation.dir='ltr';label.append(caption,input);d.body.append(label,button,notation);input.focus();let clicks=0;button.addEventListener('click',()=>clicks++);
    I.apply();const values={count:2};const status=d.createElement('p');d.body.append(status);I.bindText(status,'stereo.recordsLoaded',()=>values);I.bindAttr(button,'aria-label','stereo.compareVariant',()=>({number:values.count,assignments:'C1: R'}));
    const chemical={selectedId:'m-1',conformerId:'c-1',together:true,projection:{reverse:true,angle:125},undo:['drawing'],pending:{token:'keep'}};const before=JSON.stringify(chemical);
    for(const code of I.supportedLocales.map(x=>x.code)){values.count++;I.setLocale(code);assert.equal(input.value,'C[C@H](O)C(=O)O');assert.equal(input.selectionStart,4);assert.equal(input.checked,true);assert.equal(input.disabled,true);assert.equal(d.activeElement,input);assert.equal(label.children[0],caption);assert.equal(label.children[1],input);assert(status.textContent.includes(String(values.count)));assert(button.getAttribute('aria-label').includes('C1: R'));assert.equal(notation.textContent,'C6H6 · [NH4+] · R/S · a1 → a2');assert.equal(JSON.stringify(chemical),before);}
    assert.equal(d.documentElement.lang,'de');I.setLocale('ar');assert.equal(d.documentElement.dir,'rtl');assert.equal(input.getAttribute('aria-label'),'إدخال البنية');assert.equal(notation.dir,'ltr');button.emit('click');assert.equal(clicks,1);
    assert.equal(d.events.at(-1).type,'atlas:localechange');assert.equal(d.events.at(-1).detail.locale,'ar');
  });
  await test('bindings take latest params, explicit rebinding replaces stale static keys, removed subtrees stay untouched',()=>{
    const e=environment(),d=e.document,I=e.I,n=d.createElement('p');n.setAttribute('data-i18n','stereo.connecting');n.textContent='Connecting to chemistry service…';d.body.append(n);I.apply();I.bindText(n,'stereo.ready');I.setLocale('fr');assert.equal(n.textContent,'Service de chimie prêt');
    const p={count:1};I.bindText(n,'stereo.recordsLoaded',p);p.count=8;I.setLocale('de');assert.equal(n.textContent,'8 Moleküldatensätze geladen.');I.bindText(n,'missing',{},'Fallback saved');I.setLocale('ar');assert.equal(n.textContent,'Fallback saved');
    n.remove();const old=n.textContent;e.context.AtlasLocales.en['missing']='new text';I.setLocale('en');assert.equal(n.textContent,old);d.body.append(n);I.apply(n);assert.equal(n.textContent,'new text');
    const unannotated=d.createElement('p');unannotated.textContent='Compare';d.body.append(unannotated);I.setLocale('zh-Hans');assert.equal(unannotated.textContent,'Compare');
  });
  await test('engine works without a DOM and catalogs can load before or after it',()=>{
    const c=vm.createContext({});c.globalThis=c;vm.runInContext(engineSource,c);assert.equal(c.AtlasI18n.t('unknown',{},'fallback'),'fallback');c.AtlasI18n.setLocale('ar');vm.runInContext(catalogSource,c);assert.equal(c.AtlasI18n.t('common.compare'),'مقارنة');assert.equal(c.AtlasI18n.locale,'ar');
  });
  await test('real builder locale changes keep drawing nodes, draft, camera-facing positions, focus and Undo',async()=>{
    const Chem=require('./chemistry.js'),Geometry=require('./geometry.js'),M=require('./sketcher-model.js'),Scene=require('./scene.js'),Records=require('./molecule-record.js');
    const calls=[],requests=[],client={available:true,ready:Promise.resolve({}),job(operation,payload,options){let resolve;const promise=new Promise(r=>resolve=r);requests.push({operation,payload,options,resolve});return promise;}};
    const app={state:{mode:'3d',selected:null},geometry2D:g=>Geometry.layout2D(g,false),stopRotation(){calls.push('stop');},showView:v=>calls.push(v),setMode:m=>calls.push(m),loadStructures(){calls.push('load');},setElectrons(){},setTogether(){}};
    const e=environment({Chem,MoleculeGeometry:Geometry,MoleculeSketcher:M,MoleculeScene:Scene,MoleculeRecords:Records,ChemistryClient:client,BondAtlas:app});e.run('sketcher-ui.js');const api=e.context.MoleculeBuilder;api.showBuilder(Chem.resolveName('ethanol'));
    const before=JSON.stringify(api.getDraft()),canvas=e.$('builder-canvas'),atom=canvas.querySelector('[data-atom]');atom.focus();const nodes=canvas.children.slice(),count=calls.length;
    for(const locale of ['es','fr','zh-Hans','ar','de']){e.I.setLocale(locale);assert.equal(JSON.stringify(api.getDraft()),before);assert.deepEqual(canvas.children,nodes);assert.equal(e.document.activeElement,atom);assert.equal(calls.length,count);assert.equal(requests.length,0);}
    assert.match(e.$('builder-element-C').getAttribute('aria-label'),/Kohlenstoff/);assert.equal(e.$('builder-name').textContent,'Ethanol');await e.$('builder-clear').emit('click');assert.equal(api.getDraft().atoms.length,0);e.I.setLocale('es');await e.$('builder-undo').emit('click');assert.equal(JSON.stringify(api.getDraft()),before);
    api.loadStructure(record());await e.tick();assert.equal(requests.length,1);const pending=requests[0],draft=JSON.stringify(api.getDraft());e.I.setLocale('ar');assert.equal(pending.options.signal.aborted,false);assert.equal(requests.length,1);assert.equal(JSON.stringify(api.getDraft()),draft);assert.match(e.$('builder-recognition').textContent,/RDKit/);
  });
  await test('real textbook projection locale changes preserve slider, coordinates and projection preferences',async()=>{
    const Chem=require('./chemistry.js'),P=require('./projections.js'),Records=require('./molecule-record.js'),calls=[];const iso=Chem.resolveName('ethanol'),before=JSON.stringify(iso),app={state:{selected:iso,mode:'newman'},loadStructures:()=>calls.push('load'),setMode:()=>calls.push('mode')};
    const e=environment({Chem,MoleculeProjections:P,MoleculeRecords:Records,BondAtlas:app});e.run('textbook-ui.js');e.context.TextbookView.render(iso,'newman');const slider=e.$('newman-dihedral'),svg=e.$('textbook-content').querySelector('svg');slider.value='125';await slider.emit('input');slider.focus();const nodes=svg.children.slice();
    e.I.setLocale('ar');assert.equal(e.$('newman-dihedral'),slider);assert.equal(slider.value,'125');assert.equal(e.document.activeElement,slider);assert.deepEqual(svg.children,nodes);assert.match(slider.parentElement.firstChild.textContent,/125/);assert.equal(JSON.stringify(iso),before);assert.equal(calls.length,0);assert(slider.getAttribute('aria-label').includes('بالدرجات'));
    e.I.setLocale('de');assert.match(slider.parentElement.firstChild.textContent,/Hintere Drehung 125°/);assert.equal(e.$('textbook-controls').querySelector('select').value,'');
  });
  await test('real stereo module keeps pending jobs, selected records and generated controls across locale changes',async()=>{
    const requests=[],m=record(),before=JSON.stringify(m),app={state:{selected:m,result:{isomers:[m]}},loadStructures(records){this.state.result={isomers:records};this.state.selected=records[0];},selectStructure(){},setMode(){},setTogether(){}};
    const client={available:true,ready:Promise.resolve({}),job(operation,payload,options){let resolve;const promise=new Promise(r=>resolve=r);requests.push({operation,payload,options,resolve});return promise;}};
    const e=environment({BondAtlas:app,ChemistryClient:client,MoleculeRecords:require('./molecule-record.js')});e.context.Option=function(text,value){const n=e.document.createElement('option');n.textContent=text;n.value=value;return n;};e.run('stereo-ui.js');await settle();
    const input=e.$('stereo-input'),generate=e.context.StereoExplorer.generate();await settle();assert.equal(requests.length,1);assert.equal(requests[0].operation,'enumerate');input.focus();const value=input.value;
    e.I.setLocale('fr');assert.equal(requests[0].options.signal.aborted,false);assert.equal(requests.length,1);assert.equal(input.value,value);assert.equal(e.document.activeElement,input);assert.match(e.$('stereo-status').textContent,/Génération/);assert.equal(JSON.stringify(m),before);
    requests[0].resolve({molecules:[m],complete:true});await generate;assert.match(e.$('stereo-summary').textContent,/variante renvoyée/);const checkbox=e.$('stereo-variants').querySelector('input'),button=e.$('stereo-variants').querySelector('button');checkbox.checked=true;const children=e.$('stereo-variants').children.slice();e.I.setLocale('ar');assert.deepEqual(e.$('stereo-variants').children,children);assert.equal(checkbox.checked,true);assert.equal(e.$('stereo-variants').querySelector('button'),button);assert(checkbox.getAttribute('aria-label').includes('البديل'));assert.equal(JSON.stringify(m),before);assert.equal(requests.length,1);
  });
  await test('real import module translates an in-flight file read without cancelling or rewriting input',async()=>{
    const app={state:{busy:false},showError(){}};const e=environment({BondAtlas:app,MoleculeFormats:{MAX_BYTES:1048576}});e.$('export-target').innerHTML='<option value="selected">Selected</option><option value="filtered">Filtered</option><option value="conformers">Conformers</option>';e.$('export-format').value='sdf';e.run('interchange-ui.js');
    let resolve;const textPromise=new Promise(r=>resolve=r);e.$('file-input').files=[{name:'private.smi',size:5,text:()=>textPromise}];const pending=e.$('file-input').emit('change');await settle();const button=e.$('apply-import');assert.equal(button.disabled,true);e.I.setLocale('de');assert.equal(button.disabled,true);assert.equal(button.textContent,'Datei wird gelesen…');resolve('CCO');await pending;assert.equal(e.$('import-text').value,'CCO');assert.equal(e.$('import-format').value,'smiles');assert.equal(button.textContent,'Struktur(en) öffnen');assert.equal(button.disabled,false);
  });
  await test('real grid module keeps pending reads and existing 3D surfaces unchanged on locale changes',async()=>{
    const shapes=new Set(),calls=[],viewer={render(){calls.push('render');},removeShape(s){shapes.delete(s);calls.push('remove');},addVolumetricData(){const s={};shapes.add(s);calls.push('add');return s;}};
    const app={state:{selected:{id:'grid-structure'},viewer,together:false},geometry3D:()=>({atoms:[{e:'H',x:0,y:0,z:0}]}),setMode(){calls.push('mode');}};
    const e=environment({BondAtlas:app,MoleculeRecords:{cacheKey:()=> 'grid-structure:conformer'},getComputedStyle:()=>({getPropertyValue:()=> '#888888'})});e.run('quantum-grid.js');let resolve;const promise=new Promise(r=>resolve=r);e.$('quantum-grid-file').files=[{size:100,text:()=>promise}];const pending=e.$('quantum-grid-file').emit('change');await settle();e.I.setLocale('es');assert.equal(e.$('quantum-grid-status').textContent,'Leyendo malla suministrada…');resolve('Example\nValues\n1 0 0 0\n2 1 0 0\n2 0 1 0\n2 0 0 1\n1 1 0 0 0\n0 1 2 3 4 5 6 7');await pending;e.$('quantum-grid-kind').value='density';await e.$('quantum-grid-show').emit('click');assert.equal(shapes.size,1);const count=calls.length,surface=[...shapes][0],threshold=e.$('quantum-grid-level').value;e.I.setLocale('ar');assert.equal(calls.length,count);assert.equal([...shapes][0],surface);assert.equal(e.$('quantum-grid-level').value,threshold);assert.equal(app.state.selected.id,'grid-structure');assert.match(e.$('quantum-grid-status').textContent,/الكثافة/);e.$('quantum-grid-kind').value='orbital';e.I.setLocale('de');assert.match(e.$('quantum-grid-status').textContent,/Dichtedaten/);assert.equal(shapes.size,1);
  });
  console.log('\n'+groups+' localization test groups passed. Tiny DOM tests do not certify browser layout, font coverage, WebGL rendering or screen-reader output.');
})().catch(error=>{console.error(error);process.exitCode=1;});
