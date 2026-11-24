/* Immutable sketch drafts. Coordinates never determine chemical connectivity. */
(function (root) {
  'use strict';
  const Chem = root.Chem || (typeof require === 'function' ? require('./chemistry.js') : null);
  const VAL = Object.freeze({ C: 4, H: 1, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1 });
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const key = (a, b) => Math.min(a, b) + ':' + Math.max(a, b);
  function record(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw Error('Use an object with own atom/bond properties.');
    return o;
  }
  function field(o, k) {
    const p = Object.getOwnPropertyDescriptor(record(o), k);
    if (!p || !own(p, 'value')) throw Error('Missing own data property: ' + k + '.');
    return p.value;
  }
  function array(o, k) {
    const a = field(o, k);
    if (!Array.isArray(a)) throw Error(k + ' must be an array.');
    return a;
  }
  // Reject holes, inherited entries and accessors without invoking user getters.
  function item(a, i) {
    const p = Object.getOwnPropertyDescriptor(a, i);
    if (!p || !own(p, 'value')) throw Error('Atom/bond arrays must contain own data entries without holes.');
    return p.value;
  }
  const PERIODIC = new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '));
  function element(e, advanced = false) {
    if (typeof e !== 'string' || !(advanced ? PERIODIC.has(e) : own(VAL, e))) throw Error('Supported elements: C, H, N, O, F, Cl, Br, I. Use toolkit mode for other periodic-table elements.');
  }
  function index(i, n) {
    if (!Number.isInteger(i) || i < 0 || i >= n) throw Error('Invalid atom index: use a zero-based index of an existing atom.');
  }
  function edge(a, b, order, n) {
    index(a, n); index(b, n);
    if (a === b) throw Error('Self-bonds are not allowed.');
    if (!Number.isInteger(order) || order < 1 || order > 3) throw Error('Bond order must be 1, 2 or 3.');
  }
  function used(d) {
    const sums = d.atoms.map(() => 0);
    d.bonds.forEach(b => { sums[b.a] += b.order; sums[b.b] += b.order; });
    return sums;
  }
  let serial = 0;
  function cloneData(value, parents = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || parents.has(value)) throw Error('Source records must contain finite, acyclic JSON data.');
    parents.add(value);
    const copy = Array.isArray(value) ? Array.from({ length:value.length }, (_, i) => cloneData(item(value, i), parents)) : Object.fromEntries(Object.keys(value).map(k => [k, cloneData(field(value, k), parents)]));
    parents.delete(value); return copy;
  }
  function identity(id, limit = 100) {
    if (typeof id !== 'string' || !id || id.length > limit) throw Error('Atom/bond IDs must be nonempty strings of at most ' + limit + ' characters.');
    return id;
  }
  function freshId(prefix, reserved) {
    let id; do { id = 'sketch-' + prefix + (++serial); } while (reserved.has(id));
    return id;
  }
  // Toolkit drafts retain their authoritative source. Legacy drafts remain metadata-free.
  function checked(draft) {
    const aa = array(draft, 'atoms'), bb = array(draft, 'bonds');
    const advanced = own(draft, 'engine') && field(draft, 'engine') === 'rdkit';
    if (aa.length > 256 || bb.length > 512) throw Error(advanced ? 'Use at most 256 atoms and 512 bonds.' : 'Use at most 64 heavy atoms and 256 total atoms.');
    let sourceRecord;
    if (advanced && own(draft, 'sourceRecord')) {
      sourceRecord = cloneData(field(draft, 'sourceRecord'));
      if (sourceRecord.schema !== 'bond-atlas/3' || !Array.isArray(sourceRecord.atomIds)) throw Error('Use a mapped v3 sourceRecord.');
    }
    const reserved = new Set([...(sourceRecord?.atomIds || []), ...(sourceRecord?.bonds || []).map(b => b.id)]);
    if (advanced) [aa, bb].forEach(list => { for (let i = 0; i < list.length; i++) { const entry = item(list, i); if (entry && own(entry, 'id')) reserved.add(field(entry, 'id')); } });
    const atoms = [], bonds = [], seen = new Set(), atomIds = new Set(), bondIds = new Set();
    let heavy = 0;
    for (let i = 0; i < aa.length; i++) {
      const a = item(aa, i), e = field(a, 'e'), x = field(a, 'x'), y = field(a, 'y');
      element(e, advanced);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Atom coordinates must be finite numbers.');
      if (!advanced && e !== 'H' && ++heavy > 64) throw Error('Use at most 64 heavy atoms and 256 total atoms.');
      const charge = own(a, 'charge') ? field(a, 'charge') : 0;
      if (advanced) {
        const isotope = own(a, 'isotope') ? field(a, 'isotope') : 0;
        if (!Number.isInteger(charge) || charge < -16 || charge > 16) throw Error('Formal charge must be an integer from -16 to +16.');
        if (!Number.isInteger(isotope) || isotope < 0 || isotope > 400) throw Error('Isotope must be an integer from 0 to 400.');
        const id = identity(own(a, 'id') ? field(a, 'id') : freshId('a', reserved));
        if (atomIds.has(id)) throw Error('Duplicate atom IDs are not allowed.');
        atomIds.add(id); reserved.add(id); atoms.push({ e, x, y, id, charge, isotope });
      } else {
        if (!Number.isInteger(charge) || charge < 0 || charge > 1 || (charge && e !== 'C')) throw Error('This editor supports neutral atoms and carbon +1 carbocations only.');
        atoms.push({ e, x, y, ...(charge ? { charge } : {}) });
      }
    }
    for (let i = 0; i < bb.length; i++) {
      const b = item(bb, i), a = field(b, 'a'), end = field(b, 'b'), order = field(b, 'order');
      edge(a, end, order, atoms.length);
      const k = key(a, end);
      if (seen.has(k)) throw Error('Duplicate bonds are not allowed; use setBond to replace an edge.');
      seen.add(k);
      if (advanced) {
        const id = identity(own(b, 'id') ? field(b, 'id') : freshId('b', reserved), 256);
        if (bondIds.has(id)) throw Error('Duplicate bond IDs are not allowed.');
        bondIds.add(id); reserved.add(id); bonds.push({ a, b: end, order, id });
      } else bonds.push({ a, b: end, order });
    }
    const d = { atoms, bonds, ...(advanced ? { engine: 'rdkit', ...(sourceRecord ? { sourceRecord } : {}) } : {}) };
    if (advanced) return d; // Chemical valence, aromaticity and stereo belong to RDKit.
    const sums = used(d);
    atoms.forEach((a, i) => {
      if (a.charge && d.bonds.some(b => (b.a === i || b.b === i) && b.order !== 1)) throw Error('The carbocation tool models classical C+ centers with single bonds only, not vinylic or aromatic cations.');
      const maximum = VAL[a.e] - (a.charge || 0);
      if (sums[i] > maximum) throw Error('Neutral valence / carbocation valence exceeded at atom ' + (i + 1) + ' (' + a.e + '): maximum ' + maximum + '. Remove or lower a bond first.');
    });
    return d;
  }
  function edit(draft, change) {
    const next = checked(draft);
    change(next);
    return checked(next);
  }
  function empty(engine) { return { atoms: [], bonds: [], ...(engine === 'rdkit' ? { engine } : {}) }; }
  function toAdvanced(draft) {
    const d = checked(draft);
    return d.engine === 'rdkit' ? d : checked({ ...d, engine: 'rdkit' });
  }
  function chemicalSignature(draft) {
    const d = checked(draft);
    return JSON.stringify({ engine: d.engine, sourceRecord: d.sourceRecord, atoms: d.atoms.map(({ x, y, ...a }) => a), bonds: d.bonds });
  }
  function addAtom(draft, e, x, y) {
    return edit(draft, d => { d.atoms.push({ e, x, y }); });
  }
  function moveAtom(draft, i, x, y) {
    return edit(draft, d => { index(i, d.atoms.length); d.atoms[i].x = x; d.atoms[i].y = y; });
  }
  // Pin the dragged atoms and relax bond-length springs in their connected component.
  // Rest lengths are from the drawing, not measured molecular distances.
  function elasticDrag(draft, pins, dx, dy) {
    const d = checked(draft), fixed = new Set(pins);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw Error('Drag offsets must be finite.');
    const neighbors = d.atoms.map(() => []);
    for (const {a,b} of d.bonds) { neighbors[a].push(b); neighbors[b].push(a); }
    const component = new Set(fixed);
    for (const i of component) {
      index(i, d.atoms.length);
      for (const j of neighbors[i]) component.add(j);
    }
    const springs = d.bonds.filter(b => component.has(b.a)).map(({a,b}) => {
      const p = d.atoms[a], q = d.atoms[b];
      return {a,b,length:Math.hypot(q.x-p.x,q.y-p.y)};
    });
    for (const i of fixed) { d.atoms[i].x += dx; d.atoms[i].y += dy; }
    for (let step = 0; step < 10; step++) {
      for (const {a,b,length} of springs) {
        const p = d.atoms[a], q = d.atoms[b];
        let x = q.x-p.x, y = q.y-p.y, distance = Math.hypot(x,y);
        if (!distance) { x = draft.atoms[b].x-draft.atoms[a].x; y = draft.atoms[b].y-draft.atoms[a].y; }
        const scale = .45 * (distance-length) / (distance || length || 1);
        if (!fixed.has(a)) { p.x += x*scale; p.y += y*scale; }
        if (!fixed.has(b)) { q.x -= x*scale; q.y -= y*scale; }
      }
    }
    return d;
  }
  function setElement(draft, i, e) {
    return edit(draft, d => { index(i, d.atoms.length); d.atoms[i].e = e; });
  }
  function setCharge(draft, i, charge) {
    return edit(draft, d => {
      if (d.engine !== 'rdkit' && (!Number.isInteger(charge) || charge < 0 || charge > 1)) throw Error('Formal charge must be 0 or +1.');
      index(i, d.atoms.length);
      if (charge || d.engine === 'rdkit') d.atoms[i].charge = charge; else delete d.atoms[i].charge;
    });
  }
  function setBond(draft, a, b, order) {
    return edit(draft, d => {
      edge(a, b, order, d.atoms.length);
      const previous = d.bonds.find(v => key(v.a, v.b) === key(a, b));
      if (previous) previous.order = order;
      else d.bonds.push({ a, b, order });
    });
  }
  function removeAtom(draft, i) {
    return edit(draft, d => {
      index(i, d.atoms.length); d.atoms.splice(i, 1);
      d.bonds = d.bonds.filter(v => v.a !== i && v.b !== i).map(v => ({ ...v, a: v.a > i ? v.a - 1 : v.a, b: v.b > i ? v.b - 1 : v.b }));
    });
  }
  function removeBond(draft, a, b) {
    return edit(draft, d => {
      edge(a, b, 1, d.atoms.length);
      d.bonds = d.bonds.filter(v => key(v.a, v.b) !== key(a, b));
    });
  }
  function fromStructure(iso, layout) {
    if (own(record(iso), 'schema') && field(iso, 'schema') === 'bond-atlas/3') {
      layout = layout || iso.layouts?.skeletal;
      const elements = array(iso, 'atoms'), positions = array(layout, 'atoms');
      const ids = array(iso, 'atomIds'), charges = array(iso, 'charges'), isotopes = array(iso, 'isotopes');
      if ([positions, ids, charges, isotopes].some(a => a.length !== elements.length)) throw Error('Mapped atom, isotope, charge and layout counts must agree.');
      const atoms = elements.map((_, i) => {
        const a = item(positions, i), e = item(elements, i);
        if (field(a, 'e') !== e) throw Error('Layout element order must match the structure.');
        return { e, x: field(a, 'x'), y: field(a, 'y'), id: item(ids, i), charge: item(charges, i), isotope: item(isotopes, i) };
      });
      const d = checked({ engine: 'rdkit', sourceRecord: iso, atoms, bonds: array(iso, 'bonds') });
      const placed = checked({ engine: 'rdkit', atoms, bonds: array(layout, 'bonds') });
      const edges = new Map(d.bonds.map(b => [key(b.a, b.b), b.order]));
      if (placed.bonds.length !== edges.size || placed.bonds.some(b => edges.get(key(b.a, b.b)) !== b.order)) throw Error('Layout bonds must match the structure.');
      return normalize(d);
    }
    const elements = array(iso, 'atoms'), placed = checked(layout);
    if (elements.length !== placed.atoms.length) throw Error('Layout must contain one position per structure atom.');
    for (let i = 0; i < elements.length; i++) {
      const e = item(elements, i); element(e);
      if (e !== placed.atoms[i].e) throw Error('Layout element order must match the structure.');
    }
    const charges = own(iso, 'charges') ? array(iso, 'charges') : elements.map(() => 0);
    if (charges.length !== elements.length) throw Error('Charge count must match atoms.');
    const d = checked({ atoms: placed.atoms.map((a, i) => ({ ...a, charge: item(charges, i) })), bonds: array(iso, 'bonds') });
    const edges = new Map(d.bonds.map(b => [key(b.a, b.b), b.order]));
    if (placed.bonds.length !== edges.size || placed.bonds.some(b => edges.get(key(b.a, b.b)) !== b.order)) throw Error('Layout bonds must match the structure.');
    return normalize(d);
  }
  function normalize(d) {
    if (!d.atoms.length) return d;
    const xs = d.atoms.map(a => a.x), ys = d.atoms.map(a => a.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // Normalize differences before centering, avoiding overflow and tiny-span underflow.
    const divisor = Number.isFinite(maxX - minX) && Number.isFinite(maxY - minY) ? 1 : 2;
    const left = minX / divisor, top = minY / divisor;
    const w = maxX / divisor - left, h = maxY / divisor - top, span = Math.max(w, h);
    const rw = span ? w / span : 0, rh = span ? h / span : 0;
    const scale = span ? Math.min(800 / rw, 360 / rh) : 0;
    d.atoms.forEach(a => {
      a.x = span ? 500 + ((a.x / divisor - left) / span - rw / 2) * scale : 500;
      a.y = span ? 260 + ((a.y / divisor - top) / span - rh / 2) * scale : 260;
    });
    return d;
  }
  function analyze(draft) {
    let hydrogens = [];
    const invalid = message => ({ valid: false, message, structure: null, hydrogens });
    try {
      const d = checked(draft), sums = used(d);
      if (d.engine === 'rdkit') return invalid('This draft requires asynchronous RDKit analysis through ChemistryClient; no offline chemical identity is inferred.');
      hydrogens = d.atoms.map((a, i) => a.e === 'H' ? 0 : VAL[a.e] - (a.charge || 0) - sums[i]);
      if (d.atoms.some(a => a.charge)) return invalid('Use the scene analyzer for positively charged carbocation intermediates.');
      if (!d.atoms.length) return invalid('Add a carbon atom to start a molecule. Unused heavy-atom valences will fill with implicit hydrogens.');
      if (!Chem || typeof Chem.describe !== 'function') return invalid('Load chemistry.js before analyzing a molecule.');
      const raw = { atoms: d.atoms.map(a => a.e), m: d.atoms.map(() => d.atoms.map(() => 0)) };
      d.bonds.forEach(b => { raw.m[b.a][b.b] = raw.m[b.b][b.a] = b.order; });
      let structure, graphToDraft;
      try { structure = Chem.describe(raw, undefined, order=>{graphToDraft=order;}); }
      catch (error) {
        if (d.atoms.some((a, i) => a.e === 'H' && sums[i] !== 1)) return invalid('Attach each explicit hydrogen (H) to a heavy atom with one single bond, or delete it.');
        if (!raw.atoms.includes('C')) return invalid('Add a carbon atom and connect the atoms; only carbon-containing organic structures are supported.');
        if (/disconnected/i.test(error.message)) return invalid('Connect all atoms into one molecule, or delete the separate fragments before identifying the structure.');
        return invalid(error.message);
      }
      if (!structure.knownName) structure = { ...structure, name: 'Unmapped structure', knownName: false };
      return { valid: true, graphToDraft, message: structure.knownName ? 'Valid structure. Unused heavy-atom valences are filled with implicit hydrogens.' : 'Valid structure; no name in the offline name map.', structure, hydrogens };
    } catch (error) { return invalid(error.message); }
  }
  const api = { empty, addAtom, moveAtom, elasticDrag, setElement, setCharge, setBond, removeAtom, removeBond, fromStructure, analyze, validate: checked, checked, toAdvanced, chemicalSignature, VAL, PERIODIC: Object.freeze([...PERIODIC]) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoleculeSketcher = api;
})(typeof self !== 'undefined' ? self : globalThis);
