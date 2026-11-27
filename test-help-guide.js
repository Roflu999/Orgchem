'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {topics} = require('./help-topics.js');
const ids = new Set();
for (const t of topics) {
  assert.match(t.id,/^[a-z][a-z0-9-]*$/);
  assert(!ids.has(t.id),`Duplicate topic ${t.id}`); ids.add(t.id);
  assert(t.title.trim() && t.tour.trim(),`Missing title or tutorial: ${t.id}`);
  assert.match(t.since,/^(?:v\d+\.\d+\.\d+|Before v3\.1\.0 \(untagged\))$/);
  assert(Array.isArray(t.body) && t.body.length && t.body.every(p => p.trim()),`Missing wiki copy: ${t.id}`);
}
const intro = topics.filter(t => t.firstRun);
assert(intro.length >= 2 && intro.length <= 6,'Keep the first visit short');
console.log(`PASS ${topics.length} unique, versioned wiki articles and walkthroughs`);
if (process.argv.includes('--dom')) {
  const {JSDOM} = require('./browser-check/node_modules/jsdom');
  const dom = new JSDOM(fs.readFileSync('bond-atlas.html','utf8'),{runScripts:'outside-only'});
  try {
    const w = dom.window, d = w.document, el = id => d.getElementById(id), click = id => el(id).click();
    const dialog=el('help-guide');
    dialog.showModal = () => {dialog.open=true;}; dialog.close = () => {dialog.open=false;};
    const main=el('main-content').innerHTML;
    for(const file of ['help-topics.js','help-guide.js']) w.eval(fs.readFileSync(file,'utf8'));
    assert(!dialog.open); click('about-button'); assert(dialog.open);
    assert(el('help-prev').disabled); assert.equal(el('help-step').textContent,intro[0].title);
    click('help-next'); dialog.close(); click('about-button'); assert.equal(el('help-step').textContent,intro[1].title);
    click('help-prev');
    for(const t of intro) {assert.equal(el('help-version').textContent,t.since); click('help-next');}
    assert(!el('help-wiki').hidden); assert.equal(d.activeElement,el('help-topic'));
    for(const t of topics) {
      el('help-topic').value=t.id; el('help-topic').dispatchEvent(new w.Event('change'));
      assert.equal(el('help-since').textContent,t.since); assert.equal(el('help-body').firstChild.textContent,t.body[0]);
      click('help-walk'); assert.equal(el('help-instruction').textContent,t.tour); click('help-next');
    }
    click('help-start'); assert.equal(el('help-step').textContent,intro[0].title);
    assert.equal(el('main-content').innerHTML,main,'Help must leave the workspace untouched');
    click('help-scope'); assert(!dialog.open && el('coverage').open);
    console.log('PASS first visit, resume, replay, wiki, topic walkthroughs and scope');
  } finally {dom.window.close();}
}
