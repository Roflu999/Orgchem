'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('./chemistry.js');
const G = require('./geometry.js');
const O = require('./orbitals.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS', name); }
const near = (actual, expected, tolerance = 1e-9) => assert(Math.abs(actual - expected) < tolerance, actual + ' differs from ' + expected);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => { const n = length(a); return { x: a.x / n, y: a.y / n, z: a.z / n }; };
const mean = points => points.reduce((c, p) => ({ x: c.x + p.x / points.length, y: c.y + p.y / points.length, z: c.z + p.z / points.length }), { x: 0, y: 0, z: 0 });
function iso(smiles) {
  const raw = C.readSmiles(smiles), bonds = [];
  raw.m.forEach((row, a) => row.forEach((order, b) => { if (a < b && order) bonds.push({ a, b, order }); }));
  return { atoms: raw.atoms, bonds, hydrogens: raw.atoms.map((e, i) => C.VAL[e] - raw.m[i].reduce((a, b) => a + b, 0)) };
}
function hex(radius = 1.4) {
  return { atoms: Array.from({ length: 6 }, (_, i) => ({ e: 'C', x: radius * Math.cos(i * Math.PI / 3), y: radius * Math.sin(i * Math.PI / 3), z: 0 })), bonds: benzene.bonds };
}
function permute(g, order) {
  const inverse = []; order.forEach((old, i) => { inverse[old] = i; });
  return { atoms: order.map(i => g.atoms[i]), bonds: g.bonds.map(b => ({ a: inverse[b.b], b: inverse[b.a], order: b.order })).reverse(), hydrogens: order.map(i => g.hydrogens[i]) };
}
function validRings(g, expected) {
  const rings = O.benzeneRings(g), seen = new Set();
  assert.equal(rings.length, expected);
  for (const ring of rings) {
    assert.equal(ring.length, 6); assert.equal(new Set(ring).size, 6);
    const orders = ring.map((a, i) => {
      assert.equal(g.atoms[a], 'C');
      const b = ring[(i + 1) % 6], edge = g.bonds.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
      assert(edge, 'Ring must follow graph edges'); return edge.order;
    });
    orders.forEach((o, i) => { assert([1, 2].includes(o)); assert.notEqual(o, orders[(i + 1) % 6]); });
    const rotations = [];
    for (const sequence of [ring, ring.slice().reverse()]) for (let i = 0; i < 6; i++) rotations.push(sequence.slice(i).concat(sequence.slice(0, i)).join(','));
    const key = rotations.sort()[0]; assert(!seen.has(key)); seen.add(key);
  }
  return rings;
}
function validMesh(mesh, euler) {
  assert(['aromatic', 'pi'].includes(mesh.kind));
  assert(mesh.vertices.length > 100); assert.equal(mesh.vertices.length, mesh.normals.length);
  assert(mesh.faces.length > 0); assert.equal(mesh.faces.length % 3, 0);
  for (const p of mesh.vertices) assert([p.x, p.y, p.z].every(Number.isFinite));
  for (const n of mesh.normals) { assert([n.x, n.y, n.z].every(Number.isFinite)); near(length(n), 1, 1e-10); }
  const edges = new Map();
  for (let i = 0; i < mesh.faces.length; i += 3) {
    const indices = mesh.faces.slice(i, i + 3);
    indices.forEach(k => assert(Number.isInteger(k) && k >= 0 && k < mesh.vertices.length));
    assert.equal(new Set(indices).size, 3);
    const [a, b, c] = indices.map(k => mesh.vertices[k]);
    const normal = cross(sub(b, a), sub(c, a));
    assert(length(normal) > 1e-10, 'No degenerate triangles');
    const averageNormal = mean(indices.map(k => mesh.normals[k]));
    assert(dot(normal, averageNormal) > 0, 'Outward triangle winding must agree with normals');
    for (let j = 0; j < 3; j++) {
      const a = indices[j], b = indices[(j + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b);
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  for (const count of edges.values()) assert.equal(count, 2, 'Closed, seam-free manifold');
  assert.equal(mesh.vertices.length - edges.size + mesh.faces.length / 3, euler);
}
function rotate(p, translate = false) {
  // Proper rigid rotation with no axis left parallel to the original axes.
  const a = 0.73, b = -1.10, c = 0.48;
  const x1 = Math.cos(a) * p.x + Math.sin(a) * p.z, z1 = -Math.sin(a) * p.x + Math.cos(a) * p.z;
  const y2 = Math.cos(b) * p.y - Math.sin(b) * z1, z2 = Math.sin(b) * p.y + Math.cos(b) * z1;
  return { x: Math.cos(c) * x1 - Math.sin(c) * y2 + (translate ? 4 : 0), y: Math.sin(c) * x1 + Math.cos(c) * y2 - (translate ? 3 : 0), z: z2 + (translate ? 2 : 0) };
}
function rotated(geometry) { return { atoms: geometry.atoms.map(p => ({ e: p.e, ...rotate(p, true) })), bonds: geometry.bonds }; }
function deepFreeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; }
const benzene = iso('C1=CC=CC=C1');
const fused = {
  atoms: Array(10).fill('C'), hydrogens: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1], [1, 6, 1], [6, 7, 2], [7, 8, 1], [8, 9, 2], [9, 0, 1]].map(([a, b, order]) => ({ a, b, order }))
};

