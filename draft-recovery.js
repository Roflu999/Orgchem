/* One opt-in simulator checkpoint per origin. A missing key means no consent. */
(function (root) {
  'use strict';
  const M = root.MoleculeSketcher || require('./sketcher-model.js');
  const records = root.MoleculeRecords || require('./molecule-record.js');
  const key = 'bond-atlas.simulator-recovery.v1';
  const limit = 1024 * 1024; // Bound the synchronous storage read/JSON parse.

  function checked(draft) {
    if (draft.engine !== undefined && draft.engine !== 'rdkit') throw Error('Unknown engine');
    if (draft.sourceRecord !== undefined) {
      if (draft.engine !== 'rdkit') throw Error('Missing engine');
      records.validate(draft.sourceRecord);
    }
    if (draft.engine === 'rdkit' && [...draft.atoms, ...draft.bonds].some(part => !part.id)) throw Error('Missing mapping');
    return M.checked(draft); // Structural checks, not chemical identification.
  }

  function create(storage, display) {
    let raw, pending = null, enabled = false, status = '', lastDraft;
    const show = () => display({enabled, pending: !!pending, status});
    function refresh() {
      let value;
      try { value = storage().getItem(key); }
      catch { enabled = false; pending = null; raw = undefined; status = 'unavailable'; show(); return false; }
      if (value === raw) return true;
      raw = value; enabled = false; pending = null; status = '';
      if (raw !== null) {
        try {
          if (raw.length > limit) throw Error('Too large');
          const entry = JSON.parse(raw);
          if (entry.version !== 1) throw Error('Unknown version');
          pending = entry.draft === null ? null : checked(entry.draft);
          enabled = true; status = pending ? 'pending' : '';
        } catch { status = 'invalid'; }
      }
      show(); return false; // A changed checkpoint must be acknowledged before overwriting it.
    }
    function write(draft) {
      try {
        const value = JSON.stringify({version:1, draft:draft?.atoms.length ? checked(draft) : null});
        if (value.length > limit) throw Error('Too large');
        storage().setItem(key, value);
        raw = value; enabled = true; pending = null; status = '';
      } catch { status = 'notSaved'; }
      show();
    }
    function disable() {
      enabled = false; pending = null;
      try { storage().removeItem(key); raw = null; status = ''; }
      catch { status = 'notRemoved'; }
      show();
    }
    refresh();
    return {
      refresh, disable,
      enable(draft) { if (refresh() && raw === null) write(draft); },
      changed(draft, automaticExample = false) {
        if (lastDraft === draft) return;
        lastDraft = draft;
        if (enabled && !pending && !automaticExample && refresh()) write(draft);
      },
      restore(install) {
        if (!refresh() || !pending) return;
        install(pending); // Remain pending while the editor renders and identifies it.
        lastDraft = pending; pending = null; status = ''; show();
      },
      discard() {
        if (!refresh()) return;
        if (enabled && pending) write(null); else if (!enabled) disable();
      }
    };
  }

  function attach(getDraft, install) {
    const doc = root.document, el = suffix => doc.getElementById('draft-recovery-' + suffix);
    const toggle = el('enable'), restore = el('restore'), discard = el('discard'), message = el('status');
    const recovery = create(() => root.localStorage, ({enabled, pending, status}) => {
      toggle.checked = enabled;
      toggle.disabled = ['unavailable','invalid','notRemoved'].includes(status);
      restore.hidden = !pending;
      discard.hidden = !pending && status !== 'invalid' && status !== 'notRemoved';
      message.hidden = !status;
      if (status) root.AtlasI18n.bindText(message, 'recovery.' + status);
    });
    toggle.addEventListener('change', () => toggle.checked ? recovery.enable(getDraft()) : recovery.disable());
    restore.addEventListener('click', () => { recovery.restore(install); if (restore.hidden) toggle.focus(); });
    discard.addEventListener('click', () => { recovery.discard(); if (discard.hidden) toggle.focus(); });
    root.addEventListener('storage', event => { if (event.key === key || event.key === null) recovery.refresh(); });
    return recovery;
  }
  const api = {key, create, attach};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasDraftRecovery = api;
})(typeof window !== 'undefined' ? window : globalThis);
