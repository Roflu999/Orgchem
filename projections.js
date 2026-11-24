/* Textbook projection data. Connectivity alone never determines stereochemistry. */
(function(root){
  'use strict';
  function adjacency(g){const a=g.atoms.map(()=>[]);g.bonds.forEach((b,i)=>{a[b.a].push({i:b.b,order:b.order,bond:i});a[b.b].push({i:b.a,order:b.order,bond:i});});return a;}
  function branch(g,start,blocked){
    const adj=adjacency(g),seen=new Set(blocked),queue=[start],nodes=[];seen.add(start);
    while(queue.length){const i=queue.shift();nodes.push(i);for(const b of adj[i])if(!seen.has(b.i)){seen.add(b.i);queue.push(b.i);}}
    return nodes;
  }
  function label(g,nodes){
    if(nodes.length===1){const i=nodes[0],h=g.hydrogens[i]||0;return g.atoms[i]+(h?'H'+(h===1?'':h):'')+(g.charges?.[i]?'⁺':'');}
    const c={H:0};nodes.forEach(i=>{c[g.atoms[i]]=(c[g.atoms[i]]||0)+1;c.H+=g.hydrogens[i]||0;});
    return ['C','H',...Object.keys(c).filter(e=>e!=='C'&&e!=='H').sort()].filter(e=>c[e]).map(e=>e+(c[e]===1?'':c[e])).join('');
  }
  function tetrahedral(g,i,adj){return g.atoms[i]==='C'&&!g.charges?.[i]&&adj[i].every(b=>b.order===1)&&adj[i].length+(g.hydrogens[i]||0)===4;}
  function fischerCenters(g){
    const adj=adjacency(g);return g.atoms.map((_,i)=>i).filter(i=>{
      if(!tetrahedral(g,i,adj)||adj[i].length<2)return false;
      const sets=adj[i].map(b=>branch(g,b.i,[i]));const seen=new Set();
      for(const set of sets)for(const j of set){if(seen.has(j))return false;seen.add(j);}return true;
    });
  }
  function fischer(g,index){
    const centers=fischerCenters(g),center=index===undefined?centers[0]:Number(index);
    if(!centers.includes(center))throw Error('Choose an acyclic tetrahedral carbon with at least two explicit substituents. Benzene, double-bond carbons and carbocations do not have this local Fischer view.');
    const adj=adjacency(g),arms=adj[center].map(b=>({label:label(g,branch(g,b.i,[center])),atom:b.i}));
    for(let k=0;k<(g.hydrogens[center]||0);k++)arms.push({label:'H',atom:null});
    return {center,arms,note:'Local, single-center Fischer projection. Horizontal bonds point toward you; vertical bonds point away. Arrangement is illustrative, not an inferred R/S assignment.'};
  }
  function newmanBonds(g){
    const adj=adjacency(g);return g.bonds.map((_,i)=>i).filter(i=>{
      const b=g.bonds[i];if(b.order!==1||!tetrahedral(g,b.a,adj)||!tetrahedral(g,b.b,adj))return false;
      const seen=new Set([b.a]),queue=[b.a];
      while(queue.length){const j=queue.shift();for(const n of adj[j]){if(n.bond===i)continue;if(n.i===b.b)return false;if(!seen.has(n.i)){seen.add(n.i);queue.push(n.i);}}}return true;
    });
  }
  function newman(g,index,reverse=false){
    const eligible=newmanBonds(g),bond=index===undefined?eligible[0]:Number(index);
    if(!eligible.includes(bond))throw Error('Choose an acyclic single bond between two tetrahedral carbons. Ring bonds, multiple bonds and carbocation centers need a different geometry. Try ethanol or butane.');
    const b=g.bonds[bond],front=reverse?b.b:b.a,back=reverse?b.a:b.b,adj=adjacency(g);
    function groups(i,other){const out=adj[i].filter(n=>n.i!==other).map(n=>({label:label(g,branch(g,n.i,[i,other])),atom:n.i}));for(let k=0;k<(g.hydrogens[i]||0);k++)out.push({label:'H',atom:null});return out;}
    return {bond,front,back,frontGroups:groups(front,back),backGroups:groups(back,front),note:'Look along the selected C–C bond. The dot is the front carbon; the circle is the rear carbon. Rotating the rear groups changes an illustrative conformer, not connectivity.'};
  }
  function condensed(g){
    if(g.bonds.length!==g.atoms.length-1)return null;
    const adj=adjacency(g);
    function emit(i,parent){let s=g.atoms[i]+(g.hydrogens[i]?'H'+(g.hydrogens[i]>1?g.hydrogens[i]:''):'')+(g.charges?.[i]?'⁺':'');const children=adj[i].filter(b=>b.i!==parent);children.forEach((b,k)=>{const part=(b.order===2?'=':b.order===3?'≡':'')+emit(b.i,i);s+=k===children.length-1?part:'('+part+')';});return s;}
    const start=adj.findIndex(a=>a.length<=1);return emit(start<0?0:start,-1);
  }
  const api={fischerCenters,fischer,newmanBonds,newman,condensed};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MoleculeProjections=api;
})(typeof self!=='undefined'?self:globalThis);
