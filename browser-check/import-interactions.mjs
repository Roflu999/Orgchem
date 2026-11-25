// Exercise the real import dialog while explicitly controlling the service-ready race.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as tick} from 'node:timers/promises';
import {JSDOM} from 'jsdom';

const root = new URL('../', import.meta.url);
const load = name => readFile(new URL(name, root), 'utf8');
const html = await load('bond-atlas.html');
const scripts = await Promise.all(['chemistry.js','formats.js','interchange-ui.js'].map(load));
const failures = [];
async function check(name, action) {
  const dom = new JSDOM(html,{runScripts:'outside-only',url:'http://localhost'});
  const w=dom.window, el=id=>w.document.getElementById(id), loads=[], searches=[], jobs=[];
  // jsdom does not implement native dialog opening/closing.
  const dialog=el('import-dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  let ready;
  w.BondAtlas={state:{},loadStructures:records=>loads.push(records),searchFormula:q=>searches.push(q)};
  w.ChemistryClient={ready:new Promise(r=>{ready=r;}),available:true,parseNameFallback:async()=>null,
    job:async(op,payload)=>{jobs.push(payload);return {molecules:[{id:'parsed'}]};}};
  try {
    for(const source of scripts) w.eval(source);
    el('open-import').click();
    const start=(value,format='auto')=>{el('import-text').value=value;el('import-format').value=format;el('apply-import').click();};
    await action({w,el,start,ready,loads,searches,jobs}); console.log('PASS: '+name);
  } catch(error){failures.push(name+': '+error.message);} finally {dom.window.close();}
}
for(const [format,input,online] of [['formula','C2H6O',true],['smiles','CCO',false]]) {
  await check('cancel before service readiness: '+format,async({w,el,start,ready,loads,searches,jobs})=>{
    w.ChemistryClient.available=online; start(input,format);el('close-import').click();ready();await tick();
    assert.equal(loads.length+searches.length+jobs.length,0,'cancelled dialog must not mutate the explorer');
  });
}
for(const input of ['[Na+].[Cl-]','[nH]1cccc1','[13CH3]CO']) {
  await check('pasted bracket SMILES: '+input,async({start,ready,jobs,loads,el})=>{
    ready();start(input);await tick();assert(el('import-error').hidden,el('import-error').textContent);
    assert.deepEqual(jobs.map(j=>[j.format,j.text]),[['smiles',input]]);assert.equal(loads.length,1);
  });
}
await check('native JSON collection remains JSON',async({start,ready,jobs})=>{
  ready();start('[{"schema":"bond-atlas/3","name":"test"}]');await tick();assert.equal(jobs[0]?.format,'json');
});
assert.deepEqual(failures,[]);
