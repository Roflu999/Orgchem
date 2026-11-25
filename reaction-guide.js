/* Independent study routes. IDs refer to worked examples, not exam-board syllabus points. */
(function (root) {
  'use strict';
  const notes = new Map();
  function note(id, cue, reasoning, error) { notes.set(id, {cue, reasoning, error}); }

  note('hydroxide-sn2', 'Find a saturated carbon bearing a halogen. Is that carbon methyl or primary?',
    'The hydroxide oxygen donates a pair from opposite the halogen. As C–O forms, the C–X pair leaves with X: there is one transition state.',
    'Do not draw a free primary carbocation. The competing elimination route takes a neighbouring H instead.');
  note('hydroxide-acid', 'In –C(=O)OH there is a transferable O–H proton as well as a carbonyl.',
    'Hydroxide accepts that proton. The acid’s O–H bond pair stays on its oxygen, giving a carboxylate with charge shared between two oxygens.',
    'Do not replace the acid OH by the incoming OH. It is proton transfer, not substitution at carbon.');
  note('radical-chlorination', 'A saturated hydrocarbon has no pi bond. Look for homolysis as the source of chain carriers.',
    'A chlorine radical takes H, leaving a carbon radical. That radical takes Cl from Cl2, regenerating a chlorine radical. Two radicals can instead combine and end a chain.',
    'Use one-electron fishhooks, not electron-pair arrows. A propagation step consumes one radical and produces one, not two.');
  note('benzene-nitration', 'The ring loses H and gains –NO2; identify the electron-deficient N of the nitronium ion.',
    'A ring pi pair makes C–N, temporarily disrupting aromaticity. Removal of H from that same carbon returns the C–H pair to the ring.',
    'Do not stop at an addition product or draw the attacked ring carbon losing H before it has bonded to N.');
  note('friedel-crafts-acylation', 'The new side chain is attached through carbonyl carbon: ring–C(=O)R.',
    'The ring donates to an acylium electrophile. Losing a proton from the new substituted carbon restores the aromatic pi system; the carbonyl survives.',
    'An acyl group is not an alkyl group: do not omit its C=O or attach the ring through oxygen.');
  note('alkene-hbr', 'The two ends of an unsymmetrical C=C may put the positive charge on different carbons.',
    'The pi pair takes H as H–Br breaks. Compare the two possible carbocations before placing Br: for propene, the secondary cation is favoured over the primary one.',
    'The favoured product is not necessarily the only one. Bromide donates a pair to the carbocation, not to the protonated end by default.');
  note('alkene-br2', 'Look for loss of C=C and a bromine on each of its former carbons.',
    'The pi bond polarises Br2. A bridging bromonium ion can form; attack by bromide from the opposite face opens the bridge.',
    'Do not put both bromines on the same carbon. Decolourisation alone does not specify product stereochemistry or prove only alkenes react.');
  note('alkene-h2so4', 'Distinguish an alkyl hydrogensulfate (C–O–S) from a compound with a C–S bond.',
    'Protonation of the alkene can give a carbocation. An oxygen lone pair on hydrogensulfate captures it, so the first product is a sulfate ester.',
    'Do not show a free alcohol before the separate hydrolysis step.');
  note('alkene-h2so4-hydrolysis', 'Follow the carbon that first bears –OSO3H and then –OH.',
    'The first addition fixes the position of the substituent. Hydrolysis converts the sulfate ester into an alcohol; overall, H and OH have added across the alkene.',
    'Do not count sulfuric acid as a net product of hydration: it is recovered after being used in the addition step.');
  note('alkene-hydration', 'Net change: add H and OH across C=C without changing the carbon skeleton.',
    'After protonation, water attacks the electron-poor carbon through oxygen. The resulting oxonium ion loses H+ and restores the acid catalyst.',
    'In an acidic medium the attacking molecule is water, not hydroxide. A neutral water molecule becomes positive when it makes a third bond.');
  note('haloalkane-elimination', 'Locate a H on a carbon adjacent to the one carrying the halogen (a beta H).',
    'A base removes the beta H. In the concerted route the C–H pair makes the pi bond while the C–X pair leaves with X. Different beta sites can give different alkenes.',
    'Do not take H from the carbon bearing X. Hydroxide can also attack carbon, so solvent and heating favour pathways rather than guarantee purity.');
  note('alcohol-dehydration', 'Find the OH-bearing carbon and a neighbour that can supply H to make C=C.',
    'Protonating oxygen turns a poor leaving group into water. Loss of water and a beta H gives the alkene and restores the acid; a primary alcohol need not form a free carbocation.',
    'Do not expel OH− from the unprotonated alcohol or collect H and OH from the same carbon.');
  note('oxidation-aldehyde', 'A primary alcohol ends in –CH2OH; the carbonyl product still bears H.',
    'Removing two H atoms overall gives –CHO. Distilling the aldehyde away from oxidant limits the second oxidation to a carboxylic acid.',
    'The symbol [O] counts an oxidising equivalent. It is not an atom attacking in an elementary mechanism.');
  note('oxidation-acid', 'For a primary alcohol, ask whether the aldehyde remains in contact with excess oxidant.',
    'The first oxidation gives an aldehyde; further oxidation gives –COOH. Reflux returns volatile material rather than separating the aldehyde.',
    'One [O] is sufficient for alcohol to aldehyde, not for alcohol to acid: the overall equation uses two [O].');
  note('oxidation-ketone', 'The OH-bearing carbon of a secondary alcohol has one H and two carbon neighbours.',
    'Loss of H from oxygen and from the OH-bearing carbon gives a C=O with both carbon neighbours intact. An ordinary ketone does not oxidise like an aldehyde under these conditions.',
    'Classify the carbon carrying OH, not the whole chain. A tertiary centre lacks the required C–H bond.');
  note('carbonyl-hydride', 'Identify an aldehyde or ketone; mark carbonyl carbon as partially positive.',
    'A hydride equivalent adds to carbon while the C=O pi pair moves to oxygen. Proton transfer then turns the alkoxide into an alcohol without changing the carbon count.',
    'The first intermediate is O−, not OH. A hydride equivalent is bookkeeping for transfer from a reagent, not a reservoir of free H− in water.');
  note('carbonyl-cyanide', 'An aldehyde or ketone gains one carbon and retains its oxygen as OH.',
    'Cyanide attacks through carbon. Opening the planar C=O pi bond gives an alkoxide; protonation gives a hydroxynitrile. Two faces yield enantiomers only if a new stereocentre forms in an achiral substrate.',
    'Do not break the nitrile triple bond or automatically predict optical activity: a racemic mixture has no net rotation.');
  note('halo-cyanide', 'A primary C–X is replaced by C–C≡N; count the nitrile carbon in the new chain.',
    'The carbon end of cyanide forms a bond as halide leaves. Unlike addition to a carbonyl, there is a leaving group and no alkoxide to protonate.',
    'Attaching through nitrogen gives a different connectivity. Bromoethane gives a three-carbon nitrile, not a two-carbon one.');
  note('halo-ammonia', 'Look for C–X becoming C–NH2 without inserting a carbon atom.',
    'Ammonia attacks through its lone pair and first makes an alkylammonium ion. A second base removes a proton, giving a primary amine that still has a lone pair.',
    'Do not put four bonds on neutral nitrogen. Further alkylation is possible; the primary amine need not be the only product.');
  note('halo-methylamine', 'Methylamine already has one carbon group on N; count what is added by the haloalkane.',
    'A C–N bond forms as halide departs. The cation still has N–H bonds, so a base can remove a proton to give a secondary amine.',
    'Primary or secondary here counts carbon groups on the product nitrogen, not the class of the haloalkane.');
  note('halo-dimethylamine', 'Dimethylamine has two methyl groups, one N–H and a lone pair.',
    'After N attacks the alkyl carbon, it has four bonds and charge +1. Loss of its remaining proton leaves three carbon groups on neutral nitrogen.',
    'Do not call the neutral tertiary amine a quaternary ammonium salt. The difference is the fourth bond and positive charge.');
  note('halo-trimethylamine', 'Trimethylamine has a lone pair but no N–H bond.',
    'Attack on the haloalkane gives a fourth N–C bond. With no proton on N to remove, the quaternary ammonium ion remains paired with halide.',
    'Do not deprotonate a methyl group to invent a neutral product. Show the positive charge on nitrogen.');
  note('acyl-water', 'In an acyl chloride, Cl is bonded directly to carbonyl carbon, not to saturated carbon.',
    'Water adds to C=O. The tetrahedral intermediate collapses, releasing chloride; proton transfer leaves a carboxylic acid.',
    'Do not substitute by a primary-haloalkane SN2 mechanism: show the temporary loss and reformation of C=O.');
  note('acyl-ethanol', 'Trace the ethanol oxygen: it becomes the single-bond ester oxygen.',
    'Ethanol adds at acyl carbon; C=O re-forms as chloride departs. Removing the proton from the incoming oxygen gives –C(=O)OCH2CH3.',
    'Water is not the molecular by-product of this acyl chloride reaction. Distinguish it from esterification of a carboxylic acid.');
  note('acyl-ammonia', 'Look for –C(=O)NH2 rather than an amine on a saturated carbon.',
    'Nitrogen adds at the carbonyl. Chloride leaves when C=O re-forms; another ammonia accepts a proton, giving ammonium chloride alongside the amide.',
    'Do not count the ammonia incorporated into the amide twice. A second ammonia is needed to account for the ammonium salt.');
  note('acyl-methylamine', 'Methylamine supplies both the new amide nitrogen and its methyl substituent.',
    'N adds at acyl carbon. Collapse releases chloride; proton transfer leaves –C(=O)NHCH3 and, with excess amine, methylammonium chloride.',
    'Keep the methyl group on nitrogen. It does not lengthen the carbon chain on the carbonyl side.');
  note('anhydride-water', 'Find two carbonyl groups sharing one bridging oxygen.',
    'Water adds to one acyl carbon. Re-forming that C=O breaks its bond to the bridging oxygen, releasing carboxylate. Proton transfer gives two acid molecules.',
    'A symmetrical anhydride gives two equivalents of the same acid, not one equivalent plus water.');
  note('anhydride-ethanol', 'Mark one acyl group for transfer and follow the other as the leaving group.',
    'Ethanol adds to an acyl carbon. Collapse ejects a carboxylate which can accept a proton; one ester and one acid result.',
    'Do not assign both acyl groups to ester. Unlike the acyl chloride reaction, this route does not give HCl.');
  note('anhydride-ammonia', 'Identify which fragment becomes –CONH2 and which keeps both of its oxygens.',
    'Ammonia adds at one carbonyl. Carboxylate leaves as C=O re-forms. With excess ammonia the acid coproduct can be present as ammonium carboxylate.',
    'There is no chloride to make ammonium chloride; the leaving fragment contains the second acyl group.');
  note('anhydride-methylamine', 'Look for an N-methyl amide and a separate carboxyl-derived fragment.',
    'Methylamine donates its N lone pair to one carbonyl; the other acyl fragment leaves attached to oxygen. Proton transfer neutralises the N-acyl product.',
    'Draw –CONHCH3, not –CON(CH3)2. Excess methylamine can take up acid; it does not add a second N-methyl group.');
  note('iodoform-test', 'A yellow CHI3 precipitate points to CH3C(=O)– or an alcohol oxidisable to it; ethanal and ethanol also qualify.',
    'For a methyl ketone, the methyl hydrogens are replaced by iodine before C–C cleavage. The methyl carbon becomes CHI3; the carbonyl carbon stays in the carboxylate.',
    'Not every ketone tests positive: pentan-3-one has ethyl groups on both sides of C=O. A disappearing iodine colour alone is not the positive result.');
  note('diels-alder', 'Find four consecutive carbons in C=C–C=C and a separate alkene. The diene ends must be able to approach the same partner.',
    'In a concerted [4+2] cycloaddition the two diene ends each bond to one alkene carbon. The remaining double bond lies between the inner diene carbons of the new six-membered ring.',
    'Do not keep the alkene partner’s double bond or draw a chain of isolable carbocations. Three pi bonds become two sigma bonds and one pi bond.');

  const ibReference = 'https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/chemistry/';
  const ibCore = ['hydroxide-acid','radical-chlorination','hydroxide-sn2','alkene-hbr','alkene-br2','alkene-hydration',
    'oxidation-aldehyde','oxidation-acid','oxidation-ketone','carbonyl-hydride'];
  function course(id,label,description,referenceLabel,referenceUrl,entries) {
    return {id,label,description,referenceLabel,referenceUrl,entries};
  }
  const courses = [
    course('aqa','AQA A-level Chemistry (7405)',
      'Follow alkenes and halogenoalkanes into alcohols, then compare carbonyl addition, acyl transfer and aromatic substitution. Acid neutralisation is a supporting example.',
      'AQA · Organic chemistry','https://www.aqa.org.uk/subjects/chemistry/a-level/chemistry-7405/specification/subject-content/organic-chemistry',[
        'radical-chlorination','hydroxide-sn2','halo-cyanide','halo-ammonia','haloalkane-elimination','alkene-hbr','alkene-br2','alkene-h2so4','alkene-h2so4-hydrolysis','alkene-hydration',
        'alcohol-dehydration','oxidation-aldehyde','oxidation-acid','oxidation-ketone','carbonyl-hydride','carbonyl-cyanide','hydroxide-acid',
        'acyl-water','acyl-ethanol','acyl-ammonia','acyl-methylamine','anhydride-water','anhydride-ethanol','anhydride-ammonia','anhydride-methylamine',
        'benzene-nitration','friedel-crafts-acylation','halo-methylamine','halo-dimethylamine','halo-trimethylamine']),
    course('cambridge','Cambridge International AS & A Level Chemistry (9701)',
      'Trace AS alkene additions, halogenoalkane substitutions and carbonyl tests, then extend to aromatic substitution and acyl chloride addition–elimination at A Level. Compare a positive iodoform result with simple oxidation.',
      'Cambridge International · 2025–2027 syllabus','https://www.cambridgeinternational.org/Images/664563-2025-2027-syllabus.pdf',[
        'radical-chlorination','alkene-br2','alkene-hbr','alkene-hydration','hydroxide-sn2','halo-cyanide','halo-ammonia','haloalkane-elimination','alcohol-dehydration',
        'oxidation-aldehyde','oxidation-acid','oxidation-ketone','carbonyl-hydride','carbonyl-cyanide','iodoform-test','hydroxide-acid',
        'benzene-nitration','friedel-crafts-acylation','acyl-water','acyl-ethanol','acyl-ammonia','acyl-methylamine']),
    course('edexcel','Pearson Edexcel UK A level Chemistry (9CH0)',
      'Connect halogenoalkane substitution and alcohol oxidation to carbonyl identification, then compare arene reactions and acyl derivatives. The borohydride example is omitted: 9CH0 names a different hydride reagent.',
      'Pearson · UK A level Chemistry','https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/chemistry-2015.html',[
        'radical-chlorination','alkene-br2','alkene-hbr','alkene-hydration','hydroxide-sn2','halo-ammonia','haloalkane-elimination','alcohol-dehydration',
        'oxidation-aldehyde','oxidation-acid','oxidation-ketone','carbonyl-cyanide','iodoform-test','hydroxide-acid',
        'benzene-nitration','friedel-crafts-acylation','halo-methylamine','acyl-water','acyl-ethanol','acyl-ammonia','acyl-methylamine']),
    course('ib-core','IB DP Chemistry · SL/HL core (first assessment 2025)',
      'Use electron transfer, proton transfer, radical reactions and electron-pair sharing to predict functional-group changes. For alkene addition and haloalkane substitution, read the products first; the detailed ionic mechanisms are HL enrichment here.',
      'IB · Diploma Programme Chemistry',ibReference,ibCore),
    course('ib-hl','IB DP Chemistry · HL (first assessment 2025)',
      'Includes the shared SL/HL examples. At additional higher level, trace curly arrows, compare carbocation stability in alkene addition and explain why benzene undergoes substitution rather than simple addition. The haloalkane example models SN2, not SN1.',
      'IB · Diploma Programme Chemistry',ibReference,[...ibCore,'halo-ammonia','benzene-nitration']),
    course('olympiad','Olympiad · original UKChO-style problems',
      'Work backwards from test results, trace atoms and use mole balances to distinguish competing routes. The [4+2] ring closure is an extension. Original practice, not past-paper questions or a competition syllabus.',
      'Royal Society of Chemistry · UK Chemistry Olympiad','https://edu.rsc.org/enrichment/uk-chemistry-olympiad',[
        'hydroxide-sn2','haloalkane-elimination','alkene-hydration','oxidation-acid','hydroxide-acid','oxidation-ketone','iodoform-test','carbonyl-hydride','diels-alder','alkene-br2'])
  ];
  const challenges = [
    {id:'two-beta-sites',title:'Two sites, three alkenes',input:'CC(Br)CC',entryId:'haloalkane-elimination',entries:['haloalkane-elimination'],
      prompt:'Elimination from CH3CH(Br)CH2CH3 gives 10.0 mmol of alkenes. Mark every distinct beta carbon and list the possible products, including E/Z forms. For analysis, imagine cutting every C=C and turning each cut end into C=O without changing its attached H atoms. The fragments include 3.00 mmol of methanal. Predict all other fragment amounts. Could these data give an E:Z ratio?',
      hints:['Taking H from either side of the carbon bearing Br gives different positions for C=C.','Only a terminal =CH2 gives methanal. A but-2-ene molecule gives two identical fragments.'],
      solution:['Counting along the carbon chain from the end nearest Br, the beta carbons are C1 and C3. Removing H from C1 gives but-1-ene. Removal from C3 gives but-2-ene, with E and Z forms; the terminal alkene has no E/Z pair.','Cutting but-1-ene gives HCHO and CH3CH2CHO in a 1:1 ratio. Thus 3.00 mmol but-1-ene accounts for 3.00 mmol each of methanal and propanal.','The 7.00 mmol of but-2-ene gives 14.0 mmol ethanal. E and Z give identical fragments, so their combined amount is known but their ratio is not. Counting possible products does not predict their yields.']},
    {id:'two-fates',title:'The missing bromoethane',input:'CCBr',entryId:'hydroxide-sn2',entries:['hydroxide-sn2','haloalkane-elimination','oxidation-acid','hydroxide-acid'],
      prompt:'A paper reaction network starts with 12.0 mmol CH3CH2Br. Each reacted molecule forms either ethanol by substitution or ethene by elimination. A separate analysis finds 9.00 mmol Br− released. All the ethanol is then oxidised to ethanoic acid, which alone neutralises 5.00 mmol OH−. How much ethanol and ethene formed? How much starting material remains, and why could bromide alone not give that split?',
      hints:['Write one bromide balance covering both branches.','One mole of ethanol becomes one mole of monoprotic acid. The OH− figure comes from a separate acid assay, not the first reaction.'],
      solution:['Both branches release one Br− per reacted molecule. If x and y are substitution and elimination amounts in mmol, x + y = 9.00.','The acid assay counts only the substitution branch: CH3CH2OH → CH3COOH, and one OH− neutralises one acid. Thus x = 5.00 mmol ethanol and y = 4.00 mmol ethene.','12.0 − 9.00 = 3.0 mmol CH3CH2Br remains. Bromide measures total conversion; it cannot distinguish attack at carbon from removal of a beta H.']},
    {id:'two-pentanols',title:'Which methyl group went missing?',input:'CC(O)CCC',entryId:'oxidation-ketone',entries:['oxidation-ketone','iodoform-test'],
      prompt:'A 10.0 mmol mixture contains only CH3CH(OH)CH2CH2CH3 and CH3CH2CH(OH)CH2CH3. Both are oxidised quantitatively to ketones; a subsequent ideal iodoform test gives 1.575 g CHI3 (molar mass 393.7 g mol−1). One positive ketone molecule gives one CHI3. Find the mole percentage of each alcohol and identify the carboxylate left by the positive ketone.',
      hints:['Write the two ketones without moving any carbon atoms. Which has a methyl carbon bonded directly to C=O?','Mark the carbon that becomes CHI3. The carbonyl carbon stays in the ionic fragment.'],
      solution:['Pentan-2-ol gives CH3COCH2CH2CH3, a methyl ketone. Pentan-3-ol gives CH3CH2COCH2CH3: its terminal methyl groups are not beside C=O.','1.575 / 393.7 = 0.00400 mol CHI3, counting 4.00 mmol pentan-2-ol. The mixture is 40.0 mol% pentan-2-ol and 60.0 mol% pentan-3-ol.','The methyl directly beside C=O leaves as CHI3. The remaining four carbons give CH3CH2CH2COO−, butanoate, not propanoate.']},
    {id:'isotope-fork',title:'A bromide identified by two cuts',input:'CC(C)C(Br)CC',entryId:'haloalkane-elimination',entries:['haloalkane-elimination'],
      prompt:'An unknown acyclic monobromoalkane gives two alkene connectivities, A and B, by direct elimination without rearrangement. Reductive cleavage splits each C=C into two C=O groups: A gives propanone + propanal; B gives ethanal + 2-methylpropanal. Deduce the parent and both alkene structures. Which have E/Z forms? A accounts for 60% and B for 40% of the initial product flux. Now replace just the beta methine H (the H on a carbon with three carbon neighbours) by D. At matched concentrations the total initial rate is 0.55 times the original, and the absolute B flux is unchanged. Assuming these are the only competing paths, find the site-specific rate ratio kH/kD for A and its new share of the flux. Explore the unlabelled structure after solving; the isotope and cleavage data are a paper exercise, not simulator predictions.',
      hints:['For each pair, erase the two oxygens and join their carbonyl carbons by C=C. Superimpose the recovered carbon skeletons.','The carbon bearing Br in the parent belongs to both possible double bonds. Only one beta site loses deuterium to make its alkene.','Normalise the original total rate to 1.00. The unchanged B flux is 0.40 of that original rate, not 40% of the new total.'],
      solution:['Joining the cuts gives A = (CH3)2C=CHCH2CH3 (2-methylpent-2-ene) and B = (CH3)2CHCH=CHCH3 (4-methylpent-2-ene). The shared alkene carbon must have carried Br: the parent is (CH3)2CHCH(Br)CH2CH3, 3-bromo-2-methylpentane. Its absolute configuration is not identified.','A has two methyl groups on one alkene carbon, so has no E/Z forms. Both carbons in B have two unlike substituents, giving E and Z. Either yields the same cleavage pair: there is no E:Z ratio in these data.','A removes H (or D) from the methine; B removes H from the neighbouring methylene instead. With the original total flux set to 1.00, A falls from 0.60 to 0.55 − 0.40 = 0.15. At matched concentrations the site-specific kH/kD = 0.60 / 0.15 = 4. The overall rate ratio 1 / 0.55 is not the isotope effect for that site.','A now supplies 100 × 0.15 / 0.55 = 27.3% of the initial flux. This uses initial rates, complete labelling at that one site, parallel paths without product interconversion, and the stated unchanged flux through B. It is not a prediction of final isolated yields.']},
    {id:'ring-ledger',title:'Where did the third double bond go?',input:'C=CC=C',entryId:'diels-alder',entries:['diels-alder'],
      prompt:'Label the carbons of CH2=CH–CH=CH2 as 1–4 and those of ethene as a and b. These molecules form a single six-membered ring by a [4+2] addition. Give the new bonds and remaining double bond. A 5.40 g sample of diene reacts with 2.24 g ethene; 4.92 g of the ring product is isolated. Find the limiting reagent and percentage yield. Use molar masses 54.0, 28.0 and 82.0 g mol−1 respectively.',
      hints:['Join the ends of the four-carbon chain to the two different ethene carbons. The ethene carbons remain bonded to each other.','The stoichiometry is 1:1. Only the limiting partner sets the theoretical mass.'],
      solution:['One valid labelling gives new bonds 1–a and 4–b (interchanging a and b is equivalent). The 2–3 bond becomes double; 1–2, 3–4 and a–b become single. The product is cyclohexene, C6H10.','Three pi bonds become one pi bond and two new sigma bonds. No atoms are lost: forming the ring accounts for one degree of unsaturation and the remaining C=C for the other.','Diene: 5.40 / 54.0 = 0.100 mol; ethene: 2.24 / 28.0 = 0.0800 mol, limiting. The theoretical product mass is 0.0800 × 82.0 = 6.56 g. The isolated yield is 100 × 4.92 / 6.56 = 75.0%.']}
  ];
  const api = {
    courses, challenges,
    scope:'Independent selections for exploration and revision; not endorsed by an exam board and not a complete syllabus. A linked example may show more mechanism detail than a course requires.',
    includes:(courseId,entryId) => courses.find(c => c.id === courseId)?.entries.includes(entryId) ?? false,
    lesson:entryId => notes.get(entryId) ?? null
  };
  root.ReactionGuide = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
