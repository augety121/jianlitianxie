/* Shared classic script: no network or Chrome calls until a UI starts the loop. */
(() => {
  if (globalThis.__resumePollLoop) return;
  globalThis.__resumePollLoop = ({poll, wait, handle, onError, onState = () => {}, stopWait = () => {}}) => {
    let running = false, generation = 0, pending = null, sleeper = null;
    const delay = ms => new Promise(resolve => {
      const done = () => { clearTimeout(timer); if (sleeper === done) sleeper = null; resolve(); };
      const timer = setTimeout(done, ms); sleeper = done;
    });
    async function cycle() {
      if (pending || !running) return;
      const token = generation;
      const task = (async () => {
        let failures = 0, revision = null;
        while (running && token === generation) {
          try {
            // A wakeup contains no commands. Only poll consumes commands, after checking activity.
            if (revision !== null) await wait(revision);
            if (!running || token !== generation) break;
            const response = await poll(() => running && token === generation);
            // A stop may race destructive polling. Drop that response rather than writing after stop; never replay.
            if (!running || token !== generation) break;
            await handle(response);
            revision = Number.isSafeInteger(response.revision) ? response.revision : null;
            failures = 0; onState('connected');
            if (revision === null) await delay(1500); // Old bridge compatibility, no tight polling.
          } catch (error) {
            if (!running || token !== generation) break;
            const retryMs = Math.min(15000, 1000 * 2 ** Math.min(failures++, 4));
            onError(error, retryMs); onState('retrying');
            await delay(retryMs);
            revision = null;
          }
        }
      })();
      pending = task;
      try { await task; } finally { pending = null; if (running) void cycle(); }
    }
    return {
      start() { if (running) return; running = true; generation++; void cycle(); },
      stop() { if (!running) return; running = false; generation++; sleeper?.(); stopWait(); },
      get running() { return running; }
    };
  };
})();
