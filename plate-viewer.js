/* Plate inspector. show() accepts a local parsed record, not a URL or file.
   A site may be {atom: zero-based index} or {atomId: mapped ID, label?: string}. */
(function (root) {
  'use strict';
  const limits = {generate:256, simplify:48}; // Same base-atom budget as the chemistry service.
  const reasons = {
    'unspecified-stereo':'This structure leaves stereochemistry open. A single configuration would be misleading.',
    'unsupported-stereo':'The chemistry service cannot verify all stereochemistry in this structure.',
    disconnected:'Separate fragments have no defined 3D arrangement.',
    large:'This structure exceeds the chemistry service limit of 256 base atoms.',
    offline:'The local chemistry service is unavailable.',
    'no-conformer':'No verified 3D coordinates are available for this structure.',
    'parse-failed':'The chemistry service could not read this structure.',
    graphics:'The 3D renderer is unavailable or lost its graphics context.'
  };

  function mount(host) {
    const doc = host.ownerDocument, win = doc.defaultView;
    function el(tag, cls, text) {
      const node = doc.createElement(tag);
      if (cls) node.className = cls;
      if (text) node.textContent = text;
      return node;
    }
    const panel = el('section','plate-viewer'), heading = el('h3'), formula = el('p','plate-viewer-formula'), status = el('p','plate-viewer-status');
    const viewport = el('div','plate-viewer-viewport'), holder = el('div','plate-viewer-stage');
    const toolbar = el('div','plate-viewer-tools'), focusLabel = el('label','plate-viewer-focus','Focus on '), picker = el('select');
    panel.setAttribute('aria-label','Molecule inspector'); status.setAttribute('role','status');
    viewport.tabIndex = 0; viewport.setAttribute('role','group');
    focusLabel.append(picker); viewport.append(holder); panel.append(heading,formula,viewport,toolbar,status); host.append(panel);
    const cache = new WeakMap();
    let record = null, site = null, atom = null, stage = null, job = null, disposed = false, mode = '2d', scale = 1;
    let gate, failure, simplified, drawn;
    function button(text, fn) {
      const b = el('button','plain-button',text); b.type = 'button';
      b.addEventListener('click',fn); toolbar.append(b); return b;
    }
    const toggle = button('Show 3D', () => {
      if (mode === '3d' || job) { stop(); drawing(); }
      else build();
    });
    toolbar.append(focusLabel);
    const turn = button('Rotate', () => stage?.rotate(20,'y'));
    const out = button('Zoom out', () => zoom(1/1.35)), into = button('Zoom in', () => zoom(1.35));
    const fit = button('Fit', () => focus(null)); fit.title = 'Fit the whole molecule';
    picker.addEventListener('change', () => focus(picker.value === '' ? null : Number(picker.value)));
    function size(n) {
      scale = Math.min(6,Math.max(.5,n));
      holder.style.width = holder.style.height = (100*scale)+'%';
      if (scale === 1) viewport.scrollLeft = viewport.scrollTop = 0;
    }
    function zoom(factor) { if (mode === '3d') stage?.zoom(factor); else size(scale*factor); }
    viewport.addEventListener('keydown', event => {
      if (mode !== '3d' || event.altKey || event.ctrlKey || event.metaKey) return;
      const rotation = {ArrowLeft:[-15,'y'], ArrowRight:[15,'y'], ArrowUp:[-15,'x'], ArrowDown:[15,'x']}[event.key];
      if (rotation) { event.preventDefault(); stage?.rotate(...rotation); }
    });
    function stop() { job?.abort(); job = null; }
    function release() { stage?.destroy(); stage = null; }
    function blocked() {
      const mapped = root.MoleculeRecords.isRecord(record);
      if (record.atoms.length > limits.generate && !(mapped && root.ModelInput.selectedGeometry(record))) return 'large';
      return mapped ? root.ModelInput.geometryBlock(record) : null;
    }
    function siteIndex() {
      const i = site?.atomId != null ? record.atomIds?.indexOf(site.atomId) : site?.atom;
      return Number.isInteger(i) && i>=0 && i<record.atoms.length ? i : null;
    }
    function name(i) { return record.atoms[i]+(i+1); }
    function options() {
      const option = (value,text) => { const o=el('option','',text); o.value=value; return o; };
      const selected = siteIndex();
      picker.replaceChildren(option('','Whole molecule'),...record.atoms.map((_,i) => option(i,name(i)+(i===selected?' · selected site':''))));
    }
    function describe() {
      // Reparsing an offline sketch may renumber its atoms. Never apply its
      // selected index to a service-generated model without a verified map.
      const safe = mode==='2d' || root.MoleculeRecords.isRecord(record);
      picker.disabled = !safe || !drawn; picker.value = safe && atom!==null ? String(atom) : '';
      const label = atom!==null && atom===siteIndex() && site?.label ? ' ('+site.label+')' : '';
      const detail = atom!==null && safe ? (mode==='2d' ? 'Focused atom: ' : 'Enlarged site atom: ')+name(atom)+label+'. '+
        (mode==='2d' ? 'Local connectivity only; bond angles and stereochemistry are not shown.' : 'Only this atom and its bonded neighbors are shown.')+' Fit shows the whole molecule.' :
        (atom!==null || site && siteIndex()===null) ? 'Site numbering could not be verified; no atom is marked.' : '';
      viewport.setAttribute('aria-label',(mode==='3d'?'3D model: ':'2D structure: ')+heading.textContent+(mode==='3d'?'. Arrow keys rotate.':''));
      status.textContent = [job && mode==='2d' ? 'Preparing one verified 3D conformer...' : '',
        mode==='2d' ? reasons[failure || gate] : '', mode==='3d' ? 'One verified conformer. Drag or use the arrow keys in the model to rotate.' :
          !drawn ? 'No 2D drawing available.' : atom===null ? '2D structure. Zoom in to explore the drawing.' : '',
        mode==='3d' && simplified ? 'Added hydrogens are hidden for clarity.' : '', detail].filter(Boolean).join(' ');
    }
    function render2D() {
      try {
        stage ||= root.ModelStage.create(holder);
        stage.draw2D([{id:'plate',record,focusAtom:atom}]); drawn = true;
      } catch (_) { release(); drawn = false; }
      out.disabled = into.disabled = fit.disabled = !drawn;
      viewport.hidden = !drawn; describe();
    }
    function focus(i) {
      atom=i; size(1);
      if (mode==='2d') render2D();
      else { stage.focusAtom(root.MoleculeRecords.isRecord(record) ? atom : null); describe(); }
    }
    function drawing(reason) {
      if (mode==='3d') release();
      mode='2d'; size(1); turn.hidden=true; toggle.textContent='Show 3D'; toggle.disabled=!!gate; failure=reason;
      render2D();
    }
    async function build() {
      if (!record || disposed || job) return;
      const controller = new win.AbortController(); job = controller;
      toggle.textContent = 'Cancel 3D'; describe();
      let reason = 'no-conformer';
      try {
        let result = cache.get(record);
        if (!result) {
          const options = {signal:controller.signal};
          result = root.MoleculeRecords.isRecord(record) ? await root.ModelInput.resolveMapped(record, options)
            : await root.ModelInput.resolve('smiles:'+record.notation, options);
          if (controller.signal.aborted || disposed) return;
          if (!result.geometry) { drawing(result.reason || reason); return; }
          cache.set(record,result);
        }
        const mapped = result.record, base = mapped.atoms.length;
        let geometry = result.geometry;
        // RDKit appends generated H after all mapped base atoms. Keep drawn H,
        // isotopes and site indices intact when simplifying a crowded conformer.
        simplified = geometry.atoms.length > limits.simplify && geometry.atoms.length > base &&
          geometry.atoms.slice(base).every(a => a.e === 'H');
        if (simplified) geometry = {atoms:geometry.atoms.slice(0,base), bonds:geometry.bonds.filter(b => b.a < base && b.b < base)};
        reason = 'graphics'; size(1); viewport.hidden = false;
        stage ||= root.ModelStage.create(holder);
        stage.draw3D([{id:'plate',record:mapped,geometry,focusAtom:root.MoleculeRecords.isRecord(record)?atom:null}]);
        mode='3d'; drawn=true; toggle.textContent='Show 2D'; turn.hidden=false; out.disabled=into.disabled=fit.disabled=false;
      } catch (_) { if (!controller.signal.aborted && !disposed) { release(); drawing(reason); } }
      finally { if (job === controller) { job=null; describe(); } }
    }
    holder.addEventListener('modelstageerror', () => { if (!disposed && mode === '3d') drawing('graphics'); });
    function clear() {
      stop(); release(); record=site=atom=null; drawn=false; mode='2d'; panel.hidden=true;
      heading.textContent=formula.textContent=status.textContent=''; picker.replaceChildren();
    }
    clear();
    return {
      show(next,label,optionalSite) {
        if (disposed) return;
        const same=next && next===record && drawn;
        if (!same) clear(); if (!next) return;
        record=next; site=optionalSite; panel.hidden=false; heading.textContent=label || record.name || 'Molecule';
        try {
          if (!same) {
            if (root.MoleculeRecords.isRecord(record)) root.MoleculeRecords.validate(record);
            else if (record.schema || !Array.isArray(record.atoms) || typeof record.notation !== 'string') throw Error();
            if (!record.atoms.length) throw Error();
            gate=blocked();
          }
          formula.textContent=root.ReactionInput?.formulaNote?.(record) || '';
          options(); atom=siteIndex();
          if (same) focus(atom); else drawing();
        } catch (_) {
          viewport.hidden=turn.hidden=true; picker.disabled=toggle.disabled=out.disabled=into.disabled=fit.disabled=true;
          status.textContent='No mapped structure or local sketch is available for this selection.';
        }
      }, clear, dispose() { if (!disposed) { clear(); disposed=true; panel.remove(); } }
    };
  }
  root.PlateViewer = {mount};
})(typeof window !== 'undefined' ? window : globalThis);
