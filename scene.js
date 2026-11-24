/* Separate molecular components and explicitly charged, closed-shell carbocation drawings.
   This does not change the neutral formula-enumeration engine. */
(function(root){
  'use strict';
  const C=root.Chem||(typeof require==='function'?require('./chemistry.js'):null);
  const M=root.MoleculeSketcher||(typeof require==='function'?require('./sketcher-model.js'):null);
  const MASS={C:12.011,H:1.008,N:14.007,O:15.999,F:18.9984,Cl:35.45,Br:79.904,I:126.9045};
  const format=c=>['C','H',...Object.keys(c).filter(e=>e!=='C'&&e!=='H').sort()].filter(e=>c[e]).map(e=>e+(c[e]===1?'':c[e])).join('');
  function component(d,indices){
    const map=new Map(indices.map((i,k)=>[i,k]));
    return {atoms:indices.map(i=>({...d.atoms[i]})),bonds:d.bonds.filter(b=>map.has(b.a)&&map.has(b.b)).map(b=>({a:map.get(b.a),b:map.get(b.b),order:b.order}))};
  }
  function chargedStructure(d){
    if(!d.atoms.some(a=>a.e==='C'))throw Error('A carbocation must contain carbon.');
    const sums=d.atoms.map(()=>0);d.bonds.forEach(b=>{sums[b.a]+=b.order;sums[b.b]+=b.order;});
    if(d.atoms.some((a,i)=>a.e==='H'&&sums[i]!==1))throw Error('Attach every explicit H with one single bond.');
    const keep=d.atoms.map((a,i)=>a.e!=='H'?i:-1).filter(i=>i>=0), remap=new Map(keep.map((i,k)=>[i,k]));
    const atoms=keep.map(i=>d.atoms[i].e),charges=keep.map(i=>d.atoms[i].charge||0);
    const bonds=d.bonds.filter(b=>remap.has(b.a)&&remap.has(b.b)).map(b=>({a:remap.get(b.a),b:remap.get(b.b),order:b.order}));
    const m=atoms.map(()=>atoms.map(()=>0));bonds.forEach(b=>{m[b.a][b.b]=m[b.b][b.a]=b.order;});
    const hydrogens=atoms.map((e,i)=>M.VAL[e]-charges[i]-m[i].reduce((a,b)=>a+b,0));
    const counts={};atoms.forEach(e=>counts[e]=(counts[e]||0)+1);counts.H=hydrogens.reduce((a,b)=>a+b,0);
    const charge=charges.reduce((a,b)=>a+b,0),formula=format(counts);
    const id='charged:'+C.canonical({atoms:atoms.map((e,i)=>e+(charges[i]?'+':'')),m}).key;
    const notation=C.smiles({atoms:atoms.map((e,i)=>charges[i]?'[C'+(hydrogens[i]?'H'+(hydrogens[i]>1?hydrogens[i]:''):'')+'+]':e),m});
    let name='Carbocation intermediate',knownName=false;
    if(charge===1&&atoms.every(e=>e==='C')&&bonds.every(b=>b.order===1)){
      const center=charges.findIndex(Boolean),degree=m[center].filter(Boolean).length;
      if(atoms.length===1){name='Methyl carbocation';knownName=true;}
      else if(atoms.length===2){name='Ethyl carbocation';knownName=true;}
      else if(atoms.length===3&&bonds.length===2){name=degree===2?'Propan-2-yl carbocation':'Propan-1-yl carbocation';knownName=true;}
      else if(atoms.length===4&&degree===3&&bonds.length===3){name='tert-Butyl carbocation';knownName=true;}
    }
    return {id,name,knownName,notation,atoms,bonds,hydrogens,charges,charge,formula,tags:['carbocation'],visualizationOnly:true,
      metadata:{formula,counts,heavy:atoms.length,mass:Object.entries(counts).reduce((s,[e,n])=>s+MASS[e]*n,0)-charge*0.00054858,dbe:bonds.reduce((s,b)=>s+b.order,0)-atoms.length+1},
      stability:{score:0,label:'Charged intermediate · not stability-ranked',reasons:['Positive carbon is modeled as three-coordinate, approximately trigonal planar, with an empty p orbital. Resonance, counterions and rearrangements are not calculated.'],method:'Visualization only; no stability inference.'}};
  }
  function analyze(draft){
    let hydrogens=[];
    try{
      const d=M.validate(draft),adj=d.atoms.map(()=>[]),sums=d.atoms.map(()=>0);
      d.bonds.forEach(b=>{adj[b.a].push(b.b);adj[b.b].push(b.a);sums[b.a]+=b.order;sums[b.b]+=b.order;});
      hydrogens=d.atoms.map((a,i)=>a.e==='H'?0:M.VAL[a.e]-(a.charge||0)-sums[i]);
      const visited=new Set(),components=[];
      d.atoms.forEach((_,start)=>{
        if(visited.has(start))return;const indices=[],queue=[start];visited.add(start);
        while(queue.length){const i=queue.shift();indices.push(i);adj[i].forEach(j=>{if(!visited.has(j)){visited.add(j);queue.push(j);}});}
        indices.sort((a,b)=>a-b);const local=component(d,indices);let result;
        if(local.atoms.some(a=>a.charge)){
          try{result={valid:true,structure:chargedStructure(local),message:'Carbocation visualization; not neutral isomer enumeration.'};}catch(e){result={valid:false,structure:null,message:e.message};}
        }else result=M.analyze(local);
        // The neutral engine canonicalizes atom order; charged models retain heavy-atom order.
        const graphToDraft=result.valid ? (result.graphToDraft ? result.graphToDraft.map(i=>indices[i]) : indices.filter(i=>d.atoms[i].e!=='H')) : [];
        components.push({...result,indices,graphToDraft});
      });
      return {components,hydrogens,valid:components.length>0&&components.every(c=>c.valid),message:components.length?'Each disconnected component is a separate structure.':'Add an atom or load a textbook example.'};
    }catch(e){return {components:[],hydrogens,valid:false,message:e.message};}
  }
  const api={analyze};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MoleculeScene=api;
})(typeof self!=='undefined'?self:globalThis);
