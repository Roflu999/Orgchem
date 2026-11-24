'use strict';
const assert=require('node:assert/strict');const Q=require('./quantum-grid.js');
const make=(counts='2 1 0 0\n2 0 1 0\n2 0 0 1',values='0 1 2 3 4 5 6 7')=>['Supplied sample','Single scalar grid','1 0 0 0',counts,'1 1 0 0 0',values].join('\n');
const q=Q.parse(make());assert.equal(q.count,8);assert.deepEqual(q.dimensions,[2,2,2]);assert.equal(q.atoms[0].e,'H');assert.equal(q.maxAbs,7);assert(q.text.startsWith('Imported scalar dataset'));
const ang=Q.parse(make('-2 0.529177210903 0 0\n-2 0 0.529177210903 0\n-2 0 0 0.529177210903'));assert.deepEqual(ang.atoms,q.atoms);assert.match(ang.text,/2 1 0 0/);
assert.throws(()=>Q.parse(make(undefined,'0 1')),/dimensions/);
assert.throws(()=>Q.parse(make('2 0 0 0\n2 0 1 0\n2 0 0 1')),/nondegenerate/);
assert.throws(()=>Q.parse(make('1000 1 0 0\n1000 0 1 0\n1000 0 0 1')),/1,000,000/);
assert.throws(()=>Q.parse(make('2 1 0 0\n-2 0 1 0\n2 0 0 1')),/same coordinate/);
assert.throws(()=>Q.parse(make(undefined,'0 0 0 0 0 0 0 0')),/zero/);
assert.throws(()=>Q.parse(make(undefined,'0 1 2 3 4 5 6 Infinity')),/finite/);
assert.throws(()=>Q.parse(make().replace('1 0 0 0\n2','-1 0 0 0\n2')),/Multi-orbital/);
console.log('PASS supplied CUBE grid units, bounds, axes and scalar validation');

// Run the real UI handlers with a tiny DOM/renderer double. This tests async
// ownership without needing a browser or performing a quantum calculation.
const fs=require('node:fs'),vm=require('node:vm');
function gridUI(){
  const nodes=new Map(),shapes=new Set();
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',files:[],listeners:{},append(){},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);}
  const viewer={render(){},removeShape(shape){shapes.delete(shape);},addVolumetricData(){const shape={};shapes.add(shape);return shape;}};
  const context=vm.createContext({document:{getElementById:node,createElement:()=>node('panel'),addEventListener(){}},
    BondAtlas:{state:{selected:{id:'selected'},viewer},geometry3D:()=>({atoms:[{e:'H',x:0,y:0,z:0}]}),setMode(){}},
    MoleculeRecords:{cacheKey:()=> 'selected:conformer'},getComputedStyle:()=>({getPropertyValue:()=> '#888888'})});
  vm.runInContext(fs.readFileSync(require.resolve('./quantum-grid.js'),'utf8'),context);
  node('quantum-grid-kind').value='density';
  return {node,shapes,upload(text){node('quantum-grid-file').files=[{size:20,text:typeof text==='function'?text:async()=>text}];return node('quantum-grid-file').listeners.change();},
    show(){node('quantum-grid-show').listeners.click();},clear(){node('quantum-grid-clear').listeners.click();},message:()=>node('quantum-grid-status').textContent};
}
(async()=>{
  const ui=gridUI();await ui.upload(make());ui.show();assert.equal(ui.shapes.size,1);
  await ui.upload('invalid');assert.match(ui.message(),/incomplete/);assert.equal(ui.shapes.size,0);
  console.log('PASS replacing a grid removes its old surface even when the replacement is invalid');
  let release;const older=ui.upload(()=>new Promise(resolve=>{release=resolve;}));
  await ui.upload('invalid');release(make());await older;
  assert.match(ui.message(),/incomplete/);ui.show();assert.match(ui.message(),/Choose a valid CUBE/);assert.equal(ui.shapes.size,0);
  console.log('PASS superseded CUBE file reads cannot restore stale datasets');
  const pending=ui.upload(()=>new Promise(resolve=>{release=resolve;}));ui.clear();release(make());await pending;
  assert.match(ui.message(),/removed/);ui.show();assert.match(ui.message(),/Choose a valid CUBE/);
  console.log('PASS removing a grid invalidates an in-flight file read');
})().catch(error=>{console.error(error);process.exitCode=1;});
