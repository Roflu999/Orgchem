/* Connected, neutral, closed-shell constitutional isomers. No stereoisomers.
   Exhaustive within the displayed valence model and formula limits; not a stability prediction. */
(function (root) {
  'use strict';
  const VAL = { C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1 };
  const MASS = { C: 12.011, H: 1.008, N: 14.007, O: 15.999, F: 18.9984, Cl: 35.45, Br: 79.904, I: 126.9045 };
  const treeCache = new Map(), names = new Map(), aliases = new Map(), nameGraphs = new Map();
  const bondChar = o => o === 2 ? '=' : o === 3 ? '#' : '';
  const clone = g => ({ atoms: g.atoms.slice(), m: g.m.map(r => r.slice()) });
  const neighbors = (g, i) => g.m[i].map((v, j) => v ? j : -1).filter(j => j >= 0);
  const used = (g, i) => g.m[i].reduce((a, b) => a + b, 0);
  let deadline = Infinity, canonSteps = 0;
  const LIMITS = { saturated: 12, mono: 10, di: 9, poly: 7, maxDBE: 4, view: 64, results: 12000, milliseconds: 22000 };
  function checkTime() { if (Date.now() > deadline) throw Error('Search reached its 22-second computation limit. Try a smaller formula or open a specific SMILES instead. No partial results are shown.'); }
  function canonical(g) {
    const n = g.atoms.length, adj = g.atoms.map((_, i) => neighbors(g, i));
    // AHU tree canonization avoids factorial leaf permutations for larger saturated molecules.
    const edgeCount = adj.reduce((s, a) => s + a.length, 0) / 2;
    if (edgeCount === n - 1) {
      let leaves = adj.map((a, i) => a.length <= 1 ? i : -1).filter(i => i >= 0), remaining = n, degree = adj.map(a => a.length);
      while (remaining > 2) { remaining -= leaves.length; const next = []; for (const i of leaves) for (const j of adj[i]) if (--degree[j] === 1) next.push(j); leaves = next; }
      function rooted(i, parent) {
        const children = adj[i].filter(j => j !== parent).map(j => ({ order: g.m[i][j], node: rooted(j, i) }));
        children.sort((a, b) => (a.order + a.node.code).localeCompare(b.order + b.node.code));
        return { code: g.atoms[i] + '(' + children.map(c => c.order + c.node.code).join('') + ')', order: [i, ...children.flatMap(c => c.node.order)] };
      }
      const choices = leaves.map(i => rooted(i, -1)).sort((a, b) => a.code.localeCompare(b.code));
      return { key: 'T:' + choices[0].code, order: choices[0].order };
    }
    const rank = strings => { const sorted = [...new Set(strings)].sort(), map = new Map(sorted.map((s, i) => [s, i])); return strings.map(s => map.get(s)); };
    function refine(colors) {
      for (let k = 0; k < n; k++) {
        const next = rank(colors.map((c, i) => c + '|' + adj[i].map(j => g.m[i][j] + ':' + colors[j]).sort().join(',')));
        const stable = new Set(next).size === new Set(colors).size; colors = next; if (stable) break;
      }
      return colors;
    }
    let best = null, bestOrder = null, localSteps = 0;
    const localStart = Date.now();
    function visit(colors) {
      if (++localSteps % 128 === 0 && (localSteps > 100000 || Date.now() - localStart > 6000)) throw Error('This highly symmetric graph exceeds the canonicalization budget. Try a less complex structure.');
      if (++canonSteps % 128 === 0) checkTime();
      colors = refine(colors);
      const cells = new Map(); colors.forEach((c, i) => { if (!cells.has(c)) cells.set(c, []); cells.get(c).push(i); });
      const branch = [...cells.entries()].filter(([, a]) => a.length > 1).sort((a, b) => a[1].length - b[1].length || a[0] - b[0])[0];
      if (!branch) {
        const order = [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([, a]) => a[0]);
        let code = order.map(i => g.atoms[i]).join(',') + '|';
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) code += g.m[order[i]][order[j]];
        if (best === null || code < best) { best = code; bestOrder = order; }
        return;
      }
      const tried = [];
      for (const i of branch[1]) {
        // Exact twins are interchangeable automorphisms; one branch suffices.
        if (tried.some(j => g.atoms[i] === g.atoms[j] && g.m[i].every((v, k) => k === i || k === j || v === g.m[j][k]))) continue;
        tried.push(i); const next = colors.slice(); next[i] = Math.max(...colors) + 1; visit(next);
      }
    }
    visit(rank(g.atoms.map((e, i) => e + ':' + adj[i].length + ':' + used(g, i))));
    return { key: 'G:' + best, order: bestOrder };
  }
  function ordered(g) {
    const { order } = canonical(g);
    return { atoms: order.map(i => g.atoms[i]), m: order.map(i => order.map(j => g.m[i][j])) };
  }
  function trees(n) {
    if (treeCache.has(n)) return treeCache.get(n);
    if (n === 1) { const a = [{ atoms: ['C'], m: [[0]] }]; treeCache.set(n, a); return a; }
    const result = new Map();
    for (const g of trees(n - 1)) for (let i = 0; i < n - 1; i++) {
      checkTime();
      if (neighbors(g, i).length >= 4) continue;
      const h = clone(g); h.atoms.push('C'); h.m.forEach(r => r.push(0)); h.m.push(Array(n).fill(0)); h.m[i][n - 1] = h.m[n - 1][i] = 1;
      const key = canonical(h).key; if (!result.has(key)) result.set(key, h);
    }
    const a = [...result.values()]; treeCache.set(n, a); return a;
  }
  function formulaOf(g) {
    const c = { H: 0 };
    g.atoms.forEach((e, i) => { c[e] = (c[e] || 0) + 1; c.H += VAL[e] - used(g, i); });
    return format(c);
  }
  function format(c) { return ['C', 'H', ...Object.keys(c).filter(e => e !== 'C' && e !== 'H').sort()].filter(e => c[e]).map(e => e + (c[e] === 1 ? '' : c[e])).join(''); }
  function parseFormula(input, options = {}) {
    let text = String(input).trim().replace(/[₀-₉]/g, d => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d)));
    if (aliases.has(text.toLowerCase())) text = aliases.get(text.toLowerCase());
    text = text.replace(/\s+/g, '');
    if (!text || !/^(?:[A-Z][a-z]?\d*)+$/.test(text)) throw Error('Enter a molecular formula such as C4H10O. Element symbols are case-sensitive.');
    const counts = {};
    for (const match of text.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
      const e = match[1], count = match[2] ? Number(match[2]) : 1;
      if (!(e in MASS)) throw Error('This prototype supports C, H, N, O, F, Cl, Br and I.');
      if (!Number.isSafeInteger(count) || count < 1 || count > 256) throw Error('Use positive atom counts, up to 256 per element.');
      counts[e] = (counts[e] || 0) + count;
    }
    if (!counts.C) throw Error('Enter an organic formula containing carbon.');
    const h = counts.H || 0, x = ['F', 'Cl', 'Br', 'I'].reduce((s, e) => s + (counts[e] || 0), 0);
    const dbe = (2 * counts.C + 2 + (counts.N || 0) - h - x) / 2;
    if (dbe < 0 || !Number.isInteger(dbe)) throw Error('That formula does not fit the supported neutral, closed-shell valences. Check the hydrogen count.');
    const heavy = Object.entries(counts).reduce((s, [e, n]) => s + (e === 'H' ? 0 : n), 0);
    const limit = dbe === 0 ? LIMITS.saturated : dbe === 1 ? LIMITS.mono : dbe === 2 ? LIMITS.di : LIMITS.poly;
    if (options.enumeration !== false && (dbe > LIMITS.maxDBE || heavy > limit)) throw Error('Formula enumeration supports 12 heavy atoms at DBE 0, 10 at DBE 1, 9 at DBE 2, and 7 at DBE 3–4. Open a specific SMILES or MOL/SDF structure to view up to 64 heavy atoms.');
    if (heavy > LIMITS.view) throw Error('Structure viewing supports up to 64 non-hydrogen atoms.');
    return { formula: format(counts), counts, dbe, heavy, mass: Object.entries(counts).reduce((s, [e, n]) => s + MASS[e] * n, 0) };
  }
  function smiles(g) {
    const n = g.atoms.length, seen = new Set(), children = Array.from({ length: n }, () => []), closure = [], visitedEdges = new Set();
    function walk(i, parent) {
      seen.add(i);
      for (const j of neighbors(g, i)) {
        if (j === parent) continue;
        const key = [Math.min(i, j), Math.max(i, j)].join('-');
        if (visitedEdges.has(key)) continue; visitedEdges.add(key);
        if (seen.has(j)) closure.push([i, j, g.m[i][j]]);
        else { children[i].push(j); walk(j, i); }
      }
    }
    walk(0, -1);
    const marks = Array.from({ length: n }, () => []);
    closure.forEach(([i, j, order], k) => { const label = k + 1 < 10 ? String(k + 1) : '%' + (k + 1); marks[i].push(bondChar(order) + label); marks[j].push(label); });
    function emit(i) {
      let s = g.atoms[i] + marks[i].join('');
      children[i].forEach((j, k) => { const part = bondChar(g.m[i][j]) + emit(j); s += k === children[i].length - 1 ? part : '(' + part + ')'; });
      return s;
    }
    return emit(0);
  }
  function normalizeGraph(raw) {
    const n = raw.atoms.length;
    if (!n || n > 256 || raw.m.length !== n) throw Error('Import 1–256 atoms, with at most 64 non-hydrogen atoms.');
    if (raw.atoms.some(e => typeof e !== 'string' || !Object.hasOwn(MASS, e))) throw Error('Supported elements: C, H, N, O, F, Cl, Br, I.');
    if (raw.m.some((r, i) => r.length !== n || r.some((v, j) => !Number.isInteger(v) || v < 0 || v > 3 || (i === j && v) || v !== raw.m[j]?.[i]))) throw Error('Invalid bonds: use symmetric single, double or triple bonds and no self-bonds.');
    const reached = new Set([0]), queue = [0];
    while (queue.length) for (const j of neighbors(raw, queue.shift())) if (!reached.has(j)) { reached.add(j); queue.push(j); }
    if (reached.size !== n) throw Error('Disconnected structures and salts are not supported.');
    raw.atoms.forEach((e, i) => { const v = used(raw, i); if (v > (e === 'H' ? 1 : VAL[e]) || (e === 'H' && v !== 1)) throw Error('Invalid neutral valence at atom ' + (i + 1) + ' (' + e + '). Charges and radicals are not supported.'); });
    const keep = raw.atoms.map((e, i) => e === 'H' ? -1 : i).filter(i => i >= 0);
    if (keep.length > LIMITS.view || !raw.atoms.includes('C')) throw Error('Use an organic structure with carbon and at most 64 non-hydrogen atoms.');
    const g = { atoms: keep.map(i => raw.atoms[i]), m: keep.map(i => keep.map(j => raw.m[i][j])) };
    parseFormula(formulaOf(g), { enumeration: false });
    return g;
  }
  function readSmiles(input, {keepHydrogens = false} = {}) {
    const s = String(input).trim();
    if (!s || s.length > 4000) throw Error('Enter a nonempty SMILES of up to 4,000 characters.');
    const atoms = [], edges = [], stack = [], rings = new Map(), explicit = new Map();
    let current = -1, order = null, expectAtom = true;
    function edge(a, b, o) { if (a === b || edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) throw Error('SMILES contains a duplicate or self-bond.'); edges.push([a, b, o]); }
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (c === '(') { if (current < 0 || expectAtom || order !== null) throw Error('Misplaced SMILES branch.'); stack.push(current); expectAtom = true; i++; continue; }
      if (c === ')') { if (!stack.length || expectAtom || order !== null) throw Error('Unbalanced or empty SMILES branch.'); current = stack.pop(); i++; continue; }
      if (c === '-' || c === '=' || c === '#') { if (current < 0 || order !== null) throw Error('Misplaced SMILES bond.'); order = c === '=' ? 2 : c === '#' ? 3 : 1; expectAtom = true; i++; continue; }
      if (/\d/.test(c) || c === '%') {
        if (current < 0 || (expectAtom && order === null)) throw Error('Misplaced SMILES ring label.');
        const match = s.slice(i).match(/^(?:%\d{2}|\d)/); if (!match) throw Error('Use one-digit ring labels or % followed by two digits.');
        const label = match[0];
        if (rings.has(label)) { const previous = rings.get(label); if (order !== null && previous.order !== null && order !== previous.order) throw Error('Conflicting ring bond orders.'); edge(current, previous.atom, order ?? previous.order ?? 1); rings.delete(label); }
        else rings.set(label, { atom: current, order });
        order = null; expectAtom = false; i += label.length; continue;
      }
      let e, h = null, size;
      if (c === '[') {
        const match = s.slice(i).match(/^\[(Cl|Br|C|N|O|F|I|H)(?:H(\d*))?\]/);
        if (!match) throw Error('Only neutral, non-isotopic bracket atoms are supported. Stereochemical @, charges and radicals are not imported.');
        e = match[1]; if (e === 'H' && match[2] !== undefined) throw Error('Use [H] for an explicit hydrogen atom.');
        h = e === 'H' ? null : match[2] === undefined ? 0 : match[2] === '' ? 1 : Number(match[2]); size = match[0].length;
      } else {
        const match = s.slice(i).match(/^(Cl|Br|C|N|O|F|I)/);
        if (!match) throw Error('Unsupported SMILES at character ' + (i + 1) + '. Use C,N,O,F,Cl,Br,I, branches, rings, = and #. Aromatic lowercase requires explicit Kekulé bonds; stereo and charges are not supported.');
        e = match[0]; size = e.length;
      }
      const next = atoms.length; atoms.push(e); if (atoms.length > 256) throw Error('The structure is too large.');
      if (h !== null) explicit.set(next, h);
      if (current >= 0) edge(current, next, order ?? 1); current = next; order = null; expectAtom = false; i += size;
    }
    if (expectAtom || order !== null || stack.length || rings.size) throw Error('Incomplete SMILES: check branches, ring labels and trailing bonds.');
    const raw = { atoms, m: atoms.map(() => atoms.map(() => 0)) }; edges.forEach(([a, b, o]) => { raw.m[a][b] = raw.m[b][a] = o; });
    explicit.forEach((h, i) => { if (used(raw, i) + h !== VAL[atoms[i]]) throw Error('Bracket atom ' + (i + 1) + ' has an unsupported radical or underfilled valence.'); });
    const heavy=normalizeGraph(raw); // Validate even when the editor needs the explicit graph.
    return keepHydrogens ? raw : heavy;
  }
  function tagsFor(g) {
    const tags = new Set(), h = g.atoms.map((e, i) => VAL[e] - used(g, i));
    const ns = i => neighbors(g, i), carbonyl = i => g.atoms[i] === 'C' && ns(i).some(j => g.atoms[j] === 'O' && g.m[i][j] === 2);
    const sp3 = i => g.atoms[i] === 'C' && ns(i).every(j => g.m[i][j] === 1);
    const level = i => { const c = ns(i).filter(j => g.atoms[j] === 'C').length; return c <= 1 ? 'primary' : c === 2 ? 'secondary' : 'tertiary'; };
    const numEdges = g.m.reduce((s, r, i) => s + r.filter((v, j) => j > i && v).length, 0);
    if (numEdges >= g.atoms.length) tags.add('cyclic');
    if (g.atoms.every(e => e === 'C') && g.m.every(r => r.every(v => v <= 1))) tags.add('alkane');
    g.atoms.forEach((e, i) => {
      for (const j of ns(i)) if (j > i) {
        if (e === 'C' && g.atoms[j] === 'C' && g.m[i][j] === 2) tags.add('alkene');
        if (e === 'C' && g.atoms[j] === 'C' && g.m[i][j] === 3) tags.add('alkyne');
        if ([e, g.atoms[j]].sort().join('') === 'CN' && g.m[i][j] === 3) tags.add('nitrile');
        if (e === 'O' && g.atoms[j] === 'O') tags.add('peroxide');
      }
      if (e === 'O') {
        const cs = ns(i).filter(j => g.atoms[j] === 'C' && g.m[i][j] === 1);
        if (h[i] && cs.length === 1 && sp3(cs[0])) { tags.add('alcohol'); tags.add(level(cs[0]) + '-alcohol'); }
        if (h[i] && cs.some(j => ns(j).some(k => g.atoms[k] === 'C' && g.m[j][k] === 2))) tags.add('enol');
        if (cs.length === 2 && !cs.some(carbonyl)) tags.add('ether');
      }
      if (['F', 'Cl', 'Br', 'I'].includes(e)) for (const c of ns(i)) if (sp3(c)) { tags.add('halogenoalkane'); tags.add(level(c) + '-halogenoalkane'); }
      if (carbonyl(i)) {
        const os = ns(i).filter(j => g.atoms[j] === 'O' && g.m[i][j] === 1);
        if (os.some(j => h[j] > 0)) tags.add('carboxylic-acid');
        if (os.some(j => ns(j).some(k => k !== i && g.atoms[k] === 'C'))) tags.add('ester');
        const amide = ns(i).some(j => g.atoms[j] === 'N' && g.m[i][j] === 1);
        if (amide) tags.add('amide');
        if (!os.length && !amide && h[i] > 0) tags.add('aldehyde');
        if (ns(i).filter(j => g.atoms[j] === 'C').length === 2) tags.add('ketone');
      }
      if (e === 'N' && ns(i).every(j => g.m[i][j] === 1) && !ns(i).some(carbonyl)) tags.add('amine');
    });
    return [...tags];
  }
  function stabilityFor(g) {
    const flags = new Map(), add = (key, points, reason) => { if (!flags.has(key)) flags.set(key, { points, reason }); };
    function pathWithout(a, b) {
      const queue = [[a, 0]], seen = new Set([a]);
      while (queue.length) { const [i, d] = queue.shift(); for (const j of neighbors(g, i)) { if ((i === a && j === b) || (i === b && j === a)) continue; if (j === b) return d + 1; if (!seen.has(j)) { seen.add(j); queue.push([j, d + 1]); } } }
      return Infinity;
    }
    g.atoms.forEach((e, i) => {
      const ns = neighbors(g, i), doubles = ns.filter(j => g.m[i][j] === 2);
      if (e === 'C' && doubles.length === 2 && doubles.some(j => g.atoms[j] === 'O')) add('ketene', 40, 'Cumulated C=C=O functionality can be highly reactive.');
      if (e === 'C' && ns.filter(j => g.atoms[j] === 'O' && g.m[i][j] === 1 && used(g, j) === 1).length >= 2) add('gem-diol', 16, 'Geminal diol: equilibrium stability depends on substituents and conditions.');
      for (const j of ns) if (j > i) {
        if (e === 'O' && g.atoms[j] === 'O') add('peroxide', 45, 'O–O peroxide bond is a reactive-motif flag.');
        if (g.m[i][j] === 1 && [e, g.atoms[j]].sort().join('') === 'NO') add('n-o', 12, 'N–O bond: reactivity is strongly condition-dependent.');
        const size = pathWithout(i, j) + 1;
        if (size === 3) add('three-ring', 14, 'Three-membered ring introduces angle strain.');
        if (size === 4) add('four-ring', 6, 'Four-membered ring introduces angle strain.');
        if (g.m[i][j] === 3 && size < 8) add('small-ring-triple', 85, 'Triple bond in a ring smaller than eight atoms is highly strained.');
        if (g.m[i][j] === 2 && size < 5) add('small-ring-double', 32, 'Double bond in a three- or four-membered ring adds geometric strain.');
      }
    });
    if (tagsFor(g).includes('enol')) add('enol', 22, 'Enol form may be less favored than its carbonyl tautomer; conditions matter.');
    const score = [...flags.values()].reduce((s, f) => s + f.points, 0);
    return { score, label: score >= 40 ? 'Reactive / high strain' : score ? 'Reactivity / strain flag' : 'No flagged motifs', reasons: [...flags.values()].map(f => f.reason), method: 'Structural heuristic only; not measured or predicted thermodynamic stability.' };
  }
  function describe(g, name, onAtomOrder) {
    const heavy = onAtomOrder && g.atoms.map((e,i)=>e==='H'?-1:i).filter(i=>i>=0);
    g = normalizeGraph(g);
    const { key, order } = canonical(g), h = { atoms: order.map(i => g.atoms[i]), m: order.map(i => order.map(j => g.m[i][j])) };
    if(onAtomOrder)onAtomOrder(order.map(i=>heavy[i]));
    const bonds = []; h.m.forEach((r, i) => r.forEach((v, j) => { if (v && i < j) bonds.push({ a: i, b: j, order: v }); }));
    const formula = formulaOf(h);
    return { id: key, name: name || names.get(key) || 'Imported structure', knownName: names.has(key), notation: smiles(h), tags: tagsFor(h), atoms: h.atoms, bonds, hydrogens: h.atoms.map((e, i) => VAL[e] - used(h, i)), formula, metadata: parseFormula(formula, { enumeration: false }), stability: stabilityFor(h) };
  }
  // Offline records represent a single connected component, with hydrogens folded
  // into their parent atoms. Count graph features, not entries in the name map.
  function offlineInsights(g) {
    const independentRingCount = g.bonds.length - g.atoms.length + 1;
    const doubles = g.bonds.filter(b => b.order === 2).length;
    const triples = g.bonds.filter(b => b.order === 3).length;
    const donorSites = g.atoms.flatMap((e, i) =>
      (e === 'O' || e === 'N') && g.hydrogens[i] > 0 ? [i] : []);
    return { independentRingCount, doubles, triples, donorSites };
  }
  function sortIsomers(isomers) { return isomers.sort((a, b) => a.stability.score - b.stability.score || Number(b.knownName) - Number(a.knownName) || a.name.localeCompare(b.name) || a.notation.localeCompare(b.notation)); }
  function enumerate(input, options = {}) {
    const p = parseFormula(typeof input === 'string' ? input : input.formula);
    const elements = Object.keys(p.counts).filter(e => e !== 'H').sort(), remaining = Object.fromEntries(elements.map(e => [e, p.counts[e]]));
    const startTime = Date.now(); let operations = 0, lastProgress = 0, stage = 'Building atom skeletons';
    deadline = startTime + LIMITS.milliseconds;
    function budget(size = 0) {
      if (++operations % 40 === 0) { checkTime(); const now = Date.now(); if (options.onProgress && now - lastProgress > 250) { options.onProgress({ stage, candidates: size, elapsed: now - startTime }); lastProgress = now; } }
      if (size > LIMITS.results) throw Error('This search exceeds 12,000 unique candidates. Use a smaller formula or open a specific structure. No partial results are shown.');
    }
    try {
      let graphs = new Map();
      for (const tree of trees(p.heavy)) {
        checkTime(); const assigned = [];
        function label(i) {
          budget(graphs.size);
          if (i === p.heavy) { const g = { atoms: assigned.slice(), m: tree.m }, key = canonical(g).key; if (!graphs.has(key)) graphs.set(key, clone(g)); return; }
          const degree = neighbors(tree, i).length;
          for (const e of elements) if (remaining[e] > 0 && VAL[e] >= degree) { assigned.push(e); remaining[e]--; label(i + 1); remaining[e]++; assigned.pop(); }
        }
        label(0);
      }
      // Keep just the counts needed to explain this run; no formula-to-results library.
      const deduction = { hydrogenLimit:(p.counts.H || 0) + 2 * p.dbe, skeletons:graphs.size, layers:[] };
      for (let k = 0; k < p.dbe; k++) {
        stage = 'Assigning rings and bond orders (' + (k + 1) + '/' + p.dbe + ')';
        const next = new Map();
        for (const g of graphs.values()) {
          const free = g.atoms.map((e, i) => VAL[e] - used(g, i));
          for (let i = 0; i < p.heavy; i++) for (let j = i + 1; j < p.heavy; j++) if (free[i] && free[j] && g.m[i][j] < 3) {
            budget(next.size); const h = clone(g); h.m[i][j]++; h.m[j][i]++;
            const key = canonical(h).key; if (!next.has(key)) next.set(key, h);
          }
        }
        graphs = next;
        deduction.layers.push(graphs.size);
      }
      stage = 'Ranking connectivity and reactive motifs';
      const isomers = [];
      for (const raw of graphs.values()) { budget(isomers.length); if (formulaOf(raw) === p.formula) { const iso = describe(raw); if (!iso.knownName) iso.name = root.SystematicNames?.generate(iso)?.name || ''; isomers.push(iso); } }
      sortIsomers(isomers);
      isomers.forEach((g, i) => { if (!g.name) g.name = 'Structural isomer ' + (i + 1); });
      return { ...p, deduction, complete: true, scope: 'All connected, neutral, closed-shell valence graphs within the supported formula and time limits. Ranked by a transparent structural-reactivity heuristic, not measured stability. Stereochemistry and resonance normalization are not applied.', isomers };
    } finally { deadline = Infinity; }
  }
  const templates = [
    ['C','Methane'],['CC','Ethane'],['CCC','Propane'],['CCCC','Butane'],['CC(C)C','2-Methylpropane'],['CCCCC','Pentane'],['CC(C)CC','2-Methylbutane'],['CC(C)(C)C','2,2-Dimethylpropane'],['CCCCCC','Hexane'],['CC(C)CCC','2-Methylpentane'],['CCC(C)CC','3-Methylpentane'],['CC(C)(C)CC','2,2-Dimethylbutane'],['CC(C)C(C)C','2,3-Dimethylbutane'],
    ['CO','Methanol'],['CCO','Ethanol'],['COC','Methoxymethane'],['CCCO','Propan-1-ol'],['CC(O)C','Propan-2-ol'],['CCOC','Methoxyethane'],['CCCCO','Butan-1-ol'],['CCC(O)C','Butan-2-ol'],['CC(C)CO','2-Methylpropan-1-ol'],['CC(C)(C)O','2-Methylpropan-2-ol'],['CCOCC','Ethoxyethane'],['CCCOC','1-Methoxypropane'],['CC(C)OC','2-Methoxypropane'],
    ['C=C','Ethene'],['CC=C','Propene'],['CCC=C','But-1-ene'],['CC=CC','But-2-ene'],['CC(=C)C','2-Methylpropene'],['C1CCC1','Cyclobutane'],['CC1CC1','Methylcyclopropane'],['C1CC1','Cyclopropane'],['C#C','Ethyne'],['CC#C','Propyne'],['C=C=C','Propadiene'],
    ['CC=O','Ethanal'],['C1CO1','Oxirane'],['C=CO','Ethenol'],['CCC=O','Propanal'],['CC(=O)C','Propanone'],['C=CCO','Prop-2-en-1-ol'],['CC=CO','Prop-1-en-1-ol'],['CC(O)=C','Prop-1-en-2-ol'],['COC=C','Methoxyethene'],['OC1CC1','Cyclopropanol'],['CC1CO1','2-Methyloxirane'],['C1COC1','Oxetane'],['CC(=O)O','Ethanoic acid'],['COC=O','Methyl methanoate'],['OCC=O','2-Hydroxyethanal'],
    ['CN','Methanamine'],['CCN','Ethanamine'],['CNC','Dimethylamine'],['CC#N','Ethanenitrile'],['OCCO','Ethane-1,2-diol']
  ];
  templates.push(['CCC#C','But-1-yne'],['CC#CC','But-2-yne'],['C=CC=C','Buta-1,3-diene'],['C=C=CC','Buta-1,2-diene'],['C=C=O','Ethenone'],['CC=C=O','Methylketene'],['C1=CC=CC=C1','Benzene']);
  ['Heptane','Octane','Nonane','Decane','Undecane','Dodecane'].forEach((name, i) => templates.push(['C'.repeat(i + 7), name]));
  function register(s, name) { const g = readSmiles(s); names.set(canonical(g).key, name); aliases.set(name.toLowerCase(), formulaOf(g)); nameGraphs.set(name.toLowerCase(), g); }
  for (const [s, name] of templates) register(s, name);
  for (const [x, suffix] of [['Cl','chlor'],['Br','brom'],['F','fluor'],['I','iod']]) {
    for (const [s, name] of [ ['C'+x,suffix+'omethane'],['CC'+x,'1-'+suffix+'oethane'],['CCC'+x,'1-'+suffix+'opropane'],['CC('+x+')C','2-'+suffix+'opropane'],['CCCC'+x,'1-'+suffix+'obutane'],['CCC('+x+')C','2-'+suffix+'obutane'],['CC(C)C'+x,'1-'+suffix+'o-2-methylpropane'],['CC(C)(C)'+x,'2-'+suffix+'o-2-methylpropane'] ]) { const g = readSmiles(s); const nameCase = name[0].toUpperCase()+name.slice(1); names.set(canonical(g).key,nameCase); aliases.set(name.toLowerCase(), formulaOf(g)); nameGraphs.set(name.toLowerCase(),g); }
  }
  for (const [s, name] of [
    ['C=O','Methanal'], ['C(=O)O','Methanoic acid'], ['CCC(=O)O','Propanoic acid'],
    ['CCCC(=O)O','Butanoic acid'], ['CC(=O)OCC','Ethyl ethanoate'], ['CC(=O)OC','Methyl ethanoate'],
    ['OCC(O)CO','Propane-1,2,3-triol'], ['CC(O)CO','Propane-1,2-diol'],
    ['ClCCl','Dichloromethane'], ['ClC(Cl)Cl','Trichloromethane'], ['ClC(Cl)(Cl)Cl','Tetrachloromethane'],
    ['CC1=CC=CC=C1','Methylbenzene'], ['C1=CC=C(C=C1)O','Phenol'], ['C1=CC=C(C=C1)N','Aniline'],
    ['COC1=CC=CC=C1','Methoxybenzene'], ['C=CC1=CC=CC=C1','Ethenylbenzene'],
    ['C1CCOC1','Oxolane'], ['C1=CC=NC=C1','Pyridine'],
    ['CC(=O)OC1=CC=CC=C1C(=O)O','Acetylsalicylic acid'], ['CC(=O)NC1=CC=C(O)C=C1','Paracetamol'],
    ['CN1C(=O)C2=C(N=CN2C)N(C)C1=O','Caffeine']
  ]) register(s, name);
  const synonyms = { acetone:'propanone', isopropanol:'propan-2-ol', 'isopropyl alcohol':'propan-2-ol', 'diethyl ether':'ethoxyethane', 'dimethyl ether':'methoxymethane', 'acetic acid':'ethanoic acid', acetylene:'ethyne', ethylene:'ethene', propylene:'propene', 'tert-butanol':'2-methylpropan-2-ol', 'isobutane':'2-methylpropane', '1-butyne':'but-1-yne', '2-butyne':'but-2-yne', '1-butanol':'butan-1-ol', '2-butanol':'butan-2-ol' };
  Object.assign(synonyms, {
    'methyl alcohol':'methanol', 'ethyl alcohol':'ethanol', 'n-propanol':'propan-1-ol', 'n-butanol':'butan-1-ol',
    'isobutyl alcohol':'2-methylpropan-1-ol', 'tert-butyl alcohol':'2-methylpropan-2-ol',
    'neopentane':'2,2-dimethylpropane', 'isopentane':'2-methylbutane',
    'formaldehyde':'methanal', 'acetaldehyde':'ethanal', 'formic acid':'methanoic acid',
    'propionic acid':'propanoic acid', 'butyric acid':'butanoic acid', 'ethyl acetate':'ethyl ethanoate',
    'methyl acetate':'methyl ethanoate', 'glycerol':'propane-1,2,3-triol', 'glycerin':'propane-1,2,3-triol',
    'ethylene glycol':'ethane-1,2-diol', 'propylene glycol':'propane-1,2-diol',
    'chloroform':'trichloromethane', 'methylene chloride':'dichloromethane', 'carbon tetrachloride':'tetrachloromethane',
    'toluene':'methylbenzene', 'anisole':'methoxybenzene', 'styrene':'ethenylbenzene', 'tetrahydrofuran':'oxolane',
    'acetonitrile':'ethanenitrile', 'methylamine':'methanamine', 'ethylamine':'ethanamine',
    'aspirin':'acetylsalicylic acid', 'acetaminophen':'paracetamol'
  });
  Object.entries(synonyms).forEach(([alias, name]) => { nameGraphs.set(alias, nameGraphs.get(name)); aliases.set(alias, formulaOf(nameGraphs.get(name))); });

  // Forward grammar only; neither canonical IUPAC name generation nor a fuzzy search.
  const stems = 'meth eth prop but pent hex hept oct non dec undec dodec'.split(' ');
  const parentPattern = new RegExp('^(cyclo)?(' + stems.join('|') + ')(.*)$');
  const esterAlkyl = new RegExp('^(' + stems.join('|') + ')yl ');
  const branches = { methyl:['C'], ethyl:['C','C'], propyl:['C','C','C'], butyl:['C','C','C','C'],
    methoxy:['O','C'], ethoxy:['O','C','C'], fluoro:['F'], chloro:['Cl'], bromo:['Br'], iodo:['I'], hydroxy:['O'], amino:['N'] };
  const prefixPattern = new RegExp('^(?:([1-9]\\d?(?:,[1-9]\\d?)*)-)?(di|tri|tetra)?(' + Object.keys(branches).join('|') + ')');
  const multiplicity = {di:2,tri:3,tetra:4};
  function normalizeName(s) { return String(s).trim().toLowerCase().replace(/[‐-—−]/g,'-').replace(/\s+/g,' '); }
  function nameError(message) { return Object.assign(Error(message), {code:'UNSUPPORTED_NAME'}); }
  function looksLikeName(s) {
    const text = normalizeName(s);
    if (nameGraphs.has(text) || /^name\s*:/.test(text)) return true;
    // Do not steal valid (including aromatic/bracket/stereo) SMILES from the toolkit.
    if (/^(?:Cl|Br|[BCNOFPSIbcnops\d()\-])+$/.test(String(s).trim())) return false;
    return /^[a-z\d ,()\-]+$/.test(text) && (/(?:ane|ene|yne|ol|one|anal|amine|amide|acid|oate|nitrile)$/.test(text) ||
      (String(s).match(/[a-z]{2,}/g) || []).some(word => /[^bcnops]/.test(word)));
  }
  function parseSystematicName(text) {
    const unsupported = () => nameError('Name not in the offline name map or supported systematic grammar. Try e.g. 3-methylhexan-2-ol, or enter SMILES.');
    if (/^(?:\((?:\d*[rsez]|[+-])|(?:cis|trans|rac|meso|[rsez])-)/.test(text)) throw nameError('Stereochemical descriptors are not supported in name input. Enter isomeric SMILES in the RDKit workspace; the descriptor will not be discarded.');
    const ester = esterAlkyl.exec(text);
    if (ester) text = text.slice(ester[0].length);
    const prefixes = [];
    let token;
    while ((token = prefixPattern.exec(text))) {
      prefixes.push({positions:token[1], multiple:token[2], group:token[3]});
      text = text.slice(token[0].length);
      if (text.startsWith('-') && /^-\d/.test(text)) text = text.slice(1);
      else break; // the final prefix joins the parent without a hyphen
    }
    const parent = parentPattern.exec(text);
    if (!parent) throw unsupported();
    const ring = !!parent[1], n = stems.indexOf(parent[2]) + 1, suffix = parent[3];
    if (ring && n < 3) throw nameError('A ring parent must contain at least three carbons.');
    const g = {atoms:[], m:[]};
    function bond(a,b,order) { g.m[a][b] = g.m[b][a] = order; }
    function atom(e, from, order = 1) {
      const i = g.atoms.length;
      if (i >= LIMITS.view) throw nameError('Name input supports up to 64 non-hydrogen atoms.');
      g.atoms.push(e); for (const row of g.m) row.push(0); g.m.push(Array(i+1).fill(0));
      if (from !== undefined) bond(from,i,order);
      return i;
    }
    function positions(spec, multiple, max, defaults) {
      if (!spec && !defaults) throw nameError('Supply explicit position numbers (locants) for this name; no position was assumed.');
      const p = spec ? spec.split(',').map(Number) : defaults;
      if (p.length !== (multiplicity[multiple] || 1)) throw nameError('The number of locants must match the multiplicative prefix.');
      if (p.some(i => i < 1 || i > max)) throw nameError('A locant is outside the parent chain or bond range.');
      return p.map(i => i-1);
    }
    for (let i=0; i<n; i++) atom('C', i ? i-1 : undefined);
    if (ring) bond(n-1,0,1);
    let terminal = false, m;
    if (ester && suffix !== 'anoate') throw unsupported();
    if (suffix === 'ane') { /* complete saturated parent */ }
    else if ((m = /^(?:-([1-9]\d?)-)?(ene|yne)$/.exec(suffix)) ||
             (m = /^a-([1-9]\d?(?:,[1-9]\d?)+)-(di|tri|tetra)(ene|yne)$/.exec(suffix))) {
      // Multiple bonds use the index of the first atom of the named bond.
      const sites = positions(m[1], m.length===4 ? m[2] : null, ring?n:n-1, ring || n===2 || (n===3 && !prefixes.length) ? [1] : null);
      if (new Set(sites).size !== sites.length) throw nameError('Each multiple bond requires a distinct locant.');
      for (const i of sites) bond(i,(i+1)%n,m[m.length-1]==='ene'?2:3);
    } else if ((m = /^an(?:-([1-9]\d?)-)?(ol|one|amine)$/.exec(suffix)) ||
               (m = /^ane-([1-9]\d?(?:,[1-9]\d?)+)-(di|tri|tetra)(ol|one|amine)$/.exec(suffix))) {
      const group = m[m.length-1], ketone = group === 'one';
      const defaults = ring ? [1] : ketone ? (n===3 || (n===4 && !prefixes.length) ? [2] : null) : n===1 || (n===2 && !prefixes.length) ? [1] : null;
      for (const i of positions(m[1], m.length===4 ? m[2] : null, n, defaults)) {
        if (ketone && !ring && (i===0 || i===n-1)) throw nameError('A ketone requires an internal carbonyl carbon.');
        atom(group==='amine'?'N':'O',i,ketone?2:1);
      }
    } else if (['anal','anoic acid','anamide','anenitrile','anoate'].includes(suffix)) {
      if (ring || (suffix === 'anoate' && !ester)) throw unsupported();
      terminal = true;
      if (suffix === 'anenitrile') atom('N',0,3);
      else {
        atom('O',0,2);
        if (suffix === 'anamide') atom('N',0);
        if (suffix === 'anoic acid' || ester) {
          let last = atom('O',0);
          if (ester) for (let i=0; i<=stems.indexOf(ester[1]); i++) last = atom('C',last);
        }
      }
    } else throw unsupported();
    for (const {positions:spec, multiple, group} of prefixes) {
      const symmetric = suffix === 'ane' && prefixes.length === 1 && (n===2 || ring) && !multiple;
      for (const i of positions(spec, multiple, n, n===1 || symmetric ? Array(multiplicity[multiple]||1).fill(1) : null)) {
        if (terminal && i===0) throw nameError('Cannot substitute the terminal functional-group carbon in this grammar.');
        let last = i;
        for (const element of branches[group]) last = atom(element,last);
      }
    }
    return g;
  }
  function resolveName(name) {
    if (String(name).length > 180) throw nameError('Enter a chemical name of up to 180 characters.');
    const text = normalizeName(name), known = nameGraphs.get(text);
    if (known) return {...describe(known), nameSource:'Offline name map'};
    try { return {...describe(parseSystematicName(text), text), knownName:true, nameSource:'Local systematic name parser'}; }
    catch (e) { throw e.code === 'UNSUPPORTED_NAME' ? e : nameError(e.message); }
  }
  const api = { parseFormula, enumerate, tagsFor, offlineInsights, smiles, readSmiles, canonical, formulaOf, normalizeGraph, describe, stabilityFor, sortIsomers, resolveName, looksLikeName, supportedNames: [...nameGraphs.keys()], LIMITS, VAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Chem = api;
})(typeof self !== 'undefined' ? self : globalThis);
