'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const {draw} = require('./reaction-diagram');
const NS = 'http://www.w3.org/2000/svg';

// A deliberately small DOM: no HTML parsing, browser globals, or font metrics.
const doc = {createElementNS(ns, tag) {
  assert.equal(ns, NS);
  return {tag, ownerDocument: doc, attrs: {}, children: [], style: {}, textContent: '',
    setAttribute(key, value) { this.attrs[key] = String(value); },
    appendChild(el) { this.children.push(el); el.parentNode = this; return el; },
    removeChild(el) { this.children.splice(this.children.indexOf(el), 1); el.parentNode = null; }};
}};
const descendants = (el, tag) => el.children.flatMap(n => (n.tag === tag ? [n] : []).concat(descendants(n, tag)));
const atom = (e, h, chargeBefore, chargeAfter, x, y) => ({e, h, chargeBefore, chargeAfter, x, y});
const bond = (a, b, order = 1) => ({a, b, order});
const arrow = (from, to) => ({from, to});
const acid = {kind: 'acid-base', atoms: [atom('O', 1, -1, 0, -2.4, 0), atom('H', 0, 0, 0, 0, 0), atom('Cl', 0, 0, -1, 1, 0)],
  bondsBefore: [bond(1, 2)], bondsAfter: [bond(1, 0)], arrows: [arrow([0], [1]), arrow([1, 2], [2])]};
const sn2 = {kind: 'sn2', atoms: [atom('C', 1, 0, 0, -3.5, 1), atom('C', 0, 0, 0, -2.8, .3), atom('O', 0, -1, 0, -1.8, .3),
  atom('C', 3, 0, 0, 0, 0), atom('Br', 0, 0, -1, 1, 0)], bondsBefore: [bond(0, 1, 3), bond(1, 2), bond(3, 4)],
  bondsAfter: [bond(0, 1, 3), bond(1, 2), bond(2, 3)], arrows: [arrow([2], [2, 3]), arrow([3, 4], [4])]};
const formulas = svg => descendants(svg, 'text').map(t => t.children.map(n => n.textContent).join(''));
const positions = svg => descendants(svg, 'text').map(t => [+t.attrs.x, +t.attrs.y]);
const diff = (a, b) => b.map((v, i) => v - a[i]);
const distance = (p, q) => Math.hypot(...diff(p, q));
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
const svg = doc.createElementNS(NS, 'svg');
const desc = svg.appendChild(doc.createElementNS(NS, 'desc'));

for (const r of [acid, sn2]) {
  const original = JSON.stringify(r);
  draw(svg, r, 0);
  const view = svg.attrs.viewBox, before = positions(svg), names = formulas(svg);
  const beforeBonds = descendants(svg, 'line').map(b => ({...b.attrs}));
  assert.equal(beforeBonds.length, r.bondsBefore.reduce((s, b) => s + b.order, 0));
  assert.equal(descendants(svg, 'path').length, 0);
  assert.equal(svg.children[0], desc);
  assert.equal(names.length, r.atoms.length);
  assert.equal(svg.style.width, '100%');

  draw(svg, r, 1);
  assert.equal(svg.attrs.viewBox, view);
  assert.deepEqual(formulas(svg), names);
  assert.deepEqual(descendants(svg, 'line').map(b => b.attrs), beforeBonds);
  const paths = descendants(svg, 'path');
  assert.equal(paths.length, 2);
  assert.ok(paths.every(p => /^M[^Q]+ Q/.test(p.attrs.d)));
  assert.equal(descendants(svg, 'circle').length, 2);
  assert.equal(descendants(svg, 'polygon').length, 2);
  const numbers = d => d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
  const center = i => [before[i][0], before[i][1] - 7];
  const midpoint = ([i, j]) => center(i).map((v, k) => (v + center(j)[k]) / 2);
  const source = midpoint(r.arrows[1].from);
  assert.deepEqual(numbers(paths[1].attrs.d).slice(0, 2), source);
  if (r === sn2) assert.deepEqual(numbers(paths[0].attrs.d).slice(-2), midpoint(r.arrows[0].to));

  draw(svg, r, 2);
  assert.equal(svg.attrs.viewBox, view);
  assert.equal(descendants(svg, 'path').length, 0);
  assert.equal(descendants(svg, 'circle').length, 0);
  assert.equal(svg.children.length, 2);
  const after = positions(svg), productNames = formulas(svg);
  const leaving = r.atoms.length - 1, centerIndex = leaving - 1;
  assert.ok(productNames[leaving].endsWith('−'));
  assert.ok(!productNames[centerIndex - 1].includes('−'));
  near(distance(after[centerIndex - 1], after[centerIndex]), 76);
  assert.ok(distance(after[centerIndex], after[leaving]) >= 151.99);
  const newLine = descendants(svg, 'line').at(-1).attrs;
  const attached = [centerIndex - 1, centerIndex].map(i => [after[i][0], after[i][1] - 7]);
  const ends = [[+newLine.x1, +newLine.y1], [+newLine.x2, +newLine.y2]];
  assert.ok(attached.every(a => ends.some(e => distance(a, e) < 32)));
  if (r === acid) {
    assert.equal(productNames[1], 'H');
    assert.equal(productNames[0], 'HO');
  } else {
    near(distance(before[0], before[2]), distance(after[0], after[2]));
    assert.equal(productNames[3], 'CH3');
  }
  assert.equal(JSON.stringify(r), original);
}

const supplied = {...acid, atoms: acid.atoms.map((a, i) => ({...a, afterX: i + 1, afterY: -i}))};
draw(svg, supplied, 2);
assert.deepEqual(positions(svg), [[76, 7], [152, -69], [228, -145]]);
const browser = {};
vm.runInNewContext(readFileSync(require.resolve('./reaction-diagram'), 'utf8'), browser);
assert.equal(typeof browser.ReactionDiagram.draw, 'function');
console.log('Reaction diagram tests passed.');
