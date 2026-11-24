'use strict';
const assert=require('node:assert/strict');
const L=require('./viewer-lifecycle.js');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
function renderer(){
 const live={texture:new Set(),framebuffer:new Set(),buffer:new Set()},deleted={texture:0,framebuffer:0,buffer:0};let next=0;
 const gl={};
 for(const [type,method]of [['texture','Texture'],['framebuffer','Framebuffer'],['buffer','Buffer']]){
  gl['create'+method]=()=>{const handle={type,id:++next};live[type].add(handle);return handle;};
  gl['delete'+method]=handle=>{assert(live[type].delete(handle),'Only a live renderer-owned '+type+' may be deleted');deleted[type]++;};
 }
 const r={_gl:gl,_antialias:true,canvas:{width:0,height:0},lost:false,calls:0,
  getCanvas(){return this.canvas;},isLost(){return this.lost;},
  initFrameBuffer(){for(const name of ['_targetTexture','_depthTexture','_shadingTexture','_scratchTexture'])this[name]=gl.createTexture();this._fb=gl.createFramebuffer();this._screenQuadVBO=gl.createBuffer();},
  setSize(width,height){this.calls++;const dpr=Number(globalThis.devicePixelRatio)||1;this.canvas.width=width*dpr;this.canvas.height=height*dpr;this.initFrameBuffer();return this;}};
 r.setSize(300,200);return {r,live,deleted};
}
function resize(viewer,w,h){const r=viewer.getRenderer();r.setSize(w,h);r.setSize(w,h);}
const previousDpr=globalThis.devicePixelRatio;
try{
 globalThis.devicePixelRatio=1;
 test('same-size resize churn is reproduced and guarded without changing canvas dimensions',()=>{
  const control=renderer();for(let i=0;i<30;i++){control.r.setSize(300,200);control.r.setSize(300,200);}
  assert.equal(control.live.framebuffer.size,61);
  const {r,live}=renderer();L.guardRenderer(r);for(let i=0;i<30;i++){assert.equal(r.setSize(300,200),r);r.setSize(300,200);}
  assert.equal(live.framebuffer.size,1);assert.equal(live.texture.size,4);assert.equal(live.buffer.size,1);
  assert.deepEqual(r.getCanvas(),{width:300,height:200});
  assert.equal(L.getStats(r).applied,1);assert.equal(L.getStats(r).skipped,59);
 });
 test('real size and DPR changes replace only framebuffer resources and release old handles',()=>{
  const {r,live}=renderer();const moleculeBuffer=r._gl.createBuffer();L.guardRenderer(r);
  r.setSize(300,200);r.setSize(600,400);globalThis.devicePixelRatio=2;r.setSize(600,400);
  assert.equal(live.texture.size,4);assert.equal(live.framebuffer.size,1);assert.equal(live.buffer.size,2);
  assert(live.buffer.has(moleculeBuffer));assert.deepEqual(r.canvas,{width:1200,height:800});
  assert.equal(L.getStats(r).applied,3);globalThis.devicePixelRatio=1;
 });
 test('externally resized/replaced canvases and context-loss states invalidate the cache',()=>{
  const {r}=renderer();L.guardRenderer(r);r.setSize(300,200);r.canvas.width=1;r.setSize(300,200);
  r.canvas={width:300,height:200};r.setSize(300,200);r.lost=true;r.setSize(300,200);r.lost=false;r.setSize(300,200);
  assert.equal(L.getStats(r).applied,5);
 });
 test('viewer management is idempotent and bulk label removal disposes textures once',()=>{
  const {r}=renderer();let disposed=0;const label={dispose(){disposed++;}};
  const viewer={renderer:r,labels:[label,label],camera:[1,2,3],getRenderer(){return this.renderer;},removeAllLabels(){this.labels=[];return this;}};
  L.manage(viewer);L.manage(viewer);assert.equal(viewer.removeAllLabels(),viewer);viewer.removeAllLabels();
  assert.equal(disposed,1);assert.deepEqual(viewer.camera,[1,2,3]);assert.equal(L.getStats(viewer).labelsReleased,1);
 });
 test('renderer replacement after context recovery receives the guard and retires old targets',()=>{
  const before=renderer();const viewer={renderer:before.r,labels:[],getRenderer(){return this.renderer;},setupRenderer(){this.renderer=renderer().r;return this.renderer;},removeAllLabels(){this.labels=[];}};
  L.manage(viewer);resize(viewer,300,200);const after=viewer.setupRenderer();resize(viewer,300,200);resize(viewer,300,200);
  assert.equal(before.live.framebuffer.size,0);assert.equal(before.live.texture.size,0);
  assert.equal(L.getStats(after).applied,1);assert.equal(L.getStats(after).skipped,3);
 });
 test('renderers without internal WebGL resources still retain ordinary setSize behavior',()=>{
  let calls=0;const r={domElement:{width:10,height:10},setSize(){calls++;return 'result';}};
  L.guardRenderer(r);assert.equal(r.setSize(10,10),'result');assert.equal(r.setSize(10,10),'result');assert.equal(calls,1);
  assert.equal(L.guardRenderer(null),null);
 });
}finally{if(previousDpr===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previousDpr;}
console.log(checks+' viewer resource-lifecycle regression groups passed.');
