/* Two parent vessels supply the components; each child collects one isolated product. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById('plate-'+id);
  const {stock, conditions, run} = root.PlateChemistry;
  const stocks = new Map(stock.map(s => [s.id,s]));
  const rack = new Map(), stockRecords = new Map(), limit = 48;
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
    $('load').disabled=!!pending || rack.size+2>limit;
    $('create').disabled=$('collect').disabled=!!pending || rack.size>=limit;
    $('preview').disabled=!!pending || rack.size<2 || $('left').value===$('right').value;
  }
  async function work(message, prepare, commit) {
    if(pending || !active) return;
    const task=pending=new AbortController(); controls(); status(message);
    try { const data=await prepare(task.signal); if(pending===task && !task.signal.aborted) commit(data); }
    catch(error) { if(!task.signal.aborted) status(error.message || 'Could not prepare this structure.'); }
    finally { if(pending===task) pending=null; controls(); }
  }
  function add(p) { p.id=String(++serial); rack.set(p.id,p); return p; }
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
  function render(left=$('left').value, right=$('right').value) {
    const plates=Array.from(rack.values()); $('count').textContent=`${plates.length} / ${limit}`;
    const cards=plates.map(p=>{
      const li=document.createElement('li'); li.dataset.plate=p.id;
      li.append(element('strong',title(p)),element('p',[p.role, p.medium?stocks.get(p.medium).label+' medium':'no added solvent',p.catalyst?stocks.get(p.catalyst).label+' catalyst':null].filter(Boolean).join(' · ')));
      if(p.origin && p.origin.length<=120) li.append(element('p',p.origin));
      if(p.record?.notation?.length>48 || p.origin?.length>120){
        const more=document.createElement('details');more.append(element('summary','Structure details'));
        if(p.record?.notation)more.append(element('code',p.record.notation));if(p.origin?.length>120)more.append(element('p',p.origin));li.append(more);
      }
      const view=button('Inspect',()=>inspect(p)),remove=button('Remove',()=>{cancel(); clearOutcome(); if(inspecting===p) resetInspection(); rack.delete(p.id); render(); status(`Removed P${p.id}. Other plates are unchanged.`); $('stock').focus();});
      view.setAttribute('aria-label','Inspect '+title(p));remove.setAttribute('aria-label','Remove '+title(p));li.append(view,remove);return li;
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
      clearOutcome(); render(a.id,b.id); $('condition').value=condition; status(`Prepared P${a.id} and P${b.id}. Check pathways to compare outcomes.`);
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
      clearOutcome(); render(rack.size===1?p.id:$('left').value,p.id); status(`Created ${title(p)}.`);
    });
  });
  for(const id of ['left','right','condition']) $(id).addEventListener('change',()=>{
    cancel(); clearOutcome(); controls(); status($('left').value===$('right').value?'Choose two different plates.':'Setup changed. Check pathways again.');
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
    const v=outcome.alternatives[Number($('branch').value)], left=$('left').value,right=$('right').value;
    const origin=`From P${left} + P${right} · ${outcome.label} · ${$('condition').selectedOptions[0].textContent} · ${v.label}`;
    if(v.prepared){const p=add({...v.prepared,origin});render(left,right);status(`Created prepared plate P${p.id}. Choose it alongside a substrate.`);return;}
    work('Checking the selected product…',signal=>root.ReactionInput.parse('smiles:'+v.productSmiles,{signal}),record=>{
      const p=add({role:'substrate',record,label:labelFor(record,v.productSmiles),origin});
      render(left,right); status(`Created ${title(p)}. Its parents are unchanged. Select it as a substrate for a later reaction.`);
    });
  });
  $('component').addEventListener('change',inspectComponent); $('close-view').addEventListener('click',()=>{const id=inspecting?.id;resetInspection(); $('rack').querySelector(`[data-plate="${id}"] button`)?.focus();});
  function suspend() { cancel(); resetInspection(); }
  $('lab').addEventListener('toggle',()=>{if(!$('lab').open) suspend();});
  root.ReactionPlates={setActive(on) { active=on; if(!on) suspend(); }};
})(window);
