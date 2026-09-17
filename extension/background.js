chrome.action.onClicked.addListener(async tab=>{
  if(!tab.id || !/^https?:/.test(tab.url||'')) return;
  await chrome.tabs.create({url:chrome.runtime.getURL('panel.html')+'?tab='+tab.id});
});
