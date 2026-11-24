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
    if (!n || n > 64 || r.hydrogens.length !== n || r.bonds.length > 2*n || r.charge || r.radical ||
        /[@/\\\[\]|]/.test(r.notation || '')) return null;
    if (r.stereo != null && (!Array.isArray(r.stereo.centers) || !Array.isArray(r.stereo.bonds) ||
        r.stereo.unsupported?.length || [...r.stereo.centers,...r.stereo.bonds].some(s => !s || s.specified !== false))) return null;
    for (const k of ['charges','isotopes','radicals','radicalElectrons']) {
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
    if (g.some(v => [...v.edges.values()].reduce((s,o) => s+o,v.h) !== valence[v.e])) return null;
    const seen = new Set([0]);
    for (const i of seen) for (const j of next(g,i)) seen.add(j);
    return seen.size === n ? g : null;
  }

  // Canonical condensed formula of a tree. Longest carbon path first; tied paths
  // are ordered by their text, not by the input atom or bond numbering.
  function show(g, ringEnds=[], smiles=false) {
    function walk(i,parent) {
      const {e,h,q,edges} = g[i];
      const hText = h ? 'H'+(h > 1 ? h : '') : '';
      const label = e+hText+(q > 0 ? '+' : q < 0 ? '-' : '');
      const ring = ringEnds.includes(i);
      let text = (q || ring ? '['+label+']' : smiles ? e : label)+(ring ? '1' : '');
      const children = next(g,i).filter(j => j !== parent).map(j => {
        const child = walk(j,i);
        child.text = ['','','=',smiles ? '#' : '≡'][edges.get(j)] + child.text;
        return child;
      }).sort((a,b) => b.depth-a.depth || Number(a.text.startsWith('='))-Number(b.text.startsWith('=')) || compare(a.text,b.text));
      const [main,...branches] = children;
      text += branches.map(c => '('+c.text+')').join('') + (main?.text || '');
      return {text, depth:e === 'C' ? 1+(main?.depth || 0) : 0};
    }
    const paths = g.flatMap((v,i) => v.e === 'C' ? [walk(i,-1)] : []);
    const branchCount = s => s.split('(').length-1;
    paths.sort((a,b) => b.depth-a.depth || branchCount(a.text)-branchCount(b.text) || compare(a.text,b.text));
    return paths[0].text;
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

  function alkene(id,g,a,b,group) {
    const substrate = show(g);
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
    if (g[a].h === g[b].h && cation(a,b) !== cation(b,a)) return reject('ambiguous');
    const [c,h] = g[a].h <= g[b].h ? [a,b] : [b,a];
    if (canRearrange(g,c)) return reject('ambiguous');
    const regio = g[a].h === g[b].h ? 'The alkene ends are constitutionally equivalent.' :
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

  function addToCarbonyl(id,g,c,o,group) {
    const substrate = show(g), cn = id === 'carbonyl-cyanide';
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
    const {c,x} = site;
    if (group === 'Alkene') return alkene(id,g,c,x,group);
    if (group === 'Aldehyde or ketone') return addToCarbonyl(id,g,c,x,group);
    return eliminate(g,c,x,group);
  }
  const api = {entries,run};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ReactionAddition = api;
})(typeof window !== 'undefined' ? window : globalThis);
