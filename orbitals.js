/* Qualitative pi-electron illustrations only: not quantum orbitals, charge,
   or total electron density. Coordinates and radii are in angstroms.
   Render these surfaces translucently; opacity/materials belong to the renderer. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.MoleculeOrbitals = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const TAU = 2 * Math.PI, EPS = 1e-10, MAX_ATOMS = 64, SEARCH_BUDGET = 250000;
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const length = a => Math.hypot(a.x, a.y, a.z);
  const unit = a => scale(a, 1 / length(a));
  const key = (a, b) => Math.min(a, b) + ':' + Math.max(a, b);

  function graph(iso) {
    if (!iso || !Array.isArray(iso.atoms) || !Array.isArray(iso.bonds)) throw new TypeError('Expected atoms and bonds arrays.');
    const n = iso.atoms.length;
    if (n > MAX_ATOMS) throw new RangeError('Orbital illustrations support at most 64 heavy atoms.');
    const adj = Array.from({ length: n }, () => []), orders = Array.from({ length: n }, () => Array(n).fill(0));
    // A neutral graph with maximum valence four has at most 2*n edges.
    if (iso.bonds.length > 2 * n) throw new RangeError('Bond graph exceeds the neutral-valence illustration budget.');
    for (const b of iso.bonds) {
      if (!b || !Number.isInteger(b.a) || !Number.isInteger(b.b) || b.a < 0 || b.b < 0 || b.a >= n || b.b >= n || b.a === b.b || ![1, 2, 3].includes(b.order)) throw new TypeError('Invalid bond endpoints or order.');
      if (orders[b.a][b.b]) throw new TypeError('Duplicate bond.');
      orders[b.a][b.b] = orders[b.b][b.a] = b.order;
      adj[b.a].push(b.b); adj[b.b].push(b.a);
    }
    adj.forEach(ns => ns.sort((a, b) => a - b));
    return { adj, orders };
  }

  function findRings(iso, g) {
    const rings = [], visited = Array(iso.atoms.length).fill(false);
    let steps = 0;
    // Fixed depth, alternating bonds, and the least-index start keep the search
    // small for valid 64-atom molecules. Never silently return a partial search.
    function walk(path, nextOrder) {
      if (++steps > SEARCH_BUDGET) throw new RangeError('Six-membered ring search exceeded its illustration budget.');
      const start = path[0], last = path[path.length - 1];
      if (path.length === 6) {
        // The least atom is first; this orientation check removes reversals.
        if (g.orders[last][start] === nextOrder && path[1] < path[5]) rings.push(path.slice());
        return;
      }
      for (const j of g.adj[last]) {
        const order = g.orders[last][j];
        if (j <= start || visited[j] || iso.atoms[j] !== 'C' || (order !== 1 && order !== 2) || (nextOrder && order !== nextOrder)) continue;
        visited[j] = true; path.push(j);
        walk(path, 3 - order);
        path.pop(); visited[j] = false;
      }
    }
    iso.atoms.forEach((e, i) => { if (e === 'C') { visited[i] = true; walk([i], 0); visited[i] = false; } });
    return rings;
  }

  // Explicit Kekule, all-carbon, alternating six-cycles, not a general
  // aromaticity/resonance perception algorithm. Substituted/fused cycles work.
  function benzeneRings(iso) { return findRings(iso, graph(iso)); }

  function perpendicular(axis) {
    const a = [Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)];
    const i = a.indexOf(Math.min(...a));
    return unit(cross(axis, [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }][i]));
  }

  // Smallest eigenvector of the symmetric covariance matrix: the normal of
  // the least-squares ring plane. Jacobi rotations also handle tilted rings.
  function planeNormal(vectors) {
    const m = Array.from({ length: 3 }, () => [0, 0, 0]);
    vectors.forEach(v => { const a = [v.x, v.y, v.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += a[i] * a[j]; });
    const eigen = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let step = 0; step < 32; step++) {
      let p = 0, q = 1;
      for (const [i, j] of [[0, 2], [1, 2]]) if (Math.abs(m[i][j]) > Math.abs(m[p][q])) { p = i; q = j; }
      if (Math.abs(m[p][q]) < 1e-13 * Math.max(1, Math.abs(m[0][0]) + Math.abs(m[1][1]) + Math.abs(m[2][2]))) break;
      const angle = 0.5 * Math.atan2(2 * m[p][q], m[q][q] - m[p][p]), c = Math.cos(angle), s = Math.sin(angle);
      const pp = m[p][p], qq = m[q][q], pq = m[p][q];
      m[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
      m[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq;
      m[p][q] = m[q][p] = 0;
      for (let k = 0; k < 3; k++) {
        if (k !== p && k !== q) {
          const kp = m[k][p], kq = m[k][q];
          m[k][p] = m[p][k] = c * kp - s * kq;
          m[k][q] = m[q][k] = s * kp + c * kq;
        }
        const vp = eigen[k][p], vq = eigen[k][q];
        eigen[k][p] = c * vp - s * vq; eigen[k][q] = s * vp + c * vq;
      }
    }
    const i = [0, 1, 2].sort((a, b) => m[a][a] - m[b][b])[0];
    return unit({ x: eigen[0][i], y: eigen[1][i], z: eigen[2][i] });
  }

  function ringFrame(points) {
    const center = points.reduce((c, p) => add(c, scale(p, 1 / points.length)), { x: 0, y: 0, z: 0 });
    const vectors = points.map(p => sub(p, center));
    let normal = planeNormal(vectors);
    const area = vectors.reduce((a, v, i) => add(a, cross(v, vectors[(i + 1) % vectors.length])), { x: 0, y: 0, z: 0 });
    if (dot(normal, area) < 0) normal = scale(normal, -1);
    let u = null;
    for (const v of vectors) {
      const projected = sub(v, scale(normal, dot(v, normal)));
      if (length(projected) > EPS) { u = unit(projected); break; }
    }
    if (!u) u = perpendicular(normal);
    const v = unit(cross(normal, u));
    const radius = vectors.reduce((sum, p) => sum + Math.hypot(dot(p, u), dot(p, v)) / points.length, 0);
    return { center, normal, u, v, radius: Math.max(0.6, radius || 1.4) };
  }

  function torus(frame, offset) {
    const vertices = [], normals = [], faces = [], around = 64, tube = 16, minor = 0.30;
    const center = add(frame.center, scale(frame.normal, offset));
    for (let i = 0; i < around; i++) {
      const theta = TAU * i / around;
      const radial = add(scale(frame.u, Math.cos(theta)), scale(frame.v, Math.sin(theta)));
      for (let j = 0; j < tube; j++) {
        const phi = TAU * j / tube;
        const normal = unit(add(scale(radial, Math.cos(phi)), scale(frame.normal, Math.sin(phi))));
        vertices.push(add(add(center, scale(radial, frame.radius)), scale(normal, minor)));
        normals.push(normal);
        const a = i * tube + j, b = ((i + 1) % around) * tube + j;
        const c = ((i + 1) % around) * tube + (j + 1) % tube, d = i * tube + (j + 1) % tube;
        faces.push(a, b, c, a, c, d);
      }
    }
    return { vertices, normals, faces, kind: 'aromatic' };
  }

  // One closed ellipsoid is a merged lobe spanning both carbon atoms. Pole
  // vertices are shared, avoiding degenerate triangles at a UV sphere's poles.
  function ellipsoid(center, axes, radii) {
    const vertices = [], normals = [], faces = [], around = 32, bands = 16;
    function vertex(x, y, z) {
      const components = [x, y, z];
      let p = center, n = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < 3; i++) { p = add(p, scale(axes[i], components[i] * radii[i])); n = add(n, scale(axes[i], components[i] / radii[i])); }
      vertices.push(p); normals.push(unit(n));
    }
    vertex(0, 0, 1);
    for (let i = 1; i < bands; i++) for (let j = 0; j < around; j++) {
      const theta = Math.PI * i / bands, phi = TAU * j / around;
      vertex(Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta));
    }
    const south = vertices.length; vertex(0, 0, -1);
    for (let j = 0; j < around; j++) {
      const next = (j + 1) % around;
      faces.push(0, 1 + j, 1 + next);
      for (let i = 0; i < bands - 2; i++) {
        const a = 1 + i * around + j, b = a + around, c = 1 + (i + 1) * around + next, d = 1 + i * around + next;
        faces.push(a, b, c, a, c, d);
      }
      faces.push(1 + (bands - 2) * around + j, south, 1 + (bands - 2) * around + next);
    }
    return { vertices, normals, faces, kind: 'pi' };
  }

  function bondNormal(b, axis, atoms, adj) {
    let best = null, score = EPS;
    for (const i of [b.a, b.b]) for (const j of adj[i]) {
      if (j === b.a || j === b.b) continue;
      const neighbor = sub(atoms[j], atoms[i]), size = length(neighbor);
      if (size < EPS) continue;
      const candidate = cross(axis, scale(neighbor, 1 / size)), sine = length(candidate);
      if (sine > score) { best = candidate; score = sine; }
    }
    return best ? unit(best) : perpendicular(axis);
  }

  function geometryGraph(iso, geometry, g) {
    if (!geometry || !Array.isArray(geometry.atoms) || geometry.atoms.length < iso.atoms.length) throw new TypeError('Geometry must contain the heavy atoms first.');
    const atoms = geometry.atoms;
    if (atoms.some(p => !p || ![p.x, p.y, p.z].every(Number.isFinite))) throw new TypeError('Geometry coordinates must be finite.');
    // Include explicit hydrogens when available, particularly for ethene.
    const adj = atoms.map((_, i) => new Set(g.adj[i] || []));
    if (Array.isArray(geometry.bonds)) for (const b of geometry.bonds) {
      if (b && Number.isInteger(b.a) && Number.isInteger(b.b) && b.a >= 0 && b.b >= 0 && b.a < atoms.length && b.b < atoms.length && b.a !== b.b) { adj[b.a].add(b.b); adj[b.b].add(b.a); }
    }
    return { atoms, adj };
  }

  // multipleBonds counts illustrated non-aromatic C=C/C#C bonds, not lobe
  // meshes, aromatic Kekule bonds, or unsupported heteroatom multiple bonds.
  function clouds(iso, geometry) {
    const g = graph(iso), rings = findRings(iso, g), meshes = [], ringBonds = new Set();
    const { atoms, adj } = geometryGraph(iso, geometry, g);
    for (const ring of rings) {
      const frame = ringFrame(ring.map(i => atoms[i]));
      meshes.push(torus(frame, 0.65), torus(frame, -0.65));
      ring.forEach((i, k) => ringBonds.add(key(i, ring[(k + 1) % 6])));
    }
    let multipleBonds = 0;
    for (const b of iso.bonds) {
      if (iso.atoms[b.a] !== 'C' || iso.atoms[b.b] !== 'C' || b.order < 2 || ringBonds.has(key(b.a, b.b))) continue;
      const delta = sub(atoms[b.b], atoms[b.a]), distance = length(delta);
      const axis = distance > EPS ? unit(delta) : { x: 1, y: 0, z: 0 };
      const normal = bondNormal(b, axis, atoms, adj), side = unit(cross(normal, axis));
      const center = add(scale(atoms[b.a], 0.5), scale(atoms[b.b], 0.5));
      const directions = b.order === 3 ? [normal, side] : [normal];
      for (const direction of directions) for (const sign of [1, -1]) {
        const lobeCenter = add(center, scale(direction, sign * 0.65));
        const axes = [axis, unit(cross(direction, axis)), direction];
        meshes.push(ellipsoid(lobeCenter, axes, [Math.max(0.7, distance / 2 + 0.30), 0.32, 0.30]));
      }
      multipleBonds++;
    }
    const summary = meshes.length ? rings.length + ' alternating carbon six-ring(s); ' + multipleBonds + ' non-aromatic C=C/C#C bond(s) illustrated.' : 'No supported aromatic carbon rings or C=C/C#C pi bonds to illustrate.';
    return { meshes, aromaticRings: rings.length, multipleBonds, description: 'Qualitative π-electron illustrations only; not quantum orbitals, charge density, or total electron density. ' + summary };
  }

  // Symbolic Lewis-dot pairs, not density or calculated orbital positions.
  // Only the neutral N/O/halogen model is supported; charged atoms are omitted.
  function lonePairs(iso, geometry) {
    const g = graph(iso), { atoms, adj } = geometryGraph(iso, geometry, g), pairs = [];
    const counts = { N: 1, O: 2, F: 3, Cl: 3, Br: 3, I: 3 };
    iso.atoms.forEach((element, i) => {
      const authoritative=Array.isArray(iso.lonePairCounts);
      const count=authoritative?iso.lonePairCounts[i]:(Object.prototype.hasOwnProperty.call(counts,element)?counts[element]:0);
      if(!Number.isInteger(count)||count<1||count>4||(!authoritative&&iso.charges&&iso.charges[i]!==undefined&&iso.charges[i]!==0))return;
      const bonded = [...adj[i]].map(j => sub(atoms[j], atoms[i])).filter(d => length(d) > EPS).map(unit);
      let directions;
      if (!bonded.length) {
        directions = [{ x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }].slice(0, count).map(unit);
      } else if (bonded.length === 1 || count === 3) {
        const bond = bonded[0], u = perpendicular(bond), v = unit(cross(bond, u));
        directions = Array.from({ length: count }, (_, k) => {
          const angle = TAU * k / 3;
          const radial = add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle)));
          return unit(add(scale(bond, -1 / 3), scale(radial, Math.sqrt(8 / 9))));
        });
      } else {
        const sum = bonded.reduce(add, { x: 0, y: 0, z: 0 });
        let normal = perpendicular(bonded[0]), best = EPS;
        for (let a = 0; a < bonded.length; a++) for (let b = a + 1; b < bonded.length; b++) {
          const n = cross(bonded[a], bonded[b]), size = length(n);
          if (size > best) { normal = unit(n); best = size; }
        }
        const away = length(sum) > EPS ? unit(scale(sum, -1)) : perpendicular(normal);
        if (count === 1) directions = [length(sum) > EPS ? away : normal];
        else directions = [1, -1].map(sign => unit(add(scale(away, Math.sqrt(1 / 3)), scale(normal, sign * Math.sqrt(2 / 3)))));
      }
      for (const direction of directions) {
        const center = add(atoms[i], scale(direction, 0.75)), tangent = perpendicular(direction);
        pairs.push({ atom: i, dots: [add(center, scale(tangent, 0.06)), add(center, scale(tangent, -0.06))] });
      }
    });
    return pairs;
  }

  // A fresh isolated draft, never a mutation/stamp into an existing graph.
  function ringTemplate(x, y, radius = 105, aromatic = true) {
    if (![x, y, radius].every(Number.isFinite) || radius <= 0) throw new RangeError('Use finite template coordinates and a positive radius.');
    const atoms = Array.from({ length: 6 }, (_, i) => {
      const angle = TAU * i / 6 - Math.PI / 2;
      return { e: 'C', x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
    });
    const bonds = atoms.map((_, i) => ({ a: i, b: (i + 1) % 6, order: aromatic && i % 2 === 0 ? 2 : 1 }));
    return { atoms, bonds };
  }

  return { benzeneRings, clouds, lonePairs, ringTemplate };
});
