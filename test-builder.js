'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Chem = require('./chemistry.js');
const Geometry = require('./geometry.js');
const S = require('./sketcher-model.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS', name); }
function near(a, b, tolerance = 1e-8) { assert(Math.abs(a - b) <= tolerance, a + ' != ' + b); }
function freeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(freeze); Object.freeze(o);
  }
  return o;
}
function draft(elements, bonds = []) {
  return { atoms: elements.map((e, i) => ({ e, x: 120 + i * 60, y: 260 })), bonds: bonds.map(b => ({ a: b[0], b: b[1], order: b[2] })) };
}
function build(elements, bonds = []) {
  let d = S.empty();
  elements.forEach((e, i) => { d = S.addAtom(d, e, 150 + i * 100, 200); });
  bonds.forEach(([a, b, order]) => { d = S.setBond(d, a, b, order); });
  return d;
}
function valid(d) {
  const result = S.analyze(d);
  assert.equal(result.valid, true, result.message);
  assert.equal(typeof result.message, 'string');
  assert(result.structure);
  assert.equal(result.hydrogens.length, d.atoms.length);
  return result;
}
function invalid(d, message) {
  const result = S.analyze(d);
  assert.equal(result.valid, false);
  assert.equal(result.structure, null);
  assert.equal(typeof result.message, 'string');
  assert(result.message.length);
  assert(Array.isArray(result.hydrogens));
  if (message) assert.match(result.message, message);
  return result;
}
function bounds(d) {
  d.atoms.forEach(a => {
    assert(Number.isFinite(a.x) && Number.isFinite(a.y));
    assert(a.x >= 100 - 1e-8 && a.x <= 900 + 1e-8, 'x outside sketch bounds');
    assert(a.y >= 80 - 1e-8 && a.y <= 440 + 1e-8, 'y outside sketch bounds');
  });
}
const ethanol = () => build(['C', 'C', 'O'], [[0, 1, 1], [1, 2, 1]]);

test('CommonJS exports and fresh empty drafts', () => {
  assert.deepEqual(Object.keys(S).sort(), ['empty', 'addAtom', 'moveAtom', 'elasticDrag', 'setElement', 'setCharge', 'setBond', 'removeAtom', 'removeAtoms', 'removeBond', 'fromStructure', 'analyze', 'validate', 'checked', 'toAdvanced', 'chemicalSignature', 'VAL', 'PERIODIC'].sort());
  assert.equal(globalThis.MoleculeSketcher, S);
  const a = S.empty(), b = S.empty();
  assert.deepEqual(a, { atoms: [], bonds: [] });
  assert.notEqual(a, b); assert.notEqual(a.atoms, b.atoms); assert.notEqual(a.bonds, b.bonds);
  assert.deepEqual(S.VAL, { C: 4, H: 1, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1 });
  assert(Object.isFrozen(S.VAL));
});

test('build C-C-O: mapped Ethanol, C2H6O, mass and implicit hydrogens', () => {
  const d = ethanol(), result = valid(freeze(d));
  assert.equal(result.structure.name, 'Ethanol');
  assert.equal(result.structure.knownName, true);
  assert.equal(result.structure.formula, 'C2H6O');
  assert.equal(result.structure.metadata.formula, 'C2H6O');
  near(result.structure.metadata.mass, 46.069);
  assert.deepEqual(result.hydrogens, [3, 2, 1]);
  assert.equal(result.structure.id, Chem.resolveName('Ethanol').id);
});

test('bond replacement, reversal, double/triple orders and no duplicate edge', () => {
  const original = freeze(build(['C', 'C'], [[0, 1, 1]]));
  const double = S.setBond(original, 1, 0, 2), triple = S.setBond(double, 0, 1, 3);
  assert.equal(original.bonds[0].order, 1);
  for (const [d, name, formula, h] of [[double, 'Ethene', 'C2H4', [2, 2]], [triple, 'Ethyne', 'C2H2', [1, 1]]]) {
    const r = valid(d);
    assert.equal(d.bonds.length, 1); assert.equal(r.structure.name, name);
    assert.equal(r.structure.formula, formula); assert.deepEqual(r.hydrogens, h);
  }
  const single = S.setBond(triple, 1, 0, 1);
  assert.equal(valid(single).structure.name, 'Ethane');
  assert.equal(single.bonds.length, 1);
  assert.equal(valid(S.setBond(ethanol(), 1, 2, 2)).structure.name, 'Ethanal');
});

