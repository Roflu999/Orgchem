/* Two schematic electron-bookkeeping rules, not a reaction or conditions predictor. */
(function (root) {
  'use strict';
  const reject = reason => ({reason});
  const single = (a,b) => ({a,b,order:1});
  const halogen = e => ['F','Cl','Br','I'].includes(e);

  // Inspect original graph indices. Do not normalize away explicit chemical state.
  function inspect(g) {
    if (!g || !Array.isArray(g.atoms) || !g.atoms.length || !Array.isArray(g.bonds) ||
        !Array.isArray(g.hydrogens) || g.hydrogens.length !== g.atoms.length) return reject('invalid');
    const n = g.atoms.length;
    if (n > 64 || g.schema != null || g.stereo != null || /[\[\]@/\\|]/.test(g.notation || '')) return reject('unsupported');
    for (const key of ['charges','isotopes','radicalElectrons']) {
      if (!(key in g)) continue;
      const values = g[key];
      if (!Array.isArray(values) || values.length !== n || !Array.from(values).every(Number.isInteger)) return reject('invalid');
      if (values.some(v => v !== 0)) return reject('unsupported');
    }
    const adj = Array.from({length:n}, () => []), valence = Array(n).fill(0);
    const index = i => Number.isInteger(i) && i >= 0 && i < n;
    for (const edge of g.bonds) {
      if (!edge || !index(edge.a) || !index(edge.b) || edge.a === edge.b ||
          adj[edge.a].includes(edge.b)) return reject('invalid');
      const {a,b,order} = edge;
      if (edge.stereo || edge.direction || edge.aromatic) return reject('unsupported');
      if (![1,2,3].includes(order)) return reject('invalid');
      adj[a].push(b); adj[b].push(a); valence[a] += order; valence[b] += order;
    }
    for (let i = 0; i < n; i++) {
      const e = g.atoms[i], h = g.hydrogens[i];
      if (typeof e !== 'string' || !Number.isInteger(h) || h < 0) return reject('invalid');
      if (!Object.hasOwn(root.Chem.VAL,e)) return reject('unsupported');
      if (valence[i] + h !== root.Chem.VAL[e]) return reject('invalid');
    }
    const seen = new Set([0]);
    for (const i of seen) for (const j of adj[i]) seen.add(j);
    return seen.size === n ? {adj} : reject('unsupported');
  }

  function match(g, adj) {
    const {atoms, hydrogens, bonds} = g;
    const acids = [], halides = [];
    for (const {a,b,order} of bonds) {
      if (order !== 2) continue;
      const c = atoms[a] === 'C' && atoms[b] === 'O' ? a : atoms[b] === 'C' && atoms[a] === 'O' ? b : -1;
      if (c < 0) continue;
      for (const o of adj[c]) if (atoms[o] === 'O' && hydrogens[o] === 1) {
        acids.push({kind:'acid-base', c, oxo:c === a ? b : a, leavingAtom:o});
      }
    }
    atoms.forEach((e,i) => { if (halogen(e)) halides.push(i); });
    const alkylHalides = halides.filter(x => {
      const c = adj[x][0];
      return atoms[x] !== 'F' && atoms[c] === 'C' && adj[c].length + hydrogens[c] === 4;
    });
    if (acids.length + alkylHalides.length > 1) return reject('ambiguous');
    if (!acids.length && !halides.length) return reject('no-rule');
    // Only small acyclic alkanoic acids or saturated monohaloalkanes here.
    if (atoms.length > 12 || bonds.length !== atoms.length - 1) return reject('unsupported');
    let m = acids[0];
    if (m) {
      if (!atoms.every((e,i) => e === 'C' || i === m.oxo || i === m.leavingAtom) ||
          bonds.some(b => b.order !== 1 && b.a !== m.oxo && b.b !== m.oxo)) return reject('unsupported');
    } else {
      const x = halides[0], c = adj[x][0];
      if (atoms[x] === 'F' || atoms[c] !== 'C' || !atoms.every((e,i) => e === 'C' || i === x) ||
          bonds.some(b => b.order !== 1)) return reject('unsupported');
      const alkyl = adj[c].filter(i => i !== x);
      // Avoid secondary/tertiary and even beta-branched primary halides.
      if (alkyl.length > 1 || (alkyl.length && adj[alkyl[0]].length > 2)) return reject('hindered');
      m = {kind:'sn2', c, leavingAtom:x};
    }
    // Offline graphs have no stereo metadata: only accept tetrahedral branch
    // points provably achiral from two identical terminal methyl substituents.
    if (atoms.some((e,i) => e === 'C' && adj[i].length >= 3 && i !== m.c &&
        adj[i].filter(j => atoms[j] === 'C' && hydrogens[j] === 3).length < 2)) return reject('unsupported');
    return m;
  }

  // Give the mechanism a clear right-hand margin without changing atom IDs.
  // Rotate the existing 2D alkyl skeleton about its bond to the reactive carbon.
  function schematic(g, adj, {kind,c,oxo,leavingAtom}) {
    const acid = kind === 'acid-base', n = g.atoms.length;
    const site = acid ? n : c, reagentAtom = acid ? n + 1 : n;
    const alkyl = adj[c].find(i => g.atoms[i] === 'C');
    const flat = root.MoleculeGeometry.layout2D(g, false).atoms;
    const fixed = new Map([[c,[0,0]]]);
    if (acid) {
      fixed.set(oxo,[0.5,-0.866]); fixed.set(leavingAtom,[0.5,0.866]);
      fixed.set(site,[1.5,0.866]); fixed.set(reagentAtom,[2.98,0.866]);
    } else {
      fixed.set(leavingAtom,[-0.5,0.866]); fixed.set(reagentAtom,[0.74,-1.28]);
    }
    const points = new Map(fixed);
    if (alkyl !== undefined) {
      const angle = Math.atan2(flat[alkyl].y-flat[c].y,flat[alkyl].x-flat[c].x);
      const axis = acid ? Math.PI : -5*Math.PI/6;
      // Either reflection is valid for our achiral scope; keep the nearest
      // substituent as far as possible from the arrow/functional-group area.
      let best = -Infinity;
      for (const flip of [1,-1]) {
        const chain = new Map(); let clearance = Infinity;
        flat.forEach((p,i) => {
          if (fixed.has(i)) return;
          const d = Math.hypot(p.x-flat[c].x,p.y-flat[c].y);
          const t = axis + flip * (Math.atan2(p.y-flat[c].y,p.x-flat[c].x)-angle);
          const x = d*Math.cos(t), y = d*Math.sin(t);
          chain.set(i,[x,y]);
          if (i !== alkyl) for (const [fx,fy] of fixed.values()) clearance = Math.min(clearance, Math.hypot(fx-x,fy-y));
        });
        if (clearance > best) { best = clearance; for (const [i,p] of chain) points.set(i,p); }
      }
    }
    const elements = g.atoms.concat(acid ? ['H','O'] : ['O']);
    const atoms = elements.map((e,i) => {
      const [x,y] = points.get(i);
      const h = i === reagentAtom ? 1 : i === site && acid ? 0 : g.hydrogens[i] - Number(acid && i === leavingAtom);
      return {e,h,chargeBefore:i === reagentAtom ? -1 : 0,chargeAfter:i === leavingAtom ? -1 : 0,x,y};
    });
    const bondsBefore = g.bonds.map(({a,b,order}) => ({a,b,order}));
    if (acid) bondsBefore.push(single(leavingAtom,site));
    const bondsAfter = bondsBefore.filter(({a,b}) => !(a === site && b === leavingAtom || b === site && a === leavingAtom))
      .map(b => ({...b})).concat(single(site,reagentAtom));
    const arrows = [{from:[reagentAtom],to:[site]}, {from:[site,leavingAtom],to:[leavingAtom]}];
    return {kind,atoms,bondsBefore,bondsAfter,arrows,site,reagentAtom,leavingAtom};
  }

  function analyze(record,reagent) {
    const graph = inspect(record);
    if (graph.reason) return graph;
    if (reagent === 'water') return reject('no-rule');
    if (reagent !== 'hydroxide') return reject('invalid');
    const m = match(record,graph.adj);
    return m.reason ? m : schematic(record,graph.adj,m);
  }
  const api = {analyze};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ReactionRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
