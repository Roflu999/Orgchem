/* Same functional-group match powers suggested reagents, examples and custom inputs. */
(function(root){
  'use strict';
  const $=id=>document.getElementById('rx-'+id), {entries,match}=root.ReactionLibrary;
  const options=new Map(entries.map(e=>[e.id,e])), reagents=[...new Set(entries.map(e=>e.reagent))];
  let record,results,entry,result,frames=[],index=0,active=false,started=false,timer=null,stage,productRequest=null;
  let lesson=null, parseRequest=null, parseTimer, inspector, inspectedRecord, inspectedAtom;
  function cancelParse(){clearTimeout(parseTimer);parseRequest?.abort();parseRequest=null;}
  function inspect(){
    const on=active && $('inspect-details').open && record;
    if(!on){inspector?.clear();inspectedRecord=null;return;}
    const site=result?.siteChoices?.[Number($('equivalent').value)||0], atom=site?.betaCarbon??site?.carbon??site?.protonatedCarbon;
    if(inspectedRecord===record && inspectedAtom===atom)return;
    inspectedRecord=record;inspectedAtom=atom;inspector??=root.PlateViewer.mount($('inspect-view'));
    inspector.show(record,record.knownName?record.name:'Starting structure',atom?{atom:atom-1,label:'Selected reaction site'}:undefined);
  }
  $('inspect-details').addEventListener('toggle',inspect);
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
  function clearRun(message){
    stop();cancelDrawing();entry=result=null;frames=[];index=0;
    $('result').hidden=true;$('empty').hidden=false;text('empty',message);
    $('svg').replaceChildren();stage?.destroy();stage=null;$('structure').replaceChildren();text('products','');
    $('use-product').disabled=true;inspect();
  }
  const fits=()=>root.ReactionLibrary.pathways(results,$('reagent').value,$('setup').value);
  let mapOverview=false;
  $('map-toggle').addEventListener('click',()=>{mapOverview=!mapOverview;siteMap();});
  function siteMap(){
    inspect();
    if(!$('map-details').open||!result?.siteChoices?.length)return;
    root.ReactionLearningUI.drawSite(record,result.siteChoices[Number($('equivalent').value)||0],mapOverview);
  }
  function showChoices(variants,which){
    mapOverview=false;
    const menu=$('outcome'),sites=result.siteChoices||[];
    $('branches').hidden=!variants.length;menu.replaceChildren(...variants.map((v,i)=>option(String(i),root.ReactionLearningUI.outcomeLabel(v))));
    menu.value=String(which);menu.disabled=variants.length<2;
    text('outcome-count',variants.length===1?'One modelled product pathway.':`${variants.length} possible product pathways. Choose one to trace it; order does not indicate yield.`);
    text('sites',result.sites||'');$('map-details').hidden=!sites.length;
    $('equivalent').replaceChildren(...sites.map((s,i)=>option(String(i),root.ReactionLearningUI.describeSite(s))));$('equivalent').disabled=sites.length<2;siteMap();
  }
  function otherSetups(){
    const container=$('other-setups'),all=[];
    for(const choice of root.ReactionLibrary.setupChoices(entry.reagent))for(const e of root.ReactionLibrary.pathways(results,entry.reagent,choice.id)){
      if(e.id===entry.id || all.some(item=>item.e.id===e.id))continue;all.push({e,choice});
    }
    container.replaceChildren();container.hidden=!all.length;
    if(!all.length)return;
    const label=document.createElement('strong');label.textContent='Compare another pathway with this reagent:';container.append(label);
    for(const {e,choice} of all){const b=document.createElement('button');b.type='button';b.className='plain-button';b.textContent=e.label+' · '+choice.label;
      b.addEventListener('click',()=>{$('setup').value=choice.id;prepare(e.id);$('heading').focus();});container.append(b);}
  }
  function pathway(which=0){
    const selected=fits().find(e=>e.id===$('path').value);
    if(!selected){
      let message='No pathway is modelled for this molecule, reagent and set of conditions. This does not rule out other chemistry.';
      if(record && $('setup').value==='dark' && !results.get('radical-chlorination')?.reason)message='No radical chain is initiated in this dark setup. Compare it with UV light, which can split the Cl–Cl bond.';
      if(options.get('oxidation-acid').reagent===$('reagent').value && results.get('oxidation-acid')?.reason==='tertiary-alcohol')message='No oxidation is expected under these syllabus conditions: the carbon bearing the OH group has no hydrogen to remove.';
      clearRun(message);return;
    }
    stop();cancelDrawing();entry=selected;const matched=results.get(entry.id),variants=matched.variants||[];
    result=variants[which]||matched;
    $('result').hidden=false;$('empty').hidden=true;showChoices(variants,which);lesson?.(entry);otherSetups();
    if(entry.id==='hydroxide-sn2')text('match','In aqueous solution, hydroxide acts as a nucleophile. These conditions favour substitution rather than guaranteeing a single product.');
    if(entry.id==='haloalkane-elimination')text('match','In hot ethanolic solution, hydroxide acts as a base and removes a hydrogen from an adjacent carbon. Substitution can still compete.');
    $('use-product').disabled=!result.productSmiles || result.productSmiles.length>$('substrate').maxLength || (!root.ChemistryClient?.available && !root.ModelInput.preview('smiles:'+result.productSmiles));
    frames=result.diagram?result.stages:[{title:'Reactants',scheme:record.notation+' + '+entry.reagent,detail:'Follow the reactive centre through the steps below.'},...result.stages,{title:'Products',scheme:result.products,detail:'The product shown is for this pathway; the scheme does not predict conversion or yield.'}];
    index=0;text('family',entry.section);text('heading',entry.label);text('products',result.products);paint();
  }
  function prepare(preferred){
    const compatible=fits(),menu=$('path');menu.replaceChildren(...compatible.map(e=>option(e.id,e.label)));menu.disabled=compatible.length<2;
    if(compatible.some(e=>e.id===preferred))menu.value=preferred;
    if(!compatible.length)menu.append(option('','—'));
    $('run').disabled=!record||!$('setup').value;
    text('match',compatible.length?`Matched group: ${results.get(menu.value).group}.`:'');
    clearRun(!record?'Enter a supported name or a simple neutral structure.':!$('setup').value?'Choose conditions to test with this reagent.':'Run the reaction to see the textbook outcome for this setup.');
    if(preferred)pathway();
  }
  function chooseReagent(preferred,previousSetup){
    const choices=root.ReactionLibrary.setupChoices($('reagent').value),menu=$('setup');
    menu.replaceChildren(option('','Choose conditions…'),...choices.map(c=>option(c.id,c.label)));
    menu.value=preferred?root.ReactionLibrary.exampleSetup(preferred):choices.some(c=>c.id===previousSetup)?previousSetup:'';
    prepare(preferred);
  }
  function populate(parsed,preferred){
    const oldReagent=$('reagent').value;record=parsed;results=match(record);text('formula-note',root.ReactionInput.formulaNote(record));
    const suggested=new Set(entries.filter(e=>results.has(e.id)&&!results.get(e.id).reason).map(e=>e.reagent));
    const menu=$('reagent');menu.replaceChildren();
    for(const [label,values] of [['Matched to this molecule',reagents.filter(r=>suggested.has(r))],['Other reagents',reagents.filter(r=>!suggested.has(r))]]){
      if(!values.length)continue;const group=document.createElement('optgroup');group.label=label;for(const r of values)group.append(option(r,r));menu.append(group);
    }
    menu.value=preferred?options.get(preferred).reagent:oldReagent||menu.options[0].value;chooseReagent(preferred,$('setup').value);
  }
  function analyse(preferred){
    cancelParse();const raw=$('substrate').value.trim();
    const quick=root.ModelInput.preview(raw==='c1ccccc1'?'C1=CC=CC=C1':raw);populate(quick,preferred);
    if(quick || !raw || !active)return;
    text('empty','Checking this structure with the chemistry service…');const request=parseRequest=new AbortController();
    parseTimer=setTimeout(async()=>{try{
      const parsed=await root.ReactionInput.parse(raw,{signal:request.signal});
      if(request!==parseRequest||!active)return;populate(parsed,preferred);
      if(![...results.values()].some(r=>!r.reason))text('empty','Structure available to inspect. No pathway in this guide matches it.');
    }catch(e){if(request===parseRequest)text('empty',e.message);}finally{if(parseRequest===request)parseRequest=null;}},300);
  }
  function openExample(id,input){$('substrate').value=input;analyse(id);$('heading').focus();}
  function init(){
    lesson=root.ReactionLearningUI.init(entries,openExample,()=>lesson?.(entry));
    analyse('hydroxide-sn2');started=true;
  }
  $('try-elimination').addEventListener('click',()=>openExample('haloalkane-elimination','CC(Br)CC'));
  $('try-oxidation').addEventListener('click',()=>openExample('oxidation-aldehyde','OCC(C)CCO'));
  $('outcome').addEventListener('change',()=>pathway(Number($('outcome').value)));
  $('equivalent').addEventListener('change',siteMap);$('map-details').addEventListener('toggle',siteMap);
  root.BenzeneView.setup($('benz'),()=>{stop();paint();});
  $('substrate').addEventListener('input',()=>analyse());$('reagent').addEventListener('change',()=>chooseReagent());$('setup').addEventListener('change',()=>prepare());$('path').addEventListener('change',()=>clearRun('Run the reaction to see this pathway.'));
  $('run').addEventListener('click',()=>pathway());
  $('use-product').addEventListener('click',()=>{if(!result?.productSmiles||$('use-product').disabled)return;$('substrate').value=result.productSmiles;analyse();$('reagent').focus();});
  $('next').addEventListener('click',()=>{stop();if(index<frames.length-1){index++;paint();}});
  $('prev').addEventListener('click',()=>{stop();if(index>0){index--;paint();}});
  $('play').addEventListener('click',()=>{if(timer!==null){stop();return;}if(!active||!result||root.AtlasPreferences.reducedMotion)return;if(index===frames.length-1){index=0;paint();}timer=setInterval(()=>{if(active&&index<frames.length-1){index++;paint();}else stop();},2400);playButton();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  document.addEventListener('atlas:preferenceschange',()=>{if(root.AtlasPreferences.reducedMotion)stop();else playButton();if(active&&result)paint();});
  root.ReagentDesk={setActive(on){if(active===on)return;active=on;root.ReactionPlates.setActive(on);if(!on){stop();cancelDrawing();cancelParse();inspect();}else if(!started)init();else if(!record)analyse();else{inspect();if(result)paint();}}};
})(window);
