/** Distinguish bootstrap from navigation without adding broad tabs permission.
 * onUpdated may omit URLs even for an extension-owned popup. Its first load only
 * leaves the ticket pending; access requires the exact URL/tab/document below.
 */
export function observeReviewWindow(ticket, change = {}, tab = {}) {
  if (change.removed === true) return true;
  const urls = [change.url, tab.pendingUrl, tab.url].filter(v => typeof v === 'string' && v);
  if (urls.some(url => url !== ticket.reviewUrl)) return true;
  if (change.status === 'loading') {
    if (ticket.initialLoading || ticket.pickerDocument || ticket.initialComplete) return true;
    ticket.initialLoading = true;
  }
  if (change.status === 'complete') ticket.initialComplete = true;
  return false;
}

export function bindReviewDocument(ticket, sender, now = Date.now()) {
  if (!ticket || ticket.claimed || now >= ticket.expires ||
      !Number.isSafeInteger(ticket.pickerTab) || ticket.pickerTab !== sender.tab?.id ||
      sender.url !== ticket.reviewUrl || typeof sender.documentId !== 'string' || !sender.documentId ||
      sender.documentLifecycle && sender.documentLifecycle !== 'active') {
    throw Error('经历窗口尚未就绪或授权已失效');
  }
  if (ticket.pickerDocument && ticket.pickerDocument !== sender.documentId) throw Error('经历窗口已改变');
  ticket.pickerDocument = sender.documentId;
}