test('CommonJS, standalone browser global, worker global, and AMD expose the exact pure API', () => {
  const names = ['benzeneRings', 'clouds', 'lonePairs', 'ringTemplate'];
  assert.deepEqual(Object.keys(O).sort(), names.slice().sort());
  const source = fs.readFileSync(path.join(__dirname, 'orbitals.js'), 'utf8');
  for (const context of [{}, { self: {} }]) {
    vm.runInNewContext(source, context);
    const api = context.self ? context.self.MoleculeOrbitals : context.MoleculeOrbitals;
    assert.deepEqual(Object.keys(api).sort(), names.slice().sort());
    assert.equal(api.benzeneRings(benzene).length, 1);
    assert.equal(api.clouds(benzene, hex()).meshes.length, 2);
  }
  let amd;
  function define(deps, factory) { assert.equal(deps.length, 0); amd = factory(); }
  define.amd = {};
  vm.runInNewContext(source, { define }); assert.equal(amd.ringTemplate(0, 0).atoms.length, 6);
});

test('benzene rings are cyclic and rotation/reversal deduplicated under every relabeling', () => {
  validRings(benzene, 1);
  for (let i = 0; i < 6; i++) {
    const order = benzene.atoms.map((_, j) => (i + j) % 6);
    validRings(permute(benzene, order), 1); validRings(permute(benzene, order.reverse()), 1);
  }
});

test('substitution, biphenyl, and fused alternating six-rings are detected', () => {
  validRings(iso('CC1=CC=CC=C1'), 1);
  validRings(iso('OC1=CC=CC=C1'), 1);
  validRings(iso('C1=CC=CC=C1C2=CC=CC=C2'), 2);
  const rings = validRings(fused, 2);
  assert.equal(rings[0].filter(i => rings[1].includes(i)).length, 2);
  validRings(permute(fused, [7, 2, 0, 9, 1, 8, 5, 3, 6, 4]), 2);
});

test('saturated, partially unsaturated, nonalternating, heteroatom, and other-size rings are not aromatic', () => {
  for (const s of ['C1CCCCC1', 'C1=CCCCC1', 'C1=CCC=CC1', 'C1=C=CC=CC1', 'C1=CC=CC=N1', 'C1#CCCCC1', 'C1=CC=C1', 'C1=CC=CC=CC=C1', 'C=CC=CC=C']) validRings(iso(s), 0);
});

