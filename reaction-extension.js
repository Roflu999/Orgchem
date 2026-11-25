/* Connectivity-only teaching examples, not a general reaction predictor. */
(function (root) {
  'use strict';
  const commonJS = typeof module !== 'undefined' && module.exports;
  const chem = commonJS ? require('./chemistry.js') : root.Chem;
  const names = commonJS ? require('./systematic-name.js') : root.SystematicNames;
  const entries = [
    {id:'iodoform-test', label:'Iodoform test: which carbon precipitates?', reagent:'Iodine in aqueous alkali',
      example:'CC(=O)C', group:'Methyl carbonyl or its alcohol precursor', section:'Qualitative tests'},
    {id:'diels-alder', label:'Diels-Alder: where do the three electron pairs go?', reagent:'Ethene',
      example:'C=CC=C', group:'Conjugated diene', section:'Cycloaddition'}
  ];
  const reject = reason => ({reason});
  const stage = (title,scheme,detail) => ({title,scheme,detail});

  // Both examples use small, connected, acyclic C/O graphs with implicit H.
  // A familiar name or formula is not evidence for either reaction centre.
  function inspect(g) {
    if (!g || !Array.isArray(g.atoms) || !Array.isArray(g.bonds) || !Array.isArray(g.hydrogens)) return null;
    const n = g.atoms.length;
    if (!n || n > 13 || g.hydrogens.length !== n || g.bonds.length !== n-1 ||
        g.schema != null || g.stereo != null || g.charge || g.radical || g.aromatic ||
        (g.notation != null && (typeof g.notation !== 'string' || /[\[\]@/\\|.]/.test(g.notation)))) return null;
    for (const k of ['charges','isotopes','radicals','radicalElectrons']) {
      if (k in g && !(Array.isArray(g[k]) && g[k].length === n && Array.from(g[k]).every(x => x === 0))) return null;
    }
    const adj = Array.from({length:n}, () => []), valence = Array(n).fill(0);
    const index = i => Number.isInteger(i) && i >= 0 && i < n;
    for (const bond of g.bonds) {
      if (!bond) return null;
      const {a,b,order} = bond;
      if (!index(a) || !index(b) || a === b || adj[a].includes(b) || ![1,2].includes(order) ||
          bond.stereo || bond.aromatic || bond.direction) return null;
      adj[a].push(b); adj[b].push(a); valence[a] += order; valence[b] += order;
    }
    for (let i = 0; i < n; i++) {
      const e = g.atoms[i], h = g.hydrogens[i];
      if (!['C','O'].includes(e) || !Number.isInteger(h) || h < 0 || valence[i]+h !== (e === 'C' ? 4 : 2)) return null;
    }
    const seen = new Set([0]);
    for (const i of seen) for (const j of adj[i]) seen.add(j);
    return seen.size === n ? adj : null;
  }

  function iodoform(g,adj,group) {
    const {atoms,bonds,hydrogens:h} = g, o = atoms.indexOf('O');
    if (o < 0 || o !== atoms.lastIndexOf('O') || adj[o].length !== 1 ||
        bonds.some(({a,b,order}) => order !== 1 && a !== o && b !== o)) return reject('unsupported');
    const c = adj[o][0], alcohol = h[o] === 1;
    const methyl = adj[c].find(i => atoms[i] === 'C' && h[i] === 3);
    if (methyl === undefined || (alcohol && h[c] < 1)) return reject('no-rule');
    const substrate = names.generate(g);
    if (!substrate) return reject('unsupported');

    // CHI3 carries off one methyl carbon. Reuse its graph slot for the incoming
    // oxygen, not as an atom mapping. Keep the rest of the carbon skeleton intact.
    const elems = atoms.slice(); elems[methyl] = 'O';
    const acidBonds = bonds.map(({a,b,order}) => ({a,b,order:a === o || b === o ? 2 : order}));
    const acid = names.generate({atoms:elems,bonds:acidBonds});
    if (!acid || !acid.name.endsWith('oic acid')) return reject('unsupported');
    const productName = acid.name.replace(/oic acid$/, 'oate');
    const m = elems.map(() => Array(elems.length).fill(0));
    for (const {a,b,order} of acidBonds) m[a][b] = m[b][a] = order;
    elems[methyl] = '[O-]';
    const productSmiles = chem.smiles({atoms:elems,m});
    const r = atoms.length === 3 ? 'H' : 'the remaining alkyl group';
    const stages = [];
    if (alcohol) stages.push(stage('First oxidise the alcohol',
      'RCH(OH)CH3 + I2 + 2 OH- -> RCOCH3 + 2 I- + 2 H2O',
      `In ${substrate.name}, R is ${r}. Oxidation gives ${r === 'H' ? 'ethanal' : 'a methyl ketone'} without changing the carbon skeleton. This accounts for the extra iodine and hydroxide in the alcohol equation.`));
    stages.push(stage('Replace three methyl hydrogens',
      'RCOCH3 + 3 I2 + 3 OH- -> RCOCI3 + 3 I- + 3 H2O',
      `Here R is ${r}. The methyl carbon next to C=O loses all three hydrogens by successive iodination. Each I2 supplies one bound iodine and one iodide ion.`),
    stage('Identify the precipitate and the dissolved product',
      `RCOCI3 + OH- -> RCOO- + CHI3(s)`,
      `Cleavage separates the iodinated carbon as yellow triiodomethane (iodoform). The original carbonyl carbon stays in ${productName}, a carboxylate ion rather than the free acid in this alkaline solution.`),
    stage('Net ionic equation',
      `${substrate.name} + ${alcohol ? '4 I2 + 6 OH-' : '3 I2 + 4 OH-'} -> ${productName} + CHI3(s) + ${alcohol ? '5 I- + 5 H2O' : '3 I- + 3 H2O'}`,
      'One matching substrate gives one CHI3 and one carboxylate. The yellow solid identifies a group, not a unique compound. This model covers simple acyclic monoalcohols and monocarbonyls only.'));
    return {group,productName,productSmiles,products:`Yellow iodoform precipitate (CHI3) and dissolved ${productName}; iodide and water also form.`,stages};
  }

  function cycloaddition(g,adj,group) {
    // Distinguish the conjugated diene from its cumulated and other C4H6 isomers.
    if (adj.length !== 4 || !g.atoms.every(e => e === 'C') ||
        !g.bonds.some(({a,b,order}) => order === 1 && adj[a].length === 2 && adj[b].length === 2) ||
        g.bonds.filter(b => b.order === 2).length !== 2) return reject('no-rule');
    return {group,productName:'cyclohexene',productSmiles:'C1=CCCCC1',products:'Cyclohexene (C6H10); no small molecule is lost.',stages:[
      stage('Label the partners', 'A=B-C=D  +  E=F',
        'Label the diene carbons A to D and the ethene carbons E and F. Picture rotation about B-C bringing the ends A and D to the same side (s-cis). Which of the six carbons will still carry a double bond?'),
      stage('Move three electron pairs together', 'A=B pi -> A-F sigma; E=F pi -> E-D sigma; C=D pi -> B=C pi',
        'Read these as three simultaneous curly arrows, not three steps. Four pi electrons from the diene and two from ethene reorganise in one concerted thermal [4+2] cycloaddition. There is no ionic or radical intermediate.'),
      stage('Check the ring and the atom count', 'A-B=C-D-E-F-A     C4H6 + C2H4 -> C6H10',
        'The new pi bond lies between B and C, where the diene had a single bond. The two new sigma bonds close one six-membered ring. One diene molecule and one ethene molecule give one cyclohexene molecule. Only this unsubstituted pair is modelled; no rate, yield or substituted-diene outcomes are predicted.')
    ]};
  }

  function run(id,g) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return reject('no-rule');
    const adj = inspect(g);
    if (!adj) return reject('unsupported');
    return id === 'iodoform-test' ? iodoform(g,adj,entry.group) : cycloaddition(g,adj,entry.group);
  }
  const api = {entries,run};
  if (commonJS) module.exports = api;
  root.ReactionExtension = api;
})(typeof window !== 'undefined' ? window : globalThis);
