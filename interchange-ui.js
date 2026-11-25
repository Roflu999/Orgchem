/* Import/export controls for the local web app. No external requests carry molecule data. */
(function () {
  'use strict';
  const I=window.AtlasI18n;
  const tr=(key,fallback,params={})=>I?I.t(key,params,fallback):fallback.replace(/\{(\w+)\}/g,(s,k)=>params[k]??s);
  const ui=(element,value)=>{const read=()=>{let result=value;while(typeof result==='function')result=result();return result;};if(I)I.bindText(element,'common.value',{value:read});else element.textContent=read();return element;};
  const diagnosticKeys=new Map(Object.entries(window.AtlasLocales?.en||{}).filter(([key])=>/^(stereo|builder|projection|import|grid)\./.test(key)).map(([key,value])=>[value,key]));
  const detail=text=>{if(!text)return '';const key=diagnosticKeys.get(text);return key?tr(key,text):tr('common.original','{detail}',{detail:text});};
  const app=window.BondAtlas,F=window.MoleculeFormats,$=id=>document.getElementById(id);
  let chosenFilename='',importController=null,importRevision=0,importFormulaActive=false,fileRevision=0;
  function importProgress(text=''){ui($('import-progress'),text);$('import-progress').hidden=!(typeof text==='function'?text():text);}
  function cancelImport(close=true){importRevision++;fileRevision++;importController?.abort();importController=null;if(importFormulaActive)$('cancel-search').click();$('apply-import').disabled=false;ui($('apply-import'),()=>tr("import.open",'Open structure(s)'));importProgress();if(close)$('import-dialog').close();}
  async function importFormula(formula){importFormulaActive=true;try{return await app.searchFormula(formula);}finally{importFormulaActive=false;}}
  function importError(message){ui($('import-error'),message);$('import-error').hidden=!(typeof message==='function'?message():message);}
  function openImport(){cancelImport(false);importError(()=>(''));$('import-dialog').showModal();}
  $('open-import').addEventListener('click',openImport);
  $('close-import').addEventListener('click',()=>cancelImport());
  $('import-dialog').addEventListener('cancel',()=>cancelImport(false));
  for(const id of ['import-text','import-format'])$(id).addEventListener('input',()=>{cancelImport(false);if(id==='import-text')chosenFilename='';});
  $('close-export').addEventListener('click',()=>$('export-dialog').close());
  $('input-mode').addEventListener('change',()=>{const open=['name','smiles'].includes($('input-mode').value),label=$('find-label')||$('find-button').firstChild;if(I)I.bindText(label,open?'shell.openStructure':'shell.find',{},open?'Open structure':'Find isomers');else label.textContent=open?'Open structure':'Find isomers';});
  async function readFile(file){
    cancelImport(false);const revision=fileRevision,button=$('apply-import');
    button.disabled=true;ui(button,()=>tr("import.readFile",'Reading file…'));importProgress(()=>(tr("import.readProgress",'Reading the selected molecular file…')));
    try{
      if(file.size>F.MAX_BYTES)throw Error('Choose a molecular file up to 1 MB.');
      const text=await file.text();if(revision!==fileRevision)return;
      chosenFilename=file.name;$('import-text').value=text;
      $('import-format').value=/\.sdf$/i.test(file.name)?'sdf':/\.mol$/i.test(file.name)?'mol':/\.json$/i.test(file.name)?'json':/\.smi(?:les)?$/i.test(file.name)?'smiles':'auto';
    }catch(e){if(revision===fileRevision)throw e;}
    finally{if(revision===fileRevision){button.disabled=false;ui(button,()=>tr("import.open",'Open structure(s)'));importProgress();}}
  }
  $('file-input').addEventListener('change',async()=>{if(!$('file-input').files[0])return;importError(()=>(''));try{await readFile($('file-input').files[0]);}catch(e){importError(()=>detail(e.message));}finally{$('file-input').value='';}});
  $('apply-import').addEventListener('click',async()=>{
    const button=$('apply-import');importController?.abort();const controller=new AbortController(),revision=++importRevision;importController=controller;const current=()=>revision===importRevision&&!controller.signal.aborted;
    const options={signal:controller.signal,onProgress:p=>{if(current())importProgress(()=>(tr('import.progress','Chemistry {stage} · {elapsed} s',{stage:p.stage||p.status?detail(p.stage||p.status):tr('import.processing','processing'),elapsed:(p.elapsed||0).toFixed(1)})));}};
    button.disabled=true;ui(button,()=>tr("import.readStructures",'Reading structures…'));importError(()=>(''));importProgress(()=>(tr("import.validating",'Validating the structure and preserving chemical annotations…')));
    try{
      if(app.state.busy)throw Error('Wait for the current search or cancel it before importing.');
      const text=$('import-text').value;let format=$('import-format').value;
      await ChemistryClient.ready;
      if(!current())return;
      if(ChemistryClient.available&&format!=='formula'){
        let legacy=null;try{legacy=F.parseData(text,format,chosenFilename);}catch(e){
          legacy=await ChemistryClient.parseNameFallback(text,format,e,options);
          if(!legacy&&(format==='name'||e.code==='UNSUPPORTED_NAME'||(format==='json'&&!text.includes('bond-atlas/3'))))throw e;
        }
        if(legacy?.source==='OPSIN'){
          if(!current())return;
          app.loadStructures(legacy.isomers,legacy.source);window.StereoExplorer?.setMolecules(legacy.isomers,{sync:false});
        }else if(legacy?.fromName){
          const named=legacy.isomers[0],parsed=await ChemistryClient.parse(named.notation,'smiles',options);
          if(!current())return;
          const records=parsed.molecules.map(m=>({...m,name:named.name,knownName:true,nameSource:named.nameSource}));
          app.loadStructures(records,legacy.source);window.StereoExplorer?.setMolecules(records,{sync:false});
        }else if(legacy?.kind==='formula')await importFormula(legacy.parsed.formula);
        else{
          if(format==='auto')format=F.structureFormat(text)||'smiles';
          let result;
          if(format==='json'&&legacy&&!text.includes('bond-atlas/3')){const records=[];for(const g of legacy.isomers)records.push(...(await ChemistryClient.parse(g.notation,'smiles',options)).molecules);result={molecules:records};}
          else result=await ChemistryClient.job('parse',{text,format,allowNames:format==='smiles'},options);
          if(!current())return;
          const seen=new Map();const records=result.molecules.map((g,i)=>{const n=seen.get(g.id)||0;seen.set(g.id,n+1);return n?{...g,id:g.id+':source-'+i}:g;});
          app.loadStructures(records,'RDKit '+format.toUpperCase()+' import');window.StereoExplorer?.setMolecules(records,{sync:false});
        }
      }else{const parsed=F.parseData(text,format,chosenFilename);if(parsed.kind==='formula')await importFormula(parsed.parsed.formula);else app.loadStructures(parsed.isomers,parsed.source);}
      if(current())$('import-dialog').close();
    }catch(e){if(current()&&e.name!=='AbortError')importError(()=>detail(e.message));}finally{if(revision===importRevision){button.disabled=false;ui(button,()=>tr("import.open",'Open structure(s)'));importController=null;importFormulaActive=false;importProgress();}}
  });
  const stage=$('model-stage');
  stage.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();stage.classList.add('drag-active');}});
  stage.addEventListener('dragleave',e=>{if(!stage.contains(e.relatedTarget))stage.classList.remove('drag-active');});
  stage.addEventListener('drop',async e=>{e.preventDefault();stage.classList.remove('drag-active');const file=e.dataTransfer?.files[0];if(!file)return;openImport();try{await readFile(file);}catch(error){importError(()=>detail(error.message));}});
  function updateExportScope(){
    const onlyOne=['mol','xyz','png'].includes($('export-format').value),option=$('export-target').querySelector('[value="filtered"]');
    option.disabled=onlyOne;if(onlyOne)$('export-target').value='selected';
    const conformers=$('export-target').querySelector('[value="conformers"]');conformers.disabled=!['sdf','json'].includes($('export-format').value);if(conformers.disabled&&$('export-target').value==='conformers')$('export-target').value='selected';
    $('preview-export').disabled=$('export-format').value==='png';
  }
  $('export-format').addEventListener('change',updateExportScope);
  function selectedExport(){
    if(app.state.busy)throw Error('Wait for the current search to finish before exporting.');
    const all=$('export-target').value==='filtered',isomers=all?app.state.filtered:[app.state.selected];
    if(!isomers.length||!isomers[0])throw Error('Select a structure or change the filter before exporting.');
    if(isomers.some(g=>!MoleculeRecords.isRecord(g)&&(g.charge||g.charges?.some(Boolean))))throw Error('Carbocation intermediates are visualization-only. Neutral-only exports are blocked so charge is not silently lost.');
    return {all,isomers,format:$('export-format').value};
  }
  async function makeTextExport(){
    const {all,isomers,format}=selectedExport(),first=isomers[0];let text,extension,mime='text/plain;charset=utf-8';
    if(isomers.some(MoleculeRecords.isRecord)){
      if(!isomers.every(MoleculeRecords.isRecord))throw Error('Export toolkit and legacy records separately.');
      const data=await ChemistryClient.job('export',{molecules:isomers,outputFormat:format,conformerId:first.selectedConformerId,allConformers:$('export-target').value==='conformers'});
      return {...data,count:isomers.length,format,authoritative:true};
    }
    if(format==='smiles'){text=F.writeSMILES(isomers);extension='smi';}
    else if(format==='mol'){text=F.writeMol(first,app.geometry3D(first),'3D');extension='mol';mime='chemical/x-mdl-molfile';}
    else if(format==='sdf'){text=F.writeSDF(isomers,g=>app.geometry2D(g),'2D');extension='sdf';mime='chemical/x-mdl-sdfile';}
    else if(format==='xyz'){text=F.writeXYZ(first,app.geometry3D(first));extension='xyz';mime='chemical/x-xyz';}
    else if(format==='json'){text=F.writeJSON(isomers);extension='json';mime='application/json';}
    else if(format==='csv'){text=F.writeCSV(isomers);extension='csv';mime='text/csv;charset=utf-8';}
    else throw Error('Choose a text format to preview or copy.');
    const base=(all?'matching-structures':first.name).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'')||'molecule';
    return {text,mime,filename:base+'.'+extension,count:isomers.length,format};
  }
  $('preview-export').addEventListener('click',async()=>{try{const data=await makeTextExport();$('export-text').value=data.text;ui($('export-description'),()=>tr('import.description','{filename} · {count} structure(s). {detail}',{filename:data.filename,count:data.count,detail:data.authoritative?tr("import.preserved",'Specified stereochemistry, formal charges and mapped coordinates are preserved where this format supports them. XYZ contains coordinates only.'):tr("import.legacy",'Legacy illustrative coordinates; no stereochemistry assigned.')}));ui($('export-feedback'),()=>tr("import.manualCopy",'Select the text to copy manually if clipboard access is unavailable.'));$('export-dialog').showModal();}catch(e){app.showError(e.message);}});
  $('copy-export').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('export-text').value);ui($('export-feedback'),()=>tr("import.copied",'Copied to clipboard.'));}catch(e){$('export-text').focus();$('export-text').select();ui($('export-feedback'),()=>tr("import.clipboardUnavailable",'Clipboard access is unavailable. The text is selected; use your device’s Copy command.'));}});
  function saveBlob(blob,filename){
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function downloadPNG(){
    const {isomers}=selectedExport(),iso=isomers[0],canvas=document.createElement('canvas');
    canvas.style.width=(iso.atoms.length>24?2400:1400)+'px';canvas.style.height='1000px';canvas.style.position='absolute';canvas.style.left='-10000px';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
    try{
      await app.drawImage(canvas,iso,app.state.mode==='displayed'?'displayed':'skeletal');
      // Composite onto the current background; the molecule render itself is transparent.
      const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d');ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0);
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw Error('The browser could not encode this image.');saveBlob(blob,'molecule-'+iso.formula+'.png');
    }finally{canvas.remove();}
  }
  $('download-export').addEventListener('click',async()=>{const button=$('download-export');button.disabled=true;ui(button,()=>tr("common.preparing",'Preparing…'));try{app.showError('');if($('export-format').value==='png')await downloadPNG();else{const data=await makeTextExport();saveBlob(new Blob([data.text],{type:data.mime}),data.filename);}}catch(e){app.showError(e.message);}finally{button.disabled=false;ui(button,()=>tr("common.download",'Download'));}});
  updateExportScope();
})();
