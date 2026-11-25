/* Reading lists change what is suggested, not the chemistry of a molecule. */
(function(root){
  'use strict';
  const $=id=>document.getElementById('rx-'+id);
  function el(tag,text){const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
  function action(label,fn){const b=el('button',label);b.type='button';b.className='plain-button';b.addEventListener('click',fn);return b;}
  function disclosure(title){const d=el('details');d.append(el('summary',title));return d;}
  function init(entries,open,onCourse){
    const guide=root.ReactionGuide,menu=$('course');
    for(const [id,label] of [['all','All reactions'],...guide.courses.map(c=>[c.id,c.label])]){
      const o=el('option',label);o.value=id;menu.append(o);
    }
    function lesson(entry){
      if(!entry)return;
      const note=guide.lesson(entry.id);$('lesson').hidden=!note;
      if(note){$('cue').textContent=note.cue;$('reasoning').textContent=note.reasoning;$('mistake').textContent=note.error;}
      const course=guide.courses.find(c=>c.id===menu.value);
      $('track-tag').textContent=course?(guide.includes(course.id,entry.id)?'On this reading list: ':'Exploring outside this reading list: ')+course.label:'';
    }
    function list(){
      const course=guide.courses.find(c=>c.id===menu.value), catalog=$('catalog-list');catalog.replaceChildren();
      const relevant=entries.filter(e=>!course||guide.includes(course.id,e.id));
      $('course-note').textContent=(course?course.description:'Explore the full reaction library, or choose a course for a focused reading list.')+' The simulator stays available for all reactions.';
      const link=$('reference');link.hidden=!course;if(course){link.href=course.referenceUrl;link.textContent=course.referenceLabel;}
      for(const section of new Set(relevant.map(e=>e.section))){
        catalog.append(el('h3',section));
        for(const e of relevant.filter(e=>e.section===section)){
          const b=action(e.label,()=>{open(e.id,e.example);$('catalog').open=false;$('lesson').open=true;});b.dataset.example=e.id;catalog.append(b);
        }
      }
      const problems=$('problems');problems.replaceChildren();const panel=$('challenges');panel.open=false;panel.hidden=!!course&&course.id!=='olympiad';
      if(!panel.hidden)for(const p of guide.challenges){
        const article=el('article'),solution=disclosure('Worked solution');article.append(el('h3',p.title),el('p',p.prompt));
        p.hints.forEach((hint,i)=>{const d=disclosure('Hint '+(i+1));d.append(el('p',hint));article.append(d);});
        const steps=el('ol');p.solution.forEach(s=>steps.append(el('li',s)));solution.append(steps);article.append(solution);
        if(p.entryId&&p.input)article.append(action('Explore this starting structure',()=>{open(p.entryId,p.input);$('lesson').open=true;}));
        problems.append(article);
      }
      onCourse();
    }
    menu.addEventListener('change',()=>{list();$('catalog').open=true;if(menu.value==='olympiad')$('challenges').open=true;});list();
    return lesson;
  }
  const names=new WeakMap();
  function outcomeLabel(v){
    if(names.has(v))return names.get(v);
    let label=v.label;
    // Name the connectivity only; the assigned stereo and original product SMILES remain intact.
    if(v.productSmiles.length<=50){
      const graph=root.ModelInput.preview('smiles:'+v.productSmiles.replace(/[\\/]/g,''));
      const name=graph&&root.SystematicNames.generate(graph)?.name;
      if(name)label=(['E','Z'].includes(v.stereo)?`(${v.stereo})-`:'')+name+' · '+v.label;
    }
    names.set(v,label);return label;
  }
  function describeSite(choice){return Object.entries(choice).map(([role,n])=>({carbon:'carbon',leavingAtom:'leaving atom',betaCarbon:'beta carbon',oxygen:'oxygen',protonatedCarbon:'carbon receiving H',alkeneCarbon:'other alkene carbon'}[role]||role)+' '+n).join(', ');}
  const mapLayouts=new WeakMap();
  function drawSite(record,site,overview=false){
    const svg=$('site-map'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
    function node(tag,attrs,label){const n=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));if(label!=null)n.textContent=label;svg.append(n);return n;}
    node('title',{id:'rx-map-title'},'Numbered parent: '+describeSite(site));
    let layout=mapLayouts.get(record);if(!layout){layout=record.layouts?.skeletal || root.MoleculeGeometry.layout2D(record,false);mapLayouts.set(record,layout);}
    const {atoms,bonds}=layout, mapped=layout===record.layouts?.skeletal;
    const points=atoms.map(a=>({x:a.x*(mapped?48:65),y:a.y*(mapped?-48:65)}));
    const marks=new Set(Object.values(site).map(n=>n-1)), nearby=new Set(marks), large=atoms.length>32, local=large&&!overview;
    for(let depth=0;depth<2;depth++){
      const previous=new Set(nearby);for(const {a,b} of bonds){if(previous.has(a))nearby.add(b);if(previous.has(b))nearby.add(a);}
    }
    const bounds=points.filter((p,i)=>!local||nearby.has(i)), xs=bounds.map(p=>p.x),ys=bounds.map(p=>p.y),margin=local?48:27;
    const left=Math.min(...xs)-margin,top=Math.min(...ys)-margin,w=Math.max(...xs)-left+margin,h=Math.max(...ys)-top+margin;
    svg.setAttribute('viewBox',`${left} ${top} ${w} ${h}`);svg.style.width=w+'px';svg.style.height='auto';svg.style.maxWidth='100%';
    $('map-tools').hidden=!large;$('map-toggle').textContent=local?'Show whole molecule':'Focus reaction site';
    $('map-caption').textContent=local?`Site detail: ${bounds.length} of ${atoms.length} parent atoms. Dashed ends continue into the rest of the molecule.`:`Whole molecule: ${atoms.length} atoms. Only the selected site is numbered.`;
    for(const bond of bonds){let a=points[bond.a],b=points[bond.b];
      if(local && !(nearby.has(bond.a)&&nearby.has(bond.b))){
        if(!nearby.has(bond.a)&&!nearby.has(bond.b))continue;
        if(!nearby.has(bond.a))[a,b]=[b,a];node('line',{x1:a.x,y1:a.y,x2:a.x+(b.x-a.x)*.48,y2:a.y+(b.y-a.y)*.48,stroke:'currentColor','stroke-width':2,'stroke-dasharray':'5 4'});continue;
      }
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      for(let i=0;i<bond.order;i++){const offset=(i-(bond.order-1)/2)*4;node('line',{x1:a.x-dy*offset/len,y1:a.y+dx*offset/len,x2:b.x-dy*offset/len,y2:b.y+dx*offset/len,stroke:'currentColor','stroke-width':2});}}
    points.forEach(({x,y},i)=>{
      if(local&&!nearby.has(i) || large&&!local&&!marks.has(i)&&atoms[i].e==='C')return;
      node('circle',{cx:x,cy:y,r:17,class:marks.has(i)?'rx-mark':''});
      node('text',{x,y:y+4,'text-anchor':'middle','font-size':12,fill:'currentColor'},atoms[i].e+(large&&!local&&!marks.has(i)?'':String(i+1)));
    });
  }
  root.ReactionLearningUI={init,describeSite,drawSite,outcomeLabel};
})(window);
