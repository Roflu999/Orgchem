/* Stable molecular state, stereoisomer and conformer identity. No chemical reinterpretation. */
(function(root){
  'use strict';
  const isRecord=g=>g?.schema==='bond-atlas/3'&&typeof g.stereoisomerId==='string';
  function validate(g){
    if(!isRecord(g)||!Array.isArray(g.atoms)||!Array.isArray(g.atomIds)||g.atoms.length!==g.atomIds.length||new Set(g.atomIds).size!==g.atomIds.length)throw Error('Invalid mapped molecular record.');
    for(const key of ['charges','isotopes','hydrogens'])if(!Array.isArray(g[key])||g[key].length!==g.atoms.length)throw Error('Molecular '+key+' must match the atom mapping.');
    if(!Array.isArray(g.bonds)||g.bonds.some(b=>!Number.isInteger(b.a)||!Number.isInteger(b.b)||b.a<0||b.b<0||b.a>=g.atoms.length||b.b>=g.atoms.length))throw Error('Invalid mapped bonds.');
    return g;
  }
  function conformer(g){return g.conformers?.find(c=>c.id===g.selectedConformerId)||g.conformers?.[0]||null;}
  function geometry(g){
    if(!isRecord(g))return null;const c=conformer(g);if(!c)return null;
    if(!Array.isArray(c.atoms)||c.atoms.some(a=>![a.x,a.y,a.z].every(Number.isFinite)))throw Error('The selected conformer has invalid coordinates.');
    return {atoms:c.atoms,bonds:c.bonds||g.bonds,conformer:c};
  }
  function withConformer(g,id){validate(g);if(!g.conformers?.some(c=>c.id===id))throw Error('Conformer not found.');return {...g,selectedConformerId:id};}
  function cacheKey(g){
    // Canonical molecular identity is not an array-order identity.
    return g.id+':'+(isRecord(g)?(conformer(g)?.id||'no-3d')+':'+g.atomIds.join(','):JSON.stringify([g.atoms,g.bonds,g.hydrogens,g.charges]));
  }
  function bondStereoLabel(b, unspecified='unspecified', unavailable='assigned (descriptor unavailable)'){
    if(!b.descriptor)return b.specified?unavailable:unspecified;
    return b.descriptor+(b.cisTrans?' ('+b.cisTrans+')':'');
  }
  function stereoLabel(g, unspecified='unspecified', unavailable='assigned (descriptor unavailable)'){
    if(!isRecord(g))return 'Unassigned stereochemistry';
    const label=i=>g.atoms[i]+(i+1);
    const centers=(g.stereo?.centers||[]).map(c=>(Number.isInteger(c.atom)?label(c.atom):c.atomId)+': '+(c.cip||(c.specified?unavailable:unspecified)));
    const bonds=(g.stereo?.bonds||[]).map(b=>label(b.a)+'–'+label(b.b)+': '+bondStereoLabel(b,unspecified,unavailable));
    return [...centers,...bonds].join(' · ')||'No assigned stereogenic features';
  }
  function themedSVG(svg,ink){
    if(typeof svg!=='string'||!svg.includes('<svg'))throw Error('Stereochemical depiction is unavailable.');
    return svg.replace(/#000000/gi,ink).replace(/#ffffff/gi,'transparent');
  }
  function imageURL(svg){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
  function prettyFormula(formula){return String(formula).replace(/\[(\d+)([A-Z][a-z]?)\]/g,(_,mass,symbol)=>mass.replace(/\d/g,d=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])+symbol).replace(/\d/g,d=>'₀₁₂₃₄₅₆₇₈₉'[Number(d)]);}
  const api={isRecord,validate,conformer,geometry,withConformer,cacheKey,stereoLabel,bondStereoLabel,themedSVG,imageURL,prettyFormula};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MoleculeRecords=api;
})(typeof self!=='undefined'?self:globalThis);
