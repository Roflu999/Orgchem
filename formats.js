/* Local-only structure interchange. Unsupported chemical annotations fail explicitly. */
(function (root) {
  'use strict';
  const C = root.Chem || (typeof require === 'function' ? require('./chemistry.js') : null);
  const MAX_BYTES = 1024 * 1024, MAX_RECORDS = 500;
  function guard(text) { if (typeof text !== 'string' || !text.trim()) throw Error('Paste a structure or choose a nonempty file.'); if (text.length > MAX_BYTES) throw Error('Import files up to 1 MB.'); }
  function parseEntry(text, mode = 'auto') {
    guard(text); text = text.trim();
    const prefix = text.match(/^(formula|smiles|name)\s*:\s*/i);
    if (prefix) { mode = prefix[1].toLowerCase(); text = text.slice(prefix[0].length); }
    if (mode === 'formula') return { kind: 'formula', parsed: C.parseFormula(text) };
    if (mode === 'name') return { kind: 'structures', isomers: [C.resolveName(text)], source: 'Offline name map' };
    if (mode === 'smiles') return { kind: 'structures', isomers: [C.describe(C.readSmiles(text))], source: 'SMILES import' };
    if (C.supportedNames.includes(text.toLowerCase())) return parseEntry(text, 'name');
    const normalized = text.replace(/[₀-₉]/g, d => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))).replace(/\s+/g, '');
    const tokens=[...normalized.matchAll(/([A-Z][a-z]?)(\d*)/g)];
    if (/^(?:[A-Z][a-z]?\d*)+$/.test(normalized) && new Set(tokens.map(t=>t[1])).size===tokens.length && (/H/.test(normalized)||/\d/.test(normalized))) return parseEntry(normalized, 'formula');
    return parseEntry(text, 'smiles');
  }
  function graphFromRecord(record) {
    if (!record || !Array.isArray(record.atoms) || !Array.isArray(record.bonds)) throw Error('JSON requires atoms and bonds arrays.');
    if (record.charge || record.charges?.some(Boolean) || record.formalCharge || record.radical || record.stereo || record.isotope) throw Error('Charged, radical, isotopic or stereo-assigned JSON structures are not supported.');
    if (record.atoms.length > 256 || record.bonds.length > 512) throw Error('This structure exceeds the import size limits.');
    const atoms = record.atoms.map(a => typeof a === 'string' ? a : a?.e || a?.elem);
    if (record.atoms.some(a => typeof a === 'object' && (a.charge || a.formalCharge || a.isotope || a.massNumber || a.stereo || a.cip || a.radical || a.radicalElectrons))) throw Error('Charged, isotopic, radical or stereo-assigned JSON atoms are not supported.');
    const g = { atoms, m: atoms.map(() => atoms.map(() => 0)) };
    for (const bond of record.bonds) {
      const { a, b, order } = bond;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= atoms.length || b >= atoms.length || a === b || ![1,2,3].includes(order) || g.m[a][b] || bond.stereo) throw Error('Invalid or unsupported JSON bond. Use zero-based atom indices and bond orders 1, 2 or 3, without stereo.');
      g.m[a][b] = g.m[b][a] = order;
    }
    const normalized = C.normalizeGraph(g);
    if (record.hydrogens !== undefined) {
      if (!Array.isArray(record.hydrogens) || record.hydrogens.length !== atoms.length || atoms.includes('H') || record.hydrogens.some((h, i) => h !== C.VAL[atoms[i]] - g.m[i].reduce((a,b) => a+b,0))) throw Error('JSON hydrogen counts disagree with neutral closed-shell valence.');
    }
    const iso = C.describe(normalized, typeof record.name === 'string' ? record.name.slice(0,120) : undefined);
    if (record.formula && C.parseFormula(record.formula, { enumeration: false }).formula !== iso.formula) throw Error('JSON formula does not match its atom/bond connectivity.');
    return iso;
  }
  function readMol(text) {
    const lines = text.replace(/^﻿/, '').replace(/\r\n?/g,'\n').split('\n');
    if (!lines[3]?.includes('V2000')) throw Error('Only MOL/SDF V2000 is supported. Convert V3000 or query files to neutral V2000 first.');
    const countLine = lines[3], n = Number(countLine.slice(0,3)), nb = Number(countLine.slice(3,6));
    if (!Number.isInteger(n) || !Number.isInteger(nb) || n < 1 || n > 256 || nb < 0 || nb > 512 || lines.length < 4+n+nb) throw Error('Invalid MOL atom or bond counts.');
    if (Number(countLine.slice(12,15))) throw Error('This MOL file declares chirality. Stereo import is deferred; provide an explicitly non-stereo structure.');
    const atoms = [];
    for (let i=0;i<n;i++) {
      const line=lines[4+i], e=line.slice(31,34).trim();
      if (line.length<34 || ![line.slice(0,10),line.slice(10,20),line.slice(20,30)].every(v=>v.trim() && Number.isFinite(Number(v)))) throw Error('Invalid MOL atom coordinates.');
      if (Number(line.slice(34,36)) || Number(line.slice(36,39)) || Number(line.slice(39,42)) || Number(line.slice(42,45)) || Number(line.slice(48,51))) throw Error('MOL isotope, charge, stereo, explicit valence or hydrogen-query annotations are not supported.');
      atoms.push(e);
    }
    const g={atoms,m:atoms.map(()=>atoms.map(()=>0))};
    for(let i=0;i<nb;i++) {
      const line=lines[4+n+i],a=Number(line.slice(0,3))-1,b=Number(line.slice(3,6))-1,order=Number(line.slice(6,9));
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=n||b>=n||a===b||![1,2,3].includes(order)||g.m[a][b]) throw Error('Invalid MOL bond. Aromatic/query bond types need explicit single/double Kekulé bonds.');
      if(Number(line.slice(9,12)) || Number(line.slice(15,18))) throw Error('Stereochemical and query bonds are not imported in this structural-only version.');
      g.m[a][b]=g.m[b][a]=order;
    }
    const tail=lines.slice(4+n+nb),end=tail.findIndex(l=>/^M  END\s*$/.test(l));
    if(end<0)throw Error('MOL record is missing M  END.');
    if(tail.slice(0,end).some(l=>l.trim()))throw Error('Unsupported MOL property records. Charges, radicals, isotopes and query annotations must be removed explicitly before import.');
    return C.describe(C.normalizeGraph(g),lines[0].trim().slice(0,120)||undefined);
  }
  function readSmilesList(text) {
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('//'));
    if(lines.length>MAX_RECORDS)throw Error('Import up to 500 structures at a time.');
    return lines.map((line,i)=>{const match=line.match(/^(\S+)(?:[ \t]+(.+))?$/);try{return C.describe(C.readSmiles(match[1]),match[2]?.slice(0,120));}catch(e){throw Error('SMILES line '+(i+1)+': '+e.message);}});
  }
  function parseData(text, format='auto', filename='') {
    guard(text);
    if(format==='auto') {
      if(/V(?:2000|3000)/.test(text))format=text.includes('$$$$')?'sdf':'mol';
      else if(/^\s*[\[{]/.test(text) && !/^\s*\[(?:Cl|Br|C|N|O|F|I|H)/.test(text))format='json';
      else if(/\.smi(?:les)?$/i.test(filename) || text.includes('\n') || /[=#()\[\]]/.test(text))format='smiles';
      else return parseEntry(text);
    }
    let isomers;
    if(format==='mol')isomers=[readMol(text)];
    else if(format==='sdf') {
      const blocks=text.replace(/\r\n?/g,'\n').split(/^\$\$\$\$[ \t]*$/m);
      if(blocks.length>MAX_RECORDS+1)throw Error('Import up to 500 SDF records at a time.');
      isomers=blocks.map((s,i)=>i?s.replace(/^\n/,''):s).filter(s=>s.trim()).map((s,i)=>{try{return readMol(s);}catch(e){throw Error('SDF record '+(i+1)+': '+e.message);}});
    } else if(format==='json') {
      let data;try{data=JSON.parse(text);}catch(e){throw Error('Invalid JSON. Paste a Orgchem Visualizer export or an atoms/bonds structure.');}
      const records=Array.isArray(data)?data:Array.isArray(data?.isomers)?data.isomers:[data];
      if(!records.length || records.length>MAX_RECORDS)throw Error('JSON must contain 1–500 structures.');
      isomers=records.map(graphFromRecord);
    } else if(format==='smiles')isomers=readSmilesList(text);
    else if(format==='formula'||format==='name')return parseEntry(text,format);
    else throw Error('Choose Auto, SMILES, MOL, SDF or JSON.');
    const unique=new Map(isomers.map(g=>[g.id,g]));
    if(!unique.size)throw Error('The import contains no structures.');
    return {kind:'structures',isomers:C.sortIsomers([...unique.values()]),source:format.toUpperCase()+' import'};
  }
  function safeName(s) { return String(s||'Molecule').replace(/[\r\n\t]/g,' ').slice(0,80); }
  function writeMol(iso,geometry,dimension='3D') {
    if(geometry.atoms.length>999||geometry.bonds.length>999)throw Error('V2000 atom/bond limit exceeded.');
    const pad=(n,w)=>String(n).padStart(w,' ');
    const lines=[safeName(iso.name),'  BondAtlas        '+dimension,'Illustrative coordinates; no stereochemistry assigned.',pad(geometry.atoms.length,3)+pad(geometry.bonds.length,3)+'  0  0  0  0            999 V2000'];
    geometry.atoms.forEach(a=>{const values=[a.x,a.y,a.z||0];if(!values.every(Number.isFinite))throw Error('Nonfinite coordinates cannot be exported.');lines.push(values.map(v=>v.toFixed(4).padStart(10,' ')).join('')+' '+a.e.padEnd(3,' ')+' 0  0  0  0  0  0  0  0  0  0  0  0');});
    geometry.bonds.forEach(b=>lines.push(pad(b.a+1,3)+pad(b.b+1,3)+pad(b.order,3)+'  0  0  0  0'));
    lines.push('M  END');return lines.join('\n')+'\n';
  }
  function writeSDF(isomers,getGeometry,dimension='2D') {
    return isomers.map(g=>writeMol(g,getGeometry(g),dimension)+'\n>  <FORMULA>\n'+g.formula+'\n\n>  <SMILES>\n'+g.notation+'\n\n>  <PRIORITY_HEURISTIC>\n'+g.stability.score+'\n\n>  <COORDINATE_NOTE>\nIllustrative; not energy-minimized. Stereochemistry unassigned.\n\n$$$$\n').join('');
  }
  function writeXYZ(iso,geometry){return geometry.atoms.length+'\n'+safeName(iso.name)+' | illustrative coordinates, angstroms; no assigned stereo\n'+geometry.atoms.map(a=>a.e+' '+[a.x,a.y,a.z].map(v=>v.toFixed(6)).join(' ')).join('\n')+'\n';}
  function writeJSON(isomers){return JSON.stringify({schema:'bond-atlas/2',note:'Connectivity only; no assigned stereochemistry. Priority scores are structural heuristics, not stability measurements.',isomers:isomers.map(g=>({name:g.name,formula:g.formula,atoms:g.atoms,bonds:g.bonds,hydrogens:g.hydrogens,smiles:g.notation,priority:g.stability}))},null,2);}
  function writeSMILES(isomers){return isomers.map(g=>g.notation+'\t'+safeName(g.name)).join('\n')+'\n';}
  function writeCSV(isomers){const quote=v=>'"'+String(v).replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';return 'name,formula,SMILES,priority_score,priority_reasons\r\n'+isomers.map(g=>[g.name,g.formula,g.notation,g.stability.score,g.stability.reasons.join(' ')].map(quote).join(',')).join('\r\n')+'\r\n';}
  const api={parseEntry,parseData,readMol,writeMol,writeSDF,writeXYZ,writeJSON,writeSMILES,writeCSV,MAX_BYTES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MoleculeFormats=api;
})(typeof self!=='undefined'?self:globalThis);