test('explicit H remains explicit and implicit counts stay in draft atom order', () => {
  const d = freeze(build(['H', 'O', 'C'], [[0, 1, 1], [1, 2, 1]])), snapshot = JSON.stringify(d);
  const result = valid(d);
  assert.equal(result.structure.name, 'Methanol');
  assert.equal(result.structure.formula, 'CH4O');
  assert.deepEqual(result.hydrogens, [0, 0, 3]);
  assert.equal(d.atoms[0].e, 'H');
  assert.equal(d.atoms.length, 3);
  assert.equal(JSON.stringify(d), snapshot);
  const moved = S.moveAtom(d, 0, 750, 410);
  assert.equal(moved.atoms[0].e, 'H'); assert.deepEqual(moved.bonds, d.bonds);
  assert.deepEqual(valid(moved), result);
  const withoutH = S.removeAtom(d, 0), implicit = valid(withoutH);
  assert.deepEqual(implicit.hydrogens, [1, 3]);
  assert.equal(implicit.structure.id, result.structure.id);
  const broken = S.removeBond(d, 0, 1);
  invalid(broken, /attach.*hydrogen/i);
  assert.deepEqual(broken.atoms, d.atoms);
  assert.equal(valid(S.setBond(broken, 0, 1, 1)).structure.id, result.structure.id);
});

test('fully explicit methane has zero implicit H and cannot gain a fifth H bond', () => {
  const methane = freeze(build(['C', 'H', 'H', 'H', 'H'], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]]));
  const result = valid(methane);
  assert.equal(result.structure.formula, 'CH4');
  assert.deepEqual(result.hydrogens, [0, 0, 0, 0, 0]);
  const pending = freeze(S.addAtom(methane, 'H', 50, 50)), snapshot = JSON.stringify(pending);
  assert.throws(() => S.setBond(pending, 0, 5, 1), /valence/i);
  assert.equal(JSON.stringify(pending), snapshot);
  assert.throws(() => S.setBond(methane, 0, 1, 2), /valence/i);
});

test('neutral valence limits cover every supported element including explicit H', () => {
  for (const [e, valence] of Object.entries(S.VAL)) {
    const elements = [e, ...Array(valence + 1).fill('H')];
    let d = build(elements);
    for (let i = 1; i <= valence; i++) d = S.setBond(d, 0, i, 1);
    const snapshot = JSON.stringify(d); freeze(d);
    assert.throws(() => S.setBond(d, 0, valence + 1, 1), /valence/i, e);
    assert.equal(JSON.stringify(d), snapshot);
  }
  for (const e of ['N', 'O', 'F', 'Cl', 'Br', 'I']) {
    const result = valid(build(['C', e], [[0, 1, 1]]));
    assert.deepEqual(result.hydrogens, [3, S.VAL[e] - 1]);
  }
});

test('element replacement recomputes chemistry and rejects undercapacity elements', () => {
  const methanol = freeze(build(['C', 'O'], [[0, 1, 1]]));
  const amine = S.setElement(methanol, 1, 'N'), r = valid(amine);
  assert.equal(r.structure.name, 'Methanamine'); assert.equal(r.structure.formula, 'CH5N');
  assert.deepEqual(r.hydrogens, [3, 2]);
  assert.deepEqual(amine.bonds, methanol.bonds);
  assert.deepEqual(amine.atoms.map(a => [a.x, a.y]), methanol.atoms.map(a => [a.x, a.y]));
  assert.equal(valid(methanol).structure.name, 'Methanol');
  const alkene = freeze(build(['C', 'C'], [[0, 1, 2]])), before = JSON.stringify(alkene);
  assert.throws(() => S.setElement(alkene, 1, 'F'), /valence/i);
  assert.throws(() => S.setElement(alkene, 1, 'H'), /valence/i);
  assert.equal(JSON.stringify(alkene), before);
  invalid(S.setElement(build(['C']), 0, 'O'), /carbon/i);
});

test('atom deletion removes incident bonds and reindexes surviving endpoints', () => {
  const original = freeze(draft(['H', 'C', 'C', 'O', 'H'], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]));
  const first = S.removeAtom(original, 0);
  assert.deepEqual(first.atoms.map(a => a.e), ['C', 'C', 'O', 'H']);
  assert.deepEqual(first.bonds, [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 1 }]);
  assert.equal(valid(first).structure.name, 'Ethanol');
  const middle = S.removeAtom(original, 2);
  assert.deepEqual(middle.bonds, [{ a: 0, b: 1, order: 1 }, { a: 2, b: 3, order: 1 }]);
  invalid(middle, /connect.*one molecule/i);
  const last = S.removeAtom(original, 4);
  assert.equal(valid(last).structure.name, 'Ethanol');
  assert.deepEqual(valid(last).hydrogens, [0, 2, 2, 1]);
  assert.deepEqual(S.removeAtom(build(['C']), 0), S.empty());
});

