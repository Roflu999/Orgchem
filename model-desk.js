/* Editable comparison rows. One scene owns the camera; each row owns its request. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id), I=root.AtlasI18n, input=root.ModelInput;
  const rows=[], cache=new Map(), maxRows=8, maxJobs=2;
  let stage,active=false,mode='2d',nextId=1,running=0,lastDraw=null,webglError=false;
  const past=[], future=[], historyLimit=32;
  let typing=null, editing=null;
  const text=(el,key,params={})=>I.bindText(el,key,params);
  const fmt=n=>n.toLocaleString(I.locale,{maximumFractionDigits:2,minimumFractionDigits:2});
  function element(tag,cls){const el=document.createElement(tag);if(cls)el.className=cls;return el;}
  function button(key,handler){const b=element('button');b.type='button';text(b,key);b.addEventListener('click',handler);return b;}
  function cancel(row){clearTimeout(row.timer);row.timer=null;row.controller?.abort();row.controller=null;row.queued=false;}
  function invalidate(row){cancel(row);row.result=null;row.bondIndex=0;row.measured=null;}
  function schedule(row,delay){
    if(!active||!row.visible||!row.value||row.result||row.controller||row.timer||row.queued)return;
    if(mode==='2d'&&row.preview)return;
    row.timer=setTimeout(()=>{row.timer=null;row.queued=true;pump();},delay);
  }
  function pump(){
    if(!active)return;
    for(const row of rows){
      if(running>=maxJobs)break;
      if(!row.queued)continue;
      row.queued=false;
      const key=row.value;
      if(cache.has(key)){row.result=cache.get(key);update(row);continue;}
      const c=row.controller=new AbortController();running++;
      Promise.resolve().then(()=>input.resolve(key,{signal:c.signal})).then(result=>{
        if(c.signal.aborted||row.controller!==c)return;
        row.result=result;
        if(result.geometry){cache.set(key,result);if(cache.size>16)cache.delete(cache.keys().next().value);}
      }).catch(()=>{if(!c.signal.aborted&&row.controller===c)row.result={record:row.preview,geometry:null,reason:'parse-failed'};}).finally(()=>{
        running--;
        if(row.controller===c){row.controller=null;update(row);}
        pump();draw();
      });
      update(row);
    }
    draw();
  }
  function updateMeasure(row){
    const g=row.result?.geometry, b=g?.bonds[row.bondIndex];
    row.length.textContent=b?fmt(input.bondLength(g,b.a,b.b))+' Å':'';
  }
  function update(row){
    const result=row.result, record=result?.record||row.preview, g=result?.geometry;
    const key=!row.value?'entry':!row.visible?'hidden':row.controller||row.timer||row.queued?'working':result?.reason||(!record?'working':g?'ready':'sketch');
    text(row.status,'models.'+key);
    row.formula.textContent=record?.formula?root.MoleculeRecords.prettyFormula(record.formula):'';
    row.retry.hidden=!row.visible||!['offline','parse-failed','no-conformer'].includes(result?.reason)||(mode==='2d'&&!!row.preview);
    text(row.toggle,row.visible?'models.hide':'models.show');
    row.toggle.setAttribute('aria-pressed',String(row.visible));row.el.dataset.visible=String(row.visible);
    row.editAtoms.disabled=!record||record.atoms.length>256||record.bonds.length>512;
    row.measures.hidden=!g;
    if(g&&row.measured!==g){
      row.measured=g;row.span=input.size(g);row.bonds.replaceChildren();
      g.bonds.forEach((b,i)=>{const opt=element('option');opt.value=String(i);opt.textContent=g.atoms[b.a].e+(b.a+1)+' – '+g.atoms[b.b].e+(b.b+1);row.bonds.append(opt);});
      row.bonds.value=String(row.bondIndex);row.bondLine.hidden=!g.bonds.length;
    }
    if(g){text(row.extent,'models.span',()=>({value:fmt(row.span)}));updateMeasure(row);}
  }
  function draw(force=false){
    if(!active)return;
    const entries=[];
    for(const row of rows){const record=row.result?.record||row.preview,geometry=row.result?.geometry;if(row.visible&&record&&(mode==='2d'||geometry))entries.push({id:row.id,record,geometry});}
    const benzene=mode==='2d'&&entries.some(e=>root.BenzeneView.matches(e.record));
    $('desk-benz-wrap').hidden=$('desk-benz-note').hidden=!benzene;
    if(benzene)text($('desk-benz-note'),'benz.note.'+$('desk-benz').value);
    const same=lastDraw&&lastDraw.mode===mode&&entries.length===lastDraw.entries.length&&entries.every((e,i)=>e.id===lastDraw.entries[i].id&&e.record===lastDraw.entries[i].record&&e.geometry===lastDraw.entries[i].geometry);
    if(force||!same){
      if(mode==='3d'&&entries.length){
        try{stage.draw3D(entries);}catch(err){console.warn('Model workspace 3D:',err);setMode('2d',true);return;}
      }else stage.draw2D(entries,$('desk-benz').value);
      lastDraw={mode,entries};
    }
    text($('desk-status'),!entries.length?'models.noModels':webglError?'models.noWebgl':'models.count',{count:entries.length});
  }
  function setValue(row,raw){
    row.raw=raw;if(row.field.value!==raw)row.field.value=raw;
    const key=raw.trim();if(key===row.value)return;
    invalidate(row);row.value=key;row.preview=null;
    if(key){try{row.preview=input.preview(key);}catch{/* Incomplete input is normal while typing. */}}
    if(cache.has(key))row.result=cache.get(key);
  }
  function edit(row,value,group=false){
    if(value===row.raw)return;
    if(!group||typing!==row)checkpoint();
    typing=group?row:null;
    setValue(row,value);schedule(row,350);update(row);draw();
  }
  function setMode(next,fallback=false){
    mode=next;webglError=fallback;
    for(const m of ['2d','3d'])$('desk-'+m).setAttribute('aria-pressed',String(m===mode));
    text($('desk-caption'),mode==='3d'?'models.scale':'models.schematic');
    for(const row of rows){if(mode==='2d'&&row.preview)cancel(row);else schedule(row,0);update(row);}
    draw();
  }
  function listControls(){
    const count=rows.filter(r=>r.pick.checked).length, all=$('desk-all');
    all.checked=!!rows.length&&count===rows.length;all.indeterminate=count>0&&count<rows.length;all.disabled=!rows.length;
    const remove=$('desk-remove-picked');remove.disabled=!count;text(remove,'models.removePicked',{n:count});
    historyControls();
    const full=rows.length>=maxRows;$('desk-add').disabled=full;
    for(const r of rows)r.duplicate.disabled=full;
  }
  // Store user inputs and row identity, never a pending request or a historical measurement.
  const snapshot=()=>rows.map(row=>({row,raw:row.raw,visible:row.visible}));
  function historyControls(){
    $('desk-undo').disabled=!past.length;$('desk-redo').disabled=!future.length;
  }
  function checkpoint(){
    past.push(snapshot());if(past.length>historyLimit)past.shift();
    future.length=0;typing=null;historyControls();
  }
  function detach(row){cancel(row);row.pick.checked=false;row.el.remove();}
  function removeRows(items){
    if(!items.length)return;
    checkpoint();const first=rows.indexOf(items[0]);
    for(const r of items){detach(r);rows.splice(rows.indexOf(r),1);}
    listControls();draw();(rows[first]?.field||rows[first-1]?.field||$('desk-undo')).focus();
  }
  function travel(redo){
    const from=redo?future:past,to=redo?past:future;
    if(!from.length)return;
    const target=from.pop(),list=$('desk-rows');to.push(snapshot());typing=null;
    const keep=new Set(target.map(s=>s.row));
    for(const row of rows)if(!keep.has(row))detach(row);
    rows.splice(0,rows.length,...keep);
    for(const [i,{row,raw,visible}] of target.entries()){
      if(list.children[i]!==row.el){list.insertBefore(row.el,list.children[i]||null);I.apply(row.el);}
      row.visible=visible;if(!visible)cancel(row);
      if(row.raw!==raw)setValue(row,raw);
      schedule(row,0);update(row);
    }
    listControls();draw();
    const repeat=redo?'desk-redo':'desk-undo',opposite=redo?'desk-undo':'desk-redo';
    $(from.length?repeat:opposite).focus();
  }
  function updateApply(){
    if(!editing)return;
    const value=root.MoleculeBuilder.getDeskNotation();
    text($('desk-apply'),value===''?'models.applyEmpty':'models.applyEdit',{n:editing.id});
    $('desk-apply').disabled=value==null||value.length>4000;
  }
  function openEditor(row){
    const record=row.result?.record||row.preview;if(!record)return;
    // Load before navigation so a record the sketcher cannot import leaves the desk intact.
    try{root.MoleculeBuilder.loadStructure(record);}
    catch(e){row.status.textContent=e.message;return;}
    editing=row;$('desk-edit-actions').hidden=false;
    root.MoleculeBuilder.showBuilder();updateApply();$('builder-canvas').focus();
  }
  function finishEditing(apply){
    const row=editing;if(!row)return;
    const value=apply?root.MoleculeBuilder.getDeskNotation():null;
    if(apply&&(value==null||value.length>4000))return;
    const original=(row.result?.record||row.preview)?.notation;
    if(apply&&value&&value!==original){row.field.value=value;edit(row,value);}
    root.BondAtlas.showView('models');
    if(apply&&value==='')removeRows([row]);else row.editAtoms.disabled?row.field.focus():row.editAtoms.focus();
  }
  function add(value='',after=null,focus=true){
    if(rows.length>=maxRows)return;
    if(focus)checkpoint(); // The initial example is not a user edit.
    const row={id:nextId++,visible:true,el:element('li','desk-row'),value:'',preview:null,result:null,bondIndex:0};
    const idx=after?rows.indexOf(after)+1:rows.length;rows.splice(idx,0,row);
    const head=element('div','row-head'),num=element('label','row-number'),field=row.field=element('input'),formula=row.formula=element('bdi','row-formula');
    num.textContent=String(row.id).padStart(2,'0');field.id='desk-input-'+row.id;num.htmlFor=field.id;field.maxLength=4000;field.autocomplete='off';field.spellcheck=false;field.dir='ltr';field.value=value;
    I.bindAttr(field,'aria-label','models.row',{n:row.id});I.bindAttr(field,'placeholder','models.placeholder');
    const pickLabel=element('label','row-pick');row.pick=element('input');row.pick.type='checkbox';I.bindAttr(row.pick,'aria-label','models.selectRow',{n:row.id});row.pick.addEventListener('change',listControls);pickLabel.append(row.pick);
    head.append(num,field,pickLabel);field.addEventListener('input',()=>edit(row,field.value,true));
    field.addEventListener('blur',()=>{if(typing===row)typing=null;});
    field.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing)typing=null;});
    const meta=element('div','row-meta');row.status=element('span');row.status.setAttribute('role','status');meta.append(formula,row.status);
    const bar=element('div','row-actions');
    row.toggle=button('models.hide',()=>{checkpoint();row.visible=!row.visible;if(!row.visible)cancel(row);else schedule(row,0);update(row);draw();});
    row.duplicate=button('models.duplicate',()=>add(row.field.value,row));
    row.editAtoms=button('models.editAtoms',()=>openEditor(row));
    const remove=button('models.remove',()=>removeRows([row]));
    row.retry=button('models.retry',()=>{invalidate(row);schedule(row,0);update(row);draw();});bar.append(row.toggle,row.duplicate,row.editAtoms,remove,row.retry);
    row.measures=element('details','row-measures');const summary=element('summary');text(summary,'models.measure');row.extent=element('p');row.bondLine=element('label');const bondName=element('span');text(bondName,'models.bond');row.bonds=element('select');row.length=element('output');row.bondLine.append(bondName,row.bonds,row.length);row.bonds.addEventListener('change',()=>{row.bondIndex=Number(row.bonds.value);updateMeasure(row);});row.measures.append(summary,row.extent,row.bondLine);
    row.el.append(head,meta,bar,row.measures);$('desk-rows').insertBefore(row.el,rows[idx+1]?.el||null);setValue(row,value);schedule(row,350);update(row);draw();listControls();if(focus){field.focus();field.select();}
  }
  function setActive(on){
    if(editing&&root.BondAtlas.state.labView!=='builder'){editing=null;$('desk-edit-actions').hidden=true;}
    if(active===on)return;active=on;
    if(!on){for(const row of rows)cancel(row);lastDraw=null;return;}
    if(!stage){stage=root.ModelStage.create($('desk-stage'));add('ethanol',null,false);}
    setMode(mode);
  }
  $('desk-stage').addEventListener('modelstageerror',()=>{if(active&&mode==='3d'){setMode('2d',true);}});
  $('desk-add').addEventListener('click',()=>add());$('desk-2d').addEventListener('click',()=>setMode('2d'));$('desk-3d').addEventListener('click',()=>setMode('3d'));
  $('desk-fit').addEventListener('click',()=>stage.fit());$('desk-in').addEventListener('click',()=>stage.zoom(1.2));$('desk-out').addEventListener('click',()=>stage.zoom(1/1.2));
  document.addEventListener('atlas:localechange',()=>{for(const row of rows)updateMeasure(row);});
  const themeChange=()=>draw(true);new MutationObserver(themeChange).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-contrast']});matchMedia('(prefers-color-scheme: dark)').addEventListener('change',themeChange);
  $('desk-all').addEventListener('change',e=>{for(const r of rows)r.pick.checked=e.target.checked;listControls();});
  $('desk-remove-picked').addEventListener('click',()=>removeRows(rows.filter(r=>r.pick.checked)));
  $('desk-undo').addEventListener('click',()=>travel(false));$('desk-redo').addEventListener('click',()=>travel(true));
  $('model-desk').addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.isComposing||e.altKey||!(e.ctrlKey||e.metaKey)||e.target.closest('input:not([type="checkbox"]),textarea,select,[contenteditable]'))return;
    const key=e.key.toLowerCase(),redo=key==='y'||(key==='z'&&e.shiftKey);
    if((key==='z'||key==='y')&&(redo?future:past).length){e.preventDefault();travel(redo);}
  });
  $('desk-apply').addEventListener('click',()=>finishEditing(true));$('desk-discard').addEventListener('click',()=>finishEditing(false));
  I.bindAttr($('desk-add'),'title','models.limit',{max:maxRows});
  root.BenzeneView.setup($('desk-benz'),()=>draw(true));
  root.ModelDesk={setActive,updateApply};setActive(root.BondAtlas.state.labView==='models');
})(window);
