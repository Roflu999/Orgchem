/* Bounded CIE 9701 teaching transformations; a child is one selected organic
   structure, not a prediction of the contents, yield or purity of a vessel. */
(function (root) {
  'use strict';
  const cjs = typeof module !== 'undefined' && module.exports;
  const chem = cjs ? require('./chemistry.js') : root.Chem;
  const sites = cjs ? require('./reaction-sites.js') : root.ReactionSites;
  const additions = cjs ? require('./reaction-addition.js') : root.ReactionAddition;
  const substitutions = cjs ? require('./reaction-substitution.js') : root.ReactionSubstitution;
  const radicals = cjs ? require('./reaction-aromatic.js') : root.ReactionAromatic;
  const roles = ['substrate','reagent','catalyst','solvent'];
  const stock = [
    ['water','Water','H2O','O',['solvent','reagent','substrate']],
    ['ethanol','Ethanol','C2H5OH','CCO',['solvent','reagent','substrate']],
    ['methane','Methane','CH4','C',['substrate']],
    ['hydroxide','Sodium hydroxide','NaOH','[Na+].[OH-]',['reagent'],'Separate ions; hydroxide is the reacting ion.'],
    ['nabh4','Sodium borohydride','NaBH4','[Na+].[BH4-]',['reagent'],'Separate ions; borohydride supplies hydride equivalents.'],
    ['hydrogen','Hydrogen','H2','[H][H]',['reagent']],
    ['nickel','Nickel','Ni','[Ni]',['catalyst'],'Ni represents a solid nickel catalyst surface, not a free gaseous atom.'],
    ['chlorine','Chlorine','Cl2','ClCl',['reagent']],
    ['dichromate','Acidified potassium dichromate(VI)','K2Cr2O7 + H2SO4','[K+].[K+].[O-][Cr](=O)(=O)O[Cr](=O)(=O)[O-]',['reagent'],
      'The diagram shows the potassium and dichromate(VI) ions. The reagent includes dilute sulfuric acid; select water as the medium.']
  ].map(([id,label,formula,smiles,roles,viewNote]) => ({id,label,formula,smiles,roles,viewNote}));
  const conditions = [['ambient','Room temperature'],['heat','Heat'],['reflux','Heat under reflux'],
    ['pressure','Heat under hydrogen pressure'],['uv','UV light'],['distil','Heat under distillation']].map(([id,label]) => ({id,label}));
  const byId = new Map(stock.map(item => [item.id,item]));
  const fail = (reason,detail) => ({ok:false,reason,detail,ruleId:null,label:null,alternatives:[]});
  const success = (ruleId,label,detail,alternatives) => ({ok:true,reason:null,ruleId,label,detail,alternatives});
  const scope = detail => fail('outside-scope',detail);
  const noSite = detail => fail('no-site',detail);
  const at = detail => fail('condition',detail);
  const medium = detail => fail('medium',detail);
  const sub = (atoms,hydrogens,bonds=[]) => ({atoms,hydrogens,bonds});
  const organicStock = {methane:sub(['C'],[4]), water:sub(['O'],[2]),
    ethanol:sub(['C','C','O'],[3,2,1],[{a:0,b:1,order:1},{a:1,b:2,order:1}])};

  // Compare the atoms, attached hydrogens, charges and bonds of the tiny stock
  // structures. An ethanol name on dimethyl ether must not select the solvent.
  function stockIdentity(g) {
    if (!g || !Array.isArray(g.atoms) || g.atoms.length < 1 || g.atoms.length > 3 ||
        !Array.isArray(g.bonds) || g.bonds.length > 2 || !Array.isArray(g.hydrogens) || g.hydrogens.length !== g.atoms.length ||
        g.radical || g.charge || g.formalCharge || g.aromatic || g.stereo?.unsupported?.length || g.stereo?.bonds?.length || g.stereo?.centers?.length) return null;
    const n = g.atoms.length;
    for (const k of ['isotopes','radicals','radicalElectrons','charges','formalCharges']) {
      if (k in g && (!Array.isArray(g[k]) || g[k].length !== n || Array.from(g[k]).some(v => !Number.isInteger(v) || (k !== 'charges' && k !== 'formalCharges' && v !== 0)))) return null;
    }
    if (g.charges && g.formalCharges && g.charges.some((v,i)=>v!==g.formalCharges[i])) return null;
    const charges = g.charges || g.formalCharges || [];
    if (Array.from(g.atoms).some((e,i)=>typeof e!=='string' || !Number.isInteger(g.hydrogens[i]) || g.hydrogens[i]<0) ||
        (g.notation != null && (typeof g.notation!=='string' || /\[\d|[@|/\\]/.test(g.notation)))) return null;
    const tags = Array.from(g.atoms,(e,i)=>`${e}:${g.hydrogens[i]}:${charges[i] || 0}`);
    const edges = [];
    for (const b of g.bonds) {
      if (!b || b.a === b.b || !Number.isInteger(b.a) || !Number.isInteger(b.b) || !tags[b.a] || !tags[b.b] || b.order !== 1 || b.aromatic || b.stereo || b.direction) return null;
      edges.push([tags[b.a],tags[b.b]].sort().join('-'));
    }
    const key = tags.sort().join(',')+'|'+edges.sort().join(',');
    return stockKeys.get(key) || null;
  }
  const stockKeys = new Map([
    ['C:4:0|','methane'],['O:2:0|','water'],['C:2:0,C:3:0,O:1:0|C:2:0-C:3:0,C:2:0-O:1:0','ethanol'],
    ['H:0:0,H:0:0|H:0:0-H:0:0','hydrogen'],['Cl:0:0,Cl:0:0|Cl:0:0-Cl:0:0','chlorine'],['Ni:0:0|','nickel'],
    ['Na:0:1,O:1:-1|','hydroxide'],['B:4:-1,Na:0:1|','nabh4']
  ]);

  // Only connected, neutral trees with implicit H. Assigned E/Z is consumed
  // only when its sole C=C is hydrogenated; never strip spectator stereo.
  function inspect(g, hydrogenation, allowRing=false) {
    if (!g || !Array.isArray(g.atoms) || !Array.isArray(g.bonds) || !Array.isArray(g.hydrogens)) return null;
    const n = g.atoms.length;
    if (!n || n>256 || (allowRing ? g.bonds.length>2*n : g.bonds.length!==n-1) || g.hydrogens.length!==n || g.charge || g.formalCharge || g.radical || (g.aromatic && !allowRing) ||
        (g.notation != null && (typeof g.notation !== 'string' || g.notation.length>1024 || /[\[\]@|.]/.test(g.notation)))) return null;
    for (const key of ['charges','formalCharges','isotopes','radicals','radicalElectrons']) {
      if (key in g && (!Array.isArray(g[key]) || g[key].length!==n || Array.from(g[key]).some(x=>x!==0))) return null;
    }
    const adj = Array.from({length:n},()=>new Map());
    const valid = i => Number.isInteger(i) && i>=0 && i<n;
    for (const b of g.bonds) {
      if (!b || !valid(b.a) || !valid(b.b) || b.a===b.b || adj[b.a].has(b.b) || ![1,2,3].includes(b.order) || (b.aromatic && !allowRing) || b.stereo || b.direction) return null;
      adj[b.a].set(b.b,b.order); adj[b.b].set(b.a,b.order);
    }
    for (let i=0;i<n;i++) {
      if (!Object.hasOwn(chem.VAL,g.atoms[i]) || !Number.isInteger(g.hydrogens[i]) || g.hydrogens[i]<0 ||
          g.hydrogens[i]+[...adj[i].values()].reduce((x,y)=>x+y,0)!==chem.VAL[g.atoms[i]]) return null;
    }
    const seen = new Set([0]);
    for (const i of seen) for (const j of adj[i].keys()) seen.add(j);
    if (seen.size!==n) return null;
    const doubles=g.bonds.filter(b=>b.order===2);
    const consumeEZ=hydrogenation && doubles.length===1 && g.atoms.every(e=>e==='C');
    if (/[/\\]/.test(g.notation || '') && !consumeEZ) return null;
    const s=g.stereo;
    if (s != null && (!Array.isArray(s.centers) || !Array.isArray(s.bonds) || s.centers.length>n || s.bonds.length>doubles.length ||
        (s.unsupported != null && (!Array.isArray(s.unsupported) || s.unsupported.length)) ||
        s.centers.some(c=>!c || c.specified!==false || c.cip || !valid(c.atom)) ||
        s.bonds.some(b=>!b || !valid(b.a) || !valid(b.b) || adj[b.a].get(b.b)!==2 || g.atoms[b.a]!=='C' || g.atoms[b.b]!=='C' ||
          !(b.specified===false && !b.descriptor && !b.cisTrans || consumeEZ && b.specified===true && ['E','Z'].includes(b.descriptor))))) return null;
    return adj;
  }

  // A rooted tree is identified by its element and its sorted, bond-labelled
  // child trees. Minimise over leaf roots, memoising directed edges so symmetry
  // does not require permuting equivalent atoms. The key is also reusable SMILES.
  function treeSmiles(g,adj,a,b) {
    const cache = new Map(), n = g.atoms.length;
    function branch(i,parent) {
      const key=i*(n+1)+parent+1;
      if (cache.has(key)) return cache.get(key);
      const children=[];
      for (const [j,order] of adj[i]) if (j!==parent) {
        const o=(i===a && j===b || i===b && j===a)?1:order;
        children.push(['','','=','#'][o]+branch(j,i));
      }
      children.sort();
      const main=children.pop() || '', text=g.atoms[i]+children.map(t=>'('+t+')').join('')+main;
      cache.set(key,text); return text;
    }
    let best;
    for (let i=0;i<n;i++) if (adj[i].size===1) {
      const s=branch(i,-1);
      if (!best || s.length<best.length || s.length===best.length && s<best) best=s;
    }
    return best;
  }

  function hydrogenate(g,adj,condition) {
    const unsat=g.bonds.filter(b=>b.order!==1), nitrile=unsat.length===1 && unsat[0].order===3 &&
      g.atoms.filter(e=>e==='N').length===1 && g.atoms.every(e=>e==='C'||e==='N') &&
      [unsat[0].a,unsat[0].b].some(i=>g.atoms[i]==='N') && g.atoms.length>2;
    if (!unsat.length) return noSite('No C=C or supported nitrile group is available for hydrogenation.');
    if (!nitrile && (!g.atoms.every(e=>e==='C') || !unsat.every(b=>b.order===2))) return scope('Hydrogenation covers isolated C=C bonds in acyclic hydrocarbons or one nitrile on a saturated alkyl group.');
    if (nitrile && condition!=='pressure') return at('Choose heat under hydrogen pressure for this nickel-catalysed nitrile reduction.');
    if (!nitrile && !['heat','pressure'].includes(condition)) return at('Choose heat for this hydrogen / nickel alkene example.');
    const ends = new Set(unsat.flatMap(b=>[b.a,b.b]));
    if (ends.size!==2*unsat.length || g.bonds.some(b=>b.order===1 && ends.has(b.a) && ends.has(b.b))) return scope('Conjugated and cumulated systems need other selectivity rules.');
    const options = new Map();
    for (const {a,b} of unsat) {
      const productSmiles=treeSmiles(g,adj,a,b);
      if (!options.has(productSmiles)) options.set(productSmiles,{productSmiles,siteLabels:[]});
      options.get(productSmiles).siteLabels.push(g.atoms[a]+(a+1)+(nitrile?'#':'=')+g.atoms[b]+(b+1));
    }
    const detail=nitrile ? 'Two H2 equivalents reduce R-C#N to R-CH2NH2. The nitrile carbon is retained; nickel is not incorporated. The primary amine is the syllabus product, not a purity prediction.' :
      'One H2 adds across one C=C on a nickel surface. Each carbon gains one H; nickel is not consumed. Other isolated double bonds can also react. This is one step, not a selectivity or stereoisomer prediction.';
    return success(nitrile?'nitrile-hydrogenation':'alkene-hydrogenation',nitrile?'Nitrile reduction':'Alkene hydrogenation',detail,
      [...options.values()].map(({productSmiles,siteLabels})=>({productSmiles,label:(nitrile?'Primary amine: ':'Hydrogenated product: ')+productSmiles,sites:siteLabels.join(' or '),detail})));
  }

  function oxidise(g,adj,condition) {
    const o=g.atoms.indexOf('O');
    if (o<0) return noSite('Oxidation here requires an alcohol or an aldehyde.');
    if (!g.atoms.every(e=>e==='C' || e==='O') || o!==g.atoms.lastIndexOf('O') ||
        g.bonds.some(b=>b.order!==1 && !(b.order===2 && (b.a===o || b.b===o)))) {
      return scope('Use an acyclic alcohol or aldehyde without other functional groups. Competing oxidations are not predicted.');
    }
    if (adj[o].size!==1) return noSite('The substrate must have an alcohol OH or an aldehyde group; an ether has neither.');
    const [[c,order]]=adj[o], h=g.hydrogens[c], reflux=condition==='reflux';
    const acidLimit=()=>scope('The carboxylic acid needs one more oxygen and would exceed the 256-atom product limit.');
    if (order===2) {
      if (!h) return noSite('A ketone has no hydrogen on its carbonyl carbon; it does not oxidise to an acid in this model.');
      if (!reflux) return at('To oxidise the aldehyde to an acid, keep it with excess oxidant under reflux rather than distilling it off.');
      if (g.atoms.length===sites.maxAtoms) return acidLimit();
      const atoms=[...g.atoms,'O'], end=atoms.length-1, next=[...adj,new Map([[c,1]])];
      next[c]=new Map(adj[c]).set(end,1);
      const productSmiles=treeSmiles({atoms},next);
      const detail='Reflux returns condensed vapour to the flask. The aldehyde stays in contact with excess acidified dichromate(VI), which oxidises -CHO to -COOH without changing the carbon skeleton.'+
        (h===2?' Methanoic acid can undergo further oxidation.':'');
      return success('aldehyde-oxidation','Aldehyde oxidation to carboxylic acid',detail,[{productSmiles,label:'Carboxylic acid: '+productSmiles,sites:`C${c+1}=O${o+1}`,detail}]);
    }
    if (!h) return noSite('A tertiary alcohol has no hydrogen on the carbon bearing OH. Forming a carbonyl would require breaking a C-C bond, outside this pathway.');
    const ketone=h===1, acid=!ketone && reflux, id=ketone?'oxidation-ketone':acid?'oxidation-acid':'oxidation-aldehyde';
    if (acid && g.atoms.length===sites.maxAtoms) return acidLimit();
    const alts=sites.enumerate(id,g);
    if (!alts.length) return scope('This alcohol has no supported oxidation pathway.');
    const detail=ketone?'Oxidation removes H from OH and from the carbon bearing it. Both carbon neighbours remain attached, giving a ketone under either setup; reflux does not convert it into a carboxylic acid.':
      acid?'Reflux returns the volatile aldehyde to the flask instead of collecting it. With excess acidified dichromate(VI), the primary alcohol oxidises first to the aldehyde and then to the carboxylic acid.'+(h===3?' Methanoic acid can undergo further oxidation.':''):
      'Distillation removes the volatile aldehyde as it forms from the primary alcohol. Separating it from acidified dichromate(VI) limits further oxidation to the acid.';
    return success(id,'Alcohol oxidation to '+(ketone?'ketone':acid?'carboxylic acid':'aldehyde'),detail,
      alts.map(({productSmiles,label,sites,stages})=>({productSmiles,label,sites,detail:stages[0].detail})));
  }

  function run(setup) {
    const {plates,condition='ambient'}=setup || {};
    if (!Array.isArray(plates) || !plates.length || plates.length>16) return fail('plates','Supply a substrate and a reagent.');
    if (!conditions.some(c=>c.id===condition)) return at('Choose one of the listed conditions.');
    const chosen = {}, ids = new Set();
    for (const p of plates) {
      if (!p || !roles.includes(p.role) || !!p.record===!!p.stockId || (p.id!=null && ids.has(p.id))) return fail('plates','Each component needs one identity and one role; plate IDs must be distinct.');
      if (p.id!=null) ids.add(p.id);
      if (chosen[p.role]) return fail('combination',`Use only one ${p.role} in this teaching setup. Mixed reagents, solvents and substrates are not predicted.`);
      const id = p.stockId || stockIdentity(p.record), item = byId.get(id);
      if (p.stockId && !item) return fail('identity','Unknown stock substance.');
      if (p.role!=='substrate' && !item) return fail('identity',`That structure has no supported ${p.role} identity.`);
      if (item && !item.roles.includes(p.role)) return fail('role',`${item.label} is not a ${p.role} in these pathways.`);
      chosen[p.role]={id,record:p.record || organicStock[id]};
    }
    const {substrate,reagent,catalyst,solvent}=chosen;
    if (!substrate || !reagent) return fail('plates','Choose one substrate and one reagent; a solvent or catalyst does not replace either.');
    const r=reagent.id, s=solvent?.id, g=substrate.record;
    if (r==='hydrogen' && catalyst?.id!=='nickel') return fail('catalyst','Add nickel as the catalyst for this hydrogenation.');
    if (r!=='hydrogen' && catalyst) return fail('catalyst','This pathway does not use that catalyst.');
    if (r==='nabh4') {
      if (!['water','ethanol'].includes(s)) return medium('Choose water or ethanol as a protic medium.');
      if (condition!=='ambient') return at('Choose room temperature for this mild borohydride reduction.');
    }
    if (r==='dichromate') {
      if (s!=='water') return medium('Choose water as the medium for acidified dichromate(VI). Ethanol would itself be oxidised.');
      if (!['distil','reflux'].includes(condition)) return at('Choose heat under distillation to collect a volatile product, or heat under reflux to keep it with excess oxidant. Heat alone does not specify which setup is used.');
    }
    const ring=r==='nabh4' && Array.isArray(g?.atoms) && Array.isArray(g.bonds) && g.bonds.length>=g.atoms.length;
    const adj=inspect(g,r==='hydrogen',ring);
    if (!adj) return scope('Use a connected, neutral substrate of up to 256 heavy atoms with implicit hydrogen. Most pathways require an acyclic structure; isotopes, radicals and retained assigned stereochemistry are outside this model.');
    if (r==='dichromate') return oxidise(g,adj,condition);
    if (ring) {
      const carbonyls=g.bonds.filter(({a,b,order})=>order===2 && [g.atoms[a],g.atoms[b]].sort().join('')==='CO');
      if (!carbonyls.length || !g.atoms.every(e=>e==='C' || e==='O') || g.bonds.some(b=>g.atoms[b.a]==='O' && g.atoms[b.b]==='O') ||
          !carbonyls.every(({a,b,aromatic})=>!aromatic && [...adj[g.atoms[a]==='C'?a:b].keys()].every(j=>j===(g.atoms[a]==='O'?a:b) || g.atoms[j]==='C'))) return noSite('Mapped ring reduction requires aldehyde or ketone carbonyls, not acid derivatives.');
      return fail('mapped-carbonyl','A mapped structure check is needed for this ring-containing aldehyde or ketone.');
    }
    if (r==='hydrogen') {
      if (s) return medium('Choose no added solvent for this gas / solid catalyst example.');
      return hydrogenate(g,adj,condition);
    }
    if (r==='hydroxide') {
      if (!['water','ethanol'].includes(s)) return medium('Choose water for substitution or ethanol for elimination.');
      if (!['heat','reflux'].includes(condition)) return at('Choose heat or reflux for this halogenoalkane pathway.');
      if (!g.atoms.every(e=>['C','Cl','Br','I'].includes(e)) || !g.bonds.every(b=>b.order===1)) return scope('Use a saturated, acyclic chloro-, bromo- or iodoalkane.');
      const aqueous=s==='water', id=aqueous?'hydroxide-sn2':'haloalkane-elimination';
      const alts=sites.enumerate(id,g);
      if (!alts.length) return noSite(aqueous?'This aqueous substitution model requires a methyl or primary C bonded to Cl, Br or I.':'Elimination needs a halide on saturated C and a hydrogen on a neighbouring carbon.');
      return success(id,aqueous?'Aqueous substitution':'Ethanolic elimination',aqueous?'Aqueous hydroxide replaces a halide with OH. The child contains the alcohol, not the halide salt.':'Heating with ethanolic hydroxide favours elimination. Substitution can compete; product ratios are not predicted.',
        alts.map(({label,productSmiles,sites,stages})=>({label,productSmiles,sites,detail:stages[0].detail})));
    }
    if (r==='nabh4') {
      if (g.bonds.some(b=>g.atoms[b.a]==='O' && g.atoms[b.b]==='O')) return scope('Peroxides are outside the carbonyl reduction model.');
      const alts=additions.independentSites('carbonyl-hydride',g);
      if (!alts.length) return noSite('Use an isolated aldehyde or ketone. Esters, acids, conjugated groups and other reducible functions are not modelled here.');
      const detail='Borohydride transfers a hydride equivalent to the carbonyl carbon; protonation of oxygen gives the alcohol. Methanal gives methanol, other aldehydes give primary alcohols and ketones give secondary alcohols. Only one site and its connectivity are shown.';
      return success('carbonyl-hydride','Borohydride reduction',detail,alts.map(({productSmiles,sites})=>({productSmiles,sites,label:'Alcohol: '+productSmiles,detail})));
    }
    if (r==='water' || r==='ethanol') {
      if (s && s!==r) return medium('Use the same liquid as reagent and medium, or leave the separate solvent unset. Competing nucleophiles are not modelled.');
      if (condition!=='ambient') return at('Use room temperature for this acyl chloride pathway.');
      if (g.atoms.length>64) return scope('The acyl chloride pathway supports up to 64 heavy atoms in the substrate.');
      const id='acyl-'+r, route=substitutions.run(id,g);
      if (!route.productSmiles || g.atoms.filter(e=>e==='C').length<2) return noSite('This pathway requires one alkanoyl chloride group attached to an alkyl group.');
      const water=r==='water', detail=water?'Water hydrolyses the acyl chloride to a carboxylic acid; HCl also forms. Water is a reactant, not a catalyst.':'Ethanol replaces chloride at the acyl carbon, forming an ethyl ester and HCl. Ethanol is consumed.';
      return success(id,water?'Acyl chloride hydrolysis':'Acyl chloride alcoholysis',detail,[{productSmiles:route.productSmiles,label:(water?'Carboxylic acid: ':'Ethyl ester: ')+route.productSmiles,sites:'Acyl carbon bonded to chlorine',detail}]);
    }
    if (r==='chlorine') {
      if (s) return medium('Use no added solvent for this alkane / chlorine example.');
      if (condition!=='uv') return at('UV light initiates the chlorine radical chain in this example.');
      // Validated connectivity only: the legacy radical template expects an offline graph.
      const route=radicals.run('radical-chlorination',sub(g.atoms,g.hydrogens,g.bonds));
      if (!route.productSmiles) return noSite('The first chlorination step is available for methane, ethane or 2,2-dimethylpropane.');
      return success('radical-chlorination','First radical substitution',route.products,[{productSmiles:route.productSmiles,label:'Chloroalkane: '+route.productSmiles,sites:'One of the equivalent C-H bonds',detail:route.products}]);
    }
    return scope('This combination has no teaching pathway.');
  }
  const api={stock,conditions,run,stockIdentity};
  if (cjs) module.exports=api;
  root.PlateChemistry=api;
})(typeof window !== 'undefined' ? window : globalThis);
