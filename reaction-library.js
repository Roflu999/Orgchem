/* Reagents can match more than one pathway; the chooser does not rank their yields. */
(function(root){
  'use strict';
  const hydroEntries=[
    {id:'hydroxide-sn2',group:'Primary haloalkane',section:'Nucleophilic substitution',reagent:'Hydroxide ion',label:'Hydrolysis of a haloalkane',example:'CCBr'},
    {id:'hydroxide-acid',group:'Carboxylic acid',section:'Proton transfer · extension',reagent:'Hydroxide ion',label:'Neutralisation of an alkanoic acid',example:'CC(=O)O'}
  ];
  function hydroxide(id,record){
    const diagram=root.ReactionRules.analyze(record,'hydroxide');
    if(diagram.reason)return diagram;
    const acid=diagram.kind==='acid-base';if(acid!==(id==='hydroxide-acid'))return {reason:'no-rule'};
    const {leavingAtom:x}=diagram, halogen=record.atoms[x], elems=record.atoms.slice();
    elems[x]=acid?'[O-]':'O';
    const m=elems.map(()=>elems.map(()=>0));for(const {a,b,order} of record.bonds)m[a][b]=m[b][a]=order;
    const productSmiles=root.Chem.smiles({atoms:elems,m});
    const product=root.ModelInput.preview(productSmiles), products=(product?.knownName?product.name:productSmiles)+' + '+(acid?'water':halogen+'⁻');
    const stages=[{title:'Reactants',scheme:record.notation+' + OH⁻',detail:acid?'The carboxyl O–H supplies an acidic proton. Hydroxide supplies a lone pair.':'The carbon bonded to the halogen is the electrophile; the hydroxide oxygen supplies a lone pair.'},
      {title:acid?'Proton transfer':'Backside attack',scheme:acid?'O: → H; O–H → O':'O: → C; C–X → X',detail:acid?'One electron pair forms a new O–H bond as the original O–H pair returns to the acid oxygen.':'The incoming oxygen attacks from the side opposite the halogen. Bond formation and bond breaking happen together, not through a free carbocation.'},
      {title:'Products',scheme:products,detail:acid?'Water and a carboxylate remain. The drawing shows one resonance contributor; the negative charge is delocalised over both oxygens.':'The carbon chain is unchanged. The new C–O bond gives an alcohol; the halogen leaves as a halide ion.'}];
    return {group:acid?'Carboxylic acid':'Primary or methyl haloalkane',stages,products,productSmiles,diagram};
  }
  const modules=[{entries:hydroEntries,run:hydroxide},root.ReactionAromatic,root.ReactionAddition,root.ReactionSubstitution];
  const entries=modules.flatMap(m=>m.entries);
  const handlers=new Map(modules.flatMap(m=>m.entries.map(e=>[e.id,m.run])));
  function match(record){
    const results=new Map();if(record)for(const e of entries)results.set(e.id,handlers.get(e.id)(e.id,record));return results;
  }
  root.ReactionLibrary={entries,match};
})(typeof window!=='undefined'?window:globalThis);
