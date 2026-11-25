/* Explicit local workspace files. Store editable inputs, never calculated records or markup. */
(function (root) {
  'use strict';
  const format = 'orgchem-workspace', version = 1, filename = 'workspace.orgchem.json';
  const maxRows = 8, maxChars = 4000, maxBytes = 128 * 1024, maxId = 999999;
  const keys = (obj, fields) => obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
    Object.keys(obj).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(obj,k));
  function checked(doc) {
    const invalid = () => { throw Error('Invalid workspace'); };
    if (!keys(doc,['format','version','view','rows']) || doc.format !== format || doc.version !== version ||
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
    return doc;
  }
  const serialize = ({view, rows}) => JSON.stringify(checked({format,version,view,rows}), null, 2) + '\n';
  function parse(text) {
    if (typeof text !== 'string' || text.length > maxBytes || new Blob([text]).size > maxBytes) throw Error('Invalid file size');
    return checked(JSON.parse(text));
  }
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
        const handle = await root.showSaveFilePicker({suggestedName:filename,
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
    picker.addEventListener('change', async () => {
      const file = picker.files[0]; picker.value = '';
      if (!file) return;
      const id = ++readId, context = getOpenContext();
      const current = () => id === readId && getOpenContext() === context;
      let state;
      try { state = await read(file); }
      catch { if (current()) status('openError'); return; }
      if (!current()) return;
      try { install(state); status('opened'); }
      catch { status('openError'); }
    });
  }
  const api = {maxRows, maxChars, maxBytes, maxId, filename, parse, read, serialize, attach};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkspaceFile = api;
})(typeof window !== 'undefined' ? window : globalThis);
