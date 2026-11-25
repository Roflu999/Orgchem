/* Single-structure model input. No formula enumeration, external lookups, or layout-derived lengths. */
(function (root) {
  'use strict';
  const ANGSTROM = 'Å';
  const fallback = (record, reason) => ({record, geometry: null, reason});

  function input(text) {
    if (typeof text !== 'string') return null;
    text = text.trim();
    if (!text || text.length > 4000 || /[\x00-\x1f\x7f]/.test(text) || /^formula\s*:/i.test(text)) return null;
    const prefix = /^(name|smiles)\s*:\s*/i.exec(text);
    if (prefix) text = text.slice(prefix[0].length);
    if (!text) return null;
    const kind = prefix ? prefix[1].toLowerCase() : root.Chem.looksLikeName(text) ? 'name' : 'smiles';
    return {text, kind};
  }

  function local(request) {
    if (!request) return null;
    try {
      return request.kind === 'name' ? root.Chem.resolveName(request.text)
        : root.Chem.describe(root.Chem.readSmiles(request.text));
    } catch (_) { return null; } // In particular, do NOT strip @, /, \\, charge or isotope syntax.
  }
  const preview = text => local(input(text));

  const abortError = () => Object.assign(Error('Model input cancelled.'), {name: 'AbortError'});
  function check(signal) { if (signal?.aborted) throw abortError(); }
  // Capability discovery is shared by the entire page. Cancel this waiter, not discovery itself.
  function wait(task, signal) {
    if (!signal) return task;
    check(signal);
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      signal.addEventListener('abort', abort, {once: true});
      Promise.resolve(task).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }

  function geometryBlock(record) {
    const stereo = record.stereo;
    if (!Array.isArray(stereo?.centers) || !Array.isArray(stereo.bonds) || !Array.isArray(stereo.unsupported) || stereo.unsupported.length) return 'unsupported-stereo';
    if (stereo.centers.concat(stereo.bonds).some(s => !s.specified)) return 'unspecified-stereo';
    // No relative placement of separate fragments is determined by their connectivity.
    const neighbors = record.atoms.map(() => []);
    for (const {a,b} of record.bonds) { neighbors[a].push(b); neighbors[b].push(a); }
    const seen = new Set([0]);
    for (const a of seen) for (const b of neighbors[a]) seen.add(b);
    return seen.size === neighbors.length ? null : 'disconnected';
  }

  const validPoint = a => a && [a.x, a.y, a.z].every(Number.isFinite);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  function selectedGeometry(record) {
    if (record.provenance?.toolkit !== 'RDKit') return null;
    const conformer = record.conformers?.find(c => c.id === record.selectedConformerId);
    if (!conformer?.stereoVerification?.verified) return null;
    const {atoms, bonds} = conformer;
    if (!Array.isArray(atoms) || !atoms.length || !Array.isArray(bonds) || atoms.some(a => !validPoint(a) || !a.atomId || !a.e)) return null;
    if (new Set(atoms.map(a => a.atomId)).size !== atoms.length || record.atomIds.some((id,i) => id !== atoms[i]?.atomId || record.atoms[i] !== atoms[i].e)) return null;
    const inRange = i => Number.isInteger(i) && i >= 0 && i < atoms.length;
    if (bonds.some(({a,b}) => !inRange(a) || !inRange(b) || distance(atoms[a],atoms[b]) < 1e-5)) return null;
    return {atoms, bonds, conformer, unit: ANGSTROM};
  }

  // Given a parsed same-origin record, never reparse its canonical SMILES: that
  // can change atom order and detach a selected site from its chemistry.
  async function resolveMapped(mapped, {signal} = {}) {
    check(signal);
    root.MoleculeRecords.validate(mapped);
    const blocked = geometryBlock(mapped);
    if (blocked) return fallback(mapped, blocked);
    const existing = selectedGeometry(mapped);
    if (existing) return {record:mapped, geometry:existing, reason:null};
    const client = root.ChemistryClient;
    if (!client) return fallback(mapped, 'offline');
    await wait(client.ready, signal); check(signal);
    if (!client.available) return fallback(mapped, 'offline');
    try {
      // The mapped MOL block carries bonds, atom properties, stereochemistry
      // and any supplied 3D frame. SVG depictions and layouts are not inputs.
      const {schema, molblock, atoms, atomIds, charges, conformers, selectedConformerId} = mapped;
      const molecule = {schema, molblock, atoms, atomIds, charges};
      if (conformers?.length) Object.assign(molecule, {conformers, selectedConformerId});
      const generated = await wait(client.job('conformers', {molecule, count:1}, {signal}), signal);
      check(signal);
      const next = root.MoleculeRecords.validate(generated.molecule);
      if (next.stereoisomerId === mapped.stereoisomerId && next.atomIds.length === mapped.atomIds.length &&
          next.atomIds.every((id,i) => id === mapped.atomIds[i] && next.atoms[i] === mapped.atoms[i])) {
        const geometry = selectedGeometry(next);
        if (geometry) return {record:next, geometry, reason:null};
      }
    } catch (e) { if (signal?.aborted || e?.name === 'AbortError') throw abortError(); }
    return fallback(mapped, 'no-conformer');
  }

  async function resolve(text, {signal} = {}) {
    check(signal);
    const request = input(text);
    if (!request) return fallback(null, 'invalid-input');
    const legacy = local(request), client = root.ChemistryClient;
    let record = legacy, reason = 'offline';
    try {
      if (!client) return fallback(record, reason);
      await wait(client.ready, signal);
      check(signal);
      if (!client.available) return fallback(record, reason);
      const fromName = request.kind === 'name';
      if (fromName && !legacy && !client.capabilities?.opsinAvailable) return fallback(null, 'name-unavailable');
      reason = 'parse-failed';
      // Send original SMILES (not the legacy canonicalization, which folds explicit H).
      const parsed = await wait(client.parse(fromName && legacy ? legacy.notation : request.text,
        fromName && !legacy ? 'name' : 'smiles', {signal}), signal);
      check(signal);
      if (parsed?.molecules?.length !== 1) return fallback(record, reason);
      const mapped = root.MoleculeRecords.validate(parsed.molecules[0]);
      if (!mapped.atoms.length) return fallback(record, reason);
      const label = fromName ? {name: legacy?.name || mapped.name, knownName: true, nameSource: legacy?.nameSource || mapped.nameSource} : {};
      record = {...mapped, ...label};
      reason = 'no-conformer';
      const resolved = await resolveMapped(mapped, {signal});
      return {...resolved, record:{...resolved.record, ...label}};
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError') throw abortError();
      return fallback(record, reason || 'no-conformer');
    }
  }

  // Maximum internuclear distance of THIS conformer, including hydrogens; not a van der Waals diameter.
  function size(geometry) {
    if (geometry?.unit !== ANGSTROM || !Array.isArray(geometry.atoms) || !geometry.atoms.length || !geometry.atoms.every(validPoint)) return null;
    const atoms = geometry.atoms;
    let max = 0;
    for (let i = 0; i < atoms.length; i++) for (let j = 0; j < i; j++) max = Math.max(max, distance(atoms[i], atoms[j]));
    return max;
  }

  function bondLength(geometry, a, b) {
    if (geometry?.unit !== ANGSTROM || !Number.isInteger(a) || !Number.isInteger(b) || a === b || !Array.isArray(geometry.bonds)) return null;
    if (!geometry.bonds.some(edge => (a === edge.a && b === edge.b) || (b === edge.a && a === edge.b))) return null;
    const p = geometry.atoms?.[a], q = geometry.atoms?.[b];
    return validPoint(p) && validPoint(q) ? distance(p, q) : null;
  }

  const api = {preview, resolve, resolveMapped, geometryBlock, selectedGeometry, size, bondLength};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ModelInput = api;
})(typeof window !== 'undefined' ? window : globalThis);
