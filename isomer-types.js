/* Isomer relationships are relative to a reference graph, not intrinsic names. */
(function(root){
  'use strict';
  const C=root.Chem||(typeof require==='function'?require('./chemistry.js'):null);
  const groups=['alcohol','ether','aldehyde','ketone','carboxylic-acid','ester','amine','amide','nitrile','alkene','alkyne','halogenoalkane','peroxide','enol'];
  function family(g){const names=groups.filter(t=>g.tags.includes(t));return names.length?names.join(' / '):g.tags.includes('cyclic')?'cyclic hydrocarbon':g.tags.includes('alkane')?'alkane':'other connectivity';}
  const skeletonCache=new WeakMap();
  function skeleton(g){
    if(skeletonCache.has(g))return skeletonCache.get(g);
    const keep=g.atoms.map((e,i)=>e==='C'?i:-1).filter(i=>i>=0),map=new Map(keep.map((i,j)=>[i,j]));
    const adj=keep.map(()=>[]);g.bonds.forEach(b=>{if(map.has(b.a)&&map.has(b.b)){adj[map.get(b.a)].push(map.get(b.b));adj[map.get(b.b)].push(map.get(b.a));}});
    const seen=new Set(),codes=[];
    keep.forEach((_,start)=>{if(seen.has(start))return;const nodes=[],queue=[start];seen.add(start);while(queue.length){const i=queue.shift();nodes.push(i);adj[i].forEach(j=>{if(!seen.has(j)){seen.add(j);queue.push(j);}});}const m=nodes.map(i=>nodes.map(j=>adj[i].includes(j)?1:0));codes.push(C.canonical({atoms:nodes.map(()=> 'C'),m}).key);});
    const result=codes.sort().join('|');skeletonCache.set(g,result);return result;
  }
  function relationship(g,reference){
    if(!reference)return 'No reference';
    if(g.formula!==reference.formula||(g.charge||0)!==(reference.charge||0))return 'Different formula / charge';
    if(g.schema==='bond-atlas/3'&&reference.schema==='bond-atlas/3'&&g.connectivityId===reference.connectivityId){
      if(g.stereoisomerId===reference.stereoisomerId){if(g.selectedConformerId&&reference.selectedConformerId&&g.selectedConformerId!==reference.selectedConformerId)return 'Conformers of the same stereoisomer';return g.id===reference.id?'Reference structure':'Same stereoisomer';}
      if(g.mirrorStereoisomerId===reference.stereoisomerId)return 'Enantiomers';
      if(g.mirrorStereoisomerId&&reference.mirrorStereoisomerId)return 'Diastereomers';
      return 'Unspecified stereochemistry';
    }
    if(g.id===reference.id)return 'Reference structure';
    if(g.tags.includes('cyclic')!==reference.tags.includes('cyclic'))return 'Ring–chain isomer';
    if(family(g)!==family(reference))return 'Functional-group isomer';
    if(skeleton(g)!==skeleton(reference))return 'Chain / skeletal isomer';
    return 'Positional / connectivity isomer';
  }
  const api={family,skeleton,relationship};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.IsomerTypes=api;
})(typeof self!=='undefined'?self:globalThis);
