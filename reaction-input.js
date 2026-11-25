/* Resolve a single structure without running conformer generation or formula enumeration. */
(function (root) {
  'use strict';
  async function parse(value, {signal} = {}) {
    const raw = String(value).trim();
    if (!raw || raw.length > 4000 || /[\x00-\x1f\x7f]/.test(raw)) throw Error('Enter one name or SMILES (up to 4,000 characters).');
    const local = root.ModelInput.preview(raw), prefix = raw.match(/^(smiles|name):\s*/i);
    const text = prefix ? raw.slice(prefix[0].length) : raw;
    const format = prefix ? prefix[1].toLowerCase() : root.Chem.looksLikeName(text) ? 'name' : 'smiles';
    const client = root.ChemistryClient;
    await client?.ready;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!client?.available) {
      if (local) return local;
      throw Error('This structure needs the local RDKit chemistry service.');
    }
    const result = await client.parse(format === 'name' && local ? local.notation : text,
      format === 'name' && local ? 'smiles' : format, {signal});
    if (result.molecules?.length !== 1) throw Error('Use one substance per plate.');
    return root.MoleculeRecords.validate(result.molecules[0]);
  }
  function formulaNote(record) {
    if (!record) return '';
    const units = record.metadata?.dbe;
    const prefix = record.formula ? record.formula + ' · ' : '';
    if (!(record.metadata?.counts?.C > 0 && Number.isInteger(units) && units >= 0))
      return prefix + 'Hydrogen deficiency (DBE): not applicable to this structure under the school-level formula.';
    const h = 2 * units;
    return `${prefix}Hydrogen deficiency: ${units} DBE (${h} H atoms short of the saturated, open-chain formula).`;
  }
  root.ReactionInput = {parse, formulaNote};
})(window);
