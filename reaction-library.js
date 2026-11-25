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
  const modules=[{entries:hydroEntries,run:hydroxide},root.ReactionAromatic,root.ReactionAddition,root.ReactionSubstitution,root.ReactionOxidation,root.ReactionExtension];
  const entries=modules.flatMap(m=>m.entries);
  const handlers=new Map(modules.flatMap(m=>m.entries.map(e=>[e.id,m.run])));
  function match(record){
    const results=new Map();if(!record)return results;
    for(const e of entries){
      const base=handlers.get(e.id)(e.id,record),sites=root.ReactionSites.enumerate(e.id,record);
      const additions=sites.length?[]:root.ReactionAddition.independentSites(e.id,record);
      const variants=sites.length?sites:additions.length?additions:root.ReactionAddition.directions(e.id,record);
      // Keep the detailed worked mechanism when it describes the sole outcome.
      if(variants.length && !root.ReactionSites.shouldOverride(base,variants)){
        const {label,sites,siteChoices,stereo}=variants[0];variants[0]={...base,label,sites,siteChoices,stereo};
      }
      results.set(e.id,variants.length?{...variants[0],variants}:base);
    }
    return results;
  }
  // A setup describes a syllabus example, not a threshold below which all chemistry stops.
  const setups={alkaline:'Alkaline aqueous conditions',thermal:'Thermal cycloaddition',
    aqueous:'Warm aqueous hydroxide',ethanolic:'Hot ethanolic hydroxide',neutralise:'Aqueous solution at room temperature',
    distil:'Heat with distillation; collect the volatile product',reflux:'Heat under reflux with excess oxidant',
    uv:'UV light',dark:'Dark, without initiation',room:'Room temperature',
    nitration:'Warm with the mixed-acid catalyst system',dry:'Anhydrous conditions with a Lewis acid catalyst',
    coldAcid:'Cold concentrated acid',thenWater:'Acid addition, then hydrolysis with water',
    steam:'Steam under pressure with an acid catalyst',dehydrate:'Heat with concentrated acid',
    solution:'Aqueous or alcoholic solution',buffer:'Mildly acidic conditions',
    alcoholSolvent:'Warm in ethanolic solution',ammoniaPressure:'Heat with excess ethanolic ammonia under pressure',
    amine:'Warm with the amine nucleophile',excess:'Room temperature with excess ammonia or amine'
  };
  const routes={'iodoform-test':['alkaline'],'diels-alder':['thermal'],
    'hydroxide-sn2':['aqueous'],'haloalkane-elimination':['ethanolic'],'hydroxide-acid':['neutralise'],
    'oxidation-aldehyde':['distil'],'oxidation-acid':['reflux'],'oxidation-ketone':['reflux','distil'],
    'radical-chlorination':['uv'],'benzene-nitration':['nitration'],'friedel-crafts-acylation':['dry'],
    'alkene-hbr':['room'],'alkene-br2':['room'],'alkene-h2so4':['coldAcid'],'alkene-h2so4-hydrolysis':['thenWater'],
    'alkene-hydration':['steam'],'alcohol-dehydration':['dehydrate'],'carbonyl-hydride':['solution'],
    'carbonyl-cyanide':['buffer'],'halo-cyanide':['alcoholSolvent'],'halo-ammonia':['ammoniaPressure'],
    'halo-methylamine':['amine'],'halo-dimethylamine':['amine'],'halo-trimethylamine':['amine']
  };
  for(const family of ['acyl','anhydride'])for(const nu of ['water','ethanol','ammonia','methylamine'])
    routes[family+'-'+nu]=[nu==='water'||nu==='ethanol'?'room':'excess'];
  function setupChoices(reagent){
    const ids=new Set(entries.filter(e=>e.reagent===reagent).flatMap(e=>routes[e.id]));
    if(ids.has('uv'))ids.add('dark');
    return [...ids].map(id=>({id,label:setups[id]}));
  }
  function pathways(results,reagent,setup){
    return entries.filter(e=>e.reagent===reagent && routes[e.id].includes(setup) && results.has(e.id) && !results.get(e.id).reason);
  }
  root.ReactionLibrary={entries,match,setupChoices,pathways,exampleSetup:id=>routes[id][0]};
})(typeof window!=='undefined'?window:globalThis);
