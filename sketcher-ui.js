/* Pointer + keyboard sketchpad. Advanced chemistry uses the same-origin RDKit service. */
(function () {
  'use strict';
  const I = window.AtlasI18n;
  const tr = (key, fallback, params = {}) => I ? I.t(key, params, fallback) : fallback.replace(/\{(\w+)\}/g, (s, k) => params[k] ?? s);
  const ui = (element, value) => { const read = () => { let result=value; while(typeof result==='function')result=result(); return result; }; if (I) I.bindText(element, 'common.value', { value: read }); else element.textContent = read(); return element; };
  const attr = (element, name, value) => { const read = () => { let result=value; while(typeof result==='function')result=result(); return result; }; if (I) I.bindAttr(element, name, 'common.value', { value: read }); else element.setAttribute(name, read()); };
  const diagnosticKeys=new Map(Object.entries(window.AtlasLocales?.en||{}).filter(([key])=>/^(stereo|builder|projection|import|grid)\./.test(key)).map(([key,value])=>[value,key]));
  const detail=text=>{if(!text)return '';const key=diagnosticKeys.get(text);const valence=/^Neutral valence \/ carbocation valence exceeded at atom (\d+) \(([A-Z][a-z]?)\): maximum (\d+)\. Remove or lower a bond first\.$/.exec(text);if(valence)return tr('builder.error.valence','Neutral valence / carbocation valence exceeded at atom {number} ({element}): maximum {maximum}. Remove or lower a bond first.',{number:valence[1],element:valence[2],maximum:valence[3]});return key?tr(key,text):tr('common.original','{detail}',{detail:text});};
  const M = window.MoleculeSketcher, app = window.BondAtlas, $ = id => document.getElementById(id);
  const svg = $('builder-canvas'), NS = 'http://www.w3.org/2000/svg';
  svg.setAttribute('direction','ltr');
  const elements = { C:'Carbon', H:'Hydrogen', N:'Nitrogen', O:'Oxygen', F:'Fluorine', Cl:'Chlorine', Br:'Bromine', I:'Iodine' };
  const groups = { alcohol:'Alcohol', 'primary-alcohol':'Primary alcohol', 'secondary-alcohol':'Secondary alcohol', 'tertiary-alcohol':'Tertiary alcohol', ether:'Ether', aldehyde:'Aldehyde', ketone:'Ketone', 'carboxylic-acid':'Carboxylic acid', ester:'Ester', amine:'Amine', amide:'Amide', nitrile:'Nitrile', alkane:'Alkane', alkene:'Alkene', alkyne:'Alkyne', cyclic:'Cyclic', enol:'Enol', peroxide:'Peroxide', halogenoalkane:'Halogenoalkane', 'primary-halogenoalkane':'Primary halogenoalkane', 'secondary-halogenoalkane':'Secondary halogenoalkane', 'tertiary-halogenoalkane':'Tertiary halogenoalkane' };
  let draft = M.empty(), analysis = {valid:false,structure:null,hydrogens:[],message:'Add an atom.'}, initialized = false;
  let scene = { components: [], hydrogens: [] }, activeComponent = 0;
  let revision = 0, analysisTimer = null, analysisController = null;
  const chemicalCache = new Map();
  const isAdvanced = () => draft.engine === 'rdkit';
  const superscript = n => String(n).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  const chargeLabel = q => q ? (Math.abs(q) === 1 ? '' : superscript(Math.abs(q))) + (q < 0 ? '⁻' : '⁺') : '';
  function cancelAnalysis() {
    revision++; clearTimeout(analysisTimer); analysisTimer = null;
    analysisController?.abort(); analysisController = null;
  }
  function advancedScene(result) {
    activeComponent = 0;
    scene = { valid:result.valid, message:result.message, hydrogens:result.hydrogens || [], components:draft.atoms.length ? [{ ...result, indices:draft.atoms.map((_, i) => i) }] : [] };
    return result;
  }
  function pendingResult(message, busy = false) { return { valid:false, structure:null, hydrogens:[], message, busy }; }
  function cacheResult(signature, result) {
    chemicalCache.set(signature, result);
    if (chemicalCache.size > 12) chemicalCache.delete(chemicalCache.keys().next().value);
  }
  async function parseDraft(snapshot, signal) {
    const client = window.ChemistryClient;
    if (!client?.job) throw Error('The RDKit chemistry server is unavailable. Advanced drafts cannot be identified by the offline neutral engine.');
    await client.ready;
    if (signal.aborted) throw Object.assign(Error('Calculation cancelled.'), { name:'AbortError' });
    const response = await client.job('parse', { draft:snapshot }, { signal });
    const records = response?.molecules;
    if (!Array.isArray(records) || records.length !== 1 || !(window.MoleculeRecords?.isRecord(records[0]) ?? records[0]?.schema === 'bond-atlas/3')) throw Error('The chemistry server did not return one mapped molecular record.');
    const structure = records[0], map = new Map(structure.atomIds.map((id, i) => [id, i]));
    if (map.size !== snapshot.atoms.length || snapshot.atoms.some(a => !map.has(a.id))) throw Error('The chemistry server returned a different atom mapping.');
    const warnings = [...new Set([...(response.warnings || []), ...(structure.warnings || [])])];
    return { valid:true, structure, hydrogens:snapshot.atoms.map(a => structure.hydrogens[map.get(a.id)] || 0), message:warnings.join(' ') || 'Validated by RDKit. Canvas positions never assign stereochemistry.', warnings, busy:false };
  }
  function identify() {
    cancelAnalysis();
    if (isAdvanced()) {
      if (!draft.atoms.length) return advancedScene(pendingResult('Add an atom. This draft uses the RDKit server.'));
      const snapshot = M.checked(draft), signature = M.chemicalSignature(snapshot), requestRevision = revision;
      if (chemicalCache.has(signature)) return advancedScene(chemicalCache.get(signature));
      const controller = analysisController = new AbortController();
      analysisTimer = setTimeout(async () => {
        try {
          const result = await parseDraft(snapshot, controller.signal);
          if (requestRevision !== revision || controller.signal.aborted || M.chemicalSignature(draft) !== signature) return;
          cacheResult(signature, result); analysis = advancedScene(result); render();
        } catch (error) {
          if (requestRevision !== revision || controller.signal.aborted) return;
          analysis = advancedScene(pendingResult(error.message)); message(()=>detail(error.message)); render();
        } finally { if (analysisController === controller) analysisController = null; }
      }, 250);
      return advancedScene(pendingResult('Checking the current draft with RDKit…', true));
    }
    scene = window.MoleculeScene.analyze(draft);
    activeComponent = Math.min(activeComponent, Math.max(0, scene.components.length - 1));
    return { ...(scene.components[activeComponent] || { valid:false, structure:null, message:scene.message }), hydrogens:scene.hydrogens };
  }
  function draftForElement(e) { return !Object.prototype.hasOwnProperty.call(M.VAL, e) && !isAdvanced() ? M.toAdvanced(draft) : draft; }
  let tool = 'move', element = 'C', order = 1, selection = null, anchor = null, gesture = null, paletteDrag = null;
  let history = [], future = [], sample = false, width = 700, height = 445;
  let camera = { x:500, y:260, scale:1 }, pendingLine = null;
  const pretty = f => window.MoleculeRecords?.prettyFormula?window.MoleculeRecords.prettyFormula(f):f.replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);
  const node = (tag, attrs = {}, text) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k,v]) => typeof v==='function'?attr(el,k,v):el.setAttribute(k,String(v)));
    if (text !== undefined) ui(el,()=>text);
    return el;
  };
  function message(text = '') { ui($('builder-message'),text); $('builder-message').hidden = !(typeof text==='function'?text():text); }
  function remember(before) { history.push(before); if (history.length > 100) history.shift(); future = []; sample = false; }
  function apply(next, selected = selection, fit = false) {
    if (JSON.stringify(next) === JSON.stringify(draft)) return;
    remember(draft); draft = next; selection = selected; anchor = null;
    analysis = identify(); message(); if (fit) fitDrawing(); render();
  }
  function attempt(action) { try { const result = action(); result?.catch?.(e => message(()=>detail(e.message))); return result; } catch (e) { message(()=>detail(e.message)); } }
  function setTool(next, value) {
    tool = next; if (next === 'element') element = value; if (next === 'bond') order = Number(value);
    anchor = null; pendingLine = null; message(); render();
  }
  function project(p) { return { x:(p.x-camera.x)*camera.scale+width/2, y:(p.y-camera.y)*camera.scale+height/2 }; }
  function unproject(x, y) { return { x:(x-width/2)/camera.scale+camera.x, y:(y-height/2)/camera.scale+camera.y }; }
  function pointer(e) { const r = svg.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
  function inside(e) { const r=svg.getBoundingClientRect(); return e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom; }
  function worldPoint(p) { return unproject(Math.max(30,Math.min(width-30,p.x)),Math.max(33,Math.min(height-33,p.y))); }
  function fitDrawing() {
    const rect = svg.getBoundingClientRect(); if (rect.width) { width=rect.width; height=rect.height; }
    if (!draft.atoms.length) { camera={x:500,y:260,scale:Math.min(1,width/600)}; return; }
    const xs=draft.atoms.map(a=>a.x), ys=draft.atoms.map(a=>a.y);
    const loX=Math.min(...xs), hiX=Math.max(...xs), loY=Math.min(...ys), hiY=Math.max(...ys);
    camera={x:(loX+hiX)/2,y:(loY+hiY)/2,scale:Math.min(1.25,(width-95)/Math.max(180,hiX-loX),(height-100)/Math.max(130,hiY-loY))};
  }
  function nearestAtom(p, except = -1) {
    let found=-1, distance=29;
    draft.atoms.forEach((a,i)=>{ if(i===except)return; const q=project(a),d=Math.hypot(q.x-p.x,q.y-p.y); if(d<distance){found=i;distance=d;} });
    return found;
  }
  function nearestBond(p) {
    let found=null, distance=15;
    draft.bonds.forEach(b=>{
      const a=project(draft.atoms[b.a]), c=project(draft.atoms[b.b]), dx=c.x-a.x, dy=c.y-a.y, len=dx*dx+dy*dy;
      const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
      const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy); if(d<distance){found=b;distance=d;}
    }); return found;
  }
  const bondOrder=n=>tr(n===1?'builder.single':n===2?'builder.double':'builder.triple',n===1?'Single':n===2?'Double':'Triple');
  const elementName=e=>elements[e]?tr('builder.element.'+e,elements[e]):e;
  function drawingCounts(){const a=draft.atoms.length,b=draft.bonds.length;const counts=I?.locale&&I.locale!=='en'?tr('builder.counts','{atoms} drawn atoms · {bonds} bonds',{atoms:a,bonds:b}):a+' drawn atom'+(a===1?'':'s')+' · '+b+' bond'+(b===1?'':'s');return sample?tr('builder.examplePrefix','Example · {detail}',{detail:counts}):counts;}
  function updateIdentity() {
    if (selection?.kind === 'atom') {
      const index=scene.components.findIndex(c=>c.indices.includes(selection.i));
      if(index>=0)activeComponent=index;
    }
    analysis={...(scene.components[activeComponent]||{valid:false,structure:null,message:scene.message}),hydrogens:scene.hydrogens};
    const select=$('builder-component'); select.replaceChildren();
    scene.components.forEach((c,i)=>{const o=document.createElement('option');o.value=i;ui(o,()=>(i+1)+'. '+(c.valid?c.structure.name:tr("builder.incomplete",'Incomplete fragment')));select.append(o);});
    select.value=String(activeComponent); select.disabled=scene.components.length<2;
    const advanced = isAdvanced();
    $('builder-panel').setAttribute('aria-busy', String(!!analysis.busy));
    ui($('builder-scene-label'),()=>advanced?tr("builder.rdkitScene",'RDKit structure · fragments retained together'):scene.components.length>1?tr('builder.scene','Scene · {count} separate structures',{count:scene.components.length}):tr("builder.made",'What you’ve made'));
    $('builder-open-all').hidden=advanced||scene.components.length<2; $('builder-open-all').disabled=!scene.valid||scene.components.length>12;
    $('builder-ideal').disabled=advanced||!scene.components.some(c=>c.valid);
    const s=analysis.structure, valid=analysis.valid;
    $('builder-to-fischer').disabled=!valid; $('builder-to-newman').disabled=!valid;
    ui($('builder-name'),()=>valid?(advanced?s.name:s.knownName?s.name:tr("builder.nameMissing",'Name not in offline library')):(analysis.busy?tr("builder.checking",'Checking current draft…'):draft.atoms.length?tr("builder.finish",'Finish your molecule'):tr("builder.start",'Start a molecule')));
    ui($('builder-formula'),()=>valid?pretty(s.formula)+chargeLabel(s.charge):'—');
    ui($('builder-recognition'),()=>valid?(advanced?detail(analysis.message):s.charge?tr("builder.cation",'Classical C⁺ visualization: valence 3 at positive carbon. Neutral isomer enumeration and neutral-only exports are disabled.'):s.knownName?tr("builder.matched",'Matched by connectivity in the offline naming library.'):tr("builder.validUnnamed",'Connectivity is valid. Formula and properties are available, but a systematic name is not mapped.')) : detail(analysis.message));
    ui($('builder-mass'),()=>valid&&Number.isFinite(s.metadata?.mass)?s.metadata.mass.toFixed(2)+' g/mol':'—');
    ui($('builder-total'),()=>valid?Object.values(s.metadata.counts).reduce((a,b)=>a+b,0):'—');
    ui($('builder-dbe'),()=>valid&&s.metadata.dbe!=null?s.metadata.dbe+' DBE':'—');
    ui($('builder-groups'),()=>valid?((s.tags||[]).map(t=>groups[t]?tr('builder.group.'+t,groups[t]):t).join(' · ')||tr("builder.noGroups",'No supported group detected')):'—');
    ui($('builder-smiles'),()=>valid?s.notation:'—');
    ui($('builder-chemistry-note'),()=>advanced?tr("builder.advancedNote",'Stereochemistry comes from mapped source records, never canvas positions. Chemical edits can invalidate nearby assignments; backend warnings are shown above. No stability or safety assessment is made.'):valid?((s.stability.reasons.length?detail(s.stability.reasons.join(' '))||'' :tr("builder.noMotifs",'No reactive motifs flagged by the limited heuristic.'))+' '+tr('builder.safety','This does not establish stability or safety. Stereochemistry is unassigned.')):tr("builder.incompleteHelp",'This fragment is incomplete. Connect or delete its atoms, or select a different complete structure in the scene.'));
    $('builder-open-viewer').disabled=!valid||!!analysis.busy;
    $('builder-advanced').setAttribute('aria-pressed', String(advanced));
    $('builder-advanced').disabled=advanced;
  }
  function updateSelection() {
    const isAtom=selection?.kind==='atom' && !!draft.atoms[selection.i];
    const bond=selection?.kind==='bond'?draft.bonds.find(b=>b.a===selection.a&&b.b===selection.b):null;
    $('builder-atom-controls').hidden=!isAtom; $('builder-bond-controls').hidden=!bond; $('builder-delete').hidden=!isAtom&&!bond;
    if (isAtom) {
      const a=draft.atoms[selection.i],h=analysis.hydrogens?.[selection.i]||0;
      ui($('builder-selection-label'),()=>tr('builder.atomSelection','Atom {number} · {element}{hydrogens}',{number:selection.i+1,element:(a.isotope?superscript(a.isotope):'')+elementName(a.e)+chargeLabel(a.charge),hydrogens:' · '+(a.e==='H'?tr('builder.explicitH','explicit hydrogen'):isAdvanced()&&!analysis.valid?tr('builder.pendingH','H count pending'):tr('builder.autoH','{count} automatic H',{count:h}))}));
      $('builder-replace-element').value=a.e;
      const charge=$('builder-charge');
      if(!Array.from(charge.options).some(o=>o.value===String(a.charge||0))){const option=document.createElement('option');option.value=String(a.charge);ui(option,()=>tr('builder.formalCharge','{charge} formal charge',{charge:a.charge}));charge.append(option);}
      charge.value=String(a.charge||0); charge.disabled=false;
      const orders=draft.bonds.filter(b=>b.a===selection.i||b.b===selection.i).map(b=>b.order);
      ui($('builder-angle-note'),()=>isAdvanced()?tr("builder.rdkitAngles",'RDKit validates bonding and charge. 2D positions are illustrative and never assign or invert stereochemistry.'):a.charge?tr("builder.cationAngles",'C⁺: approximately trigonal planar, 120°. Empty p orbital; no lone pair.'):orders.includes(3)||orders.filter(o=>o===2).length>1?tr("builder.spAngles",'sp center: approximately linear, 180°.'):orders.includes(2)?tr("builder.sp2Angles",'sp² center: approximately trigonal planar, 120°.'):a.e==='C'?tr("builder.sp3Angles",'sp³ carbon: approximately tetrahedral, 109.5° in 3D. A flat zigzag is a projection, not the actual angle.'):tr("builder.otherAngles",'Geometry depends on bonding and lone pairs; positions here are illustrative.'));
      ui($('builder-grow'),()=>tr('builder.attach','Attach {element}',{element}));
    } else if (bond) {
      ui($('builder-selection-label'),()=>tr('builder.bondSelection','Bond · atom {a} to atom {b}',{a:bond.a+1,b:bond.b+1}));
      $('builder-change-order').value=String(bond.order);
    } else ui($('builder-selection-label'),()=>anchor!==null?tr("builder.secondAtom",'Choose a second atom to finish the bond.'):tr("builder.selectHint",'Choose Move, then select an atom or bond.'));
  }
  function updateToolbar() {
    document.querySelectorAll('[data-sketch-element]').forEach(b=>b.setAttribute('aria-pressed',String(tool==='element'&&b.dataset.sketchElement===element)));
    document.querySelectorAll('[data-sketch-order]').forEach(b=>b.setAttribute('aria-pressed',String(tool==='bond'&&Number(b.dataset.sketchOrder)===order)));
    $('builder-ring').setAttribute('aria-pressed',String(tool==='ring'));
    $('builder-move').setAttribute('aria-pressed',String(tool==='move')); $('builder-erase').setAttribute('aria-pressed',String(tool==='erase'));
    const hints=()=>({ring:tr("builder.hintRing",'Benzene ring · tap empty space to place a regular 120° hexagon'),move:tr("builder.hintMove",'Move · drag an atom, or drag a bond to move both ends'),element:tr('builder.hintElement','{element} · tap empty space to add; tap an atom to replace',{element}),bond:tr('builder.hintBond','{order} bond · drag between atoms, or tap two atoms',{order:bondOrder(order)}),erase:tr("builder.hintErase",'Erase · tap an atom or bond to remove it')});
    ui($('builder-tool-hint'),()=>hints()[tool]); svg.dataset.tool=tool;
    $('builder-undo').disabled=!history.length; $('builder-redo').disabled=!future.length;
    $('builder-clear').disabled=!draft.atoms.length;
    ui($('builder-counts'),()=>drawingCounts());
  }
  function atomDescription(a,i,h){return tr('builder.atomAria','Atom {number}, {element}{isotope}{charge}{hydrogens}',{number:i+1,element:elementName(a.e),isotope:a.isotope?tr('builder.isotopeSuffix',', isotope {value}',{value:a.isotope}):'',charge:a.charge?tr('builder.chargeSuffix',', formal charge {value}',{value:a.charge}):'',hydrogens:a.e!=='H'&&(!isAdvanced()||analysis.valid)?(!I||I.locale==='en'?', '+h+' automatic hydrogen'+(h===1?'':'s'):tr('builder.hydrogensSuffix',', {count} automatic hydrogens',{count:h})):''});}
  function renderDrawing() {
    const focused=document.activeElement?.closest?.('[data-sketch-focus]')?.getAttribute('data-sketch-focus');
    svg.setAttribute('viewBox','0 0 '+width+' '+height); svg.replaceChildren(node('title',{},()=>(tr("builder.canvas",'Molecule drawing canvas'))));
    draft.bonds.forEach(b=>{
      const p=project(draft.atoms[b.a]), q=project(draft.atoms[b.b]), dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1;
      const ux=dx/len,uy=dy/len,gap=Math.min(25,len*.3);
      const chosen=selection?.kind==='bond'&&selection.a===b.a&&selection.b===b.b;
      const g=node('g',{class:'sketch-bond',role:'button',tabindex:'0','data-bond-a':b.a,'data-bond-b':b.b,'data-sketch-focus':'b'+b.a+'-'+b.b,'aria-pressed':chosen,'aria-label':()=>tr('builder.bondAria','{order} bond from atom {a} to {b}',{order:bondOrder(b.order),a:b.a+1,b:b.b+1})});
      const offsets=b.order===1?[0]:b.order===2?[-3,3]:[-6,0,6];
      offsets.forEach(o=>g.append(node('line',{x1:p.x+ux*gap-uy*o,y1:p.y+uy*gap+ux*o,x2:q.x-ux*gap-uy*o,y2:q.y-uy*gap+ux*o,class:'sketch-bond-line'})));
      g.append(node('line',{x1:p.x,y1:p.y,x2:q.x,y2:q.y,class:'sketch-bond-hit'})); svg.append(g);
    });
    if (pendingLine && anchor!==null && draft.atoms[anchor]) {
      const p=project(draft.atoms[anchor]); svg.append(node('line',{x1:p.x,y1:p.y,x2:pendingLine.x,y2:pendingLine.y,class:'sketch-pending'}));
    }
    draft.atoms.forEach((a,i)=>{
      const p=project(a),h=analysis.hydrogens?.[i]||0;
      const g=node('g',{class:'sketch-atom',role:'button',tabindex:'0','data-atom':i,'data-sketch-focus':'a'+i,'aria-pressed':selection?.kind==='atom'&&selection.i===i||anchor===i,'aria-label':()=>atomDescription(a,i,h)});
      g.style.setProperty('--element-color','var(--atom-'+a.e+', var(--text, #888))');
      g.append(node('circle',{cx:p.x,cy:p.y,r:23}));
      g.append(node('circle',{cx:p.x-15,cy:p.y-15,r:3,class:'sketch-element-dot'}));
      g.append(node('text',{x:p.x,y:p.y+(h?0:6)},()=>((a.isotope?superscript(a.isotope):'')+a.e+chargeLabel(a.charge))));
      if($('builder-lone-pairs').checked&&!isAdvanced()){
        const count={N:1,O:2,F:3,Cl:3,Br:3,I:3}[a.e]||0;
        const angles=draft.bonds.filter(b=>b.a===i||b.b===i).map(b=>{const q=project(draft.atoms[b.a===i?b.b:b.a]);return Math.atan2(q.y-p.y,q.x-p.x);});
        const available=[];for(let k=0;k<24;k++){const angle=k*Math.PI/12;const separation=angles.length?Math.min(...angles.map(t=>Math.acos(Math.cos(angle-t)))):Math.PI;available.push({angle,separation});}
        available.sort((a,b)=>b.separation-a.separation);const chosen=[];
        for(const candidate of available){if(chosen.every(t=>Math.acos(Math.cos(t-candidate.angle))>.75))chosen.push(candidate.angle);if(chosen.length===count)break;}
        if(count&&!a.charge)chosen.slice(0,count).forEach(t=>[-3,3].forEach(o=>g.append(node('circle',{cx:p.x+33*Math.cos(t)-o*Math.sin(t),cy:p.y+33*Math.sin(t)+o*Math.cos(t),r:1.9,class:'sketch-lone-dot'}))));
      }
      if(h)g.append(node('text',{x:p.x,y:p.y+15,class:'sketch-hydrogen'},()=>('H'+(h>1?'₀₁₂₃₄₅₆₇₈₉'[h]:''))));
      svg.append(g);
    });
    if (!draft.atoms.length) {
      svg.append(node('text',{x:width/2,y:height/2-8,class:'sketch-empty'},()=>(tr("builder.emptyTitle",'Drag an element here to begin'))));
      svg.append(node('text',{x:width/2,y:height/2+18,class:'sketch-empty'},()=>(tr("builder.emptyHelp",'or choose an element and tap the canvas'))));
    }
    if(focused)svg.querySelector('[data-sketch-focus="'+focused+'"]')?.focus({preventScroll:true});
  }
  function render() { updateToolbar(); updateIdentity(); updateSelection(); renderDrawing(); }
  function loadStructure(iso, isSample = false) {
    let next=M.fromStructure(iso,iso.schema==='bond-atlas/3'?iso.layouts?.skeletal:app.geometry2D(iso));
    if(next.atoms.some(a=>a.charge)&&next.engine!=='rdkit')next=M.toAdvanced(next);
    if(initialized)remember(draft); draft=next; initialized=true; selection=null; anchor=null; sample=isSample;
    analysis=identify(); message(); fitDrawing(); render();
  }
  function showBuilder(iso) {
    app.stopRotation();
    if(app.showView)app.showView('builder');else{
      $('builder-panel').hidden=false; $('explorer-panel').hidden=true;
      $('show-builder').setAttribute('aria-pressed','true'); $('show-explorer').setAttribute('aria-pressed','false');
    }
    if(iso)loadStructure(iso); else if(!initialized)loadStructure(Chem.resolveName('ethanol'),true);
    else { fitDrawing(); render(); }
  }
  function showExplorer() {
    if(app.showView)app.showView('explorer');else{
      $('builder-panel').hidden=true; $('explorer-panel').hidden=false;
      $('show-builder').setAttribute('aria-pressed','false'); $('show-explorer').setAttribute('aria-pressed','true');
      requestAnimationFrame(()=>app.setMode(app.state.mode));
    }
    // The host schedules a visibility-aware redraw. Re-selecting the same
    // representation here rebuilt the model and reset the user's camera.
  }
  function undo(redo = false) {
    const from=redo?future:history, to=redo?history:future; if(!from.length)return;
    to.push(draft); draft=from.pop(); selection=null; anchor=null; sample=false;
    analysis=identify(); message(); fitDrawing(); render();
  }
  function deleteSelection() {
    if(selection?.kind==='atom')apply(M.removeAtom(draft,selection.i),null);
    else if(selection?.kind==='bond')apply(M.removeBond(draft,selection.a,selection.b),null);
  }
  function activateAtom(i) {
    if(tool==='erase'){apply(M.removeAtom(draft,i),null);return;}
    if(tool==='element'){apply(M.setElement(draftForElement(element),i,element),{kind:'atom',i});return;}
    selection={kind:'atom',i};
    if(tool==='bond') {
      if(anchor!==null&&anchor!==i){apply(M.setBond(draft,anchor,i,order),null);return;}
      anchor=anchor===i?null:i;
    }
    render();
  }
  function activateBond(a,b) {
    if(tool==='erase'){apply(M.removeBond(draft,a,b),null);return;}
    if(tool==='bond')apply(M.setBond(draft,a,b,order),{kind:'bond',a,b});
    else {selection={kind:'bond',a,b};anchor=null;render();}
  }
  function addAt(p) {
    const target=nearestAtom(p);
    if(target>=0){activateAtom(target);return;}
    const w=worldPoint(p); apply(M.addAtom(draftForElement(element),element,w.x,w.y),{kind:'atom',i:draft.atoms.length});
  }
  function stampRing(p) {
    const w=worldPoint(p),ring=window.MoleculeOrbitals.ringTemplate(w.x,w.y,Math.min(105,Math.max(55,Math.min(width,height)*.24/camera.scale)));
    let next=draft;const start=draft.atoms.length;
    ring.atoms.forEach(a=>{next=M.addAtom(next,a.e,a.x,a.y);});
    ring.bonds.forEach(b=>{next=M.setBond(next,start+b.a,start+b.b,b.order);});
    apply(next,{kind:'atom',i:start});fitDrawing();renderDrawing();
  }
  function tidyAngles() {
    if(!draft.atoms.length)return;
    let next=draft;
    for(const component of scene.components){
      if(!component.valid)continue;
      const indices=component.indices, index=new Map(indices.map((i,k)=>[i,k]));
      const g={atoms:indices.map(i=>draft.atoms[i].e),bonds:draft.bonds.filter(b=>index.has(b.a)&&index.has(b.b)).map(b=>({a:index.get(b.a),b:index.get(b.b),order:b.order})),hydrogens:indices.map(i=>analysis.hydrogens[i]),charges:indices.map(i=>draft.atoms[i].charge||0)};
      const layout=MoleculeGeometry.layout2D(g,false), cx=indices.reduce((s,i)=>s+draft.atoms[i].x,0)/indices.length,cy=indices.reduce((s,i)=>s+draft.atoms[i].y,0)/indices.length;
      const lx=layout.atoms.reduce((s,a)=>s+a.x,0)/indices.length,ly=layout.atoms.reduce((s,a)=>s+a.y,0)/indices.length;
      layout.atoms.forEach((a,k)=>{next=M.moveAtom(next,indices[k],cx+(a.x-lx)*105,cy+(a.y-ly)*105);});
    }
    apply(next,null,true);message(()=>(tr("builder.idealized",'Applied idealized 2D geometry: benzene/sp² ≈120°, sp ≈180°. Tetrahedral sp³ angles are ≈109.5° in 3D, not in the flat projection. Small or fused rings may be strained.')));
  }
  function attachAtom() {
    if(selection?.kind!=='atom')return;
    const i=selection.i, a=draft.atoms[i]; let best=null,score=-Infinity;
    for(let k=0;k<12;k++){
      const angle=k*Math.PI/6, p={x:a.x+105*Math.cos(angle),y:a.y+105*Math.sin(angle)};
      const distance=Math.min(...draft.atoms.map(q=>Math.hypot(q.x-p.x,q.y-p.y)));
      const screen=project(p), fits=screen.x>30&&screen.x<width-30&&screen.y>33&&screen.y<height-33;
      const s=distance+(fits?200:0); if(s>score){score=s;best=p;}
    }
    const next=M.addAtom(draftForElement(element),element,best.x,best.y);
    apply(M.setBond(next,i,next.atoms.length-1,1),{kind:'atom',i:next.atoms.length-1}); fitDrawing(); renderDrawing();
  }
  // Palette tools can be clicked, keyboard-activated, or dragged directly onto the drawing.
  function paletteButton(button, kind, value) {
    let suppressClick=false;
    button.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}setTool(kind,value);});
    button.addEventListener('pointerdown',e=>{
      if(e.button!==0 || paletteDrag)return;
      paletteDrag={button,kind,value,id:e.pointerId,startX:e.clientX,startY:e.clientY,ghost:null}; button.setPointerCapture(e.pointerId);
    });
    button.addEventListener('pointermove',e=>{
      const d=paletteDrag; if(!d||d.button!==button||d.id!==e.pointerId)return;
      if(!d.ghost&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>7){
        d.ghost=document.createElement('div');d.ghost.className='builder-drag-ghost';d.ui(ghost,()=>kind==='ring'?'⌬ Benzene':kind==='element'?value:(value===1?'—':value===2?'=':'≡'));document.body.append(d.ghost);
      }
      if(d.ghost){d.ghost.style.left=(e.clientX+13)+'px';d.ghost.style.top=(e.clientY+13)+'px';}
    });
    function finish(e,cancelled){
      const d=paletteDrag;if(!d||d.button!==button||d.id!==e.pointerId)return;paletteDrag=null;
      if(d.ghost){d.ghost.remove();suppressClick=true;setTimeout(()=>{suppressClick=false;},0);}
      if(cancelled||!d.ghost)return;
      setTool(kind,value);
      if(!inside(e))return;
      attempt(()=>{const p=pointer(e);if(kind==='element')addAt(p);else if(kind==='ring')stampRing(p);else{
        const i=nearestAtom(p),b=nearestBond(p);if(i>=0){anchor=i;selection={kind:'atom',i};render();}else if(b)activateBond(b.a,b.b);
      }});
    }
    button.addEventListener('pointerup',e=>finish(e,false));button.addEventListener('pointercancel',e=>finish(e,true));
  }
  paletteButton($('builder-ring'),'ring');
  Object.entries(elements).forEach(([e,name])=>{
    const b=document.createElement('button');b.id='builder-element-'+e;b.type='button';b.className='builder-tool';b.dataset.sketchElement=e;attr(b,'title',()=>tr('builder.elementTitle','{name} · click to place, or drag onto the canvas',{name:tr('builder.element.'+e,name)}));attr(b,'aria-label',()=>tr('builder.elementAria','{name} ({symbol}), add or replace atoms',{name:tr('builder.element.'+e,name),symbol:e}));b.setAttribute('aria-pressed','false');
    const dot=document.createElement('span');dot.className='builder-tool-dot';dot.style.setProperty('--element-color','var(--atom-'+e+')');dot.setAttribute('aria-hidden','true');b.append(dot,document.createTextNode(e));$('builder-elements').append(b);paletteButton(b,'element',e);
    const option=document.createElement('option');option.value=e;ui(option,()=>e+' · '+tr('builder.element.'+e,name));$('builder-replace-element').append(option);
  });
  const moreElements=document.createElement('select');
  moreElements.id='builder-more-elements'; moreElements.className='compact-select'; attr(moreElements,'aria-label',()=>tr('builder.moreAria','More elements (requires RDKit server)'));
  const morePlaceholder=document.createElement('option');morePlaceholder.value='';ui(morePlaceholder,()=>tr("builder.more",'More elements…'));moreElements.append(morePlaceholder);
  M.PERIODIC.forEach(e=>{
    if(!Object.prototype.hasOwnProperty.call(elements,e)){const option=document.createElement('option');option.value=e;ui(option,()=>e);moreElements.append(option);}
    if(!Object.prototype.hasOwnProperty.call(elements,e)){const option=document.createElement('option');option.value=e;ui(option,()=>e+' · RDKit');$('builder-replace-element').append(option);}
  });
  moreElements.addEventListener('change',()=>{if(moreElements.value)setTool('element',moreElements.value);moreElements.value='';});
  const advancedButton=document.createElement('button');advancedButton.id='builder-advanced';advancedButton.type='button';advancedButton.className='builder-tool';ui(advancedButton,()=>tr("builder.rdkitMode",'RDKit mode'));advancedButton.setAttribute('aria-pressed','false');attr(advancedButton,'title',()=>tr("builder.rdkitTitle",'Use authoritative toolkit chemistry, including ions and disconnected salts (requires the local server)'));
  advancedButton.addEventListener('click',()=>attempt(()=>apply(M.toAdvanced(draft))));
  $('builder-elements').append(moreElements,advancedButton);
  $('builder-charge').replaceChildren();
  [0,-1,1,-2,2,-3,3].forEach(q=>{const option=document.createElement('option');option.value=String(q);ui(option,()=>q?tr('builder.rdkitCharge','{charge} · RDKit formal charge',{charge:(q>0?'+':'')+q}):tr("builder.neutral",'Neutral'));$('builder-charge').append(option);});
  const scope=$('builder-panel').querySelector('.builder-scope');
  if(scope)ui(scope,()=>tr("builder.scope",'The neutral organic builder works offline. More elements, formal charges and imported mapped records use the local RDKit server. Imported fragments stay together as one record; legacy scene fragments remain separate. Canvas positions never assign stereochemistry.'));
  [1,2,3].forEach(o=>{
    const b=document.createElement('button');b.id='builder-order-'+o;b.type='button';b.className='builder-tool';b.dataset.sketchOrder=o;attr(b,'title',()=>tr("builder.bondTitle",'Drag between atoms, tap two atoms, or drop this tool on an existing bond'));b.setAttribute('aria-pressed','false');
    const mark=document.createElement('span');ui(mark,()=>o===1?'—':o===2?'=':'≡');mark.setAttribute('aria-hidden','true');const label=document.createElement('small');ui(label,()=>o===1?tr("builder.single",'Single'):o===2?tr("builder.double",'Double'):tr("builder.triple",'Triple'));b.append(mark,label);$('builder-bonds').append(b);paletteButton(b,'bond',o);
  });
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0||gesture||paletteDrag)return;e.preventDefault();svg.focus({preventScroll:true});message();
    const atom=e.target.closest('[data-atom]'), bond=e.target.closest('[data-bond-a]'),p=pointer(e);
    const i=atom?Number(atom.dataset.atom):-1;
    gesture={id:e.pointerId,start:p,last:p,atom:i,bond:bond?{a:Number(bond.dataset.bondA),b:Number(bond.dataset.bondB)}:null,before:draft,moved:false,oldAnchor:anchor};
    if(tool==='move'){
      selection=i>=0?{kind:'atom',i}:gesture.bond?{kind:'bond',...gesture.bond}:null;anchor=null;render();
    } else if(tool==='bond'&&i>=0){anchor=i;selection={kind:'atom',i};render();}
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove',e=>{
    const g=gesture;if(!g||g.id!==e.pointerId)return;
    const p=pointer(e);g.last=p;if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>5)g.moved=true;
    if(!g.moved)return;
    if(tool==='move'&&(g.atom>=0||g.bond)){
      const indices=g.atom>=0?[g.atom]:[g.bond.a,g.bond.b];
      let dx=(p.x-g.start.x)/camera.scale,dy=(p.y-g.start.y)/camera.scale;
      // Keep both bond endpoints on the canvas when moving them together.
      const coords=indices.map(i=>project(g.before.atoms[i]));
      dx=Math.max((28-Math.min(...coords.map(a=>a.x)))/camera.scale,Math.min(dx,(width-28-Math.max(...coords.map(a=>a.x)))/camera.scale));
      dy=Math.max((32-Math.min(...coords.map(a=>a.y)))/camera.scale,Math.min(dy,(height-32-Math.max(...coords.map(a=>a.y)))/camera.scale));
      let next=g.before;indices.forEach(i=>{const a=g.before.atoms[i];next=M.moveAtom(next,i,a.x+dx,a.y+dy);});draft=next;renderDrawing();
    } else if(tool==='bond'&&g.atom>=0){pendingLine=p;renderDrawing();}
  });
  function endGesture(e,cancelled){
    const g=gesture;if(!g||g.id!==e.pointerId)return;gesture=null;pendingLine=null;
    if(cancelled){draft=g.before;anchor=g.oldAnchor;render();return;}
    attempt(()=>{
      if(tool==='move'){
        if(g.moved&&(g.atom>=0||g.bond)){remember(g.before);analysis=identify();render();}
        return;
      }
      if(tool==='bond'&&g.atom>=0){
        const target=nearestAtom(pointer(e));
        if(g.moved){if(target>=0&&target!==g.atom)apply(M.setBond(draft,g.atom,target,order),null);else{anchor=g.atom;render();}return;}
        anchor=g.oldAnchor;activateAtom(g.atom);return;
      }
      if(g.moved){render();return;}
      if(g.atom>=0)activateAtom(g.atom);
      else if(g.bond)activateBond(g.bond.a,g.bond.b);
      else if(tool==='element')addAt(pointer(e));
      else if(tool==='ring')stampRing(pointer(e));
      else {anchor=null;selection=null;render();}
    });
    // Always remove the preview even if a valence check rejected the bond.
    renderDrawing();
  }
  svg.addEventListener('pointerup',e=>endGesture(e,false));svg.addEventListener('pointercancel',e=>endGesture(e,true));
  svg.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)endGesture(e,true);});
  svg.addEventListener('keydown',e=>{
    const atom=e.target.closest('[data-atom]'),bond=e.target.closest('[data-bond-a]');
    if(e.key==='Enter'||e.key===' '){e.preventDefault();attempt(()=>{
      if(atom)activateAtom(Number(atom.dataset.atom));else if(bond)activateBond(Number(bond.dataset.bondA),Number(bond.dataset.bondB));
      else if(tool==='ring')stampRing({x:width/2,y:height/2});
      else if(tool==='element'){const p={x:width/2,y:height/2};if(nearestAtom(p)>=0){p.x+=70;p.y+=60;}addAt(p);}
    });return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&tool==='move'){
      const i=atom?Number(atom.dataset.atom):selection?.kind==='atom'?selection.i:-1;if(i<0)return;e.preventDefault();
      attempt(()=>{const a=project(draft.atoms[i]),step=e.shiftKey?25:8;a.x+=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;a.y+=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;const p=worldPoint(a);apply(M.moveAtom(draft,i,p.x,p.y),{kind:'atom',i});});
    }
  });
  $('builder-panel').addEventListener('keydown',e=>{
    if(e.target.matches('input,select,textarea'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);}
    else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();const a=e.target.closest('[data-atom]'),b=e.target.closest('[data-bond-a]');if(a)selection={kind:'atom',i:Number(a.dataset.atom)};else if(b)selection={kind:'bond',a:Number(b.dataset.bondA),b:Number(b.dataset.bondB)};attempt(deleteSelection);}
    else if(e.key==='Escape'){anchor=null;pendingLine=null;setTool('move');}
  });
  $('show-builder').addEventListener('click',()=>attempt(()=>showBuilder()));
  $('show-explorer').addEventListener('click',showExplorer);
  $('edit-in-builder').addEventListener('click',()=>attempt(()=>{if(app.state.selected)showBuilder(app.state.selected);}));
  $('builder-load-selected').addEventListener('click',()=>attempt(()=>{if(!app.state.selected)throw Error('Select a structure in the viewer first.');loadStructure(app.state.selected);}));
  $('builder-example').addEventListener('change',()=>{const name=$('builder-example').value;if(name)attempt(()=>loadStructure(Chem.resolveName(name),true));$('builder-example').value='';});
  $('builder-move').addEventListener('click',()=>setTool('move'));$('builder-erase').addEventListener('click',()=>setTool('erase'));
  $('builder-fit').addEventListener('click',()=>{fitDrawing();renderDrawing();});
  $('builder-undo').addEventListener('click',()=>undo());$('builder-redo').addEventListener('click',()=>undo(true));
  $('builder-clear').addEventListener('click',()=>{apply(M.empty(draft.engine),null);message(()=>(tr("builder.cleared",'Canvas cleared. Undo restores your drawing.')));});
  $('builder-delete').addEventListener('click',()=>attempt(deleteSelection));
  $('builder-grow').addEventListener('click',()=>attempt(attachAtom));
  $('builder-replace-element').addEventListener('change',()=>{
    attempt(()=>{if(selection?.kind==='atom'){const e=$('builder-replace-element').value;apply(M.setElement(draftForElement(e),selection.i,e));}});updateSelection();
  });
  $('builder-change-order').addEventListener('change',()=>{
    attempt(()=>{if(selection?.kind==='bond')apply(M.setBond(draft,selection.a,selection.b,Number($('builder-change-order').value)));});updateSelection();
  });
  async function openViewer(mode='3d',all=false){
    let records;
    if(isAdvanced()){
      const snapshot=M.checked(draft), exact=JSON.stringify(snapshot), signature=M.chemicalSignature(snapshot);
      if(!snapshot.atoms.length)throw Error('Add an atom before opening the viewer.');
      cancelAnalysis();const requestRevision=revision,controller=analysisController=new AbortController();
      analysis=advancedScene(pendingResult('Validating the latest draft and its layout with RDKit…',true));message();render();
      try{
        const result=await parseDraft(snapshot,controller.signal);
        if(requestRevision!==revision||controller.signal.aborted)return;
        if(JSON.stringify(draft)!==exact){analysis=identify();render();return;}
        cacheResult(signature,result);analysis=advancedScene(result);render();records=[result.structure];
      }catch(error){
        if(requestRevision!==revision||controller.signal.aborted)return;
        analysis=advancedScene(pendingResult(error.message));render();throw error;
      }finally{if(analysisController===controller)analysisController=null;}
    }else{
      if(!analysis.valid)throw Error(analysis.message);
      if(all&&!scene.valid)throw Error('Complete or delete the unfinished fragments first.');
      records=all?scene.components.map(c=>c.structure):[analysis.structure];
    }
    app.loadStructures(records,'Molecule builder');
    if(records[0]?.schema==='bond-atlas/3')window.StereoExplorer?.setMolecules?.(records,{sync:false});
    showExplorer();app.setMode(mode);app.setElectrons($('builder-clouds').checked,$('builder-lone-pairs').checked);
    if(all)app.setTogether(true);
    return records;
  }
  $('builder-open-viewer').addEventListener('click',()=>attempt(()=>openViewer()));
  $('builder-open-all').addEventListener('click',()=>attempt(()=>openViewer('3d',true)));
  $('builder-to-fischer').addEventListener('click',()=>attempt(()=>openViewer('fischer')));
  $('builder-to-newman').addEventListener('click',()=>attempt(()=>openViewer('newman')));
  $('builder-component').addEventListener('change',()=>{activeComponent=Number($('builder-component').value);selection=null;render();});
  $('builder-charge').addEventListener('change',()=>{attempt(()=>{if(selection?.kind==='atom'){const charge=Number($('builder-charge').value);apply(M.setCharge(charge?M.toAdvanced(draft):draft,selection.i,charge));}});updateSelection();});
  $('builder-lone-pairs').addEventListener('change',renderDrawing);
  $('builder-ideal').addEventListener('click',()=>attempt(tidyAngles));
  new ResizeObserver(()=>{if(!$('builder-panel').hidden&&initialized){fitDrawing();renderDrawing();}}).observe(svg);
  window.MoleculeBuilder={showBuilder,showExplorer,loadStructure,openViewer,getDraft:()=>M.checked(draft)};
})();
