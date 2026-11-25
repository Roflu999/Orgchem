/* AQA alcohol oxidation: net equations, not elementary mechanism steps. */
(function (root) {
  'use strict';
  const commonJS = typeof module !== 'undefined' && module.exports;
  const names = commonJS ? require('./systematic-name.js') : root.SystematicNames;
  const chem = commonJS ? require('./chemistry.js') : root.Chem;
  const reagent = 'Acidified potassium dichromate(VI)';
  const entries = [
    ['oxidation-aldehyde', 'Primary alcohol to aldehyde (distillation)', 'Primary alcohol', 'CCO'],
    ['oxidation-acid', 'Primary alcohol to carboxylic acid (excess oxidant under reflux)', 'Primary alcohol', 'CCO'],
    ['oxidation-ketone', 'Secondary alcohol to ketone', 'Secondary alcohol', 'CC(O)C']
  ].map(([id,label,group,example]) => ({id,label,group,example,reagent,section:'Oxidation'}));

  function inspect(g) {
    if (!g || !Array.isArray(g.atoms) || g.atoms.length > 13 || !Array.isArray(g.bonds) ||
        g.bonds.length !== g.atoms.length-1 || !Array.isArray(g.hydrogens) || g.hydrogens.length !== g.atoms.length ||
        g.atoms.some(a => a !== 'C' && a !== 'O') || g.charge || g.radical || /[\[\]@/\\|.]/.test(g.notation || '')) return null;
    if (g.stereo != null && (!Array.isArray(g.stereo.centers) || !Array.isArray(g.stereo.bonds) ||
        g.stereo.unsupported?.length || [...g.stereo.centers,...g.stereo.bonds].some(s => s?.specified !== false))) return null;
    if ('radicalElectrons' in g && !(Array.isArray(g.radicalElectrons) && g.radicalElectrons.length === g.atoms.length &&
        Array.from(g.radicalElectrons).every(v => v === 0))) return null;
    if (g.bonds.some(b => !b || b.order !== 1 || b.stereo || b.direction || b.aromatic)) return null;
    const o = g.atoms.indexOf('O');
    if (o < 0 || o !== g.atoms.lastIndexOf('O') || g.hydrogens[o] !== 1) return null;
    // The shared namer validates connectivity, endpoints, neutral valences and atom
    // annotations, and fails closed outside its 1-12 carbon simple-branch scope.
    const substrate = names.generate(g);
    if (!substrate) return null;
    const bond = g.bonds.find(b => b.a === o || b.b === o);
    return {name:substrate.name, o, c:bond.a === o ? bond.b : bond.a};
  }

  function run(id,g) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return {reason:'no-rule'};
    const site = inspect(g);
    if (!site) return {reason:'unsupported'};
    const {o,c} = site, h = g.hydrogens[c];
    if (h === 0) return {reason:'tertiary-alcohol'};
    const ketone = id === 'oxidation-ketone', acid = id === 'oxidation-acid';
    if (ketone !== (h === 1)) return {reason:'no-rule'}; // Methanol follows the primary pathway.

    // Preserve the carbon skeleton; generate both the name and SMILES from the same product.
    const atoms = g.atoms.slice();
    if (acid) atoms.push('O');
    const m = atoms.map(() => Array(atoms.length).fill(0));
    for (const {a,b} of g.bonds) m[a][b] = m[b][a] = 1;
    m[c][o] = m[o][c] = 2;
    if (acid) m[c][atoms.length-1] = m[atoms.length-1][c] = 1;
    const product = chem.describe({atoms,m}), productName = names.generate(product)?.name;
    if (!productName) return {reason:'unsupported'};
    const detail = acid ? 'Under reflux, the aldehyde remains in the mixture. Excess oxidant converts it to the carboxylic acid.' +
      (h === 3 ? ' Methanoic acid can itself undergo further oxidation.' : '') : ketone ?
      'The carbon bearing OH becomes a carbonyl carbon. Both carbon neighbours remain attached, giving a ketone.' :
      'Distillation separates the volatile aldehyde from the oxidant as it forms, limiting further oxidation to the carboxylic acid.';
    return {group:entry.group, products:productName+' + water', productName, productSmiles:product.notation, stages:[{
      title:'Net oxidation to '+(acid ? 'a carboxylic acid' : ketone ? 'a ketone' : 'an aldehyde'),
      scheme:`${site.name} + ${acid ? '2[O]' : '[O]'} → ${productName} + H2O`,
      detail:detail+' [O] represents an oxidising equivalent supplied by acidified dichromate(VI).'
    }]};
  }
  const api = {entries,run};
  if (commonJS) module.exports = api;
  root.ReactionOxidation = api;
})(typeof window !== 'undefined' ? window : globalThis);
