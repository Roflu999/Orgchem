/* node test-reaction-guide.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const guide = require('./reaction-guide.js');
const browser = vm.createContext({});
vm.runInContext('window = self = globalThis', browser);
function load(name) { vm.runInContext(fs.readFileSync(require.resolve('./'+name+'.js'),'utf8'), browser); }
load('reaction-guide'); // Works before chemistry.js or any UI code.
assert.equal(JSON.stringify(browser.ReactionGuide.courses), JSON.stringify(guide.courses));
assert.equal(JSON.stringify(browser.ReactionGuide.challenges), JSON.stringify(guide.challenges));
for (const name of ['systematic-name','chemistry','model-input','geometry','reaction-rules','reaction-aromatic','reaction-addition',
  'reaction-substitution','reaction-oxidation','reaction-extension','reaction-sites','reaction-library']) load(name);
const lib = browser.ReactionLibrary;
const all = new Set(lib.entries.map(e => e.id));
const unique = (items, label) => assert.equal(new Set(items).size, items.length, label);
const text = s => assert.ok(typeof s === 'string' && s.trim().length > 0);
assert.match(guide.scope,/not endorsed.*not a complete syllabus/);
assert.deepEqual(guide.courses.map(c => c.id),['aqa','cambridge','edexcel','ib-core','ib-hl','olympiad']);
const referenceHosts = ['www.aqa.org.uk','www.cambridgeinternational.org','qualifications.pearson.com','www.ibo.org','www.ibo.org','edu.rsc.org'];
for (const [index,c] of guide.courses.entries()) {
  for (const s of [c.label,c.description,c.referenceLabel]) text(s);
  const ref = new URL(c.referenceUrl);
  assert.equal(ref.protocol,'https:'); assert.equal(ref.hostname,referenceHosts[index]);
  assert.ok(c.entries.length); unique(c.entries,c.id);
  for (const id of c.entries) assert.ok(all.has(id),`${c.id} has dead link ${id}`);
  for (const id of all) assert.equal(guide.includes(c.id,id),c.entries.includes(id),id);
}
unique(guide.courses.map(c => c.entries.slice().sort().join('|')),'identical routes');
assert.deepEqual(new Set(guide.courses.flatMap(c => c.entries)),all);
for (const [course,positive,negative] of [
  ['aqa','anhydride-methylamine','diels-alder'],['cambridge','iodoform-test','anhydride-water'],
  ['edexcel','iodoform-test','carbonyl-hydride'],['ib-core','alkene-br2','benzene-nitration'],
  ['ib-hl','benzene-nitration','diels-alder'],['olympiad','diels-alder','alkene-h2so4']
]) { assert.ok(guide.includes(course,positive)); assert.ok(!guide.includes(course,negative)); }
for (const id of guide.courses.find(c => c.id === 'ib-core').entries) assert.ok(guide.includes('ib-hl',id));
for (const id of ['constructor','__proto__',undefined,null,'unknown']) {
  assert.equal(guide.lesson(id),null); assert.equal(guide.includes(id,'alkene-hbr'),false);
  assert.equal(guide.includes('aqa',id),false);
}
const notes = [...all].map(id => {
  const n=guide.lesson(id); assert.ok(n,id);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.ReactionGuide.lesson(id))),n);
  for (const field of ['cue','reasoning','error']) text(n[field]);
  return n;
});
for (const key of ['cue','reasoning','error']) unique(notes.map(n => n[key]),'reused '+key);
assert.ok(guide.challenges.length >= 3); unique(guide.challenges.map(p => p.id),'duplicate challenge');
function run(id,input) {
  const record = browser.ModelInput.preview(input); assert.ok(record,input);
  return lib.match(record).get(id);
}
for (const p of guide.challenges) {
  [p.title,p.prompt,p.input,...p.hints,...p.solution].forEach(text);
  assert.ok(p.hints.length && p.solution.length >= 2); assert.equal(p.entryId,p.entries[0]);
  for (const id of p.entries) assert.ok(guide.includes('olympiad',id),p.id+': '+id);
  const result=run(p.entryId,p.input); assert.ok(result && !result.reason,`${p.id}: ${result?.reason}`);
  assert.ok(result.productSmiles);
}
// Check the paper questions against actual branch products, not just valid starting IDs.
const variants=run('haloalkane-elimination','CC(Br)CC').variants;
assert.deepEqual(new Set(Array.from(variants,v => v.stereo)),new Set(['E','Z','not applicable']));
const fork=guide.challenges.find(p => p.id === 'isotope-fork');
const branches=run(fork.entryId,fork.input).variants;
assert.deepEqual(Array.from(branches,v => v.stereo).sort(),['E','Z','not applicable']);
const answer=fork.solution.join(' ');
assert.match(answer,/3-bromo-2-methylpentane/);
const initialA=0.60, newTotal=0.55, newA=newTotal-(1-initialA);
assert.ok(answer.includes('kH/kD = 0.60 / 0.15 = '+(initialA/newA).toFixed(0)));
assert.ok(answer.includes((100*newA/newTotal).toFixed(1)+'%'));
const ketone = run('oxidation-ketone','CC(O)CCC');
assert.equal(run('iodoform-test',ketone.productSmiles).productName,'butanoate');
assert.ok(run('iodoform-test',run('oxidation-ketone','CCC(O)CC').productSmiles).reason);
assert.equal(run('diels-alder','C=CC=C').productName,'cyclohexene');
console.log(`Reaction guide: ${guide.courses.length} distinct routes, ${all.size} individual lessons and ${guide.challenges.length} linked problems passed.`);
