/* Early, content-free UI errors and old-panel traces. No network or console interception. */
(() => {
  const send = async payload => {
    // Optional diagnostics must not leave the old panel waiting indefinitely.
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(chrome.runtime.sendMessage(payload)).then(r => r?.data),
        new Promise(resolve => { timer=setTimeout(()=>resolve(null),250); })
      ]);
    } catch { return null; } finally { clearTimeout(timer); }
  };
  const statusCodes={ready:'OK',verified:'OK',missing:'MATCH_UNRESOLVED',manual:'CONTROL_MANUAL',preserve:'EXISTING_VALUE',invalid:'INPUT_REJECTED',stale:'TARGET_CHANGED',cancelled:'CANCELLED','not-attempted':'RECEIPT_INVALID','needs-user':'RECEIPT_INVALID'};
  globalThis.__resumeDiagnosticClient={
    async start(action){return (await send({type:'diagnostics-panel-start',action}))?.trace||null;},
    async finish(trace,result,error=false){
      if(!trace)return;
      const rows=Array.isArray(result?.results)?result.results:Array.isArray(result?.entries)?result.entries:[];
      const fields=rows.map((r,i)=>({ordinal:i+1,state:r.status,code:statusCodes[r.status]||'INTERNAL'}));
      const partial=fields.some(e=>!['ready','verified','preserve'].includes(e.state));
      return send({type:'diagnostics-panel-finish',trace,summary:{count:rows.length,state:error?'error':partial?'partial':'ok',code:error?'INTERNAL':partial?'PARTIAL':'OK'},fields});
    }
  };
  window.addEventListener('error',()=>{void send({type:'diagnostics-ui-error',code:'UI_SCRIPT'});});
  window.addEventListener('unhandledrejection',()=>{void send({type:'diagnostics-ui-error',code:'UI_REJECTION'});});
})();
