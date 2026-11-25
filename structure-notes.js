/* Readouts follow the selected graph, never its display name. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const bind = (el, key, params, fallback) => AtlasI18n.bindText(el, key, params, fallback);
  function evidence(list, labelKey, atomText, fallback) {
    const row = document.createElement('li'), label = document.createElement('span');
    const atoms = document.createElement('bdi');
    atoms.dir = 'ltr'; atoms.textContent = atomText;
    bind(label, labelKey, {}, fallback); row.append(label, ': ', atoms); list.append(row);
  }
  document.addEventListener('bondatlas:selection', event => {
    const m = event.detail.molecule, toolkit = MoleculeRecords.isRecord(m);
    const info = !m ? null : toolkit ? m.structureInsights : Chem.offlineInsights(m);
    const panel = $('structure-notes'); panel.hidden = !info;
    if (!info) return; // Older toolkit records must not be interpreted as neutral offline graphs.
    const groups = $('notes-groups'), sites = $('notes-sites');
    groups.replaceChildren(); sites.replaceChildren();
    const families = toolkit ? info.functionalGroups : m.tags.filter(key =>
      !(['alcohol','halogenoalkane'].includes(key) && m.tags.some(t => t.endsWith('-' + key))) && key !== 'cyclic'
    ).map(key => ({key}));
    const mappedAtom = i => m.atoms[i] + ' (' + m.atomIds[i] + ')';
    function matchedBonds(ids) {
      const members = new Set(ids);
      const bonds = m.bonds.filter(b => members.has(m.atomIds[b.a]) && members.has(m.atomIds[b.b]));
      return bonds.length ? bonds.map(b => mappedAtom(b.a) + ({1:'–', 1.5:':', 2:'=', 3:'≡'}[b.order] || ' ~ ') + mappedAtom(b.b)).join('; ')
        : ids.map(id => mappedAtom(m.atomIds.indexOf(id))).join(', ');
    }
    for (const {key,label,matches} of families) {
      const item = document.createElement('li'), name = document.createElement('span');
      bind(name, 'explorer.tag.' + key, {}, label || key); item.append(name);
      if (matches?.length > 1) item.append(' ×' + matches.length);
      groups.append(item);
      if (matches) evidence(sites, 'explorer.tag.' + key, matches.map(matchedBonds).join('  /  '), label);
    }
    if (!families.length) {
      const item = document.createElement('li'); bind(item, 'notes.noMatch'); groups.append(item);
    }
    if (toolkit) {
      const supported = Number.isInteger(info.hBondDonors) && Number.isInteger(info.hBondAcceptors);
      bind($('notes-hbond'), supported ? 'notes.hbond' : 'notes.outside', {donors:info.hBondDonors, acceptors:info.hBondAcceptors});
      bind($('notes-topology'), 'notes.rings', {rings:info.independentRingCount});
    } else {
      bind($('notes-hbond'), info.donorSites.length ? 'notes.donates' : 'notes.noDonor');
      if (info.donorSites.length) evidence(sites, 'notes.donorSites', info.donorSites.map(i => m.atoms[i] + ' (a' + (i+1) + ')').join(', '));
      bind($('notes-topology'), 'notes.bonds', {rings:info.independentRingCount, doubles:info.doubles, triples:info.triples});
    }
    bind($('notes-limits'), BondAtlas.state.result?.imported ? 'notes.limits' : 'notes.candidate');
  });
})();
