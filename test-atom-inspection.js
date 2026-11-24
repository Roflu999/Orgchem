'use strict';
const assert = require('node:assert/strict');
const {controller} = require('./atom-inspection');
const record = {atoms: ['C','H','O'], atomIds: ['carbon','explicit-H','oxygen'], isotopes: [0,2,0]};
const coords = {atoms: [
  {e:'O', atomId:'oxygen', x:1, y:3, z:0},
  {e:'H', atomId:'generated-H', heavyIndex:0, x:1, y:0, z:4},
  {e:'C', atomId:'carbon', x:1, y:0, z:0},
  {e:'H', atomId:'explicit-H', x:1, y:0, z:-1}
]};
let detail;
const c = controller(d => {detail = d;});
c.reset(record, coords, true);
assert.deepEqual(detail.atomIndices, []);
assert.equal(c.toggleGeometry(0), true);
assert.equal(c.api.toggleAtom(0, record), true);
assert.deepEqual(detail.atomIndices, [2,0]);
assert.deepEqual(c.measurement(), {kind:'distance',value:3});
c.toggleGeometry(1);
assert.deepEqual(detail.atomIndices, [2,0,null]);
assert.deepEqual(c.measurement(), {kind:'angle',value:90});
assert.equal(c.slot(1), 2);
c.toggleGeometry(3);
assert.deepEqual(detail.atomIndices, [1]); // fourth starts over; explicit isotope is mapped
assert.deepEqual(detail.labels, ['2H2']);
c.reset(record, coords, true);
assert.equal(c.slot(3), 0); // reselecting the same object (filter/sort) is harmless
c.api.toggleAtom(1);
assert.deepEqual(detail.atomIndices, []);
assert.equal(c.api.toggleAtom(3), false); // geometry-only H is not a graph index
assert.equal(c.api.toggleAtom(-1), false);
const other = {...record};
c.api.toggleAtom(0);
c.reset(other, null, true);
assert.deepEqual(detail.atomIndices, []);
assert.equal(c.api.toggleAtom(0, record), false);
c.api.toggleAtom(0); c.api.toggleAtom(1);
assert.equal(c.measurement(), null); // no fake measures from a 2D-only record
c.api.getSelection().atomIndices.push(100);
assert.deepEqual(c.api.getSelection().atomIndices, [0,1]);
const legacy = {atoms:['C','N'], atomIds:['sketch-a','sketch-b']};
c.reset(legacy, {atoms:[{e:'C',x:0,y:0,z:0},{e:'N',x:0,y:0,z:0},{e:'H',x:2,y:2,z:2}]}, false);
c.toggleGeometry(0); c.toggleGeometry(1); c.toggleGeometry(2);
assert.deepEqual(detail.atomIndices, [0,1,null]);
assert.equal(c.measurement(), null); // undefined angle from a zero-length arm
c.api.clear(); assert.deepEqual(detail.atomIndices, []);
c.reset(null); assert.equal(detail.molecule, null);
console.log('Atom inspection: mapped and generated H, selection lifecycle, distances and angles passed.');