test('batch deletion uses original indices, drops only incident bonds, and rejects invalid batches atomically', () => {
  const original = freeze(draft(['H','C','O','H','C','N'], [[0,1,1],[2,1,1],[2,3,1],[4,1,2],[4,5,1]]));
  const remaining = S.removeAtoms(original, [3,0,5,3]);
  assert.deepEqual(remaining.atoms, [original.atoms[1], original.atoms[2], original.atoms[4]]);
  assert.deepEqual(remaining.bonds, [{a:1,b:0,order:1}, {a:2,b:0,order:2}]);
  assert.deepEqual(S.removeAtoms(original, [4]), S.removeAtom(original, 4));
  assert.deepEqual(S.removeAtoms(original, []), original);
  assert.deepEqual(S.removeAtoms(original, [4,2,0,1,3,5]), S.empty());
  for (const bad of [[1,6], ['2'], [0,-1], [0,.5], null, Array(1)]) assert.throws(() => S.removeAtoms(original, bad));
  assert.equal(original.atoms.length, 6); assert.equal(original.bonds.length, 5);
});

test('bond deletion is undirected, preserves atoms, and absent edges are harmless', () => {
  const original = freeze(ethanol()), removed = S.removeBond(original, 2, 1);
  assert.deepEqual(removed.atoms, original.atoms);
  assert.deepEqual(removed.bonds, [{ a: 0, b: 1, order: 1 }]);
  invalid(removed, /connect/i);
  assert.deepEqual(S.removeBond(original, 0, 2), original);
  assert.equal(original.bonds.length, 2);
});

test('empty, disconnected, no-carbon and incomplete H drafts have editing guidance and no identity', () => {
  assert.deepEqual(invalid(S.empty(), /add a carbon/i).hydrogens, []);
  const separate = build(['C', 'C']);
  assert.deepEqual(invalid(separate, /connect.*one molecule/i).hydrogens, [4, 4]);
  assert.equal(valid(S.setBond(separate, 0, 1, 1)).structure.name, 'Ethane');
  invalid(build(['O']), /carbon/i);
  invalid(build(['O', 'N'], [[0, 1, 1]]), /carbon/i);
  assert.deepEqual(invalid(build(['H']), /attach.*hydrogen/i).hydrogens, [0]);
  assert.deepEqual(invalid(build(['C', 'H']), /attach.*hydrogen/i).hydrogens, [4, 0]);
  invalid(build(['C', 'H', 'H'], [[1, 2, 1]]), /connect/i);
});

test('unmapped structures never invent a name or accept imported identity metadata', () => {
  const iso = Chem.describe(Chem.readSmiles('CCCCCCO'), 'Invented IUPAC name');
  assert.equal(iso.knownName, false);
  iso.knownName = true;
  const d = S.fromStructure(iso, Geometry.layout2D(iso, false)), result = valid(d);
  assert.equal(result.structure.name, 'Unmapped structure');
  assert.equal(result.structure.knownName, false);
  assert.equal(result.structure.formula, 'C6H14O');
  assert.equal(result.structure.notation, Chem.describe(Chem.readSmiles('CCCCCCO')).notation);
  const mapped = Chem.resolveName('Ethanol'); mapped.name = 'Fake identity'; mapped.knownName = false;
  assert.equal(valid(S.fromStructure(mapped, Geometry.layout2D(mapped, false))).structure.name, 'Ethanol');
});

test('fromStructure round trips rings, fused/bridged rings, double and triple bonds', () => {
  for (const smiles of ['C', 'CCO', 'C1CC1', 'C1CCCCC1', 'C1=CC=CC=C1', 'C1CC2CCC1C2', 'CCC#C', 'CC#N', 'C=C=C']) {
    const iso = freeze(Chem.describe(Chem.readSmiles(smiles))), layout = freeze(Geometry.layout2D(iso, false));
    const isoBefore = JSON.stringify(iso), layoutBefore = JSON.stringify(layout), d = S.fromStructure(iso, layout), r = valid(d);
    assert.equal(r.structure.id, iso.id, smiles); assert.equal(r.structure.formula, iso.formula, smiles);
    assert.deepEqual(d.bonds, iso.bonds);
    assert.deepEqual(d.atoms.map(a => a.e), iso.atoms);
    assert.deepEqual(r.hydrogens, iso.hydrogens);
    assert.equal(JSON.stringify(iso), isoBefore); assert.equal(JSON.stringify(layout), layoutBefore);
    bounds(d);
  }
});

