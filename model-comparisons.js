/* Curated desk comparisons. Match records, never row labels or input spelling. */
(function(root){
  'use strict';
  const starters = [
    {id:'oxygen', inputs:['ethanol','dimethyl ether'], sides:['ethanol','ether']},
    {id:'chain', inputs:['pentane','2-methylbutane'], sides:['pentane','branched']},
    {id:'mirror', inputs:['C[C@H](O)C(=O)O','C[C@@H](O)C(=O)O'], sides:['S','R']}
  ];
  // The first vertex is the teaching focus; the remaining vertices constrain
  // the entire molecule. Small, bounded templates also work on reordered atoms.
  const alcohol = {atoms:'OCC',edges:[[0,1],[1,2]]}, ether = {atoms:'OCC',edges:[[0,1],[0,2]]};
  const pentane = {atoms:'CCCCC',edges:[[0,1],[1,2],[0,3],[3,4]]}, branched = {atoms:'CCCCC',edges:[[0,1],[0,2],[0,3],[3,4]]};
  const lactic = {atoms:'CCOCOO',edges:[[0,1],[0,2],[0,3],[3,4,2],[3,5]]};
  const possibilities = [['ethanol',alcohol],['ether',ether],['pentane',pentane],['branched',branched],['mirror',lactic]];
  const cache = new WeakMap();
  function graph(record){
    const {atoms,bonds,hydrogens}=record;
    if(!Array.isArray(atoms)||atoms.length>17||!Array.isArray(bonds)||bonds.length!==atoms.length-1||!Array.isArray(hydrogens)||hydrogens.length!==atoms.length)return null;
    // The offline preview folds ordinary H, but RDKit preserves explicit H and its
    // atom map. Match the heavy skeleton without renumbering the displayed atoms.
    const heavy=atoms.map((_,i)=>i).filter(i=>atoms[i]!=='H');
    if(![3,5,6].includes(heavy.length))return null;
    if(['charges','isotopes','radicals','radicalElectrons'].some(k=>record[k]?.some(Boolean)))return null;
    const matrix=atoms.map(()=>Array(atoms.length).fill(0));
    for(const {a,b,order,aromatic} of bonds){
      if(!Number.isInteger(a)||!Number.isInteger(b)||!matrix[a]||!matrix[b]||a===b||matrix[a][b]||aromatic||![1,2].includes(order))return null;
      matrix[a][b]=matrix[b][a]=order;
    }
    if(atoms.some((e,i)=>!['C','O','H'].includes(e)||!Number.isInteger(hydrogens[i])||hydrogens[i]<0||hydrogens[i]!==({C:4,O:2,H:1}[e]-matrix[i].reduce((a,b)=>a+b,0))||(e==='H'&&!heavy.some(j=>matrix[i][j]===1))))return null;
    return {matrix,heavy};
  }
  function mapFocus(atoms,{matrix,heavy},template){
    const n=heavy.length;if(n!==template.atoms.length)return -1;
    const edges=heavy.map(()=>Array(n).fill(0));for(const [a,b,o=1] of template.edges)edges[a][b]=edges[b][a]=o;
    const assigned=[];
    function visit(){
      const i=assigned.length;if(i===n)return assigned[0];
      for(const j of heavy){
        if(atoms[j]!==template.atoms[i]||assigned.includes(j)||!assigned.every((k,h)=>matrix[j][k]===edges[i][h]))continue;
        assigned.push(j);const focus=visit();assigned.pop();if(focus>=0)return focus;
      }
      return -1;
    }
    return visit();
  }
  function identify(record){
    if(!record||typeof record!=='object')return null;
    if(cache.has(record))return cache.get(record);
    const skeleton=graph(record);let mark=null;
    if(skeleton)for(const [key,template] of possibilities){
      const atom=mapFocus(record.atoms,skeleton,template);if(atom<0)continue;
      const stereo=record.stereo;
      if(stereo?.unsupported?.length||stereo?.bonds?.length)break;
      let side=key;
      if(key==='mirror'){
        const center=stereo?.centers?.[0];
        if(stereo?.centers?.length!==1||!center.specified||center.atom!==atom||!['R','S'].includes(center.cip))break;
        side=center.cip;
      }else if(stereo?.centers?.length)break;
      mark={side,atom};break;
    }
    cache.set(record,mark);return mark;
  }
  function match(a,b){
    const marks=[identify(a),identify(b)];if(!marks[0]||!marks[1]||marks[0].side===marks[1].side)return null;
    const starter=starters.find(s=>marks.every(m=>s.sides.includes(m.side)));
    return starter?{id:starter.id,marks}:null;
  }
  function mirrorPreview(raw){
    const smiles=raw.trim().replace(/^smiles\s*:\s*/i,'');
    return Object.values(root.ComparisonMirrors).find(s=>s.record.notation===smiles)?.record||null;
  }
  const safeColor=(color,fallback)=>/^(#[\da-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]+)$/i.test(color)?color:fallback;
  // Specimen-specific RDKit coordinates. Using the verified picture for this
  // *matched* enantiomer preserves its wedge/hash regardless of input ordering.
  function mirrorDrawing(mark,ink,accent){
    const specimen=root.ComparisonMirrors[mark.side];if(!specimen)return null;
    const [x,y]=specimen.point;
    const ring=`<circle data-comparison-focus="center" cx="${x}" cy="${y}" r="19" fill="none" stroke="${safeColor(accent,'#74818a')}" stroke-width="5"/>`;
    return root.MoleculeRecords.themedSVG(specimen.record.depictions.skeletal,ink).replace('</svg>',ring+'</svg>');
  }
  function schematicMarks(mark,record,xs,ys,color){
    const i=mark.atom,c=safeColor(color,'#74818a');
    const lines=record.bonds.filter(b=>b.a===i||b.b===i).map(b=>`M${xs[b.a]} ${ys[b.a]}L${xs[b.b]} ${ys[b.b]}`).join(' ');
    return `<g data-comparison-focus="environment" fill="none" stroke="${c}"><path d="${lines}" stroke-width="9" stroke-linecap="round" opacity=".34"/><circle cx="${xs[i]}" cy="${ys[i]}" r="14" stroke-width="2.3"/></g>`;
  }
  function controls(openPair){
    const $=id=>document.getElementById(id), I=root.AtlasI18n;
    const details=$('desk-comparison-note'), status=$('desk-comparison-status'), labels=$('desk-comparison-labels');
    let previous='';
    for(const s of starters)$('desk-starter-'+s.id).addEventListener('click',()=>{details.open=false;openPair(s.inputs);});
    return function synchronize(rows,mode){
      const picked=rows.filter(r=>r.pick.checked), ready=picked.length===2&&picked.every(r=>r.visible);
      const records=ready?picked.map(r=>r.result?.record||r.preview):[];
      const pair=ready&&match(...records), marks=new Map();
      const key=pair?pair.id+':'+picked.map((r,i)=>r.id+pair.marks[i].side).join(':'):'';
      if(key!==previous)details.open=false;
      if(pair){
        picked.forEach((r,i)=>marks.set(r.id,pair.marks[i]));
        if(key!==previous){
          labels.replaceChildren(...picked.map((r,i)=>{
            const label=document.createElement('li');
            I.bindText(label,'compare.row',()=>({n:r.id,detail:I.t('compare.'+pair.marks[i].side)}));return label;
          }));
          I.bindText($('desk-comparison-why'),'compare.why.'+pair.id);
        }
      }else if(previous)labels.replaceChildren();
      let guidance=pair?'legend'+mode:!ready?'select':records.every(Boolean)?'unavailable':'waiting';
      let params={};
      if(pair&&mode==='3d'){
        const shown=picked.filter(row=>row.result?.geometry);
        if(!shown.length)guidance='noGeometry';
        else if(shown.length===1){guidance='oneGeometry';params={n:shown[0].id};}
      }
      I.bindText(status,'compare.'+guidance,params);
      details.hidden=labels.hidden=!pair;previous=key;
      return marks;
    };
  }
  const api={starters,identify,match,mirrorPreview,mirrorDrawing,schematicMarks,controls};
  root.ModelComparisons=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
