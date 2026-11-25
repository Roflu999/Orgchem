/* UI-free molecule list renderer. Give the host a definite width and height.
   Dependencies: geometry.js (offline 2D), molecule-record.js (v3 2D), pinned 3Dmol 2.4.2. */
(function (root) {
  'use strict';
  const layoutCache = new WeakMap();
  const gap = 1.5, atomMargin = 0.55; // Angstroms, not fractions of a model's size.

  function bounds(points) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of points) for (let k = 0; k < p.length; k++) {
      lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]);
    }
    return { mid: lo.map((v, k) => (v + hi[k]) / 2), span: hi.map((v, k) => v - lo[k]) };
  }

  function rotate([x,y,z], [a,b,c,d]) {
    const u = 2*(b*z-c*y), v = 2*(c*x-a*z), w = 2*(a*y-b*x);
    return [x+d*u+b*w-c*v, y+d*v+c*u-a*w, z+d*w+a*v-b*u];
  }
  const inverse = ([a,b,c,d]) => [-a,-b,-c,d];
  const xyz = a => [a.x,a.y,a.z];
  const columns = (n, aspect, w, h) => Math.min(n, Math.max(1, Math.round(Math.sqrt(n*aspect*h/w))));

  function validate3D({id, geometry}) {
    if (!geometry?.atoms?.length || geometry.atoms.some(a => !a || !a.e || !xyz(a).every(Number.isFinite)))
      throw Error('Missing or invalid 3D coordinates for entry ' + id + '.');
    const index = i => Number.isInteger(i) && i >= 0 && i < geometry.atoms.length;
    if (!Array.isArray(geometry.bonds) || geometry.bonds.some(b => !b || !index(b.a) || !index(b.b) || b.a === b.b || ![1,2,3].includes(b.order)))
      throw Error('Invalid 3D bonds for entry ' + id + '.');
  }

  function pack(entries, aspect, q) {
    const boxes = entries.map(({geometry}) => bounds(geometry.atoms.map(a => rotate(xyz(a), q))));
    const mean = i => boxes.reduce((sum, b) => sum + b.span[i] + 2*atomMargin + gap, 0) / boxes.length;
    const cols = columns(entries.length, aspect, mean(0), mean(1));
    const models = [];
    let top = 0;
    for (let start = 0; start < entries.length; start += cols) {
      const row = boxes.slice(start, start + cols);
      const width = row.reduce((s,b) => s+b.span[0]+2*atomMargin+gap, -gap);
      const height = Math.max(...row.map(b => b.span[1]+2*atomMargin));
      let left = -width/2;
      row.forEach(({mid,span}, j) => {
        const geometry = entries[start+j].geometry, cell = span[0]+2*atomMargin;
        // Lay out in the current screen plane. Only the translation vector is
        // transformed back; atom coordinates never undergo rotation or scaling.
        const delta = rotate([left+cell/2-mid[0], top-height/2-mid[1], -mid[2]], inverse(q));
        const atoms = geometry.atoms.map((a,index) => ({index, elem:a.e,
          x:a.x+delta[0], y:a.y+delta[1], z:a.z+delta[2], bonds:[], bondOrder:[]}));
        for (const {a,b,order} of geometry.bonds) {
          atoms[a].bonds.push(b); atoms[a].bondOrder.push(order);
          atoms[b].bonds.push(a); atoms[b].bondOrder.push(order);
        }
        models.push(atoms); left += cell+gap;
      });
      top -= height+gap;
    }
    return models;
  }

  function schematic(record, ink, mark, accent) {
    let layout = layoutCache.get(record);
    if (!layout) {
      layout = root.MoleculeGeometry.layout2D(record, false); layoutCache.set(record, layout);
    }
    const {atoms,bonds} = layout, xs = atoms.map(a => a.x*45), ys = atoms.map(a => a.y*45);
    const labels = atoms.map((a,i) => {
      const q = record.charges?.[i] || 0;
      if (a.e === 'C' && atoms.length > 1 && !q) return '';
      const e = /^[A-Z][a-z]?$/.test(a.e) ? a.e : '?';
      return e + (a.h ? 'H'+(a.h>1 ? String(a.h).replace(/\d/g, d=>'₀₁₂₃₄₅₆₇₈₉'[d]) : '') : '') +
        (q>0?'⁺':q<0?'⁻':'');
    });
    const paths = [];
    for (const {a,b,order} of bonds) {
      const dx = xs[b]-xs[a], dy = ys[b]-ys[a], len = Math.hypot(dx,dy) || 1, u = dx/len, v = dy/len;
      const trim = i => labels[i] ? Math.min(len*.43, 3 + Math.min((labels[i].length*5.5)/Math.abs(u), 8/Math.abs(v))) : 0;
      const l = trim(a), r = trim(b);
      for (let k=0; k<order; k++) {
        const n = (k-(order-1)/2)*4;
        paths.push(`M${xs[a]+u*l-v*n} ${ys[a]+v*l+u*n}L${xs[b]-u*r-v*n} ${ys[b]-v*r+u*n}`);
      }
    }
    const x = Math.min(...xs)-22, y = Math.min(...ys)-17;
    const w = Math.max(...xs)-x+22, h = Math.max(...ys)-y+17;
    // The SVG is an image document (not markup injected into the page).
    const color = ink.replace(/["<>&]/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w*1.5}" height="${h*1.5}">${mark?root.ModelComparisons.schematicMarks(mark,record,xs,ys,accent):''}<path d="${paths.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/><g fill="${color}" font-family="sans-serif" font-size="16" font-weight="600" text-anchor="middle" dominant-baseline="central">` +
      labels.map((s,i) => s ? `<text x="${xs[i]}" y="${ys[i]}">${s}</text>` : '').join('') + '</g></svg>';
  }

  // RDKit's stereo illustration may omit explicit H and need not share the
  // sketch's coordinates or numbering. Draw a separate connectivity detail;
  // never place a guessed overlay on that illustration.
  function localDrawing(record, atom, ink, accent) {
    const edges = record.bonds, neighbors = [];
    for (const {a,b} of edges) {
      if (a===atom) neighbors.push(b); else if (b===atom) neighbors.push(a);
    }
    const reach = Math.max(66, neighbors.length*9), points = new Map([[atom,[0,0]]]);
    const adjacent = new Set(neighbors), closed = edges.some(({a,b}) => adjacent.has(a) && adjacent.has(b));
    // In three-membered rings, do not run the closing bond through the selected atom.
    const ring = closed ? [atom,...neighbors] : neighbors;
    ring.forEach((i,k) => {
      const angle = k*2*Math.PI/ring.length;
      points.set(i,[reach*Math.cos(angle),reach*Math.sin(angle)]);
    });
    const paths = [], labels = [], bonds = [];
    for (const {a,b,order} of edges) {
      if (!points.has(a) || !points.has(b)) continue;
      const [x,y] = points.get(a), [X,Y] = points.get(b), len = Math.hypot(X-x,Y-y) || 1;
      const u = (X-x)/len, v = (Y-y)/len;
      for (let k=0;k<order;k++) {
        const n = (k-(order-1)/2)*3.5;
        paths.push(`M${x+u*23-v*n} ${y+v*23+u*n}L${X-u*23-v*n} ${Y-v*23+u*n}`);
      }
      bonds.push(`${record.atoms[a]}${a+1}–${record.atoms[b]}${b+1} (${['','single','double','triple'][order]})`);
    }
    for (const [i,[x,y]] of points) {
      const e = /^[A-Z][a-z]?$/.test(record.atoms[i]) ? record.atoms[i] : '?';
      const isotope = Number.isInteger(record.isotopes?.[i]) && record.isotopes[i] || '';
      const q = Number.isInteger(record.charges?.[i]) ? record.charges[i] : 0;
      const symbol = isotope+e+(q ? (Math.abs(q)>1?Math.abs(q):'')+(q>0?'+':'−') : '');
      labels.push(`<g transform="translate(${x} ${y})">${i===atom?`<circle r="23" fill="none" stroke="${accent}" stroke-width="3"/>`:''}<text y="-1" font-weight="650">${symbol}</text><text y="13" font-size="11">#${i+1}</text></g>`);
    }
    const xs = [...points.values()].map(p=>p[0]), ys = [...points.values()].map(p=>p[1]);
    const x = Math.min(...xs)-36, y = Math.min(...ys)-35, w = Math.max(...xs)-x+36, h = Math.max(...ys)-y+35;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w*2}" height="${h*2}"><path d="${paths.join(' ')}" fill="none" stroke="${ink}" stroke-width="2"/><g font-family="sans-serif" font-size="16" text-anchor="middle" fill="${ink}">${labels.join('')}</g></svg>`;
    return {svg,alt:`Connectivity around ${record.atoms[atom]}${atom+1}: ${bonds.join(', ') || 'no bonds'}.`};
  }

  // 2.4.2 has no viewer destructor: its constructor registers anonymous bound
  // listeners on window/body. Capture just those synchronous registrations so
  // destroying a stage does not keep its entire scene alive. Do not intercept
  // the canvas listeners, which have the lifetime of the stage's own canvas.
  function constructViewer(win, pane, off) {
    const restore = [];
    function watch(target, names) {
      const own = Object.getOwnPropertyDescriptor(target,'addEventListener'), add = target.addEventListener;
      target.addEventListener = function (type, fn, opts) {
        if (names.includes(type)) {
          if (type === 'resize') return; // The stage owns visibility-aware resize.
          off.push(() => target.removeEventListener(type,fn,opts));
        }
        return add.call(this,type,fn,opts);
      };
      restore.push(() => own ? Object.defineProperty(target,'addEventListener',own) : delete target.addEventListener);
    }
    try {
      watch(win, ['resize']); watch(pane.ownerDocument.body, ['mouseup','touchend']);
      // A 1x1 viewport uses a private GL context, not 3Dmol's shared OffscreenCanvas.
      return win.$3Dmol.createViewer(pane, {row:0,col:0,rows:1,cols:1,orthographic:true,
        backgroundAlpha:0, antialias:true, disableFog:true});
    } finally { restore.reverse().forEach(f => f()); }
  }

  function create(host) {
    const doc = host.ownerDocument, win = doc.defaultView;
    function element(cls, css) {
      const el = doc.createElement('div'); el.className = cls; el.style.cssText = css; return el;
    }
    const frame = element('model-stage','position:relative;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;');
    const pane = element('model-stage-3d','position:absolute;inset:0;touch-action:none;');
    const grid = element('model-stage-2d','position:absolute;inset:0;display:grid;gap:4px;padding:8px;box-sizing:border-box;');
    frame.append(pane,grid); host.append(frame);
    let viewer = null, models = [], entries = [], mode = '2d', scale = 1, destroyed = false;
    let width = 0, height = 0, dirty = false;
    const off = [];
    function releaseViewer() {
      off.splice(0).forEach(f => f());
      if (viewer) {
        viewer.divwatcher?.disconnect(); viewer.intwatcher?.disconnect();
        viewer.removeAllModels();
        viewer.getRenderer()?.getContext()?.getExtension('WEBGL_lose_context')?.loseContext();
        viewer = null;
      }
      pane.replaceChildren(); models = [];
    }
    function report(error) {
      host.dispatchEvent(new win.CustomEvent('modelstageerror',{detail:{error}}));
    }
    function ensureViewer() {
      if (viewer && !viewer.getRenderer().isLost()) return;
      if (viewer) releaseViewer();
      if (!win.$3Dmol?.createViewer) throw Error('3D rendering requires WebGL and the 3Dmol library.');
      // Even a hidden/detached host gets a synchronous WebGL capability result.
      const hidden = !frame.clientWidth || !frame.clientHeight, css = pane.style.cssText;
      try {
        if (hidden) {
          pane.style.cssText = 'position:fixed;left:-100px;top:0;width:2px;height:2px;visibility:hidden;';
          doc.body.append(pane);
        }
        viewer = constructViewer(win, pane, off);
        if (!viewer || viewer.getRenderer().isLost()) throw Error('no active graphics context');
        viewer.divwatcher?.disconnect(); viewer.intwatcher?.disconnect();
        win.ViewerLifecycle?.manage(viewer);
        viewer.setProjection('orthographic');
        const active = viewer, canvas = active.getRenderer().getCanvas();
        // The vendor's loss handler otherwise resizes every canvas in the page,
        // including detached/hidden viewers, even after intentional destruction.
        canvas.addEventListener('webglcontextlost', event => {
          event.preventDefault(); event.stopImmediatePropagation();
          if (!destroyed && viewer===active && mode==='3d' && entries.length) { dirty=true; report(Error('Molecule viewer lost its WebGL context.')); }
        }, true);
        canvas.addEventListener('webglcontextrestored', () => {
          if (destroyed || viewer!==active) return;
          try { releaseViewer(); if (mode==='3d' && entries.length) { ensureViewer(); dirty=true; refresh(); } }
          catch (e) { report(e); }
        }, {once:true});
      } catch (e) {
        releaseViewer(); throw Error('Unable to create a WebGL molecule viewer: '+(e?.message || e));
      } finally {
        if (hidden) { frame.prepend(pane); pane.style.cssText = css; }
      }
    }
    let colors = {}, accent;
    function fit3D(atoms = models.flat()) {
      if (!atoms.length) return;
      const q = viewer.getView().slice(4,8), points = atoms.map(a => rotate(xyz(a),q));
      const {mid,span} = bounds(points), center = rotate(mid,inverse(q));
      // 3Dmol 2.4.2's orthographic right plane is distance*tan(fov),
      // and top is right/aspect. Fit the union with one camera transformation.
      const halfWidth = Math.max(span[0]/2+atomMargin,(span[1]/2+atomMargin)*width/height)*1.14;
      const distance = halfWidth / Math.tan(viewer.fov*Math.PI/180);
      const slab = Math.hypot(...span) + 4;
      viewer.setSlab(-slab,slab);
      viewer.setView([...center.map(x => -x),viewer.CAMERA_Z-distance,...q,0,0]);
    }
    function styleAndFrame() {
      const stick = {radius:.11, colorscheme:colors}, normal = {stick,sphere:{radius:.36,colorscheme:colors}};
      const hydrogen = {stick,sphere:{radius:.2,colorscheme:colors}}, marked = {stick,sphere:{radius:.53,color:accent}};
      const i = entries.length===1 ? entries[0].focusAtom : null;
      if (Number.isInteger(i) && models[0]?.[i]) {
        const indices = [i,...models[0][i].bonds];
        viewer.setStyle({},{}); // Hide distant atoms, but keep their mapped indices and coordinates.
        viewer.setStyle({model:0,index:indices},normal);
        viewer.setStyle({model:0,index:indices,elem:'H'},hydrogen);
        viewer.setStyle({model:0,index:i},marked);
        fit3D(indices.map(j=>models[0][j]));
      } else {
        viewer.setStyle({},normal); viewer.setStyle({elem:'H'},hydrogen);
        entries.forEach(({mark},model)=>{if(mark)viewer.setStyle({model,index:mark.atom},marked);});
        fit3D();
      }
      viewer.render();
    }
    function refresh() {
      if (destroyed) return;
      const w = frame.clientWidth, h = frame.clientHeight;
      if (!w || !h) { width = height = 0; return; }
      if (!dirty && w===width && h===height) return;
      width=w; height=h;
      if (mode==='2d') {
        const cols = columns(entries.length,w/h,1.4,1) || 1;
        grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
        grid.style.gridTemplateRows = `repeat(${Math.ceil(entries.length/cols)||1},minmax(0,1fr))`;
      } else if (viewer) {
        if (viewer.getRenderer().isLost()) {
          if (entries.length) throw Error('Molecule viewer WebGL context is unavailable.');
          releaseViewer(); dirty=false; return;
        }
        viewer.resize();
        models = entries.length ? pack(entries,w/h,viewer.getView().slice(4,8)) : [];
        viewer.removeAllModels();
        const theme = win.getComputedStyle(host); colors = {};
        for (const atoms of models) {
          for (const a of atoms) if (!(a.elem in colors)) {
            const token = theme.getPropertyValue('--atom-'+a.elem).trim();
            colors[a.elem] = token || win.$3Dmol.elementColors.defaultColors[a.elem];
          }
          viewer.addModel().addAtoms(atoms);
        }
        accent=theme.getPropertyValue('--accent-ink').trim()||'#657981';
        styleAndFrame();
      }
      dirty = false;
    }
    function resize() {
      try { refresh(); }
      catch (cause) {
        dirty = true;
        report(cause);
      }
    }
    const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
    if (observer) observer.observe(frame); else win.addEventListener('resize',resize);
    function show(next, rows) {
      entries = rows.slice(); mode = next; dirty = true; scale = 1;
      pane.style.display = mode==='3d' ? 'block' : 'none';
      grid.style.display = mode==='2d' ? 'grid' : 'none'; grid.style.transform=''; refresh();
    }
    return {
      draw2D(rows, benzeneMode) {
        if (destroyed) return;
        const theme = win.getComputedStyle(host), ink = theme.getPropertyValue('--ink').trim() || theme.color || '#172b3a';
        const accent=theme.getPropertyValue('--accent-ink').trim()||ink;
        const images = rows.map(({record,id,mark,focusAtom}) => {
          const benzene=benzeneMode&&root.BenzeneView?.matches(record);
          const detail = Number.isInteger(focusAtom) && record.atoms[focusAtom] ? localDrawing(record,focusAtom,ink,accent) : null;
          const svg = detail ? detail.svg : mark ? (root.ModelComparisons.mirrorDrawing(mark,ink,accent)||schematic(record,ink,mark,accent)) : benzene ? root.BenzeneView.svg(benzeneMode,ink) : record.schema==='bond-atlas/3' ? root.MoleculeRecords.themedSVG(record.depictions?.skeletal,ink) : schematic(record,ink);
          const img = doc.createElement('img');
          if(benzene)root.AtlasI18n.bindAttr(img,'alt','benz.depiction',()=>({mode:root.AtlasI18n.t('benz.'+benzeneMode)}));
          else img.alt=detail?.alt || record.name || record.formula || String(id);
          img.style.cssText='width:100%;height:100%;min-width:0;min-height:0;object-fit:scale-down;';
          img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
          if(!mark)return img;
          const tile=doc.createElement('figure'),caption=doc.createElement('figcaption');
          tile.className='comparison-tile';caption.dir='auto';root.AtlasI18n.bindText(caption,'compare.row',()=>({n:id,detail:root.AtlasI18n.t('compare.'+mark.side)}));
          tile.append(img,caption);return tile;
        });
        grid.replaceChildren(...images); show('2d',rows);
      },
      draw3D(rows) {
        if (destroyed) return;
        rows.forEach(validate3D);
        pane.style.display='block';
        try { if (rows.length) ensureViewer(); }
        catch(e) { pane.style.display = mode==='2d'?'none':'block'; throw e; }
        pane.role = 'img'; pane.ariaLabel = rows.map(({record,id}) => record.name || record.formula || String(id)).join(', ');
        grid.replaceChildren(); show('3d',rows);
      },
      focusAtom(i) {
        if (destroyed || mode!=='3d' || entries.length!==1) return;
        if (i!==null && !(Number.isInteger(i) && entries[0].geometry.atoms[i])) return;
        entries[0] = {...entries[0],focusAtom:i};
        if (frame.clientWidth && frame.clientHeight && models.length) styleAndFrame();
      },
      fit() {
        if (destroyed) return;
        if (mode==='2d') { scale = 1; grid.style.transform=''; }
        else if (frame.clientWidth && frame.clientHeight && viewer) {
          if (Number.isInteger(entries[0]?.focusAtom)) this.focusAtom(null);
          else { refresh(); fit3D(); }
        }
      },
      rotate(degrees, axis) {
        if (!destroyed && mode==='3d' && viewer && Number.isFinite(degrees) && ['x','y','z'].includes(axis))
          viewer.rotate(degrees, axis);
      },
      zoom(factor) {
        if (destroyed || !Number.isFinite(factor) || factor<=0) return;
        if (mode==='2d') { scale = Math.min(10,Math.max(.1,scale*factor)); grid.style.transform=`scale(${scale})`; }
        else if (viewer && frame.clientWidth && frame.clientHeight) viewer.zoom(factor);
      },
      destroy() {
        if (destroyed) return;
        destroyed=true; observer?.disconnect(); win.removeEventListener('resize',resize);
        releaseViewer(); frame.remove(); grid.replaceChildren(); entries=[];
      }
    };
  }
  root.ModelStage = {create};
})(typeof window==='undefined' ? globalThis : window);