test('64-heavy-atom inputs are supported and graph/search work is explicitly bounded', () => {
  const long = iso('C'.repeat(64)); validRings(long, 0);
  const attached = { atoms: benzene.atoms.concat(Array(58).fill('C')), bonds: benzene.bonds.slice(), hydrogens: [] };
  for (let i = 6; i < 64; i++) attached.bonds.push({ a: i === 6 ? 0 : i - 1, b: i, order: 1 });
  validRings(attached, 1);
  assert.throws(() => O.benzeneRings({ atoms: Array(65).fill('C'), bonds: [] }), /64/);
  assert.throws(() => O.clouds({ atoms: Array(65).fill('C'), bonds: [] }, { atoms: [] }), /64/);
  const dense = { atoms: Array(64).fill('C'), bonds: [] };
  for (let a = 0; a < 16; a++) for (let b = 16; b < 24; b++) dense.bonds.push({ a, b, order: (a + b) % 2 + 1 });
  assert(Array.isArray(O.benzeneRings(dense)));
  dense.bonds.push({ a: 24, b: 25, order: 1 });
  assert.throws(() => O.benzeneRings(dense), /budget/);
});

test('benzene has exactly two smooth closed toroidal clouds, not six bond lobes', () => {
  const result = O.clouds(benzene, hex());
  assert.equal(result.aromaticRings, 1); assert.equal(result.multipleBonds, 0); assert.equal(result.meshes.length, 2);
  result.meshes.forEach((mesh, i) => {
    assert.equal(mesh.kind, 'aromatic'); assert.equal(mesh.vertices.length, 64 * 16); assert.equal(mesh.faces.length, 64 * 16 * 6);
    validMesh(mesh, 0);
    const center = mean(mesh.vertices); near(center.x, 0); near(center.y, 0); near(center.z, i === 0 ? 0.65 : -0.65);
    const radii = mesh.vertices.map(p => Math.hypot(p.x, p.y));
    near(Math.min(...radii), 1.1); near(Math.max(...radii), 1.7);
    assert(mesh.vertices.every(p => i === 0 ? p.z >= 0.35 - 1e-10 : p.z <= -0.35 + 1e-10), 'Clouds are separated from skeleton and each other');
  });
});

test('aromatic clouds follow the mean ring radius instead of a fixed screen-space size', () => {
  const mesh = O.clouds(benzene, hex(1.55)).meshes[0];
  const radial = mesh.vertices.map(p => Math.hypot(p.x, p.y));
  near((Math.min(...radial) + Math.max(...radial)) / 2, 1.55);
});

test('torus vertices and normals rigidly follow tilted and translated ring geometry', () => {
  const flat = O.clouds(benzene, hex()), tilted = O.clouds(benzene, rotated(hex()));
  const normal = rotate({ x: 0, y: 0, z: 1 });
  tilted.meshes.forEach((mesh, m) => {
    validMesh(mesh, 0);
    for (let i = 0; i < mesh.vertices.length; i += 17) {
      const expected = rotate(flat.meshes[m].vertices[i], true), expectedNormal = rotate(flat.meshes[m].normals[i]);
      near(length(sub(mesh.vertices[i], expected)), 0, 1e-8); near(length(sub(mesh.normals[i], expectedNormal)), 0, 1e-8);
    }
    const center = sub(mean(mesh.vertices), { x: 4, y: -3, z: 2 });
    near(dot(center, normal), m === 0 ? 0.65 : -0.65);
  });
});

test('slightly nonplanar rings use the least-squares best-fit plane', () => {
  const space = hex();
  space.atoms = space.atoms.map((p, i) => ({ ...p, z: 0.2 * p.x - 0.15 * p.y + 0.08 * Math.sin(2 * i * Math.PI / 3) }));
  const meshes = O.clouds(benzene, space).meshes, c = mean(space.atoms);
  const n = unit(sub(mean(meshes[0].vertices), mean(meshes[1].vertices)));
  const u = unit(cross(n, { x: 1, y: 0, z: 0 })), v = cross(n, u);
  for (const axis of [u, v]) {
    const derivative = space.atoms.reduce((sum, p) => { const d = sub(p, c); return sum + dot(d, n) * dot(d, axis); }, 0);
    near(derivative, 0, 1e-9);
  }
  meshes.forEach(mesh => validMesh(mesh, 0));
});