test('fromStructure retains explicit H when present in the source graph and layout', () => {
  const iso = { atoms: ['H', 'O', 'C'], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }], hydrogens: [0, 0, 3] };
  const d = S.fromStructure(freeze(iso), freeze(Geometry.layout2D(iso, false)));
  assert.deepEqual(d.atoms.map(a => a.e), ['H', 'O', 'C']);
  assert.equal(valid(d).structure.name, 'Methanol');
  assert.deepEqual(valid(d).hydrogens, [0, 0, 3]); bounds(d);
});

test('normalization retains aspect, orientation and centers within the 1000x520 viewBox', () => {
  const iso = Chem.resolveName('But-1-yne'), layout = Geometry.layout2D(iso, false);
  layout.atoms.forEach(a => { a.x = a.x * 3 + 100; a.y = a.y * 3 - 90; });
  const d = S.fromStructure(iso, layout), source = layout.atoms, target = d.atoms;
  bounds(d);
  const dx = source[1].x - source[0].x, dy = source[1].y - source[0].y;
  const scale = Math.hypot(target[1].x - target[0].x, target[1].y - target[0].y) / Math.hypot(dx, dy);
  assert(scale > 0);
  for (let i = 1; i < target.length; i++) {
    near(target[i].x - target[0].x, (source[i].x - source[0].x) * scale);
    near(target[i].y - target[0].y, (source[i].y - source[0].y) * scale);
  }
  const xs = target.map(a => a.x), ys = target.map(a => a.y);
  near((Math.min(...xs) + Math.max(...xs)) / 2, 500);
  near((Math.min(...ys) + Math.max(...ys)) / 2, 260);
  assert(Math.abs(Math.max(...xs) - Math.min(...xs) - 800) < 1e-8 || Math.abs(Math.max(...ys) - Math.min(...ys) - 360) < 1e-8);
});

test('normalization handles horizontal, vertical, coincident, single and extreme finite coordinates', () => {
  const iso = Chem.resolveName('Ethane');
  for (const points of [[[0, 0], [10, 0]], [[0, 0], [0, 10]], [[5, -6], [5, -6]], [[Number.MIN_VALUE, Number.MIN_VALUE], [Number.MIN_VALUE, Number.MIN_VALUE]], [[0, 0], [Number.MIN_VALUE, Number.MIN_VALUE]], [[-Number.MAX_VALUE, 0], [Number.MAX_VALUE, 0]], [[0, -Number.MAX_VALUE], [0, Number.MAX_VALUE]]]) {
    const layout = { atoms: points.map(([x, y]) => ({ e: 'C', x, y })), bonds: iso.bonds };
    const d = S.fromStructure(iso, layout); bounds(d);
    assert.equal(valid(d).structure.id, iso.id);
    if (points[0][0] === points[1][0] && points[0][1] === points[1][1]) d.atoms.forEach(a => assert.deepEqual([a.x, a.y], [500, 260]));
  }
  const methane = Chem.resolveName('Methane'), one = S.fromStructure(methane, Geometry.layout2D(methane, false));
  assert.deepEqual(one.atoms, [{ e: 'C', x: 500, y: 260 }]);
  assert.deepEqual(S.fromStructure({ atoms: [], bonds: [] }, S.empty()), S.empty());
});

test('moving atoms changes geometry only, even for overlaps and outside the viewBox', () => {
  const original = freeze(ethanol()), before = valid(original), snapshot = JSON.stringify(original);
  let moved = S.moveAtom(original, 0, original.atoms[1].x, original.atoms[1].y);
  moved = S.moveAtom(moved, 1, -500, 9000);
  moved = S.moveAtom(moved, 2, Number.MAX_VALUE, -Number.MAX_VALUE);
  assert.deepEqual(valid(moved), before);
  assert.deepEqual(moved.bonds, original.bonds);
  assert.deepEqual(moved.atoms.map(a => a.e), original.atoms.map(a => a.e));
  assert.equal(JSON.stringify(original), snapshot);
});

