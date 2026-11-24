'use strict';
const assert = require('node:assert/strict');
const C = require('./chemistry.js'), F = require('./formats.js');
const id = smiles => C.canonical(C.readSmiles(smiles)).key;
const parsed = [
  ['3-methylhexan-2-ol','CC(O)C(C)CCC'],
  ['3-bromo-2-methylpentane','CC(C)C(Br)CC'],
  ['2,2,4-trimethylpentane','CC(C)(C)CC(C)C'],
  ['2-ethoxyhexane','CC(OCC)CCCC'],
  ['1,2-difluorocyclopentane','FC1C(F)CCC1'],
  ['ethylcyclohexane','CCC1CCCCC1'],
  ['cyclohexanone','O=C1CCCCC1'],
  ['4-methylcyclohexene','C1=CCC(C)CC1'],
  ['hexa-1,4-diene','C=CCC=CC'],
  ['octa-2,5-diyne','CC#CCC#CCC'],
  ['hex-2-yne','CC#CCCC'],
  ['2-methylpentanal','O=CC(C)CCC'],
  ['2-aminopropanoic acid','CC(N)C(=O)O'],
  ['2,2-difluorobutanamide','NC(=O)C(F)(F)CC'],
  ['3-methylpentanenitrile','N#CCC(C)CC'],
  ['ethyl 2-methylbutanoate','CCOC(=O)C(C)CC'],
  ['pentane-2,4-dione','CC(=O)CC(=O)C'],
  ['pentane-1,5-diamine','NCCCCCN'],
  ['butane-1,2,4-triol','OCC(O)CCO'],
  ['hexan-2-amine','CC(N)CCCC']
];
for (const [name, smiles] of parsed) {
  assert(!C.supportedNames.includes(name), name+' must not be a table lookup');
  for (const query of [F.parseEntry(name),F.parseEntry('Name: '+name),F.parseData(name,'name'),F.parseData(name+'\n')]) {
    assert.equal(query.isomers.length,1); assert.equal(query.isomers[0].id,id(smiles),name);
    assert.equal(query.source,'Local systematic name parser');assert.equal(query.fromName,true);
    assert.equal(query.isomers[0].name,name); assert.equal(query.isomers[0].knownName,true);
  }
}
// Vary length and bond/carbon locants independently; compare exact connectivity, not only formula.
let generated = 0;
for (const [offset,stem] of ['pent','hex','hept','oct','non','dec','undec','dodec'].entries()) {
  const n = 5+offset;
  for (let pos=1; pos<=Math.ceil(n/2); pos++) {
    const name = '2-methyl'+stem+'an-'+pos+'-ol';
    const smiles = Array.from({length:n},(_,i)=>'C'+(i===pos-1?'(O)':'')+(i===1?'(C)':'')).join('');
    assert.equal(C.resolveName(name).id,id(smiles),name);generated++;
  }
}
for (const [name,smiles] of [['glycerol','OCC(O)CO'],['ethyl alcohol','CCO'],['ETHYL   ACETATE','CCOC(C)=O'],
  ['chloroform','ClC(Cl)Cl'],['isopropyl alcohol','CC(O)C'],['toluene','CC1=CC=CC=C1'],['formaldehyde','C=O'],['acetonitrile','CC#N']]) {
  const r=F.parseEntry(name);assert.equal(r.isomers[0].id,id(smiles));assert.equal(r.source,'Offline name map');
}
assert.equal(F.parseEntry('  3‑methylhexan–2–ol  ').isomers[0].id,id(parsed[0][1]));
assert.equal(F.parseEntry('3-METHYLHEXAN-2-OL').isomers[0].id,id(parsed[0][1]));
for (const [name,formula] of [['aspirin','C9H8O4'],['acetaminophen','C8H9NO2'],['caffeine','C8H10N4O2']]) assert.equal(F.parseEntry(name).isomers[0].formula,formula);
const atLimit = '1,1,2,2-tetrabutyl-3,3,4,4-tetrabutyl-5,5,6,6-tetrabutyl-7-butyldodecane';
assert.equal(C.resolveName(atLimit).atoms.length,64);
assert.throws(()=>C.resolveName('8-methyl-'+atLimit), /64 non-hydrogen/);
const rejects = [
  'hexanol','butene','pentanone','methylpentane','2-methylhexanol','2-methylhexene','2-chloroethanol',
  '0-methylhexane','7-methylhexane','3-dimethylpentane','2,3-methylpentane','2,2,2-trimethylpropane',
  'methene','cycloethane','hexa-1,1-diene','pent-5-yne','butan-1-one','1-methylpentanal','cyclopentanoic acid',
  'ethyl ethanol','ethanoate','diethyl ether trailing','3-methyl-hexane','hexane (technical grade)',
  '(2R)-butan-2-ol','cis-1,2-dimethylcyclohexane','(E)-hex-2-ene','2,3-epoxybutane','cyclohexylbenzene',
  'sodium ethanoate','methanol-d4','x'.repeat(181)
];
for (const name of rejects) assert.throws(()=>F.parseEntry(name,'name'), e=>e.code==='UNSUPPORTED_NAME',name);
for (const name of ['(2R)-butan-2-ol','hexanol','pentene','ethyl mystery','name: (E)-hex-2-ene'])
  assert.throws(()=>F.parseData(name), e=>e.code==='UNSUPPORTED_NAME',name);
for (const smiles of ['CCO','CC(Cl)N','c1ccccc1','Clc1ccccc1','N[C@H](C)O','[13CH3]C','F/C=C/F']) assert.equal(C.looksLikeName(smiles),false,smiles);
assert.equal(F.parseEntry('smiles: CC(O)CCC').isomers[0].id,id('CC(O)CCC'));
assert.equal(F.parseEntry('C4H10O').kind,'formula');
assert.equal(F.parseData('CCO ethanol\n','auto','structures.smi').source,'SMILES import');
console.log(`PASS name resolution: ${parsed.length} unseen examples, ${generated} generated chains, 8 aliases, ${rejects.length} explicit rejections, precedence and import routing`);
