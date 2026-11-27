/* Independent 2D snapshots in a plate card. clear(host) also cancels pending parses. */
(function (root) {
  'use strict';
  const views = new WeakMap();

  function clear(container) {
    const view = views.get(container);
    if (!view) return;
    views.delete(container);
    view.controller.abort();
    for (const stage of view.stages) stage.destroy();
    view.panel.remove();
  }

  async function show(container, left, right, explanation, setup) {
    clear(container);
    const doc = container.ownerDocument;
    function el(tag, cls, text) {
      const node = doc.createElement(tag);
      if (cls) node.className = cls;
      if (text) node.textContent = text;
      return node;
    }
    const panel = el('section', 'plate-comparison');
    const customCaptions = [left, right].some(input => input?.side || input?.setup);
    panel.setAttribute('aria-label', customCaptions ? 'Structure comparison' : 'Before and after structures');
    const grid = el('div', 'plate-comparison-grid');
    if (setup) panel.append(el('p', 'plate-comparison-setup', 'Reaction conditions: ' + setup));
    panel.append(grid);
    if (typeof explanation === 'string' && explanation.trim()) {
      const details = el('details', 'plate-comparison-explanation');
      details.append(el('summary', '', 'What changed?'), el('p', '', explanation));
      panel.append(details);
    }
    container.append(panel);
    const controller = new AbortController(), stages = [];
    views.set(container, {panel, controller, stages});
    const current = () => !controller.signal.aborted && panel.parentNode === container;

    async function draw(defaultSide, input) {
      const side = input?.side || defaultSide;
      const smiles = typeof input?.smiles === 'string' ? input.smiles.trim() : '';
      const figure = el('figure'), caption = el('figcaption');
      const name = el('strong', '', input?.label || 'Structure');
      name.dir = 'auto';
      caption.append(el('span', 'plate-comparison-side', side), name);
      if (input?.setup) caption.append(el('span', 'plate-comparison-setup', input.setup));
      const host = el('div', 'plate-comparison-drawing');
      host.hidden = true;
      const notice = el('p', 'plate-comparison-note', 'Loading structure...');
      notice.setAttribute('role', 'status');
      figure.append(caption, host, notice);
      grid.append(figure);
      let stage;
      try {
        if (!smiles) throw Error('No SMILES supplied.');
        const record = await root.ReactionInput.parse('smiles:' + smiles, {signal:controller.signal});
        if (!current()) return;
        // Route captions identify a particular plate, not just the parsed molecule.
        if ((!customCaptions || !input.label) && record.knownName && record.name) name.textContent = record.name;
        if (record.formula) {
          const formula = el('bdi', 'plate-comparison-formula', root.MoleculeRecords.prettyFormula(record.formula));
          formula.dir = 'ltr'; caption.append(formula);
        }
        host.hidden = false;
        host.setAttribute('role', 'img');
        host.setAttribute('aria-label', `${side}: ${name.textContent}. SMILES: ${smiles}`);
        stage = root.ModelStage.create(host);
        stage.draw2D([{id:side, record}]);
        stages.push(stage);
        notice.remove();
      } catch (error) {
        stage?.destroy();
        if (!current()) return;
        host.hidden = true;
        notice.textContent = `2D drawing unavailable. ${error.message || ''}`.trim();
        if (smiles) {
          const code = el('code', '', smiles);
          code.dir = 'ltr';
          figure.append(code);
        }
      }
    }
    await Promise.all([draw('Starting molecule', left), draw('Selected organic product', right)]);
  }

  root.PlateComparison = {show, clear};
})(typeof window !== 'undefined' ? window : globalThis);