test('all operations deeply isolate results from their inputs, including no-op edits', () => {
  const original = freeze(ethanol()), snapshot = JSON.stringify(original);
  const variants = [S.addAtom(original, 'H', 0, 0), S.moveAtom(original, 0, 150, 200), S.setElement(original, 0, 'C'), S.setBond(original, 0, 1, 1), S.removeAtom(original, 1), S.removeBond(original, 0, 2)];
  for (const next of variants) {
    assert.notEqual(next, original); assert.notEqual(next.atoms, original.atoms); assert.notEqual(next.bonds, original.bonds);
    next.atoms.forEach(a => { assert(!original.atoms.includes(a)); });
    next.bonds.forEach(b => { assert(!original.bonds.includes(b)); });
    next.atoms[0].x = 999;
    if (next.bonds.length) next.bonds[0].order = 3;
  }
  const result = valid(original); result.hydrogens[0] = 90; result.structure.atoms[0] = 'I';
  assert.equal(valid(original).structure.name, 'Ethanol');
  assert.equal(JSON.stringify(original), snapshot);
});

test('64-heavy and 256-total limits accept the boundary and reject additions/replacements', () => {
  const chain = draft(Array(64).fill('C'), Array.from({ length: 63 }, (_, i) => [i, i + 1, 1]));
  assert.equal(valid(freeze(chain)).structure.formula, 'C64H130');
  assert.throws(() => S.addAtom(chain, 'C', 0, 0), /64/);
  const total = freeze(draft([...Array(64).fill('C'), ...Array(192).fill('H')])), snapshot = JSON.stringify(total);
  const moved = S.moveAtom(total, 255, 10, 20); assert.equal(moved.atoms.length, 256);
  assert.throws(() => S.addAtom(total, 'H', 0, 0), /256/);
  assert.throws(() => S.setElement(total, 255, 'O'), /64/);
  assert.equal(JSON.stringify(total), snapshot);
  const boundary = S.addAtom(draft([...Array(64).fill('C'), ...Array(191).fill('H')]), 'H', 0, 0);
  assert.equal(boundary.atoms.length, 256);
  invalid(draft(Array(65).fill('C')), /64/);
  invalid(draft(Array(257).fill('H')), /256/);
});

test('invalid operation arguments throw without mutating a frozen draft', () => {
  const d = freeze(ethanol()), snapshot = JSON.stringify(d);
  for (const i of [-1, 3, 1.1, NaN, Infinity, '0', null, undefined, {}, Symbol('index')]) {
    assert.throws(() => S.moveAtom(d, i, 0, 0), /index/i);
    assert.throws(() => S.setElement(d, i, 'C'), /index/i);
    assert.throws(() => S.removeAtom(d, i), /index/i);
    assert.throws(() => S.setBond(d, i, 0, 1), /index/i);
    assert.throws(() => S.removeBond(d, 0, i), /index/i);
  }
  for (const order of [0, -1, 4, 1.5, NaN, Infinity, '1', null, undefined, {}, Symbol('order')]) assert.throws(() => S.setBond(d, 0, 1, order), /order/i);
  assert.throws(() => S.setBond(d, 1, 1, 1), /self/i);
  assert.throws(() => S.removeBond(d, 1, 1), /self/i);
  for (const e of ['S', 'c', 'CL', '', 'toString', 'constructor', '__proto__', 'hasOwnProperty', null, undefined, 6, {}, new String('C')]) {
    assert.throws(() => S.addAtom(d, e, 0, 0), /element/i);
    assert.throws(() => S.setElement(d, 0, e), /element/i);
  }
  for (const coord of [NaN, Infinity, -Infinity, '1', null, undefined, {}, Symbol('coordinate')]) {
    assert.throws(() => S.addAtom(d, 'C', coord, 0), /finite/i);
    assert.throws(() => S.addAtom(d, 'C', 0, coord), /finite/i);
    assert.throws(() => S.moveAtom(d, 0, coord, 0), /finite/i);
    assert.throws(() => S.moveAtom(d, 0, 0, coord), /finite/i);
  }
  assert.equal(JSON.stringify(d), snapshot);
});

