// No profile access: acknowledge only the exact worker-created UI request.
export async function acknowledgeUi(){
 const requestId=new URL(location.href).searchParams.get('uiRequest');if(!requestId)return;
 const result=await chrome.runtime.sendMessage({type:'local-ui-ready',requestId});
 // A manager may be reloaded after its one-shot acknowledgement or worker restart.
 // Its ordinary read-only entry remains usable; write tickets are checked separately.
 if(result?.error&&location.pathname!=='/local.html'){
  const status=document.getElementById('notice')||document.getElementById('state')||document.body;
  status.textContent='此核对界面已失效，请从申请页重新打开。';
  for(const button of document.querySelectorAll('button'))button.disabled=true;
  throw Error('ui-request-expired');
 }
}