test('a non-aromatic C=C has one pair of closed merged ellipsoidal lobes', () => {
  const g = iso('CC=CC'), geometry = { atoms: [{ e: 'C', x: -1.3, y: 1, z: 0 }, { e: 'C', x: -0.67, y: 0, z: 0 }, { e: 'C', x: 0.67, y: 0, z: 0 }, { e: 'C', x: 1.3, y: -1, z: 0 }], bonds: g.bonds };
  const result = O.clouds(g, geometry);
  assert.equal(result.aromaticRings, 0); assert.equal(result.multipleBonds, 1); assert.equal(result.meshes.length, 2);
  result.meshes.forEach(mesh => {
    assert.equal(mesh.kind, 'pi'); validMesh(mesh, 2);
    const center = mean(mesh.vertices); near(center.x, 0); near(center.y, 0); near(Math.abs(center.z), 0.65);
    const xs = mesh.vertices.map(p => p.x); assert(Math.min(...xs) < -0.67 && Math.max(...xs) > 0.67, 'Each merged lobe spans both carbon atoms');
    assert(mesh.vertices.every(p => Math.abs(p.z) >= 0.35 - 1e-10));
  });
  const tilt = O.clouds(g, rotated(geometry)), n = rotate({ x: 0, y: 0, z: 1 });
  for (const mesh of tilt.meshes) {
    validMesh(mesh, 2);
    const center = sub(mean(mesh.vertices), { x: 4, y: -3, z: 2 });
    near(Math.abs(dot(center, n)), 0.65); near(length(cross(center, n)), 0);
  }
});

test('explicit neighboring hydrogens determine an ethene bond-plane normal', () => {
  const g = iso('C=C');
  const geometry = {
    atoms: [{ e: 'C', x: -0.67, y: 0, z: 0 }, { e: 'C', x: 0.67, y: 0, z: 0 }, { e: 'H', x: -1.2, y: 0, z: 0.9 }, { e: 'H', x: 1.2, y: 0, z: -0.9 }],
    bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }, { a: 1, b: 3, order: 1 }]
  };
  for (const mesh of O.clouds(g, geometry).meshes) {
    const c = mean(mesh.vertices); near(c.x, 0); near(Math.abs(c.y), 0.65); near(c.z, 0);
  }
  const n = rotate({ x: 0, y: 1, z: 0 });
  for (const mesh of O.clouds(g, rotated(geometry)).meshes) {
    const c = sub(mean(mesh.vertices), { x: 4, y: -3, z: 2 }); near(length(cross(c, n)), 0, 1e-9);
  }
});

test('C#C has two perpendicular pairs (four lobes), but counts as one multiple bond', () => {
  const g = iso('C#C'), space = rotated({ atoms: [{ e: 'C', x: -0.6, y: 0, z: 0 }, { e: 'C', x: 0.6, y: 0, z: 0 }], bonds: g.bonds });
  const result = O.clouds(g, space), center = mean(space.atoms), axis = unit(sub(space.atoms[1], space.atoms[0]));
  assert.equal(result.multipleBonds, 1); assert.equal(result.meshes.length, 4);
  const centers = result.meshes.map(m => sub(mean(m.vertices), center));
  centers.forEach(c => { near(length(c), 0.65); near(dot(c, axis), 0); });
  near(length({ x: centers[0].x + centers[1].x, y: centers[0].y + centers[1].y, z: centers[0].z + centers[1].z }), 0);
  near(length({ x: centers[2].x + centers[3].x, y: centers[2].y + centers[3].y, z: centers[2].z + centers[3].z }), 0);
  near(dot(centers[0], centers[2]), 0);
  result.meshes.forEach(mesh => validMesh(mesh, 2));
});

