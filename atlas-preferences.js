/* Per-viewer display preferences and keyboard access. No molecule data is persisted. */
(function(root){
  'use strict';
  const defaults=Object.freeze({language:'en',theme:'system',textSize:'normal',contrast:false,reduceMotion:false});
  const storageKey='bond-atlas.preferences.v1';
  function validate(raw){
    const value=raw&&typeof raw==='object'?raw:{};
    return {language:['en','es','fr','zh-Hans','ar','de'].includes(value.language)?value.language:'en',
      theme:['system','light','dark'].includes(value.theme)?value.theme:'system',
      textSize:['normal','large','xlarge'].includes(value.textSize)?value.textSize:'normal',
      contrast:value.contrast===true,reduceMotion:value.reduceMotion===true};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={validate,defaults};
  if(!root.document||!root.AtlasI18n)return;
  const doc=root.document,I=root.AtlasI18n,$=id=>doc.getElementById(id);
  let prefs={...defaults};try{prefs=validate(JSON.parse(root.localStorage.getItem(storageKey)));}catch(e){}
  const motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced=()=>prefs.reduceMotion||!!motion?.matches;
  function attribute(name,value){if(value===null){if(doc.documentElement.hasAttribute(name))doc.documentElement.removeAttribute(name);}else if(doc.documentElement.getAttribute(name)!==value)doc.documentElement.setAttribute(name,value);}
  function appearance(){
    attribute('data-theme',prefs.theme==='system'?null:prefs.theme);
    attribute('data-text-size',prefs.textSize);attribute('data-contrast',prefs.contrast?'high':'normal');attribute('data-motion',reduced()?'reduce':'full');
    if(reduced())root.BondAtlas?.stopRotation();
    const spin=$('rotate-button');if(spin){spin.disabled=reduced();spin.setAttribute('aria-disabled',String(reduced()));}
  }
  function save(){try{root.localStorage.setItem(storageKey,JSON.stringify(prefs));}catch(e){}}
  function announce(key){const region=$('accessibility-status');if(region)I.bindText(region,key);}
  function setLanguage(code){
    const regions=Array.from(doc.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).filter(el=>el.id!=='accessibility-status');
    const previous=regions.map(el=>[el,el.getAttribute('aria-live')]);regions.forEach(el=>el.setAttribute('aria-live','off'));
    I.setLocale(code);
    (root.requestAnimationFrame||setTimeout)(()=>{previous.forEach(([el,live])=>live===null?el.removeAttribute('aria-live'):el.setAttribute('aria-live',live));announce('prefs.languageChanged');});
  }
  function sync(){
    const map={theme:'preference-theme',textSize:'preference-text-size',contrast:'preference-contrast',reduceMotion:'preference-motion',language:'language-select'};
    Object.entries(map).forEach(([key,id])=>{const el=$(id);if(el){if(typeof prefs[key]==='boolean')el.checked=prefs[key];else el.value=prefs[key];}});
  }
  function update(key,value){
    const old=prefs;prefs=validate({...prefs,[key]:value});
    if(old.language!==prefs.language)setLanguage(prefs.language);else announce('prefs.saved');
    appearance();sync();save();
    doc.dispatchEvent(new CustomEvent('atlas:preferenceschange',{detail:{...prefs,reducedMotion:reduced()}}));
  }
  I.setLocale(prefs.language);appearance();
  root.AtlasPreferences={get value(){return {...prefs};},get reducedMotion(){return reduced();},set:update,reset(){prefs={...defaults};setLanguage('en');appearance();sync();save();}};
  motion?.addEventListener?.('change',appearance);

  // Bind explicitly named text leaves. Never replace a control or icon subtree.
  function label(element,key){
    if(!element)return;
    if(element.children.length){
      let span=element.querySelector(':scope > [data-ui-label]');
      if(!span){const texts=Array.from(element.childNodes).filter(n=>n.nodeType===3&&n.textContent.trim());if(!texts.length)return;span=doc.createElement('span');span.setAttribute('data-ui-label','');texts[0].replaceWith(span);texts.forEach(n=>span.append(n));}
      I.bindText(span,key);
    }else I.bindText(element,key);
  }
  function bindStatic(){
    const text={
      '.brand-kicker':'shell.brandKicker','.intro h1':'shell.heading','.intro p':'shell.intro','.local-note':'shell.labNote',
      '#show-explorer':'shell.explore','#show-stereo':'shell.stereo','#show-builder':'shell.build','#focus-viewer':'shell.focusViewer','#about-button':'shell.about',
      '#builder-title':'shell.buildTitle','.builder-heading p':'shell.buildIntro','#builder-load-selected':'shell.editSelected',
      '#builder-ring small':'shell.benzene','#builder-move':'shell.move','#builder-erase':'shell.erase','#builder-ideal':'shell.idealAngles','#builder-fit':'shell.fit',
      '#builder-undo':'shell.undo','#builder-redo':'shell.redo','#builder-clear':'shell.clear','#builder-delete':'shell.delete',
      '.builder-example-label':'shell.example','.builder-component-label':'shell.structure','#cancel-search':'shell.cancel','#clear-filter':'shell.showAll',
      '#stage-empty strong':'viewer.noMatches','#stage-empty > span':'viewer.tryFilter',
      '.builder-selection h3':'shell.selectedAtom','label[for="builder-replace-element"]':'shell.element','label[for="builder-charge"]':'shell.charge',
      'label[for="builder-change-order"]':'shell.bondOrder','.entry-left label':'shell.inputType','.entry-left .input-note':'shell.smilesHint',
      '.formula-field .field-label':'shell.formulaInput','.filter-field .field-label':'shell.functionalGroup','.examples-label':'shell.tryFormula',
      'label[for="structure-sort"]':'shell.sort','#sort-use-reference':'shell.compareReference',
      '.export-heading > span':'shell.exportHeading','.export-heading small':'shell.exportIntro','#preview-export':'shell.preview','#download-export':'shell.download',
      '#open-import':'shell.import','#import-title':'shell.importTitle','#import-dialog > .dialog-description':'shell.importIntro',
      'label[for="import-format"]':'shell.format','label[for="import-text"]':'shell.structureText','#import-dialog .dialog-actions .input-note':'shell.importHelp',
      '#export-title':'shell.exportTitle','label[for="export-text"]':'shell.exportText','#copy-export':'shell.copyText',
      '#tab-3d':'viewer.ballStick','#tab-skeletal':'viewer.skeletal','#tab-displayed':'viewer.displayed','#tab-condensed':'viewer.condensed','#tab-formula':'viewer.formula',
      '#hydrogen-button':'viewer.hydrogens','#labels-button':'viewer.labels','#cloud-button':'viewer.clouds','#pairs-button':'viewer.pairs','#together-button':'viewer.together',
      '#reset-button':'viewer.reset','#edit-in-builder':'viewer.edit','#copy-label':'viewer.copy','#explore-formula':'viewer.exploreFormula',
      '#tab-fischer':'viewer.fischer','#tab-newman':'viewer.newman',
      '#coverage > summary > span':'shell.scopeTitle','#technical-language-note':'shell.scopeNote','#structure-details > summary':'viewer.details'
    };
    Object.entries(text).forEach(([selector,key])=>label(doc.querySelector(selector),key));
    const options={
      '#input-mode option[value="auto"]':'shell.auto','#input-mode option[value="formula"]':'shell.formula','#input-mode option[value="name"]':'shell.name',
      '#import-format option[value="auto"]':'shell.auto','#import-format option[value="formula"]':'shell.formula',
      '#group-filter option[value="all"]':'shell.allGroups','#structure-sort option[value="reactivity"]':'shell.reactivity',
      '#structure-sort option[value="relationship"]':'shell.relationship','#structure-sort option[value="group"]':'shell.functionalGroup',
      '#structure-sort option[value="name"]':'shell.name','#structure-sort option[value="mass"]':'shell.mass',
      '#sort-direction option[value="asc"]':'shell.ascending','#sort-direction option[value="desc"]':'shell.descending',
      '#export-target option[value="selected"]':'shell.selectedStructure','#export-target option[value="filtered"]':'shell.allMatching','#export-target option[value="conformers"]':'shell.allConformers'
    };
    Object.entries(options).forEach(([selector,key])=>label(doc.querySelector(selector),key));
    doc.querySelectorAll('#group-filter option').forEach(option=>{if(option.value!=='all')I.bindText(option,'explorer.tag.'+option.value,{},option.textContent);});
    doc.querySelectorAll('.property dt,.builder-properties dt').forEach(el=>{
      const key={'Molar mass':'shell.mass','Total atoms':'shell.atoms','Unsaturation':'shell.unsaturation','Groups':'shell.groups','Bond orders':'viewer.bondOrders'}[el.textContent.trim()];
      if(key)I.bindText(el,key);
    });
    I.bindAttr($('export-target'),'aria-label','shell.structure');I.bindAttr($('export-format'),'aria-label','shell.exportFormat');
    I.bindAttr($('file-input'),'aria-label','shell.chooseFile');I.bindAttr($('close-import'),'aria-label','shell.closeImport');I.bindAttr($('close-export'),'aria-label','shell.closeExport');
    I.bindAttr($('main-content'),'aria-label','shell.mainLabel');I.bindAttr($('workspace'),'aria-label','shell.selectedStructure');
    I.bindAttr(doc.querySelector('.workbench'),'aria-label','shell.selectedStructure');I.bindAttr(doc.querySelector('.tabs'),'aria-label','viewer.representation');
    I.bindAttr($('element-legend'),'aria-label','viewer.elementKey');I.bindAttr($('molecule-text-connectivity'),'aria-label','prefs.graphTitle');
    I.bindAttr($('import-text'),'placeholder','shell.importPlaceholder');I.bindAttr($('import-text'),'aria-label','shell.structureText');I.bindAttr($('export-text'),'aria-label','shell.exportText');
    const lookup=$('name-consent')?.closest('details');if(lookup){label(lookup.querySelector('summary'),'viewer.lookupTitle');label(lookup.querySelector('p'),'viewer.lookupInfo');label($('name-consent').closest('label'),'viewer.lookupConsent');label($('lookup-name'),'viewer.lookupButton');}
    const plainFormats={mol:'MOL (.mol)',sdf:'SDF (.sdf)',xyz:'XYZ (.xyz)',smiles:'SMILES (.smi)',json:'Orgchem Visualizer JSON'};
    Object.entries(plainFormats).forEach(([value,text])=>{const option=doc.querySelector('#export-format option[value="'+value+'"]');if(option)option.textContent=text;});
    label(doc.querySelector('#export-format option[value="csv"]'),'shell.csv');label(doc.querySelector('#export-format option[value="png"]'),'shell.png');
    ['formula-input','stereo-input','import-text','export-text','copy-fallback','selected-smiles','stage-formula','builder-formula','builder-smiles','builder-canvas','model3d','model2d'].forEach(id=>{
      const el=$(id);if(el){el.setAttribute('dir','ltr');el.classList.add('chemical-ltr');}
    });
  }
  function summary(){
    const el=$('molecule-text-summary'),m=root.BondAtlas?.state.selected;if(!el)return;
    if(!m){I.bindText(el,'prefs.summaryEmpty');return;}
    I.bindText(el,'prefs.summaryText',()=>{
      const state=root.BondAtlas.state.selected,c=root.MoleculeRecords?.conformer(state);
      let stereo=root.MoleculeRecords?.stereoLabel(state)||'';
      if(stereo==='Unassigned stereochemistry')stereo=I.t('viewer.unassigned');
      if(stereo==='No assigned stereogenic features')stereo=I.t('viewer.noFeatures');
      return {name:state.name,formula:state.formula,atoms:state.atoms.length,bonds:state.bonds.length,stereo,method:c?.method||I.t('prefs.noGeometry')};
    });
    const graph=$('molecule-text-connectivity');if(graph){graph.textContent=m.atoms.map((symbol,index)=>{
      const neighbors=m.bonds.filter(b=>b.a===index||b.b===index).map(b=>`${m.atomIds?.[b.a===index?b.b:b.a]||'a'+((b.a===index?b.b:b.a)+1)} (${b.order})`).join(', ');
      return `${m.atomIds?.[index]||'a'+(index+1)} ${symbol}${m.charges?.[index]?' '+(m.charges[index]>0?'+':'')+m.charges[index]:''}: ${neighbors||'—'}; H=${m.hydrogens?.[index]||0}`;
    }).join('\n');}
  }
  function disclosures(){
    const form=$('stereo-form'),row=doc.querySelector('.stereo-generate-row');
    if(form&&row&&!$('enumeration-options')){
      const details=doc.createElement('details');details.id='enumeration-options';details.className='advanced-options';
      const heading=doc.createElement('summary');I.bindText(heading,'prefs.enumOptions');const content=doc.createElement('div');
      Array.from(row.children).filter(el=>el.tagName==='LABEL').forEach(el=>content.append(el));details.append(heading,content);row.before(details);
    }
    const seed=$('stereo-seed')?.closest('label');
    if(seed&&!$('sampling-options')){const details=doc.createElement('details');details.id='sampling-options';details.className='advanced-options';const heading=doc.createElement('summary');I.bindText(heading,'prefs.samplingOptions');const content=doc.createElement('div');seed.parentElement.after(details);content.append(seed);details.append(heading,content);}
    doc.addEventListener('invalid',event=>{const details=event.target.closest('details');if(details)details.open=true;},true);
  }
  function setup(){
    const dialog=doc.createElement('dialog');dialog.id='preferences-dialog';dialog.setAttribute('aria-labelledby','preferences-title');
    dialog.innerHTML=`<div class="dialog-top"><h2 id="preferences-title" data-i18n="prefs.title">Make this workspace yours</h2><button class="plain-button" id="close-preferences" type="button" data-i18n="prefs.close">Done</button></div>
      <p id="preferences-description" class="dialog-description" data-i18n="prefs.intro"></p><div class="preferences-grid">
      <label for="preference-theme"><span data-i18n="prefs.theme">Appearance</span><select id="preference-theme"><option value="system" data-i18n="prefs.system">Follow system</option><option value="light" data-i18n="prefs.light">Light</option><option value="dark" data-i18n="prefs.dark">Dark</option></select></label>
      <label for="preference-text-size"><span data-i18n="prefs.textSize">Text size</span><select id="preference-text-size"><option value="normal" data-i18n="prefs.normal">Standard</option><option value="large" data-i18n="prefs.large">Large</option><option value="xlarge" data-i18n="prefs.xlarge">Extra large</option></select></label>
      <label class="preference-check"><input id="preference-contrast" type="checkbox"><span data-i18n="prefs.contrast">Higher contrast</span></label>
      <label class="preference-check"><input id="preference-motion" type="checkbox" aria-describedby="motion-preference-note"><span data-i18n="prefs.motion">Reduce motion</span></label></div>
      <p id="motion-preference-note" class="input-note" data-i18n="prefs.motionHint"></p><details class="keyboard-guide"><summary data-i18n="prefs.keyboard">Keyboard guide</summary><p data-i18n="prefs.viewerKeys"></p><p data-i18n="prefs.builderKeys"></p></details>
      <button class="plain-button" id="reset-preferences" type="button" data-i18n="prefs.reset">Reset preferences</button>`;
    dialog.setAttribute('aria-describedby','preferences-description');
    doc.body.append(dialog);
    // Keep Tab/Shift+Tab within each modal; Escape and browser shortcuts keep
    // their native behavior, and closing still restores the opener's focus.
    doc.querySelectorAll('dialog').forEach(modal=>modal.addEventListener('keydown',event=>{
      if(event.key!=='Tab'||event.ctrlKey||event.altKey||event.metaKey)return;
      const controls=Array.from(modal.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')).filter(el=>!el.disabled&&el.tabIndex>=0&&(el.checkVisibility?el.checkVisibility({checkVisibilityCSS:true}):el.getClientRects().length));
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
    }));
    const region=doc.createElement('div');region.id='accessibility-status';region.className='sr-only';region.setAttribute('role','status');region.setAttribute('aria-live','polite');region.setAttribute('aria-atomic','true');doc.body.append(region);
    const language=$('language-select');
    if(language){I.supportedLocales.forEach(info=>{const option=doc.createElement('option');option.value=info.code;option.lang=info.code;option.dir=info.dir;option.textContent=info.name;language.append(option);});language.addEventListener('change',()=>update('language',language.value));}
    $('preferences-button')?.addEventListener('click',()=>dialog.showModal());$('close-preferences').addEventListener('click',()=>dialog.close());
    $('preference-theme').addEventListener('change',e=>update('theme',e.target.value));$('preference-text-size').addEventListener('change',e=>update('textSize',e.target.value));
    $('preference-contrast').addEventListener('change',e=>update('contrast',e.target.checked));$('preference-motion').addEventListener('change',e=>update('reduceMotion',e.target.checked));
    $('reset-preferences').addEventListener('click',()=>root.AtlasPreferences.reset());
    const tools=$('camera-tools');if(tools){
      [['zoom-in','viewer.zoomIn','+',1.15],['zoom-out','viewer.zoomOut','−',1/1.15]].forEach(([id,key,text,factor])=>{const button=doc.createElement('button');button.id=id;button.type='button';button.className='camera-zoom';button.textContent=text;I.bindAttr(button,'aria-label',key);I.bindAttr(button,'title',key);button.addEventListener('click',()=>{const viewer=root.BondAtlas?.state.viewer;if(viewer){viewer.zoom(factor);viewer.render();}});tools.insertBefore(button,tools.querySelector('.tool-rule'));});
    }
    const model=$('model3d');if(model){
      model.tabIndex=0;model.setAttribute('aria-describedby','viewer-keyboard-help');model.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight Home');
      model.addEventListener('keydown',event=>{
        const app=root.BondAtlas,v=app?.state.viewer;if(!v||app.state.mode!=='3d'||event.altKey||event.ctrlKey||event.metaKey)return;
        const step=event.shiftKey?15:5;
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();v.rotate((event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)*step,event.key==='ArrowLeft'||event.key==='ArrowRight'?'y':'x');v.render();}
        else if(['+','=','-','_'].includes(event.key)){event.preventDefault();v.zoom(event.key==='+'||event.key==='='?1.15:1/1.15);v.render();}
        else if(event.key==='Home'){event.preventDefault();$('reset-button').click();}
      });
    }
    $('focus-viewer')?.addEventListener('click',()=>{const app=root.BondAtlas;const target=app?.state.mode==='3d'?model:$('representation-panel');target?.focus({preventScroll:true});});
    doc.querySelector('.skip-link')?.addEventListener('click',()=>{(root.requestAnimationFrame||setTimeout)(()=>$('main-content')?.focus({preventScroll:true}));});
    ['show-explorer','show-stereo','show-builder'].forEach(id=>$(id)?.addEventListener('click',event=>{if(event.detail===0)(root.requestAnimationFrame||setTimeout)(()=>$('main-content')?.focus({preventScroll:true}));}));
    bindStatic();disclosures();I.apply();appearance();sync();summary();
    doc.addEventListener('bondatlas:selection',summary);doc.addEventListener('atlas:localechange',summary);
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})(typeof window!=='undefined'?window:globalThis);
