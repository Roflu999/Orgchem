/* One local transformation at a time. Never interpret a failed match as no reaction. */
(function (root) {
  'use strict';
  // Products must fit the same base-atom budget as RDKit imports. This rule
  // family has no explicit H vertices, so all these base atoms are heavy atoms.
  const maxAtoms = 256;
  const valence = {C:4, N:3, O:2, F:1, Cl:1, Br:1, I:1};
  const atomicNumber = {C:6, N:7, O:8, F:9, Cl:17, Br:35, I:53};
  const groups = {
    'haloalkane-elimination':'Haloalkane', 'alcohol-dehydration':'Alcohol',
    'hydroxide-sn2':'Primary or methyl haloalkane', 'oxidation-aldehyde':'Primary alcohol',
    'oxidation-acid':'Primary alcohol', 'oxidation-ketone':'Secondary alcohol'
  };
  const own = (obj,k) => Object.prototype.hasOwnProperty.call(obj,k);
  function tree(atoms,bonds) {
    const adj = atoms.map(() => []), h = atoms.map(e => e ? valence[e] : 0);
    for (const {a,b,order} of bonds) {
      adj[a].push({to:b,order}); adj[b].push({to:a,order}); h[a]-=order; h[b]-=order;
    }
    return {atoms,bonds,adj,h};
  }
  function inspect(r) {
    if (!r || !Array.isArray(r.atoms) || !Array.isArray(r.bonds) || !Array.isArray(r.hydrogens)) return null;
    const n = r.atoms.length, valid = i => Number.isInteger(i) && i >= 0 && i < n;
    if (!n || n > maxAtoms || r.bonds.length !== n-1 || r.hydrogens.length !== n ||
        (r.notation != null && (typeof r.notation !== 'string' || r.notation.length > 1024 || /[\[\]@/\\|.]/.test(r.notation)))) return null;
    for (const k of ['charges','isotopes','radicals','radicalElectrons','formalCharges']) {
      if (k in r && (!Array.isArray(r[k]) || r[k].length !== n || Array.from(r[k]).some(v => v !== 0))) return null;
    }
    if (r.charge || r.formalCharge || r.radical || r.aromatic) return null;
    // Unspecified potential centres carry no configuration to preserve. Specified
    // centres, explicit H atoms, isotopes and radicals must not silently disappear.
    if (r.stereo != null) {
      const s = r.stereo;
      if (!Array.isArray(s.centers) || s.centers.length > n || !Array.isArray(s.bonds) || s.bonds.length > n-1 ||
          (s.unsupported != null && (!Array.isArray(s.unsupported) || s.unsupported.length))) return null;
      for (const c of s.centers) if (!c || c.specified !== false || c.cip || (c.atom != null && !valid(c.atom))) return null;
    }
    for (let i=0;i<n;i++) if (typeof r.atoms[i] !== 'string' || !own(valence,r.atoms[i]) || !Number.isInteger(r.hydrogens[i])) return null;
    const pair = (a,b) => Math.min(a,b)*n + Math.max(a,b);
    const edges = new Set(), doubleAtoms = new Set(), alkenes = new Set();
    for (const b of r.bonds) {
      if (!b || !valid(b.a) || !valid(b.b) || b.a === b.b || ![1,2].includes(b.order) || b.stereo || b.direction || b.aromatic) return null;
      const key = pair(b.a,b.b);
      if (edges.has(key)) return null;
      edges.add(key);
      if (b.order === 2) {
        const elems=[r.atoms[b.a],r.atoms[b.b]].sort().join('');
        if ((elems !== 'CC' && elems !== 'CO') || doubleAtoms.has(b.a) || doubleAtoms.has(b.b)) return null;
        doubleAtoms.add(b.a); doubleAtoms.add(b.b); // No cumulenes or axial stereo.
        if (elems === 'CC') alkenes.add(key);
      }
    }
    for (const s of r.stereo?.bonds || []) {
      if (!s || s.specified !== false || s.descriptor || s.cisTrans || !valid(s.a) || !valid(s.b) || !alkenes.delete(pair(s.a,s.b))) return null;
    }
    const g = tree(r.atoms,r.bonds), seen = new Set([0]);
    for (const i of seen) for (const e of g.adj[i]) seen.add(e.to);
    return seen.size === n && g.h.every((h,i) => h >= 0 && h === r.hydrogens[i]) ? g : null;
  }

  // On a tree, a rooted atom plus its sorted, bond-labelled child trees is a
  // complete isomorphism signature. Write that signature directly as SMILES.
  // A directional mark is relative to traversal, not to the numeric atom order.
  function roots(g) {
    const degree=g.adj.map(row=>row.length);
    let leaves=[], remaining=0;
    g.atoms.forEach((el,i)=>{if (el) {remaining++; if (degree[i]<=1) leaves.push(i);}});
    // Keep the familiar leaf-first formulas on short trees and straight chains.
    // On a large branched tree its one or two centres are canonical roots:
    // peeling leaves avoids writing a full SMILES for every terminal substituent.
    if (remaining<=64 || leaves.length<=2) return leaves;
    while (remaining>2) {
      remaining-=leaves.length;
      const layer=[];
      for (const i of leaves) for (const {to} of g.adj[i]) if (--degree[to]===1) layer.push(to);
      leaves=layer;
    }
    return leaves;
  }
  function writer(g,marks=[]) {
    const cache = new Map();
    function branch(i,from) {
      const key = i*(g.atoms.length+1)+from+1;
      if (cache.has(key)) return cache.get(key);
      const children = [];
      for (const {to,order} of g.adj[i]) if (to !== from) {
        let bond = order === 2 ? '=' : '';
        for (const [a,b,dir] of marks) {
          if (i === a && to === b) bond=dir;
          if (i === b && to === a) bond=dir === '/' ? '\\' : '/';
        }
        children.push(bond+branch(to,i));
      }
      children.sort();
      const main = children.pop() || '';
      const smiles = g.atoms[i]+children.map(c => '('+c+')').join('')+main;
      cache.set(key,smiles);
      return smiles;
    }
    function smiles() {
      // Break ties independently of parent numbering, including stereo marks.
      let best;
      for (const i of (g.roots ??= roots(g))) {
        const s = branch(i,-1);
        if (!best || s.length < best.length || (s.length === best.length && s < best)) best=s;
      }
      return best;
    }
    return {branch,smiles};
  }
  function* sites(id,g) {
    const saturatedC = i => g.atoms[i] === 'C' && g.adj[i].every(e => e.order === 1);
    for (let x=0;x<g.atoms.length;x++) {
      if (g.adj[x].length !== 1) continue;
      const c = g.adj[x][0].to, el = g.atoms[x];
      if (!saturatedC(c)) continue;
      const rest = g.adj[c].filter(e => e.to !== x);
      const halo = ['Cl','Br','I'].includes(el);
      const alcohol = el === 'O' && g.h[x] === 1 && rest.every(e => g.atoms[e.to] === 'C');
      if ((id === 'haloalkane-elimination' && halo) || (id === 'alcohol-dehydration' && alcohol)) {
        for (const {to:b} of rest) if (saturatedC(b) && g.h[b] > 0) yield {c,x,b};
      } else if (id === 'hydroxide-sn2' && halo && g.h[c] >= 2 && rest.every(e => g.atoms[e.to] === 'C')) yield {c,x};
      else if (alcohol && id.startsWith('oxidation-') && (id === 'oxidation-ketone' ? g.h[c] === 1 : g.h[c] >= 2)) yield {c,x};
    }
  }
  function transform(id,g,{c,x,b}) {
    const atoms = g.atoms.slice(), bonds = [];
    const remove = b !== undefined || id === 'hydroxide-sn2';
    if (remove) atoms[x]=null; // Retain parent indices internally; this atom left the organic product.
    const partner = b === undefined ? x : b;
    for (const edge of g.bonds) {
      if (remove && (edge.a === x || edge.b === x)) continue;
      bonds.push((edge.a === c && edge.b === partner) || (edge.b === c && edge.a === partner) ? {...edge,order:2} : edge);
    }
    if (id === 'hydroxide-sn2' || id === 'oxidation-acid') {
      bonds.push({a:c,b:atoms.length,order:1}); atoms.push('O');
    }
    return tree(atoms,bonds);
  }
  function alkeneEnd(g,w,i,other) {
    const arms = g.adj[i].filter(e => e.to !== other).map(e => e.to);
    if (!arms.length) return {same:true}; // Terminal CH2.
    if (arms.length === 1) return {high:arms[0]}; // Heavy atom outranks H.
    const [a,b] = arms;
    if (w.branch(a,i) === w.branch(b,i)) return {same:true};
    const za = atomicNumber[g.atoms[a]], zb = atomicNumber[g.atoms[b]];
    // Distinct branches with the same first element need deeper CIP rules.
    return za === zb ? {} : {high:za > zb ? a : b};
  }
  function alkeneForms(g,w,c,b) {
    const l=alkeneEnd(g,w,c,b), r=alkeneEnd(g,w,b,c);
    if (l.same || r.same) return [['not applicable',w.smiles()]];
    if (l.high === undefined || r.high === undefined) return [['E/Z unresolved',w.smiles()]];
    return ['E','Z'].map(stereo => {
      const notation = ['/','\\'].map(dir => writer(g,[[l.high,c,dir],[b,r.high,stereo === 'E' ? dir : dir === '/' ? '\\' : '/']]).smiles());
      return [stereo,notation.sort()[0]];
    });
  }
  function hasUnassignedCenter(g,w) {
    return g.atoms.some((el,i) => {
      if (el !== 'C' || g.h[i] > 1 || g.adj[i].some(e => e.order !== 1)) return false;
      const ligands = g.adj[i].map(e => w.branch(e.to,i));
      if (g.h[i]) ligands.push('H');
      return new Set(ligands).size === 4;
    });
  }
  function parentChoice(g,{c,x,b}) {
    const choice = {carbon:c+1};
    const ox = g.atoms[x] === 'O';
    choice[ox ? 'oxygen' : 'leavingAtom']=x+1;
    if (b !== undefined) choice.betaCarbon=b+1;
    return {choice,text:`C${c+1}-${g.atoms[x]}${x+1}`+(b === undefined ? '' : `, beta H on C${b+1}`)};
  }
  function describe(id,g,item,substrate) {
    const {productSmiles,stereo,unassignedCenters,siteChoices,siteTexts,x} = item;
    const el=g.atoms[x], sn2=id === 'hydroxide-sn2', e2=id === 'haloalkane-elimination', dry=id === 'alcohol-dehydration';
    const acid=id === 'oxidation-acid', ketone=id === 'oxidation-ketone';
    const kind=sn2 ? 'Alcohol' : e2 || dry ? 'Alkene' : acid ? 'Carboxylic acid' : ketone ? 'Ketone' : 'Aldehyde';
    const sites = (siteTexts.length > 1 ? 'Equivalent choices for this connectivity: ' : 'Parent site: ')+siteTexts.join('; ');
    const label=kind+(stereo === 'not applicable' ? '' : ` (${stereo})`)+': '+productSmiles;
    const products=productSmiles+(sn2 ? '' : ' + H2O')+(e2 || sn2 ? ' + '+el+'-' : '');
    const lhs=substrate+(e2 || sn2 ? ' + OH-' : dry ? '' : acid ? ' + 2[O]' : ' + [O]');
    const title=sn2 ? 'Concerted substitution (SN2)' : e2 ? 'Concerted elimination (E2)' : dry ? 'Net acid-catalysed dehydration' : 'Net oxidation to '+kind.toLowerCase();
    let detail=sn2 ? 'Hydroxide replaces the halide by backside attack. Steric hindrance and competing elimination can affect the outcome.' :
      e2 ? 'Hydroxide removes a beta hydrogen anti to the leaving halogen as the C=C bond forms; substitution can compete.' :
      dry ? 'Heating with acid removes water. Only direct C=C formation is modelled, not carbocation rearrangements or other competing pathways.' :
      acid ? 'Excess oxidant under reflux oxidises the primary alcohol through the aldehyde. [O] counts oxidising equivalents.' :
      ketone ? 'Oxidation removes H from the secondary alcohol carbon and OH, giving C=O. [O] counts an oxidising equivalent.' :
      'One oxidising equivalent [O] gives the aldehyde; distillation can limit further oxidation.';
    if (item.spectatorStereoUnresolved) detail+=' A retained C=C has unspecified geometry. This SMILES gives connectivity only; combinations of alkene configurations are not enumerated.';
    else if (stereo === 'E/Z unresolved') detail+=' Both E and Z are possible by connectivity; their configurations are unresolved in this SMILES.';
    if (stereo === 'E' || stereo === 'Z') detail+=` The SMILES specifies the ${stereo} double bond.`;
    if (unassignedCenters) detail+=' Tetrahedral stereochemistry is unresolved; R/S forms are not enumerated.';
    detail+=' One site reacts at a time; the other sites are retained. No yield or selectivity is predicted.';
    return {label,sites,products,productSmiles,group:groups[id],siteChoices,stereo,unassignedCenters,
      stages:[{title,scheme:lhs+' → '+products,detail:sites+'. '+detail}]};
  }
  function enumerate(id,record) {
    if (typeof id !== 'string' || !own(groups,id)) return [];
    const g=inspect(record);
    if (!g || (id==='oxidation-acid' && g.atoms.length===maxAtoms)) return [];
    const found=new Map();
    for (const s of sites(id,g)) {
      const p=transform(id,g,s), w=writer(p), constitution=w.smiles();
      // Do not assign or combinatorially expand a spectator's unspecified E/Z.
      // Test its ligands in the product: editing elsewhere may break symmetry.
      const spectatorStereoUnresolved = p.bonds.some(({a,b,order}) => order === 2 && p.atoms[a] === 'C' && p.atoms[b] === 'C' &&
        !(a === s.c && b === s.b || a === s.b && b === s.c) && !alkeneEnd(p,w,a,b).same && !alkeneEnd(p,w,b,a).same);
      const forms=spectatorStereoUnresolved ? [['E/Z unresolved',constitution]] :
        s.b === undefined ? [['not applicable',constitution]] : alkeneForms(p,w,s.c,s.b);
      const {choice,text}=parentChoice(g,s);
      for (const [stereo,productSmiles] of forms) {
        const key=constitution+'|'+stereo;
        if (!found.has(key)) found.set(key,{productSmiles,stereo,spectatorStereoUnresolved,unassignedCenters:hasUnassignedCenter(p,w),siteChoices:[],siteTexts:[],x:s.x});
        found.get(key).siteChoices.push(choice); found.get(key).siteTexts.push(text);
      }
    }
    if (!found.size) return [];
    const substrate=writer(g).smiles();
    return Array.from(found.keys()).sort().map(k => describe(id,g,found.get(k),substrate));
  }
  // Preserve a successful, more detailed single-site baseline (e.g. an SN2 diagram).
  function shouldOverride(baseline,alternatives) {
    return alternatives.length > 0 && (!baseline || !!baseline.reason || alternatives.length > 1 ||
      alternatives[0].siteChoices.length > 1 || alternatives[0].stereo !== 'not applicable' || alternatives[0].unassignedCenters);
  }
  const scope = `One saturated site on a connected neutral tree of up to ${maxAtoms} heavy atoms (C, N, O, F, Cl, Br, I). `+
    'Spectator C=O and C=C are retained; no aromatic, cumulated or triple bonds. Only Cl, Br and I are modelled as leaving groups. '+
    `The organic product must also fit ${maxAtoms} atoms. No assigned starting stereo, isotopes, radicals, rearrangements, R/S enumeration or yield ranking.`;
  const api = {enumerate,shouldOverride,maxAtoms,scope};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  root.ReactionSites=api;
})(typeof window !== 'undefined' ? window : globalThis);