test('malformed drafts, records, duplicate edges and sparse arrays are rejected', () => {
  const malformed = [null, undefined, false, '', [], {}, { atoms: [] }, { atoms: [], bonds: {} }, { atoms: {}, bonds: [] },
    { atoms: [null], bonds: [] }, { atoms: ['C'], bonds: [] }, { atoms: [{ e: 'C', x: 0 }], bonds: [] },
    { atoms: [{ e: 'toString', x: 0, y: 0 }], bonds: [] }, { atoms: [{ e: 'C', x: Infinity, y: 0 }], bonds: [] },
    { atoms: new Array(1), bonds: [] }, { atoms: draft(['C']).atoms, bonds: new Array(1) },
    draft(['C', 'C'], [[0, 0, 1]]), draft(['C', 'C'], [[0, 2, 1]]), draft(['C', 'C'], [[0, 1, 0]]),
    draft(['C', 'C'], [[0, 1, 1], [1, 0, 1]]), draft(['C', 'O'], [[0, 1, 3]]),
    { atoms: draft(['C', 'C']).atoms, bonds: [null] }, { atoms: draft(['C', 'C']).atoms, bonds: [{ a: 0, b: 1 }] }];
  for (const d of malformed) {
    assert.throws(() => S.addAtom(d, 'C', 0, 0));
    invalid(d);
  }
});

test('required properties must be own data, with null-prototype records supported', () => {
  const inheritedDraft = Object.create({ atoms: [], bonds: [] });
  const inheritedAtom = { atoms: [Object.create({ e: 'C', x: 0, y: 0 })], bonds: [] };
  const inheritedBond = { atoms: draft(['C', 'C']).atoms, bonds: [Object.create({ a: 0, b: 1, order: 1 })] };
  const inheritedEntry = new Array(1); Object.setPrototypeOf(inheritedEntry, { 0: { e: 'C', x: 0, y: 0 } });
  let getters = 0;
  const accessorAtom = { e: 'C', x: 0, get y() { getters++; throw Error('should not execute'); } };
  const accessorDraft = { bonds: [], get atoms() { getters++; throw Error('should not execute'); } };
  const accessorEntries = new Array(1); Object.defineProperty(accessorEntries, 0, { get() { getters++; return { e: 'C', x: 0, y: 0 }; } });
  for (const d of [inheritedDraft, inheritedAtom, inheritedBond, { atoms: inheritedEntry, bonds: [] }, { atoms: [accessorAtom], bonds: [] }, accessorDraft, { atoms: accessorEntries, bonds: [] }]) {
    assert.throws(() => S.addAtom(d, 'C', 0, 0), /own/i);
    invalid(d, /own/i);
  }
  assert.equal(getters, 0);
  const nullRecord = Object.assign(Object.create(null), { atoms: [Object.assign(Object.create(null), { e: 'C', x: 0, y: 0 })], bonds: [] });
  assert.equal(valid(nullRecord).structure.name, 'Methane');
  assert.equal(valid(S.moveAtom(nullRecord, 0, 5, 10)).structure.name, 'Methane');
});

test('fromStructure rejects malformed, mismatched, nonfinite and H-expanded layouts', () => {
  const iso = freeze(Chem.resolveName('Ethanol')), layout = freeze(Geometry.layout2D(iso, false));
  for (const bad of [null, {}, { atoms: iso.atoms }, { atoms: ['C'], bonds: [] }, Object.create(iso)]) assert.throws(() => S.fromStructure(bad, layout));
  for (const bad of [null, {}, { atoms: [], bonds: [] }, Object.create(layout), Geometry.layout2D(iso, true),
    { atoms: layout.atoms, bonds: [] },
    { atoms: layout.atoms.map((a, i) => ({ ...a, e: i === 0 ? 'I' : a.e })), bonds: layout.bonds },
    { atoms: layout.atoms.map((a, i) => ({ ...a, x: i === 0 ? NaN : a.x })), bonds: layout.bonds }]) assert.throws(() => S.fromStructure(iso, bad));
});

test('browser global runs without CommonJS or external dependencies', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'chemistry.js'), 'utf8'), context, { filename: 'chemistry.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'sketcher-model.js'), 'utf8'), context, { filename: 'sketcher-model.js' });
  const browser = context.MoleculeSketcher;
  assert(browser); assert.equal(context.module, undefined); assert.equal(context.require, undefined);
  let d = browser.empty();
  for (const e of ['C', 'C', 'O']) d = browser.addAtom(d, e, d.atoms.length * 100, 0);
  d = browser.setBond(browser.setBond(d, 0, 1, 1), 1, 2, 1);
  const result = browser.analyze(d);
  assert.equal(result.valid, true); assert.equal(result.structure.name, 'Ethanol');
  assert.equal(result.structure.formula, 'C2H6O'); near(result.structure.metadata.mass, 46.069);
});

console.log('\n' + checks + ' builder test groups passed.');
console.log('Exported API: ' + Object.keys(S).join(', '));
