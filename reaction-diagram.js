/* Draws one mechanism step; the caller owns playback and the accessible description. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const ink = 'var(--ink, #172b3a)', flow = 'var(--accent, #146c67)';
  const scale = 76, layers = new WeakMap();
  const point = (x, y) => ({x, y});
  const add = (p, v, k = 1) => point(p.x + k * v.x, p.y + k * v.y);
  const delta = (a, b) => point(b.x - a.x, b.y - a.y);
  const length = v => Math.hypot(v.x, v.y);
  const unit = v => length(v) ? point(v.x / length(v), v.y / length(v)) : point(1, 0);
  const normal = v => point(-v.y, v.x);
  const mid = (a, b) => add(a, delta(a, b), 0.5);
  const joins = (b, i) => b.a === i || b.b === i;
  const other = (b, i) => b.a === i ? b.b : b.a;
  const same = (u, v) => joins(u, v.a) && joins(u, v.b);

  function node(parent, name, attrs, text) {
    const el = parent.ownerDocument.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function productPositions(r) {
    const p = r.atoms.map(a => point(a.x, a.y));
    if (r.atoms.some(a => Number.isFinite(a.afterX) || Number.isFinite(a.afterY))) {
      return r.atoms.map((a, i) => point(a.afterX ?? p[i].x, a.afterY ?? p[i].y));
    }
    const lost = r.bondsBefore.find(b => !r.bondsAfter.some(n => same(n, b)));
    const made = r.bondsAfter.find(b => !r.bondsBefore.some(n => same(n, b)));
    if (!lost || !made) return p;
    const center = [made.a, made.b].find(i => joins(lost, i));
    if (center === undefined) return p;
    const incoming = other(made, center), leaving = other(lost, center);
    const unchanged = r.bondsBefore.filter(b => b !== lost);
    // Translate whole fragments, never stretch their internal bonds.
    function moveFragment(start, target) {
      const shift = delta(p[start], target), fragment = new Set([start]);
      for (const i of fragment) {
        p[i] = add(p[i], shift);
        for (const b of unchanged) if (joins(b, i)) fragment.add(other(b, i));
      }
    }
    if (r.kind === 'acid-base') {
      moveFragment(center, add(p[incoming], unit(delta(p[incoming], p[center]))));
    } else {
      moveFragment(incoming, add(p[center], unit(delta(p[center], p[incoming]))));
    }
    const gap = delta(p[center], p[leaving]);
    if (length(gap) < 2) moveFragment(leaving, add(p[center], unit(gap), 2));
    return p;
  }

  function labels(r, product) {
    const bonds = product ? r.bondsAfter : r.bondsBefore;
    const positions = product ? productPositions(r) : r.atoms;
    return r.atoms.map((a, i) => {
      const pos = positions[i];
      const charge = product ? a.chargeAfter : a.chargeBefore;
      const sign = charge ? (Math.abs(charge) > 1 ? Math.abs(charge) : '') + (charge > 0 ? '+' : '−') : '';
      const h = a.h > 0 ? 'H' : '', count = a.h > 1 ? String(a.h) : '';
      // Orient terminal labels as HO-C or C-OH rather than attaching the line to H.
      const neighbors = bonds.filter(b => joins(b, i));
      let side = neighbors.reduce((sum, b) => sum + unit(delta(pos, positions[other(b, i)])).x, 0);
      if (!neighbors.length && !product) {
        const attack = r.arrows.find(a => a.from.length === 1 && a.from[0] === i);
        if (attack) side = endpoint(attack.to, positions).x - pos.x;
      }
      const hydrogen = [[h, 20, 0], [count, 14, 5]];
      const element = [[a.e, 20, 0]];
      const runs = (side > 0 ? hydrogen.concat(element) : element.concat(hydrogen))
        .concat([[sign, 15, -9]]).filter(([s]) => s);
      const w = runs.reduce((sum, [s, size]) => sum + s.length * size * .61, 0);
      return {...point(pos.x * scale, pos.y * scale), runs, rx: w / 2 + 3, ry: sign ? 18 : 14};
    });
  }

  // Intersection of a ray from a label center with its padded text box.
  function edge(label, toward, extra = 0) {
    const d = unit(delta(label, toward));
    return add(label, d, Math.min(label.rx / Math.abs(d.x), label.ry / Math.abs(d.y)) + extra);
  }
  function endpoint(ref, atoms) {
    return ref.length === 1 ? atoms[ref[0]] : mid(atoms[ref[0]], atoms[ref[1]]);
  }

  function route(arrow, atoms, side) {
    const a = endpoint(arrow.from, atoms), b = endpoint(arrow.to, atoms);
    const v = delta(a, b), lift = Math.min(82, Math.max(44, length(v) * .48));
    const control = add(mid(a, b), normal(unit(v)), side * lift);
    const pair = arrow.from.length === 1 ? edge(a, control, 3) : null;
    const start = pair || a;
    const end = arrow.to.length === 1 ? edge(b, control, 2) : b;
    const dots = pair ? [-3, 3].map(k => add(pair, normal(unit(delta(a, control))), k)) : [];
    const base = add(end, unit(delta(end, control)), 10);
    const wings = [-4.5, 4.5].map(k => add(base, normal(unit(delta(end, control))), k));
    const samples = Array.from({length: 13}, (_, i) => {
      const t = i / 12;
      const l = add(start, delta(start, control), t), r = add(control, delta(control, end), t);
      return add(l, delta(l, r), t);
    });
    let score = control.y < mid(a, b).y ? 0 : 1;
    for (const p of samples) for (const label of atoms) {
      const distance = Math.hypot(Math.max(0, Math.abs(p.x - label.x) - label.rx),
        Math.max(0, Math.abs(p.y - label.y) - label.ry));
      score += Math.max(0, 6 - distance);
    }
    return {start, control, end, dots, wings, samples, score};
  }

  function routes(arrows, atoms) {
    const [first, second] = arrows.map(arrow => [-1, 1].map(side => route(arrow, atoms, side)));
    let best, min = Infinity;
    for (const a of first) for (const b of second) {
      let score = a.score + b.score;
      for (const p of a.samples) for (const q of b.samples) score += Math.max(0, 12 - length(delta(p, q)));
      if (score < min) { min = score; best = [a, b]; }
    }
    return best;
  }

  function draw(svg, reaction, phase) {
    if (![0, 1, 2].includes(phase)) throw new RangeError('Unknown reaction phase');
    if (reaction.arrows.length !== 2) throw new RangeError('Expected two electron-flow arrows');
    const before = labels(reaction, false), after = labels(reaction, true);
    const arrows = routes(reaction.arrows, before);
    const atoms = phase === 2 ? after : before;
    const bonds = phase === 2 ? reaction.bondsAfter : reaction.bondsBefore;
    const old = layers.get(svg);
    if (old && old.parentNode === svg) svg.removeChild(old);
    const g = node(svg, 'g', {'font-family': 'var(--mono, monospace)', 'font-weight': 500,
      'direction': 'ltr', 'stroke': 'none', 'fill': ink});
    layers.set(svg, g);

    // One camera for all three frames, including the curved arrows and their heads.
    const bounds = before.concat(after).flatMap(a => [point(a.x - a.rx, a.y - a.ry), point(a.x + a.rx, a.y + a.ry)]);
    for (const a of arrows) bounds.push(...a.samples, ...a.dots, ...a.wings);
    const xs = bounds.map(p => p.x), ys = bounds.map(p => p.y);
    const x = Math.floor(Math.min(...xs)) - 12, y = Math.floor(Math.min(...ys)) - 12;
    svg.setAttribute('viewBox', [x, y, Math.ceil(Math.max(...xs)) + 12 - x, Math.ceil(Math.max(...ys)) + 12 - y].join(' '));
    if (!svg.style.width) svg.style.width = '100%';
    if (!svg.style.height) svg.style.height = 'auto';

    for (const {a, b, order} of bonds) {
      const start = edge(atoms[a], atoms[b]), end = edge(atoms[b], atoms[a]);
      const n = normal(unit(delta(start, end)));
      for (let i = 0; i < order; i++) {
        const offset = (i - (order - 1) / 2) * 5;
        const s = add(start, n, offset), e = add(end, n, offset);
        node(g, 'line', {x1: s.x, y1: s.y, x2: e.x, y2: e.y, stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round'});
      }
    }
    for (const atom of atoms) {
      const text = node(g, 'text', {x: atom.x, y: atom.y + 7, 'text-anchor': 'middle'});
      let baseline = 0;
      for (const [s, size, offset] of atom.runs) {
        node(text, 'tspan', {'font-size': size, dy: offset - baseline}, s);
        baseline = offset;
      }
    }
    if (phase === 1) for (const {start, control, end, dots, wings} of arrows) {
      const xy = p => `${p.x},${p.y}`;
      for (const p of dots) node(g, 'circle', {cx: p.x, cy: p.y, r: 2.1, fill: flow});
      node(g, 'path', {class:'rx-arrow-shaft',pathLength:1,d: `M${xy(start)} Q${xy(control)} ${xy(end)}`, fill: 'none', stroke: flow, 'stroke-width': 2.2});
      node(g, 'polygon', {class:'rx-arrow-tip',points: [end, ...wings].map(xy).join(' '), fill: flow});
    }
  }

  const api = {draw};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReactionDiagram = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
