/* Two parent vessels supply the components; each child collects one isolated product. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById('plate-'+id);
  const {stock, conditions, run} = root.PlateChemistry;
  const stocks = new Map(stock.map(s => [s.id,s]));
  const {limit,maxSerial} = root.PlateHistory;
  const rack = new Map(), stockRecords = new Map();
  const conditionNames = new Map(conditions.map(c => [c.id,c.label]));
  const changed = () => document.dispatchEvent(new Event('plate-bench-change'));
  let openComparison;
  // These describe supported rule families, not an inferred atom mapping.
  const explanations = new Map(Object.entries({
    'carbonyl-hydride':'At the selected carbonyl, C=O becomes C–OH: an aldehyde or ketone becomes an alcohol.',
    'alkene-hydrogenation':'The selected C=C becomes C–C as hydrogen adds across the double bond.',
    'nitrile-hydrogenation':'The nitrile carbon is retained: R–C≡N becomes R–CH₂NH₂.',
    'aldehyde-oxidation':'The aldehyde group becomes a carboxylic acid group.',
    'oxidation-ketone':'The secondary alcohol becomes a ketone. The carbon bearing OH now has a double bond to oxygen.',
    'oxidation-acid':'The primary alcohol oxidises through an aldehyde to a carboxylic acid. Reflux keeps the aldehyde in the mixture; excess oxidant drives the further oxidation.',
    'oxidation-aldehyde':'The primary alcohol group becomes an aldehyde group under distillation.',
    'hydroxide-sn2':'OH replaces the halogen on the selected carbon, forming an alcohol.',
    'haloalkane-elimination':'The halogen and a hydrogen on a neighbouring carbon are removed; a C=C forms between the two carbons.',
    'acyl-water':'The acyl chloride becomes a carboxylic acid: OH replaces Cl at the acyl carbon.',
    'acyl-ethanol':'An ethoxy group replaces Cl at the acyl carbon, forming an ethyl ester.',
    'radical-chlorination':'In the modelled first substitution, chlorine replaces one hydrogen on the alkane.'
  }));
  let serial = 0, pending, inspecting, inspection, viewer, outcome, active = false;
  const starters = [
    ['Reduce propanone to an alcohol','propanone','CC(=O)C','nabh4','water','ambient'],
    ['Hydrogenate propene','propene','CC=C','hydrogen','','heat','nickel'],
    ['Compare elimination products','2-bromobutane','CC(Br)CC','hydroxide','ethanol','reflux'],
    ['Substitute a halogen','bromoethane','CCBr','hydroxide','water','heat'],
    ['Reduce a nitrile to an amine','propanenitrile','CCC#N','hydrogen','','pressure','nickel'],
    ['Use water as a reactant','ethanoyl chloride','CC(=O)Cl','water','','ambient'],
    ['Explore methane under UV','methane','C','chlorine','','uv'],
    ['Reduce a cyclic ketone','cyclohexanone','O=C1CCCCC1','nabh4','water','ambient'],
    ['Distil ethanal from ethanol','ethanol','CCO','dichromate','water','distil'],
    ['Oxidise ethanol under reflux','ethanol','CCO','dichromate','water','reflux']
  ];
  function element(tag, text) { const n = document.createElement(tag); n.textContent = text; return n; }
  function option(value,text) { const n = element('option',text); n.value=value; return n; }
  function button(text, fn) { const n=element('button',text); n.type='button'; n.className='plain-button'; n.addEventListener('click',fn); return n; }
  const status = text => { $('status').textContent = text; };
  const title = p => `P${p.id} · ${p.label}`;
  const labelFor = (r,fallback) => {
    const label = r?.knownName ? r.name : (r?.notation || fallback);
    return label.length>48 && r?.formula ? `${r.formula} (${r.atoms.length} base atoms)` : label;
  };
  function clearOutcome() { outcome=null; $('outcomes').hidden=true; $('branch').replaceChildren(); $('explanation').textContent=''; }
  function cancel() { if(pending) { pending.abort(); pending=null; status('Setup changed. No plate was added.'); } controls(); }
  function controls() {
    $('load').disabled=!!pending || rack.size+2>limit || serial+2>maxSerial;
    $('create').disabled=$('collect').disabled=!!pending || rack.size>=limit || serial>=maxSerial;
    $('preview').disabled=!!pending || rack.size<2 || $('left').value===$('right').value;
  }
  async function work(message, prepare, commit) {
    if(pending || !active) return;
    const task=pending=new AbortController(); controls(); status(message);
    try { const data=await prepare(task.signal); if(pending===task && !task.signal.aborted) commit(data); }
    catch(error) { if(!task.signal.aborted) status(error.message || 'Could not prepare this structure.'); }
    finally { if(pending===task) pending=null; controls(); }
  }
  function add(p) {
    p.id=String(++serial);
    p.smiles=stocks.get(p.stockId)?.smiles || p.smiles || p.record.notation;
    rack.set(p.id,p); return p;
  }
  const snapshot = p => ({id:p.id,role:p.role,label:p.label,smiles:p.smiles,stockId:p.stockId || '',medium:p.medium || '',catalyst:p.catalyst || ''});
  const currentSetup = () => ({serial,left:$('left').value,right:$('right').value,condition:$('condition').value});
  function capture() {
    return root.PlateHistory.validate({...currentSetup(),plates:Array.from(rack.values(),p=>({...snapshot(p),history:p.history || null}))});
  }
  // Neither a saved workspace nor an undo checkpoint contains a pending task.
  function commitBench(plates,setup) {
    cancel(); resetInspection(); clearOutcome(); rack.clear();
    for(const p of plates) rack.set(p.id,p);
    serial=setup.serial;
    $('condition').value=setup.condition; render(setup.left,setup.right);
    $('left').value=setup.left; $('right').value=setup.right; controls();
    status(plates.length?`Restored ${plates.length} plate${plates.length===1?'':'s'}.`:'The plate rack is empty.');
  }
  function checkpoint() {
    const plates=Array.from(rack.values()), setup=currentSetup();
    return () => commitBench(plates,setup);
  }
  async function prepare(savedBench,{isCurrent=()=>true,signal}={}) {
    const bench=root.PlateHistory.validate(savedBench), records=new Map();
    const check=()=>{ if(signal?.aborted || !isCurrent()) throw new DOMException('Plate restore cancelled','AbortError'); };
    check();
    // Parse once per distinct non-stock structure, including deleted parents.
    // Sequential lookups avoid flooding the service; nothing touches the rack yet.
    for(const p of bench.plates) for(const s of [p,...(p.history?.parents || [])]) {
      if(s.stockId || records.has(s.smiles)) continue;
      const record=await root.ReactionInput.parse('smiles:'+s.smiles,{signal}); check();
      records.set(s.smiles,record);
    }
    const plates=bench.plates.map(p=>({...p,record:p.stockId?null:records.get(p.smiles)}));
    return () => commitBench(plates,bench);
  }
  function resetInspection() {
    inspection?.abort(); inspection=null; inspecting=null; viewer?.clear(); $('view-note').textContent=''; $('inspector').hidden=true;
  }
  function components(p) {
    const parts=[{role:p.role, stockId:p.stockId, record:p.record, label:p.label}];
    if(p.medium) parts.push({role:'solvent',stockId:p.medium,label:stocks.get(p.medium).label});
    if(p.catalyst) parts.push({role:'catalyst',stockId:p.catalyst,label:stocks.get(p.catalyst).label});
    return parts;
  }
  async function inspectComponent() {
    inspection?.abort(); const task=inspection=new AbortController(); viewer??=root.PlateViewer.mount($('view')); viewer.clear();
    const part=components(inspecting)[Number($('component').value)], item=stocks.get(part.stockId);
    $('view-note').textContent=item?.viewNote || '';
    try {
      let record=part.record || stockRecords.get(part.stockId);
      if(!record) { $('view-note').textContent='Loading structure…'; record=await root.ReactionInput.parse('smiles:'+item.smiles,{signal:task.signal}); }
      if(task.signal.aborted) return;
      if(item) stockRecords.set(item.id,record);
      $('view-note').textContent=item?.viewNote || ''; viewer.show(record,part.label);
    } catch(error) { if(!task.signal.aborted) $('view-note').textContent=[item?.viewNote,error.message].filter(Boolean).join(' '); }
  }
  function inspect(p) {
    inspecting=p; $('inspector').hidden=false; $('inspector-title').textContent='Inspect '+title(p);
    $('component').replaceChildren(...components(p).map((c,i)=>option(String(i),`${c.label} · ${c.role}`)));
    inspectComponent(); $('inspector-title').focus();
  }
  function closeComparison() {
    if(!openComparison) return;
    const {host,toggle}=openComparison; openComparison=null;
    root.PlateComparison.clear(host); toggle.setAttribute('aria-expanded','false');
  }
  function addHistory(li,p) {
    const h=p.history, ids=h.parents.map(s=>'P'+s.id).join(' + ');
    li.append(element('p',`From ${ids} · ${h.label} · ${conditionNames.get(h.condition)}`));
    const more=document.createElement('details'); more.append(element('summary','Plate history'));
    for(const s of h.parents) {
      const contents=[s.role,s.medium && stocks.get(s.medium).label+' medium',s.catalyst && stocks.get(s.catalyst).label+' catalyst'].filter(Boolean);
      more.append(element('p',title(s)+' · '+contents.join(' · ')),element('code',s.smiles));
    }
    more.append(element('p',`Selected pathway ${h.branch.index+1}: ${h.branch.label}`));
    if(h.branch.sites) more.append(element('p',h.branch.sites));
    li.append(more);
  }
  function addRoute(li,p) {
    const panel=document.createElement('details'), summary=element('summary','Trace route'), body=document.createElement('div');
    panel.className='plate-route'; summary.setAttribute('aria-label','Trace route for '+title(p));
    panel.append(summary,body); li.append(panel);
    panel.addEventListener('toggle',()=>{
      body.replaceChildren();
      if(!panel.open || !panel.isConnected) return;
      const {steps,missingEarlier}=root.PlateHistory.traceRoute(rack,p.id);
      if(missingEarlier) body.append(element('strong',`${title(steps[0].substrate)} (saved parent)`),
        element('p','Earlier steps are unavailable for this plate.'));
      const list=document.createElement('ol'); list.className='plate-route-steps';
      for(const {substrate,product,reagent,history,preparation} of steps) {
        const step=document.createElement('li'), detail=document.createElement('details');
        step.append(element('strong',`${title(substrate)} → ${title(product)}`),
          element('p',`Reagent: ${title(reagent)} · ${conditionNames.get(history.condition)}`),
          element('p',`${history.label} · Selected pathway ${history.branch.index+1}: ${history.branch.label}`));
        detail.append(element('summary','Step details'));
        for(const plate of [substrate,reagent]) {
          if(plate.medium) detail.append(element('p',`P${plate.id} medium: ${stocks.get(plate.medium).label}`));
          if(plate.catalyst) detail.append(element('p',`P${plate.id} catalyst: ${stocks.get(plate.catalyst).label}`));
        }
        if(preparation) detail.append(element('p',`Reagent preparation: ${preparation.parents.map(title).join(' + ')} · ${conditionNames.get(preparation.condition)} · ${preparation.branch.label}`));
        if(history.branch.sites) detail.append(element('p',history.branch.sites));
        detail.append(element('p',`Starting structure: ${substrate.smiles}`),element('p',`Product structure: ${product.smiles}`));
        step.append(detail); list.append(step);
      }
      body.append(list);
    });
  }
  function addComparison(li,p) {
    const before=p.history.parents.find(s=>s.role==='substrate'),host=document.createElement('div');
    host.id='plate-comparison-'+p.id;
    const toggle=button('Compare with starting molecule',()=>{
      const closing=openComparison?.host===host; closeComparison();
      if(closing) return;
      openComparison={host,toggle}; toggle.setAttribute('aria-expanded','true');
      const h=p.history, reagent=h.parents.find(s=>s.role==='reagent');
      const medium=reagent.medium || before.medium;
      const setup=[reagent.label, medium && stocks.get(medium).label+' medium',
        reagent.catalyst && stocks.get(reagent.catalyst).label+' catalyst', conditionNames.get(h.condition)];
      if(['oxidation-acid','aldehyde-oxidation'].includes(h.pathway)) setup.push('excess oxidant');
      root.PlateComparison.show(host,{label:before.label,smiles:before.smiles},{label:p.label,smiles:p.smiles},
        explanations.get(h.pathway),setup.filter(Boolean).join(' · '));
    });
    toggle.setAttribute('aria-label','Compare with starting molecule for '+title(p));toggle.setAttribute('aria-controls',host.id);
    toggle.setAttribute('aria-expanded','false'); li.append(toggle,host);
  }
  function addRouteComparison(li,p) {
    const forks=new Map();
    for(const candidate of rack.values()) {
      const fork=root.PlateHistory.routeFork(rack,p.id,candidate.id);
      if(fork) forks.set(candidate.id,fork);
    }
    if(!forks.size) return;
    const panel=document.createElement('details'), summary=element('summary','Compare routes');
    panel.className='plate-forks'; summary.setAttribute('aria-label','Compare routes for '+title(p));
    const label=element('label','Compare with '), picker=document.createElement('select');
    for(const [id,fork] of forks) picker.append(option(id,title(fork.right.endpoint)));
    label.append(picker);
    const facts=document.createElement('div'), drawings=document.createElement('div');
    function showFork() {
      if(!panel.open || !panel.isConnected) return;
      const {shared,left,right}=forks.get(picker.value);
      facts.replaceChildren(element('p','Shared starting plate: '+title(shared)));
      const captions=[left,right].map(({fork,endpoint},i)=>{
        const {reagent,substrate,history,product}=fork, side=`Route ${i+1}`;
        const medium=reagent.medium || substrate.medium;
        const setup=[title(reagent), medium && stocks.get(medium).label+' medium',
          reagent.catalyst && stocks.get(reagent.catalyst).label+' catalyst',conditionNames.get(history.condition)].filter(Boolean).join(' · ');
        facts.append(element('strong',`${side}: ${title(substrate)} → ${title(product)}`),
          element('p',`${setup} · ${history.label} · Selected pathway ${history.branch.index+1}: ${history.branch.label}`));
        if(history.branch.sites) facts.append(element('p',history.branch.sites));
        return {side:side+' endpoint',label:title(endpoint),smiles:endpoint.smiles,setup:'At the fork: '+setup};
      });
      const pathways=new Set([left.fork.history.pathway,right.fork.history.pathway]);
      const worked=(shared.smiles==='CCO' || shared.stockId==='ethanol') && pathways.has('oxidation-aldehyde') && pathways.has('oxidation-acid');
      root.PlateComparison.show(drawings,...captions,worked?'Distillation removes ethanal as it forms. Under reflux the aldehyde stays with excess oxidant and can oxidise further to ethanoic acid.':null);
    }
    panel.append(summary,label,facts,drawings); li.append(panel);
    picker.addEventListener('change',showFork);
    panel.addEventListener('toggle',()=>{ if(panel.open) showFork(); else {root.PlateComparison.clear(drawings); facts.replaceChildren();} });
    drawings.className='plate-fork-drawings';
  }
  function clearForkDrawings() {
    for(const host of $('rack').querySelectorAll('.plate-fork-drawings:not(:empty)')) root.PlateComparison.clear(host);
  }
  function render(left=$('left').value, right=$('right').value) {
    closeComparison(); clearForkDrawings();
    const plates=Array.from(rack.values()); $('count').textContent=`${plates.length} / ${limit}`;
    const cards=plates.map(p=>{
      const li=document.createElement('li'); li.dataset.plate=p.id;
      li.append(element('strong',title(p)),element('p',[p.role, p.medium?stocks.get(p.medium).label+' medium':'no added solvent',p.catalyst?stocks.get(p.catalyst).label+' catalyst':null].filter(Boolean).join(' · ')));
      if(p.history) addHistory(li,p);
      if(p.smiles.length>48){
        const more=document.createElement('details');more.append(element('summary','Structure details'),element('code',p.smiles));li.append(more);
      }
      const view=button('Inspect',()=>inspect(p)),remove=button('Remove',()=>{cancel(); clearOutcome(); if(inspecting===p) resetInspection(); rack.delete(p.id); render(); changed(); status(`Removed P${p.id}. Other plates are unchanged.`); $('stock').focus();});
      view.setAttribute('aria-label','Inspect '+title(p));remove.setAttribute('aria-label','Remove '+title(p));li.append(view,remove);
      if(p.history && p.role==='substrate') { addRoute(li,p); addComparison(li,p); addRouteComparison(li,p); }
      return li;
    });
    $('rack').replaceChildren(...cards);
    for(const id of ['left','right']) $(id).replaceChildren(...plates.map(p=>option(p.id,title(p))));
    $('left').value=rack.has(left)?left:plates[0]?.id || '';
    $('right').value=rack.has(right)&&right!== $('left').value ? right : plates.find(p=>p.id!==$('left').value)?.id || '';
    controls();
  }
  function updateRoles() {
    const item=stocks.get($('stock').value); $('input-wrap').hidden=!!item;
    const roles=item ? ['substrate','reagent','catalyst','solvent'].filter(r=>item.roles.includes(r)) : ['substrate','reagent','catalyst','solvent'];
    $('role').replaceChildren(...roles.map(r=>option(r,r))); if(item?.roles.includes('reagent')) $('role').value='reagent';
    updateCatalyst();
  }
  function updateCatalyst() { const no=$('role').value!=='reagent'; $('cat-wrap').hidden=no; if(no) $('catalyst').value=''; }
  $('starter').append(...starters.map(([name],i)=>option(String(i),name)));
  $('condition').append(...conditions.map(c=>option(c.id,c.label)));
  $('stock').append(option('custom','Custom structure'),...stock.map(s=>option(s.id,`${s.label} · ${s.formula}`)));
  $('catalyst').append(...stock.filter(s=>s.roles.includes('catalyst')).map(s=>option(s.id,s.label)));
  updateRoles(); render();
  $('load').addEventListener('click',()=>{
    const [,label,smiles,stockId,medium,condition,catalyst]=starters[Number($('starter').value)];
    work('Preparing the example pair…',signal=>root.ReactionInput.parse('smiles:'+smiles,{signal}),record=>{
      const a=add({label,role:'substrate',record}), b=add({label:stocks.get(stockId).label,role:'reagent',stockId,medium,catalyst});
      clearOutcome(); render(a.id,b.id); $('condition').value=condition; changed(); status(`Prepared P${a.id} and P${b.id}. Check pathways to compare outcomes.`);
    });
  });
  $('stock').addEventListener('change',updateRoles); $('role').addEventListener('change',updateCatalyst);
  $('form').addEventListener('input',cancel); $('form').addEventListener('change',cancel); $('starter').addEventListener('change',cancel);
  $('form').addEventListener('submit',e=>{
    e.preventDefault(); if(rack.size>=limit) return;
    let item=stocks.get($('stock').value); const raw=$('input').value.trim(),role=$('role').value, medium=$('medium').value, catalyst=$('catalyst').value;
    if(!item) item=stock.find(s=>s.formula===raw || s.label.toLowerCase()===raw.toLowerCase());
    if(item&&!item.roles.includes(role)) { status(`${item.label} cannot act as a ${role} in the supported pathways.`); return; }
    if(role==='solvent'&&medium) { status('A solvent plate does not need an added medium.'); return; }
    work('Preparing plate…',signal=>item?null:root.ReactionInput.parse(raw,{signal}),record=>{
      const known=item || stocks.get(root.PlateChemistry.stockIdentity(record));
      if(known&&!known.roles.includes(role)) {status(`${known.label} is not a ${role} in the supported pathways.`);return;}
      const p=add({role,medium,catalyst,record,stockId:known?.id,label:known?.label || labelFor(record,raw)});
      clearOutcome(); render(rack.size===1?p.id:$('left').value,p.id); changed(); status(`Created ${title(p)}.`);
    });
  });
  for(const id of ['left','right','condition']) $(id).addEventListener('change',()=>{
    cancel(); clearOutcome(); controls(); changed(); status($('left').value===$('right').value?'Choose two different plates.':'Setup changed. Check pathways again.');
  });
  $('preview').addEventListener('click',()=>{
    clearOutcome(); const a=rack.get($('left').value), b=rack.get($('right').value); if(!a||!b||a===b) return;
    const reg=[a,b].find(p=>p.role==='reagent'), aux=reg===a?b:a;
    if(reg && !aux.medium && !aux.catalyst && $('condition').value==='ambient') {
      const inMedium=aux.role==='solvent' && !reg.medium && (
        ['nabh4','hydroxide'].includes(reg.stockId) && ['water','ethanol'].includes(aux.stockId) ||
        reg.stockId==='dichromate' && aux.stockId==='water');
      const withNickel=aux.role==='catalyst' && aux.stockId==='nickel' && reg.stockId==='hydrogen' && !reg.catalyst && !reg.medium;
      if(inMedium||withNickel) {
        const detail=inMedium?`Prepare ${reg.label} in ${aux.label}.`:'Include the nickel catalyst with hydrogen for a later substrate plate.';
        present({ok:true,label:'Reagent preparation',detail:'Preparation only: no organic product is formed.',alternatives:[{label:detail,detail,prepared:{...reg,medium:inMedium?aux.stockId:reg.medium,catalyst:withNickel?aux.stockId:reg.catalyst}}]});return;
      }
    }
    const parts=[], solvents=new Set();
    for(const p of [a,b]) for(const c of components(p)) {
      if(c.role==='solvent'&&c.stockId) { if(solvents.has(c.stockId)) continue; solvents.add(c.stockId); }
      parts.push({id:String(parts.length),role:c.role,...(c.stockId?{stockId:c.stockId}:{record:c.record})});
    }
    const routes=run({plates:parts,condition:$('condition').value});
    if(routes.reason==='mapped-carbonyl') {
      const parent=parts.find(c=>c.role==='substrate').record;
      if(!root.ChemistryClient?.available || parent?.schema!=='bond-atlas/3') {status('This ring-containing substrate needs the local RDKit chemistry service.');return;}
      // Retain the mapped atom order, but do not post large SVG depictions or conformers.
      const {schema,atoms,atomIds,charges,hydrogens,molblock}=parent;
      work('Checking carbonyl sites on the ring-containing structure…',signal=>root.ChemistryClient.job('plate-carbonyl',{molecule:{schema,atoms,atomIds,charges,hydrogens,molblock}},{signal}),present);
    } else present(routes);
  });
  function present(routes){
    if(!routes.ok) {status(routes.detail); return;}
    outcome=routes; $('branch').replaceChildren(...routes.alternatives.map((r,i)=>option(String(i),r.label)));
    const isPrep=!!routes.alternatives[0].prepared; $('collect').textContent=isPrep?'Create prepared plate':'Create product plate';
    $('outcomes').hidden=false; describe(); if(isPrep){status(routes.detail);return;} status(`${routes.label} · ${routes.alternatives.length} modelled product pathway${routes.alternatives.length===1?'':'s'}. Order does not indicate yield.`);
  }
  function describe() {
    if(!outcome) return;
    const v=outcome.alternatives[Number($('branch').value)]; $('explanation').textContent=[...new Set([outcome.detail,v.detail,v.sites&&'Site: '+v.sites,v.productSmiles&&'Product: '+v.productSmiles].filter(Boolean))].join(' ');
  }
  $('branch').addEventListener('change',()=>{cancel(); describe();});
  $('collect').addEventListener('click',()=>{
    if(!outcome||rack.size>=limit) return;
    const index=Number($('branch').value), v=outcome.alternatives[index], left=$('left').value,right=$('right').value;
    const history={parents:[left,right].map(id=>snapshot(rack.get(id))),pathway:v.prepared?'reagent-preparation':outcome.ruleId,
      label:outcome.label,condition:$('condition').value,branch:{index,label:v.label,sites:v.sites || ''}};
    if(v.prepared){const p=add({...v.prepared,history});render(left,right);changed();status(`Created prepared plate P${p.id}. Choose it alongside a substrate.`);return;}
    work('Checking the selected product…',signal=>root.ReactionInput.parse('smiles:'+v.productSmiles,{signal}),record=>{
      const p=add({role:'substrate',record,smiles:v.productSmiles,label:labelFor(record,v.productSmiles),history});
      render(left,right); changed(); status(`Created ${title(p)}. Its parents are unchanged. Select it as a substrate for a later reaction.`);
    });
  });
  $('component').addEventListener('change',inspectComponent); $('close-view').addEventListener('click',()=>{const id=inspecting?.id;resetInspection(); $('rack').querySelector(`[data-plate="${id}"] button`)?.focus();});
  function suspend() {
    cancel(); resetInspection(); closeComparison();
    clearForkDrawings();
    for(const panel of $('rack').querySelectorAll('.plate-route[open],.plate-forks[open]')) panel.open=false;
  }
  $('lab').addEventListener('toggle',()=>{if(!$('lab').open) suspend();});
  root.ReactionPlates={capture,prepare,checkpoint,setActive(on) { active=on; if(!on) suspend(); }};
})(window);
