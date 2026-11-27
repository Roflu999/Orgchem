/* node test-plate-comparison.js - no server, packages or GPU required. */
'use strict';
const assert = require('node:assert/strict');
global.window = globalThis;
require('./chemistry.js'); require('./model-input.js'); require('./molecule-record.js');
require('./reaction-input.js'); require('./plate-comparison.js');

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.ownerDocument = doc; }
  setAttribute(key, value) { this[key] = value; }
  append(...nodes) { for (const n of nodes) { this.children.push(n); n.parentNode = this; } }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this);
    this.parentNode = null;
  }
  all(tag) { return this.children.flatMap(n => (n.tag === tag ? [n] : []).concat(n.all(tag))); }
}
const doc = {createElement:tag => new Element(tag)};
const stages = [];
global.ModelStage = {create(host) {
  const stage = {host, draw2D(rows) { this.rows = rows; }, destroy() { this.destroyed = true; }};
  stages.push(stage); return stage;
}};

(async () => {
  const host = new Element('li'), other = new Element('li'), title = new Element('h3');
  host.append(title);
  const before = Object.freeze({label:'Before <b>', smiles:'CC=O'});
  const after = Object.freeze({label:'Ethanol', smiles:'CCO'});
  const stereo = {label:'Specified stereo', smiles:'F/C=C/F'};
  const {show, clear} = PlateComparison;
  await show(host, before, after, '<b>A new bond</b>', 'Recorded setup');
  assert.equal(host.all('section')[0]['aria-label'], 'Before and after structures');
  assert.equal(host.all('p')[0].textContent, 'Reaction conditions: Recorded setup');
  assert.equal(stages.length, 2);
  assert.deepEqual(stages.map(s => s.rows[0].record.formula), ['C2H4O', 'C2H6O']);
  assert.deepEqual(stages.map(s => Object.keys(s.rows[0]).sort()), [['id','record'],['id','record']]);
  assert(stages.every(s => s.host.role === 'img' && s.host['aria-label'].includes('SMILES:')));
  assert.equal(host.all('strong')[0].textContent, 'Ethanal');
  assert.deepEqual(host.all('bdi').map(e=>e.textContent), ['C₂H₄O','C₂H₆O']);
  assert.deepEqual(host.all('span').map(e=>e.textContent), ['Starting molecule','Selected organic product']);
  const details = host.all('details')[0];
  assert(!details.open); assert.equal(details.all('p')[0].textContent, '<b>A new bond</b>');

  await show(host, before, stereo);
  assert(stages[0].destroyed && stages[1].destroyed);
  assert.equal(host.all('details').length, 0);
  assert.match(host.all('p')[0].textContent, /local RDKit/);
  assert.equal(host.all('code')[0].textContent, stereo.smiles);
  const unaffected = stages.at(-1);
  const distill = Object.freeze({label:'P3 Ethanal', smiles:'CC=O', side:'Route A', setup:'Distillation'});
  const reflux = Object.freeze({label:'P4 Ethanoic acid', smiles:'CC(=O)O', side:'Route B', setup:'Reflux'});
  function captions() {
    return other.all('figcaption').map(c => [c.all('strong')[0].textContent, ...c.all('span').map(n => n.textContent)]);
  }
  await show(other, distill, reflux);
  assert.deepEqual(captions(), [[distill.label,distill.side,distill.setup], [reflux.label,reflux.side,reflux.setup]]);
  assert.deepEqual(other.all('figure').map(f => f.all('div')[0]['aria-label']), [distill,reflux].map(
    i => `${i.side}: ${i.label}. SMILES: ${i.smiles}`));
  assert.equal(other.all('section')[0]['aria-label'], 'Structure comparison');
  await show(other, {...distill, side:undefined}, {...reflux, setup:undefined});
  assert.deepEqual(captions(), [[distill.label,'Starting molecule',distill.setup], [reflux.label,reflux.side]]);

  const pending = [];
  const parse = ReactionInput.parse;
  ReactionInput.parse = (value, {signal}) => new Promise((resolve, reject) => pending.push({value, signal, resolve, reject}));
  const stale = show(other, distill, reflux);
  const latest = show(other, reflux, distill);
  assert.deepEqual(pending.map(c => c.value), [distill,reflux,reflux,distill].map(i => 'smiles:' + i.smiles));
  assert(pending.slice(0,2).every(c => c.signal.aborted));
  assert(!pending[2].signal.aborted && !unaffected.destroyed);
  const record = await parse('smiles:' + reflux.smiles);
  pending[2].resolve(record); pending[3].reject(Error('Service disconnected.'));
  await latest;
  const count = stages.length, panel = other.children[0];
  pending[0].resolve(record); pending[1].reject(Error('Late failure.'));
  await stale;
  assert.equal(stages.length, count); assert.deepEqual(other.children, [panel]);
  assert.deepEqual(captions(), [[reflux.label,reflux.side,reflux.setup], [distill.label,distill.side,distill.setup]]);
  const [drawn, failed] = other.all('figure');
  assert.equal(drawn.all('div')[0].hidden, false); assert.equal(drawn.all('code').length, 0);
  assert.equal(failed.all('code')[0].textContent, distill.smiles);
  assert.match(failed.all('p')[0].textContent, /Service disconnected/);
  const closing = show(other, before, after);
  clear(other); pending[4].resolve(record); pending[5].resolve(record); await closing;
  assert(pending[4].signal.aborted); assert.equal(other.children.length, 0);
  assert.equal(stages.length, count); clear(host); clear(host);
  assert.deepEqual(host.children, [title]); assert(stages.every(s => s.destroyed));
  console.log('PASS offline comparison, accessible labels, optional explanation, one-sided failure, replacement and cleanup');
})().catch(e => { console.error(e); process.exitCode = 1; });
