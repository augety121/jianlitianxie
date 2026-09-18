/** Notification only: an aborted wait never consumes a queued command. */
export class ChangeSignal {
  #revision = 0;
  #waiters = new Set();
  get revision() { return this.#revision; }
  get waiting() { return this.#waiters.size; }
  notify() {
    this.#revision++;
    for (const finish of [...this.#waiters]) finish();
    return this.#revision;
  }
  wait(after, {timeout = 20000, signal} = {}) {
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isFinite(timeout) || timeout < 0 || timeout > 20000) {
      return Promise.reject(Error('无效的通知版本或等待时间'));
    }
    if (signal?.aborted) return Promise.reject(signal.reason || Error('等待已取消'));
    if (after !== this.#revision || timeout === 0) return Promise.resolve(this.#revision);
    if (this.#waiters.size >= 64) return Promise.reject(Error('等待连接过多，请关闭重复面板'));
    return new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer);
        this.#waiters.delete(finish);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(this.#revision);
      };
      const abort = () => finish(signal.reason || Error('等待已取消'));
      const timer = setTimeout(finish, timeout);
      this.#waiters.add(finish);
      signal?.addEventListener('abort', abort, {once: true});
    });
  }
  close() { for (const finish of [...this.#waiters]) finish(Error('连接已关闭')); }
}
