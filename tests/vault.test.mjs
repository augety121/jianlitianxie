import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault, openVault, sealProfile, validateEnvelope, ITERATIONS} from '../extension/core/vault.mjs';
import {normalizeProfile, parseImport} from '../extension/core/profile.mjs';
import {VaultSession, VAULT_KEY, PREVIOUS_KEY, IDLE_MS} from '../extension/core/vault-session.mjs';
const password = 'synthetic testing passphrase';
const profile = {facts: [{id: 'name', label: '姓名', value: '测试甲', section: '基本信息', source: '虚构测试', confirmed: true}]};
function memory() {
  const data = {}; const writes = [];
  return {data, writes, async get(k) {return {[k]: structuredClone(data[k])};},
    async set(values) {writes.push(structuredClone(values)); Object.assign(data, structuredClone(values));}};
}
test('AES-GCM round trip, non-extractable key and ciphertext-only envelope', async () => {
  const vault = await createVault(password, profile);
  assert.equal(vault.key.extractable, false);
  assert.equal(vault.envelope.kdf.iterations, ITERATIONS);
  assert(!JSON.stringify(vault.envelope).includes('测试甲'));
  assert.deepEqual((await openVault(vault.envelope, password)).profile.facts, normalizeProfile(profile).facts);
});
test('fresh salt and IV for create, fresh IV on each save', async () => {
  const one = await createVault(password, profile), two = await createVault(password, profile);
  assert.notEqual(one.envelope.kdf.salt, two.envelope.kdf.salt);
  const changed = await sealProfile(profile, one.key, one.envelope.kdf.salt);
  assert.notEqual(changed.cipher.iv, one.envelope.cipher.iv);
  assert.notEqual(changed.ciphertext, one.envelope.ciphertext);
});
test('wrong password, modified ciphertext and tampered parameters are rejected', async () => {
  const {envelope} = await createVault(password, profile);
  await assert.rejects(openVault(envelope, 'this is the wrong password'), /口令错误/);
  const bad = structuredClone(envelope);
  bad.ciphertext = (bad.ciphertext[0] === 'A' ? 'B' : 'A') + bad.ciphertext.slice(1);
  await assert.rejects(openVault(bad, password), /备份损坏/);
  assert.throws(() => validateEnvelope({...envelope, version: 2}), /版本/);
  assert.throws(() => validateEnvelope({...envelope, kdf: {...envelope.kdf, iterations: 999999999}}), /算法/);
  assert.throws(() => validateEnvelope({...envelope, cipher: {...envelope.cipher, iv: ''}}), /长度/);
});
test('short passwords, unknown versions, prototype fields, duplicate IDs, oversize values rejected', async () => {
  await assert.rejects(createVault('short'), /至少12/);
  assert.throws(() => normalizeProfile({...profile, schemaVersion: 2}), /版本/);
  assert.throws(() => normalizeProfile(JSON.parse('{"facts":[],"__proto__":{"polluted":true}}')), /格式/);
  assert.equal({}.polluted, undefined);
  assert.throws(() => normalizeProfile({facts: [profile.facts[0], profile.facts[0]]}), /重复/);
  assert.throws(() => normalizeProfile({facts: [{...profile.facts[0], value: 'x'.repeat(10001)}]}), /长度/);
});
test('imports are unconfirmed drafts with new IDs and origin scope validation', () => {
  const facts = parseImport('姓名：测试乙\n邮箱：candidate@example.invalid');
  assert.equal(facts.length, 2); assert(facts.every(f => !f.confirmed));
  assert.notEqual(parseImport(JSON.stringify(profile))[0].id, 'name');
  assert.throws(() => parseImport('bad line'), /第1行/);
  assert.throws(() => normalizeProfile({facts: [{...profile.facts[0], origin: 'https://example.invalid/path'}]}), /网站范围/);
  assert.throws(() => normalizeProfile({facts: [{...profile.facts[0], origin: 'file:///'}]}), /网站范围/);
});
test('session saves atomically, does not store plaintext, refuses stale revisions', async () => {
  const storage = memory(), session = new VaultSession(storage);
  await session.create(password); const updated = await session.save(profile.facts, 0);
  assert.equal(updated.revision, 1);
  assert(!JSON.stringify(storage.data).includes('测试甲'));
  assert(storage.data[PREVIOUS_KEY]);
  await assert.rejects(session.save([], 0), /其他窗口/);
  assert.equal(session.read().facts.length, 1);
  session.lock(); assert.throws(() => session.read(), /锁定/);
  assert.equal((await session.unlock(password)).facts[0].value, '测试甲');
});
test('restore failure never overwrites current data; replacement needs explicit consent', async () => {
  const storage = memory(), session = new VaultSession(storage);
  await session.create(password); await session.save(profile.facts, 0);
  const backup = await session.backup(), before = JSON.stringify(storage.data);
  await assert.rejects(session.restore(backup, password), /明确确认/);
  await assert.rejects(session.restore(backup, 'another wrong password', true), /口令错误/);
  assert.equal(JSON.stringify(storage.data), before);
  session.lock(); await session.restore(backup, password, true);
  assert.equal(session.read().facts[0].value, '测试甲');
});
test('idle expiry and service-worker restart do not restore keys', async () => {
  let now = 1000; const storage = memory(), session = new VaultSession(storage, () => now);
  await session.create(password); now += IDLE_MS;
  assert.equal(session.unlocked, false); assert.throws(() => session.read(), /锁定/);
  assert.equal((await new VaultSession(storage).status()).unlocked, false);
});
test('locking during asynchronous decrypt cannot reopen the vault', async () => {
  const storage = memory(), session = new VaultSession(storage);
  await session.create(password); session.lock();
  const opening = session.unlock(password);
  await new Promise(resolve => setTimeout(resolve, 10)); session.lock();
  await assert.rejects(opening, /取消|锁定/); assert.equal(session.unlocked, false);
});
test('password rotation clears previous envelope and rejects old password', async () => {
  const storage = memory(), session = new VaultSession(storage);
  await session.create(password); await session.save(profile.facts, 0);
  await session.changePassword('new synthetic testing passphrase');
  assert.equal(storage.data[PREVIOUS_KEY], null);
  await assert.rejects(openVault(storage.data[VAULT_KEY], password), /口令错误/);
  assert.equal((await openVault(storage.data[VAULT_KEY], 'new synthetic testing passphrase')).profile.facts.length, 1);
});

test('an immediate lock also cancels queued unlocks before they start', async () => {
  const storage = memory(), session = new VaultSession(storage);
  await session.create(password); session.lock();
  const opening = session.unlock(password); session.lock();
  await assert.rejects(opening, /取消|锁定/); assert.equal(session.unlocked, false);
});