test('bond-axis fallbacks remain finite along each Cartesian axis and for coincident atoms', () => {
  for (const order of [2, 3]) for (const end of [{ x: 1.3, y: 0, z: 0 }, { x: 0, y: 1.3, z: 0 }, { x: 0, y: 0, z: 1.3 }, { x: 0, y: 0, z: 0 }]) {
    const g = { atoms: ['C', 'C'], bonds: [{ a: 0, b: 1, order }] };
    const result = O.clouds(g, { atoms: [{ e: 'C', x: 0, y: 0, z: 0 }, { e: 'C', ...end }] });
    assert.equal(result.meshes.length, order === 3 ? 4 : 2);
    result.meshes.forEach(mesh => validMesh(mesh, 2));
  }
});

test('degenerate ring plane fallbacks still produce valid finite toroidal meshes', () => {
  for (const atoms of [Array.from({ length: 6 }, (_, i) => ({ e: 'C', x: i, y: 0, z: 0 })), Array.from({ length: 6 }, () => ({ e: 'C', x: 0, y: 0, z: 0 }))]) {
    O.clouds(benzene, { atoms }).meshes.forEach(mesh => validMesh(mesh, 0));
  }
});

test('substituted/fused rings exclude only aromatic edges, preserving side-chain pi bonds', () => {
  for (const [g, rings, multiple, count] of [[fused, 2, 0, 4], [iso('C=CC1=CC=CC=C1'), 1, 1, 4], [iso('C#CC1=CC=CC=C1'), 1, 1, 6], [iso('C=CC=C'), 0, 2, 4]]) {
    const result = O.clouds(g, G.layout3D(g));
    assert.equal(result.aromaticRings, rings); assert.equal(result.multipleBonds, multiple); assert.equal(result.meshes.length, count);
    result.meshes.forEach(mesh => validMesh(mesh, mesh.kind === 'aromatic' ? 0 : 2));
  }
});

test('saturated and unsupported heteroatom multiple bonds produce no pi meshes', () => {
  for (const s of ['C', 'CC', 'C1CCCCC1', 'CCO', 'CC=O', 'CC#N']) {
    const g = iso(s), result = O.clouds(g, G.layout3D(g));
    assert.deepEqual(result.meshes, []); assert.equal(result.aromaticRings, 0); assert.equal(result.multipleBonds, 0);
    assert.match(result.description, /No supported/);
  }
  assert.deepEqual(O.clouds({ atoms: [], bonds: [] }, { atoms: [] }).meshes, []);
});

test('real chemistry descriptions and generated 3D geometries integrate without mutation', () => {
  for (const name of ['Benzene', 'Ethene', 'Ethyne', 'Propane']) {
    const g = deepFreeze(C.resolveName(name)), space = deepFreeze(G.layout3D(g));
    const before = JSON.stringify([g, space]);
    const result = O.clouds(g, space); O.benzeneRings(g);
    assert.equal(JSON.stringify([g, space]), before);
    result.meshes.forEach(mesh => validMesh(mesh, mesh.kind === 'aromatic' ? 0 : 2));
    assert.match(result.description, /Qualitative π-electron illustrations only/);
    assert.match(result.description, /not quantum orbitals, charge density, or total electron density/);
  }
  const first = O.benzeneRings(benzene); first[0][0] = -1; validRings(benzene, 1);
});

