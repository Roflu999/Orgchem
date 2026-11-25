/* AQA mechanisms for single functional groups on acyclic, neutral substrates. */
(function (root) {
  'use strict';
  const entries = [];
  function entry(id, label, reagent, example, group, section) {
    entries.push({id, label, reagent, example, group, section});
  }
  const addition = ['Alkene', 'Electrophilic addition'];
  entry('alkene-hbr', 'Addition of hydrogen bromide', 'Hydrogen bromide', 'CC=C', ...addition);
  entry('alkene-br2', 'Addition of bromine', 'Bromine', 'C=C', ...addition);
  entry('alkene-h2so4', 'Formation of an alkyl hydrogensulfate', 'Sulfuric acid', 'CC=C', ...addition);
  entry('alkene-h2so4-hydrolysis', 'Sulfuric acid addition followed by hydrolysis', 'Sulfuric acid, then water', 'CC=C', ...addition);
  entry('alkene-hydration', 'Acid-catalysed hydration', 'Water and an acid catalyst', 'CC=C', ...addition);
  entry('haloalkane-elimination', 'Elimination of hydrogen halide', 'Hydroxide ion', 'CCBr', 'Haloalkane', 'Elimination');
  entry('alcohol-dehydration', 'Acid-catalysed dehydration', 'Acid catalyst', 'CCO', 'Alcohol', 'Elimination');
  const carbonyl = ['Aldehyde or ketone', 'Nucleophilic addition'];
  entry('carbonyl-hydride', 'Reduction by hydride addition', 'Sodium borohydride', 'CCC=O', ...carbonyl);
  entry('carbonyl-cyanide', 'Hydroxynitrile formation', 'Hydrogen cyanide and cyanide ion', 'CC=O', ...carbonyl);

  // Match the service's base-atom budget for both the starting graph and the
  // organic product that the viewer will reparse. Explicit H vertices are out of scope.
  const maxAtoms = 256;
  const growth = {'alkene-hbr':1,'alkene-hydration':1,'alkene-h2so4-hydrolysis':1,
    'alkene-br2':2,'alkene-h2so4':5,'carbonyl-cyanide':2};
  const fits = (id,n) => n + (growth[id] || 0) <= maxAtoms;
  const reject = reason => ({reason});
  const step = (title, from, to, detail) => ({title, scheme:`${from} → ${to}`, detail});
  const valence = {C:4, N:3, O:2, F:1, Cl:1, Br:1, I:1};
  const halogens = ['F','Cl','Br','I'];
  const node = (e,h=0,q=0) => ({e,h,q,edges:new Map()});
  const next = (g,i) => [...g[i].edges.keys()];
  const connect = (g,a,b,order=1) => { g[a].edges.set(b,order); g[b].edges.set(a,order); };
  const detach = (g,a,b) => { g[a].edges.delete(b); g[b].edges.delete(a); };
  const append = (g,a,e,h=0,q=0,order=1) => {
    const b = g.push(node(e,h,q))-1;
    connect(g,a,b,order); return b;
  };
  function inspect(r) {
    if (!r || !Array.isArray(r.atoms) || !Array.isArray(r.bonds) || !Array.isArray(r.hydrogens)) return null;
    const n = r.atoms.length;
    if (!n || n > maxAtoms || r.hydrogens.length !== n || r.bonds.length > 2*n || r.charge || r.formalCharge || r.radical || r.aromatic ||
        (r.notation != null && (typeof r.notation !== 'string' || r.notation.length > 1024 || /[@/\\\[\]|.]/.test(r.notation)))) return null;
    if (r.stereo != null) {
      const s=r.stereo;
      if (!Array.isArray(s.centers) || s.centers.length > n || !Array.isArray(s.bonds) || s.bonds.length > r.bonds.length ||
          (s.unsupported != null && (!Array.isArray(s.unsupported) || s.unsupported.length))) return null;
    }
    for (const k of ['charges','formalCharges','isotopes','radicals','radicalElectrons']) {
      if (k in r && !(Array.isArray(r[k]) && r[k].length === n && Array.from(r[k]).every(v => v === 0))) return null;
    }
    const g = [];
    for (let i=0;i<n;i++) {
      const e = r.atoms[i], h = r.hydrogens[i];
      if (typeof e !== 'string' || !Object.hasOwn(valence,e) || !Number.isInteger(h) || h < 0) return null;
      g.push(node(e,h));
    }
    const valid = i => Number.isInteger(i) && i >= 0 && i < n;
    for (const edge of r.bonds) {
      if (!edge) return null;
      const {a,b,order} = edge;
      if (!valid(a) || !valid(b) || a === b || g[a].edges.has(b) || ![1,2,3].includes(order) ||
          edge.aromatic || edge.stereo || edge.direction) return null;
      connect(g,a,b,order);
    }
    for (const c of r.stereo?.centers || []) if (!c || c.specified!==false || c.cip || !valid(c.atom) || g[c.atom].e!=='C') return null;
    for (const b of r.stereo?.bonds || []) if (!b || b.specified!==false || b.descriptor || b.cisTrans || !valid(b.a) || !valid(b.b) ||
        g[b.a].e!=='C' || g[b.b].e!=='C' || g[b.a].edges.get(b.b)!==2) return null;
    if (g.some(v => [...v.edges.values()].reduce((s,o) => s+o,v.h) !== valence[v.e])) return null;
    const seen = new Set([0]);
    for (const i of seen) for (const j of next(g,i)) seen.add(j);
    return seen.size === n ? g : null;
  }

  // Canonical condensed formula of a tree. Longest carbon path first; tied paths
  // are ordered by their text, not by the input atom or bond numbering.
  function show(g, ringEnds=[], smiles=false) {
    // Find the longest carbon paths before formatting anything. Memoized
    // directed-edge depths avoid spelling out a whole molecule at every atom.
    const depths = new Map(), key = (i,parent) => i*(g.length+1)+parent+1;
    function depth(i,parent) {
      if (g[i].e !== 'C') return 0;
      const k=key(i,parent);
      if (!depths.has(k)) {
        let best=0;
        for (const j of g[i].edges.keys()) if (j!==parent) best=Math.max(best,depth(j,i));
        depths.set(k,best+1);
      }
      return depths.get(k);
    }
    const written = new Map();
    function walk(i,parent) {
      const k=key(i,parent);
      if (written.has(k)) return written.get(k);
      const {e,h,q,edges} = g[i];
      const hText = h ? 'H'+(h > 1 ? h : '') : '';
      const label = e+hText+(q > 0 ? '+' : q < 0 ? '-' : '');
      const ring = ringEnds.includes(i);
      let text = (q || ring ? '['+label+']' : smiles ? e : label)+(ring ? '1' : '');
      const children = next(g,i).filter(j => j !== parent).map(j => {
        const child = walk(j,i);
        return {depth:child.depth,text:['','','=',smiles ? '#' : '≡'][edges.get(j)] + child.text};
      }).sort((a,b) => b.depth-a.depth || Number(a.text.startsWith('='))-Number(b.text.startsWith('=')) || compare(a.text,b.text));
      const [main,...branches] = children;
      text += branches.map(c => '('+c.text+')').join('') + (main?.text || '');
      const path={text, depth:e === 'C' ? 1+(main?.depth || 0) : 0};
      written.set(k,path);
      return path;
    }
    const roots = g.map((v,i) => v.e==='C' && next(g,i).filter(j=>g[j].e==='C').length <= 1 ? depth(i,-1) : 0);
    const longest=Math.max(...roots);
    let best, fewest=Infinity;
    roots.forEach((d,i) => {
      if (d!==longest) return;
      const text=walk(i,-1).text, branches=text.split('(').length-1;
      if (branches<fewest || branches===fewest && text<best) { best=text; fewest=branches; }
    });
    return best;
  }
  const productSmiles = g => show(g,[],true);
  function compare(a,b) { return a < b ? -1 : a > b ? 1 : 0; }
  function find(r,g,group) {
    const sites = [];
    for (const {a,b,order} of r.bonds) {
      const [c,x] = g[a].e === 'C' ? [a,b] : [b,a];
      if (g[c].e !== 'C') continue;
      if (group === 'Alkene' && g[x].e === 'C' && order === 2 ||
          group === 'Haloalkane' && halogens.includes(g[x].e) && [...g[c].edges.values()].every(o => o === 1) ||
          group === 'Alcohol' && g[x].e === 'O' && g[x].h === 1 && [...g[c].edges.values()].every(o => o === 1) ||
          group === 'Aldehyde or ketone' && g[x].e === 'O' && order === 2 &&
            next(g,c).every(j => j === x || g[j].e === 'C')) sites.push({c,x});
    }
    if (!sites.length) return reject('no-rule');
    if (sites.length !== 1) return reject('ambiguous');
    const {c,x} = sites[0];
    if (r.bonds.length !== g.length-1 || g.some((v,i) => v.e !== 'C' && i !== x) ||
        g[x].e === 'F' || r.bonds.some(b => b.order !== 1 && !(g[c].edges.get(x) === 2 &&
          (b.a === c && b.b === x || b.a === x && b.b === c)))) return reject('unsupported');
    return {c,x};
  }

  // A hydride or alkyl shift from a neighbouring branched carbon can give a
  // more substituted cation. Do not present direct capture as the major route.
  function canRearrange(g,c) {
    const carbons = i => next(g,i).filter(j => g[j].e === 'C');
    const neighbours = carbons(c);
    return neighbours.some(j => Math.min(3,carbons(j).length) > neighbours.length);
  }

  function alkene(id,g,a,b,group,chosenCarbon=null,substrate=show(g)) {
    connect(g,a,b,1);
    if (id === 'alkene-br2') {
      // Render the bridge as a single ring closure: matching 1s denote the third bond.
      const br = append(g,a,'Br',0,1);
      const ionA = show(g,[br,b]);
      detach(g,a,br); connect(g,b,br);
      const ion = [ionA,show(g,[br,a])].sort()[0];
      g[br].q = 0; append(g,a,'Br');
      const products = show(g);
      return {group, products, productSmiles:productSmiles(g), stages:[
        step('Form the bromonium ion',substrate+' + Br-Br',ion+' + Br-',
          'The alkene pi pair attacks the nearer, partially positive Br. The Br-Br pair moves to the farther Br, while a lone pair on the nearer Br bonds to the other alkene carbon. Matching 1s close the three-membered ring.'),
        step('Open the bridge',ion+' + Br-',products,
          'A bromide lone pair attacks carbon opposite the bridge. The C-Br bridge bond pair returns to the bridging Br: one Br adds to each carbon, on opposite faces (anti addition). Only connectivity is shown, not a specific stereoisomer.') ]};
    }
    // Test both carbocations for equivalence before breaking a substitution tie.
    const cation = (c,h) => { g[c].q++; g[h].h++; const s=show(g); g[c].q--; g[h].h--; return s; };
    if (chosenCarbon==null && g[a].h === g[b].h && cation(a,b) !== cation(b,a)) return reject('ambiguous');
    const [c,h] = (chosenCarbon==null ? g[a].h <= g[b].h : chosenCarbon===a) ? [a,b] : [b,a];
    if (chosenCarbon==null && canRearrange(g,c)) return reject('ambiguous');
    const regio = chosenCarbon!=null ? `Follow the route with H added at parent C${h+1} and positive charge at C${c+1}. Carbocation substitution can favour one direction; no ratio or rearranged product is predicted.` : g[a].h === g[b].h ? 'The alkene ends are constitutionally equivalent.' :
      'The route shown favours the more substituted carbocation (Markovnikov addition); it does not predict an exclusive product.';
    g[c].q++; g[h].h++;
    const ion = show(g), hydration = id === 'alkene-hydration', hbr = id === 'alkene-hbr';
    const acid = hbr ? 'HBr' : hydration ? 'H3O+' : 'H2SO4';
    const base = hbr ? 'Br-' : hydration ? 'H2O' : 'HSO4-';
    const stages = [step('Protonate the alkene',substrate+' + '+acid,ion+' + '+base,
      `The pi pair forms a C-H bond; the acid bond pair stays with ${base}. ${regio} This scheme follows direct capture, without carbocation rearrangement.`)];
    g[c].q = 0;
    let products;
    if (hbr) {
      append(g,c,'Br'); products = show(g);
      stages.push(step('Capture by bromide',ion+' + Br-',products,'A bromide lone pair forms a bond to the planar carbocation. Either face is accessible; the formula does not assign stereochemistry.'));
    } else if (hydration) {
      const o = append(g,c,'O',2,1), oxonium = show(g);
      stages.push(step('Add water',ion+' + H2O',oxonium,'An oxygen lone pair on water forms a C-O bond to the planar carbocation. Either face can react; stereochemistry is not assigned.'));
      g[o].h--; g[o].q = 0; products = show(g);
      stages.push(step('Regenerate the acid',oxonium+' + H2O',products+' + H3O+','Water takes a proton from the oxonium ion. The O-H pair returns to the alcohol oxygen. Hydration is reversible.'));
    } else {
      const o = append(g,c,'O'), s = append(g,o,'S');
      append(g,s,'O',0,0,2); append(g,s,'O',0,0,2); append(g,s,'O',1);
      products = show(g);
      stages.push(step('Capture by hydrogensulfate',ion+' + HSO4-',products,'An oxygen lone pair of hydrogensulfate forms the C-O bond to the planar carbocation, giving an alkyl hydrogensulfate. No stereochemistry is assigned.'));
      if (id === 'alkene-h2so4-hydrolysis') {
        const ester = products;
        detach(g,o,s); g[o].h = 1; products = show(g);
        stages.push(step('Hydrolyse the sulfate ester (net)',ester+' + H2O',products+' + H2SO4',
          'Water supplies an oxygen lone pair for hydrolysis. Bond cleavage and proton transfers convert the sulfate ester to an alcohol and regenerate sulfuric acid; this net step does not assign an oxygen atom source.'));
      }
    }
    return {group, stages, products, productSmiles:productSmiles(g)};
  }

  function eliminate(g,c,x,group) {
    const alcohol = group === 'Alcohol', substrate = show(g), leaving = g[x].e;
    const betas = next(g,c).filter(j => g[j].e === 'C' && g[j].h > 0);
    if (!betas.length) return reject('no-rule');
    const degree = g[c].edges.size-1, stages = [];
    if (alcohol && degree > 1 && canRearrange(g,c)) return reject('ambiguous');
    let oxonium;
    if (alcohol) {
      g[x].h++; g[x].q++; oxonium = show(g);
      stages.push(step('Activate the hydroxyl group',substrate+' + H3O+',oxonium+' + H2O',
        'An alcohol oxygen lone pair accepts a proton. The acid O-H pair returns to water, so the leaving group is neutral water rather than hydroxide.'));
    }
    detach(g,c,x);
    const products = new Map();
    for (const b of betas) {
      connect(g,c,b,2); g[b].h--; products.set(show(g),productSmiles(g)); g[b].h++; connect(g,c,b,1);
    }
    if (products.size > 1) return reject('ambiguous');
    const [[alk,smiles]] = products;
    const stereo = ' The formula gives connectivity only; E/Z alternatives are not distinguished.';
    if (!alcohol) {
      const result = alk+' + H2O + '+leaving+'-';
      stages.push(step('Concerted elimination (E2)',substrate+' + OH-',result,
        `A hydroxide lone pair takes an anti-periplanar beta H. At the same time the C-H pair forms C=C and the C-${leaving} bond pair leaves with ${leaving}-. Hydroxide can also act as a nucleophile: substitution competes.`+stereo));
      return {group,stages,products:result,productSmiles:smiles};
    }
    if (degree === 1) {
      stages.push(step('Lose water and form the alkene',oxonium+' + H2O',alk+' + H2O + H3O+',
        'Water takes a beta proton. The C-H pair forms the pi bond as the C-O pair leaves with water. This concerted route avoids a free primary carbocation and regenerates the acid.'+stereo));
    } else {
      g[c].q = 1; const ion = show(g);
      stages.push(step('Lose water',oxonium,ion+' + H2O','The C-O pair leaves with water, giving a carbocation. The scheme follows direct elimination; it does not model rearrangement.'));
      stages.push(step('Form the alkene',ion+' + H2O',alk+' + H3O+','A water lone pair takes a beta proton and the C-H pair forms the pi bond to the carbocation. The acid catalyst is regenerated.'+stereo));
    }
    return {group,stages,products:alk+' + H2O',productSmiles:smiles};
  }

  function addToCarbonyl(id,g,c,o,group,substrate=show(g)) {
    const cn = id === 'carbonyl-cyanide';
    connect(g,c,o,1); g[o].q = -1;
    if (cn) append(g,append(g,c,'C'),'N',0,0,3); else g[c].h++;
    const alkoxide = show(g);
    g[o].q = 0; g[o].h++; const products = show(g);
    const attack = cn ? 'The carbon lone pair of cyanide forms a C-C bond to the carbonyl carbon; the nitrile triple bond stays intact.' :
      'In the AQA exam convention the lone pair of H- attacks the carbonyl carbon. H- represents a B-H hydride equivalent supplied by borohydride, not a free hydride ion in solution.';
    return {group,products,productSmiles:productSmiles(g),stages:[
      step('Attack the carbonyl carbon',substrate+(cn ? ' + CN-' : ' + H- (equivalent)'),alkoxide,
        attack+' The C=O pi pair moves to oxygen. Either face of the planar carbonyl can react: if an achiral substrate acquires a stereocentre, achiral reagents give a racemic mixture.'),
      step('Protonate the alkoxide',alkoxide+(cn ? ' + HCN' : ' + H2O'),products+(cn ? ' + CN-' : ' + OH-'),cn ?
        'The alkoxide oxygen takes H from HCN; the H-C bond pair returns to cyanide carbon. The hydroxynitrile has one more carbon than the starting carbonyl compound.' :
        'In the net proton-transfer step the alkoxide oxygen takes H from water; the water O-H pair stays with its oxygen. An aldehyde gives a primary alcohol (methanal gives methanol); a ketone gives a secondary alcohol.') ]};
  }

  function run(id,record) {
    const rule = entries.find(e => e.id === id);
    if (!rule) return reject('no-rule');
    const g = inspect(record);
    if (!g) return reject('unsupported');
    const {group} = rule, site = find(record,g,group);
    if (site.reason) return site;
    if (!fits(id,g.length)) return reject('unsupported');
    const {c,x} = site;
    if (group === 'Alkene') return alkene(id,g,c,x,group);
    if (group === 'Aldehyde or ketone') return addToCarbonyl(id,g,c,x,group);
    return eliminate(g,c,x,group);
  }
  const copyGraph = g => g.map(v=>({...v,edges:new Map(v.edges)}));
  // Compare opposite protonations of a single internal alkene. Exclude primary
  // carbocations and deduplicate orientations before offering alternative routes.
  function directions(id,record){
    if(!['alkene-hbr','alkene-hydration','alkene-h2so4','alkene-h2so4-hydrolysis'].includes(id))return [];
    const g=inspect(record);if(!g || !fits(id,g.length))return [];const {c,x}=find(record,g,'Alkene');
    if(c==null||g[c].h>1||g[x].h>1)return [];
    const substrate=show(g);
    const variants=[c,x].map(carbon=>{
      const h=carbon===c?x:c,route=alkene(id,copyGraph(g),c,x,'Alkene',carbon,substrate);
      return {...route,label:`H onto C${h+1}: ${route.productSmiles}`,sites:`H adds to parent C${h+1}; the nucleophile bonds at C${carbon+1}.`,siteChoices:[{carbon:carbon+1,protonatedCarbon:h+1}]};
    });
    return variants[0].productSmiles===variants[1].productSmiles?[]:variants;
  }
  // Isolated carbonyls and isolated alkenes can be followed independently. Do not
  // extrapolate these arrows to a conjugated system or to an acid derivative.
  function independentSites(id,record){
    const hydride=id==='carbonyl-hydride',bromine=id==='alkene-br2';if(!hydride&&!bromine)return [];
    const g=inspect(record);if(!g || !fits(id,g.length) || record.bonds.length!==g.length-1)return [];
    if(g.some(v=>!(hydride?['C','O']:['C','Br']).includes(v.e)))return [];
    // Allow ordinary alcohol/ether spectators (including a previously reduced
    // carbonyl). Do not carry peroxides, hemiacetals or acid derivatives through.
    if(hydride && g.some((v,i)=>v.e==='O' && ![...v.edges.values()].includes(2) &&
      next(g,i).some(c=>g[c].e!=='C' || [...g[c].edges.values()].some(o=>o!==1) ||
        next(g,c).some(j=>j!==i && g[j].e!=='C'))))return [];
    const doubles=record.bonds.filter(b=>b.order!==1);if(!doubles.length||doubles.some(b=>b.order!==2))return [];
    const ends=new Set(doubles.flatMap(b=>[b.a,b.b]));
    if(ends.size!==2*doubles.length || record.bonds.some(b=>b.order===1&&ends.has(b.a)&&ends.has(b.b)))return [];
    const candidates=[];
    for(const {a,b} of doubles){
      const [c,x]=g[a].e==='C'?[a,b]:[b,a];
      if(g[c].e!=='C'||g[x].e!==(hydride?'O':'C'))return [];
      if(hydride && next(g,c).some(j=>j!==x&&g[j].e!=='C'))return [];
      if(bromine && [c,x].some(i=>next(g,i).some(j=>g[j].e!=='C')))return [];
      candidates.push([c,x]);
    }
    const group=bromine?'Alkene':'Aldehyde or ketone',found=new Map(),substrate=show(g);
    for(const [c,x] of candidates){
      const route=hydride?addToCarbonyl(id,copyGraph(g),c,x,group,substrate):alkene(id,copyGraph(g),c,x,group,null,substrate);
      const choice=hydride?{carbon:c+1,oxygen:x+1}:{carbon:c+1,alkeneCarbon:x+1};
      if(!found.has(route.productSmiles))found.set(route.productSmiles,{...route,label:route.productSmiles,siteChoices:[],stereo:'connectivity only'});
      found.get(route.productSmiles).siteChoices.push(choice);
    }
    for(const r of found.values())r.sites=r.siteChoices.map(s=>hydride?`C${s.carbon}=O${s.oxygen}`:`C${s.carbon}=C${s.alkeneCarbon}`).join(' or ')+'. One site reacts; the other groups stay in place. Only connectivity is shown.';
    return [...found.values()];
  }
  const api = {entries,run,directions,independentSites};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ReactionAddition = api;
})(typeof window !== 'undefined' ? window : globalThis);
