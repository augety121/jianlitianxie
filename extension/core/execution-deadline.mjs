/** Best-effort page cancellation at a server-approved deadline; never retry a write. */
export async function withDeadline(plan, execute, cancel, clock = Date.now) {
  const remaining = plan?.expiresAt - clock();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 300000) {
    throw Error('填写授权已到期或期限无效，请重新扫描');
  }
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    Promise.resolve().then(cancel).catch(() => {});
  }, remaining);
  try {
    const report = await execute();
    if (expired || clock() >= plan.expiresAt) throw Error('填写授权已到期，结果需要核对；未自动重试');
    return report;
  } finally { clearTimeout(timer); }
}
