import {createVault, openVault, sealProfile, validateEnvelope} from './vault.mjs';
import {normalizeProfile} from './profile.mjs';
export const VAULT_KEY = 'resumeVaultV1';
export const PREVIOUS_KEY = 'resumeVaultPreviousV1';
export const IDLE_MS = 15 * 60 * 1000;
/** The worker can disappear sooner than IDLE_MS; keys intentionally are not restored. */
export class VaultSession {
  #storage; #clock; #key = null; #profile = null; #envelope = null;
  #deadline = 0; #epoch = 0; #tail = Promise.resolve();
  constructor(storage, clock = Date.now) { this.#storage = storage; this.#clock = clock; }
  lock() { this.#epoch++; this.#key = null; this.#profile = null; this.#envelope = null; this.#deadline = 0; }
  get unlocked() {
    if (this.#key && this.#clock() >= this.#deadline) this.lock();
    return Boolean(this.#key);
  }
  get expiresAt() { return this.unlocked ? this.#deadline : 0; }
  #touch() { if (!this.unlocked) throw Error('资料库已锁定，请重新解锁'); this.#deadline = this.#clock() + IDLE_MS; }
  #assertEpoch(epoch) { if (epoch !== this.#epoch) throw Error('操作已取消或资料库已锁定'); }
  #queue(fn) { const run = this.#tail.then(fn); this.#tail = run.catch(() => {}); return run; }
  async status() {
    const saved = await this.#storage.get(VAULT_KEY);
    return {exists: Boolean(saved[VAULT_KEY]), unlocked: this.unlocked, expiresAt: this.expiresAt};
  }
  read() { this.#touch(); return structuredClone(this.#profile); }
  async backup() {
    const value = (await this.#storage.get(VAULT_KEY))[VAULT_KEY];
    if (!value) throw Error('尚未创建资料库');
    return validateEnvelope(value);
  }
  unlock(password) {
    const epoch = this.#epoch;
    return this.#queue(async () => {
      this.#assertEpoch(epoch);
      const saved = (await this.#storage.get(VAULT_KEY))[VAULT_KEY];
      if (!saved) throw Error('尚未创建资料库');
      const opened = await openVault(saved, password);
      this.#assertEpoch(epoch);
      this.#install(opened);
      return this.read();
    });
  }
  #install({key, profile, envelope}) {
    this.#key = key; this.#profile = profile; this.#envelope = envelope;
    this.#deadline = this.#clock() + IDLE_MS;
  }
  create(password) {
    const epoch = this.#epoch;
    return this.#queue(async () => {
      this.#assertEpoch(epoch);
      if ((await this.#storage.get(VAULT_KEY))[VAULT_KEY]) throw Error('已有资料库，请解锁而非覆盖');
      const opened = await createVault(password);
      this.#assertEpoch(epoch);
      await this.#storage.set({[VAULT_KEY]: opened.envelope});
      this.#assertEpoch(epoch);
      this.#install(opened); return this.read();
    });
  }
  save(facts, expectedRevision) {
    const epoch = this.#epoch;
    return this.#queue(async () => {
      this.#assertEpoch(epoch); this.#touch();
      if (expectedRevision !== this.#profile.revision) throw Error('资料已在其他窗口更新，请重新载入后修改');
      const profile = normalizeProfile({schemaVersion: 1, revision: expectedRevision + 1, facts});
      const envelope = await sealProfile(profile, this.#key, this.#envelope.kdf.salt);
      this.#assertEpoch(epoch); this.#touch();
      await this.#storage.set({[PREVIOUS_KEY]: this.#envelope, [VAULT_KEY]: envelope});
      this.#assertEpoch(epoch);
      this.#profile = profile; this.#envelope = envelope;
      return this.read();
    });
  }
  restore(input, password, replace = false) {
    const epoch = this.#epoch;
    return this.#queue(async () => {
      this.#assertEpoch(epoch);
      const previous = (await this.#storage.get(VAULT_KEY))[VAULT_KEY];
      if (previous && replace !== true) throw Error('恢复会替换当前资料，须明确确认');
      const opened = await openVault(input, password);
      this.#assertEpoch(epoch);
      await this.#storage.set({[PREVIOUS_KEY]: previous || null, [VAULT_KEY]: opened.envelope});
      this.#assertEpoch(epoch);
      this.#install(opened); return this.read();
    });
  }
  changePassword(password) {
    const epoch = this.#epoch;
    return this.#queue(async () => {
      this.#assertEpoch(epoch); this.#touch();
      const opened = await createVault(password, this.#profile);
      this.#assertEpoch(epoch); this.#touch();
      // Do not retain a previous backup encrypted with the old password.
      await this.#storage.set({[VAULT_KEY]: opened.envelope, [PREVIOUS_KEY]: null});
      this.#assertEpoch(epoch); this.#install(opened);
      return {changed: true};
    });
  }
}
