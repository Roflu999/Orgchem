/* AQA substitution mechanisms on single, acyclic substrates; not a conditions predictor. */
(function (root) {
  'use strict';
  const families = {
    halo: ['Primary haloalkane', 'Nucleophilic substitution', 'CCBr'],
    acyl: ['Acyl chloride', 'Nucleophilic addition-elimination', 'CC(=O)Cl'],
    anhydride: ['Acid anhydride', 'Nucleophilic addition-elimination', 'CC(=O)OC(=O)C']
  };
  // Bound groups retain their positive charge until a separate proton transfer.
  const reagents = {
    cyanide: {name:'Cyanide ion', formula:'CN-', atom:'carbon', smiles:'C#N'},
    ammonia: {name:'Ammonia', formula:'NH3', atom:'nitrogen', bound:'[NH3+]', neutral:'NH2', acid:'NH4+', smiles:'N'},
    methylamine: {name:'Methylamine', formula:'CH3NH2', atom:'nitrogen', bound:'[NH2+]CH3', neutral:'NHCH3', acid:'CH3NH3+', smiles:'NC'},
    dimethylamine: {name:'Dimethylamine', formula:'(CH3)2NH', atom:'nitrogen', bound:'[NH+](CH3)2', neutral:'N(CH3)2', acid:'(CH3)2NH2+', smiles:'N(C)C'},
    trimethylamine: {name:'Trimethylamine', formula:'(CH3)3N', atom:'nitrogen', bound:'[N+](CH3)3', smiles:'[N+](C)(C)C'},
    water: {name:'Water', formula:'H2O', atom:'oxygen', bound:'[OH2+]', neutral:'OH', acid:'H3O+', smiles:'O'},
    ethanol: {name:'Ethanol', formula:'CH3CH2OH', atom:'oxygen', bound:'[OH+]CH2CH3', neutral:'OCH2CH3', acid:'CH3CH2OH2+', smiles:'OCC'}
  };
  const entries = [], rules = new Map();
  for (const [family,[group,section,example]] of Object.entries(families)) {
    const keys = family === 'halo' ? ['cyanide','ammonia','methylamine','dimethylamine','trimethylamine'] : ['water','ethanol','ammonia','methylamine'];
    for (const key of keys) {
      const id = `${family}-${key}`, nu = reagents[key];
      entries.push({id, label:`${group} with ${nu.name.toLowerCase()}`, reagent:nu.name, example, group, section});
      rules.set(id,{family,group,nu});
    }
  }

  const reject = reason => ({reason});
  const halogens = ['F','Cl','Br','I'];
  const valences = {C:4, O:2, N:3, F:1, Cl:1, Br:1, I:1};
  function inspect(g) {
    if (!g || !Array.isArray(g.atoms) || !g.atoms.length || g.atoms.length > 64 || !Array.isArray(g.bonds) ||
        !Array.isArray(g.hydrogens) || g.hydrogens.length !== g.atoms.length) return null;
    const n = g.atoms.length;
    if (g.stereo && ['centers','bonds','unsupported'].some(k => g.stereo[k]?.length) || /[@/\\]/.test(g.notation || '')) return null;
    for (const key of ['charges','isotopes','radicalElectrons']) {
      if (key in g && !(Array.isArray(g[key]) && g[key].length === n && Array.from(g[key]).every(x => x === 0))) return null;
    }
    const adj = Array.from({length:n}, () => []), val = Array(n).fill(0);
    const index = i => Number.isInteger(i) && i >= 0 && i < n;
    for (const b of g.bonds) {
      if (!b || !index(b.a) || !index(b.b) || b.a === b.b || ![1,2,3].includes(b.order) || b.stereo || b.aromatic || b.direction ||
          adj[b.a].some(j => j.i === b.b)) return null;
      adj[b.a].push({i:b.b,o:b.order}); adj[b.b].push({i:b.a,o:b.order});
      val[b.a] += b.order; val[b.b] += b.order;
    }
    for (let i = 0; i < n; i++) {
      const h = g.hydrogens[i];
      if (!Object.hasOwn(valences,g.atoms[i]) || !Number.isInteger(h) || h < 0 || val[i]+h !== valences[g.atoms[i]]) return null;
    }
    const seen = new Set([0]);
    for (const i of seen) for (const edge of adj[i]) seen.add(edge.i);
    return seen.size === n ? adj : null;
  }

  function findSites({atoms}, adj) {
    const sites = [], oxo = adj.map((edges,c) => atoms[c] === 'C' && edges.find(e => e.o === 2 && atoms[e.i] === 'O'));
    atoms.forEach((el,x) => {
      if (halogens.includes(el)) {
        const c = adj[x][0]?.i;
        if (atoms[c] !== 'C') return;
        if (!oxo[c]) sites.push({family:'halo',c,x,oxos:[]});
        else if (el === 'Cl') sites.push({family:'acyl',c,x,oxos:[oxo[c].i]});
      } else if (el === 'O' && adj[x].length === 2 && adj[x].every(e => e.o === 1 && oxo[e.i])) {
        const [{i:c},{i:other}] = adj[x];
        sites.push({family:'anhydride',c,x,other,oxos:[oxo[c].i,oxo[other].i]});
      }
    });
    return sites;
  }

  // Condense an alkyl tree in either reading direction without reversing atom labels.
  function alkyl(g, adj, c, parent) {
    const parts = adj[c].filter(e => e.i !== parent).map(e => alkyl(g,adj,e.i,c));
    parts.sort((a,b) => b.depth-a.depth || a.right.localeCompare(b.right));
    const [main,...side] = parts, h = g.hydrogens[c];
    const center = 'C' + (h ? 'H' + (h > 1 ? h : '') : '') + side.map(s => `(${s.right})`).join('');
    return {left:(main?.left || '')+center, right:center+(main?.right || ''), depth:1+(main?.depth || 0)};
  }
  function acylTail(g,adj,c) {
    const edge = adj[c].find(e => g.atoms[e.i] === 'C');
    return edge ? alkyl(g,adj,edge.i,c) : {left:'H',right:'H'};
  }
  // The generated alkyl notation contains only C, attached H counts and branches.
  const alkylSmiles = r => r.replace(/H[23]?/g,'');
  const step = (title,from,to,detail) => ({title,scheme:`${from} → ${to}`,detail});
  function substitute(group,nu,r,x) {
    const anion = x+'-', nitrile = nu === reagents.cyanide;
    const first = r+(nitrile ? 'C≡N' : nu.bound)+' + '+anion;
    const stages = [step('Concerted substitution (SN2)',r+x+' + '+nu.formula,first,
      `The ${nu.atom} lone pair attacks the carbon opposite ${x}. As the new bond forms, the C-${x} bond pair moves to ${x}; there is no carbocation intermediate.` +
      (nu === reagents.trimethylamine ? ' The quaternary ammonium ion has no N-H proton to lose.' : ''))];
    const productSmiles = alkylSmiles(r)+nu.smiles;
    if (!nu.neutral) return {group,stages,products:first,productSmiles};
    const products = r+nu.neutral+' + '+nu.acid+' + '+anion;
    stages.push(step('Proton transfer',first+' + '+nu.formula,products,
      `A second ${nu.name.toLowerCase()} nitrogen donates its lone pair to a proton on the alkylammonium ion. The N-H bond pair returns to the substituted nitrogen, leaving the neutral amine. This shows one alkylation; the product can react further.`));
    return {group,stages,products,productSmiles};
  }

  function acylate(group,nu,r,other) {
    const acyl = r+'C(=O)', leaving = other ? 'OC(=O)'+other.right : 'Cl';
    const anion = other ? other.left+'C(=O)O-' : 'Cl-';
    const tetrahedral = r+'C(O-)('+leaving+')'+nu.bound;
    const ionPair = acyl+nu.bound+' + '+anion;
    const stages = [step('Nucleophilic addition',acyl+leaving+' + '+nu.formula,tetrahedral,
      `The ${nu.atom} lone pair attacks the carbonyl carbon; the C=O pi pair moves onto oxygen, forming a tetrahedral intermediate.`),
    step('Elimination',tetrahedral,ionPair,
      `A lone pair on O- reforms C=O. The bond pair between the acyl carbon and the leaving ${other ? 'oxygen' : 'chlorine'} goes to that atom, releasing ${other ? 'carboxylate' : 'chloride'}.`)];
    const organic = acyl+nu.neutral;
    let products;
    if (other) {
      const acid = other.left+'C(=O)OH';
      products = organic === acid ? '2 '+acid : organic+' + '+acid;
      stages.push(step('Proton transfer',ionPair,products,
        `Carboxylate oxygen accepts a proton from the protonated product. The ${nu.atom === 'nitrogen' ? 'N-H' : 'O-H'} bond pair returns to ${nu.atom}, giving the neutral product and carboxylic acid.` +
        (nu.atom === 'nitrogen' ? ' Additional amine can convert the acid to its ammonium carboxylate salt.' : '')));
    } else {
      const ionicProducts = organic+' + '+nu.acid+' + Cl-';
      products = nu.atom === 'nitrogen' ? ionicProducts : organic+' + HCl';
      stages.push(step('Proton transfer',ionPair+' + '+nu.formula,ionicProducts,
        `A second ${nu.name.toLowerCase()} molecule accepts a proton; the bond pair returns to the ${nu.atom} of the acyl product.`+
        (nu.atom === 'oxygen' ? ' The molecular equation counts HCl; here the proton is shown on the solvent with chloride as counterion.' : ' The other product is the ammonium salt shown by its ions.')));
    }
    return {group,stages,products,productSmiles:alkylSmiles(r)+'C(=O)'+nu.smiles};
  }

  function run(id,g) {
    const rule = rules.get(id);
    if (!rule) return reject('no-rule');
    const adj = inspect(g);
    if (!adj) return reject('unsupported');
    const sites = findSites(g,adj);
    if (!sites.some(s => s.family === rule.family)) return reject('no-rule');
    if (sites.length !== 1) return reject('ambiguous');
    const {family,c,x,other,oxos} = sites[0];
    if (g.bonds.length !== g.atoms.length-1 ||
        g.atoms.some((e,i) => e !== 'C' && i !== x && !oxos.includes(i)) ||
        g.bonds.some(b => b.order !== 1 && !oxos.includes(b.a) && !oxos.includes(b.b))) return reject('unsupported');
    if (family === 'halo') {
      if (g.atoms[x] === 'F') return reject('unsupported');
      const beta = adj[c].find(e => e.i !== x);
      if (adj[c].length > 2 || (beta && adj[beta.i].length === 4)) return reject('hindered');
      return substitute(rule.group,rule.nu,alkyl(g,adj,c,x).left,g.atoms[x]);
    }
    let r = acylTail(g,adj,c), leaving = other === undefined ? null : acylTail(g,adj,other);
    if (leaving && r.left !== leaving.left) {
      // Both acyl centres lead to the same acid pair only for hydrolysis.
      if (rule.nu !== reagents.water) return reject('ambiguous');
      if (r.left > leaving.left) [r,leaving] = [leaving,r];
    }
    return acylate(rule.group,rule.nu,r.left,leaving);
  }
  const api = {entries,run};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ReactionSubstitution = api;
})(typeof window !== 'undefined' ? window : globalThis);
