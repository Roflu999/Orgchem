/* Atom identities and measurements for one displayed structure. */
(function (root) {
  'use strict';

  function atomCatalog(molecule, geometry, mapped) {
    const entries = molecule.atoms.map((element, i) => ({
      graphIndex: i, geometryIndex: null, point: null,
      label: (molecule.isotopes?.[i] || '') + element + (i + 1)
    }));
    const byId = new Map((molecule.atomIds || []).map((id, i) => [id, i]));
    const byGeometry = [];
    for (const [j, atom] of (geometry?.atoms || []).entries()) {
      // Added H atoms have a parent index, not a corresponding sketch atom.
      // Only the legacy layout guarantees graph atoms first, in graph order.
      const i = mapped ? byId.get(atom.atomId) : j;
      let entry = entries[i];
      if (!entry || entry.point || molecule.atoms[i] !== atom.e) {
        entry = {graphIndex: null, label: atom.e + '·3D:' + (j + 1)};
        entries.push(entry);
      }
      entry.geometryIndex = j;
      entry.point = atom;
      byGeometry[j] = entry;
    }
    return {entries, byGeometry};
  }

  function measure(entries) {
    if (entries.length < 2 || entries.length > 3) return null;
    const points = entries.map(e => e.point);
    if (points.some(p => !p || ![p.x, p.y, p.z].every(Number.isFinite))) return null;
    const [a, b, c] = points;
    const u = [a.x-b.x, a.y-b.y, a.z-b.z], length = Math.hypot(...u);
    if (!c) return {kind: 'distance', value: length};
    const v = [c.x-b.x, c.y-b.y, c.z-b.z], other = Math.hypot(...v);
    if (!length || !other) return null;
    const cos = u.reduce((sum, x, i) => sum + x / length * (v[i] / other), 0);
    return {kind: 'angle', value: Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI};
  }

  function controller(onChange) {
    let molecule = null, entries = [], byGeometry = [], picks = [];
    const getSelection = () => ({molecule, atomIndices: picks.map(e => e.graphIndex), labels: picks.map(e => e.label)});
    function toggle(entry) {
      if (!entry) return false;
      if (picks.includes(entry)) picks = picks.filter(e => e !== entry);
      else picks = picks.length === 3 ? [entry] : [...picks, entry];
      onChange(getSelection());
      return true;
    }
    const api = {
      getSelection,
      toggleAtom(i, owner = molecule) {
        return owner === molecule && Number.isInteger(i) && entries[i]?.graphIndex === i && toggle(entries[i]);
      },
      clear() { if (picks.length) { picks = []; onChange(getSelection()); } }
    };
    return {
      api,
      reset(next, geometry, mapped) {
        if (molecule === next) return;
        molecule = next;
        ({entries, byGeometry} = next ? atomCatalog(next, geometry, mapped) : {entries: [], byGeometry: []});
        picks = [];
        onChange(getSelection(), true);
      },
      get entries() { return entries; }, get picks() { return picks; },
      toggleEntry(i) { return toggle(entries[i]); },
      toggleGeometry(i) { return toggle(byGeometry[i]); },
      slot(i) { return picks.indexOf(byGeometry[i]); },
      measurement() { return measure(picks); }
    };
  }

  const api = {atomCatalog, measure, controller};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AtomInspection = api;
})(typeof self !== 'undefined' ? self : globalThis);
