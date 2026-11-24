/* Alternate representations of the same neutral, unsubstituted benzene ring. */
(function(root){
  'use strict';
  const modes=['kekuleA','kekuleB','electrons','cloud'];
  function matches(g){
    if(g?.atoms?.length!==6||g.bonds?.length!==6||!g.atoms.every(e=>e==='C')||g.hydrogens?.length!==6||!g.hydrogens.every(h=>h===1))return false;
    if(['charges','isotopes','radicalElectrons'].some(k=>g[k]?.some(Boolean)))return false;
    const adj=Array.from({length:6},()=>new Set()),orderSum=Array(6).fill(0);
    for(const {a,b,order} of g.bonds){if(!adj[a]||!adj[b]||a===b||adj[a].has(b)||![1,2,1.5].includes(order))return false;adj[a].add(b);adj[b].add(a);orderSum[a]+=order;orderSum[b]+=order;}
    const visited=new Set([0]);for(const i of visited)for(const j of adj[i])visited.add(j);
    return visited.size===6&&adj.every(ns=>ns.size===2)&&(orderSum.every(n=>n===3)||g.bonds.every(b=>b.aromatic===true));
  }
  function svg(mode,color){
    if(!modes.includes(mode))throw Error('Unknown benzene representation');
    const ink=/^(#[\da-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]+)$/i.test(color)?color:'#385968';
    const cloud=mode==='cloud',cy=74,cx=99,r=53;
    const points=Array.from({length:6},(_,i)=>{const t=i*Math.PI/3;return [cx+r*Math.cos(t),cy+r*Math.sin(t)*(cloud?.43:1)];});
    const ring=`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${ink}" stroke-width="3"/>`;
    let lines='',marks='';
    if(!cloud){for(let i=mode==='kekuleB'?1:0;i<6;i+=2){
      const [x,y]=points[i],[u,v]=points[(i+1)%6];
      if(mode==='electrons'){for(const k of [.41,.59])marks+=`<circle cx="${cx+(.73*(x*(1-k)+u*k-cx))}" cy="${cy+(.73*(y*(1-k)+v*k-cy))}" r="3.2" fill="${ink}"/>`;}
      else lines+=`<path d="M${cx+.76*(x-cx)} ${cy+.76*(y-cy)}L${cx+.76*(u-cx)} ${cy+.76*(v-cy)}" fill="none" stroke="${ink}" stroke-width="2.6"/>`;
    }}else{
      // Project two annular regions, one on either side of the nuclear plane. No phase or charge is encoded by colour.
      const lobe=y=>`<g fill="none" stroke="${ink}"><ellipse cx="${cx}" cy="${y}" rx="49" ry="16" stroke-width="20" opacity=".09"/><ellipse cx="${cx}" cy="${y}" rx="49" ry="16" stroke-width="14" opacity=".15"/><ellipse cx="${cx}" cy="${y}" rx="49" ry="16" stroke-width="8" opacity=".22"/></g>`;
      lines=lobe(cy+29);marks=lobe(cy-29);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220" viewBox="0 0 198 148" data-benzene-mode="${mode}">${lines}${ring}${marks}</svg>`;
  }
  function setup(select,changed){for(const mode of modes){const opt=document.createElement('option');opt.value=mode;root.AtlasI18n.bindText(opt,'benz.'+mode);select.append(opt);}select.addEventListener('change',changed);}
  const api={matches,svg,setup};root.BenzeneView=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
