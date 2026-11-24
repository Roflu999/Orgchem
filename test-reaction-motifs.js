'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const Chem = require('./chemistry');
const {draw} = require('./reaction-motifs');
const families = ['addition','substitution','aromatic'].map(f => require('./reaction-'+f));
const ns = 'http://www.w3.org/2000/svg';
const doc = {createElementNS(namespace,name) {
  assert.equal(namespace,ns);
  return {name,ownerDocument:doc,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=String(v);},
    appendChild(n){this.children.push(n); n.parentNode=this; return n;},
    removeChild(n){assert.ok(this.children.includes(n)); this.children.splice(this.children.indexOf(n),1); n.parentNode=null;},
    set innerHTML(_) {throw Error('Do not parse markup.');}};
}};
const svg = doc.createElementNS(ns,'svg');
const desc = svg.appendChild(doc.createElementNS(ns,'desc'));
const flatten = g => [g,...g.children.flatMap(flatten)];
const heads = new Map(Object.entries({
  'alkene-hbr':[2,1],'alkene-br2':[3,2],'alkene-h2so4':[2,1],
  'alkene-h2so4-hydrolysis':[2,1,0],'alkene-hydration':[2,1,2],
  'haloalkane-elimination':[3],'alcohol-dehydration':[2,3],
  'carbonyl-cyanide':[2,2],'carbonyl-hydride':[2,2],
  'halo-ammonia':[2,2],'halo-methylamine':[2,2],'halo-dimethylamine':[2,2],'halo-trimethylamine':[2],'halo-cyanide':[2],
  'benzene-nitration':[2,2,2,2],'friedel-crafts-acylation':[2,1,2],
  'radical-chlorination':[2,3,3,2]
}));
for (const f of ['acyl','anhydride']) for (const reagent of ['ammonia','water','ethanol','methylamine']) {
  heads.set(f+'-'+reagent,[2,2,2]);
}
const hit = new Set(); let painted = 0;
for (const family of families) for (const entry of family.entries) {
  const result = family.run(entry.id,Chem.describe(Chem.readSmiles(entry.example)));
  assert.ok(result.stages?.length,entry.id);
  const expected = heads.get(entry.id);
  if (expected) {hit.add(entry.id); assert.equal(result.stages.length,expected.length,entry.id);}
  result.stages.forEach((stage,i) => {
    const count = expected?.[i] || 0, key = `${entry.id}:${i}`;
    assert.equal(draw(svg,entry,stage,i),count > 0,key);
    assert.equal(svg.children[0],desc); assert.equal(svg.children.length,count ? 2 : 1,key);
    if (!count) return;
    painted++;
    const layer = svg.children[1], nodes = flatten(layer);
    const arrows = nodes.filter(n => n.attrs['data-electrons']);
    assert.equal(arrows.length,count,key); assert.ok(layer.attrs['aria-label'].includes(stage.title));
    for (const a of arrows) {
      const radical = entry.id === 'radical-chlorination';
      assert.equal(a.attrs['data-electrons'],radical ? '1' : '2',key);
      const [curve,head] = a.children;
      assert.match(curve.attrs.d,/^M[-\d.,]+ Q[-\d.,]+ [-\d.,]+$/);
      if (radical) {assert.equal(head.name,'path'); assert.match(head.attrs.d,/^M[-\d.,]+ L[-\d.,]+$/);}
      else {assert.equal(head.name,'polygon'); assert.equal(head.attrs.points.split(' ').length,3);}
    }
    const labels = nodes.filter(n => n.name === 'text').map(n => n.children.map(s => s.textContent).join(''));
    if (key === 'carbonyl-hydride:0') { assert.ok(labels.includes('H−')); assert.match(stage.scheme,/H-/); }
    if (key === 'carbonyl-cyanide:1') {
      assert.match(stage.scheme,/\+ HCN → .+ \+ CN-/);
      assert.ok(['H','C','N'].every(label => labels.includes(label)));
    }
    // Count bond-pair sources separately from atom lone pairs (e.g. bromonium
    // formation draws from both pi and Br–Br bonds, plus a lone pair on Br).
    const bondSources = {'carbonyl-hydride:0':1,'carbonyl-cyanide:1':1,'alkene-br2:0':2,'alkene-br2:1':1,
      'haloalkane-elimination:0':2,'alcohol-dehydration:1':2,'radical-chlorination:0':2};
    if (Object.hasOwn(bondSources,key)) {
      const bonds = nodes.filter(n => n.name === 'line').map(n => ['x1','y1','x2','y2'].map(k => +n.attrs[k]));
      const sources = arrows.map(a => a.children[0].attrs.d.slice(1).split(' ')[0].split(',').map(Number));
      const onBond = ([x,y]) => bonds.some(([ax,ay,bx,by]) => {
        const dx = bx-ax, dy = by-ay, t = ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy);
        return t > 0 && t < 1 && Math.hypot(x-ax-t*dx,y-ay-t*dy) < 1;
      });
      assert.equal(sources.filter(onBond).length,bondSources[key],key);
    }
    // No bogus second frame if stage text or index is stale, even after a successful draw.
    assert.equal(draw(svg,entry,{...stage,title:stage.title+' (net)'},i),false);
    assert.deepEqual(svg.children,[desc]);
    assert.equal(draw(svg,entry,stage,i+1),false);
    assert.equal(draw(svg,{...entry,id:'other-'+entry.id},stage,i),false);
  });
}
// The same dehydration ID has a different, stepwise branch for a secondary alcohol.
const addition = families[0], dehydration = addition.entries.find(e => e.id === 'alcohol-dehydration');
const secondary = addition.run(dehydration.id,Chem.describe(Chem.readSmiles('CC(O)C')));
assert.deepEqual(secondary.stages.map(s => s.title),['Activate the hydroxyl group','Lose water','Form the alkene']);
secondary.stages.forEach((s,i) => {
  assert.equal(draw(svg,dehydration,s,i),true);
  assert.equal(flatten(svg).filter(n => n.attrs['data-electrons']).length,[2,1,2][i]);
});
assert.deepEqual(hit,new Set(heads.keys()));
assert.equal(painted,[...heads.values()].flat().filter(Boolean).length);
for (const id of ['constructor','__proto__','Proton transfer',null]) {
  assert.equal(draw(svg,{id},{title:'Proton transfer'},2),false);
}
assert.equal(draw(svg,null,null,null),false);
const sandbox = {}; vm.runInNewContext(readFileSync(require.resolve('./reaction-motifs'),'utf8'),sandbox);
assert.equal(typeof sandbox.ReactionMotifs.draw,'function');
console.log(`Reaction motifs: ${painted} mapped stages across ${hit.size} entries; unsupported stages leave no drawing.`);
