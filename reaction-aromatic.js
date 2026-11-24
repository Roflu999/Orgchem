/* AQA substitution mechanisms. Schemes describe electron bookkeeping, not procedures. */
(function (root) {
  'use strict';
  const benzene = 'C1=CC=CC=C1';
  const entries = [
    {id:'radical-chlorination', label:'Free-radical chlorination', reagent:'Chlorine (UV light)', example:'C', group:'Alkane', section:'Free-radical substitution'},
    {id:'benzene-nitration', label:'Nitration of benzene', reagent:'Nitric acid and sulfuric acid', example:benzene, group:'Arene', section:'Electrophilic substitution'},
    {id:'friedel-crafts-acylation', label:'Friedel-Crafts acylation', reagent:'Ethanoyl chloride and aluminium chloride', example:benzene, group:'Arene', section:'Electrophilic substitution'}
  ];
  const reject = reason => ({reason});
  const stage = (title, scheme, detail) => ({title, scheme, detail});

  // Only simple neutral, connected, implicit-H graphs are in scope. Names, tags,
  // formulae and atom numbering are not evidence of a matching structure.
  function inspect(g) {
    if (!g || !Array.isArray(g.atoms) || !Array.isArray(g.bonds) || !Array.isArray(g.hydrogens)) return null;
    const n = g.atoms.length;
    if (!n || n > 12 || g.hydrogens.length !== n || g.bonds.length > 2*n ||
        g.schema != null || g.stereo != null || /[@/\\]/.test(g.notation || '')) return null;
    for (const key of ['charges','isotopes','radicalElectrons']) {
      if (key in g && !(Array.isArray(g[key]) && g[key].length === n && Array.from(g[key]).every(x => x === 0))) return null;
    }
    const adj = Array.from({length:n}, () => new Set());
    const valence = Array(n).fill(0);
    const validIndex = i => Number.isInteger(i) && i >= 0 && i < n;
    for (const bond of g.bonds) {
      if (!bond) return null;
      const {a,b,order} = bond;
      if (!validIndex(a) || !validIndex(b) || a === b || adj[a].has(b) ||
          ![1,2,3].includes(order) || bond.aromatic || bond.stereo || bond.direction) return null;
      adj[a].add(b); adj[b].add(a); valence[a] += order; valence[b] += order;
    }
    const valences = {C:4,N:3,O:2,F:1,Cl:1,Br:1,I:1};
    for (let i = 0; i < n; i++) {
      const e = g.atoms[i], h = g.hydrogens[i];
      if (typeof e !== 'string' || !Object.hasOwn(valences,e) || !Number.isInteger(h) || h < 0 || valence[i]+h !== valences[e]) return null;
    }
    const reached = new Set([0]);
    for (const i of reached) for (const j of adj[i]) reached.add(j);
    return reached.size === n ? adj : null;
  }

  // methane, ethane and the four equivalent methyl groups of 2,2-dimethylpropane
  function chlorination(g, adj, group) {
    const n = adj.length;
    if (g.bonds.length !== n-1 || g.bonds.some(b => b.order !== 1)) return reject('no-rule');
    if (new Set(g.hydrogens.filter(h => h > 0)).size > 1) return reject('ambiguous');
    let alkane, alkyl, dimer, name, productSmiles;
    if (n === 1) [alkane,alkyl,dimer,name,productSmiles] = ['CH4','CH3','CH3CH3','chloromethane','CCl'];
    else if (n === 2) [alkane,alkyl,dimer,name,productSmiles] = ['CH3CH3','CH3CH2','CH3CH2CH2CH3','chloroethane','CCCl'];
    else if (n === 5 && adj.some(s => s.size === 4)) {
      [alkane,alkyl,dimer,name,productSmiles] = ['C(CH3)4','(CH3)3CCH2','(CH3)3CCH2CH2C(CH3)3','1-chloro-2,2-dimethylpropane','CC(C)(C)CCl'];
    } else return reject('unsupported'); // Equal hydrogen counts alone do not establish symmetry.
    const radical = alkyl + '•', chlorine = 'Cl•', product = alkyl + 'Cl';
    return {group, productSmiles, stages:[
      stage('Initiation: homolysis', `Cl-Cl -> 2 ${chlorine}`, 'UV light can break the Cl-Cl bond homolytically. Draw two single-headed arrows (fishhooks) from the bond, one to each chlorine atom.'),
      stage('Propagation: hydrogen abstraction', `${chlorine} + ${alkane} -> HCl + ${radical}`, 'One fishhook from the chlorine radical and one from the C-H bond meet in the new H-Cl bond. The other C-H electron stays on carbon, forming an alkyl radical.'),
      stage('Propagation: chlorine transfer', `${radical} + Cl-Cl -> ${product} + ${chlorine}`, 'One electron from the alkyl radical and one from Cl-Cl form C-Cl. The other Cl-Cl electron goes to the departing chlorine atom, regenerating the chain carrier.'),
      stage('Termination: radical combination', `${chlorine} + ${chlorine} -> Cl2; ${radical} + ${chlorine} -> ${product}; ${radical} + ${radical} -> ${dimer}`, 'These are alternatives. In each, draw one fishhook from each unpaired electron into the new bond. Two radicals are consumed and none is formed.')
    ], products:`First substitution: ${name} (${product}) and hydrogen chloride (HCl). Further substitution of remaining hydrogens can give a mixture of more highly chlorinated products.`};
  }

  function aromaticSubstitution(id, group) {
    const nitration = id === 'benzene-nitration';
    const electrophile = nitration ? 'NO2+' : 'CH3-C+=O';
    const intermediate = nitration ? '[C6H6(NO2)]+' : '[C6H6(COCH3)]+';
    const stages = nitration ? [
      stage('Generate the electrophile: protonation', 'HNO3 + H2SO4 -> H2NO3+ + HSO4-', 'A lone pair on the hydroxyl oxygen of nitric acid takes a proton. The sulfuric acid O-H bonding pair stays on oxygen.'),
      stage('Generate the nitronium ion', 'H2NO3+ -> O=N+=O + H2O', 'The N-OH2 bonding pair leaves with water as a lone pair on the other singly bonded oxygen forms an N=O pi bond.')
    ] : [
      stage('Generate the acylium ion', 'CH3COCl + AlCl3 -> CH3-C+=O + AlCl4-', 'A chlorine lone pair coordinates to aluminium. The acyl C-Cl bonding pair moves to chlorine, giving tetrachloroaluminate and the resonance-stabilised acylium electrophile.')
    ];
    stages.push(stage('Electrophilic attack: sigma complex', `C6H6 + ${electrophile} -> ${intermediate}`, nitration
      ? 'A ring pi pair forms a C-N bond as one N=O pi pair moves to oxygen. The attacked carbon still bears H; the positive charge is delocalised over the non-aromatic ring.'
      : 'A ring pi pair forms a bond to the positively charged acyl carbon. The attacked ring carbon still bears H; the positive charge is delocalised over the non-aromatic ring.'));
    stages.push(stage('Deprotonation: restore aromaticity', nitration
      ? `${intermediate} + HSO4- -> C6H5NO2 + H2SO4`
      : `${intermediate} + AlCl4- -> C6H5C(=O)CH3 + HCl + AlCl3`, nitration
      ? 'A lone pair on hydrogensulfate takes H from the attacked carbon. The C-H pair returns to the ring pi system, restoring aromaticity and regenerating sulfuric acid.'
      : 'A chloride ligand of tetrachloroaluminate accepts H from the attacked carbon, releasing aluminium chloride in this simplified scheme. The C-H pair returns to the ring pi system, restoring aromaticity.'));
    const productSmiles = nitration ? 'O=[N+]([O-])C1=CC=CC=C1' : 'CC(=O)C1=CC=CC=C1';
    return {group, stages, productSmiles, products:nitration ? 'Nitrobenzene (C6H5NO2) and water (H2O).' : 'Phenylethanone (acetophenone, C6H5C(=O)CH3) and hydrogen chloride (HCl).'};
  }

  function run(id, record) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return reject('no-rule');
    const adj = inspect(record);
    if (!adj) return reject('unsupported');
    if (!record.atoms.every(e => e === 'C')) return reject('no-rule');
    if (id === 'radical-chlorination') return chlorination(record, adj, entry.group);
    // A connected 2-regular graph on six carbons is a six-cycle. With one H
    // and valence four on each carbon, its single and double bonds alternate.
    if (adj.length !== 6 || !adj.every(s => s.size === 2) || !record.hydrogens.every(h => h === 1)) return reject('no-rule');
    return aromaticSubstitution(id, entry.group);
  }
  const api = {entries,run};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ReactionAromatic = api;
})(typeof self !== 'undefined' ? self : globalThis);