test('symbolic lone-pair counts match neutral N/O/halogens and omit carbon, hydrogen, and charged atoms', () => {
  for (const [smiles, count] of [['CN', 1], ['CO', 2], ['COC', 2], ['CF', 3], ['CCl', 3], ['CBr', 3], ['CI', 3], ['NCCO', 3], ['CC', 0]]) {
    const g = deepFreeze(iso(smiles)), space = deepFreeze(G.layout3D(g)), before = JSON.stringify([g, space]);
    const pairs = O.lonePairs(g, space); assert.equal(pairs.length, count);
    assert.equal(JSON.stringify([g, space]), before);
    for (const pair of pairs) {
      assert(Number.isInteger(pair.atom) && pair.atom >= 0 && pair.atom < g.atoms.length);
      assert(['N', 'O', 'F', 'Cl', 'Br', 'I'].includes(g.atoms[pair.atom]));
      assert.equal(pair.dots.length, 2); near(length(sub(pair.dots[0], pair.dots[1])), 0.12);
      for (const dot of pair.dots) {
        assert([dot.x, dot.y, dot.z].every(Number.isFinite));
        const distance = length(sub(dot, space.atoms[pair.atom])); assert(distance >= 0.65 && distance <= 0.85);
      }
    }
  }
  const charged = { atoms: ['C', 'N', 'O'], bonds: [], charges: [1, 1, -1] };
  const space = { atoms: charged.atoms.map((e, x) => ({ e, x, y: 0, z: 0 })) };
  assert.deepEqual(O.lonePairs(charged, space), []);
  assert.deepEqual(O.lonePairs({ atoms: ['H', 'C'], bonds: [], charges: [0, 1] }, { atoms: space.atoms.slice(0, 2) }), []);
});

test('lone-pair directions are tetrahedral and point away from occupied bond directions', () => {
  const halogen = { atoms: ['C', 'Cl'], bonds: [{ a: 0, b: 1, order: 1 }] };
  const space = { atoms: [{ e: 'C', x: 0, y: 0, z: 0 }, { e: 'Cl', x: 1.7, y: 0, z: 0 }], bonds: halogen.bonds };
  for (const geometry of [space, rotated(space)]) {
    const bond = unit(sub(geometry.atoms[0], geometry.atoms[1]));
    const directions = O.lonePairs(halogen, geometry).map(pair => unit(sub(mean(pair.dots), geometry.atoms[1])));
    for (const d of directions) near(dot(d, bond), -1 / 3);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) near(dot(directions[i], directions[j]), -1 / 3);
  }
  const oxygen = { atoms: ['O', 'C', 'C'], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }] };
  const oxygenSpace = { atoms: [{ e: 'O', x: 0, y: 0, z: 0 }, { e: 'C', x: Math.sqrt(1 / 3), y: Math.sqrt(2 / 3), z: 0 }, { e: 'C', x: Math.sqrt(1 / 3), y: -Math.sqrt(2 / 3), z: 0 }] };
  const directions = O.lonePairs(oxygen, oxygenSpace).map(pair => unit(mean(pair.dots)));
  near(dot(directions[0], directions[1]), -1 / 3);
  for (const d of directions) { assert(d.x < 0); for (const b of oxygenSpace.atoms.slice(1)) near(dot(d, b), -1 / 3); }
  const nitrogen = { atoms: ['N', 'C', 'C', 'C'], bonds: [1, 2, 3].map(b => ({ a: 0, b, order: 1 })) };
  const nitrogenSpace = { atoms: [{ e: 'N', x: 0, y: 0, z: 0 }, ...[0, 1, 2].map(i => ({ e: 'C', x: Math.sqrt(8 / 9) * Math.cos(2 * Math.PI * i / 3), y: Math.sqrt(8 / 9) * Math.sin(2 * Math.PI * i / 3), z: -1 / 3 }))] };
  const n = unit(mean(O.lonePairs(nitrogen, nitrogenSpace)[0].dots)); near(n.z, 1); near(n.x, 0); near(n.y, 0);
});

test('lone-pair fallbacks work with missing, coincident, and collinear neighbors', () => {
  for (const element of ['N', 'O', 'F']) for (const neighbors of [[], [{ x: 0, y: 0, z: 0 }], [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }]]) {
    const g = { atoms: [element, ...neighbors.map(() => 'C')], bonds: neighbors.map((_, i) => ({ a: 0, b: i + 1, order: 1 })) };
    const space = { atoms: [{ e: element, x: 0, y: 0, z: 0 }, ...neighbors.map(p => ({ e: 'C', ...p }))] };
    const pairs = O.lonePairs(g, space); assert.equal(pairs.length, { N: 1, O: 2, F: 3 }[element]);
    for (const pair of pairs) for (const p of pair.dots) { assert([p.x, p.y, p.z].every(Number.isFinite)); assert(length(p) >= 0.65 && length(p) <= 0.85); }
  }
  assert.throws(() => O.lonePairs(iso('CO'), { atoms: [] }), TypeError);
  assert.deepEqual(O.lonePairs({ atoms: [], bonds: [] }, { atoms: [] }), []);
});

