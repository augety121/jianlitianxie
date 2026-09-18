/** Pair only with the fixed local bridge. Never persist a token before verification. */
export async function verifyBridgePairing(token, fetcher = fetch) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw Error('配对码必须是本机 bridge-token.txt 中的完整64位代码');
  let response;
  try {
    response = await fetcher('http://127.0.0.1:19327/status', {
      headers: {Authorization: 'Bearer ' + token}, redirect: 'error',
      cache: 'no-store', signal: AbortSignal.timeout(8000)
    });
  } catch { throw Error('未连接本机桥接，请先启动或重连 resume_fill；配对码未保存'); }
  if (!response.ok) throw Error('本机桥接拒绝配对；请核对配对码，旧设置未修改');
  const status = await response.json().catch(() => null);
  if (status?.version !== '0.4.3' || status.transport !== 2) throw Error('请先更新并重启 0.4.3 桥接，再进行配对；旧设置未修改');
  return {connected: true, version: status.version};
}
