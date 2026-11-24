/* Run with node test-model-stage.js (no browser, GPU, or package install). */
'use strict';
const assert = require('node:assert/strict');
const Chem = require('./chemistry.js');
require('./geometry.js');
require('./molecule-record.js'); require('./model-stage.js');

// Exercise the public stage API and inspect exactly what was sent to 3Dmol.
function fixture() {
  const win = new EventTarget(), doc = {defaultView:win}, dims = {width:640,height:320};
  let observer, viewer, count = 0, bodyEvents = 0;
  class El extends EventTarget {
    constructor() { super(); this.children=[]; this.style={}; this.ownerDocument=doc; }
    get clientWidth() { return dims.width; }
    get clientHeight() { return dims.height; }
    append(...els) { els.forEach(el => { el.remove(); el.parent=this; this.children.push(el); }); }
    prepend(el) { el.remove(); el.parent=this; this.children.unshift(el); }
    replaceChildren(...els) { this.children.slice().forEach(el=>el.remove()); this.append(...els); }
    remove() { if (this.parent) { const p=this.parent; p.children.splice(p.children.indexOf(this),1); this.parent=null; } }
  }
  doc.body=new El(); doc.createElement=()=>new El();
  win.ResizeObserver=class { constructor(cb) {observer=this; this.fire=cb;} observe() {} disconnect() {this.closed=true;} };
  win.CustomEvent=class extends Event {constructor(name,opts) {super(name); this.detail=opts.detail;} };
  win.getComputedStyle=()=>({color:'#112233',getPropertyValue:()=>''});
  win.$3Dmol={elementColors:{defaultColors:{C:1,O:2,H:3}},createViewer(pane,opts) {
    count++; assert.equal(opts.orthographic,true);
    const canvas=new El(), gl={getExtension:()=>({loseContext(){viewer.lost=true;}})};
    viewer={models:[], CAMERA_Z:150, fov:20, view:[0,0,0,0,0,0,0,1],
      getRenderer:()=>({isLost:()=>Boolean(viewer.lost),getContext:()=>gl,getCanvas:()=>canvas}), setProjection(p){this.proj=p;},
      getView(){return this.view.slice();},setView(v){this.view=v;},setSlab(n,f){this.slab=[n,f];},
      addModel(){return {addAtoms:atoms=>this.models.push(atoms)};},removeAllModels(){this.models=[];},
      setStyle(){},render(){},resize(){assert.ok(dims.width>0 && dims.height>0,'never resize hidden');},
      zoom(f){this.view[3]=this.CAMERA_Z-(this.CAMERA_Z-this.view[3])/f;}};
    win.addEventListener('resize',()=>viewer.resize());
    doc.body.addEventListener('mouseup',()=>bodyEvents++); pane.append(canvas); return viewer;
  }};
  const host=new El(); doc.body.append(host);
  return {host,win,doc,dims,stage:ModelStage.create(host),get viewer(){return viewer;},get observer(){return observer;},get count(){return count;},get bodyEvents(){return bodyEvents;}};
}
const ethanol=Chem.describe(Chem.readSmiles('CCO'));
const small={id:'A',record:ethanol,geometry:{atoms:[{e:'C',x:8,y:-4,z:1},{e:'O',x:9.4,y:-4,z:1}],bonds:[{a:0,b:1,order:2}]}};
const big={id:'B',record:ethanol,geometry:{atoms:[{e:'C',x:100,y:40,z:1},{e:'O',x:104.2,y:40,z:1},{e:'H',x:104,y:41,z:3}],bonds:[{a:0,b:1,order:1},{a:1,b:2,order:1}]}};
const duplicate={...small,id:'C'};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function screen(v,a,dim) {
  // Independent quaternion rotation matrix; distances expressed in viewport pixels.
  const [ox,oy,oz,depth,x,y,z,w]=v.getView(), X=a.x+ox,Y=a.y+oy,Z=a.z+oz;
  const px=(1-2*y*y-2*z*z)*X+(2*x*y-2*w*z)*Y+(2*x*z+2*w*y)*Z;
  const py=(2*x*y+2*w*z)*X+(1-2*x*x-2*z*z)*Y+(2*y*z-2*w*x)*Z;
  const unit=dim.width/(2*(v.CAMERA_Z-depth)*Math.tan(v.fov*Math.PI/180));
  return [dim.width/2+px*unit,dim.height/2-py*unit];
}
function fitAndScale(f,rows) {
  const v=f.viewer; assert.equal(v.models.length,rows.length);
  const rects=v.models.map((atoms,k)=>{
    const input=rows[k].geometry.atoms;
    atoms.forEach((a,i)=>['x','y','z'].forEach(axis=>near(a[axis]-atoms[0][axis],input[i][axis]-input[0][axis])));
    const ps=atoms.map(a=>screen(v,a,f.dims));
    ps.forEach(([x,y])=>assert.ok(x>0&&y>0&&x<f.dims.width&&y<f.dims.height,'all atoms inside viewport'));
    return [Math.min(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[1]))];
  });
  rects.forEach(([l,r,t,b],i)=>rects.slice(i+1).forEach(([L,R,T,B])=>assert.ok(r<L||R<l||b<T||B<t,'packed rows do not overlap')));
  const lengths=v.models.map(m=>{const [p,q]=m.map(a=>screen(v,a,f.dims));return Math.hypot(p[0]-q[0],p[1]-q[1]);});
  near(lengths[1]/lengths[0],3); if (rows.length===3) near(lengths[2],lengths[0]);
}
{
  const f=fixture(), {stage}=f, rows=[small,big,duplicate], original=JSON.stringify(rows);
  stage.draw3D(rows); assert.equal(f.count,1);assert.equal(f.viewer.proj,'orthographic');fitAndScale(f,rows);
  assert.deepEqual(f.viewer.models[0].map(a=>[a.bonds,a.bondOrder]),[[[1],[2]],[[0],[2]]]);
  const q=[.2,.3,-.4,Math.sqrt(.71)];f.viewer.view.splice(4,4,...q);
  stage.draw3D(rows.slice(0,2));assert.deepEqual(f.viewer.getView().slice(4,8),q);fitAndScale(f,rows.slice(0,2));
  const fit=f.viewer.view[3];stage.zoom(2);assert.ok(f.viewer.view[3]>fit);stage.fit();near(f.viewer.view[3],fit);
  for (const [width,height] of [[150,800],[1500,150]]) {
    Object.assign(f.dims,{width,height});f.observer.fire();fitAndScale(f,rows.slice(0,2));
  }
  assert.equal(JSON.stringify(rows),original);assert.equal(f.count,1);
  f.dims.width=0;f.observer.fire();f.win.dispatchEvent(new Event('resize'));stage.draw3D(rows);
  f.dims.width=900;f.observer.fire();fitAndScale(f,rows);
  stage.draw3D([]);assert.equal(f.viewer.models.length,0);stage.fit();assert.throws(()=>stage.draw3D([{...small,geometry:null}]),/3D coordinates/);
  f.doc.body.dispatchEvent(new Event('mouseup'));assert.equal(f.bodyEvents,1);
  stage.destroy();stage.destroy();f.observer.fire();f.doc.body.dispatchEvent(new Event('mouseup'));
  assert.equal(f.bodyEvents,1);assert.equal(f.host.children.length,0);assert.ok(f.viewer.lost);assert.ok(f.observer.closed);
}
{
  const f=fixture(); f.dims.height=0; f.stage.draw3D([small,big]); assert.equal(f.count,1); assert.equal(f.viewer.models.length,0);
  f.dims.height=260; f.observer.fire(); fitAndScale(f,[small,big]);
  const lost=[]; f.host.addEventListener('modelstageerror',e=>lost.push(e.detail.error));
  const canvas=f.viewer.getRenderer().getCanvas(); f.viewer.lost=true;
  canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})); f.dims.height++; f.observer.fire();
  assert.ok(lost.length>=1); assert.match(lost[0].message,/WebGL/);
  canvas.dispatchEvent(new Event('webglcontextrestored')); assert.equal(f.count,2); fitAndScale(f,[small,big]); f.stage.destroy();
}
{
  const f=fixture(), svg='<svg xmlns="http://www.w3.org/2000/svg"><path id="stereo-wedge" d="M0 0 L10 3 L10 5 Z"/></svg>';
  f.stage.draw2D([{...small,geometry:null},{id:'S',record:{schema:'bond-atlas/3',name:'assigned',depictions:{skeletal:svg}},geometry:null}]);
  const grid=f.host.children[0].children[1], images=grid.children;
  assert.equal(f.count,0);assert.equal(images.length,2);assert.match(decodeURIComponent(images[0].src),/OH<\/text>/);
  assert.equal(decodeURIComponent(images[1].src.split(',')[1]),svg);assert.equal(images[1].alt,'assigned');
  f.stage.zoom(1.5);assert.equal(grid.style.transform,'scale(1.5)');f.stage.fit();assert.equal(grid.style.transform,'');
  f.win.$3Dmol.createViewer=()=>{throw Error('context creation failed');};
  f.dims.width=0;assert.throws(()=>f.stage.draw3D([small]),/WebGL.*context creation failed/);assert.equal(grid.children.length,2);
  f.stage.destroy();
}
console.log('Model stage: rigid translations, shared orthographic size, camera fit, stereo depictions, hidden resize and teardown passed.');
