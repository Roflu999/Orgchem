/* Resource/resize adapter for the pinned, unmodified 3Dmol.js 2.4.2 renderer.
   Does not change chemistry, camera state, antialiasing or renderer quality. */
(function(root){
  'use strict';
  const renderers=new WeakMap(),viewers=new WeakMap();
  const textures=['_targetTexture','_depthTexture','_shadingTexture','_scratchTexture'];
  function releaseFramebuffer(renderer,stats){
    const gl=renderer?._gl;if(!gl)return;
    const release=(key,method,counter)=>{
      const resource=renderer[key];if(resource===undefined||resource===null)return;
      try{gl[method]?.(resource);}finally{renderer[key]=null;stats[counter]++;}
    };
    textures.forEach(key=>release(key,'deleteTexture','texturesReleased'));
    release('_fb','deleteFramebuffer','framebuffersReleased');
    release('_screenQuadVBO','deleteBuffer','quadBuffersReleased');
  }
  function guardRenderer(renderer){
    if(!renderer||typeof renderer.setSize!=='function'||renderers.has(renderer))return renderer;
    const stats={applied:0,skipped:0,texturesReleased:0,framebuffersReleased:0,quadBuffersReleased:0};
    renderers.set(renderer,stats);
    const originalSize=renderer.setSize;
    const originalFramebuffer=renderer.initFrameBuffer;
    let previous=null,lastReturn;
    if(typeof originalFramebuffer==='function')renderer.initFrameBuffer=function(...args){
      // Upstream 2.4.2 overwrites these six handles without deleting them.
      // Delete only renderer-owned targets, never model or supplied-grid data.
      releaseFramebuffer(this,stats);
      return originalFramebuffer.apply(this,args);
    };
    renderer.setSize=function(width,height,...args){
      const canvas=this.getCanvas?.()||this.domElement;
      const dpr=Number(root.devicePixelRatio)||1;
      const valid=Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0;
      if(valid&&previous&&previous.width===width&&previous.height===height&&previous.dpr===dpr&&
         previous.antialias===this._antialias&&previous.gl===this._gl&&previous.canvas===canvas&&
         previous.backingWidth===canvas?.width&&previous.backingHeight===canvas?.height&&!this.isLost?.()){
        stats.skipped++;return lastReturn;
      }
      lastReturn=originalSize.call(this,width,height,...args);stats.applied++;
      previous=valid&&!this.isLost?.()?{width,height,dpr,antialias:this._antialias,gl:this._gl,canvas,backingWidth:canvas?.width,backingHeight:canvas?.height}:null;
      return lastReturn;
    };
    return renderer;
  }
  function manage(viewer){
    if(!viewer||viewers.has(viewer))return viewer;
    const stats={labelsReleased:0};viewers.set(viewer,stats);
    const renderer=()=>viewer.getRenderer?.()||viewer.renderer;
    guardRenderer(renderer());
    if(typeof viewer.setupRenderer==='function'){
      const setup=viewer.setupRenderer;
      viewer.setupRenderer=function(...args){
        const before=renderer(),result=setup.apply(this,args),after=renderer();
        if(before&&before!==after&&renderers.has(before))releaseFramebuffer(before,renderers.get(before));
        guardRenderer(after);return result;
      };
    }
    if(typeof viewer.removeAllLabels==='function'){
      const remove=viewer.removeAllLabels;
      viewer.removeAllLabels=function(...args){
        const labels=Array.from(new Set(this.labels||[]));
        const result=remove.apply(this,args);
        labels.forEach(label=>{if(typeof label?.dispose==='function'){label.dispose();stats.labelsReleased++;}});
        return result;
      };
    }
    return viewer;
  }
  function getStats(target){
    if(viewers.has(target))return {...renderers.get(target.getRenderer?.()||target.renderer),...viewers.get(target)};
    return {...renderers.get(target)};
  }
  const api={guardRenderer,manage,getStats};root.ViewerLifecycle=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
