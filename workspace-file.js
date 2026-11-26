/* Explicit local workspace files. Store model inputs and the validated bench, not generated views. */
(function (root) {
  'use strict';
  const format = 'orgchem-workspace', version = 2, filename = 'workspace.orgchem.json';
  const maxRows = 8, maxChars = 4000, maxBytes = 4 * 1024 * 1024, maxId = 999999;
  const history = () => typeof module !== 'undefined' && module.exports ? require('./plate-history.js') : root.PlateHistory;
  const keys = (obj, fields) => obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
    Object.keys(obj).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(obj,k));
  function checked(doc) {
    const invalid = () => { throw Error('Invalid workspace'); };
    const legacy = doc?.version === 1, fields = ['format','version','view','rows'];
    if (!legacy) fields.push('bench');
    if (!keys(doc,fields) || doc.format !== format || (!legacy && doc.version !== version) ||
        !keys(doc.view,['mode','benzene']) || !['2d','3d'].includes(doc.view.mode) ||
        !['kekuleA','kekuleB','electrons','cloud'].includes(doc.view.benzene) ||
        !Array.isArray(doc.rows) || doc.rows.length > maxRows) invalid();
    const ids = new Set();
    for (const row of doc.rows) {
      if (!keys(row,['id','input','visible','picked']) || typeof row.picked !== 'boolean' || !Number.isInteger(row.id) || row.id < 1 || row.id > maxId ||
          ids.has(row.id) || typeof row.visible !== 'boolean' || typeof row.input !== 'string' ||
          row.input.length > maxChars || /[\x00-\x1f\x7f\ud800-\udfff]/u.test(row.input)) invalid();
      ids.add(row.id);
    }
    const plates = history();
    return {...doc,version,bench:legacy ? plates.empty() : plates.validate(doc.bench)};
  }
  function bounded(text) {
    if (typeof text !== 'string' || text.length > maxBytes || new Blob([text]).size > maxBytes) throw Error('Invalid file size');
    return text;
  }
  const serialize = ({view,rows,bench = history().empty()}) => bounded(JSON.stringify(checked({format,version,view,rows,bench}), null, 2) + '\n');
  const parse = text => checked(JSON.parse(bounded(text)));
  async function read(file) {
    if (!Number.isSafeInteger(file?.size) || file.size < 1 || file.size > maxBytes) throw Error('Invalid file size');
    const text = file.text ? await file.text() : await new Promise((resolve, reject) => {
      const reader = new root.FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = reader.onabort = () => reject(Error('Cannot read file')); reader.readAsText(file);
    });
    return parse(text);
  }
  function attach(capture, install, getOpenContext = () => null) {
    const doc = root.document, el = suffix => doc.getElementById('desk-file-' + suffix);
    const status = key => root.AtlasI18n.bindText(el('status'), 'workspaceFile.' + key);
    const blob = () => new Blob([serialize(capture())], {type:'application/json'});
    el('download').addEventListener('click', () => {
      try {
        const url = root.URL.createObjectURL(blob()), link = doc.createElement('a');
        try { link.href = url; link.download = filename; doc.body.append(link); link.click(); }
        finally { link.remove(); root.setTimeout(() => root.URL.revokeObjectURL(url), 1000); }
        status('downloaded');
      } catch { status('saveError'); }
    });
    const save = el('save');
    save.hidden = typeof root.showSaveFilePicker !== 'function' || root.isSecureContext !== true;
    save.addEventListener('click', async () => {
      let writer, picking = false;
      try {
        const data = blob();
        picking = true;
        const handle = await root.showSaveFilePicker({id:'orgchem-workspace',suggestedName:filename,
          types:[{description:root.AtlasI18n.t('workspaceFile.title'), accept:{'application/json':['.json']}}]});
        picking = false;
        writer = await handle.createWritable(); await writer.write(data); await writer.close(); status('saved');
      } catch (error) {
        if (writer) { try { await writer.abort(); } catch { /* May already be closed. */ } }
        status(picking && error?.name === 'AbortError' ? 'cancelled' : 'saveError');
      }
    });
    const picker = el('input'); let readId = 0;
    el('open').addEventListener('click', () => { ++readId; picker.click(); });
    picker.addEventListener('cancel', () => { ++readId; });
    picker.addEventListener('change', async () => {
      const id = ++readId;
      const file = picker.files[0]; picker.value = '';
      if (!file) return;
      let context = getOpenContext();
      const current = () => id === readId && getOpenContext() === context;
      // Async installers stage without mutation and apply both parts synchronously here.
      // Their own edits advance the context; subsequent user edits still invalidate it.
      const commit = apply => {
        if (!current()) return false;
        try { apply(); }
        finally { context = getOpenContext(); }
        return true;
      };
      try {
        const state = await read(file);
        if (!current()) return;
        const result = install(state,current,commit);
        if (result && typeof result.then === 'function') { if (await result === false) return; }
        else if (result === false) return;
        else context = getOpenContext(); // Legacy synchronous installer.
        if (current()) status('opened');
      } catch { if (current()) status('openError'); }
    });
  }
  const api = {maxRows, maxChars, maxBytes, maxId, filename, parse, read, serialize, attach};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkspaceFile = api;
})(typeof window !== 'undefined' ? window : globalThis);
