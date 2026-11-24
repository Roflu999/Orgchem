/* English connectivity names, not preferred-IUPAC or stereochemical identifiers.
   Input: viewer heavy-atom record {atoms, bonds, hydrogens?, charges?, isotopes?, radicals?}.
   Output: {name, scope: 'connectivity-only'} or null; no mutation or name lookup.
   Neutral acyclic structures with 1-12 carbons, <=64 heavy atoms, simple linear alkyl
   and F/Cl/Br/I prefixes (at most ten of one kind), and at most one C=C, C#C,
   alcohol, aldehyde, ketone or carboxylic acid. Unsupported parent ties fail closed. */
(function (root) {
  'use strict';
  const stem = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec', 'undec', 'dodec'];
  const multiplier = [null, '', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];
  const valence = {C: 4, O: 2, F: 1, Cl: 1, Br: 1, I: 1};
  const halo = {F: 'fluoro', Cl: 'chloro', Br: 'bromo', I: 'iodo'};
  function compare(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  }

  function readTree(g) {
    const atoms = g?.atoms, bonds = g?.bonds;
    if (!Array.isArray(atoms) || !Array.isArray(bonds)) return null;
    const n = atoms.length;
    if (!n || n > 64 || bonds.length !== n - 1) return null;
    const carbons = [];
    for (let i = 0; i < n; i++) {
      if (typeof atoms[i] !== 'string' || !Object.hasOwn(valence, atoms[i])) return null;
      if (atoms[i] === 'C') carbons.push(i);
    }
    if (!carbons.length || carbons.length >= stem.length) return null;
    for (const k of ['charges', 'isotopes', 'radicals']) {
      if (g[k] !== undefined && (!Array.isArray(g[k]) || g[k].length !== n || Array.from(g[k]).some(x => x !== 0))) return null;
    }
    const adj = atoms.map(() => []), h = atoms.map(e => valence[e]);
    for (const bond of bonds) {
      if (!bond || bond.aromatic) return null;
      const {a, b, order} = bond;
      if (![a, b].every(i => Number.isInteger(i) && i >= 0 && i < n) || a === b || ![1, 2, 3].includes(order)) return null;
      if (adj[a].some(v => v.to === b)) return null;
      adj[a].push({to: b, order}); adj[b].push({to: a, order});
      h[a] -= order; h[b] -= order;
    }
    if (h.some(x => x < 0) || (g.hydrogens !== undefined && (!Array.isArray(g.hydrogens) || g.hydrogens.length !== n || h.some((x, i) => x !== g.hydrogens[i])))) return null;
    const seen = new Set([0]);
    for (const i of seen) for (const {to} of adj[i]) seen.add(to);
    if (seen.size !== n) return null;
    const carbonAdj = adj.map(row => row.filter(v => atoms[v.to] === 'C').map(v => v.to));
    return {atoms, adj, carbonAdj, carbons, h};
  }

  // Accept terminal heteroatoms only. In particular a carbonyl is not by itself
  // evidence for a ketone (e.g. acyl halides, esters, carbonates).
  function findGroup({atoms, adj, carbonAdj, carbons, h}) {
    let group = {type: 'ane', sites: []};
    for (let i = 0; i < atoms.length; i++) {
      if (atoms[i] !== 'C' && (adj[i].length !== 1 || atoms[adj[i][0].to] !== 'C')) return null;
    }
    for (const i of carbons) {
      const oxy = adj[i].filter(v => atoms[v.to] === 'O');
      if (oxy.length) {
        if (group.sites.length) return null;
        const co = oxy.filter(v => v.order === 2).length, oh = oxy.filter(v => v.order === 1).length;
        let type;
        if (co === 0 && oh === 1) type = 'ol';
        else if (co === 1 && oh === 1 && carbonAdj[i].length + h[i] === 1) type = 'oic acid';
        else if (co === 1 && oh === 0 && carbonAdj[i].length + h[i] === 2) type = h[i] ? 'al' : 'one';
        else return null;
        group = {type, sites: [i]};
      }
      for (const {to, order} of adj[i]) if (i < to && atoms[to] === 'C' && order > 1) {
        if (group.sites.length) return null;
        group = {type: order === 2 ? 'ene' : 'yne', sites: [i, to]};
      }
    }
    return group;
  }

  function parentSuffix(n, type, loc) {
    const base = stem[n];
    if (type === 'ane') return base + 'ane';
    if (type === 'ene' || type === 'yne') return base + (n <= 3 ? '' : '-' + loc + '-') + type;
    if (type === 'al' || type === 'oic acid' || (type === 'ol' && n <= 2) || (type === 'one' && n === 3)) return base + 'an' + type;
    return base + 'an-' + loc + '-' + type;
  }

  // Each prospective parent claims all edges meeting it. A substituted or
  // branched side chain still counts for ranking, but cannot be spelled here.
  function evaluate(tree, group, path) {
    const {atoms, adj, carbonAdj} = tree, parent = new Set(path), parts = [], positions = [];
    let supported = true;
    for (const [k, i] of path.entries()) for (const {to} of adj[i]) {
      if (parent.has(to) || atoms[to] === 'O') continue;
      const loc = k + 1;
      positions.push(loc);
      if (atoms[to] !== 'C') { parts.push([halo[atoms[to]], loc]); continue; }
      let j = to, prev = i, size = 0;
      while (true) {
        size++;
        const next = carbonAdj[j].filter(x => x !== prev);
        if (next.length > 1 || carbonAdj[j].length !== adj[j].length) { supported = false; break; }
        if (!next.length) break;
        prev = j; j = next[0];
      }
      parts.push([stem[size] + 'yl', loc]);
    }
    const loc = group.sites.length ? 1 + Math.min(...group.sites.map(x => path.indexOf(x))) : 0;
    const groups = new Map();
    for (const [prefix, pos] of parts) {
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(pos);
    }
    const alphabet = [...groups.keys()].sort(), alphaLocants = [], prefixes = [];
    for (const key of alphabet) {
      const loci = groups.get(key); // Already ascending (parent traversal order).
      alphaLocants.push(...loci);
      if (loci.length >= multiplier.length) supported = false;
      const showLocants = path.length > 1 && !(path.length === 2 && parts.length === 1 && group.type === 'ane');
      prefixes.push((showLocants ? loci.join(',') + '-' : '') + multiplier[loci.length] + key);
    }
    const prefixText = prefixes.join(path.length === 1 ? '' : '-');
    return {loc, count: positions.length, positions, alphabet: alphabet.map(k => k + ':' + groups.get(k).length).join(','), alphaLocants,
      name: supported ? prefixText + parentSuffix(path.length, group.type, loc) : null};
  }

  function generate(g) {
    const tree = readTree(g); if (!tree) return null;
    const group = findGroup(tree); if (!group) return null;
    const {carbons, carbonAdj} = tree;
    // Both orientations of every leaf-to-leaf path, including single-carbon trees.
    let longest = 0, diameter = 0, paths = [];
    function visit(i, prev, path) {
      path.push(i);
      const next = carbonAdj[i].filter(j => j !== prev);
      if (!next.length) {
        diameter = Math.max(diameter, path.length);
        if (path.length >= longest && group.sites.every(j => path.includes(j))) {
          if (path.length > longest) { longest = path.length; paths = []; }
          paths.push(path.slice());
        }
      } else for (const j of next) visit(j, i, path);
      path.pop();
    }
    for (const i of carbons) if (carbonAdj[i].length <= 1) visit(i, -1, []);
    // Don't switch between the longest-chain and multiple-bond conventions.
    if (!paths.length || (group.sites.length === 2 && longest !== diameter)) return null;
    let candidates = paths.map(p => evaluate(tree, group, p));
    const lowLoc = Math.min(...candidates.map(c => c.loc)), mostPrefixes = Math.max(...candidates.map(c => c.count));
    candidates = candidates.filter(c => c.loc === lowLoc && c.count === mostPrefixes);
    if (!candidates.length) return null; // Competing parent criteria outside our subset.
    candidates.sort((a, b) => compare(a.positions, b.positions));
    candidates = candidates.filter(c => compare(c.positions, candidates[0].positions) === 0);
    if (candidates.some(c => !c.name || c.alphabet !== candidates[0].alphabet)) return null;
    candidates.sort((a, b) => compare(a.alphaLocants, b.alphaLocants));
    const best = candidates[0];
    if (candidates.some(c => compare(c.alphaLocants, best.alphaLocants) === 0 && c.name !== best.name)) return null;
    return {name: best.name, scope: 'connectivity-only'};
  }

  const api = {generate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SystematicNames = api;
})(typeof self !== 'undefined' ? self : globalThis);
