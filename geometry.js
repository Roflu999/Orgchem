/* Illustrative coordinates only. Not an energy-minimized or experimental conformer. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function adjacency(g) { const a = g.atoms.map(() => []); g.bonds.forEach(b => { a[b.a].push(b.b); a[b.b].push(b.a); }); return a; }
  function cycles(g) {
    const adj = adjacency(g), seen = new Set(), parent = [], depth = [], out = [];
    function visit(i, p, d) {
      seen.add(i); parent[i] = p; depth[i] = d;
      for (const j of adj[i]) {
        if (j === p) continue;
        if (!seen.has(j)) visit(j, i, d + 1);
        else if (depth[j] < depth[i]) { const path = [j]; let k = i; while (k !== j && k >= 0) { path.push(k); k = parent[k]; } if (k === j) out.push(path); }
      }
    }
    visit(0, -1, 0); return out.sort((a, b) => b.length - a.length);
  }
  function largestGapAngle(angles, fallback) {
    if (!angles.length) return fallback;
    const sorted = angles.map(a => (a % TAU + TAU) % TAU).sort((a, b) => a - b);
    let best = -1, angle = fallback;
    sorted.forEach((a, i) => { const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU; if (b - a > best) { best = b - a; angle = (a + b) / 2; } });
    return angle;
  }
  function layout2D(g, withHydrogens) {
    const n = g.atoms.length, adj = adjacency(g), p = Array(n).fill(null), rings = cycles(g);
    if (rings.length) {
      const ring = rings[0], r = 1 / (2 * Math.sin(Math.PI / ring.length));
      ring.forEach((i, k) => { const a = TAU * k / ring.length - Math.PI / 2; p[i] = { x: Math.cos(a) * r, y: Math.sin(a) * r }; });
    } else {
      let longest = [0];
      for (let start = 0; start < n; start++) {
        const queue = [[start]], visited = new Set([start]);
        while (queue.length) { const path = queue.shift(), i = path[path.length - 1]; if (path.length > longest.length) longest = path; for (const j of adj[i]) if (!visited.has(j)) { visited.add(j); queue.push(path.concat(j)); } }
      }
      const orders = g.atoms.map(() => []);
      g.bonds.forEach(b => { orders[b.a].push(b.order); orders[b.b].push(b.order); });
      let direction = Math.PI / 6, turn = -1;
      longest.forEach((i, k) => {
        if (k === 0) p[i] = { x: 0, y: 0 };
        else { const prev = p[longest[k - 1]]; p[i] = { x: prev.x + Math.cos(direction), y: prev.y + Math.sin(direction) }; }
        if (k > 0 && !(orders[i].includes(3) || orders[i].filter(v => v === 2).length >= 2)) { direction += turn * Math.PI / 3; turn *= -1; }
      });
    }
    for (let pass = 0; pass < n; pass++) for (let i = 0; i < n; i++) if (p[i]) {
      const missing = adj[i].filter(j => !p[j]);
      for (const j of missing) {
        const used = adj[i].filter(k => p[k]).map(k => Math.atan2(p[k].y - p[i].y, p[k].x - p[i].x));
        let base = largestGapAngle(used, Math.PI / 6), best = null, bestScore = -Infinity;
        for (let k = -3; k <= 3; k++) {
          const a = base + k * Math.PI / 12, pt = { x: p[i].x + Math.cos(a), y: p[i].y + Math.sin(a) };
          let score = -Math.abs(k) * 0.07;
          p.forEach((v, vj) => { if (v && vj !== i) score -= 0.18 / Math.max(0.02, dist(v, pt) ** 3); });
          used.forEach(v => { score -= Math.max(0, Math.cos(a - v) - 0.1) * 1.5; });
          if (score > bestScore) { bestScore = score; best = pt; }
        }
        p[j] = best;
      }
    }
    // Light relaxation handles fused and bridged rings without changing connectivity.
    if (rings.length > 1) for (let step = 0; step < 220; step++) {
      const f = p.map(() => ({ x: 0, y: 0 }));
      g.bonds.forEach(b => { const dx = p[b.b].x - p[b.a].x, dy = p[b.b].y - p[b.a].y, d = Math.hypot(dx, dy) || 0.01, q = (d - 1) * 0.12 / d; f[b.a].x += dx * q; f[b.a].y += dy * q; f[b.b].x -= dx * q; f[b.b].y -= dy * q; });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!adj[i].includes(j)) { const dx = p[j].x - p[i].x, dy = p[j].y - p[i].y, d = Math.hypot(dx, dy) || 0.01, q = 0.015 / (d * d * d); f[i].x -= dx * q; f[i].y -= dy * q; f[j].x += dx * q; f[j].y += dy * q; }
      p.forEach((v, i) => { v.x += Math.max(-0.08, Math.min(0.08, f[i].x)); v.y += Math.max(-0.08, Math.min(0.08, f[i].y)); });
    }
    const atoms = g.atoms.map((e, i) => ({ e, x: p[i].x, y: p[i].y, heavyIndex: i, h: g.hydrogens[i] })), bonds = g.bonds.map(b => ({ ...b }));
    if (withHydrogens) for (let i = 0; i < n; i++) {
      const angles = adj[i].map(j => Math.atan2(p[j].y - p[i].y, p[j].x - p[i].x));
      const count = g.hydrogens[i];
      const target = Math.max(adj[i].length + count, 2);
      let available = [];
      if (adj[i].length === 1 && target === 4) {
        const a = angles[0]; available = [a + Math.PI / 2, a + Math.PI, a - Math.PI / 2];
      } else if (!adj[i].length) available = Array.from({ length: count }, (_, k) => TAU * k / count);
      for (let k = 0; k < count; k++) {
        const a = available[k] === undefined ? largestGapAngle(angles, -Math.PI / 2) : available[k]; angles.push(a);
        const j = atoms.length; atoms.push({ e: 'H', x: p[i].x + Math.cos(a) * 0.72, y: p[i].y + Math.sin(a) * 0.72, heavyIndex: -1, h: 0 }); bonds.push({ a: i, b: j, order: 1 });
      }
    }
    return { atoms, bonds };
  }
  function length(e, f, order) {
    if (e === 'H' || f === 'H') return (e === 'O' || f === 'O') ? 0.97 : (e === 'N' || f === 'N') ? 1.01 : 1.09;
    const radius = { C: 0.76, O: 0.66, N: 0.71, F: 0.57, Cl: 1.02, Br: 1.20, I: 1.39 };
    return radius[e] + radius[f] - (order - 1) * 0.15;
  }
  function layout3D(g) {
    const flat = layout2D(g, true), n = flat.atoms.length, adj = Array.from({ length: n }, () => []), orders = Array.from({ length: n }, () => Array(n).fill(0));
    flat.bonds.forEach(b => { adj[b.a].push(b.b); adj[b.b].push(b.a); orders[b.a][b.b] = orders[b.b][b.a] = b.order; });
    const points = flat.atoms.map((a, i) => ({ e: a.e, x: a.x * 1.5, y: a.y * 1.5, z: Math.sin(i * 2.39996) * 0.65 }));
    const constraints = [], direct = new Set(), anglePairs = new Set();
    flat.bonds.forEach(b => { constraints.push({ a: b.a, b: b.b, target: length(points[b.a].e, points[b.b].e, b.order), w: 2.8 }); direct.add([Math.min(b.a, b.b), Math.max(b.a, b.b)].join('-')); });
    for (let center = 0; center < n; center++) {
      const ns = adj[center], bo = ns.map(j => orders[center][j]);
      const linear = bo.some(v => v === 3) || bo.filter(v => v === 2).length >= 2;
      const cosine = linear ? -1 : bo.includes(2) || g.charges?.[center] > 0 ? -0.5 : points[center].e === 'O' ? -0.30 : -1 / 3;
      for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) {
        const i = ns[a], j = ns[b], key = [Math.min(i, j), Math.max(i, j)].join('-');
        if (direct.has(key) || anglePairs.has(key)) continue;
        anglePairs.add(key);
        const l1 = length(points[center].e, points[i].e, orders[center][i]), l2 = length(points[center].e, points[j].e, orders[center][j]);
        constraints.push({ a: i, b: j, target: Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * cosine), w: 0.42 });
      }
    }
    const velocity = points.map(() => [0, 0, 0]);
    for (let step = 0; step < 950; step++) {
      const f = points.map(() => [0, 0, 0]);
      for (const c of constraints) {
        const a = points[c.a], b = points[c.b], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 0.001;
        const q = Math.max(-2, Math.min(2, (d - c.target) * c.w)) / d;
        for (let axis = 0; axis < 3; axis++) { const v = [dx, dy, dz][axis] * q; f[c.a][axis] += v; f[c.b][axis] -= v; }
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (direct.has(i + '-' + j) || anglePairs.has(i + '-' + j)) continue;
        const a = points[i], b = points[j], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 0.001, min = a.e === 'H' && b.e === 'H' ? 1.45 : 1.85;
        if (d < min) { const q = (min - d) * 0.14 / d; [dx, dy, dz].forEach((v, k) => { f[i][k] -= v * q; f[j][k] += v * q; }); }
      }
      points.forEach((p, i) => ['x', 'y', 'z'].forEach((axis, k) => { velocity[i][k] = velocity[i][k] * 0.72 + f[i][k] * 0.035; p[axis] += Math.max(-0.12, Math.min(0.12, velocity[i][k])); }));
    }
    const center = ['x', 'y', 'z'].map(k => points.reduce((s, p) => s + p[k], 0) / n);
    points.forEach(p => ['x', 'y', 'z'].forEach((k, i) => { p[k] -= center[i]; }));
    return { atoms: points, bonds: flat.bonds };
  }
  const api = { layout2D, layout3D };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoleculeGeometry = api;
})(typeof self !== 'undefined' ? self : globalThis);
