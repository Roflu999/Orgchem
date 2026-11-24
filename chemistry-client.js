/* Same-origin RDKit transport. Nothing is sent to third-party chemistry services. */
(function(root){
  'use strict';
  let available=false, capabilities=null;const active=new Set();
  async function responseJSON(response){
    let data;try{data=await response.json();}catch(e){throw Error('The chemistry server returned an unreadable response.');}
    if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'The chemistry server could not accept this request.');return data;
  }
  const ready=(async()=>{
    for(let attempt=0;attempt<2;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),attempt?6000:8000);
      try{const response=await fetch('/api/v1/capabilities',{signal:controller.signal,cache:'no-store'});if(!response.ok)return null;capabilities=await responseJSON(response);available=!!capabilities.available;return capabilities;}
      catch(e){if(attempt)return null;await new Promise(resolve=>setTimeout(resolve,350));}finally{clearTimeout(timer);}
    }return null;
  })();
  function delay(ms,signal){return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Calculation cancelled.','AbortError'));return;}
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Calculation cancelled.','AbortError'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});
  });}
  async function job(operation,payload,options={}){
    if(payload?.format==='molblock')payload={...payload,format:'mol'};
    await ready;if(!available)throw Error('The RDKit chemistry server is unavailable. Start the Python website server with its pinned dependencies. The limited offline explorer is still available.');
    const controller=new AbortController();let id=null,finished=false;
    const abort=()=>controller.abort();if(options.signal?.aborted)controller.abort();else options.signal?.addEventListener('abort',abort,{once:true});active.add(controller);
    try{
      const submitted=await responseJSON(await fetch('/api/v1/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,payload}),signal:controller.signal}));id=submitted.id;
      let state=submitted;
      while(true){
        options.onProgress?.({status:state.status,stage:state.status,elapsed:state.elapsed});
        if(state.status==='complete'){finished=true;return state.result;}
        if(['failed','timed_out','cancelled'].includes(state.status)){finished=true;throw Error(state.error||(state.status==='cancelled'?'Calculation cancelled.':'Chemistry calculation failed.'));}
        await delay(250,controller.signal);
        state=await responseJSON(await fetch('/api/v1/jobs/'+encodeURIComponent(id),{signal:controller.signal,cache:'no-store'}));
      }
    }finally{
      active.delete(controller);options.signal?.removeEventListener('abort',abort);
      if(id&&!finished)fetch('/api/v1/jobs/'+encodeURIComponent(id),{method:'DELETE',keepalive:true}).catch(()=>{});
    }
  }
  root.ChemistryClient={ready,job,parse:(text,format='smiles',options={})=>job('parse',{text,format},options),cancelActive(){active.forEach(c=>c.abort());},get available(){return available;},get capabilities(){return capabilities;}};
})(typeof window!=='undefined'?window:globalThis);