test('invalid graph and non-finite/incomplete geometry inputs fail explicitly', () => {
  for (const g of [null, {}, { atoms: ['C'], bonds: [{ a: 0, b: 1, order: 2 }] }, { atoms: ['C'], bonds: [{ a: 0, b: 0, order: 1 }] }, { atoms: ['C', 'C'], bonds: [{ a: 0, b: 1, order: 1.5 }] }, { atoms: ['C', 'C'], bonds: [{ a: 0, b: 1, order: 2 }, { a: 1, b: 0, order: 2 }] }]) assert.throws(() => O.benzeneRings(g), TypeError);
  for (const space of [null, {}, { atoms: [] }, { atoms: hex().atoms.map((p, i) => ({ ...p, z: i === 2 ? NaN : 0 })) }, { atoms: hex().atoms.map(p => ({ ...p, x: Infinity })) }, { atoms: Array(6).fill({ x: 0, y: 0 }) }]) assert.throws(() => O.clouds(benzene, space), TypeError);
});

test('ringTemplate creates fresh isolated regular benzene/cyclohexane drafts with 120-degree angles and valid valence', () => {
  for (const aromatic of [true, false]) {
    const draft = O.ringTemplate(230, -70, 105, aromatic);
    assert.equal(draft.atoms.length, 6); assert.equal(draft.bonds.length, 6);
    const valence = Array(6).fill(0);
    draft.bonds.forEach(b => { valence[b.a] += b.order; valence[b.b] += b.order; assert.equal((b.a + 1) % 6, b.b); });
    draft.atoms.forEach((a, i) => {
      assert.equal(a.e, 'C'); assert.deepEqual(Object.keys(a).sort(), ['e', 'x', 'y']);
      near(Math.hypot(a.x - 230, a.y + 70), 105);
      const before = draft.atoms[(i + 5) % 6], after = draft.atoms[(i + 1) % 6];
      const u = { x: before.x - a.x, y: before.y - a.y, z: 0 }, v = { x: after.x - a.x, y: after.y - a.y, z: 0 };
      near(length(v), 105); near(dot(u, v) / (length(u) * length(v)), -0.5);
      assert.equal(valence[i], aromatic ? 3 : 2); assert.equal(4 - valence[i], aromatic ? 1 : 2);
    });
    const g = { atoms: draft.atoms.map(a => a.e), bonds: draft.bonds };
    validRings(g, aromatic ? 1 : 0);
    const raw = { atoms: g.atoms, m: Array.from({ length: 6 }, () => Array(6).fill(0)) };
    g.bonds.forEach(b => { raw.m[b.a][b.b] = raw.m[b.b][b.a] = b.order; });
    assert.equal(C.formulaOf(C.normalizeGraph(raw)), aromatic ? 'C6H6' : 'C6H12');
  }
  const a = O.ringTemplate(0, 0), b = O.ringTemplate(0, 0);
  near(Math.hypot(a.atoms[0].x, a.atoms[0].y), 105); assert.equal(a.bonds.filter(e => e.order === 2).length, 3);
  a.atoms[0].e = 'O'; a.bonds[0].order = 3; assert.equal(b.atoms[0].e, 'C'); assert.equal(b.bonds[0].order, 2);
  for (const args of [[0, 0, 0], [0, 0, -1], [NaN, 0], [0, Infinity], [0, 0, Infinity]]) assert.throws(() => O.ringTemplate(...args), RangeError);
});

console.log('\n' + checks + ' orbital test groups passed. Mesh geometry is tested; browser/WebGL rendering is not covered.');
