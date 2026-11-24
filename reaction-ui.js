/* Same functional-group match powers suggested reagents, examples and custom inputs. */
(function(root){
  'use strict';
  const $=id=>document.getElementById('rx-'+id), {entries,match}=root.ReactionLibrary;
  const options=new Map(entries.map(e=>[e.id,e])), reagents=[...new Set(entries.map(e=>e.reagent))];
  let record,results,entry,result,frames=[],index=0,active=false,started=false,timer=null,stage,productRequest=null;
  const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
  const text=(id,value)=>{$(id).textContent=value;};
  function playButton(){root.AtlasI18n.bindText($('play'),timer!==null?'rx.pause':'rx.play');$('play').disabled=root.AtlasPreferences.reducedMotion;}
  function stop(){clearInterval(timer);timer=null;playButton();}
  function cancelDrawing(){productRequest?.abort();productRequest=null;}
  function showStructure(r){
    $('structure').hidden=false;stage??=root.ModelStage.create($('structure'));stage.draw2D([{id:'reaction',record:r}],$('benz').value);
  }
  async function endpoint(smiles){
    if(!smiles)return;
    const local=root.ModelInput.preview('smiles:'+smiles);
    if(local){showStructure(local);text('legend','Main organic product · skeletal structure');return;}
    const client=root.ChemistryClient;if(!client)return;
    const request=productRequest=new AbortController();
    try{
      await client.ready;if(!client.available||request.signal.aborted)return;
      const parsed=await client.parse(smiles,'smiles',{signal:request.signal});
      if(request!==productRequest||request.signal.aborted||!active)return;
      const r=root.MoleculeRecords.validate(parsed.molecules[0]);showStructure(r);text('legend','Main organic product · skeletal structure');
    }catch{/* The explicit product equation remains available without a depiction. */}
  }
  function paint(){
    if(!result)return;
    cancelDrawing();const frame=frames[index],svg=$('svg');svg.replaceChildren();svg.style.height='';svg.style.width='';svg.hidden=true;$('structure').hidden=true;
    text('step-title',frame.title);text('equation',frame.scheme);text('detail',frame.detail);text('legend','');
    text('progress',`STEP ${index+1} / ${frames.length}`);$('prev').disabled=index===0;$('next').disabled=index===frames.length-1;
    const benzene=index===0&&root.BenzeneView.matches(record);
    $('benz-wrap').hidden=$('benz-note').hidden=!benzene;
    if(benzene)root.AtlasI18n.bindText($('benz-note'),'benz.note.'+$('benz').value);
    if(result.diagram){svg.hidden=false;root.ReactionDiagram.draw(svg,result.diagram,index);text('legend',index===1?'Full arrowhead = one electron pair':'Atom identities are retained between steps');}
    else if(index===0){showStructure(record);text('legend','Starting molecule · skeletal structure');}
    else if(index===frames.length-1){endpoint(result.productSmiles);}
    else if(root.ReactionMotifs.draw(svg,entry,frame,index-1)){svg.hidden=false;text('legend',entry.id==='radical-chlorination'?'Fishhook = one electron. AQA accepts balanced radical steps without fishhooks.':'Curly arrow = one electron pair. Read from the donating lone pair or bond to the receiving atom or bond.');}
    // SVG elements have no HTMLElement.hidden reflector in some browsers.
    svg.style.display=svg.hidden?'none':'block';
    if(index===frames.length-1)stop();
  }
  function pathway(){
    stop();cancelDrawing();entry=options.get($('path').value);result=entry&&results.get(entry.id);if(result?.reason)result=null;
    $('result').hidden=!result;$('empty').hidden=!!result;
    if(!result){text('empty',record?'No supported pathway for this pair. This does not mean there is no reaction. Try a suggested reagent or browse the examples.':'Enter a supported name or neutral structure. Charged, isotopic, stereo-specific and multi-fragment inputs are outside this matcher.');$('svg').replaceChildren();$('structure').replaceChildren();stage?.destroy();stage=null;text('products','');return;}
    frames=result.diagram?result.stages:[{title:'Reactants',scheme:record.notation+' + '+entry.reagent,detail:'Follow the reactive centre through the steps below.'},...result.stages,{title:'Products',scheme:result.products,detail:'The product shown is for this pathway; the scheme does not predict conversion or yield.'}];
    index=0;text('family',entry.section);text('heading',entry.label);text('products',result.products);paint();
  }
  function chooseReagent(preferred){
    const compatible=entries.filter(e=>e.reagent===$('reagent').value&&!results.get(e.id)?.reason&&results.has(e.id));
    const menu=$('path');menu.replaceChildren(...compatible.map(e=>option(e.id,e.label)));menu.disabled=compatible.length<2;
    if(compatible.some(e=>e.id===preferred))menu.value=preferred;
    if(!compatible.length)menu.append(option('','No supported pathway'));
    text('match',compatible.length?`Matched: ${[...new Set(compatible.map(e=>results.get(e.id).group))].join(' / ')}.${compatible.length>1?' Multiple pathways fit; conditions affect which predominates.':''}`:'');pathway();
  }
  function analyse(preferred){
    const raw=$('substrate').value.trim(),oldReagent=$('reagent').value;
    record=root.ModelInput.preview(raw==='c1ccccc1'?'C1=CC=CC=C1':raw);results=match(record);
    const suggested=new Set(entries.filter(e=>results.has(e.id)&&!results.get(e.id).reason).map(e=>e.reagent));
    const menu=$('reagent');menu.replaceChildren();
    for(const [label,values] of [['Matched to this molecule',reagents.filter(r=>suggested.has(r))],['Other reagents',reagents.filter(r=>!suggested.has(r))]]){
      if(!values.length)continue;const group=document.createElement('optgroup');group.label=label;for(const r of values)group.append(option(r,r));menu.append(group);
    }
    menu.value=preferred?options.get(preferred).reagent:suggested.has(oldReagent)?oldReagent:menu.options[0].value;chooseReagent(preferred);
  }
  function init(){
    const catalog=$('catalog-list');for(const family of new Set(entries.map(e=>e.section))){
      const h=document.createElement('h3');h.textContent=family;catalog.append(h);
      for(const e of entries.filter(e=>e.section===family)){
        const b=document.createElement('button');b.type='button';b.className='plain-button';b.textContent=e.label;b.dataset.example=e.id;
        b.addEventListener('click',()=>{$('substrate').value=e.example;analyse(e.id);$('catalog').open=false;$('reagent').focus();});catalog.append(b);
      }
    }
    analyse('hydroxide-sn2');started=true;
  }
  root.BenzeneView.setup($('benz'),()=>{stop();paint();});
  $('substrate').addEventListener('input',()=>analyse());$('reagent').addEventListener('change',()=>chooseReagent());$('path').addEventListener('change',pathway);
  $('next').addEventListener('click',()=>{stop();if(index<frames.length-1){index++;paint();}});
  $('prev').addEventListener('click',()=>{stop();if(index>0){index--;paint();}});
  $('play').addEventListener('click',()=>{if(timer!==null){stop();return;}if(!active||!result||root.AtlasPreferences.reducedMotion)return;if(index===frames.length-1){index=0;paint();}timer=setInterval(()=>{if(active&&index<frames.length-1){index++;paint();}else stop();},2400);playButton();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  document.addEventListener('atlas:preferenceschange',()=>{if(root.AtlasPreferences.reducedMotion)stop();else playButton();if(active&&result)paint();});
  root.ReagentDesk={setActive(on){if(active===on)return;active=on;if(!on){stop();cancelDrawing();}else if(!started)init();else if(result)paint();}};
})(window);
