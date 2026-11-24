/* Import real, supplied scalar grids. This module does not calculate electron density. */
(function(root){
  'use strict';
  const BOHR=.529177210903,MAX_VOXELS=1000000,MAX_BYTES=16*1024*1024;
  const symbols='H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
  function numbers(line){const values=line.trim().split(/\s+/).map(s=>Number(s.replace(/[dD]/g,'e')));if(!values.length||values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e30))throw Error('The CUBE file contains invalid numeric data.');return values;}
  function parse(text){
    if(typeof text!=='string'||text.length>MAX_BYTES)throw Error('Choose a CUBE file up to 16 MB.');
    const lines=text.replace(/\r/g,'').split('\n');if(lines.length<7)throw Error('The CUBE header is incomplete.');
    const header=numbers(lines[2]),n=header[0];if(!Number.isInteger(n)||n<1||n>512)throw Error('Use a single scalar CUBE grid with 1–512 atoms. Multi-orbital CUBE bundles must be split into individual grids.');
    if(header.length<4||(header.length>4&&header[4]!==1))throw Error('Only a single scalar channel is supported.');
    const axes=[3,4,5].map(i=>numbers(lines[i]));if(axes.some(a=>a.length!==4||!Number.isInteger(a[0])||Math.abs(a[0])<2))throw Error('Use three valid CUBE axes with at least two grid points each.');
    const vectors=axes.map(a=>a.slice(1)),[u,v,w]=vectors;
    const determinant=u[0]*(v[1]*w[2]-v[2]*w[1])-u[1]*(v[0]*w[2]-v[2]*w[0])+u[2]*(v[0]*w[1]-v[1]*w[0]);
    if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-12||vectors.flat().some(n=>Math.abs(n)>1e6)||header.slice(1,4).some(n=>Math.abs(n)>1e6))throw Error('The CUBE coordinate axes must be finite, nondegenerate and within the supported numeric range.');
    const negative=axes[0][0]<0;if(axes.some(a=>(a[0]<0)!==negative))throw Error('All CUBE axes must use the same coordinate unit convention.');
    const dimensions=axes.map(a=>Math.abs(a[0])),count=dimensions.reduce((a,b)=>a*b,1);if(!Number.isSafeInteger(count)||count>MAX_VOXELS)throw Error('This viewer supports up to 1,000,000 grid values. Downsample a larger dataset first.');
    const unit=negative?1:BOHR,atoms=[],rows=[];
    for(let i=0;i<n;i++){
      const a=numbers(lines[6+i]||'');if(a.length!==5||!Number.isInteger(a[0])||a[0]<1||a[0]>118||a.slice(2).some(n=>Math.abs(n)>1e6))throw Error('Invalid CUBE atom row.');
      atoms.push({e:symbols[a[0]-1],x:a[2]*unit,y:a[3]*unit,z:a[4]*unit});rows.push(a);
    }
    const raw=lines.slice(6+n).join(' ').trim();const values=raw?raw.split(/\s+/).map(s=>Number(s.replace(/[dD]/g,'e'))):[];
    if(values.length!==count||values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e30))throw Error('The grid dimensions do not match its finite scalar values.');
    let maxAbs=0;values.forEach(v=>{maxAbs=Math.max(maxAbs,Math.abs(v));});if(!maxAbs)throw Error('The grid contains only zero values.');
    // Normalize supported Angstrom variants to the Bohr form understood by the renderer.
    const factor=negative?1/BOHR:1;
    const canonical=['Imported scalar dataset','Values supplied by the uploaded file; not calculated by this application',n+' '+header.slice(1,4).map(v=>v*factor).join(' '),...axes.map(a=>Math.abs(a[0])+' '+a.slice(1).map(v=>v*factor).join(' ')),...rows.map(a=>a.slice(0,2).join(' ')+' '+a.slice(2).map(v=>v*factor).join(' '))];
    for(let i=0;i<values.length;i+=6)canonical.push(values.slice(i,i+6).join(' '));
    return {atoms,dimensions,count,maxAbs,text:canonical.join('\n')+'\n'};
  }
  const api={parse,MAX_VOXELS,MAX_BYTES};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantumGrid=api;
  if(typeof document==='undefined'||!root.BondAtlas)return;
  const I=root.AtlasI18n;
  const tr=(key,fallback,params={})=>I?I.t(key,params,fallback):fallback.replace(/\{(\w+)\}/g,(s,k)=>params[k]??s);
  const ui=(element,value)=>{const read=()=>{let result=value;while(typeof result==='function')result=result();return result;};if(I)I.bindText(element,'common.value',{value:read});else element.textContent=read();return element;};
  const diagnosticKeys=new Map(Object.entries(root.AtlasLocales?.en||{}).filter(([key])=>/^(stereo|builder|projection|import|grid)\./.test(key)).map(([key,value])=>[value,key]));
  const detail=text=>{if(!text)return '';const key=diagnosticKeys.get(text);return key?tr(key,text):tr('common.original','{detail}',{detail:text});};
  const app=root.BondAtlas,$=id=>document.getElementById(id);let dataset=null,shapes=[],key='',readRevision=0;
  const panel=document.createElement('details');panel.className='database-name';panel.id='quantum-grid-panel';
  panel.innerHTML='<summary data-i18n="grid.title">Import a calculated electron grid</summary><p data-i18n="grid.help">Optional: upload a single scalar Gaussian CUBE dataset from a quantum calculation. Import its matching 3D molecular geometry first. The supplied values are displayed; this app does not perform a quantum calculation.</p><div class="grid-controls"><label for="quantum-grid-file"><span data-i18n="grid.file">CUBE file</span><input type="file" id="quantum-grid-file" accept=".cube,.cub"></label><label for="quantum-grid-kind"><span data-i18n="grid.kind">Values represent</span><select class="compact-select" id="quantum-grid-kind"><option value="density" data-i18n="grid.density">Electron density</option><option value="orbital" data-i18n="grid.orbital">Orbital amplitude (+ / −)</option></select></label><label for="quantum-grid-level"><span data-i18n="grid.level">Surface threshold (file units)</span><input type="number" id="quantum-grid-level" min="0.000000001" step="any" value="0.02"></label></div><button class="plain-button" type="button" id="quantum-grid-show" data-i18n="grid.show">Show supplied grid</button><button class="plain-button" type="button" id="quantum-grid-clear" data-i18n="grid.clear">Remove grid</button><p id="quantum-grid-status" role="status"></p>';
  $('model-info').append(panel);
  I?.apply(panel);
  const message=t=>{ui($('quantum-grid-status'),t);};
  function clear(){if(app.state.viewer)shapes.forEach(s=>app.state.viewer.removeShape(s));shapes=[];key='';app.state.viewer?.render();}
  $('quantum-grid-file').addEventListener('change',async()=>{
    const file=$('quantum-grid-file').files[0];if(!file)return;
    const revision=++readRevision;dataset=null;clear();message(()=>(tr("grid.reading",'Reading supplied grid…')));
    try{
      if(file.size>MAX_BYTES)throw Error('Choose a CUBE file up to 16 MB.');
      const text=await file.text();if(revision!==readRevision)return;
      dataset=parse(text);$('quantum-grid-level').value=Math.min(.02,dataset.maxAbs/5);
      message(()=>(tr('grid.loaded','Loaded {dimensions} values. Select the matching conformer, then show the grid.',{dimensions:dataset.dimensions.join(' × ')})));
    }catch(e){if(revision===readRevision){dataset=null;message(()=>detail(e.message));}}
  });
  $('quantum-grid-show').addEventListener('click',()=>{
    try{
      if(!dataset)throw Error('Choose a valid CUBE file first.');if(app.state.together)throw Error('Use a single structure, not Together view, to align a calculated grid.');
      const selected=app.state.selected;if(!selected)throw Error('Import the matching 3D molecular geometry first.');
      const geometry=app.geometry3D(selected);if(geometry.atoms.length!==dataset.atoms.length)throw Error('The grid atom count does not match the selected 3D conformer. Import the matching geometry.');
      const used=new Set();for(const atom of dataset.atoms){const i=geometry.atoms.findIndex((p,i)=>!used.has(i)&&p.e===atom.e&&Math.hypot(p.x-atom.x,p.y-atom.y,p.z-atom.z)<.03);if(i<0)throw Error('Grid and conformer coordinates do not align within 0.03 Å. No misleading overlay was created.');used.add(i);}
      const threshold=Number($('quantum-grid-level').value);if(!Number.isFinite(threshold)||threshold<=0||threshold>dataset.maxAbs)throw Error('Choose a positive surface threshold within the dataset range.');
      app.setMode('3d');const viewer=app.state.viewer;if(!viewer||app.state.renderFailed)throw Error('This grid display requires WebGL/3D.');
      const color=token=>getComputedStyle(document.documentElement).getPropertyValue(token).trim();const next=[];
      try{next.push(viewer.addVolumetricData(dataset.text,'cube',{isoval:threshold,color:color('--cloud'),opacity:.8}));if($('quantum-grid-kind').value==='orbital')next.push(viewer.addVolumetricData(dataset.text,'cube',{isoval:-threshold,color:color('--pair'),opacity:.8}));}catch(e){next.forEach(s=>viewer.removeShape(s));throw e;}
      clear();shapes=next;key=MoleculeRecords.cacheKey(selected);viewer.render();const shownKind=$('quantum-grid-kind').value;message(()=>(shownKind==='orbital'?tr('grid.showingOrbital','Showing supplied orbital data. Blue/purple surfaces indicate opposite amplitude signs, not electric charges.'):tr('grid.showingDensity','Showing supplied density data. This is an isovalue surface, not a newly calculated density.')));
    }catch(e){message(()=>detail(e.message));}
  });
  $('quantum-grid-clear').addEventListener('click',()=>{readRevision++;clear();message(()=>(tr("grid.removed",'Supplied grid removed.')));});
  document.addEventListener('bondatlas:selection',()=>{if(key&&key!==MoleculeRecords.cacheKey(app.state.selected)){clear();message(()=>(tr("grid.selectionChanged",'Grid removed because the selected chemical state or conformer changed.')));}});
  document.addEventListener('bondatlas:scene',()=>{if(app.state.together&&shapes.length){clear();message(()=>(tr("grid.togetherRemoved",'Grid removed in Together view.')));}});
})(typeof window!=='undefined'?window:globalThis);
