/* Local electron-flow templates. Never derive a mechanism from a name or formula. */
(function (root) {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const ink = 'var(--ink, #172b3a)', flow = 'var(--accent, #146c67)';
  const layers = new WeakMap(), templates = new Map();

  function node(parent, name, attrs, text) {
    const el = parent.ownerDocument.createElementNS(ns, name);
    for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
    if (text !== undefined) el.textContent = text;
    parent.appendChild(el);
    return el;
  }
  function pen(g) {
    const label = (x,y,text,anchor='middle') => {
      const el = node(g,'text',{x,y:y+7,'text-anchor':anchor});
      // Use ordinary glyphs at shifted baselines: not every UI font has ionic superscripts.
      const scripts = {'₂':['2',4],'₃':['3',4],'⁺':['+',-8],'⁻':['−',-8]};
      let baseline = 0;
      for (const part of text.match(/[₂₃⁺⁻]|[^₂₃⁺⁻]+/g)) {
        const [str,offset] = scripts[part] || [part,0];
        node(el,'tspan',{'font-size':offset ? 14 : 20,dy:offset-baseline},str);
        baseline = offset;
      }
    };
    const bond = (x1,y1,x2,y2) => node(g,'line',{x1,y1,x2,y2,stroke:ink,'stroke-width':2});
    const dot = (cx,cy) => node(g,'circle',{cx,cy,r:2.3,fill:flow});
    const pair = (x,y) => { dot(x-3,y); dot(x+3,y); };
    const note = text => node(g,'text',{x:180,y:170,'text-anchor':'middle','font-family':'var(--sans, sans-serif)','font-size':13},text);
    // Open single barb for a single electron; closed triangular head for a pair.
    function arrow(x,y,cx,cy,ex,ey,fish=false) {
      const len = Math.hypot(ex-cx,ey-cy), ux = (ex-cx)/len, uy = (ey-cy)/len;
      const backX = ex-9*ux, backY = ey-9*uy;
      const wing = sign => `${backX-sign*4*uy},${backY+sign*4*ux}`;
      const group = node(g,'g',{'data-electrons':fish ? 1 : 2,stroke:flow,'stroke-width':2.3,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'});
      node(group,'path',{class:'rx-arrow-shaft',pathLength:1,d:`M${x},${y} Q${cx},${cy} ${ex},${ey}`});
      if (fish) node(group,'path',{class:'rx-arrow-tip',d:`M${ex},${ey} L${wing(1)}`});
      else node(group,'polygon',{class:'rx-arrow-tip',points:`${ex},${ey} ${wing(1)} ${wing(-1)}`,fill:flow,stroke:'none'});
    }
    return {label,bond,dot,pair,note,arrow};
  }

  function donor(d,kind,x,y) {
    // Keep the donating atom at x even when its label includes attached groups.
    const atom = {ammonia:'NH₃',methylamine:'NH₂',dimethylamine:'NH',trimethylamine:'N',water:'OH₂',ethanol:'OH',cyanide:'C⁻',carboxylate:'O⁻'}[kind];
    d.label(x-7,y,atom,'start');
    if (kind === 'cyanide') {
      d.label(x-50,y,'N');
      for (const off of [-4,0,4]) d.bond(x-39,y+off,x-12,y+off);
    } else if (['dimethylamine','trimethylamine'].includes(kind)) {
      d.label(x-34,y,'Me','end');d.bond(x-30,y,x-10,y);d.bond(x,y+13,x,y+28);d.label(x,y+41,'Me');
      if(kind==='trimethylamine'){d.bond(x+12,y,x+27,y);d.label(x+33,y,'Me','start');}
    } else if (['ethanol','methylamine','carboxylate'].includes(kind)) {
      d.label(x-30,y,{ethanol:'Et',methylamine:'Me',carboxylate:'RC(=O)'}[kind],'end');
      d.bond(x-27,y,x-11,y);
    }
    d.pair(x,y-16);
  }
  function protonateAlkene(d,acid) {
    d.label(62,105,'C'); d.label(142,105,'C');
    d.bond(75,101,130,101); d.bond(75,109,130,109);
    d.label(218,70,'H'); d.label(279,70,acid,'start'); d.bond(230,70,274,70);
    if (acid === 'Br') { d.label(218,99,'δ+'); d.label(291,99,'δ−'); }
    d.arrow(100,101,122,36,206,65); d.arrow(254,70,256,26,284,53);
    d.note('Alkene centre · other substituents omitted');
  }
  function capture(d,base) {
    if (base === 'water') donor(d,base,98,90);
    else {
      d.label(91,90,base === 'bromide' ? 'Br⁻' : 'O⁻','start'); d.pair(98,74);
      if (base === 'hydrogensulfate') { d.bond(96,103,82,119); d.label(80,129,'SO₃H'); }
    }
    d.label(246,90,'C⁺'); d.arrow(98,71,164,10,235,75);
    d.note('Carbocation capture · other substituents omitted');
  }
  function brominate(d,opening) {
    if (opening) {
      d.label(132,99,'C'); d.label(226,99,'C'); d.label(179,37,'Br⁺');
      d.bond(145,99,213,99); d.bond(138,85,167,48); d.bond(217,85,190,49);
      d.label(80,140,'Br⁻'); d.pair(76,124);
      d.arrow(76,121,73,86,119,98); d.arrow(153,66,132,30,159,34);
      d.note('Backside attack opens the bridge · anti addition');
    } else {
      d.label(128,119,'C'); d.label(234,119,'C');
      d.bond(141,115,221,115); d.bond(141,123,221,123);
      d.label(176,70,'Br'); d.pair(157,70); d.label(266,31,'Br'); d.bond(192,63,250,38);
      d.label(171,39,'δ+'); d.label(294,35,'δ−');
      d.arrow(181,115,222,100,194,76); d.arrow(154,70,114,66,126,104);
      d.arrow(221,50.5,220,14,250,27);
      d.note('Induced dipole · the nearer Br bridges both carbons');
    }
  }
  function eliminate(d,mode) {
    const halide = mode === 'halo', cation = mode === 'cation';
    d.label(47,76,halide ? 'HO⁻' : 'H₂O'); d.pair(halide ? 51 : 57,60);
    d.label(136,54,'H'); d.label(152,102,'C'); d.label(241,102,cation ? 'C⁺' : 'C');
    d.bond(140,68,148,87); d.bond(165,102,226,102);
    d.arrow(halide ? 51 : 57,57,85,16,124,48); d.arrow(144,78,178,44,194,102);
    if (!cation) {
      d.label(250,147,halide ? 'X' : 'O⁺H₂','start'); d.bond(245,116,252,133);
      d.arrow(249,124,281,110,262,135);
    }
    d.note(halide ? 'X = halogen · anti-periplanar H and X' : cation ? 'Water removes a β proton from the carbocation' : 'Water leaves as the π bond forms · concerted');
  }
  function loseWater(d) {
    d.label(115,98,'C'); d.bond(127,98,229,98); d.label(234,98,'O⁺H₂','start');
    d.arrow(179,98,192,33,238,81); d.note('C–O bond electrons leave with water');
  }
  function carbonyl(d,kind,leaving) {
    const x = 205;
    d.label(x,99,'C'); d.label(x,34,'O');
    d.bond(x-3,82,x-3,49); d.bond(x+3,82,x+3,49);
    d.arrow(x+3,64,245,55,x+13,37);
    if (kind === 'hydride') {
      // AQA uses the H− equivalent; this is not a claim of free hydride in solution.
      d.label(91,99,'H⁻'); d.pair(87,83); d.arrow(87,80,130,28,193,87);
    } else {
      donor(d,kind,91,99); d.arrow(91,80,130,28,193,87);
    }
    if (leaving) {
      d.bond(217,104,249,121); d.label(254,126,leaving,'start');
    }
    d.note(kind === 'hydride' ? 'H− = hydride equivalent from borohydride' : 'Carbonyl centre · other substituents omitted');
  }
  function collapse(d,kind,leaving) {
    d.label(164,94,'C'); d.label(164,33,'O⁻'); d.bond(164,49,164,78);
    d.pair(148,39); d.arrow(145,40,121,59,163,68);
    d.bond(177,94,247,94); d.label(252,94,leaving,'start');
    d.arrow(212,94,226,43,254,79);
    d.bond(155,107,135,128);
    d.label(134,136,{water:'H₂O⁺',ethanol:'Et(H)O⁺',ammonia:'H₃N⁺',methylamine:'Me(H)₂N⁺'}[kind],'end');
    d.note('Tetrahedral intermediate · other groups omitted');
  }
  function sn2(d,kind) {
    donor(d,kind,86,95); d.label(198,95,'C'); d.label(290,95,'X'); d.bond(211,95,278,95);
    d.arrow(86,76,129,26,186,83); d.arrow(243,95,265,44,287,80);
    d.note('X = halogen · other substituents omitted');
  }
  // B: takes H while the bonding pair returns to the original donor atom.
  function transfer(d,base,acid,tail) {
    if (base === 'alkoxide' || base === 'alcohol') {
      d.label(49,97,'C'); d.bond(61,97,90,97); d.label(95,97,base === 'alkoxide' ? 'O⁻' : 'OH','start'); d.pair(102,81);
    } else donor(d,base,102,97);
    d.label(190,97,'H'); d.bond(202,97,247,97); d.label(252,97,acid,'start');
    if (tail === 'nitrile') {
      for (const off of [-4,0,4]) d.bond(270,97+off,299,97+off);
      d.label(312,97,'N');
    } else if (tail === 'alkyl') {
      d.bond(258,111,258,126); d.label(258,142,'R');
    }
    d.arrow(102,78,144,31,180,83); d.arrow(225,97,236,47,256,81);
    d.note('Proton transfer · other groups omitted');
  }

  function nitronium(d,loss) {
    // Nitric acid contributor: N+ has one double bond and an anionic oxygen.
    d.label(120,85,'N⁺');d.label(120,30,'O');d.label(47,85,'O⁻');
    d.bond(116,45,116,68);d.bond(123,45,123,68);d.bond(66,85,105,85);
    d.bond(138,85,170,85);d.label(180,85,loss?'OH₂⁺':'OH','start');
    if(loss){d.pair(53,67);d.arrow(53,65,77,36,84,83);d.arrow(154,85,162,43,183,69);}
    else{d.pair(186,69);d.label(244,54,'H');d.bond(255,54,278,54);d.label(284,54,'OSO₃H','start');d.arrow(186,68,198,22,233,48);d.arrow(266,54,275,18,290,38);}
    d.note(loss?'Water departs as the second N=O bond forms':'Protonate the hydroxyl oxygen');
  }
  function acylium(d) {
    d.label(52,95,'Me');d.bond(72,95,103,95);d.label(116,95,'C');d.label(116,39,'O');
    d.bond(112,55,112,80);d.bond(119,55,119,80);d.bond(128,95,172,95);
    d.label(186,95,'Cl');d.pair(188,78);d.label(283,95,'AlCl₃');
    d.arrow(188,76,220,38,264,80);d.arrow(150,95,165,136,181,111);
    d.note('Lewis acid coordination and C–Cl cleavage · combined');
  }
  register('benzene-nitration',0,'Generate the electrophile: protonation',d=>nitronium(d,false));
  register('benzene-nitration',1,'Generate the nitronium ion',d=>nitronium(d,true));
  register('friedel-crafts-acylation',0,'Generate the acylium ion',acylium);

  const hex = [[160,45],[202,69],[202,117],[160,141],[118,117],[118,69]];
  function arene(d,nitro,restore) {
    const pi = [[160,53,195,73],[195,112,160,133],[125,112,125,74]];
    hex.forEach(([x,y],i) => d.bond(x,y,...hex[(i+1)%6]));
    for (const coords of pi.slice(restore ? 1 : 0)) d.bond(...coords);
    if (!restore) {
      if (nitro) {
        d.label(282,76,'N⁺'); d.label(282,26,'O'); d.label(282,129,'O');
        for (const x of [279,285]) { d.bond(x,41,x,61); d.bond(x,91,x,114); }
        d.arrow(285,51,316,40,296,27);
      } else {
        d.label(282,76,'C⁺'); d.label(282,26,'O'); d.label(337,76,'Me');
        for (const x of [279,285]) d.bond(x,41,x,61);
        d.bond(301,76,318,76);
      }
      d.arrow(177,63,212,19,268,66);
    } else {
      // One Kekule contributor: the adjacent cation is neutralised by the C-H pair.
      d.label(160,30,'+'); d.label(228,29,'H'); d.bond(202,69,221,42);
      d.bond(202,69,230,84); d.label(235,88,nitro ? 'NO₂' : 'C(=O)Me','start');
      if (nitro) {
        d.label(309,31,'⁻OSO₃H'); d.pair(286,46); d.arrow(284,47,253,65,239,35);
      } else {
        d.label(264,25,'Cl'); d.bond(279,25,294,25); d.label(298,25,'AlCl₃⁻','start');
        d.arrow(287,25,266,63,238,36);
      }
      d.arrow(211,56,194,22,182,56);
    }
    d.note(restore ? 'σ complex · one resonance contributor shown' : 'Ring π electrons form a bond to the electrophile');
  }
  function radical(d,i) {
    const hook = (...coords) => d.arrow(...coords,true);
    if (i === 0) {
      d.label(110,98,'Cl'); d.label(250,98,'Cl'); d.bond(128,98,232,98);
      hook(177,98,152,39,117,81); hook(183,98,207,39,243,81);
    } else if (i === 3) {
      d.label(110,98,'Cl'); d.dot(130,98); d.dot(230,98); d.label(250,98,'Cl');
      hook(132,96,156,55,177,96); hook(228,96,204,55,183,96);
    } else {
      // Two electrons meet in the forming bond; the third stays with the departing radical.
      d.label(65,98,i === 1 ? 'Cl' : 'C'); d.dot(84,98);
      d.label(183,98,i === 1 ? 'H' : 'Cl'); d.label(300,98,i === 1 ? 'C' : 'Cl');
      d.bond(201,98,282,98);
      hook(86,95,101,58,123,95); hook(238,98,195,17,129,95); hook(244,98,268,53,291,82);
    }
    d.note(i === 3 ? 'One termination example · single electrons' : 'Single-barbed arrows · one electron each');
  }

  function register(id,index,title,paint) {
    if (!templates.has(id)) templates.set(id,new Map());
    const byIndex = templates.get(id);
    if (!byIndex.has(index)) byIndex.set(index,new Map());
    byIndex.get(index).set(title,paint);
  }
  register('alkene-br2',0,'Form the bromonium ion',d => brominate(d,false));
  register('alkene-br2',1,'Open the bridge',d => brominate(d,true));
  for (const [id,acid,base,title] of [
    ['alkene-hbr','Br','bromide','Capture by bromide'],
    ['alkene-h2so4','OSO₃H','hydrogensulfate','Capture by hydrogensulfate'],
    ['alkene-h2so4-hydrolysis','OSO₃H','hydrogensulfate','Capture by hydrogensulfate'],
    ['alkene-hydration','O⁺H₂','water','Add water']
  ]) {
    register(id,0,'Protonate the alkene',d => protonateAlkene(d,acid));
    register(id,1,title,d => capture(d,base));
  }
  // Sulfate ester hydrolysis is a net equation and has no elementary template.
  register('alkene-hydration',2,'Regenerate the acid',d => transfer(d,'water','O⁺H','alkyl'));
  register('haloalkane-elimination',0,'Concerted elimination (E2)',d => eliminate(d,'halo'));
  const dehydration = 'alcohol-dehydration';
  register(dehydration,0,'Activate the hydroxyl group',d => transfer(d,'alcohol','O⁺H₂'));
  register(dehydration,1,'Lose water and form the alkene',d => eliminate(d,'alcohol'));
  register(dehydration,1,'Lose water',loseWater);
  register(dehydration,2,'Form the alkene',d => eliminate(d,'cation'));
  for (const kind of ['hydride','cyanide']) {
    const id = 'carbonyl-'+kind;
    register(id,0,'Attack the carbonyl carbon',d => carbonyl(d,kind));
    register(id,1,'Protonate the alkoxide',d => kind === 'hydride' ? transfer(d,'alkoxide','OH') : transfer(d,'alkoxide','C','nitrile'));
  }
  for (const kind of ['cyanide','ammonia','methylamine','dimethylamine','trimethylamine']) {
    register('halo-'+kind,0,'Concerted substitution (SN2)',d => sn2(d,kind));
    if (!['cyanide','trimethylamine'].includes(kind)) register('halo-'+kind,1,'Proton transfer',d => transfer(d,kind,'N⁺'));
  }
  for (const family of ['acyl','anhydride']) for (const kind of ['water','ethanol','ammonia','methylamine']) {
    const id = family+'-'+kind, leaving = family === 'acyl' ? 'Cl' : 'OC(=O)R';
    register(id,0,'Nucleophilic addition',d => carbonyl(d,kind,leaving));
    register(id,1,'Elimination',d => collapse(d,kind,leaving));
    register(id,2,'Proton transfer',d => transfer(d,family === 'acyl' ? kind : 'carboxylate',
      ['water','ethanol'].includes(kind) ? 'O⁺' : 'N⁺'));
  }
  for (const [id,nitro,start] of [['benzene-nitration',true,2],['friedel-crafts-acylation',false,1]]) {
    register(id,start,'Electrophilic attack: sigma complex',d => arene(d,nitro,false));
    register(id,start+1,'Deprotonation: restore aromaticity',d => arene(d,nitro,true));
  }
  ['Initiation: homolysis','Propagation: hydrogen abstraction','Propagation: chlorine transfer','Termination: radical combination']
    .forEach((title,i) => register('radical-chlorination',i,title,d => radical(d,i)));

  function draw(svg,entry,stage,stepIndex) {
    const old = layers.get(svg);
    if (old && old.parentNode === svg) svg.removeChild(old);
    layers.delete(svg);
    const paint = templates.get(entry?.id)?.get(stepIndex)?.get(stage?.title);
    if (!svg || !paint) return false;
    const g = node(svg,'g',{'font-family':'var(--mono, monospace)','font-size':20,fill:ink,stroke:'none',direction:'ltr',
      'data-reaction-motif':entry.id,role:'img','aria-label':'Reactive centre schematic: '+stage.title+'. '+stage.detail});
    layers.set(svg,g);
    node(g,'title',{},stage.title+' · reactive centre schematic');
    paint(pen(g));
    svg.setAttribute('viewBox','0 0 360 184');
    return true;
  }
  const api = {draw};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReactionMotifs = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
