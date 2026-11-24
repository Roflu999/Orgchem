/* Textbook representations share one supplied connectivity graph; no stereo is inferred. */
(function(){
  'use strict';
  const I=window.AtlasI18n;
  const tr=(key,fallback,params={})=>I?I.t(key,params,fallback):fallback.replace(/\{(\w+)\}/g,(s,k)=>params[k]??s);
  const ui=(element,value)=>{const read=()=>typeof value==='function'?value():value;if(I)I.bindText(element,'common.value',{value:read});else element.textContent=read();return element;};
  const attr=(element,name,value)=>{const read=()=>typeof value==='function'?value():value;if(I)I.bindAttr(element,name,'common.value',{value:read});else element.setAttribute(name,read());};
  const diagnosticKeys=new Map(Object.entries(window.AtlasLocales?.en||{}).filter(([key])=>/^(stereo|builder|projection|import|grid)\./.test(key)).map(([key,value])=>[value,key]));
  const detail=text=>{if(!text)return '';const key=diagnosticKeys.get(text);return key?tr(key,text):tr('common.original','{detail}',{detail:text});};
  const app=window.BondAtlas,P=window.MoleculeProjections,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const preferences=new Map();let linkedController=null,linkedRevision=0;
  const modeName=mode=>mode==='fischer'?'Fischer':mode==='newman'?'Newman':mode;
  async function linkedProjection(iso,mode,state,controls,content,note){
    linkedController?.abort();const controller=new AbortController(),revision=++linkedRevision;linkedController=controller;
    const conformer=MoleculeRecords.conformer(iso),payload={molecule:iso,type:mode,conformerId:conformer?.id};
    const redraw=()=>render(iso,mode);
    if(mode==='fischer'){
      const centers=(iso.stereo?.centers||[]).filter(c=>c.specified);if(state.center&&!centers.some(c=>c.atomId===state.center))state.center='';
      controls.append(choose('fischer-center',()=>tr('projection.center','Center'),()=>[['',tr('projection.automatic','Automatic chain / center')],...centers.map(c=>[c.atomId,iso.atoms[c.atom]+(c.atom+1)+' · '+(c.cip||tr('stereo.assigned','assigned'))])],state.center||'',v=>{state.center=v;redraw();}));
      if(state.center)payload.atomId=state.center;
      const invert=button('fischer-invert',()=>tr('projection.invert','Invert selected center'),async()=>{
        try{const result=await ChemistryClient.job('parse',{molecule:iso,invertAtomId:state.center});app.loadStructures(result.molecules,'Deliberate configuration inversion');window.StereoExplorer?.setMolecules(result.molecules,{sync:false});app.setMode('fischer');}catch(e){ui(note,()=>detail(e.message));}
      });invert.disabled=!state.center;controls.append(invert);
    }else{
      const bonds=iso.bonds.filter(b=>b.order===1&&iso.atoms[b.a]==='C'&&iso.atoms[b.b]==='C');if(!bonds.some(b=>b.id===state.bond))state.bond=bonds[0]?.id;
      controls.append(choose('newman-bond',()=>tr('projection.lookDown','Look down'),()=>bonds.map(b=>[b.id,'C'+(b.a+1)+'–C'+(b.b+1)]),state.bond||'',v=>{state.bond=v;redraw();}));
      controls.append(button('newman-reverse',()=>tr('projection.reverse','Reverse view'),()=>{state.reverse=!state.reverse;redraw();}));
      if(state.bond)payload.bondId=state.bond;payload.reverse=state.reverse;
    }
    const loading=document.createElement('p');loading.className='textbook-empty';ui(loading,()=>tr('projection.loading','Preparing the geometry-linked {mode} projection…',{mode:!I||I.locale==='en'?mode:modeName(mode)}));content.append(loading);
    try{
      const result=await ChemistryClient.job('projection',payload,{signal:controller.signal});
      if(revision!==linkedRevision||app.state.selected?.id!==iso.id||app.state.mode!==mode)return;
      const img=document.createElement('img');img.className='linked-projection';attr(img,'alt',()=>tr('projection.alt','Configuration-preserving {mode} projection',{mode:!I||I.locale==='en'?mode:modeName(mode)}));img.src=MoleculeRecords.imageURL(result.svg);content.replaceChildren(img);ui(note,()=>result.note?detail(result.note):tr('projection.mapped','Mapped projection of the selected stereoisomer and conformer.'));
    }catch(e){if(controller.signal.aborted)return;ui(loading,()=>detail(e.message));ui(note,()=>tr('projection.notForced','The molecule has not been altered to force a projection. Generate a conformer for a coordinate-linked Newman view, or select a supported Fischer center.'));}
  }
  const pretty=t=>window.MoleculeRecords?window.MoleculeRecords.prettyFormula(t):String(t).replace(/\d/g,d=>'₀₁₂₃₄₅₆₇₈₉'[Number(d)]);
  function el(tag,attrs={},text){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>typeof v==='function'?attr(n,k,v):n.setAttribute(k,String(v)));if(text!==undefined)ui(n,text);return n;}
  function button(id,text,fn){const b=document.createElement('button');b.id=id;b.type='button';b.className='plain-button';ui(b,text);b.addEventListener('click',fn);return b;}
  function line(svg,x1,y1,x2,y2,attrs={}){svg.append(el('line',{x1,y1,x2,y2,...attrs}));}
  function text(svg,x,y,value,attrs={}){const n=el('text',{x,y,...attrs});ui(n,()=>pretty(typeof value==='function'?value():value));svg.append(n);}
  function choose(id,labelText,entries,value,fn){
    const label=document.createElement('label');label.htmlFor=id;const caption=document.createElement('span');ui(caption,labelText);label.append(caption);
    const s=document.createElement('select');s.id=id;s.className='compact-select';const choices=()=>typeof entries==='function'?entries():entries;
    for(const [v,name]of choices()){const o=document.createElement('option');o.value=v;ui(o,()=>choices().find(item=>String(item[0])===String(v))?.[1]??name);s.append(o);}
    s.value=String(value);s.addEventListener('change',()=>fn(s.value));label.append(s);return label;
  }
  function render(iso,mode){
    const controls=$('textbook-controls'),content=$('textbook-content'),note=$('textbook-note');controls.replaceChildren();content.replaceChildren();
    linkedController?.abort();linkedRevision++;
    if(!iso)return;
    const key=iso.id+':'+mode;if(!preferences.has(key))preferences.set(key,{center:undefined,bond:undefined,rotation:60,reverse:false,arms:[0,1,2,3]});const state=preferences.get(key);
    if(preferences.size>100)preferences.delete(preferences.keys().next().value);
    const redraw=()=>render(iso,mode);
    const samples=()=>mode==='fischer'?[['butan-2-ol','Butan-2-ol'],['propan-2-ol',tr('projection.achiralExample','Propan-2-ol (achiral)')]]:mode==='newman'?[['butane','Butane'],['ethane','Ethane'],['ethanol','Ethanol']]:[['ethanol','Ethanol'],['benzene','Benzene'],['but-1-yne','But-1-yne']];
    controls.append(choose('textbook-example',()=>tr('projection.example','Example'),()=>[['',tr('projection.loadExample','Load example…')],...samples()],'',name=>{if(name){app.loadStructures([Chem.resolveName(name)],'Textbook example');app.setMode(mode);}}));
    try{
      if(mode==='formula'||mode==='condensed'){
        const value=mode==='formula'?iso.formula+(iso.charge?(Math.abs(iso.charge)>1?String(Math.abs(iso.charge)).replace(/\d/g,d=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]):'')+(iso.charge>0?'⁺':'⁻'):''):P.condensed(iso);
        const p=document.createElement('p');p.className=value?'textbook-formula':'textbook-empty';if(value)p.dir='ltr';ui(p,()=>value?pretty(value):tr('projection.condensedUnavailable','A linear condensed formula would hide a ring closure or separate fragments. Use 2D / skeletal or Displayed to see the complete connectivity.'));content.append(p);
        ui(note,()=>mode==='formula'?tr('projection.formulaHelp','A molecular formula counts atoms. It does not specify which atoms are connected, their 3D arrangement, or a unique isomer. Switch representations to inspect this selected structure.'):tr('projection.condensedHelp','A condensed structural formula groups hydrogens with their bonded atom. Parentheses show branches, = a double bond, and ≡ a triple bond. It preserves connectivity here but assigns no stereochemistry.'));return;
      }
      if(MoleculeRecords.isRecord(iso)){linkedProjection(iso,mode,state,controls,content,note);return;}
      const svg=el('svg',{viewBox:'0 0 560 360',role:'img',direction:'ltr','aria-label':()=>mode==='fischer'?tr('projection.fischerAria','Local Fischer projection with four labeled substituents'):tr('projection.newmanAria','Newman projection looking along the selected carbon-carbon single bond')});
      if(mode==='fischer'){
        const centers=P.fischerCenters(iso);if(!centers.includes(state.center))state.center=centers[0];
        const data=P.fischer(iso,state.center);
        controls.append(choose('fischer-center',()=>tr('projection.center','Center'),()=>centers.map(i=>[i,tr('projection.carbon','Carbon {number}',{number:i+1})]),state.center,v=>{state.center=Number(v);state.arms=[0,1,2,3];redraw();}));
        controls.append(button('fischer-rotate',()=>tr('projection.rotate','Rotate 180°'),()=>{state.arms=[state.arms[2],state.arms[3],state.arms[0],state.arms[1]];redraw();}));
        controls.append(button('fischer-swap',()=>tr('projection.swap','Swap horizontal groups'),()=>{[state.arms[1],state.arms[3]]=[state.arms[3],state.arms[1]];redraw();}));
        const arms=state.arms.map(i=>data.arms[i]);
        line(svg,280,90,280,240);line(svg,160,165,400,165);
        svg.append(el('circle',{cx:280,cy:165,r:4,fill:'var(--ink)',stroke:'none'}));
        text(svg,280,65,arms[0].label);text(svg,435,172,arms[1].label);text(svg,280,272,arms[2].label);text(svg,120,172,arms[3].label);
        text(svg,280,310,()=>tr('projection.caption','Horizontal: toward you · Vertical: away'),{class:'projection-caption'});
        ui(note,()=>detail(data.note)+' '+tr('projection.fischerHelp','A 180° turn preserves this Fischer arrangement; swapping one pair inverts it when the center is stereogenic. No stereochemistry is written into exports. Large substituents are labeled by group formula, not expanded connectivity.'));
      }else if(mode==='newman'){
        const bonds=P.newmanBonds(iso);if(!bonds.includes(state.bond))state.bond=bonds[0];
        const data=P.newman(iso,state.bond,state.reverse);
        controls.append(choose('newman-bond',()=>tr('projection.lookDown','Look down'),()=>bonds.map(i=>[i,'C'+(iso.bonds[i].a+1)+'–C'+(iso.bonds[i].b+1)]),state.bond,v=>{state.bond=Number(v);redraw();}));
        controls.append(button('newman-reverse',()=>tr('projection.reverse','Reverse view'),()=>{state.reverse=!state.reverse;redraw();}));
        controls.append(button('newman-staggered',()=>tr('projection.staggered','Staggered'),()=>{state.rotation=60;redraw();}));controls.append(button('newman-eclipsed',()=>tr('projection.eclipsed','Eclipsed'),()=>{state.rotation=0;redraw();}));
        const label=document.createElement('label');label.htmlFor='newman-dihedral';const caption=document.createElement('span');const rotationText=()=>tr('projection.rotation','Rear rotation {angle}°',{angle:state.rotation});ui(caption,rotationText);label.append(caption);
        const slider=document.createElement('input');slider.id='newman-dihedral';slider.type='range';slider.min='0';slider.max='360';slider.step='5';slider.value=state.rotation;attr(slider,'aria-label',()=>tr('projection.rotationAria','Rear-group rotation in degrees'));slider.addEventListener('input',()=>{state.rotation=Number(slider.value);drawNewman(svg,data,state.rotation);ui(caption,rotationText);});label.append(slider);controls.append(label);
        drawNewman(svg,data,state.rotation);ui(note,()=>detail(data.note)+' '+tr('projection.newmanHelp','The rotation is relative to this schematic’s initial group ordering, not an assigned atom-specific experimental dihedral. Staggered/eclipsed does not imply an energy ranking. No R/S or conformational assignment is exported.'));
      }
      content.append(svg);
    }catch(e){const p=document.createElement('p');p.className='textbook-empty';ui(p,()=>tr('projection.unavailableHelp','{detail} Load one of the examples above, or return to 2D / skeletal.',{detail:detail(e.message)}));content.append(p);ui(note,()=>tr('projection.unavailable','This view is unavailable for the selected geometry; the structure has not been changed to force a projection.'));}
  }
  function drawNewman(svg,data,rotation){
    svg.replaceChildren();const x=280,y=165;
    svg.append(el('circle',{cx:x,cy:y,r:42,fill:'var(--stage-end)'}));
    function arms(groups,offset,rear){groups.forEach((g,k)=>{
      const a=(-90+k*120+offset)*Math.PI/180,r0=rear?43:0,r1=rear?116:85,rl=rear?141:106;
      line(svg,x+r0*Math.cos(a),y+r0*Math.sin(a),x+r1*Math.cos(a),y+r1*Math.sin(a),rear?{'stroke-dasharray':'6 4',stroke:'var(--muted)'}:{});
      const tx=x+rl*Math.cos(a),ty=y+rl*Math.sin(a)+6,w=Math.max(28,g.label.length*12);
      svg.append(el('rect',{x:tx-w/2,y:ty-18,width:w,height:25,fill:'var(--stage-end)',stroke:'none'}));
      text(svg,tx,ty,g.label,rear?{fill:'var(--muted)'}:{});
    });}
    arms(data.backGroups,rotation,true);arms(data.frontGroups,0,false);
    svg.append(el('circle',{cx:x,cy:y,r:5,fill:'var(--ink)',stroke:'none'}));
    text(svg,280,350,()=>tr('projection.frontRear','Front C{front} solid · Rear C{rear} dashed',{front:data.front+1,rear:data.back+1}),{class:'projection-caption'});
  }
  window.TextbookView={render};
})();
