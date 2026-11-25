/* Learner-facing stereo controls. All chemical assignments and coordinates come from ChemistryClient. */
(function () {
  'use strict';
  const root = document.getElementById('stereo-explorer');
  if (!root || window.StereoExplorer) return;
  const I = window.AtlasI18n;
  const tr = (key, fallback, params = {}) => I ? I.t(key, params, fallback) : fallback.replace(/\{(\w+)\}/g, (s, k) => params[k] ?? s);
  const ui = (element, value) => { const read = () => { let result=value; while(typeof result==='function')result=result(); return result; }; if (I) I.bindText(element, 'common.value', { value: read }); else element.textContent = read(); return element; };
  const attr = (element, name, value) => { const read = () => { let result=value; while(typeof result==='function')result=result(); return result; }; if (I) I.bindAttr(element, name, 'common.value', { value: read }); else element.setAttribute(name, read()); };
  const diagnosticKeys=new Map(Object.entries(window.AtlasLocales?.en||{}).filter(([key])=>/^(stereo|builder|projection|import|grid)\./.test(key)).map(([key,value])=>[value,key]));
  const detail=text=>{if(!text)return '';const key=diagnosticKeys.get(text);return key?tr(key,text):tr('common.original','{detail}',{detail:text});};
  const app = window.BondAtlas;
  const client = window.ChemistryClient;
  const lanes = new Map();
  const examples = {
    lactic: [()=>tr("stereo.exampleLactic",'Lactic acid · unspecified center'), 'CC(O)C(=O)O'],
    butene: [()=>tr("stereo.exampleButene",'But-2-ene · E/Z possibilities'), 'CC=CC'],
    cis: [()=>tr('stereo.cisButene','cis-But-2-ene (Z)'), 'C/C=C\\C'],
    trans: [()=>tr('stereo.transButene','trans-But-2-ene (E)'), 'C/C=C/C'],
    substituted: [()=>tr('stereo.priorityAlkene','Four different substituents · use E/Z'), 'F/C(Cl)=C(/Br)I'],
    diol: [()=>tr("stereo.exampleDiol",'Butane-2,3-diol · including meso possibilities'), 'CC(O)C(O)C'],
    chiral: [()=>tr("stereo.exampleChiral",'Assigned lactic acid · chiral input'), 'C[C@H](O)C(=O)O']
  };
  let available = false, internalLoad = false, generation = 0;
  let variants = [], current = app?.state?.selected || null, sourceRecord = null;
  let compared = [], projection = null, projectionContext = '', relation = '';
  let lastResult = null;
  const byId = id => document.getElementById('stereo-' + id);
  const node = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if(tag==='code')n.dir='ltr';
    if (text !== undefined) ui(n,()=>text);
    return n;
  };
  root.setAttribute('aria-labelledby', 'stereo-title');
  // This template contains only fixed UI text; backend SVG is always displayed in an image.
  root.innerHTML = `
    <header class="stereo-heading">
      <div><p class="stereo-eyebrow" data-i18n="stereo.eyebrow">Same connections, different arrangements</p>
      <h2 id="stereo-title" data-i18n="stereo.title">Possible stereoisomers</h2>
      <p class="stereo-intro" data-i18n="stereo.intro">Stereoisomers differ in spatial arrangement. Conformers are different shapes of the same stereoisomer, usually reached by rotating single bonds.</p></div>
      <span class="stereo-service" id="stereo-service" role="status" data-i18n="stereo.connecting">Connecting to chemistry service…</span>
    </header>
    <form id="stereo-form" class="stereo-entry">
      <h3 class="stereo-step-heading"><span class="stereo-step">1</span> <span data-i18n="stereo.chooseStructure">Choose a structure</span></h3>
      <div class="stereo-source-tools">
        <label class="stereo-field"><span data-i18n="stereo.loadExample">Load an example</span><select id="stereo-example"><option value="" data-i18n="stereo.chooseExample">Choose an example…</option></select></label>
        <button type="button" class="stereo-button" id="stereo-use-current" data-i18n="stereo.useSelected">Use selected structure</button>
        <p class="stereo-muted" id="stereo-current-name"></p>
      </div>
      <div class="stereo-input-row">
        <label class="stereo-field stereo-grow" for="stereo-input"><span id="stereo-input-label" data-i18n="stereo.input">Structure input</span><textarea id="stereo-input" rows="2" spellcheck="false" data-i18n-placeholder="stereo.placeholder" placeholder="Enter SMILES, including @, @@, / or \\ when assigned" aria-describedby="stereo-input-help"></textarea></label>
        <label class="stereo-field"><span data-i18n="stereo.format">Format</span><select id="stereo-format"><option value="smiles">SMILES</option><option value="molblock" data-i18n="stereo.molblock">Mol block</option></select></label>
      </div>
      <p class="stereo-muted" id="stereo-input-help" data-i18n="stereo.inputHelp">Use the selected structure to retain its assigned stereochemistry and atom identities. Editing the text uses the new input instead.</p>
      <div class="stereo-generate-row">
        <label class="stereo-check"><input id="stereo-all" type="checkbox"><span data-i18n="stereo.enumerateAll">Enumerate all, including already assigned centers and double bonds</span></label>
        <label class="stereo-field stereo-limit"><span data-i18n="stereo.requestLimit">Request up to</span><input id="stereo-limit" type="number" min="1" max="1024" step="1" value="64" required></label>
        <button class="stereo-button stereo-primary" id="stereo-generate" data-server type="submit" disabled data-i18n="stereo.generate">Generate possible stereoisomers</button>
      </div>
      <p class="stereo-muted" data-i18n="stereo.defaultHelp">By default, assigned stereochemistry is preserved; only unassigned possibilities are explored. The request limit and backend support still apply.</p>
    </form>
    <div class="stereo-job-row"><p id="stereo-status" role="status" aria-live="polite"></p><button id="stereo-cancel" class="stereo-button" type="button" hidden data-i18n="stereo.cancel">Cancel calculations</button></div>
    <p id="stereo-error" class="stereo-error" role="alert" hidden></p>
    <div id="stereo-empty" class="stereo-empty"><h3 data-i18n="stereo.emptyTitle">One structure. Explore its spatial possibilities.</h3><p data-i18n="stereo.emptyHelp">Start with an example, your own chiral SMILES, or the workspace selection. Generate variants, compare their R/S and E/Z assignments, then choose a conformer for a closer look.</p><p class="stereo-muted" data-i18n="stereo.unspecifiedHelp">Unspecified is not the same as achiral. The chemistry service determines which supported assignments are possible, including symmetry-equivalent and meso cases.</p></div>
    <section id="stereo-results" class="stereo-results" aria-labelledby="stereo-results-title" hidden>
      <div class="stereo-section-heading"><h3 id="stereo-results-title" class="stereo-step-heading"><span class="stereo-step">2</span> <span data-i18n="stereo.compareTitle">Compare stereoisomers</span></h3><p id="stereo-summary" class="stereo-muted"></p></div>
      <ul id="stereo-warnings" class="stereo-warnings" hidden></ul>
      <p class="stereo-muted" data-i18n="stereo.compareHelp">Select a variant for the main viewer. Check up to two to compare their assignments side by side. Atom numbers follow the input structure, not IUPAC locants.</p>
      <p class="stereo-muted" data-i18n="stereo.skeletalKey">Read the higher-priority group at each end of C=C: same side is Z; opposite sides is E. A crossed double bond means the configuration is unspecified; it does not imply a mixture.</p>
      <div id="stereo-variants" class="stereo-variants"></div>
      <section class="stereo-comparison" id="stereo-comparison" data-i18n-aria-label="stereo.compareTitle" aria-label="Compare stereoisomers" hidden><h3 data-i18n="stereo.compareTitle">Compare stereoisomers</h3><div id="stereo-compare-panels" class="stereo-compare-panels"></div><p class="stereo-muted" id="stereo-relationship" role="status"></p><button type="button" class="stereo-button" id="stereo-together" data-i18n="stereo.showPair">Show pair together in 3D</button><p class="stereo-muted" data-i18n="stereo.pairHelp">The main viewer’s Together control can return to the full set. A comparison does not imply an energy ranking.</p></section>
    </section>
    <section id="stereo-detail" class="stereo-detail" aria-labelledby="stereo-detail-title" hidden>
      <div class="stereo-section-heading"><h3 id="stereo-detail-title" class="stereo-step-heading"><span class="stereo-step">3</span> <span data-i18n="stereo.chooseConformer">Choose a conformer</span></h3><p id="stereo-detail-label" class="stereo-descriptors"></p></div>
      <div class="stereo-detail-grid">
        <section class="stereo-subpanel" aria-labelledby="stereo-conformer-title"><h4 id="stereo-conformer-title" data-i18n="stereo.shapes">Same stereoisomer, different shapes</h4>
          <p class="stereo-muted" data-i18n="stereo.energyHelp">Conformer sampling is not an exhaustive search. Relative energies compare the returned conformers for this stereoisomer and method, not different stereoisomers.</p>
          <label class="stereo-field"><span data-i18n="stereo.conformer">Conformer</span><select id="stereo-conformer" disabled></select></label>
          <p id="stereo-energy" class="stereo-muted"></p>
          <div class="stereo-inline"><label class="stereo-field stereo-small-field"><span data-i18n="stereo.requested">Requested</span><input id="stereo-num-confs" type="number" min="1" max="100" step="1" value="12"></label><label class="stereo-field stereo-small-field"><span data-i18n="stereo.seed">Seed</span><input id="stereo-seed" type="number" min="0" max="2147483647" step="1" value="42"></label><button type="button" class="stereo-button" data-server id="stereo-make-conformers" disabled data-i18n="stereo.generateConformers">Generate conformers</button></div>
          <p id="stereo-conformer-summary" class="stereo-muted"></p>
        </section>
        <details class="stereo-projection-disclosure"><summary id="stereo-projection-title" data-i18n="stereo.projections">Explore geometry-linked projections</summary><section class="stereo-subpanel" aria-labelledby="stereo-projection-title">
          <p class="stereo-muted" data-i18n="stereo.projectionHelp">These projections use the backend’s assigned structure and selected conformer, not the unassigned textbook schematics in other views.</p>
          <div class="stereo-inline"><label class="stereo-field"><span data-i18n="stereo.projection">Projection</span><select id="stereo-projection-type"><option value="newman">Newman</option><option value="fischer">Fischer</option></select></label><label class="stereo-field stereo-grow" id="stereo-bond-field"><span data-i18n="stereo.lookBond">Look down bond</span><select id="stereo-bond"></select></label><label class="stereo-field stereo-grow" id="stereo-center-field" hidden><span data-i18n="stereo.assignedCenter">Assigned center</span><select id="stereo-center"></select></label></div>
          <div class="stereo-inline"><label class="stereo-check" id="stereo-reverse-field"><input type="checkbox" id="stereo-reverse"><span data-i18n="stereo.reverse">Reverse viewing direction</span></label><button class="stereo-button" type="button" data-server id="stereo-project" disabled data-i18n="stereo.showProjection">Show linked projection</button></div>
          <div id="stereo-projection-image" class="stereo-projection-image" hidden></div><p id="stereo-projection-note" class="stereo-muted" data-i18n="stereo.projectionPrompt">Choose a projection and request it from the chemistry service.</p>
          <div id="stereo-torsion-controls" hidden><label class="stereo-field"><span data-i18n="stereo.dihedral">Dihedral (degrees)</span><input id="stereo-dihedral" type="number" min="-180" max="180" step="5" value="60"></label><p id="stereo-torsion-atoms" class="stereo-muted"></p><button type="button" class="stereo-button" data-server id="stereo-apply-torsion" disabled data-i18n="stereo.applyDihedral">Apply dihedral to conformer</button><p class="stereo-muted" data-i18n="stereo.dihedralHelp">Applies a coordinate change through the backend; no minimization or energy ranking is implied.</p></div>
        </section></details>
      </div>
    </section>`;
  byId('input').dir='ltr';
  I?.apply(root);

  function error(message) {
    ui(byId('error'),message || '');
    byId('error').hidden = !(typeof message==='function'?message():message);
  }
  function status(message) { ui(byId('status'),message || ''); }
  function busy(lane) { return lanes.has(lane); }
  function updateControls() {
    root.querySelectorAll('[data-server]').forEach(b => { b.disabled = !available; });
    byId('generate').disabled = !available || busy('enumerate');
    const unspecified=[...(current?.stereo?.centers||[]),...(current?.stereo?.bonds||[])].some(item=>!item.specified);
    byId('make-conformers').disabled = !available || !current || unspecified || !!current?.stereo?.unsupported?.length || busy('conformers');
    byId('project').disabled = !available || !current || busy('projection') || busy('torsion');
    byId('apply-torsion').disabled = !available || !torsionIds() || busy('torsion');
    byId('conformer').disabled = !current?.conformers?.length || busy('conformers') || busy('torsion');
    byId('cancel').hidden = !lanes.size;
    root.setAttribute('aria-busy', String(!!lanes.size));
    byId('use-current').disabled = !app?.state?.selected;
    byId('together').disabled = compared.length !== 2 || !app?.setTogether;
  }
  function abortLane(name) {
    const task = lanes.get(name);
    if (task) { task.controller.abort(); lanes.delete(name); }
  }
  function cancelAll(announce) {
    generation++;
    [...lanes.keys()].forEach(abortLane);
    if (announce) status(()=>(tr("stereo.cancelled",'Calculations cancelled. Previous results have been kept.')));
    updateControls();
  }
  function cancelDetails() {
    ['conformers', 'projection', 'torsion'].forEach(abortLane);
  }
  async function run(name, label, work, commit) {
    if (!available || !client?.job || client.available === false) {
      if (client?.available === false) availability(null);
      error(()=>(tr("stereo.unavailable",'The chemistry service is unavailable. Existing results remain available.'))); return null;
    }
    abortLane(name);
    const task = { controller: new AbortController(), generation };
    lanes.set(name, task);
    const valid = () => lanes.get(name) === task && generation === task.generation && !task.controller.signal.aborted;
    const options = {
      signal: task.controller.signal,
      onProgress(progress) {
        if (!valid()) return;
        const stage = typeof progress === 'string' ? progress : progress?.stage || progress?.message;
        if (stage) status(()=>(label() + ' · ' + detail(stage)));
      }
    };
    error(()=>('')); status(()=>(label)); updateControls();
    try {
      const result = await work(options, valid);
      if (!valid()) return null;
      await commit(result);
      return result;
    } catch (e) {
      if (valid() && e?.name !== 'AbortError') {
        if (client.available === false) availability(null);
        error(()=>tr('stereo.kept','{detail} Previous results have been kept.',{detail:e?.message?detail(e.message):tr('stereo.failed','The chemistry calculation failed.')}));
        status(()=>(tr("stereo.notCompleted",'Calculation not completed.')));
      }
      return null;
    } finally {
      if (lanes.get(name) === task) lanes.delete(name);
      updateControls();
    }
  }
  const idOf = m => m?.id || m?.stereoisomerId;
  const same = (a, b) => !!a && !!b && idOf(a) === idOf(b);
  function atomLabel(m, atom, atomId) {
    const index = Number.isInteger(atom) ? atom : m.atomIds?.indexOf(atomId);
    return index >= 0 ? (m.atoms?.[index]?.symbol || m.atoms?.[index] || tr('stereo.atomWord','Atom')) + String(index + 1) : tr('stereo.atomWord','Atom')+' '+(atomId || '?');
  }
  function stereoLabel(m) {
    const entries = [];
    (m.stereo?.centers || []).forEach(c => entries.push(atomLabel(m, c.atom, c.atomId) + ': ' + (c.cip || (c.specified ? tr("stereo.assignedUnknown",'assigned (descriptor unavailable)') : tr("stereo.unspecified",'unspecified')))));
    (m.stereo?.bonds || []).forEach(b => entries.push(atomLabel(m, b.a) + '–' + atomLabel(m, b.b) + ': ' + window.MoleculeRecords.bondStereoLabel(b,tr('stereo.unspecified','unspecified'),tr('stereo.assignedUnknown','assigned (descriptor unavailable)'))));
    return entries.join(' · ') || tr("stereo.noAssignments",'No R/S or E/Z assignments reported');
  }
  function option(label,value) { const item=new Option('',value); ui(item,label); return item; }
  function image(svg, alt) {
    if (typeof svg !== 'string' || !/<svg[\s>]/i.test(svg) || svg.length > 4000000) return null;
    const img = node('img', 'stereo-molecule-image');
    attr(img,'alt',alt);
    img.decoding = 'async';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.addEventListener('error', () => { img.replaceWith(node('p', 'stereo-muted',()=>( tr("stereo.depictionFailed",'The supplied depiction could not be displayed. Assignments remain listed.')))); }, { once: true });
    return img;
  }
  function depiction(m) { return image(m.depictions?.skeletal || m.depictions?.displayed, ()=>(m.name || tr('common.molecule','Molecule')) + '. ' + stereoLabel(m)); }
  function warnText(w) {
    if (typeof w === 'string') return w;
    if (!w) return '';
    return w.message || w.note || w.reason || w.type || JSON.stringify(w);
  }
  function renderWarnings(result) {
    const warnings = [...(result?.warnings || []), ...(result?.unsupported || [])];
    variants.forEach(m => warnings.push(...(m.warnings || []), ...(m.stereo?.unsupported || [])));
    const texts = [...new Set(warnings.map(warnText).filter(Boolean))];
    byId('warnings').replaceChildren(...texts.map(t => node('li','',()=>detail(t))));
    byId('warnings').hidden = !texts.length;
  }
  function selectedConformer(m = current) {
    return m?.conformers?.find(c => String(c.id) === String(m.selectedConformerId)) || m?.conformers?.[0] || null;
  }
  function energyText(c) {
    const units = c.energyUnit || c.energyUnits || current?.metadata?.energyUnit || '';
    const number = n => Number.isFinite(n) ? n.toFixed(2) : null;
    const relative = number(c.relativeEnergy), absolute = number(c.energy);
    const energies = relative !== null ? 'ΔE ' + relative : absolute !== null ? 'E ' + absolute : tr("stereo.energyUnavailable",'Energy unavailable');
    return energies + ((relative !== null || absolute !== null) ? ' ' + (units || tr("stereo.unitsMissing",'(units not supplied)')) : '') + ' · ' + (c.method || tr("stereo.methodMissing",'Method not supplied'));
  }
  function renderConformers() {
    const select = byId('conformer');
    select.replaceChildren();
    const conformers = current?.conformers || [];
    const selected = selectedConformer();
    if (!conformers.length) select.append(option(()=>(tr("stereo.noConformers",'No conformers supplied yet')), ''));
    conformers.forEach((c, i) => select.append(option(()=>(tr('stereo.conformerOption','Conformer {number} · {energy}',{number:i+1,energy:energyText(c)})), String(c.id))));
    if (selected) select.value = String(selected.id);
    const unspecified=[...(current?.stereo?.centers||[]),...(current?.stereo?.bonds||[])].some(item=>!item.specified);
    ui(byId('energy'),()=>unspecified?tr("stereo.specifyFirst",'Generate possible stereoisomers and select a specified configuration before sampling conformers.'):selected ? energyText(selected) + ' · ' + (selected.converged === true ? tr("stereo.converged",'Converged') : selected.converged === false ? tr("stereo.notConverged",'Not converged') : tr("stereo.convergenceMissing",'Convergence not reported')) + (selected.source ? ' · ' + selected.source : '') : tr("stereo.samplePrompt",'Generate conformers to inspect their method and relative energies.'));
  }
  function resetProjection() {
    projection = null; projectionContext = '';
    byId('projection-image').replaceChildren(); byId('projection-image').hidden = true;
    ui(byId('projection-note'),()=>tr("stereo.projectionPrompt",'Choose a projection and request it from the chemistry service.'));
    byId('torsion-controls').hidden = true;
  }
  function fillProjectionChoices() {
    const m = current;
    const bondSelect = byId('bond'), centerSelect = byId('center');
    const oldBond = bondSelect.value, oldCenter = centerSelect.value;
    bondSelect.replaceChildren(); centerSelect.replaceChildren();
    (m?.bonds || []).filter(b => Number(b.order) === 1 && b.id).forEach(b => bondSelect.append(option(()=>(atomLabel(m, b.a) + '–' + atomLabel(m, b.b) + ' (' + b.id + ')'), b.id)));
    (m?.stereo?.centers || []).forEach(c => {
      const id = c.atomId || m.atomIds?.[c.atom];
      if (id) centerSelect.append(option(()=>(atomLabel(m, c.atom, id) + (c.cip ? ' · ' + c.cip : '')), id));
    });
    if (!bondSelect.options.length) bondSelect.append(option(()=>(tr("stereo.backendBond",'Backend-selected bond')), ''));
    if (!centerSelect.options.length) centerSelect.append(option(()=>(tr("stereo.backendCenter",'Backend-selected center')), ''));
    if ([...bondSelect.options].some(o => o.value === oldBond)) bondSelect.value = oldBond;
    if ([...centerSelect.options].some(o => o.value === oldCenter)) centerSelect.value = oldCenter;
    projectionType();
  }
  function projectionType() {
    const fischer = byId('projection-type').value === 'fischer';
    byId('bond-field').hidden = fischer;
    byId('reverse-field').hidden = fischer;
    byId('center-field').hidden = !fischer;
  }
  function renderCurrent() {
    byId('detail').hidden = !current || (!variants.length && current.schema !== 'bond-atlas/3' && !current.conformers?.length);
    ui(byId('current-name'),()=>app?.state?.selected ? tr('stereo.workspace','Workspace selection: {name}',{name:app.state.selected.name || app.state.selected.notation || tr('common.structure','structure')}) : tr("stereo.selectPrompt",'Select a structure in the workspace, or enter SMILES.'));
    ui(byId('detail-label'),()=>current ? (current.name || tr("stereo.selected",'Selected structure')) + ' · ' + stereoLabel(current) : '');
    renderConformers(); fillProjectionChoices();
    updateControls();
  }
  function renderVariants() {
    byId('variants').replaceChildren();
    byId('results').hidden = !variants.length;
    byId('empty').hidden = !!variants.length;
    variants.forEach((m, i) => {
      const card = node('div', 'stereo-variant');
      const button = node('button', 'stereo-variant-select');
      button.type = 'button'; button.setAttribute('aria-pressed', String(same(m, current)));
      button.dataset.moleculeId = idOf(m);
      const img = depiction(m);
      if (img) { attr(img,'alt',''); button.append(img); }
      const label = node('span', 'stereo-variant-text');
      label.append(node('strong', '',()=>( stereoLabel(m))), node('span', 'stereo-muted',()=>( (i + 1) + '. ' + (m.name || m.notation || tr('stereo.variantWord','Variant')))));
      button.append(label);
      button.addEventListener('click', () => selectVariant(m));
      const checkLabel = node('label', 'stereo-check stereo-compare-check');
      const check = node('input'); check.type = 'checkbox'; check.checked = compared.includes(idOf(m));
      attr(check,'aria-label', ()=>tr('stereo.compareVariant','Compare variant {number}: {assignments}',{number:i+1,assignments:stereoLabel(m)}));
      check.addEventListener('change', () => {
        if (check.checked && compared.length >= 2) { check.checked = false; status(()=>(tr("stereo.atMostTwo",'Choose at most two variants. Uncheck one before choosing another.'))); return; }
        compared = check.checked ? [...compared, idOf(m)] : compared.filter(id => id !== idOf(m));
        relation = ''; abortLane('relationship'); renderComparison(); requestRelationship();
      });
      checkLabel.append(check, ui(node('span'),()=>tr('common.compare','Compare'))); card.append(button, checkLabel); byId('variants').append(card);
    });
    const r = lastResult || {};
    const completeness = () => r.capped ? tr("stereo.capped",'Capped result — additional possibilities may exist') : r.complete === true ? tr("stereo.complete",'Complete for the backend’s supported stereochemistry') : r.supplied ? tr("stereo.supplied",'Supplied structures — not an exhaustive enumeration') : tr("stereo.completenessUnknown",'Completeness not established');
    ui(byId('summary'),()=>tr(variants.length===1?'stereo.summaryOne':'stereo.summaryMany',variants.length===1?'{count} variant returned · {detail}':'{count} variants returned · {detail}',{count:variants.length,detail:completeness()})+(r.enumerateAll===false?' · '+tr('stereo.preserved','assigned stereochemistry preserved'):r.enumerateAll===true?' · '+tr('stereo.allExplored','all supported assignments explored'):''));
    renderWarnings(r); renderComparison();
  }
  function renderComparison() {
    const records = compared.map(id => variants.find(m => idOf(m) === id)).filter(Boolean);
    byId('comparison').hidden = !records.length;
    byId('compare-panels').replaceChildren();
    records.forEach((m, i) => {
      const panel = node('article', 'stereo-compare-panel');
      panel.append(node('h4','',()=>tr('stereo.variant','Variant {number}',{number:variants.indexOf(m)+1})), node('p', 'stereo-descriptors',()=>( stereoLabel(m))));
      panel.append(depiction(m) || node('p', 'stereo-no-depiction',()=>( tr("stereo.noDepiction",'No backend depiction supplied. Inspect this variant in the main viewer.'))));
      panel.append(node('p', 'stereo-muted',()=>( m.name || '')), node('code', 'stereo-notation',()=>( m.notation || '')));
      attr(panel,'aria-label', ()=>tr('stereo.comparison','Comparison {number}',{number:i+1})); byId('compare-panels').append(panel);
    });
    if (records.length === 1) byId('compare-panels').append(node('p', 'stereo-compare-placeholder',()=>( tr("stereo.chooseSecond",'Choose a second variant to compare.'))));
    ui(byId('relationship'),()=>(relation ? detail(relation) : '') || (records.length === 2 ? available ? tr("stereo.relationshipPending",'Relationship not yet reported.') : tr("stereo.compareOffline",'The chemistry service is unavailable; compare the listed assignments.') : ''));
    updateControls();
  }
  function requestRelationship() {
    if (compared.length !== 2 || !available) return;
    const pair = compared.join('\u0000');
    const records = compared.map(id => variants.find(m => idOf(m) === id));
    run('relationship',()=>( tr("stereo.comparing",'Comparing assignments…')), options => client.job('relationship', { first: records[0], second: records[1] }, options), result => {
      if (compared.join('\u0000') !== pair) return;
      relation = typeof result.relationship === 'string' ? result.relationship : warnText(result.relationship) || 'Relationship not reported.';
      renderComparison(); status(()=>(tr("stereo.compared",'Comparison updated.')));
    });
  }
  function syncWorkspace(records, preferredId, source) {
    if (!app?.loadStructures) throw Error('The main molecule viewer is not available.');
    internalLoad = true;
    try {
      app.loadStructures(records, source || 'Possible stereoisomers');
      if (preferredId && app.selectStructure) app.selectStructure(preferredId);
    } finally { internalLoad = false; }
  }
  function loadResult(result, options = {}) {
    const records = Array.isArray(result) ? result : result?.molecules;
    if (!Array.isArray(records) || !records.length) { const explanation=[...(result?.unsupported||[]),...(result?.warnings||[])].map(warnText).filter(Boolean).join(' ');throw Error(explanation||'No molecular records were returned.'); }
    if (records.some(m => !m || !idOf(m) || !Array.isArray(m.atoms) || !Array.isArray(m.bonds))) throw Error('The chemistry service returned an invalid molecular record.');
    const preferredId = options.selectedId || (records.some(m => same(m, current)) ? idOf(current) : idOf(records[0]));
    if (options.sync !== false) syncWorkspace(records, preferredId, options.source);
    const oldTask = lanes.get('enumerate');
    // A public import invalidates in-flight calculations; an enumeration commit keeps its own lane alive.
    if (!options.fromEnumeration) cancelAll(false);
    else { cancelDetails(); abortLane('relationship'); }
    variants = records.slice();
    current = variants.find(m => idOf(m) === preferredId) || variants[0];
    if (!options.fromEnumeration) {
      sourceRecord = current;
      byId('input').value = current.notation || '';
      byId('format').value = 'smiles';
      ui(byId('input-label'),()=>tr("stereo.retainedInput",'Selected structure · original assignments retained'));
    }
    compared = compared.filter(id => variants.some(m => idOf(m) === id));
    lastResult = Array.isArray(result) ? { supplied: true } : { ...result };
    relation = ''; resetProjection();
    renderVariants(); renderCurrent();
    if (!options.fromEnumeration || !oldTask) status(()=>(tr('stereo.recordsLoaded','{count} molecular records loaded.',{count:variants.length})));
    return variants.slice();
  }
  function selectVariant(m) {
    try {
      cancelDetails(); resetProjection();
      const loaded = app?.state?.result?.isomers || [];
      const fullSetLoaded = loaded.length === variants.length && variants.every(v => loaded.some(item => same(item, v)));
      if (app?.selectStructure && fullSetLoaded) {
        internalLoad = true;
        try { app.selectStructure(idOf(m)); } finally { internalLoad = false; }
      } else syncWorkspace(variants, idOf(m));
      current = m; ui(byId('conformer-summary'),()=>'');
      renderVariants(); renderCurrent(); error(()=>(''));
      [...root.querySelectorAll('.stereo-variant-select')].find(b => b.dataset.moleculeId === idOf(m))?.focus({ preventScroll: true });
    } catch (e) { error(()=>detail(e.message)); }
  }
  function replaceCurrent(molecule, original, source) {
    // Conformer changes never create a new stereoisomer identity.
    const updated = { ...molecule, id: original.id, stereoisomerId: original.stereoisomerId || molecule.stereoisomerId };
    const wasVariant = variants.some(m => same(m, original));
    const records = wasVariant ? variants.map(m => same(m, original) ? updated : m) : [updated];
    syncWorkspace(records, idOf(updated), source);
    variants = records; current = updated;
    if (!lastResult || !wasVariant) {
      lastResult = { supplied: true };
      compared = compared.filter(id => records.some(m => idOf(m) === id));
      relation = '';
    }
    resetProjection(); renderVariants(); renderCurrent();
    return updated;
  }
  function useCurrent() {
    const m = app?.state?.selected;
    if (!m) { error(()=>(tr("stereo.selectFirst",'Select a structure in the workspace first.'))); return; }
    abortLane('enumerate'); sourceRecord = m;
    byId('input').value = m.notation || '';
    byId('format').value = 'smiles';
    ui(byId('input-label'),()=>tr("stereo.retainedInput",'Selected structure · original assignments retained'));
    status(()=>(tr("stereo.usingSelected",'Using the selected structure. Generate possibilities when ready.'))); error(()=>('')); updateControls();
  }
  function parsedMolecule(result) {
    if(result?.molecules?.length>1)throw Error('Generate stereoisomers for one structure at a time. Use Paste / import to open a collection.');
    const m = result?.molecule || result?.molecules?.[0] || (Array.isArray(result?.atoms) ? result : null);
    if (!m) throw Error('The chemistry service did not return a parsed molecule.');
    return m;
  }
  async function generate() {
    if (!byId('form').reportValidity()) return null;
    const text = byId('input').value.trim(), format = byId('format').value;
    const source = sourceRecord;
    if (!source && !text) { error(()=>(tr("stereo.enterFirst",'Enter a structure or use the selected structure first.'))); byId('input').focus(); return null; }
    const enumerateAll = byId('all').checked, maxIsomers = Number(byId('limit').value);
    cancelAll(false);
    return run('enumerate',()=>( tr("stereo.generating",'Generating possible stereoisomers…')), async (options, valid) => {
      let molecule = source;
      // Legacy graphs carry no authoritative stereo model: parse their notation on the server first.
      if (!molecule || (!molecule.stereo && molecule.schema !== 'bond-atlas/3')) {
        const parsed = await client.job('parse', { text: molecule?.notation || text, format: molecule ? 'smiles' : format }, options);
        if (!valid()) throw new DOMException('Cancelled', 'AbortError');
        molecule = parsedMolecule(parsed);
      }
      return client.job('enumerate', { molecule, enumerateAll, maxIsomers }, options);
    }, result => {
      loadResult({ ...result, enumerateAll }, { fromEnumeration: true });
      ui(byId('conformer-summary'),()=>'');
      status(()=>(tr('stereo.updated','Stereoisomer results updated. {detail}',{detail:result.capped ? tr("stereo.limitReached",'The backend limit was reached; this list is not exhaustive.') : result.complete ? tr("stereo.completeReported",'Complete within the reported backend support.') : tr("stereo.incompleteReported",'Completeness has not been established.') })));
    });
  }
  function chooseConformer() {
    const original = current, selectedId = byId('conformer').value;
    const conformer = original?.conformers?.find(c => String(c.id) === selectedId);
    if (!conformer) return;
    const id = conformer.id;
    try {
      cancelDetails();
      const helper = window.MoleculeRecords?.withConformer;
      const updated = helper ? helper(original, id) : { ...original, selectedConformerId: id };
      replaceCurrent({ ...updated, selectedConformerId: id }, original, 'Selected stereoisomer conformer');
      status(()=>(tr("stereo.conformerSelected",'Conformer selected. Assignments are unchanged.'))); error(()=>(''));
    } catch (e) { error(()=>detail(e.message)); renderConformers(); }
  }
  function generateConformers() {
    if (!current || !byId('num-confs').reportValidity() || !byId('seed').reportValidity()) return;
    const original = current;
    abortLane('projection'); abortLane('torsion');
    run('conformers',()=>( tr("stereo.sampling",'Sampling conformers…')), options => client.job('conformers', { molecule: original, numConfs: Number(byId('num-confs').value), seed: Number(byId('seed').value) }, options), result => {
      if (!same(current, original) || !result?.molecule) { if (!result?.molecule) throw Error('No conformer record was returned.'); return; }
      replaceCurrent(result.molecule, original, 'Backend conformer sampling');
      ui(byId('conformer-summary'),()=>[...(result.generated!==undefined?[tr('stereo.generatedCount','{count} generated',{count:result.generated})]:[]),...(result.requested!==undefined?[tr('stereo.requestedCount','{count} requested',{count:result.requested})]:[]),...(result.failed!==undefined?[tr('stereo.failedCount','{count} failed',{count:result.failed})]:[])].join(' · ')+((result.warnings||[]).length?'. '+detail(result.warnings.map(warnText).join(' ')):''));
      status(()=>(tr("stereo.sampled",'Conformer sampling completed.')));
    });
  }
  function projectionKey() {
    return [idOf(current), selectedConformer()?.id, byId('projection-type').value, byId('bond').value, byId('center').value, byId('reverse').checked].join('|');
  }
  function torsionIds() {
    if (!projection || projectionContext !== projectionKey() || byId('projection-type').value !== 'newman' || !selectedConformer()) return null;
    const ids = projection.torsionAtomIds || projection.dihedralAtomIds || projection.atomIds || projection.dihedral?.atomIds;
    return Array.isArray(ids) && ids.length === 4 && ids.every(id => typeof id === 'string') ? ids : null;
  }
  function showProjection() {
    if (!current) return;
    const key = projectionKey(), type = byId('projection-type').value;
    const payload = { molecule: current, type, conformerId: selectedConformer()?.id };
    if (type === 'newman') {
      if (byId('bond').value) payload.bondId = byId('bond').value;
      payload.reverse = byId('reverse').checked;
    } else if (byId('center').value) payload.atomId = byId('center').value;
    run('projection',()=>( tr("stereo.projecting",'Calculating linked projection…')), options => client.job('projection', payload, options), result => {
      if (projectionKey() !== key) return;
      const img = image(result.svg, type === 'newman' ? tr("stereo.newmanAlt",'Backend Newman projection of the selected conformer') : tr("stereo.fischerAlt",'Backend Fischer projection of the assigned stereoisomer'));
      if (!img) throw Error(result.note || 'The backend did not supply a projection image.');
      projection = result; projectionContext = key;
      byId('projection-image').replaceChildren(img); byId('projection-image').hidden = false;
      const projectionDetails=[result.note,...(result.warnings||[]).map(warnText)].filter(Boolean).join(' ');
      const projectionNote=()=>projectionDetails?detail(projectionDetails):tr('stereo.projectionSupplied','Projection supplied by the chemistry backend.');
      ui(byId('projection-note'),projectionNote);
      const ids = torsionIds();
      byId('torsion-controls').hidden = !ids;
      if (ids) {
        ui(byId('torsion-atoms'),()=>tr('stereo.orderedAtoms','Ordered atoms: {atoms}',{atoms:ids.join(' → ')}));
        const angle = result.measuredDihedral ?? result.dihedral?.degrees ?? result.dihedral;
        if (Number.isFinite(angle)) byId('dihedral').value = String(Math.round((((angle + 180) % 360) + 360) % 360 - 180));
      } else if (type === 'newman') {
        ui(byId('projection-note'),()=>projectionNote()+' '+tr('stereo.noTorsion','Dihedral editing requires a conformer and four ordered atom IDs from the backend; no torsion has been inferred.'));
      }
      status(()=>(tr("stereo.projected",'Linked projection updated.')));
    });
  }
  function applyTorsion() {
    const atomIds = torsionIds();
    if (!atomIds || !byId('dihedral').reportValidity()) return;
    const original = current;
    abortLane('projection'); abortLane('conformers');
    run('torsion',()=>( tr("stereo.applying",'Applying geometry-linked dihedral…')), options => client.job('torsion', { molecule: original, conformerId: selectedConformer()?.id, atomIds, degrees: Number(byId('dihedral').value) }, options), result => {
      if (!same(current, original)) return;
      if (!result.molecule) throw Error('The backend did not return the changed conformer.');
      replaceCurrent(result.molecule, original, 'Backend dihedral adjustment');
      ui(byId('conformer-summary'),()=>tr("stereo.adjusted",'Dihedral adjusted by the backend. Any energy and convergence values shown are those returned by the backend.'));
      status(()=>(tr("stereo.applied",'Dihedral applied. Refreshing the linked projection…')));
      // The follow-up is explicit after a successful edit, never driven by a selection event.
      showProjection();
    });
  }
  function editedSource() {
    const wasBusy = busy('enumerate');
    sourceRecord = null; abortLane('enumerate');
    if (wasBusy) status(()=>(tr("stereo.inputChanged",'Input changed. Previous results are kept; generate again to use the new input.')));
    ui(byId('input-label'),()=>tr("stereo.input",'Structure input'));
    byId('example').value = ''; updateControls();
  }
  Object.entries(examples).forEach(([key, item]) => byId('example').append(option(()=>(item[0]), key)));
  byId('example').addEventListener('change', () => {
    const example = examples[byId('example').value];
    if (!example) return;
    abortLane('enumerate'); sourceRecord = null;
    byId('input').value = example[1]; byId('format').value = 'smiles';
    ui(byId('input-label'),()=>tr("stereo.input",'Structure input'));
    status(()=>(tr("stereo.exampleLoaded",'Example loaded. Generate possible stereoisomers to explore it.'))); error(()=>('')); updateControls();
  });
  byId('input').addEventListener('input', editedSource);
  byId('format').addEventListener('change', editedSource);
  ['all', 'limit'].forEach(id => byId(id).addEventListener('change', () => {
    if (busy('enumerate')) status(()=>(tr("stereo.settingsChanged",'Enumeration settings changed. Previous results are kept; generate again to apply them.')));
    abortLane('enumerate'); updateControls();
  }));
  byId('use-current').addEventListener('click', useCurrent);
  byId('form').addEventListener('submit', e => { e.preventDefault(); generate(); });
  byId('cancel').addEventListener('click', () => cancelAll(true));
  byId('conformer').addEventListener('change', chooseConformer);
  byId('make-conformers').addEventListener('click', generateConformers);
  byId('project').addEventListener('click', showProjection);
  byId('apply-torsion').addEventListener('click', applyTorsion);
  ['projection-type', 'bond', 'center', 'reverse'].forEach(id => byId(id).addEventListener('change', () => {
    abortLane('projection'); abortLane('torsion'); resetProjection(); projectionType(); updateControls();
  }));
  byId('together').addEventListener('click', () => {
    const pair = compared.map(id => variants.find(m => idOf(m) === id)).filter(Boolean);
    if (pair.length !== 2) return;
    try {
      const chosen = pair.find(m => same(m, current)) || pair[0];
      syncWorkspace(pair, idOf(chosen), 'Stereoisomer comparison pair');
      cancelDetails(); current = chosen; resetProjection(); renderVariants(); renderCurrent();
      app.setMode('3d'); app.setTogether(true);
      status(()=>(tr("stereo.pairLoaded",'The two comparison variants are loaded together in the main viewer. Select any variant here to restore the full set.'))); error(()=>(''));
    } catch (e) { error(()=>detail(e.message)); }
  });
  document.addEventListener('bondatlas:selection', event => {
    if (internalLoad || !event.detail || !('molecule' in event.detail)) return;
    const m = event.detail.molecule;
    // Selection only updates local controls. It never enumerates, reloads, or requests a projection.
    cancelDetails(); abortLane('enumerate'); current = m; resetProjection();
    // The shared viewer can prepare conformers for a comparison subset. Merge
    // those authoritative records into the full stereo set before its cards
    // can reload an older, geometry-free copy of the same stereoisomer.
    const loaded = app?.state?.result?.isomers || [];
    let refreshed = false;
    variants = variants.map(variant => {
      const updated = loaded.find(record => same(record, variant));
      if (updated && updated !== variant) { refreshed = true; return updated; }
      return variant;
    });
    if (sourceRecord) sourceRecord = loaded.find(record => same(record, sourceRecord)) || sourceRecord;
    ui(byId('conformer-summary'),()=>'');
    if (refreshed) renderVariants();
    else root.querySelectorAll('.stereo-variant-select').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.moleculeId === idOf(m))));
    renderCurrent();
  });
  function availability(ready) {
    available = !!ready && !!client?.job && client.available !== false;
    if(ready?.limits?.stereoisomers)byId('limit').max=ready.limits.stereoisomers;
    if(ready?.limits?.conformers)byId('num-confs').max=ready.limits.conformers;
    if(available&&!byId('input').value.trim()&&!sourceRecord){byId('example').value='lactic';byId('input').value=examples.lactic[1];ui(byId('input-label'),()=>tr("stereo.defaultExample",'Example · lactic acid (unspecified center)'));}
    ui(byId('service'),()=>available ? tr("stereo.ready",'Chemistry service ready') : tr("stereo.serviceDisabled",'Chemistry service unavailable — generation, conformer sampling and linked projections are disabled. Existing structures can still be inspected.'));
    byId('service').dataset.available = String(available);
    updateControls();
    if (compared.length) renderComparison();
    if (available && compared.length === 2) requestRelationship();
  }
  window.StereoExplorer = {
    loadResult,
    setMolecules(records, options = {}) { return loadResult({ molecules: records, supplied: true }, options); },
    selectedMolecule() { return current || app?.state?.selected || null; },
    generate,
    cancel() { cancelAll(true); },
    get available() { return available; }
  };
  if (current) {
    sourceRecord = current; byId('input').value = current.notation || '';
    ui(byId('input-label'),()=>tr("stereo.retainedInput",'Selected structure · original assignments retained'));
  }
  renderCurrent();
  if (client?.ready) Promise.resolve(client.ready).then(availability, () => availability(null));
  else availability(null);
})();
