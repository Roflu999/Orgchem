/* Portable plate identities, not calculated records. Parent snapshots have no
   history of their own, so deleting a parent is safe and branching stays bounded. */
(function (root) {
  'use strict';
  const cjs = typeof module !== 'undefined' && module.exports;
  const chemistry = cjs ? require('./plate-chemistry.js') : root.PlateChemistry;
  const stocks = new Map(chemistry.stock.map(s => [s.id,s]));
  const conditions = new Set(chemistry.conditions.map(c => c.id));
  const roles = ['substrate','reagent','catalyst','solvent'];
  const pathways = new Set(['reagent-preparation','carbonyl-hydride','alkene-hydrogenation','nitrile-hydrogenation',
    'aldehyde-oxidation','oxidation-ketone','oxidation-acid','oxidation-aldehyde','hydroxide-sn2','haloalkane-elimination',
    'acyl-water','acyl-ethanol','radical-chlorination']);
  const limit = 48, maxSerial = 999999999;
  const empty = () => ({plates:[],serial:0,left:'',right:'',condition:'ambient'});
  const requireThat = ok => { if (!ok) throw Error('Invalid plate bench'); };
  const shape = (obj, fields) => obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
    Object.keys(obj).length === fields.length && fields.every(k => Object.hasOwn(obj,k));
  const text = (s, max, optional=false) => typeof s === 'string' && (optional || s.trim().length > 0) &&
    s.length <= max && !/[\x00-\x1f\x7f\ud800-\udfff]/u.test(s);
  const identity = ['id','role','label','smiles','stockId','medium','catalyst'];
  function validate(bench) {
    requireThat(shape(bench,['plates','serial','left','right','condition']) && Array.isArray(bench.plates) &&
      bench.plates.length <= limit && Number.isInteger(bench.serial) && bench.serial >= 0 && bench.serial <= maxSerial && conditions.has(bench.condition));
    const seen = new Map(), live = new Set();
    function snapshot(p, child) {
      requireThat(shape(p, child ? [...identity,'history'] : identity) && typeof p.id === 'string' && /^[1-9]\d{0,8}$/.test(p.id) &&
        Number(p.id) <= bench.serial && roles.includes(p.role) && text(p.label,4000) && text(p.smiles,3993) &&
        (p.stockId === '' || stocks.get(p.stockId)?.roles.includes(p.role) && p.smiles === stocks.get(p.stockId).smiles) &&
        (p.medium === '' || p.role !== 'solvent' && stocks.get(p.medium)?.roles.includes('solvent')) &&
        (p.catalyst === '' || p.role === 'reagent' && stocks.get(p.catalyst)?.roles.includes('catalyst')));
      const copy = Object.fromEntries(identity.map(k => [k,p[k]]));
      // The same ID can occur on several saved cards (including after removal),
      // but it cannot refer to different structures or carry different contents.
      const prior = seen.get(p.id);
      requireThat(!prior || identity.every(k => prior[k] === copy[k]));
      seen.set(p.id,copy);
      return copy;
    }
    const plates = Array.from(bench.plates, p => {
      const copy = snapshot(p,true), h = p.history;
      requireThat(!live.has(p.id)); live.add(p.id);
      if (h === null) return {...copy,history:null};
      requireThat(shape(h,['parents','pathway','label','condition','branch']) && pathways.has(h.pathway) && text(h.label,200) &&
        conditions.has(h.condition) && Array.isArray(h.parents) && h.parents.length === 2 &&
        shape(h.branch,['index','label','sites']) && Number.isInteger(h.branch.index) && h.branch.index >= 0 && h.branch.index < 4096 &&
        text(h.branch.label,8192) && text(h.branch.sites,16384,true));
      const parents = Array.from(h.parents, parent => snapshot(parent,false));
      requireThat(parents[0].id !== parents[1].id && parents.every(parent => Number(parent.id) < Number(p.id)));
      const preparation = h.pathway === 'reagent-preparation';
      requireThat(parents.some(parent => parent.role === 'reagent') && (preparation ?
        p.role === 'reagent' && parents.some(parent => ['solvent','catalyst'].includes(parent.role)) :
        p.role === 'substrate' && parents.some(parent => parent.role === 'substrate')));
      return {...copy,history:{parents,pathway:h.pathway,label:h.label,condition:h.condition,branch:{...h.branch}}};
    });
    // The UI also permits selecting the same plate twice; preserve that state
    // (the reaction button stays disabled) rather than silently changing it.
    requireThat((plates.length ? live.has(bench.left) : bench.left === '') &&
      (live.has(bench.right) || plates.length <= 1 && bench.right === ''));
    return {plates,serial:bench.serial,left:bench.left,right:bench.right,condition:bench.condition};
  }
  const api = {empty,validate,limit,maxSerial};
  if (cjs) module.exports = api;
  else root.PlateHistory = api;
})(typeof window !== 'undefined' ? window : globalThis);
